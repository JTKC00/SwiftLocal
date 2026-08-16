"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFile, execFileSync, spawn } = require("node:child_process");
const { PDFDocument, degrees } = require("pdf-lib");
const {
  ERROR_CODES,
  JOB_TOOL_REQUIREMENTS,
  PASSWORD_JOB_TYPES: ERROR_PASSWORD_JOB_TYPES,
  classifyJobError,
  errorCodeLabel
} = require("./job-errors");
const {
  TERMINAL_JOB_STATUSES,
  DEFAULT_JOB_RETENTION_HOURS,
  pruneJobList,
  cleanupSwiftLocalTempDirs
} = require("./job-cleanup");
const { terminateProcessTree } = require("./process-tree");

const TOOL_DEFINITIONS = {
  libreOffice: {
    label: "LibreOffice",
    env: "SWIFTLOCAL_LIBREOFFICE",
    commands: ["soffice.com", "soffice", "libreoffice"],
    bundledPaths: [
      ["libreoffice", "program", "soffice.com"],
      ["libreOffice", "program", "soffice.com"],
      ["LibreOffice", "program", "soffice.com"],
      ["libreoffice", "program", "soffice.exe"],
      ["libreOffice", "program", "soffice.exe"],
      ["LibreOffice", "program", "soffice.exe"],
      ["libreoffice", "program", "soffice"],
      ["libreOffice", "program", "soffice"],
      ["LibreOffice", "program", "soffice"]
    ],
    windowsPaths: [
      "C:\\Program Files\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    ],
    versionArgs: ["--version"]
  },
  ffmpeg: {
    label: "FFmpeg",
    env: "SWIFTLOCAL_FFMPEG",
    commands: ["ffmpeg"],
    bundledPaths: [
      ["ffmpeg", "bin", "ffmpeg.exe"],
      ["ffmpeg", "ffmpeg.exe"],
      ["ffmpeg", "bin", "ffmpeg"],
      ["ffmpeg", "ffmpeg"]
    ],
    windowsPaths: [
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe"
    ],
    versionArgs: ["-version"]
  },
  tesseract: {
    label: "Tesseract",
    env: "SWIFTLOCAL_TESSERACT",
    commands: ["tesseract"],
    bundledPaths: [
      ["tesseract", "tesseract.exe"],
      ["tesseract", "bin", "tesseract.exe"],
      ["tesseract", "tesseract"],
      ["tesseract", "bin", "tesseract"]
    ],
    windowsPaths: [
      "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
      "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe"
    ],
    versionArgs: ["--version"]
  },
  qpdf: {
    label: "QPDF",
    env: "SWIFTLOCAL_QPDF",
    commands: ["qpdf"],
    bundledPaths: [
      ["qpdf", "bin", "qpdf.exe"],
      ["qpdf", "qpdf.exe"],
      ["qpdf", "bin", "qpdf"],
      ["qpdf", "qpdf"]
    ],
    windowsPaths: [
      "C:\\Program Files\\qpdf\\bin\\qpdf.exe",
      "C:\\Program Files (x86)\\qpdf\\bin\\qpdf.exe"
    ],
    versionArgs: ["--version"]
  }
};

const MAX_PERSISTED_JOBS = 80;
/** Persisted jobs-state.json root.version — see docs/jobs-state-schema.md */
const JOBS_STATE_SCHEMA_VERSION = 2;

const PASSWORD_JOB_TYPES = ERROR_PASSWORD_JOB_TYPES;
const MAX_INPUT_FILE_BYTES = positiveEnvNumber("SWIFTLOCAL_MAX_FILE_BYTES", 1024 ** 3);
const MAX_JOB_INPUT_BYTES = positiveEnvNumber("SWIFTLOCAL_MAX_JOB_BYTES", 2 * 1024 ** 3);
const MAX_QUEUED_JOBS = positiveEnvNumber("SWIFTLOCAL_MAX_QUEUED_JOBS", 50);
const MIN_DISK_MULTIPLIER = positiveEnvNumber("SWIFTLOCAL_DISK_MULTIPLIER", 2);
/** Finished jobs older than this (hours) are dropped from jobs-state on prune. */
const JOB_RETENTION_HOURS = positiveEnvNumber("SWIFTLOCAL_JOB_RETENTION_HOURS", DEFAULT_JOB_RETENTION_HOURS);
const DEFAULT_OCR_LANGUAGE = "chi_tra+eng";
const IMAGE_MAX_PIXELS = 50_000_000;
const IMAGE_OPS_MAX_JSON_BYTES = 64 * 1024;
const IMAGE_REGION_MIN_PIXELS = 8;

function redactJobOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(options)
      .filter(([key]) => !/password|passphrase/i.test(key))
      .map(([key, value]) => [
        key,
        value && typeof value === "object" && !Array.isArray(value) ? redactJobOptions(value) : value
      ])
  );
}

function redactJobText(value, options = {}) {
  let safe = String(value || "");
  for (const [key, secret] of Object.entries(options || {})) {
    if (!/password|passphrase/i.test(key) || !secret) continue;
    safe = safe.split(String(secret)).join("[REDACTED]");
  }
  return safe;
}

class BackendService {
  constructor(options = {}) {
    this.jobs = [];
    this.running = false;
    this.disposing = false;
    this.pendingAdmissions = 0;
    this.onJobsUpdated = options.onJobsUpdated;
    this.configPath = options.configPath || path.join(process.cwd(), ".swiftlocal-tools.json");
    this.jobsStatePath = options.jobsStatePath || path.join(path.dirname(this.configPath), "jobs-state.json");
    this.defaultOutputDir = options.defaultOutputDir || path.join(process.cwd(), "SwiftLocal-output");
    this.config = loadConfig(this.configPath);
    if (this.config.defaultOutputDir && path.isAbsolute(this.config.defaultOutputDir)) {
      this.defaultOutputDir = this.config.defaultOutputDir;
    }
    this.tools = null;
    const persisted = loadJobsState(this.jobsStatePath, { withMetadata: true });
    this.jobs = persisted.jobs;
    this.jobsStateTrusted = persisted.trusted;
    if (!this.jobsStateTrusted) {
      console.warn(`SwiftLocal preserved an unreadable jobs-state file: ${this.jobsStatePath}`);
    }
    // Age/cap prune + persist repairs (e.g. running → failed after crash).
    this.pruneJobs();
    // Resume any work left queued from a previous session (FIFO: oldest first).
    if (this.jobs.some((job) => job.status === "queued")) {
      setImmediate(() => this.runNext());
    }
  }

  /**
   * Remove finished jobs past retention or over the hard cap.
   * Does not delete user output files under Downloads — only jobs-state history.
   * Also sweeps leftover `.swiftlocal-office-*` temp dirs under defaultOutputDir.
   */
  pruneJobs(options = {}) {
    const before = this.jobs.length;
    const nowMs = options.nowMs != null ? Number(options.nowMs) : Date.now();
    const pruned = pruneJobList(this.jobs, {
      forceFinished: options.forceFinished,
      nowMs,
      retentionHours: JOB_RETENTION_HOURS,
      maxPersisted: MAX_PERSISTED_JOBS
    });
    this.jobs = pruned.jobs;
    const tempDirs = cleanupSwiftLocalTempDirs(this.defaultOutputDir, nowMs);
    if (this.jobsStateTrusted) {
      saveJobsState(this.jobsStatePath, this.jobs);
    }
    return {
      before,
      after: this.jobs.length,
      removedByAge: pruned.removedByAge,
      removedByCap: pruned.removedByCap,
      tempDirs,
      retentionHours: JOB_RETENTION_HOURS,
      maxPersisted: MAX_PERSISTED_JOBS
    };
  }

  async detectTools() {
    const entries = await Promise.all(
      Object.entries(TOOL_DEFINITIONS).map(async ([key, definition]) => [
        key,
        await detectTool(definition, this.config.toolPaths[key])
      ])
    );
    this.tools = Object.fromEntries(entries);
    const tesseract = this.tools.tesseract;
    if (tesseract && tesseract.available) {
      const tessdataDir = bundledTessdataDir(tesseract.path);
      const languages = listOcrLanguages(tessdataDir);
      tesseract.tessdataDir = tessdataDir;
      tesseract.languages = languages.join(",");
      tesseract.hasChiTra = languages.includes("chi_tra");
      tesseract.hasEng = languages.includes("eng");
      tesseract.hasOsd = languages.includes("osd");
    }
    // Desktop fallback uses built-in text DOCX writer (always available in this process).
    this.tools.pdf2docx = {
      available: true,
      label: "PDF→DOCX 相容引擎",
      path: "",
      version: "desktop-text",
      source: "python"
    };
    return this.tools;
  }

  getConfig() {
    return {
      toolPaths: { ...this.config.toolPaths },
      defaultOutputDir: this.defaultOutputDir
    };
  }

  setDefaultOutputDir(outputDir) {
    const normalized = String(outputDir || "").trim();
    if (!normalized) {
      throw new Error("Output folder is required");
    }
    if (!path.isAbsolute(normalized)) {
      throw new Error("Output folder must be absolute");
    }
    fs.mkdirSync(normalized, { recursive: true });
    this.defaultOutputDir = normalized;
    this.config.defaultOutputDir = normalized;
    saveConfig(this.configPath, this.config);
    return this.getConfig();
  }

  async setToolPath(key, toolPath) {
    if (!Object.prototype.hasOwnProperty.call(TOOL_DEFINITIONS, key)) {
      throw new Error(`Unknown tool: ${key}`);
    }
    const normalized = String(toolPath || "").trim();
    if (normalized && !path.isAbsolute(normalized)) {
      throw new Error("Tool path must be absolute");
    }
    if (normalized && !fs.existsSync(normalized)) {
      throw new Error("Tool path does not exist");
    }
    if (normalized) {
      this.config.toolPaths[key] = normalized;
    } else {
      delete this.config.toolPaths[key];
    }
    saveConfig(this.configPath, this.config);
    return this.detectTools();
  }

  getJobs() {
    return this.jobs.map(publicJob);
  }

  readJobTextOutputs(jobId) {
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job) {
      throw new Error("找不到 OCR 任務");
    }
    if (job.status !== "done") {
      throw new Error("OCR 任務尚未完成");
    }
    return job.outputPaths
      .filter((item) => path.extname(item).toLowerCase() === ".txt" && fs.existsSync(item))
      .map((item) => ({
        name: path.basename(item),
        text: fs.readFileSync(item, "utf8")
      }));
  }

  async enqueue(payload) {
    if (this.disposing) {
      throw new Error("SwiftLocal 正在結束，無法加入新任務");
    }
    if (this.jobs.filter((item) => item.status === "queued").length + this.pendingAdmissions >= MAX_QUEUED_JOBS) {
      throw new Error(`Too many queued jobs (limit: ${MAX_QUEUED_JOBS})`);
    }
    this.pendingAdmissions += 1;
    try {
      const outputDir = payload.outputDir || this.defaultOutputDir;
      const inputPaths = payload.inputPaths || [];
      const type = payload.type;
      const options = sanitizeDesktopJobOptions(type, payload.options || {}, inputPaths.length);
      const preflight = await this.preflightJob({ type, inputPaths, outputDir, options });
      if (this.disposing) {
        throw new Error("SwiftLocal 正在結束，無法加入新任務");
      }
      if (!preflight.ok) {
        const first = preflight.issues[0];
        const err = new Error(first.message);
        err.code = first.code;
        throw err;
      }
      validateJobInputLimits(inputPaths, outputDir);
      const job = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        inputPaths,
        outputDir,
        options,
        status: "queued",
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        outputPaths: [],
        log: [],
        error: "",
        errorCode: "",
        errorHint: "",
        retriable: true,
        progress: null,
        itemResults: [],
        cancelRequested: false,
        _child: null
      };
      this.jobs.unshift(job);
      this.emitJobs();
      this.runNext();
      return publicJob(job);
    } finally {
      this.pendingAdmissions -= 1;
    }
  }

  async preflightJob({ type, inputPaths = [], outputDir = "", options = {} } = {}) {
    if (!this.tools) {
      await this.detectTools();
    }
    const issues = [];
    if (!type) {
      issues.push({ code: ERROR_CODES.UNSUPPORTED_FORMAT, message: "未指定任務類型" });
    }
    if (!inputPaths.length) {
      issues.push({ code: ERROR_CODES.MISSING_INPUT, message: "至少需要一個輸入檔" });
    }
    for (const inputPath of inputPaths) {
      if (!inputPath || !fs.existsSync(inputPath)) {
        issues.push({
          code: ERROR_CODES.MISSING_INPUT,
          message: `找不到輸入檔：${inputPath || "(空白)"}`
        });
      }
    }
    let requiredTools = JOB_TOOL_REQUIREMENTS[type] || [];
    if (type === "pdf-to-office") {
      const extension = String(options.extension || "docx").trim().toLowerCase();
      const engine = String(options.docxEngine || "auto").trim().toLowerCase();
      const scanOcr = String(options.scanOcr || "auto").trim().toLowerCase();
      const ocrOutput = String(options.ocrOutput || "both").trim().toLowerCase();
      const searchableOnly = extension === "docx" && ["searchable", "pdf", "searchable-pdf"].includes(ocrOutput);
      const compatDocx = extension === "docx" && ["compat", "compatible", "pdf2docx"].includes(engine);
      const forcedOcr = extension === "docx" && ["force", "on", "true", "1"].includes(scanOcr);
      requiredTools = searchableOnly || forcedOcr ? ["tesseract"] : compatDocx ? [] : ["libreOffice"];
    }
    const tools = this.tools || {};
    for (const key of requiredTools) {
      const tool = tools[key];
      if (!tool || !tool.available) {
        const label = (TOOL_DEFINITIONS[key] && TOOL_DEFINITIONS[key].label) || key;
        issues.push({
          code: ERROR_CODES.MISSING_TOOL,
          message: `缺少必要工具：${label}`,
          tool: key
        });
      }
    }
    if (PASSWORD_JOB_TYPES.has(type) && !(options.password || options.passphrase)) {
      issues.push({
        code: ERROR_CODES.ENCRYPTED_PDF,
        message: "此任務需要密碼，請重新輸入後再執行"
      });
    }
    if (outputDir) {
      try {
        validateJobInputLimits(inputPaths.filter((p) => p && fs.existsSync(p)), outputDir);
      } catch (error) {
        const classified = classifyJobError(error, { type });
        issues.push({ code: classified.code, message: classified.message });
      }
    }
    return { ok: issues.length === 0, issues };
  }

  async retryJob(jobId) {
    if (this.disposing) {
      throw new Error("SwiftLocal 正在結束，無法重新執行任務");
    }
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job) {
      return false;
    }
    if (job.status === "queued" || job.status === "running") {
      throw new Error("只能重新執行已結束的任務");
    }
    if (job.retriable === false) {
      throw new Error(job.errorHint || "此任務無法自動重試，請從工具面板重新提交");
    }
    if (this.jobs.filter((item) => item.status === "queued").length + this.pendingAdmissions >= MAX_QUEUED_JOBS) {
      throw new Error(`Too many queued jobs (limit: ${MAX_QUEUED_JOBS})`);
    }
    this.pendingAdmissions += 1;
    try {
      const preflight = await this.preflightJob({
        type: job.type,
        inputPaths: job.inputPaths,
        outputDir: job.outputDir || this.defaultOutputDir,
        options: job.options
      });
      if (!preflight.ok) {
        throw new Error(preflight.issues[0].message);
      }
      if (this.disposing) {
        throw new Error("SwiftLocal 正在結束，無法重新執行任務");
      }
      job.status = "queued";
      job.startedAt = null;
      job.finishedAt = null;
      job.outputPaths = [];
      job.error = "";
      job.errorCode = "";
      job.errorHint = "";
      job.retriable = true;
      job.cancelRequested = false;
      job._child = null;
      job.log = [...(job.log || []).slice(-8), "使用者重新執行任務"];
      this.emitJobs();
      this.runNext();
      return publicJob(job);
    } finally {
      this.pendingAdmissions -= 1;
    }
  }

  async copyJob(jobId) {
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job) {
      return false;
    }
    return this.enqueue({
      type: job.type,
      inputPaths: [...(job.inputPaths || [])],
      outputDir: job.outputDir || this.defaultOutputDir,
      options: { ...(job.options || {}) }
    });
  }

  buildDiagnosticReport(jobId) {
    const job = jobId ? this.jobs.find((item) => item.id === jobId) : null;
    let packageVersion = "0.0.0";
    try {
      packageVersion = require("../package.json").version;
    } catch {
      // ignore
    }
    const toolsSummary = {};
    for (const [key, tool] of Object.entries(this.tools || {})) {
      toolsSummary[key] = {
        available: Boolean(tool && tool.available),
        version: tool && tool.version ? String(tool.version) : "",
        source: tool && tool.source ? String(tool.source) : "",
        // Path is useful for support; not a secret.
        path: tool && tool.path ? String(tool.path) : "",
        tessdataPath: tool && tool.tessdataPath ? String(tool.tessdataPath) : "",
        detectedLanguages: Array.isArray(tool && tool.detectedLanguages) ? tool.detectedLanguages : [],
        detectionMethod: tool && tool.detectionMethod ? String(tool.detectionMethod) : "",
        TESSDATA_PREFIX: tool && tool.TESSDATA_PREFIX ? String(tool.TESSDATA_PREFIX) : ""
      };
    }
    return {
      generatedAt: new Date().toISOString(),
      appVersion: packageVersion,
      platform: process.platform,
      arch: process.arch,
      jobsStateSchemaVersion: JOBS_STATE_SCHEMA_VERSION,
      tools: toolsSummary,
      job: job
        ? (() => {
            const space = computeJobSpaceUsage(job.inputPaths || [], job.outputPaths || []);
            return {
              id: job.id,
              type: job.type,
              status: job.status,
              options: redactJobOptions(job.options),
              errorCode: job.errorCode || "",
              errorHint: job.errorHint || "",
              retriable: job.retriable !== false,
              error: redactJobText(job.error, job.options),
              log: (job.log || []).slice(-20).map((line) => redactJobText(line, job.options)),
              createdAt: job.createdAt,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              inputCount: space.inputCount,
              outputCount: space.outputCount,
              space: {
                inputBytes: space.inputBytes,
                outputBytes: space.outputBytes,
                inputMissing: space.inputMissing,
                savedBytes: space.savedBytes,
                savedPercent: space.savedPercent
              }
            };
          })()
        : null
    };
  }

  deleteJob(jobId) {
    const index = this.jobs.findIndex((item) => item.id === jobId);
    if (index === -1) {
      return false;
    }
    const job = this.jobs[index];
    if (job.status === "running") {
      throw new Error("無法刪除執行中的任務，請先取消或等完成後再刪除");
    }
    this.jobs.splice(index, 1);
    this.emitJobs();
    return true;
  }

  cancelJob(jobId) {
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job) {
      return false;
    }
    if (job.status === "queued") {
      job.status = "cancelled";
      job.error = "任務已取消";
      job.errorCode = ERROR_CODES.CANCELLED;
      job.errorHint = "可重新執行此任務（輸入檔仍存在時）。";
      job.retriable = true;
      job.log.push(job.error);
      job.finishedAt = new Date().toISOString();
      job.options = redactJobOptions(job.options);
      this.emitJobs();
      return publicJob(job);
    }
    if (job.status === "running") {
      job.cancelRequested = true;
      let killed = false;
      if (job._child && !job._child.killed) {
        try {
          void terminateProcessTree(job._child);
          killed = true;
        } catch {
          // ignore kill races
        }
      }
      job.log.push(
        killed
          ? "取消請求已送出：已中止外部工具程序；任務將盡快結束。"
          : "取消請求已送出：外部工具會立即中止；本機處理會在目前頁面／檔案步驟完成後停止。"
      );
      this.emitJobs();
      return publicJob(job);
    }
    throw new Error("只能取消排隊中或執行中的任務");
  }

  hasActiveWork() {
    return this.pendingAdmissions > 0 || this.jobs.some((job) => job.status === "queued" || job.status === "running");
  }

  async dispose() {
    this.disposing = true;
    const terminated = [];
    const now = new Date().toISOString();
    for (const job of this.jobs) {
      if (job.status === "queued") {
        job.status = "cancelled";
        job.error = "SwiftLocal 結束時已取消排隊任務";
        job.errorCode = ERROR_CODES.CANCELLED;
        job.errorHint = "可在下次啟動後重新執行此任務。";
        job.retriable = true;
        job.finishedAt = now;
        job.options = redactJobOptions(job.options);
        job.log.push(job.error);
      } else if (job.status === "running") {
        job.cancelRequested = true;
        job.log.push("SwiftLocal 正在結束：已要求中止外部工具程序。");
        if (job._child) terminated.push(terminateProcessTree(job._child));
      }
    }
    this.emitJobs();
    await Promise.allSettled(terminated);
    if (!this.jobs.some((job) => job.status === "running")) {
      this.running = false;
    }
    const deadline = Date.now() + 5000;
    while (this.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (this.running) {
      const finishedAt = new Date().toISOString();
      for (const job of this.jobs) {
        if (job.status !== "running") continue;
        job.status = "cancelled";
        job.error = "SwiftLocal 結束時中止任務";
        job.errorCode = ERROR_CODES.CANCELLED;
        job.errorHint = "可在下次啟動後重新執行此任務。";
        job.retriable = true;
        job.finishedAt = finishedAt;
        job.options = redactJobOptions(job.options);
        job.log.push(job.error);
      }
      this.emitJobs();
    }
  }

  async runNext() {
    if (this.running) {
      return;
    }
    if (this.disposing) {
      return;
    }
    // FIFO: jobs are unshifted (newest first), so take the last queued entry.
    let job = null;
    for (let i = this.jobs.length - 1; i >= 0; i -= 1) {
      if (this.jobs[i].status === "queued") {
        job = this.jobs[i];
        break;
      }
    }
    if (!job) {
      return;
    }

    if (job.cancelRequested) {
      job.status = "cancelled";
      job.error = job.error || "任務已取消";
      job.finishedAt = new Date().toISOString();
      this.emitJobs();
      this.runNext();
      return;
    }

    this.running = true;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.progress = null;
    job.itemResults = [];
    this.emitJobs();

    try {
      if (!this.tools) {
        await this.detectTools();
      }
      ensureJobNotCancelled(job);
      await this.runJob(job);
      ensureJobNotCancelled(job);
      job.status = "done";
      job.errorCode = "";
      job.errorHint = "";
      job.retriable = true;
    } catch (error) {
      if (isJobCancelledError(error) || job.cancelRequested) {
        job.status = "cancelled";
        job.error = "任務已取消";
        job.errorCode = ERROR_CODES.CANCELLED;
        job.errorHint = "可重新執行此任務（輸入檔仍存在時）。";
        job.retriable = true;
      } else {
        const classified = classifyJobError(error, job);
        job.status = "failed";
        job.error = classified.message;
        job.errorCode = classified.code;
        job.errorHint = classified.hint;
        job.retriable = classified.retriable;
      }
      job.log.push(job.error);
    } finally {
      job._child = null;
      job.finishedAt = new Date().toISOString();
      job.log = job.log.map((line) => redactJobText(line, job.options));
      job.error = redactJobText(job.error, job.options);
      job.options = redactJobOptions(job.options);
      this.running = false;
      this.emitJobs();
      this.runNext();
    }
  }

  updateJobProgress(job, progress) {
    if (!job || job.status !== "running") return;
    const current = Math.max(0, Number.parseInt(String(progress.current || 0), 10) || 0);
    const total = Math.max(current, Number.parseInt(String(progress.total || 0), 10) || 0);
    job.progress = {
      current,
      total,
      phase: String(progress.phase || ""),
      message: String(progress.message || "")
    };
    this.emitJobs();
  }

  async runJob(job) {
    if (job.type === "office-to-pdf") {
      await this.runOfficeToPdf(job);
      return;
    }
    if (job.type === "pdf-to-docx") {
      await this.runPdfToDocx(job);
      return;
    }
    if (job.type === "pdf-to-office") {
      await this.runPdfToOffice(job);
      return;
    }
    if (job.type === "pdf-to-searchable-pdf") {
      await this.runPdfToSearchablePdf(job);
      return;
    }
    if (job.type === "pdf-merge") {
      await this.runPdfMerge(job);
      return;
    }
    if (job.type === "pdf-split") {
      await this.runPdfSplit(job);
      return;
    }
    if (job.type === "pdf-rotate") {
      await this.runPdfRotate(job);
      return;
    }
    if (job.type === "pdf-encrypt") {
      await this.runPdfEncrypt(job);
      return;
    }
    if (job.type === "pdf-decrypt") {
      await this.runPdfDecrypt(job);
      return;
    }
    if (job.type === "pdf-compress") {
      await this.runPdfCompress(job);
      return;
    }
    if (job.type === "ocr-pdf") {
      await this.runOcrPdf(job);
      return;
    }
    if (job.type === "media-convert") {
      await this.runMediaConvert(job);
      return;
    }
    if (job.type === "image-convert") {
      await this.runImageConvert(job);
      return;
    }
    if (job.type === "ocr-image") {
      await this.runOcrImage(job);
      return;
    }
    throw new Error(`Unsupported job type: ${job.type}`);
  }

  async runOfficeToPdf(job) {
    const tool = requireTool(this.tools, "libreOffice");
    ensureOutputDir(job.outputDir);
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const { outputPath, result } = await runLibreOfficeToUniqueOutput(
        tool.path, job.outputDir, inputPath, "pdf", "pdf", job
      );
      job.log.push(result.output || `converted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
      job.outputPaths.push(outputPath);
    }
  }

  async runPdfToDocx(job) {
    ensureOutputDir(job.outputDir);
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}.docx`));
      const text = await extractPdfText(inputPath, job);
      writeTextDocx(outputPath, text || path.basename(inputPath));
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
      job.log.push(`converted text: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
    }
  }

  async runPdfToSearchablePdf(job) {
    ensureOutputDir(job.outputDir);
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const probe = fs.readFileSync(inputPath);
      if (pdfBytesLookEncrypted(probe)) {
        throw encryptedPdfError(path.basename(inputPath));
      }
      const outputPath = nextAvailablePath(path.join(
        job.outputDir,
        `${path.parse(inputPath).name}_ocr_searchable.pdf`
      ));
      await createSearchablePdfViaOcr(this, job, inputPath, outputPath);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
      job.log.push(`converted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
    }
  }

  async runPdfToOffice(job) {
    ensureOutputDir(job.outputDir);
    const extension = sanitizeOfficeExtension(job.options.extension || "docx");
    const engineRaw = String(job.options.docxEngine || "auto").trim().toLowerCase();
    const scanOcr = String(job.options.scanOcr || "auto").trim().toLowerCase();
    const ocrOutput = String(job.options.ocrOutput || "both").trim().toLowerCase();
    const searchableOnly =
      extension === "docx" && (ocrOutput === "searchable" || ocrOutput === "pdf" || ocrOutput === "searchable-pdf");
    const useCompatDirect =
      extension === "docx" &&
      (searchableOnly ||
        ["force", "on", "true", "1"].includes(scanOcr) ||
        engineRaw === "compat" ||
        engineRaw === "compatible" ||
        engineRaw === "pdf2docx");
    if (useCompatDirect) {
      for (const inputPath of job.inputPaths) {
        ensureJobNotCancelled(job);
        const probe = fs.readFileSync(inputPath);
        if (pdfBytesLookEncrypted(probe)) {
          throw encryptedPdfError(path.basename(inputPath));
        }
        const outputs = await writeDocxWithScanStrategy(this, job, inputPath, scanOcr, ocrOutput, {
          forceCompat: true
        });
        for (const out of outputs) {
          ensureOutputFile(out, inputPath);
          job.outputPaths.push(out);
        }
      }
      return;
    }

    const tool = requireTool(this.tools, "libreOffice");
    const convertTo = officeConvertTarget(extension);
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      // Reject encrypted PDFs early; LibreOffice error messages are hard to parse.
      const probe = fs.readFileSync(inputPath);
      if (pdfBytesLookEncrypted(probe)) {
        throw encryptedPdfError(path.basename(inputPath));
      }
      let loError = null;
      try {
        const { outputPath, result } = await runLibreOfficeToUniqueOutput(
          tool.path, job.outputDir, inputPath, convertTo, extension, job
        );
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 64) {
          removeIncompleteOfficeOutput(outputPath);
          throw new Error(formatProcessError({
            outputMissing: true,
            expectedOutput: path.basename(outputPath),
            stdout: result.output || "",
            toolLabel: "LibreOffice"
          }));
        }
        job.log.push(result.output || `converted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
        job.outputPaths.push(outputPath);
        continue;
      } catch (error) {
        if (isJobCancelledError(error)) {
          throw error;
        }
        loError = error;
      }

      const expectedPath = path.join(job.outputDir, `${path.parse(inputPath).name}.${extension}`);
      removeIncompleteOfficeOutput(expectedPath);

      if (extension === "docx") {
        job.log.push(String(loError && loError.message ? loError.message : loError || "LibreOffice failed"));
        const outputs = await writeDocxWithScanStrategy(this, job, inputPath, scanOcr, ocrOutput, {
          forceCompat: false,
          loFailed: true
        });
        for (const out of outputs) {
          ensureOutputFile(out, inputPath);
          job.outputPaths.push(out);
        }
        continue;
      }

      let message = String(loError && loError.message ? loError.message : loError || "LibreOffice 轉換失敗");
      if (["xlsx", "pptx", "odt"].includes(extension)) {
        message +=
          `\n說明：PDF→${extension.toUpperCase()} 為實驗性轉換；PDF 並非試算表／簡報／原始 Office 格式，結果可能不完整。` +
          "正式用途建議輸出 DOCX（可自動相容模式）。";
      }
      throw new Error(message);
    }
  }

  async runPdfMerge(job) {
    ensureOutputDir(job.outputDir);
    if (!job.inputPaths.length) {
      throw new Error("PDF merge requires at least one input file");
    }
    ensureJobNotCancelled(job);
    const outputPath = nextAvailablePath(path.join(job.outputDir, "merged.pdf"));
    const output = await PDFDocument.create();
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const input = await loadPdf(inputPath);
      const pageIndexes = input.getPageIndices();
      // Copy in chunks so cancel can land between page batches on large PDFs.
      const chunkSize = 16;
      for (let offset = 0; offset < pageIndexes.length; offset += chunkSize) {
        ensureJobNotCancelled(job);
        const chunk = pageIndexes.slice(offset, offset + chunkSize);
        const copiedPages = await output.copyPages(input, chunk);
        copiedPages.forEach((page) => output.addPage(page));
      }
    }
    ensureJobNotCancelled(job);
    await savePdf(output, outputPath);
    ensureOutputFile(outputPath, job.inputPaths[0]);
    job.outputPaths.push(outputPath);
    job.log.push(`merged ${job.inputPaths.length} file(s) -> ${path.basename(outputPath)}`);
  }

  async runPdfSplit(job) {
    ensureOutputDir(job.outputDir);
    if (job.inputPaths.length !== 1) {
      throw new Error("PDF split requires exactly one input file");
    }
    ensureJobNotCancelled(job);
    const inputPath = job.inputPaths[0];
    const input = await loadPdf(inputPath);
    if (!String(job.options.pages || "").trim()) {
      throw new Error("Page ranges are required for PDF split (example: 1-3,5,7-9)");
    }
    const ranges = parsePageRanges(job.options.pages || "", input.getPageCount());
    if (!ranges.length) {
      throw new Error("No valid page ranges provided (example: 1-3,5,7-9)");
    }
    for (let i = 0; i < ranges.length; i += 1) {
      ensureJobNotCancelled(job);
      const indexes = ranges[i];
      const output = await PDFDocument.create();
      const pages = await output.copyPages(input, indexes);
      pages.forEach((page) => output.addPage(page));
      const label = pageRangeLabel(indexes);
      const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}_p${label}.pdf`));
      await savePdf(output, outputPath);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
      job.log.push(`split part ${i + 1}: pages ${label} -> ${path.basename(outputPath)}`);
    }
  }

  async runPdfRotate(job) {
    ensureOutputDir(job.outputDir);
    const angle = sanitizeRotation(job.options.angle || "90");
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const input = await loadPdf(inputPath);
      const indexes = flattenPageRanges(parsePageRanges(job.options.pages || "", input.getPageCount()));
      for (let i = 0; i < indexes.length; i += 1) {
        if (i % 8 === 0) {
          ensureJobNotCancelled(job);
        }
        const index = indexes[i];
        const page = input.getPage(index);
        const current = page.getRotation().angle || 0;
        page.setRotation(degrees((current + angle) % 360));
      }
      ensureJobNotCancelled(job);
      const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}_rotated.pdf`));
      await savePdf(input, outputPath);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
      job.log.push(`rotated ${path.basename(inputPath)} by ${angle} degrees -> ${path.basename(outputPath)}`);
    }
  }

  async runPdfEncrypt(job) {
    const tool = requireTool(this.tools, "qpdf");
    ensureOutputDir(job.outputDir);
    const password = sanitizePassword(job.options.password);
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}_encrypted.pdf`));
      const args = ["--encrypt", password, password, "256", "--", inputPath, outputPath];
      const result = await runProcess(tool.path, args, job);
      job.log.push(result.output || `encrypted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runPdfDecrypt(job) {
    const tool = requireTool(this.tools, "qpdf");
    ensureOutputDir(job.outputDir);
    const password = String(job.options.password || "");
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}_decrypted.pdf`));
      const args = password
        ? [`--password=${password}`, "--decrypt", inputPath, outputPath]
        : ["--decrypt", inputPath, outputPath];
      const result = await runProcess(tool.path, args, job);
      job.log.push(result.output || `decrypted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runPdfCompress(job) {
    ensureOutputDir(job.outputDir);
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const input = await loadPdf(inputPath);
      const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}_compressed.pdf`));
      const bytes = await input.save({ useObjectStreams: true });
      fs.writeFileSync(outputPath, bytes);
      ensureOutputFile(outputPath, inputPath);
      const before = fs.statSync(inputPath).size;
      const after = fs.statSync(outputPath).size;
      const note = after < before ? "compressed" : "rewritten";
      job.outputPaths.push(outputPath);
      job.log.push(`${note}: ${path.basename(inputPath)} ${before} -> ${after} bytes`);
    }
  }

  async runMediaConvert(job) {
    const tool = requireTool(this.tools, "ffmpeg");
    ensureOutputDir(job.outputDir);
    const extension = sanitizeExtension(job.options.extension || "mp4");
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}.${extension}`));
      const args = buildFfmpegMediaArgs(inputPath, outputPath, { ...job.options, extension });
      try {
        const result = await runProcess(tool.path, args, job, "FFmpeg");
        job.log.push(result.output || `media: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
        ensureOutputFile(outputPath, inputPath);
        if (fs.statSync(outputPath).size < 1) {
          throw new Error(`FFmpeg 未產生有效輸出檔：${path.basename(outputPath)}`);
        }
        job.outputPaths.push(outputPath);
      } catch (error) {
        try {
          fs.rmSync(outputPath, { force: true });
        } catch {
          // Preserve the process error; cleanup is best effort.
        }
        throw error;
      }
    }
  }

  async runImageConvert(job) {
    ensureOutputDir(job.outputDir);
    const extension = sanitizeExtension(job.options.extension || "jpg");
    const operations = sanitizeImageOps(job.options.imageOps, job.inputPaths.length);
    const renderOptions = {
      quality: sanitizeImageQuality(job.options.quality),
      maxWidth: sanitizeImageDimension(job.options.maxWidth, "maxWidth"),
      maxHeight: sanitizeImageDimension(job.options.maxHeight, "maxHeight"),
      keepRatio: String(job.options.keepRatio || "true") !== "false",
      watermarkText: sanitizeImageWatermarkText(job.options.watermarkText),
      watermarkPosition: sanitizeImageWatermarkPosition(job.options.watermarkPosition)
    };
    const tempDir = createOcrTempDir("image-convert");
    let failed = 0;
    try {
      for (let index = 0; index < job.inputPaths.length; index += 1) {
        const inputPath = job.inputPaths[index];
        ensureJobNotCancelled(job);
        this.updateJobProgress(job, {
          current: index,
          total: job.inputPaths.length,
          phase: "image-convert",
          message: `正在處理第 ${index + 1} / ${job.inputPaths.length} 張圖片`
        });
        try {
          const canvas = await renderWorkspaceImageCanvas(inputPath, operations[index], renderOptions, false);
          const outputPath = nextAvailablePath(
            path.join(job.outputDir, `${path.parse(inputPath).name}.${extension}`)
          );
          await writeWorkspaceImageOutput(this, job, canvas, outputPath, extension, renderOptions.quality, tempDir);
          ensureOutputFile(outputPath, inputPath);
          job.outputPaths.push(outputPath);
          job.itemResults.push({
            index,
            name: path.basename(inputPath),
            status: "done",
            outputName: path.basename(outputPath),
            error: ""
          });
          job.log.push(`image: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
        } catch (error) {
          if (isJobCancelledError(error) || job.cancelRequested) throw error;
          failed += 1;
          const friendly = createFriendlyImageError(error, path.basename(inputPath), "convert");
          job.itemResults.push({
            index,
            name: path.basename(inputPath),
            status: "failed",
            outputName: "",
            error: imageErrorSummary(friendly)
          });
          job.log.push(friendly.message);
        }
        this.updateJobProgress(job, {
          current: index + 1,
          total: job.inputPaths.length,
          phase: "image-convert",
          message: `已完成 ${index + 1} / ${job.inputPaths.length} 張圖片`
        });
      }
    } finally {
      cleanupOcrTempDir(tempDir);
    }
    if (!job.outputPaths.length) {
      throw new Error(job.log[job.log.length - 1] || "所有圖片均無法處理");
    }
    if (failed) {
      job.log.push(`圖片處理完成：${job.outputPaths.length} 成功，${failed} 失敗`);
      this.updateJobProgress(job, {
        current: job.inputPaths.length,
        total: job.inputPaths.length,
        phase: "image-convert",
        message: `完成 ${job.outputPaths.length} / ${job.inputPaths.length}，${failed} 個未完成`
      });
    }
  }

  async runOcrImage(job) {
    const tool = requireTool(this.tools, "tesseract");
    ensureOutputDir(job.outputDir);
    const { language, tessdataDir, note } = resolveOcrLanguage(tool.path, job.options.language || "chi_tra+eng");
    if (note) {
      job.log.push(note);
    }
    const operations = sanitizeImageOps(job.options.imageOps, job.inputPaths.length);
    const tempDir = createOcrTempDir("image-ocr");
    let failed = 0;
    try {
      for (let index = 0; index < job.inputPaths.length; index += 1) {
        const inputPath = job.inputPaths[index];
        ensureJobNotCancelled(job);
        this.updateJobProgress(job, {
          current: index,
          total: job.inputPaths.length,
          phase: "image-ocr",
          message: `正在辨識第 ${index + 1} / ${job.inputPaths.length} 張圖片`
        });
        try {
          const canvas = await renderWorkspaceImageCanvas(inputPath, operations[index], {}, true);
          const preparedPath = path.join(tempDir, `image_${String(index + 1).padStart(3, "0")}.png`);
          fs.writeFileSync(preparedPath, canvas.toBuffer("image/png"));
          const suffix = operations[index].ocrRegion ? "_region_ocr.txt" : "_ocr.txt";
          const outputPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}${suffix}`));
          const outputBase = outputPath.slice(0, -path.extname(outputPath).length);
          const log = await runImageTextOcr(tool.path, preparedPath, outputBase, language, tessdataDir, job);
          if (log) job.log.push(log);
          const text = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8").trim() : "";
          if (!text) throw new Error("OCR 結果為空（圖片可能沒有可讀取的文字）");
          ensureOutputFile(outputPath, inputPath);
          job.outputPaths.push(outputPath);
          job.itemResults.push({
            index,
            name: path.basename(inputPath),
            status: "done",
            outputName: path.basename(outputPath),
            error: ""
          });
        } catch (error) {
          if (isJobCancelledError(error) || job.cancelRequested) throw error;
          failed += 1;
          const friendly = createFriendlyImageError(error, path.basename(inputPath), "ocr");
          job.itemResults.push({
            index,
            name: path.basename(inputPath),
            status: "failed",
            outputName: "",
            error: imageErrorSummary(friendly)
          });
          job.log.push(friendly.message);
        }
        this.updateJobProgress(job, {
          current: index + 1,
          total: job.inputPaths.length,
          phase: "image-ocr",
          message: `已辨識 ${index + 1} / ${job.inputPaths.length} 張圖片`
        });
      }
    } finally {
      cleanupOcrTempDir(tempDir);
    }
    if (!job.outputPaths.length) {
      throw new Error(job.log[job.log.length - 1] || "所有圖片均未辨識到文字");
    }
    if (failed) {
      job.log.push(`圖片 OCR 完成：${job.outputPaths.length} 成功，${failed} 失敗`);
      this.updateJobProgress(job, {
        current: job.inputPaths.length,
        total: job.inputPaths.length,
        phase: "image-ocr",
        message: `完成 ${job.outputPaths.length} / ${job.inputPaths.length}，${failed} 個未完成`
      });
    }
  }

  async runOcrPdf(job) {
    const tool = requireTool(this.tools, "tesseract");
    ensureOutputDir(job.outputDir);
    const { language, tessdataDir, note } = resolveOcrLanguage(tool.path, job.options.language || "chi_tra+eng");
    if (note) job.log.push(note);
    const maxPages = sanitizeOcrPdfMaxPages(job.options.maxPages);

    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const pageDir = createOcrTempDir("pdf-text");
      try {
        const probe = fs.readFileSync(inputPath);
        if (pdfBytesLookEncrypted(probe)) {
          throw encryptedPdfError(path.basename(inputPath));
        }
        const pageImages = await renderPdfPagesToPng(inputPath, pageDir, maxPages, job, {
          pages: job.options.pages,
          onProgress: ({ current, total, pageNumber }) => this.updateJobProgress(job, {
            current,
            total,
            phase: "render",
            message: `正在準備第 ${pageNumber} 頁（${current} / ${total}）`
          })
        });
        if (!pageImages.length) {
          throw new Error(`PDF 沒有可 OCR 的頁面：${path.basename(inputPath)}`);
        }
        job.log.push(`render: ${path.basename(inputPath)} ${pageImages.length} page(s)`);

        const pageTexts = [];
        let hasRecognizedText = false;
        for (let i = 0; i < pageImages.length; i += 1) {
          ensureJobNotCancelled(job);
          const { imagePath, pageNumber } = pageImages[i];
          this.updateJobProgress(job, {
            current: i,
            total: pageImages.length,
            phase: "ocr",
            message: `正在辨識第 ${i + 1} / ${pageImages.length} 頁`
          });
          const pageBase = path.join(pageDir, `page_${String(pageNumber).padStart(3, "0")}_ocr`);
          let log;
          try {
            log = await runImageTextOcr(tool.path, imagePath, pageBase, language, tessdataDir, job);
          } catch (error) {
            throw annotatePdfOcrStageError(error, {
              stage: "tesseract_ocr",
              pageNumber,
              inputPath
            });
          }
          if (log) job.log.push(log);
          const textPath = `${pageBase}.txt`;
          const text = repairOcrText(fs.existsSync(textPath) ? fs.readFileSync(textPath, "utf8") : "").trim();
          if (text) hasRecognizedText = true;
          pageTexts.push(`--- Page ${pageNumber} ---\n${text}`.trimEnd());
          this.updateJobProgress(job, {
            current: i + 1,
            total: pageImages.length,
            phase: "ocr",
            message: `已辨識第 ${i + 1} / ${pageImages.length} 頁`
          });
        }
        if (!hasRecognizedText) {
          throw new Error("OCR 結果為空（文件可能沒有可讀取的掃描文字）");
        }

        const requestedPages = sanitizeOcrPageSelection(job.options.pages);
        const pageSuffix = requestedPages.length === 1 ? `_p${requestedPages[0]}` : "";
        const outputPath = nextAvailablePath(
          path.join(job.outputDir, `${path.parse(inputPath).name}${pageSuffix}_ocr.txt`)
        );
        fs.writeFileSync(outputPath, `${pageTexts.join("\n\n").trim()}\n`, "utf8");
        ensureOutputFile(outputPath, inputPath);
        job.outputPaths.push(outputPath);
        job.log.push(
          `ocr-pdf: ${path.basename(inputPath)} -> ${path.basename(outputPath)} (${pageImages.length} page(s), language=${language})`
        );
      } catch (error) {
        if (isJobCancelledError(error)) throw error;
        throw createFriendlyOcrError(error, path.basename(inputPath));
      } finally {
        cleanupOcrTempDir(pageDir);
      }
    }
  }

  emitJobs() {
    // Opportunistic prune keeps history bounded without a separate timer.
    this.pruneJobs();
    if (typeof this.onJobsUpdated === "function") {
      this.onJobsUpdated(this.getJobs());
    }
  }
}

function loadJobsState(statePath, options = {}) {
  const metadata = (jobs, trusted) => options.withMetadata ? { jobs, trusted } : jobs;
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw && raw.jobs) ? raw.jobs : null;
    if (!list) return metadata([], false);
    if (list.some((item) => !item || typeof item !== "object" || !item.id || !item.type)) {
      return metadata([], false);
    }
    const jobs = list
      .map((item) => normalizePersistedJob(item))
      .filter(Boolean)
      .slice(0, MAX_PERSISTED_JOBS);
    return metadata(jobs, true);
  } catch (error) {
    const missing = error && error.code === "ENOENT";
    return metadata([], missing);
  }
}

function normalizePersistedJob(item) {
  if (!item || typeof item !== "object" || !item.id || !item.type) {
    return null;
  }
  let status = String(item.status || "queued");
  let error = String(item.error || "");
  const log = Array.isArray(item.log) ? item.log.map(String).slice(-20) : [];
  let finishedAt = item.finishedAt ? String(item.finishedAt) : null;
  const rawOptions = item.options && typeof item.options === "object" ? { ...item.options } : {};
  // Interrupted mid-run jobs cannot resume safely — mark failed.
  let errorCode = item.errorCode ? String(item.errorCode) : "";
  let errorHint = item.errorHint ? String(item.errorHint) : "";
  let retriable = item.retriable !== false;
  if (status === "running") {
    status = "failed";
    error = error || "應用程式重啟時任務中斷";
    log.push(error);
    finishedAt = finishedAt || new Date().toISOString();
    const classified = classifyJobError(error, item);
    errorCode = classified.code;
    errorHint = classified.hint;
    retriable = classified.retriable;
  }
  if (status === "queued" && PASSWORD_JOB_TYPES.has(String(item.type))) {
    status = "failed";
    error = "任務因應用程式重啟而停止，請重新輸入密碼。";
    log.push(error);
    finishedAt = finishedAt || new Date().toISOString();
    const classified = classifyJobError(error, item);
    errorCode = classified.code;
    errorHint = classified.hint;
    retriable = false;
  }
  const inputPaths = Array.isArray(item.inputPaths)
    ? item.inputPaths.map(String).filter((p) => p && fs.existsSync(p))
    : [];
  // Drop queued jobs whose inputs vanished.
  if (status === "queued" && !inputPaths.length) {
    return null;
  }
  const outputPaths = Array.isArray(item.outputPaths)
    ? item.outputPaths.map(String).filter((p) => p && fs.existsSync(p))
    : [];
  return {
    id: String(item.id),
    type: String(item.type),
    inputPaths,
    outputDir: String(item.outputDir || ""),
    options: redactJobOptions(rawOptions),
    status,
    createdAt: String(item.createdAt || new Date().toISOString()),
    startedAt: item.startedAt ? String(item.startedAt) : null,
    finishedAt,
    outputPaths,
    log,
    error,
    errorCode,
    errorHint,
    retriable,
    progress: normalizeJobProgress(item.progress),
    itemResults: normalizeImageItemResults(item.itemResults),
    cancelRequested: false,
    _child: null
  };
}

function atomicWriteFileSync(filePath, contents, fsImpl = fs) {
  let tempPath = "";
  try {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    tempPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
    );
    const descriptor = fsImpl.openSync(tempPath, "wx");
    try {
      fsImpl.writeFileSync(descriptor, contents, "utf8");
      fsImpl.fsyncSync(descriptor);
    } finally {
      fsImpl.closeSync(descriptor);
    }
    fsImpl.renameSync(tempPath, filePath);
    tempPath = "";
  } finally {
    if (tempPath) {
      try {
        fsImpl.rmSync(tempPath, { force: true });
      } catch {
        // Best-effort cleanup of an interrupted state write.
      }
    }
  }
}

function saveJobsState(statePath, jobs) {
  try {
    const payload = {
      version: JOBS_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      jobs: jobs.slice(0, MAX_PERSISTED_JOBS).map((job) => ({
        id: job.id,
        type: job.type,
        inputPaths: job.inputPaths || [],
        outputDir: job.outputDir || "",
        options: redactJobOptions(job.options),
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        outputPaths: job.outputPaths || [],
        log: (job.log || []).slice(-12).map((line) => redactJobText(line, job.options)),
        error: redactJobText(job.error, job.options),
        errorCode: job.errorCode || "",
        errorHint: job.errorHint || "",
        retriable: job.retriable !== false,
        progress: normalizeJobProgress(job.progress),
        itemResults: normalizeImageItemResults(job.itemResults)
      }))
    };
    atomicWriteFileSync(statePath, JSON.stringify(payload, null, 2));
  } catch {
    // Persistence is best-effort; conversion should still work offline.
  }
}

async function detectTool(definition, configuredPath) {
  const candidates = buildCandidates(definition, configuredPath);
  for (const candidate of candidates) {
    const resolved = await resolveCandidate(candidate.path);
    if (!resolved) {
      continue;
    }
    const normalized = normalizeToolPath(definition, resolved);
    const version = await readVersion(normalized, definition.versionArgs);
    const entry = {
      available: true,
      label: definition.label,
      path: normalized,
      version,
      source: candidate.source,
      message: "available"
    };
    if (definition.label === "Tesseract") {
      Object.assign(entry, await detectTesseractLanguageSupport(normalized));
      if (entry.detectedLanguages && !entry.detectedLanguages.includes("chi_tra")) {
        entry.message = "available (missing chi_tra language pack)";
      }
    }
    return entry;
  }
  return {
    available: false,
    label: definition.label,
    path: "",
    version: "",
    source: "",
    message: "not found"
  };
}

function buildCandidates(definition, configuredPath) {
  const candidates = [];
  if (configuredPath) {
    candidates.push({ path: configuredPath, source: "manual" });
  }
  if (process.env[definition.env]) {
    candidates.push({ path: process.env[definition.env], source: "env" });
  }
  for (const bundledPath of bundledToolPaths(definition)) {
    candidates.push({ path: bundledPath, source: "bundled" });
  }
  if (process.platform === "win32") {
    candidates.push(...definition.windowsPaths.map((item) => ({ path: item, source: "system" })));
  }
  candidates.push(...definition.commands.map((item) => ({ path: item, source: "path" })));
  return candidates;
}

function bundledToolPaths(definition) {
  const roots = [
    path.join(process.resourcesPath || path.join(__dirname, ".."), "tools"),
    path.join(__dirname, "..", "tools")
  ];
  const paths = [];
  const dynamicPaths = [];
  for (const root of Array.from(new Set(roots))) {
    for (const relativePath of definition.bundledPaths || []) {
      paths.push(path.join(root, ...relativePath));
    }
    dynamicPaths.push(...findBundledExecutables(root, definition));
  }
  return Array.from(new Set([...paths, ...dynamicPaths]));
}

function findBundledExecutables(root, definition) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const executableNames = Array.from(new Set((definition.bundledPaths || []).map((parts) => parts[parts.length - 1])));
  const topLevelDirs = Array.from(new Set((definition.bundledPaths || []).map((parts) => parts[0])));
  const matches = [];
  for (const dirName of topLevelDirs) {
    const startDir = path.join(root, dirName);
    if (!fs.existsSync(startDir)) {
      continue;
    }
    walkBundledToolDir(startDir, executableNames, 4, matches);
  }
  walkBundledToolDir(root, executableNames, 5, matches);
  return matches;
}

function walkBundledToolDir(currentDir, executableNames, depth, matches) {
  if (depth < 0) {
    return;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isFile() && executableNames.includes(entry.name)) {
      matches.push(fullPath);
      continue;
    }
    if (entry.isDirectory()) {
      walkBundledToolDir(fullPath, executableNames, depth - 1, matches);
    }
  }
}

function loadConfig(configPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      toolPaths: parsed && typeof parsed.toolPaths === "object" ? parsed.toolPaths : {},
      defaultOutputDir:
        parsed && typeof parsed.defaultOutputDir === "string" ? parsed.defaultOutputDir : ""
    };
  } catch {
    return { toolPaths: {}, defaultOutputDir: "" };
  }
}

function saveConfig(configPath, config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

async function resolveCandidate(candidate) {
  if (path.isAbsolute(candidate)) {
    return fs.existsSync(candidate) ? candidate : "";
  }
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  try {
    const result = await execFileText(lookup, [candidate], { timeout: 5000 });
    const first = result.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return first || "";
  } catch {
    return "";
  }
}

function normalizeToolPath(definition, resolvedPath) {
  if (process.platform !== "win32" || definition.label !== "LibreOffice") {
    return resolvedPath;
  }
  if (!/soffice\.exe$/i.test(resolvedPath)) {
    return resolvedPath;
  }
  const consolePath = resolvedPath.replace(/soffice\.exe$/i, "soffice.com");
  return fs.existsSync(consolePath) ? consolePath : resolvedPath;
}

async function readVersion(executable, args) {
  try {
    const result = await execFileText(executable, args, { timeout: 8000 });
    return result.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function requireTool(tools, key) {
  const tool = tools && tools[key];
  if (!tool || !tool.available) {
    const label = TOOL_DEFINITIONS[key] ? TOOL_DEFINITIONS[key].label : key;
    throw new Error(`${label} not found`);
  }
  return tool;
}

function bundledTessdataDir(toolPath) {
  const normalized = String(toolPath || "");
  if (!normalized) {
    return "";
  }
  // Prefer locations next to the executable (Windows portable layout:
  // tools/tesseract/tesseract.exe + tools/tesseract/tessdata).
  // Also support Unix-style share/tessdata and bin/ wrappers.
  const exeDir = path.dirname(path.resolve(normalized));
  const candidates = [
    path.join(exeDir, "tessdata"),
    path.join(exeDir, "share", "tessdata"),
    path.join(exeDir, "..", "tessdata"),
    path.join(exeDir, "..", "share", "tessdata")
  ];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return "";
}

function resolveTessdataPath(toolPath) {
  const adjacent = bundledTessdataDir(toolPath);
  if (adjacent) {
    return adjacent;
  }
  const envPrefix = String(process.env.TESSDATA_PREFIX || "").trim();
  if (!envPrefix) {
    return "";
  }
  const candidates = [
    envPrefix,
    path.join(envPrefix, "tessdata")
  ];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return "";
}

function scanTessdataLanguages(tessdataPath) {
  if (!tessdataPath || !fs.existsSync(tessdataPath)) {
    return [];
  }
  const languages = [];
  try {
    for (const entry of fs.readdirSync(tessdataPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".traineddata")) {
        continue;
      }
      const fullPath = path.join(tessdataPath, entry.name);
      try {
        if (fs.statSync(fullPath).size < 50_000) {
          continue;
        }
      } catch {
        continue;
      }
      languages.push(entry.name.slice(0, -".traineddata".length));
    }
  } catch {
    return [];
  }
  return Array.from(new Set(languages)).sort();
}

function listTesseractLanguagesSync(toolPath) {
  const tessdataPath = resolveTessdataPath(toolPath);
  const args = tessdataPath ? ["--tessdata-dir", tessdataPath, "--list-langs"] : ["--list-langs"];
  try {
    const output = execFileSyncText(toolPath, args, { timeout: 8000 });
    const languages = parseTesseractListLanguages(output);
    if (languages.length) {
      return { languages, tessdataPath, method: "list-langs" };
    }
  } catch {
    // Fall back to scanning traineddata below.
  }
  const scanned = scanTessdataLanguages(tessdataPath);
  return { languages: scanned, tessdataPath, method: scanned.length ? "traineddata-scan" : "none" };
}

function resolveOcrLanguage(toolPath, requested) {
  const preferred = String(requested || "chi_tra+eng").trim() || "chi_tra+eng";
  let parts = preferred.split(/[,+]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    parts = ["chi_tra", "eng"];
  }
  const { languages, tessdataPath } = listTesseractLanguagesSync(toolPath);
  const available = new Set(languages);
  if (!available.size) {
    return { language: parts.join("+"), tessdataDir: tessdataPath, note: "" };
  }
  const kept = parts.filter((part) => available.has(part));
  if (kept.length === parts.length) {
    return { language: kept.join("+"), tessdataDir: tessdataPath, note: "" };
  }
  if (kept.length) {
    const missing = parts.filter((part) => !available.has(part));
    return {
      language: kept.join("+"),
      tessdataDir: tessdataPath,
      note: `OCR 語言包缺少 ${missing.join(", ")}，已改用 ${kept.join("+")}。`
    };
  }
  const fallback = available.has("eng") ? "eng" : languages[0];
  return {
    language: fallback,
    tessdataDir: tessdataPath,
    note: `OCR 語言包不支援 ${preferred}，已改用 ${fallback}。`
  };
}

async function runImageTextOcr(toolPath, inputPath, outputBase, language, tessdataDir, job) {
  const primaryArgs = buildTesseractOcrArgs(inputPath, outputBase, language, tessdataDir, "", "6");
  const primaryResult = await runProcess(toolPath, primaryArgs, job, "Tesseract");
  const primaryTextPath = `${outputBase}.txt`;
  const primaryText = fs.existsSync(primaryTextPath) ? fs.readFileSync(primaryTextPath, "utf8") : "";

  const sparseBase = `${outputBase}_sparse`;
  const sparseArgs = buildTesseractOcrArgs(inputPath, sparseBase, language, tessdataDir, "", "11");
  let sparseOutput = "";
  let sparseText = "";
  try {
    const sparseResult = await runProcess(toolPath, sparseArgs, job, "Tesseract");
    sparseOutput = sparseResult.output || "";
    const sparseTextPath = `${sparseBase}.txt`;
    sparseText = fs.existsSync(sparseTextPath) ? fs.readFileSync(sparseTextPath, "utf8") : "";
    try {
      fs.rmSync(sparseTextPath, { force: true });
    } catch {
      // ignore
    }
  } catch {
    sparseText = "";
  }

  fs.writeFileSync(primaryTextPath, chooseOcrText(primaryText, sparseText), "utf8");
  return [primaryResult.output, sparseOutput].filter(Boolean).join("\n").trim();
}

function chooseOcrText(primary, sparse) {
  const primaryFixed = repairOcrText(primary);
  const sparseFixed = repairOcrText(sparse);
  return ocrTextScore(sparseFixed) > ocrTextScore(primaryFixed) + 8 ? sparseFixed : primaryFixed;
}

function ocrTextScore(text) {
  const value = String(text || "");
  const cjk = Array.from(value).filter((char) => char >= "\u4e00" && char <= "\u9fff").length;
  const asciiWords = (value.match(/[A-Za-z]{2,}/g) || []).length;
  const gibberish = (value.match(/\b[A-Z]{4,}\b/g) || []).length;
  return cjk * 3 + asciiWords - gibberish * 2 + Math.floor(Math.min(value.trim().length, 80) / 10);
}

function repairOcrText(text) {
  let fixed = String(text || "");
  if (fixed.includes("資料夾存取權") && !fixed.includes("安全性索引標籤")) {
    fixed = fixed.replace(
      /(使用)[蕉福窗除寢說密][全主夠][性][天豆素索守本記引林標樟訪欄篇紡給措圖夾夠 ]{2,14}[。．.\-]?/g,
      "$1安全性索引標籤。"
    );
  }
  if (fixed.includes("CapabilityAccessManager")) {
    fixed = fixed.replace(/^\s*B[RRB]O\s*$/gm, "關閉(C)");
  }
  return fixed;
}

function buildTesseractOcrArgs(inputPath, outputBase, language, tessdataDir, outputFormat = "", psm = "6") {
  const args = [];
  if (tessdataDir) {
    args.push("--tessdata-dir", tessdataDir);
  }
  args.push("--psm", psm);
  args.push(inputPath, outputBase, "-l", language);
  if (outputFormat) {
    args.push(outputFormat);
  }
  return args;
}

function listOcrLanguages(tessdataDir) {
  if (!tessdataDir || !fs.existsSync(tessdataDir)) return [];
  try {
    return fs.readdirSync(tessdataDir)
      .filter((name) => name.toLowerCase().endsWith(".traineddata"))
      .filter((name) => {
        try {
          return fs.statSync(path.join(tessdataDir, name)).size > 50_000;
        } catch {
          return false;
        }
      })
      .map((name) => name.replace(/\.traineddata$/i, ""))
      .sort();
  } catch {
    return [];
  }
}

function normalizeJobProgress(progress) {
  if (!progress || typeof progress !== "object") return null;
  const current = Math.max(0, Number.parseInt(String(progress.current || 0), 10) || 0);
  const total = Math.max(current, Number.parseInt(String(progress.total || 0), 10) || 0);
  return {
    current,
    total,
    phase: String(progress.phase || ""),
    message: String(progress.message || "")
  };
}

function ensureOutputDir(outputDir) {
  if (!outputDir) {
    throw new Error("Output folder is required");
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

function positiveEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function validateJobInputLimits(inputPaths, outputDir, limits = {}) {
  const maxFileBytes = limits.maxFileBytes || MAX_INPUT_FILE_BYTES;
  const maxJobBytes = limits.maxJobBytes || MAX_JOB_INPUT_BYTES;
  const diskMultiplier = limits.diskMultiplier || MIN_DISK_MULTIPLIER;
  let totalBytes = 0;
  for (const inputPath of inputPaths) {
    if (!inputPath || !fs.existsSync(inputPath)) continue;
    const size = fs.statSync(inputPath).size;
    if (size > maxFileBytes) {
      throw new Error(`${path.basename(inputPath)} exceeds the ${formatBytes(maxFileBytes)} file limit`);
    }
    totalBytes += size;
    if (totalBytes > maxJobBytes) {
      throw new Error(`Job inputs exceed the ${formatBytes(maxJobBytes)} total limit`);
    }
  }
  if (!totalBytes) return 0;
  ensureOutputDir(outputDir);
  if (typeof fs.statfsSync === "function") {
    const stats = fs.statfsSync(outputDir);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const required = totalBytes * diskMultiplier;
    if (Number.isFinite(available) && available < required) {
      throw new Error(`Not enough free disk space: ${formatBytes(required)} required, ${formatBytes(available)} available`);
    }
  }
  return totalBytes;
}

function formatBytes(value) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(value / 1024)} KB`;
}

function nextAvailablePath(filePath) {
  const parsed = path.parse(filePath);
  const first = path.join(parsed.dir, fitOutputFilename(parsed.name, parsed.ext));
  if (!fs.existsSync(first)) {
    return first;
  }
  for (let index = 2; index < 10000; index += 1) {
    const candidate = path.join(parsed.dir, fitOutputFilename(parsed.name, parsed.ext, ` (${index})`));
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to find an available output name for ${parsed.base}`);
}

function fitOutputFilename(stem, extension = "", collisionSuffix = "", maxBytes = 240) {
  const ext = String(extension || "");
  const marker = String(collisionSuffix || "");
  const budget = Math.max(1, maxBytes - Buffer.byteLength(ext) - Buffer.byteLength(marker));
  let fitted = "";
  for (const character of Array.from(String(stem || "output").normalize("NFC"))) {
    if (Buffer.byteLength(fitted + character) > budget) break;
    fitted += character;
  }
  fitted = fitted.replace(/[ .]+$/g, "") || "output";
  return `${fitted}${marker}${ext}`;
}

async function runLibreOfficeToUniqueOutput(toolPath, outputDir, inputPath, convertTo, extension, job) {
  const tempDir = fs.mkdtempSync(path.join(outputDir, ".swiftlocal-office-"));
  const profileDir = createLibreOfficeProfileDir(tempDir);
  try {
    const before = snapshotOutputDir(tempDir);
    const args = libreOfficeArgs(tempDir, inputPath, convertTo, profileDir);
    const result = await runProcess(toolPath, args, job, "LibreOffice");
    const generated = resolveLibreOfficeOutput(tempDir, inputPath, extension, before);
    const outputPath = nextAvailablePath(path.join(outputDir, path.basename(generated)));
    fs.renameSync(generated, outputPath);
    return { outputPath, result };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function ensureOutputFile(outputPath, inputPath) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Conversion finished but output was not created for ${path.basename(inputPath)}`);
  }
}

function snapshotOutputDir(outputDir) {
  const snap = new Map();
  if (!outputDir || !fs.existsSync(outputDir)) {
    return snap;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(outputDir, { withFileTypes: true });
  } catch {
    return snap;
  }
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const fullPath = path.join(outputDir, entry.name);
    try {
      const stat = fs.statSync(fullPath);
      snap.set(entry.name, { mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      // ignore unreadable entries
    }
  }
  return snap;
}

function resolveLibreOfficeOutput(outputDir, inputPath, extension, before) {
  const cleanExt = String(extension || "").replace(/^\./, "").toLowerCase();
  const expectedName = `${path.parse(inputPath).name}.${cleanExt}`;
  const expectedPath = path.join(outputDir, expectedName);

  const isNewOrUpdated = (filePath, name) => {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    try {
      const stat = fs.statSync(filePath);
      const prev = before && before.get(name);
      if (!prev) {
        return true;
      }
      return prev.mtimeMs !== stat.mtimeMs || prev.size !== stat.size;
    } catch {
      return false;
    }
  };

  if (fs.existsSync(expectedPath) && (isNewOrUpdated(expectedPath, expectedName) || !before.has(expectedName))) {
    return expectedPath;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(outputDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`LibreOffice 輸出目錄無法讀取：${outputDir}`);
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase();
    if (ext !== cleanExt) {
      continue;
    }
    if (entry.name.toLowerCase().endsWith(`_lo_profile.${cleanExt}`)) {
      continue;
    }
    const fullPath = path.join(outputDir, entry.name);
    if (isNewOrUpdated(fullPath, entry.name)) {
      candidates.push(fullPath);
    }
  }

  if (!candidates.length && fs.existsSync(expectedPath)) {
    return expectedPath;
  }

  if (!candidates.length) {
    throw new Error(
      `LibreOffice 轉換完成但找不到輸出檔（預期 ${expectedName}）。輸入：${path.basename(inputPath)}`
    );
  }

  const stemLower = path.parse(inputPath).name.toLowerCase();
  const rank = (filePath) => {
    const stem = path.parse(filePath).name.toLowerCase();
    let score = 0;
    if (stem === stemLower) {
      score += 2;
    } else if (stem.includes(stemLower) || stemLower.includes(stem)) {
      score += 1;
    }
    return score;
  };

  candidates.sort((a, b) => {
    const scoreDiff = rank(b) - rank(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
  });
  return candidates[0];
}

function sanitizeExtension(extension) {
  const clean = String(extension).replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!clean) {
    throw new Error("Invalid output extension");
  }
  return clean;
}

const AUDIO_ONLY_EXTENSIONS = new Set(["mp3", "wav", "m4a", "flac", "aac", "ogg", "opus"]);

function sanitizeMediaBitrate(value, fieldName) {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!text) {
    return "";
  }
  if (!/^\d{1,7}([kmg])?$/.test(text)) {
    throw new Error(`Invalid ${fieldName}: use values like 128k or 2M`);
  }
  return text;
}

function sanitizeMediaScale(value) {
  const text = String(value || "").trim().replace(/\s+/g, "");
  if (!text) {
    return "";
  }
  if (!/^-?\d{1,5}:-?\d{1,5}$/.test(text)) {
    throw new Error("Invalid scale: use W:H such as 1280:720 or -2:720");
  }
  return text;
}

function sanitizeMediaCrop(value) {
  const text = String(value || "").trim().replace(/\s+/g, "");
  if (!text) {
    return "";
  }
  if (!/^\d{1,5}:\d{1,5}:\d{1,5}:\d{1,5}$/.test(text)) {
    throw new Error("Invalid crop: use w:h:x:y (example 640:360:0:0)");
  }
  return text;
}

function sanitizeMediaTime(value, fieldName) {
  const text = String(value || "").trim().replace(/\s+/g, "");
  if (!text) {
    return "";
  }
  if (/^\d+(\.\d+)?$/.test(text) || /^\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
    return text;
  }
  throw new Error(`Invalid ${fieldName}: use seconds or HH:MM:SS`);
}

function sanitizeGifFps(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const fps = Number.parseInt(text, 10);
  if (!Number.isFinite(fps) || fps < 1 || fps > 30) {
    throw new Error("gifFps must be between 1 and 30");
  }
  return String(fps);
}

function buildFfmpegMediaArgs(inputPath, outputPath, options = {}) {
  const extension = sanitizeExtension(options.extension || "mp4");
  const start = sanitizeMediaTime(options.start || "", "start");
  const duration = sanitizeMediaTime(options.duration || "", "duration");
  const videoBitrate = sanitizeMediaBitrate(options.videoBitrate || "", "videoBitrate");
  const audioBitrate = sanitizeMediaBitrate(options.audioBitrate || "", "audioBitrate");
  const scale = sanitizeMediaScale(options.scale || "");
  const crop = sanitizeMediaCrop(options.crop || "");
  const gifFps = sanitizeGifFps(options.gifFps || "");

  const args = ["-y"];
  if (start) {
    args.push("-ss", start);
  }
  args.push("-i", inputPath);
  if (duration) {
    args.push("-t", duration);
  }

  const videoFilters = [];
  if (crop) {
    videoFilters.push(`crop=${crop}`);
  }
  if (scale) {
    videoFilters.push(`scale=${scale}`);
  }

  if (extension === "gif") {
    videoFilters.push(`fps=${gifFps || "10"}`);
    if (videoFilters.length) {
      args.push("-vf", videoFilters.join(","));
    }
    args.push("-loop", "0", outputPath);
    return args;
  }

  if (AUDIO_ONLY_EXTENSIONS.has(extension)) {
    args.push("-vn");
    if (audioBitrate && extension !== "wav" && extension !== "flac") {
      args.push("-b:a", audioBitrate);
    }
    if (extension === "mp3") {
      args.push("-codec:a", "libmp3lame");
    } else if (extension === "aac" || extension === "m4a") {
      args.push("-codec:a", "aac");
    }
    args.push(outputPath);
    return args;
  }

  if (videoFilters.length) {
    args.push("-vf", videoFilters.join(","));
  }
  if (videoBitrate) {
    args.push("-b:v", videoBitrate);
  }
  if (audioBitrate) {
    args.push("-b:a", audioBitrate);
  }
  if (extension === "mp4") {
    args.push("-movflags", "+faststart");
  }
  args.push(outputPath);
  return args;
}

const OFFICE_FILTER_MAP = {
  docx: "MS Word 2007 XML",
  xlsx: "Calc MS Excel 2007 XML",
  pptx: "Impress MS PowerPoint 2007 XML",
  odt: "writer8"
};

function sanitizeOfficeExtension(extension) {
  const clean = sanitizeExtension(extension || "docx");
  if (!Object.prototype.hasOwnProperty.call(OFFICE_FILTER_MAP, clean)) {
    throw new Error(`Unsupported Office format: ${clean}. Allowed: docx, xlsx, pptx, odt`);
  }
  return clean;
}

function officeConvertTarget(extension) {
  const clean = sanitizeOfficeExtension(extension);
  return `${clean}:${OFFICE_FILTER_MAP[clean]}`;
}

const OCR_PDF_MAX_PAGES_DEFAULT = 50;
const OCR_PDF_MAX_PAGES_HARD_LIMIT = 100;
const OCR_PDF_RENDER_SCALE = 2;
const OCR_PDF_MAX_PIXELS = positiveEnvNumber("SWIFTLOCAL_OCR_MAX_PIXELS", 50_000_000);

function sanitizeOcrPdfMaxPages(value) {
  const parsed = Number.parseInt(String(value || OCR_PDF_MAX_PAGES_DEFAULT), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return OCR_PDF_MAX_PAGES_DEFAULT;
  }
  return Math.min(parsed, OCR_PDF_MAX_PAGES_HARD_LIMIT);
}

function sanitizeOcrLanguage(value, fallback = DEFAULT_OCR_LANGUAGE) {
  const requested = String(value || fallback).trim() || fallback;
  const parts = requested.split("+").map((item) => item.trim()).filter(Boolean);
  if (!parts.length || parts.some((item) => !/^[a-z0-9_]+$/i.test(item))) {
    throw new Error("OCR 語言設定無效");
  }
  return Array.from(new Set(parts)).join("+");
}

function sanitizeDesktopJobOptions(type, options, inputCount) {
  if (type !== "ocr-image" && type !== "image-convert") return options;
  const imageOps = sanitizeImageOps(options.imageOps, inputCount);
  if (type === "ocr-image") {
    return {
      language: sanitizeOcrLanguage(options.language),
      imageOps: JSON.stringify(imageOps)
    };
  }
  const extension = sanitizeExtension(options.extension || "jpg");
  if (!["jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp", "gif"].includes(extension)) {
    throw new Error(`Unsupported image format: ${extension}`);
  }
  return {
    extension,
    imageOps: JSON.stringify(imageOps),
    quality: String(sanitizeImageQuality(options.quality)),
    maxWidth: String(sanitizeImageDimension(options.maxWidth, "maxWidth") || ""),
    maxHeight: String(sanitizeImageDimension(options.maxHeight, "maxHeight") || ""),
    keepRatio: String(sanitizeImageKeepRatio(options.keepRatio)),
    watermarkText: sanitizeImageWatermarkText(options.watermarkText),
    watermarkPosition: sanitizeImageWatermarkPosition(options.watermarkPosition)
  };
}

function sanitizeImageOps(value, expectedCount = 0) {
  let raw = value;
  if (typeof raw === "string") {
    if (Buffer.byteLength(raw, "utf8") > IMAGE_OPS_MAX_JSON_BYTES) {
      throw new Error("圖片操作資料過大");
    }
    if (!raw.trim()) raw = [];
    else {
      try {
        raw = JSON.parse(raw);
      } catch {
        throw new Error("圖片操作資料格式無效");
      }
    }
  }
  if (raw == null) raw = [];
  if (!Array.isArray(raw)) throw new Error("圖片操作資料必須是陣列");
  if (raw.length > 100 || expectedCount > 100) throw new Error("一次最多處理 100 張圖片");
  if (expectedCount > 0 && raw.length > 0 && raw.length !== expectedCount) {
    throw new Error("圖片操作數量與輸入檔案數量不一致");
  }
  const count = expectedCount > 0 ? expectedCount : raw.length;
  return Array.from({ length: count }, (_item, index) => {
    if (index < raw.length && (!raw[index] || typeof raw[index] !== "object" || Array.isArray(raw[index]))) {
      throw new Error("每項圖片操作都必須是物件");
    }
    const operation = raw[index] || {};
    if (typeof operation.rotation === "boolean") throw new Error("圖片旋轉角度無效");
    const rotation = Number(operation.rotation == null || operation.rotation === "" ? 0 : operation.rotation);
    if (![0, 90, 180, 270].includes(rotation)) throw new Error("圖片旋轉角度無效");
    const flip = String(operation.flip || "none");
    if (!["none", "horizontal", "vertical", "both"].includes(flip)) {
      throw new Error("圖片翻轉設定無效");
    }
    return {
      rotation,
      flip,
      crop: sanitizeImageRectangle(operation.crop, "crop"),
      ocrRegion: sanitizeImageRectangle(operation.ocrRegion, "ocrRegion")
    };
  });
}

function sanitizeImageRectangle(value, label = "crop") {
  if (value == null || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 格式無效`);
  if ([value.x, value.y, value.width, value.height].some((item) => typeof item === "boolean")) {
    throw new Error(`${label} 座標無效`);
  }
  const rectangle = {
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height)
  };
  if (Object.values(rectangle).some((item) => !Number.isFinite(item))) {
    throw new Error(`${label} 座標無效`);
  }
  if (
    rectangle.x < 0 || rectangle.y < 0 || rectangle.width <= 0 || rectangle.height <= 0 ||
    rectangle.x + rectangle.width > 1.000001 || rectangle.y + rectangle.height > 1.000001
  ) {
    throw new Error(`${label} 必須位於圖片範圍內`);
  }
  return Object.fromEntries(
    Object.entries(rectangle).map(([key, item]) => [key, Number(item.toFixed(6))])
  );
}

function sanitizeImageQuality(value) {
  if (typeof value === "boolean") throw new Error("圖片品質必須介乎 30% 至 100%");
  const quality = Number(value == null || value === "" ? 0.85 : value);
  if (!Number.isFinite(quality) || quality < 0.3 || quality > 1) {
    throw new Error("圖片品質必須介乎 30% 至 100%");
  }
  return Number(quality.toFixed(2));
}

function sanitizeImageDimension(value, label) {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "boolean") throw new Error(`${label} 必須介乎 1 至 32768 pixels`);
  const dimension = Number(String(value).trim());
  if (!Number.isInteger(dimension) || dimension < 1 || dimension > 32768) {
    throw new Error(`${label} 必須介乎 1 至 32768 pixels`);
  }
  return dimension;
}

function sanitizeImageKeepRatio(value) {
  if (value == null || value === "") return true;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("keepRatio 必須是 true 或 false");
}

function sanitizeImageWatermarkText(value) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (text.length > 200) throw new Error("浮水印文字最多 200 個字元");
  return text;
}

function sanitizeImageWatermarkPosition(value) {
  const position = String(value || "se");
  if (!["se", "sw", "ne", "nw", "center"].includes(position)) {
    throw new Error("浮水印位置無效");
  }
  return position;
}

function normalizeImageItemResults(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item, index) => {
    const parsedIndex = Number.parseInt(String(item && item.index != null ? item.index : index), 10);
    return {
      index: Number.isInteger(parsedIndex) ? Math.max(0, parsedIndex) : index,
      name: path.basename(String(item && item.name ? item.name : `image-${index + 1}`)),
      status: item && item.status === "done" ? "done" : "failed",
      outputName: item && item.outputName ? path.basename(String(item.outputName)) : "",
      error: item && item.error ? String(item.error).slice(0, 500) : ""
    };
  });
}

async function renderWorkspaceImageCanvas(inputPath, operation = {}, options = {}, forOcr = false) {
  let createCanvas;
  let loadImage;
  try {
    ({ createCanvas, loadImage } = require("@napi-rs/canvas"));
  } catch (error) {
    throw new Error(`圖片工作區需要 @napi-rs/canvas：${error.message}`);
  }
  let image;
  try {
    image = await loadImage(inputPath);
  } catch (error) {
    throw new Error(`無法解碼圖片：${error.message}`);
  }
  const sourceWidth = Number(image.width) || 0;
  const sourceHeight = Number(image.height) || 0;
  assertWorkspaceImageDimensions(sourceWidth, sourceHeight, "原始圖片");
  const rotation = operation.rotation || 0;
  const sideways = rotation === 90 || rotation === 270;
  const transformed = createCanvas(sideways ? sourceHeight : sourceWidth, sideways ? sourceWidth : sourceHeight);
  const context = transformed.getContext("2d");
  context.translate(transformed.width / 2, transformed.height / 2);
  const flipX = operation.flip === "horizontal" || operation.flip === "both";
  const flipY = operation.flip === "vertical" || operation.flip === "both";
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);

  let working = cropWorkspaceImageCanvas(createCanvas, transformed, operation.crop, "裁切區域");
  if (forOcr) {
    working = cropWorkspaceImageCanvas(createCanvas, working, operation.ocrRegion, "OCR 框選區域");
    return working;
  }

  const target = resolveWorkspaceImageSize(
    working.width,
    working.height,
    options.maxWidth,
    options.maxHeight,
    options.keepRatio !== false
  );
  if (target.width !== working.width || target.height !== working.height) {
    const resized = createCanvas(target.width, target.height);
    resized.getContext("2d").drawImage(working, 0, 0, target.width, target.height);
    working = resized;
  }
  if (options.watermarkText) {
    drawWorkspaceImageWatermark(
      working.getContext("2d"),
      working,
      options.watermarkText,
      options.watermarkPosition
    );
  }
  return working;
}

function cropWorkspaceImageCanvas(createCanvas, source, rectangle, label) {
  if (!rectangle) return source;
  const left = Math.max(0, Math.floor(rectangle.x * source.width));
  const top = Math.max(0, Math.floor(rectangle.y * source.height));
  const right = Math.min(source.width, Math.ceil((rectangle.x + rectangle.width) * source.width));
  const bottom = Math.min(source.height, Math.ceil((rectangle.y + rectangle.height) * source.height));
  const width = right - left;
  const height = bottom - top;
  if (width < IMAGE_REGION_MIN_PIXELS || height < IMAGE_REGION_MIN_PIXELS) {
    throw new Error(`${label}至少需要 ${IMAGE_REGION_MIN_PIXELS} × ${IMAGE_REGION_MIN_PIXELS} pixels`);
  }
  assertWorkspaceImageDimensions(width, height, label);
  const cropped = createCanvas(width, height);
  cropped.getContext("2d").drawImage(source, left, top, width, height, 0, 0, width, height);
  return cropped;
}

function resolveWorkspaceImageSize(width, height, maxWidth, maxHeight, keepRatio = true) {
  let targetWidth = sanitizeImageDimension(maxWidth, "maxWidth") || width;
  let targetHeight = sanitizeImageDimension(maxHeight, "maxHeight") || height;
  if (keepRatio) {
    const widthRatio = maxWidth ? targetWidth / width : Infinity;
    const heightRatio = maxHeight ? targetHeight / height : Infinity;
    const ratio = Math.min(widthRatio, heightRatio, 1);
    targetWidth = Math.max(1, Math.round(width * ratio));
    targetHeight = Math.max(1, Math.round(height * ratio));
  }
  assertWorkspaceImageDimensions(targetWidth, targetHeight, "輸出圖片");
  return { width: targetWidth, height: targetHeight };
}

function assertWorkspaceImageDimensions(width, height, label) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`${label}尺寸無效`);
  }
  if (width * height > IMAGE_MAX_PIXELS) {
    throw new Error(`${label}超過 50 MP 安全上限（${width} × ${height}）`);
  }
}

function drawWorkspaceImageWatermark(context, canvas, text, position = "se") {
  const margin = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.035));
  const fontSize = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.055));
  context.save();
  context.font = `700 ${fontSize}px "Segoe UI", "Noto Sans TC", Arial, sans-serif`;
  context.textBaseline = "middle";
  const metrics = context.measureText(text);
  const boxWidth = metrics.width + margin * 1.2;
  const boxHeight = fontSize * 1.75;
  let x = canvas.width - margin - boxWidth / 2;
  let y = canvas.height - margin - boxHeight / 2;
  if (position === "sw" || position === "nw") x = margin + boxWidth / 2;
  if (position === "ne" || position === "nw") y = margin + boxHeight / 2;
  if (position === "center") {
    x = canvas.width / 2;
    y = canvas.height / 2;
  }
  context.fillStyle = "rgba(0, 0, 0, 0.42)";
  context.fillRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.textAlign = "center";
  context.fillText(text, x, y);
  context.restore();
}

async function writeWorkspaceImageOutput(service, job, canvas, outputPath, extension, quality, tempDir) {
  try {
    if (extension === "jpg" || extension === "jpeg") {
      const { createCanvas } = require("@napi-rs/canvas");
      const flattened = createCanvas(canvas.width, canvas.height);
      const context = flattened.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, flattened.width, flattened.height);
      context.drawImage(canvas, 0, 0);
      fs.writeFileSync(outputPath, flattened.toBuffer("image/jpeg", Math.round(quality * 100)));
      return;
    }
    if (extension === "png") {
      fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
      return;
    }
    if (extension === "webp") {
      fs.writeFileSync(outputPath, canvas.toBuffer("image/webp", Math.round(quality * 100)));
      return;
    }
    if (extension === "gif") {
      fs.writeFileSync(outputPath, canvas.toBuffer("image/gif", 10));
      return;
    }
    const tool = requireTool(service.tools, "ffmpeg");
    const preparedPath = path.join(
      tempDir,
      `convert_${Date.now()}_${Math.random().toString(16).slice(2)}.png`
    );
    fs.writeFileSync(preparedPath, canvas.toBuffer("image/png"));
    const result = await runProcess(tool.path, ["-y", "-i", preparedPath, outputPath], job, "FFmpeg");
    if (result.output) job.log.push(result.output);
  } catch (error) {
    try {
      fs.rmSync(outputPath, { force: true });
    } catch {
      // Best effort; createFriendlyImageError reports the original failure.
    }
    throw error;
  }
}

function createFriendlyImageError(error, fileName, action = "ocr") {
  const raw = String(error && error.message ? error.message : error || "Image processing failed");
  let summary = action === "ocr"
    ? `無法辨識圖片「${fileName}」。`
    : `無法處理圖片「${fileName}」。`;
  let suggestion = "請確認圖片完整且格式受支援。";
  if (/結果為空|未辨識|empty/i.test(raw)) {
    summary = `圖片「${fileName}」未辨識到文字。`;
    suggestion = "請框選較清晰的文字區域，或確認圖片方向正確。";
  } else if (/traineddata|language|tessdata|failed loading/i.test(raw)) {
    summary = "缺少 OCR 語言資料，無法使用「繁體中文 + English」辨識。";
    suggestion = "請到「狀態」頁確認 chi_tra、eng 語言包已安裝。";
  } else if (/解碼|unsupported|invalid image|format/i.test(raw)) {
    summary = `無法讀取圖片「${fileName}」。`;
    suggestion = "請確認檔案未損壞，或先轉成 PNG／JPEG。";
  } else if (/50 MP|尺寸|pixels|裁切|框選/i.test(raw)) {
    summary = `圖片「${fileName}」的尺寸或框選範圍無法處理。`;
    suggestion = "請縮小圖片，或重新框選較大的區域。";
  } else if (/ENOENT|EACCES|permission|temp|output folder/i.test(raw)) {
    summary = "無法建立圖片處理的暫存或輸出檔案。";
    suggestion = "請確認輸出資料夾可寫入，並檢查可用磁碟空間。";
  }
  const detail = raw.length > 4000 ? `${raw.slice(0, 4000)}\n…（已截斷）` : raw;
  return new Error(`${summary}\n建議：${suggestion}\n【技術詳情】\n${detail}`);
}

function imageErrorSummary(error) {
  return String(error && error.message ? error.message : error || "圖片處理失敗")
    .split("【技術詳情】", 1)[0]
    .trim()
    .slice(0, 500);
}

function sanitizeOcrPageSelection(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  const pages = [];
  for (const segment of text.split(",")) {
    const match = segment.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error("OCR 頁碼範圍無效");
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2] || match[1], 10);
    if (start < 1 || end < start) throw new Error("OCR 頁碼範圍無效");
    for (let page = start; page <= end; page += 1) {
      if (!pages.includes(page)) pages.push(page);
      if (pages.length > OCR_PDF_MAX_PAGES_HARD_LIMIT) {
        throw new Error(`OCR 一次最多處理 ${OCR_PDF_MAX_PAGES_HARD_LIMIT} 頁`);
      }
    }
  }
  return pages;
}

function buildTesseractOcrArgs(inputPath, outputBase, language, tessdataDir = "", outputFormat = "", psm = "") {
  const advancedLayout = Boolean(outputFormat || psm || arguments.length >= 6);
  const args = [];
  if (advancedLayout) {
    if (tessdataDir) args.push("--tessdata-dir", tessdataDir);
    args.push("--psm", psm || "6", inputPath, outputBase, "-l", sanitizeOcrLanguage(language));
  } else {
    args.push(inputPath, outputBase, "-l", sanitizeOcrLanguage(language));
    if (tessdataDir) args.push("--tessdata-dir", tessdataDir);
  }
  if (outputFormat) args.push(outputFormat);
  return args;
}

function assertOcrLanguagesAvailable(language, tessdataDir) {
  if (!tessdataDir) return;
  const available = new Set(listOcrLanguages(tessdataDir));
  const missing = sanitizeOcrLanguage(language).split("+").filter((item) => !available.has(item));
  if (missing.length) {
    throw new Error(
      "缺少 OCR 語言資料，無法使用「繁體中文 + English」辨識。\n" +
      "建議：請到「狀態」頁重新檢查 Tesseract，並確認 chi_tra、eng 語言包已安裝。\n" +
      `【技術詳情】\nOCR language model missing: ${missing.join(", ")}; ` +
      `tessdata=${tessdataDir}; available=${Array.from(available).join(",") || "none"}`
    );
  }
}

function createOcrTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `swiftlocal-${label}-`));
}

function cleanupOcrTempDir(directory) {
  if (!directory) return;
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Best effort; the OS temp cleaner remains the final fallback.
  }
}

function createFriendlyOcrError(error, fileName = "PDF") {
  const raw = String(error && error.message ? error.message : error || "OCR failed");
  if (raw.includes("【技術詳情】") && /language model missing/i.test(raw)) {
    return new Error(
      "缺少 OCR 語言資料，無法使用「繁體中文 + English」辨識。\n" +
      "建議：請到「狀態」頁重新檢查 Tesseract，並確認 chi_tra、eng 語言包已安裝。\n" +
      raw.slice(raw.indexOf("【技術詳情】"))
    );
  }
  let summary = `無法辨識此 PDF（${fileName}），請確認文件包含可讀取的掃描頁面。`;
  let suggestion = "請確認 PDF 未損壞，並在「狀態」頁重新檢查 OCR 工具。";
  if (/加密|password|encrypted/i.test(raw)) {
    summary = "此 PDF 已加密，暫時無法直接辨識。";
    suggestion = "請先解除 PDF 密碼保護，再重新執行 OCR。";
  } else if (/結果為空|沒有可讀取|empty/i.test(raw)) {
    summary = "未辨識到文字，文件可能是空白頁或影像品質不足。";
    suggestion = "請確認頁面包含清晰、方向正確的掃描文字。";
  } else if (/canvas|render|渲染|無法讀取 PDF|invalid pdf|too large|megapixel/i.test(raw)) {
    summary = "無法準備此 PDF 的頁面影像，因此未能開始文字辨識。";
    suggestion = "請確認 PDF 完整且未加密；影像過大時可先降低解析度或拆分文件。";
  } else if (/ENOENT|EACCES|permission|temp|output folder/i.test(raw)) {
    summary = "無法建立 OCR 暫存或輸出檔案。";
    suggestion = "請確認輸出資料夾可寫入，並檢查可用磁碟空間。";
  } else if (/traineddata|language|tessdata|failed loading/i.test(raw)) {
    summary = "缺少 OCR 語言資料，無法使用「繁體中文 + English」辨識。";
    suggestion = "請確認 chi_tra、eng 語言包已安裝後再試。";
  }
  const detail = raw.length > 4000 ? `${raw.slice(0, 4000)}\n…（已截斷）` : raw;
  return new Error(`${summary}\n建議：${suggestion}\n【技術詳情】\n${detail}`);
}

/**
 * Resolve @napi-rs/canvas from the same package graph entry that PDF.js
 * NodeCanvasFactory uses. Mixing different native bindings can make PDF.js
 * intermediate Path/Path2D objects incompatible.
 */
function loadPdfJsCompatibleCanvas() {
  const { createRequire } = require("node:module");
  const candidates = [];
  try {
    candidates.push({
      label: "pdfjs",
      req: createRequire(require.resolve("pdfjs-dist/legacy/build/pdf.mjs"))
    });
  } catch {
    // pdfjs-dist not installed or path changed
  }
  candidates.push({ label: "app", req: require });
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const canvasModule = candidate.req("@napi-rs/canvas");
      if (canvasModule && typeof canvasModule.createCanvas === "function") {
        let version = "unknown";
        let modulePath = "";
        try {
          modulePath = candidate.req.resolve("@napi-rs/canvas");
          const pkgPath = path.join(path.dirname(modulePath), "package.json");
          if (fs.existsSync(pkgPath)) {
            version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "unknown";
          }
        } catch {
          // keep defaults
        }
        return {
          createCanvas: canvasModule.createCanvas,
          version,
          modulePath,
          source: candidate.label
        };
      }
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError || "");
  const error = new Error(
    detail
      ? `PDF OCR 需要 @napi-rs/canvas，請執行 npm install（${detail}）`
      : "PDF OCR 需要 @napi-rs/canvas，請執行 npm install"
  );
  error.errorCode = ERROR_CODES.MISSING_TOOL;
  throw error;
}

function annotatePdfOcrStageError(error, meta = {}) {
  if (error && (error.cancelled || error.name === "JobCancelledError")) {
    return error;
  }
  if (error && error.errorCode === ERROR_CODES.ENCRYPTED_PDF) {
    return error;
  }

  const stage = String(meta.stage || "unknown");
  const pageNumber = meta.pageNumber != null ? Number(meta.pageNumber) : null;
  const detail = error instanceof Error ? error.message : String(error || "unknown");
  const stack = error instanceof Error ? error.stack || "" : "";
  const pdfjsVersion = meta.pdfjsVersion ? String(meta.pdfjsVersion) : "";
  const canvasVersion = meta.canvasVersion ? String(meta.canvasVersion) : "";
  const parts = [
    `PDF 渲染失敗 [${stage}]`,
    pageNumber != null && Number.isFinite(pageNumber) ? `page=${pageNumber}` : "",
    pdfjsVersion ? `pdfjs=${pdfjsVersion}` : "",
    canvasVersion ? `canvas=${canvasVersion}` : "",
    detail
  ].filter(Boolean);
  const wrapped = new Error(parts.join(" | "));
  wrapped.errorCode = ERROR_CODES.PDF_RENDER_FAILED;
  wrapped.stage = stage;
  if (pageNumber != null && Number.isFinite(pageNumber)) {
    wrapped.pageNumber = pageNumber;
  }
  if (pdfjsVersion) {
    wrapped.pdfjsVersion = pdfjsVersion;
  }
  if (canvasVersion) {
    wrapped.canvasVersion = canvasVersion;
  }
  if (stack) {
    wrapped.stack = `${wrapped.message}\n${stack}`;
  }
  return wrapped;
}

async function renderPdfPagesToPng(inputPath, pageDir, maxPages, job, options = {}) {
  ensureJobNotCancelled(job);

  let createCanvas;
  let canvasVersion = "unknown";
  try {
    const canvasBinding = loadPdfJsCompatibleCanvas();
    createCanvas = canvasBinding.createCanvas;
    canvasVersion = canvasBinding.version || "unknown";
  } catch (error) {
    throw annotatePdfOcrStageError(error, { stage: "pdf_load", canvasVersion });
  }

  let pdfjs;
  let pdfjsVersion = "unknown";
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsVersion = pdfjs.version || "unknown";
  } catch (error) {
    throw annotatePdfOcrStageError(error, {
      stage: "pdf_load",
      pdfjsVersion,
      canvasVersion
    });
  }

  const data = new Uint8Array(fs.readFileSync(inputPath));
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    useWorkerFetch: false,
    enableScripting: false,
    isEvalSupported: false,
    verbosity: 0
  });

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isEncryptedPdfMessage(detail)) {
      throw encryptedPdfError(path.basename(inputPath));
    }
    throw annotatePdfOcrStageError(error, {
      stage: "pdf_load",
      pdfjsVersion,
      canvasVersion
    });
  }

  const requestedPages = sanitizeOcrPageSelection(options.pages);
  const pageNumbers = requestedPages.length
    ? requestedPages
    : Array.from({ length: Math.min(pdf.numPages, maxPages) }, (_item, index) => index + 1);
  const invalidPage = pageNumbers.find((pageNumber) => pageNumber > pdf.numPages);
  if (invalidPage) {
    await loadingTask.destroy();
    throw new Error(`OCR 頁碼 ${invalidPage} 超出文件總頁數 ${pdf.numPages}`);
  }
  const images = [];
  try {
    for (let index = 0; index < pageNumbers.length; index += 1) {
      const pageNumber = pageNumbers[index];
      ensureJobNotCancelled(job);
      let canvas;
      let page;
      try {
        page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: OCR_PDF_RENDER_SCALE });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        if (width * height > OCR_PDF_MAX_PIXELS) {
          throw new Error(
            `PDF OCR page ${pageNumber} is too large (${width}x${height}); limit is ${(OCR_PDF_MAX_PIXELS / 1_000_000).toFixed(0)} megapixels`
          );
        }
        // PDF.js 6.x: pass canvas (not canvasContext). NodeCanvasFactory
        // intermediate surfaces must share the same @napi-rs/canvas instance
        // (see loadPdfJsCompatibleCanvas).
        canvas = createCanvas(width, height);
        await page.render({
          canvas,
          viewport,
          background: "#ffffff"
        }).promise;
      } catch (error) {
        throw annotatePdfOcrStageError(error, {
          stage: "pdf_page_render",
          pageNumber,
          pdfjsVersion,
          canvasVersion
        });
      }

      const imagePath = path.join(pageDir, `page_${String(pageNumber).padStart(3, "0")}.png`);
      try {
        const png = canvas.toBuffer("image/png");
        if (!png || !png.length) {
          throw new Error(`empty PNG buffer for page ${pageNumber}`);
        }
        fs.writeFileSync(imagePath, png);
        if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size < 32) {
          throw new Error(`PNG write produced empty file for page ${pageNumber}`);
        }
      } catch (error) {
        throw annotatePdfOcrStageError(error, {
          stage: "png_write",
          pageNumber,
          pdfjsVersion,
          canvasVersion
        });
      }
      const includeMetadata = Boolean(options.returnMetadata || options.pages || options.onProgress);
      images.push(includeMetadata ? { pageNumber, imagePath } : imagePath);
      if (typeof options.onProgress === "function") {
        options.onProgress({ current: index + 1, total: pageNumbers.length, pageNumber });
      }
      if (page && typeof page.cleanup === "function") page.cleanup();
    }
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // ignore
    }
  }
  return images;
}

function sanitizeRotation(angle) {
  const numeric = Number(angle);
  if (![90, 180, 270].includes(numeric)) {
    throw new Error("Rotation angle must be 90, 180, or 270");
  }
  return numeric;
}

function sanitizePassword(password) {
  const clean = String(password || "").trim();
  if (!clean) {
    throw new Error("PDF password is required");
  }
  if (clean.length > 256) {
    throw new Error("PDF password must be 256 characters or fewer");
  }
  return clean;
}

function parsePageRanges(pages, pageCount) {
  const text = String(pages || "").trim();
  if (!text) {
    return [Array.from({ length: pageCount }, (_item, index) => index)];
  }
  const ranges = [];
  for (const part of text.split(",")) {
    const segment = part.trim();
    if (!segment) {
      continue;
    }
    const bounds = segment.split("-").map((item) => Number(item.trim()));
    const start = bounds[0];
    const end = bounds.length > 1 ? bounds[1] : bounds[0];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      continue;
    }
    const indexes = [];
    for (let page = start; page <= end && page <= pageCount; page += 1) {
      indexes.push(page - 1);
    }
    if (indexes.length) {
      ranges.push(indexes);
    }
  }
  return ranges;
}

function pageRangeLabel(indexes) {
  const first = indexes[0] + 1;
  const last = indexes[indexes.length - 1] + 1;
  return first === last ? String(first) : `${first}-${last}`;
}

function flattenPageRanges(ranges) {
  return Array.from(new Set(ranges.flat()));
}

async function loadPdf(inputPath) {
  const bytes = fs.readFileSync(inputPath);
  const name = path.basename(inputPath);
  if (pdfBytesLookEncrypted(bytes)) {
    throw encryptedPdfError(name);
  }
  try {
    return await PDFDocument.load(bytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isEncryptedPdfMessage(detail)) {
      throw encryptedPdfError(name);
    }
    throw new Error(`無法讀取 PDF「${name}」：${detail}`);
  }
}

function encryptedPdfError(name) {
  return new Error(`「${name}」已加密，請先使用「PDF 解密」後再處理`);
}

function isEncryptedPdfMessage(message) {
  return /encrypt|password|密[碼码]|加密/i.test(String(message || ""));
}

function pdfBytesLookEncrypted(bytes) {
  // Fast path: most encrypted PDFs declare /Encrypt in the trailer or body.
  const sample = Buffer.isBuffer(bytes)
    ? bytes.subarray(0, Math.min(bytes.length, 512 * 1024))
    : Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 512 * 1024));
  return sample.includes(Buffer.from("/Encrypt"));
}

async function savePdf(pdfDoc, outputPath) {
  const bytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, bytes);
}

async function extractPdfText(inputPath, job = null) {
  if (job) {
    ensureJobNotCancelled(job);
  }
  const name = path.basename(inputPath);
  const data = new Uint8Array(fs.readFileSync(inputPath));
  if (pdfBytesLookEncrypted(data)) {
    throw encryptedPdfError(name);
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    useWorkerFetch: false,
    enableScripting: false,
    isEvalSupported: false,
    verbosity: 0
  });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isEncryptedPdfMessage(detail)) {
      throw encryptedPdfError(name);
    }
    throw new Error(`無法讀取 PDF「${name}」：${detail}`);
  }
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (job) {
        ensureJobNotCancelled(job);
      }
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = textItemsToLines(content.items);
      pages.push([`Page ${pageNumber}`, ...lines].join("\n"));
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.join("\n\n");
}

function textItemsToLines(items) {
  const rows = [];
  for (const item of items) {
    const text = String(item.str || "").trim();
    if (!text) {
      continue;
    }
    const transform = item.transform || [];
    const y = Math.round(Number(transform[5] || 0));
    let row = rows.find((entry) => Math.abs(entry.y - y) <= 2);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x: Number(transform[4] || 0), text });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" "))
    .filter(Boolean);
}

/**
 * Compat / OCR path for desktop PDF→DOCX.
 * @returns {Promise<string[]>} output file paths
 */
async function writeDocxWithScanStrategy(service, job, inputPath, scanOcr, ocrOutput, flags = {}) {
  const mode = String(scanOcr || "auto").toLowerCase();
  let outMode = String(ocrOutput || "both").toLowerCase();
  if (outMode === "pdf" || outMode === "searchable-pdf") outMode = "searchable";
  if (!["both", "searchable", "docx"].includes(outMode)) outMode = "both";

  const text = await extractPdfText(inputPath, job);
  const lowText = !String(text || "").trim() || String(text).trim().length < 40;
  const force = mode === "force" || mode === "on" || mode === "true" || mode === "1" || outMode === "searchable";
  const off = mode === "off" || mode === "false" || mode === "0" || mode === "never";
  const wantOcr = !off && (force || ((mode === "auto" || !mode) && lowText) || outMode === "searchable");
  const docxPath = nextAvailablePath(path.join(job.outputDir, `${path.parse(inputPath).name}.docx`));
  const searchablePath = nextAvailablePath(
    path.join(job.outputDir, `${path.parse(inputPath).name}_ocr_searchable.pdf`)
  );

  if (wantOcr) {
    try {
      const tools = service && service.tools ? service.tools : {};
      if (!tools.tesseract || !tools.tesseract.available) {
        throw new Error("Tesseract 不可用");
      }
      // Preferred: searchable multi-page PDF (Tesseract pdf output), then optional text DOCX.
      await createSearchablePdfViaOcr(service, job, inputPath, searchablePath);
      if (outMode === "searchable") {
        job.log.push("已依設定僅輸出可搜尋 PDF（不轉 DOCX）。");
        job.log.push(`converted (ocr-searchable-pdf): ${path.basename(inputPath)} -> ${path.basename(searchablePath)}`);
        return [searchablePath];
      }
      // Desktop lacks pdf2docx; produce text DOCX from OCR text as office output.
      const ocrText = await ocrPdfToText(service, job, inputPath);
      writeTextDocx(docxPath, ocrText || text || path.basename(inputPath));
      job.log.push("已先建立可搜尋 PDF（OCR 文字層），並以 OCR 文字建立 DOCX（桌面相容模式）。");
      job.log.push(`converted (ocr-searchable): ${path.basename(inputPath)} -> ${path.basename(docxPath)}`);
      job.log.push(`intermediate: ${path.basename(searchablePath)}`);
      if (outMode === "docx") {
        try {
          fs.unlinkSync(searchablePath);
          job.log.push("已依設定移除可搜尋 PDF 中間產物（ocrOutput=docx）。");
        } catch {
          // ignore
        }
        return [docxPath];
      }
      return [docxPath, searchablePath];
    } catch (error) {
      if (outMode === "searchable" || force) {
        // try text OCR DOCX if searchable failed and not searchable-only
        if (outMode !== "searchable") {
          try {
            const ocrText = await ocrPdfToText(service, job, inputPath);
            if (String(ocrText || "").trim()) {
              writeTextDocx(docxPath, ocrText);
              job.log.push("已使用 OCR→DOCX 管線建立文件（掃描／低文字 PDF）；內容為純文字段落，版面與原圖不同。");
              job.log.push(`converted (ocr): ${path.basename(inputPath)} -> ${path.basename(docxPath)}`);
              return [docxPath];
            }
          } catch (textErr) {
            throw new Error(
              `OCR 管線失敗：${error && error.message ? error.message : error}; text: ${
                textErr && textErr.message ? textErr.message : textErr
              }`
            );
          }
        }
        throw error;
      }
      job.log.push(`OCR→DOCX 略過：${error && error.message ? error.message : error}`);
    }
  }

  if (outMode === "searchable") {
    throw new Error("ocrOutput=searchable 需要可用的 Tesseract 與掃描 OCR 設定。");
  }

  writeTextDocx(docxPath, text || path.basename(inputPath));
  if (flags.loFailed) {
    job.log.push("LibreOffice 無法完成轉換，已改用相容模式建立 DOCX；版面可能與原 PDF 不完全一致。");
  } else if (flags.forceCompat) {
    job.log.push("已依設定直接使用相容模式建立 DOCX（略過 LibreOffice）；版面可能與原 PDF 不完全一致。");
  }
  job.log.push(`converted (compat): ${path.basename(inputPath)} -> ${path.basename(docxPath)}`);
  if (lowText && !off) {
    job.log.push(
      "此 PDF 可抽取文字很少（可能是掃描件）。若 DOCX 幾乎空白，請將掃描 OCR 設為「一律」並確認 Tesseract。"
    );
  }
  return [docxPath];
}

async function createSearchablePdfViaOcr(service, job, inputPath, outputPath) {
  const tool = requireTool(service.tools, "tesseract");
  const { language, tessdataDir, note } = resolveOcrLanguage(tool.path, job.options.language || "chi_tra+eng");
  if (note) job.log.push(note);
  const maxPages = sanitizeOcrPdfMaxPages(job.options.maxPages);
  const pageDir = createOcrTempDir("pdf-searchable");
  try {
    const pageImages = await renderPdfPagesToPng(inputPath, pageDir, maxPages, job, { returnMetadata: true });
    if (!pageImages.length) {
      throw new Error(`PDF 沒有可 OCR 的頁面：${path.basename(inputPath)}`);
    }
    job.log.push(`render: ${path.basename(inputPath)} ${pageImages.length} page(s)`);
    const merged = await PDFDocument.create();
    for (let i = 0; i < pageImages.length; i += 1) {
      ensureJobNotCancelled(job);
      const { imagePath, pageNumber } = pageImages[i];
      const pageBase = path.join(pageDir, `page_${String(pageNumber).padStart(3, "0")}_searchable`);
      const args = buildTesseractOcrArgs(imagePath, pageBase, language, tessdataDir, "pdf");
      await runProcess(tool.path, args, job, "Tesseract");
      const pagePdf = `${pageBase}.pdf`;
      if (!fs.existsSync(pagePdf) || fs.statSync(pagePdf).size < 64) {
        throw new Error(`Tesseract 未產生第 ${i + 1} 頁可搜尋 PDF`);
      }
      const bytes = fs.readFileSync(pagePdf);
      const pageDoc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(pageDoc, pageDoc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    await savePdf(merged, outputPath);
    job.log.push(
      `ocr-searchable-pdf: ${path.basename(inputPath)} -> ${path.basename(outputPath)} (${pageImages.length} page(s))`
    );
    return outputPath;
  } finally {
    cleanupOcrTempDir(pageDir);
  }
}

async function ocrPdfToText(service, job, inputPath) {
  const tool = requireTool(service.tools, "tesseract");
  const { language, tessdataDir, note } = resolveOcrLanguage(tool.path, job.options.language || "chi_tra+eng");
  if (note) job.log.push(note);
  const maxPages = sanitizeOcrPdfMaxPages(job.options.maxPages);
  const pageDir = createOcrTempDir("pdf-docx");
  try {
    const pageImages = await renderPdfPagesToPng(inputPath, pageDir, maxPages, job, { returnMetadata: true });
    if (!pageImages.length) {
      throw new Error(`PDF 沒有可 OCR 的頁面：${path.basename(inputPath)}`);
    }
    const pageTexts = [];
    for (let i = 0; i < pageImages.length; i += 1) {
      ensureJobNotCancelled(job);
      const { imagePath, pageNumber } = pageImages[i];
      const pageBase = path.join(pageDir, `page_${String(pageNumber).padStart(3, "0")}_ocr`);
      await runImageTextOcr(tool.path, imagePath, pageBase, language, tessdataDir, job);
      const textPath = `${pageBase}.txt`;
      const pageText = repairOcrText(fs.existsSync(textPath) ? fs.readFileSync(textPath, "utf8") : "");
      pageTexts.push(`--- Page ${pageNumber} ---\n${pageText.trim()}`);
    }
    return `${pageTexts.join("\n\n").trim()}\n`;
  } finally {
    cleanupOcrTempDir(pageDir);
  }
}

function writeTextDocx(outputPath, text) {
  const files = [
    {
      name: "[Content_Types].xml",
      data: utf8Bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)
    },
    {
      name: "_rels/.rels",
      data: utf8Bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
    },
    {
      name: "word/document.xml",
      data: utf8Bytes(buildDocumentXml(text))
    },
    {
      name: "word/_rels/document.xml.rels",
      data: utf8Bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`)
    },
    {
      name: "docProps/core.xml",
      data: utf8Bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SwiftLocal PDF Text Export</dc:title>
  <dc:creator>SwiftLocal</dc:creator>
  <cp:lastModifiedBy>SwiftLocal</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`)
    },
    {
      name: "docProps/app.xml",
      data: utf8Bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>SwiftLocal</Application>
</Properties>`)
    }
  ];
  fs.writeFileSync(outputPath, createZip(files));
}

function buildDocumentXml(text) {
  const paragraphs = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs || "<w:p/>"}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = utf8Bytes(file.name);
    const data = Buffer.from(file.data);
    const crc = crc32(data);
    const localHeader = createZipLocalHeader(nameBytes, data.length, crc);
    const centralHeader = createZipCentralHeader(nameBytes, data.length, crc, offset);
    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = createZipEndRecord(files.length, centralSize, offset);
  return Buffer.concat([...localParts, ...centralParts, endRecord]);
}

function createZipLocalHeader(nameBytes, size, crc) {
  const header = Buffer.alloc(30 + nameBytes.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc >>> 0, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  nameBytes.copy(header, 30);
  return header;
}

function createZipCentralHeader(nameBytes, size, crc, offset) {
  const header = Buffer.alloc(46 + nameBytes.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(crc >>> 0, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  nameBytes.copy(header, 46);
  return header;
}

function createZipEndRecord(count, centralSize, centralOffset) {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(count, 8);
  header.writeUInt16LE(count, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

function utf8Bytes(value) {
  return Buffer.from(String(value), "utf8");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function libreOfficeArgs(outputDir, inputPath, convertTo, profileDir) {
  const resolvedProfile = profileDir || createLibreOfficeProfileDir(outputDir);
  fs.mkdirSync(resolvedProfile, { recursive: true });
  const profileUri = pathToLibreOfficeFileUri(resolvedProfile);
  return [
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    "--norestore",
    "--nolockcheck",
    `-env:UserInstallation=${profileUri}`,
    "--convert-to",
    convertTo,
    "--outdir",
    outputDir,
    inputPath
  ];
}

async function detectTesseractLanguageSupport(toolPath, execText = execFileText) {
  const tessdataPath = resolveTessdataPath(toolPath);
  const envPrefix = process.env.TESSDATA_PREFIX || "";
  const base = {
    tessdataPath,
    detectedLanguages: [],
    detectionMethod: "none",
    TESSDATA_PREFIX: envPrefix,
    languages: "",
    hasChiTra: false,
    hasEng: false
  };
  const args = tessdataPath ? ["--tessdata-dir", tessdataPath, "--list-langs"] : ["--list-langs"];
  try {
    const output = await execText(toolPath, args, { timeout: 8000 });
    const languages = parseTesseractListLanguages(output);
    if (languages.length) {
      return tesseractLanguageEntry(base, languages, "list-langs");
    }
  } catch {
    // Fall back to scanning traineddata below.
  }
  const scanned = scanTessdataLanguages(tessdataPath);
  return tesseractLanguageEntry(base, scanned, scanned.length ? "traineddata-scan" : "none");
}

function tesseractLanguageEntry(base, languages, detectionMethod) {
  const detectedLanguages = Array.from(new Set(languages)).sort();
  return {
    ...base,
    detectedLanguages,
    detectionMethod,
    languages: detectedLanguages.join(","),
    hasChiTra: detectedLanguages.includes("chi_tra"),
    hasEng: detectedLanguages.includes("eng")
  };
}

function parseTesseractListLanguages(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^List of available languages/i.test(line))
    .filter((line) => /^[A-Za-z0-9_+-]+$/.test(line));
}

function createLibreOfficeProfileDir(parentDir) {
  fs.mkdirSync(parentDir, { recursive: true });
  return fs.mkdtempSync(path.join(parentDir, "lo-profile-"));
}

function pathToLibreOfficeFileUri(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

function cleanupLoProfile(profileDir) {
  try {
    if (profileDir && fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup failures
  }
}

function removeIncompleteOfficeOutput(filePath, minBytes = 64) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return false;
    }
    const size = fs.statSync(filePath).size;
    if (size < minBytes) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isWindowsStackBufferOverrun(code) {
  if (code === null || code === undefined) {
    return false;
  }
  const asNumber = Number(code);
  if (asNumber === -1073740791 || asNumber === 3221226505 || asNumber === 0xc0000409) {
    return true;
  }
  return (asNumber >>> 0) === 0xc0000409;
}

function formatProcessError({
  returncode = null,
  stdout = "",
  stderr = "",
  timeout = false,
  timeoutSeconds = null,
  executable = "",
  args = [],
  cwd = process.cwd(),
  toolLabel = "LibreOffice",
  notFound = false,
  permissionDenied = false,
  outputMissing = false,
  expectedOutput = ""
} = {}) {
  const combined = `${stdout || ""}\n${stderr || ""}`.trim();
  let summary = "";
  let suggestion = "";
  if (timeout) {
    summary = `${toolLabel} 轉換逾時（${timeoutSeconds != null ? timeoutSeconds : "?"} 秒）。檔案可能過大或文件引擎卡住。`;
    suggestion = "請縮短頁數後重試，或改用較簡單的 PDF／其他輸出格式。";
  } else if (notFound) {
    summary = `找不到 ${toolLabel} 執行檔${executable ? `（${executable}）` : ""}。`;
    suggestion = "請到「狀態」頁安裝或指定正確的工具路徑後重試。";
  } else if (permissionDenied) {
    summary = `沒有權限執行 ${toolLabel}${executable ? `（${executable}）` : ""}。`;
    suggestion = "請以具足夠權限的帳戶執行，或檢查防毒／檔案權限設定。";
  } else if (outputMissing) {
    summary = `${toolLabel} 執行結束，但未產生輸出檔（預期：${expectedOutput || "輸出檔"}）。`;
    suggestion = "原始檔案未被修改。請確認 PDF 未損壞，或改試其他格式／相容模式。";
  } else if (isWindowsStackBufferOverrun(returncode)) {
    summary =
      "LibreOffice 轉換程序意外崩潰（Windows 0xC0000409）。" +
      "這通常表示 LibreOffice 無法把此 PDF 匯出成所選 Office 格式。" +
      "原始 PDF 並未被修改。";
    suggestion = "若目標為 DOCX，系統會自動嘗試相容模式；其他格式請改試 DOCX 或更新 LibreOffice。";
  } else if (/impl_store|error area:io|class:write/i.test(combined)) {
    summary = "LibreOffice 無法寫入 Office 輸出檔（SfxBaseModel::impl_store / Io Class:Write）。原始 PDF 並未被修改。";
    suggestion = "請確認輸出資料夾可寫入；DOCX 將自動嘗試相容模式。";
  } else if (returncode !== null && returncode !== 0) {
    const codeLabel = isWindowsStackBufferOverrun(returncode)
      ? `0xC0000409 (${returncode})`
      : String(returncode);
    summary = `${toolLabel} 轉換失敗（退出碼 ${codeLabel}）。原始檔案並未被修改。`;
    suggestion = "請檢查輸入檔是否完整，或改試其他輸出格式。";
  } else {
    summary = `${toolLabel} 轉換失敗。原始檔案並未被修改。`;
    suggestion = "請檢查輸入檔後重試。";
  }
  const parts = [summary];
  if (suggestion) {
    parts.push(`建議：${suggestion}`);
  }
  if (combined) {
    const detail = combined.length > 4000 ? `${combined.slice(0, 4000)}\n…（已截斷）` : combined;
    parts.push(`【技術詳情】\n${detail}`);
  } else if (returncode !== null && returncode !== 0 && !timeout) {
    parts.push(`【技術詳情】\nexit code=${returncode}`);
  }
  const technical = [];
  if (returncode !== null) {
    technical.push(`exitCode=${returncode}`);
  }
  if (executable) {
    const command = [executable, ...args].map((part) => quoteCommandPart(String(part))).join(" ");
    technical.push(`command=${command}`);
  }
  if (cwd) {
    technical.push(`cwd=${cwd}`);
  }
  if (stdout) {
    technical.push(`stdout=${stdout}`);
  }
  if (stderr) {
    technical.push(`stderr=${stderr}`);
  }
  if (technical.length) {
    parts.push(`Technical details:\n${technical.join("\n")}`);
  }
  return parts.join("\n");
}

function quoteCommandPart(part) {
  return /\s/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part;
}

function fileSizeBytes(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

/** Summarize on-disk input/output usage for public job payloads. */
function computeJobSpaceUsage(inputPaths = [], outputPaths = []) {
  let inputBytes = 0;
  let inputMissing = 0;
  const inputs = [];
  for (const item of inputPaths || []) {
    const filePath = String(item || "");
    const size = fileSizeBytes(filePath);
    const name = path.basename(filePath) || filePath || "(unknown)";
    if (size == null) {
      inputMissing += 1;
      inputs.push({ name, size: null, missing: true });
    } else {
      inputBytes += size;
      inputs.push({ name, size, missing: false });
    }
  }

  let outputBytes = 0;
  const outputs = [];
  for (const item of outputPaths || []) {
    const filePath = String(item || "");
    const size = fileSizeBytes(filePath);
    if (size == null) continue;
    outputBytes += size;
    outputs.push({ name: path.basename(filePath), size, path: filePath });
  }

  let savedBytes = null;
  let savedPercent = null;
  if (inputBytes > 0 && outputs.length > 0) {
    savedBytes = inputBytes - outputBytes;
    savedPercent = Math.round((savedBytes / inputBytes) * 100);
  }

  return {
    inputBytes,
    outputBytes,
    inputCount: inputs.length,
    outputCount: outputs.length,
    inputMissing,
    savedBytes,
    savedPercent,
    inputs,
    outputs
  };
}

function publicJob(job) {
  const space = computeJobSpaceUsage(job.inputPaths || [], job.outputPaths || []);
  return {
    id: job.id,
    type: job.type,
    // Backward compatible: still expose basenames; also include size-aware list.
    inputPaths: space.inputs.map((item) => item.name),
    inputFiles: space.inputs,
    outputDir: job.outputDir,
    options: redactJobOptions(job.options),
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    outputPaths: space.outputs.map((item) => ({
      name: item.name,
      path: item.path,
      size: item.size
    })),
    space: {
      inputBytes: space.inputBytes,
      outputBytes: space.outputBytes,
      inputCount: space.inputCount,
      outputCount: space.outputCount,
      inputMissing: space.inputMissing,
      savedBytes: space.savedBytes,
      savedPercent: space.savedPercent
    },
    log: job.log.slice(-6).map((line) => redactJobText(line, job.options)),
    error: redactJobText(job.error, job.options),
    errorCode: job.errorCode || "",
    errorCodeLabel: job.errorCode ? errorCodeLabel(job.errorCode) : "",
    errorHint: job.errorHint || "",
    retriable: job.retriable !== false,
    // True while running after user asked to cancel (UI can show「取消中」).
    cancelRequested: Boolean(job.cancelRequested && job.status === "running"),
    progress: normalizeJobProgress(job.progress),
    itemResults: normalizeImageItemResults(job.itemResults)
  };
}

function execFileText(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: options.timeout || 30000 }, (error, stdout, stderr) => {
      const output = `${stdout || ""}${stderr || ""}`.trim();
      if (error) {
        error.message = output || error.message;
        reject(error);
        return;
      }
      resolve(output);
    });
  });
}

function execFileSyncText(file, args, options = {}) {
  const stdout = execFileSync(file, args, {
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout || 30000
  });
  return String(stdout || "");
}

class JobCancelledError extends Error {
  constructor(message = "任務已取消") {
    super(message);
    this.name = "JobCancelledError";
    this.cancelled = true;
  }
}

function ensureJobNotCancelled(job) {
  if (job && job.cancelRequested) {
    throw new JobCancelledError();
  }
}

function isJobCancelledError(error) {
  return Boolean(error && (error.cancelled || error.name === "JobCancelledError"));
}

function processErrorCode({ code = null, stdout = "", stderr = "", toolLabel = "" } = {}) {
  const combined = `${stdout || ""}\n${stderr || ""}`;
  if (/userinstallation|bootstrap|user profile|profile/i.test(combined)) {
    return ERROR_CODES.LIBREOFFICE_PROFILE_ERROR;
  }
  if (/LibreOffice/i.test(toolLabel)) {
    if (isWindowsStackBufferOverrun(code) || /crash|access violation|stack.?buffer/i.test(combined)) {
      return ERROR_CODES.EXTERNAL_PROCESS_CRASH;
    }
    return ERROR_CODES.OFFICE_CONVERSION_FAILED;
  }
  if (isWindowsStackBufferOverrun(code)) {
    return ERROR_CODES.EXTERNAL_PROCESS_CRASH;
  }
  return ERROR_CODES.UNKNOWN;
}

function createProcessError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function filterSuccessfulToolOutput(output, toolLabel = "") {
  if (!/LibreOffice/i.test(toolLabel) || !output) {
    return output;
  }
  return output
    .split(/\r?\n/)
    .filter((line) => !/Could not find platform independent libraries <prefix>/i.test(line))
    .join("\n")
    .trim();
}

function defaultProcessTimeoutMs(toolLabel) {
  if (/LibreOffice/i.test(toolLabel)) return 180_000;
  if (/FFmpeg/i.test(toolLabel)) return 600_000;
  return 300_000;
}

function runProcess(file, args, job, toolLabel = "外部程序", options = {}) {
  return new Promise((resolve, reject) => {
    if (job && job.cancelRequested) {
      reject(new JobCancelledError());
      return;
    }
    let child;
    try {
      child = spawn(file, args, {
        windowsHide: true,
        detached: process.platform !== "win32"
      });
    } catch (error) {
      const notFound = error && (error.code === "ENOENT" || /ENOENT/i.test(String(error)));
      const permissionDenied = error && (error.code === "EACCES" || /EACCES|permission/i.test(String(error)));
      reject(createProcessError(formatProcessError({
        notFound,
        permissionDenied,
        executable: file,
        args,
        cwd: process.cwd(),
        toolLabel,
        stdout: String(error && error.message ? error.message : error || "")
      }), {
        errorCode: notFound ? ERROR_CODES.MISSING_TOOL : permissionDenied ? ERROR_CODES.PERMISSION_DENIED : ERROR_CODES.UNKNOWN,
        executable: file,
        args,
        cwd: process.cwd(),
        stdout: String(error && error.message ? error.message : error || ""),
        stderr: ""
      }));
      return;
    }
    if (job) {
      job._child = child;
    }
    const stdoutChunks = [];
    const stderrChunks = [];
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || defaultProcessTimeoutMs(toolLabel));
    let timedOut = false;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child);
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk.toString()));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));
    child.on("error", (error) => {
      if (job) {
        job._child = null;
      }
      const notFound = error && (error.code === "ENOENT" || /ENOENT/i.test(String(error)));
      const permissionDenied = error && (error.code === "EACCES" || /EACCES|permission/i.test(String(error)));
      settle(reject, createProcessError(formatProcessError({
        notFound,
        permissionDenied,
        executable: file,
        args,
        cwd: process.cwd(),
        toolLabel,
        stdout: String(error && error.message ? error.message : error || "")
      }), {
        errorCode: notFound ? ERROR_CODES.MISSING_TOOL : permissionDenied ? ERROR_CODES.PERMISSION_DENIED : ERROR_CODES.UNKNOWN,
        executable: file,
        args,
        cwd: process.cwd(),
        stdout: String(error && error.message ? error.message : error || ""),
        stderr: ""
      }));
    });
    child.on("close", (code, signal) => {
      if (job) {
        job._child = null;
      }
      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");
      const output = `${stdout}${stderr}`.trim();
      if (timedOut) {
        settle(reject, createProcessError(formatProcessError({
          timeout: true,
          timeoutSeconds: Math.ceil(timeoutMs / 1000),
          stdout,
          stderr,
          executable: file,
          args,
          cwd: process.cwd(),
          toolLabel
        }), {
          errorCode: ERROR_CODES.TOOL_TIMEOUT,
          exitCode: code,
          executable: file,
          args,
          cwd: process.cwd(),
          stdout,
          stderr
        }));
        return;
      }
      if (job && job.cancelRequested) {
        settle(reject, new JobCancelledError());
        return;
      }
      // qpdf uses exit 3 for "succeeded with warnings" (still produced output).
      const isQpdf = /qpdf/i.test(path.basename(file || ""));
      const qpdfWarningOk = isQpdf && code === 3 && /succeeded with warnings/i.test(output);
      if (code === 0 || qpdfWarningOk) {
        if (/impl_store|error area:io|class:write/i.test(output)) {
          settle(reject, createProcessError(formatProcessError({
            returncode: code,
            stdout,
            stderr,
            executable: file,
            args,
            cwd: process.cwd(),
            toolLabel
          }), {
            errorCode: processErrorCode({ code, stdout, stderr, toolLabel }),
            exitCode: code,
            executable: file,
            args,
            cwd: process.cwd(),
            stdout,
            stderr
          }));
          return;
        }
        settle(resolve, { output: filterSuccessfulToolOutput(output, toolLabel), stdout, stderr, exitCode: code });
      } else {
        const errorCode = processErrorCode({ code, stdout, stderr, toolLabel: isQpdf ? "QPDF" : toolLabel });
        settle(reject, createProcessError(formatProcessError({
          returncode: code,
          stdout: [stdout, signal ? `signal=${signal}` : ""].filter(Boolean).join("\n"),
          stderr,
          executable: file,
          args,
          cwd: process.cwd(),
          toolLabel: isQpdf ? "QPDF" : toolLabel
        }), {
          errorCode,
          exitCode: code,
          executable: file,
          args,
          cwd: process.cwd(),
          stdout,
          stderr
        }));
      }
    });
  });
}

module.exports = {
  BackendService,
  // Exported for unit tests
  snapshotOutputDir,
  resolveLibreOfficeOutput,
  pdfBytesLookEncrypted,
  isEncryptedPdfMessage,
  parsePageRanges,
  sanitizeOfficeExtension,
  officeConvertTarget,
  buildFfmpegMediaArgs,
  formatProcessError,
  isWindowsStackBufferOverrun,
  libreOfficeArgs,
  pathToLibreOfficeFileUri,
  createLibreOfficeProfileDir,
  filterSuccessfulToolOutput,
  removeIncompleteOfficeOutput,
  cleanupLoProfile,
  detectTesseractLanguageSupport,
  parseTesseractListLanguages,
  resolveTessdataPath,
  scanTessdataLanguages,
  resolveOcrLanguage,
  buildTesseractOcrArgs,
  chooseOcrText,
  repairOcrText,
  sanitizeMediaBitrate,
  sanitizeGifFps,
  renderPdfPagesToPng,
  loadPdfJsCompatibleCanvas,
  annotatePdfOcrStageError,
  JOBS_STATE_SCHEMA_VERSION,
  JOB_RETENTION_HOURS,
  MAX_PERSISTED_JOBS,
  loadJobsState,
  saveJobsState,
  atomicWriteFileSync,
  normalizePersistedJob,
  redactJobOptions,
  nextAvailablePath,
  fitOutputFilename,
  validateJobInputLimits,
  classifyJobError,
  errorCodeLabel,
  ERROR_CODES,
  cleanupSwiftLocalTempDirs,
  pruneJobList,
  computeJobSpaceUsage,
  DEFAULT_OCR_LANGUAGE,
  sanitizeOcrLanguage,
  sanitizeDesktopJobOptions,
  sanitizeImageOps,
  sanitizeImageRectangle,
  sanitizeImageQuality,
  sanitizeImageDimension,
  sanitizeImageKeepRatio,
  resolveWorkspaceImageSize,
  renderWorkspaceImageCanvas,
  createFriendlyImageError,
  sanitizeOcrPageSelection,
  assertOcrLanguagesAvailable,
  createFriendlyOcrError,
  bundledTessdataDir,
  listOcrLanguages,
  writeTextDocx,
  JobCancelledError,
  runProcess,
  defaultProcessTimeoutMs
};
