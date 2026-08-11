"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { spawn, execFile } = require("node:child_process");
const { terminateProcessTree } = require("./process-tree");
const { createPublicMediaProxy } = require("./public-media-proxy");

const PROGRESS_MARKER = "__SWIFTLOCAL_PROGRESS__";
const POSTPROCESS_MARKER = "__SWIFTLOCAL_POSTPROCESS__";
const OUTPUT_MARKER = "__SWIFTLOCAL_OUTPUT__";
const MAX_METADATA_BYTES = 24 * 1024 * 1024;
const MAX_STDERR_BYTES = 256 * 1024;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 90_000;
const DOWNLOAD_PROGRESS_INTERVAL_MS = 200;

const DOWNLOAD_PROGRESS_TEMPLATE = [
  "{\"status\":%(progress.status)j",
  ",\"downloadedBytes\":%(progress.downloaded_bytes)j",
  ",\"totalBytes\":%(progress.total_bytes)j",
  ",\"totalBytesEstimate\":%(progress.total_bytes_estimate)j",
  ",\"speed\":%(progress.speed)j",
  ",\"eta\":%(progress.eta)j",
  ",\"filename\":%(progress.filename)j",
  ",\"vcodec\":%(info.vcodec)j",
  ",\"acodec\":%(info.acodec)j}"
].join("");

const POSTPROCESS_PROGRESS_TEMPLATE = [
  "{\"status\":%(progress.status)j",
  ",\"postprocessor\":%(progress.postprocessor)j",
  ",\"filename\":%(progress.filename)j}"
].join("");

class MediaDownloadError extends Error {
  constructor(code, message, detail = "") {
    super(message);
    this.name = "MediaDownloadError";
    this.code = code || "unexpected_exit";
    this.detail = detail || "";
  }
}

class MediaDownloadService {
  constructor(options = {}) {
    this.getFfmpegPath = options.getFfmpegPath || (async () => "");
    this.getDefaultOutputDir = options.getDefaultOutputDir || (() => options.defaultOutputDir || "");
    this.onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    this.diagnosticPath = options.diagnosticPath || "";
    this.spawnImpl = options.spawnImpl || spawn;
    // Production thumbnail requests use a DNS-pinned Node request. Tests may
    // inject fetchImpl, but global fetch is deliberately not used because its
    // second DNS lookup would reopen a DNS-rebinding window.
    this.fetchImpl = options.fetchImpl;
    this.lookupImpl = options.lookupImpl || dns.promises.lookup;
    this.analysis = null;
    this.analysisActive = false;
    this.analysisCancelRequested = false;
    this.analysisChild = null;
    this.analysisProxy = null;
    this.analysisFinishedPromise = null;
    this.resolveAnalysisFinished = null;
    this.activeOperation = null;
    this.lastProgress = createProgress("idle");
    this._lastProgressAt = 0;
  }

  async getStatus() {
    const [ffmpegPath, ytDlpPath, denoPath] = await Promise.all([
      Promise.resolve(this.getFfmpegPath()).catch(() => ""),
      Promise.resolve(resolveBundledMediaTool("yt-dlp")),
      Promise.resolve(resolveBundledMediaTool("deno"))
    ]);
    const status = {
      ready: Boolean(ytDlpPath && ffmpegPath && denoPath),
      defaultOutputDir: String(this.getDefaultOutputDir() || ""),
      active: Boolean(this.analysisActive || this.analysisChild || this.activeOperation),
      tools: {
        ytDlp: { available: Boolean(ytDlpPath), path: ytDlpPath || "" },
        ffmpeg: { available: Boolean(ffmpegPath), path: ffmpegPath || "" },
        deno: { available: Boolean(denoPath), path: denoPath || "" }
      },
      progress: { ...this.lastProgress }
    };
    return status;
  }

  async analyze(payload = {}) {
    if (this.analysisActive || this.analysisChild || this.activeOperation) {
      throw new MediaDownloadError("busy", "已有分析或下載正在進行，請稍候。", "concurrent operation rejected");
    }
    this.analysisActive = true;
    this.analysisCancelRequested = false;
    this.analysisFinishedPromise = new Promise((resolve) => {
      this.resolveAnalysisFinished = resolve;
    });
    this.analysis = null;
    try {
      return await this._analyze(payload);
    } finally {
      if (this.analysisProxy) await this.analysisProxy.close().catch(() => {});
      this.analysisProxy = null;
      this.analysisActive = false;
      if (this.resolveAnalysisFinished) this.resolveAnalysisFinished();
      this.analysisFinishedPromise = null;
      this.resolveAnalysisFinished = null;
    }
  }

  async _analyze(payload = {}) {
    const url = await validatePublicMediaUrl(payload.url, this.lookupImpl);
    const ytDlpPath = resolveBundledMediaTool("yt-dlp");
    if (!ytDlpPath) {
      throw new MediaDownloadError("missing_ytdlp", "找不到內建 yt-dlp，請使用完整安裝版或 Portable 版。", "bundled yt-dlp not found");
    }
    const denoPath = resolveBundledMediaTool("deno");
    if (!denoPath) {
      throw new MediaDownloadError("missing_js_runtime", "找不到內建媒體分析元件，請重新安裝 SwiftLocal。", "bundled Deno not found");
    }

    this.analysisProxy = await createPublicMediaProxy({
      resolveHost: (hostname) => assertPublicRemoteHost(hostname, this.lookupImpl)
    });
    if (this.analysisCancelRequested) throw new MediaDownloadError("cancelled", "分析已取消。", "analysis cancelled during preparation");
    const args = buildAnalyzeArgs(url, { denoPath, proxyUrl: this.analysisProxy.url });
    this._emitProgress(createProgress("analyzing", { message: "正在分析媒體…" }), true);
    this._diagnostic({ operation: "analyze", source: redactMediaUrl(url), status: "started" });
    let result;
    try {
      result = await this._runAnalysisProcess(ytDlpPath, args);
    } catch (error) {
      const friendly = normalizeMediaError(error);
      this._emitProgress(createProgress("error", {
        message: friendly.message,
        error: publicMediaError(friendly)
      }), true);
      this._diagnostic({
        operation: "analyze",
        source: redactMediaUrl(url),
        status: "failed",
        errorCode: friendly.code,
        stderrSummary: friendly.detail
      });
      throw friendly;
    }

    let raw;
    try {
      raw = JSON.parse(result.stdout);
    } catch (error) {
      const friendly = new MediaDownloadError(
        "invalid_metadata",
        "無法讀取這個媒體的資料，請稍後再試。",
        `metadata JSON parse failed: ${String(error && error.message ? error.message : error)}`
      );
      this._emitProgress(createProgress("error", { message: friendly.message, error: publicMediaError(friendly) }), true);
      throw friendly;
    }

    const metadata = normalizeMediaMetadata(raw);
    const thumbnailUrl = chooseThumbnailUrl(raw);
    if (thumbnailUrl) {
      try {
        metadata.thumbnailDataUrl = await fetchThumbnailDataUrl(thumbnailUrl, {
          fetchImpl: this.fetchImpl,
          lookupImpl: this.lookupImpl
        });
      } catch (error) {
        // Thumbnail is optional. Metadata analysis remains useful if it cannot be fetched safely.
        this._diagnostic({
          operation: "thumbnail",
          status: "failed",
          errorCode: "thumbnail_unavailable",
          stderrSummary: summarizeDiagnosticText(error && error.message ? error.message : error)
        });
      }
    }
    const analysisId = crypto.randomUUID();
    this.analysis = {
      id: analysisId,
      url,
      metadata,
      raw: {
        id: raw.id || "",
        title: raw.title || "",
        extractor: raw.extractor_key || raw.extractor || ""
      }
    };
    this._emitProgress(createProgress("ready", { message: "分析完成" }), true);
    this._diagnostic({
      operation: "analyze",
      extractor: metadata.extractor,
      mediaId: String(raw.id || ""),
      status: "completed",
      exitCode: result.exitCode
    });
    return { analysisId, metadata };
  }

  async startDownload(payload = {}) {
    if (this.analysisActive || this.analysisChild || this.activeOperation) {
      throw new MediaDownloadError("busy", "已有分析或下載正在進行，請稍候。", "concurrent operation rejected");
    }
    if (!this.analysis || String(payload.analysisId || "") !== this.analysis.id) {
      throw new MediaDownloadError("analysis_expired", "請先重新分析網址，再開始下載。", "analysis token missing or stale");
    }

    await validatePublicMediaUrl(this.analysis.url, this.lookupImpl);

    const selection = validateDownloadSelection(payload, this.analysis.metadata);
    const outputDir = ensureWritableOutputDir(payload.outputDir || this.getDefaultOutputDir());
    const [ffmpegPath, ytDlpPath, denoPath] = await Promise.all([
      Promise.resolve(this.getFfmpegPath()).catch(() => ""),
      Promise.resolve(resolveBundledMediaTool("yt-dlp")),
      Promise.resolve(resolveBundledMediaTool("deno"))
    ]);
    if (!ytDlpPath) {
      throw new MediaDownloadError("missing_ytdlp", "找不到內建 yt-dlp，請重新安裝 SwiftLocal。", "bundled yt-dlp not found");
    }
    if (!ffmpegPath) {
      throw new MediaDownloadError("missing_ffmpeg", "找不到內建 FFmpeg，無法合併或轉換媒體。", "FFmpeg not found");
    }
    if (!denoPath) {
      throw new MediaDownloadError("missing_js_runtime", "找不到內建媒體分析元件，請重新安裝 SwiftLocal。", "bundled Deno not found");
    }

    assertFreeDiskSpace(outputDir, this.analysis.metadata.estimatedBytes || 0);
    const safeTitle = sanitizeWindowsFilename(this.analysis.metadata.title || "media");
    const baseName = nextAvailableMediaBase(outputDir, safeTitle);
    const workDir = fs.mkdtempSync(path.join(outputDir, ".swiftlocal-media-"));
    const operation = {
      id: crypto.randomUUID(),
      analysisId: this.analysis.id,
      child: null,
      cancelRequested: false,
      outputDir,
      workDir,
      safeTitle,
      baseName,
      stderr: "",
      outputPath: "",
      proxy: null,
      closePromise: null,
      resolveClosed: null,
      finishedPromise: null,
      resolveFinished: null
    };
    operation.closePromise = new Promise((resolve) => {
      operation.resolveClosed = resolve;
    });
    operation.finishedPromise = new Promise((resolve) => {
      operation.resolveFinished = resolve;
    });
    this.activeOperation = operation;
    this._emitProgress(createProgress("preparing", { operationId: operation.id, message: "正在準備下載…" }), true);
    this._diagnostic({
      operation: "download",
      operationId: operation.id,
      extractor: this.analysis.metadata.extractor,
      selectedMode: selection.mode,
      selectedResolution: selection.resolution || "",
      audioFormat: selection.audioFormat || "",
      outputPath: outputDir,
      status: "started"
    });

    try {
      operation.proxy = await createPublicMediaProxy({
        resolveHost: (hostname) => assertPublicRemoteHost(hostname, this.lookupImpl)
      });
      if (operation.cancelRequested) throw new MediaDownloadError("cancelled", "下載已取消。", "cancelled during preparation");
      const outputTemplate = path.join(workDir, `${escapeYtDlpTemplateLiteral(baseName)}.%(ext)s`);
      const args = buildDownloadArgs(this.analysis.url, {
        ...selection,
        outputTemplate,
        ffmpegPath,
        denoPath,
        proxyUrl: operation.proxy.url
      });
      const result = await this._runDownloadProcess(ytDlpPath, args, operation);
      const intermediatePath = resolveDownloadedOutputPath(operation, result.outputPath);
      if (!intermediatePath) {
        throw new MediaDownloadError("missing_output", "下載完成，但找不到輸出檔案。", "yt-dlp exited successfully without a final output path");
      }
      const outputPath = publishDownloadedOutput(operation, intermediatePath);
      operation.outputPath = outputPath;
      const stat = fs.statSync(outputPath);
      const completed = {
        operationId: operation.id,
        status: "completed",
        filename: path.basename(outputPath),
        outputPath,
        outputDir: path.dirname(outputPath),
        size: stat.size
      };
      this._emitProgress(createProgress("completed", {
        ...completed,
        percentage: 100,
        message: "下載完成"
      }), true);
      this._diagnostic({
        operation: "download",
        operationId: operation.id,
        extractor: this.analysis.metadata.extractor,
        selectedMode: selection.mode,
        selectedResolution: selection.resolution || "",
        outputPath,
        status: "completed",
        exitCode: result.exitCode,
        stderrSummary: summarizeDiagnosticText(result.stderr)
      });
      return completed;
    } catch (error) {
      const cancelled = operation.cancelRequested || (error && error.code === "cancelled");
      if (cancelled) {
        const removed = cleanupCancelledArtifacts(operation);
        const friendly = new MediaDownloadError("cancelled", "下載已取消。", removed.length ? `removed temporary files: ${removed.join(", ")}` : "process tree terminated");
        this._emitProgress(createProgress("cancelled", {
          operationId: operation.id,
          message: friendly.message
        }), true);
        this._diagnostic({
          operation: "download",
          operationId: operation.id,
          extractor: this.analysis.metadata.extractor,
          selectedMode: selection.mode,
          selectedResolution: selection.resolution || "",
          outputPath: outputDir,
          status: "cancelled",
          cancellation: true,
          stderrSummary: summarizeDiagnosticText(operation.stderr),
          removedTemporaryFiles: removed
        });
        throw friendly;
      }
      const removed = cleanupCancelledArtifacts(operation);
      const friendly = normalizeMediaError(error, operation.stderr);
      this._emitProgress(createProgress("error", {
        operationId: operation.id,
        message: friendly.message,
        error: publicMediaError(friendly)
      }), true);
      this._diagnostic({
        operation: "download",
        operationId: operation.id,
        extractor: this.analysis.metadata.extractor,
        selectedMode: selection.mode,
        selectedResolution: selection.resolution || "",
        outputPath: outputDir,
        status: "failed",
        errorCode: friendly.code,
        stderrSummary: friendly.detail,
        removedTemporaryFiles: removed
      });
      throw friendly;
    } finally {
      cleanupCancelledArtifacts(operation);
      if (operation.proxy) await operation.proxy.close().catch(() => {});
      if (this.activeOperation === operation) this.activeOperation = null;
      operation.child = null;
      if (operation.resolveClosed) operation.resolveClosed();
      if (operation.resolveFinished) operation.resolveFinished();
    }
  }

  async cancelDownload() {
    const operation = this.activeOperation;
    if (!operation) {
      return { cancelled: false };
    }
    if (!operation.child) {
      operation.cancelRequested = true;
      if (operation.proxy) await operation.proxy.close().catch(() => {});
      return { cancelled: true };
    }
    if (operation.cancelRequested) {
      await waitForClose(operation.closePromise, 6000);
      return { cancelled: true };
    }
    operation.cancelRequested = true;
    this._emitProgress(createProgress("cancelling", {
      operationId: operation.id,
      message: "正在取消並結束背景程序…"
    }), true);
    await terminateProcessTree(operation.child);
    const closed = await waitForClose(operation.closePromise, 6000);
    if (!closed) {
      throw new MediaDownloadError("cancel_failed", "無法確認背景下載已停止，請關閉 SwiftLocal。", "process tree did not close within timeout");
    }
    return { cancelled: true };
  }

  getCompletedTarget(kind) {
    if (this.lastProgress.status !== "completed" || !this.lastProgress.outputPath) {
      throw new MediaDownloadError("missing_output", "目前沒有可開啟的下載結果。", "no completed media result");
    }
    const target = kind === "folder" ? this.lastProgress.outputDir : this.lastProgress.outputPath;
    if (!target || !fs.existsSync(target)) {
      throw new MediaDownloadError("missing_output", "下載結果已被移動或刪除。", `missing completed target: ${target || "(empty)"}`);
    }
    return target;
  }

  async dispose() {
    if (this.analysisActive) this.analysisCancelRequested = true;
    if (this.analysisChild) {
      const child = this.analysisChild;
      await terminateProcessTree(child);
      await waitForChildExit(child, 3000);
    }
    if (this.analysisProxy) await this.analysisProxy.close().catch(() => {});
    if (this.analysisFinishedPromise) await waitForClose(this.analysisFinishedPromise, 6000);
    if (this.activeOperation) {
      const operation = this.activeOperation;
      operation.cancelRequested = true;
      if (operation.child) await terminateProcessTree(operation.child);
      if (operation.proxy) await operation.proxy.close().catch(() => {});
      await waitForClose(operation.finishedPromise, 6000);
    }
  }

  _runAnalysisProcess(file, args) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = this.spawnImpl(file, args, childProcessOptions());
      } catch (error) {
        reject(error);
        return;
      }
      this.analysisChild = child;
      const stdout = [];
      const stderr = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timedOut = false;
      let settled = false;
      const timer = setTimeout(() => {
        timedOut = true;
        void terminateProcessTree(child);
      }, ANALYSIS_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > MAX_METADATA_BYTES) {
          void terminateProcessTree(child);
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        if (stderrBytes >= MAX_STDERR_BYTES) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
        const allowed = Math.max(0, MAX_STDERR_BYTES - stderrBytes);
        stderr.push(bytes.subarray(0, allowed));
        stderrBytes += Math.min(bytes.length, allowed);
      });
      child.once("error", (error) => finish(error));
      child.once("close", (code, signal) => {
        const stderrText = Buffer.concat(stderr).toString("utf8");
        if (timedOut) {
          finish(new MediaDownloadError("network_timeout", "分析逾時，請檢查網絡後再試。", summarizeDiagnosticText(stderrText)));
        } else if (stdoutBytes > MAX_METADATA_BYTES) {
          finish(new MediaDownloadError("invalid_metadata", "媒體資料過大，無法安全分析。", "metadata output exceeded limit"));
        } else if (code !== 0) {
          finish(createProcessFailure(code, signal, stderrText));
        } else {
          finish(null, { stdout: Buffer.concat(stdout).toString("utf8").trim(), stderr: stderrText, exitCode: code });
        }
      });

      function finish(error, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      }
    }).finally(() => {
      this.analysisChild = null;
    });
  }

  _runDownloadProcess(file, args, operation) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = this.spawnImpl(file, args, childProcessOptions());
      } catch (error) {
        reject(error);
        return;
      }
      operation.child = child;
      const stderrChunks = [];
      let stderrBytes = 0;
      let finalOutputPath = "";
      let settled = false;
      const handleLine = (line) => {
        const machine = parseMediaMachineLine(line);
        if (!machine) return;
        if (machine.type === "output") {
          finalOutputPath = String(machine.payload || "");
          return;
        }
        const progress = progressFromMachineEvent(machine, operation.id);
        if (progress) this._emitProgress(progress, progress.status !== "downloading");
      };
      bindLineReader(child.stdout, handleLine);
      bindLineReader(child.stderr, handleLine);
      child.stderr.on("data", (chunk) => {
        if (stderrBytes >= MAX_STDERR_BYTES) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
        const allowed = Math.max(0, MAX_STDERR_BYTES - stderrBytes);
        stderrChunks.push(bytes.subarray(0, allowed));
        stderrBytes += Math.min(bytes.length, allowed);
      });
      child.once("error", (error) => finish(error));
      child.once("close", (code, signal) => {
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        operation.stderr = stderr;
        if (operation.cancelRequested) {
          finish(new MediaDownloadError("cancelled", "下載已取消。", `signal=${signal || ""}`));
        } else if (code !== 0) {
          finish(createProcessFailure(code, signal, stderr));
        } else {
          finish(null, { exitCode: code, stderr, outputPath: finalOutputPath });
        }
      });

      function finish(error, value) {
        if (settled) return;
        settled = true;
        if (operation.resolveClosed) operation.resolveClosed();
        if (error) reject(error);
        else resolve(value);
      }
    });
  }

  _emitProgress(progress, immediate = false) {
    this.lastProgress = { ...progress };
    const now = Date.now();
    if (!immediate && now - this._lastProgressAt < DOWNLOAD_PROGRESS_INTERVAL_MS) return;
    this._lastProgressAt = now;
    try {
      this.onProgress({ ...this.lastProgress });
    } catch {
      // UI event delivery must not interrupt a download.
    }
  }

  _diagnostic(entry) {
    if (!this.diagnosticPath) return;
    try {
      fs.mkdirSync(path.dirname(this.diagnosticPath), { recursive: true });
      const payload = sanitizeDiagnosticEntry({ timestamp: new Date().toISOString(), ...entry });
      fs.appendFileSync(this.diagnosticPath, `${JSON.stringify(payload)}\n`, "utf8");
    } catch {
      // Diagnostics are best-effort; downloads must still work offline.
    }
  }
}

function childProcessOptions() {
  const environment = { ...process.env };
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]) {
    delete environment[key];
  }
  return {
    windowsHide: true,
    shell: false,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...environment,
      YTDLP_NO_PLUGINS: "1",
      PYTHONUTF8: "1"
    }
  };
}

function buildCommonArgs({ denoPath = "", ffmpegPath = "", proxyUrl = "" } = {}) {
  const args = [
    "--ignore-config",
    "--no-plugin-dirs",
    "--no-playlist",
    "--no-write-comments",
    "--no-write-info-json",
    "--no-write-playlist-metafiles",
    "--windows-filenames",
    "--trim-filenames",
    "180",
    "--output-na-placeholder",
    "null",
    "--no-js-runtimes"
  ];
  if (denoPath) args.push("--js-runtimes", `deno:${denoPath}`);
  if (ffmpegPath) args.push("--ffmpeg-location", ffmpegPath);
  if (proxyUrl) args.push("--proxy", proxyUrl);
  return args;
}

function buildAnalyzeArgs(url, options = {}) {
  return [
    ...buildCommonArgs(options),
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--",
    validateMediaUrl(url)
  ];
}

function buildDownloadArgs(url, options = {}) {
  const mode = options.mode;
  const args = [
    ...buildCommonArgs(options),
    "--newline",
    "--progress",
    "--progress-delta",
    "0.2",
    "--progress-template",
    `download:${PROGRESS_MARKER}${DOWNLOAD_PROGRESS_TEMPLATE}`,
    "--progress-template",
    `postprocess:${POSTPROCESS_MARKER}${POSTPROCESS_PROGRESS_TEMPLATE}`,
    "--print",
    `after_move:${OUTPUT_MARKER}%(filepath)j`,
    "--no-overwrites",
    "--output",
    String(options.outputTemplate || "")
  ];

  if (mode === "video") {
    args.push("--format", videoFormatSelector(options.resolution));
    args.push("--merge-output-format", "mp4");
  } else if (mode === "audio" && options.audioFormat === "mp3") {
    args.push("--format", "bestaudio/best", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else if (mode === "audio") {
    args.push("--format", "bestaudio/best", "--extract-audio", "--audio-format", "best");
  } else {
    throw new MediaDownloadError("invalid_options", "下載選項無效，請重新選擇。", `unsupported mode: ${mode}`);
  }
  args.push("--", validateMediaUrl(url));
  return args;
}

function videoFormatSelector(resolution) {
  const cap = resolution === "720" ? 720 : resolution === "1080" ? 1080 : null;
  const height = cap ? `[height<=${cap}]` : "";
  return [
    `bestvideo*${height}[ext=mp4]+bestaudio[ext=m4a]`,
    `bestvideo*${height}+bestaudio`,
    `best${height}[ext=mp4]`,
    `best${height}`
  ].join("/");
}

function validateMediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 4096) {
    throw new MediaDownloadError("invalid_url", "請輸入有效的 http 或 https 媒體網址。", "URL missing or too long");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MediaDownloadError("invalid_url", "請輸入有效的 http 或 https 媒體網址。", "URL parse failed");
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
    throw new MediaDownloadError("invalid_url", "請輸入有效的 http 或 https 媒體網址。", "URL protocol/credentials rejected");
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (isLocalHostname(hostname) || (net.isIP(hostname) && isPrivateIp(hostname))) {
    throw new MediaDownloadError("invalid_url", "只支援可公開存取的媒體網址。", "local or private media host rejected");
  }
  return parsed.href;
}

async function validatePublicMediaUrl(value, lookupImpl = dns.promises.lookup) {
  const url = validateMediaUrl(value);
  const hostname = normalizeHostname(new URL(url).hostname);
  try {
    await assertPublicRemoteHost(hostname, lookupImpl);
  } catch (error) {
    const detail = summarizeDiagnosticText(error && error.message ? error.message : error);
    if (/local|private|non-public/i.test(detail)) {
      throw new MediaDownloadError("invalid_url", "只支援可公開存取的媒體網址。", detail);
    }
    throw new MediaDownloadError("network_error", "無法確認媒體網址，請檢查網絡後再試。", detail);
  }
  return url;
}

function normalizeMediaMetadata(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MediaDownloadError("invalid_metadata", "無法讀取這個媒體的資料。", "metadata is not an object");
  }
  if (raw._type === "playlist" || (Array.isArray(raw.entries) && !raw.id)) {
    throw new MediaDownloadError("playlist_not_supported", "V1 暫不支援播放清單，請貼上單一影片或音訊網址。", "playlist metadata rejected");
  }
  const formats = Array.isArray(raw.formats) ? raw.formats : [];
  const videoFormats = formats.filter((item) => item && item.vcodec && item.vcodec !== "none");
  const audioFormats = formats.filter((item) => item && item.acodec && item.acodec !== "none");
  if (!videoFormats.length && !audioFormats.length) {
    throw new MediaDownloadError("no_format", "找不到可下載的影音格式。", "metadata contains no audio/video formats");
  }
  const heights = Array.from(new Set(videoFormats.map((item) => Math.round(Number(item.height) || 0)).filter(Boolean))).sort((a, b) => a - b);
  const maxHeight = heights.length ? heights[heights.length - 1] : 0;
  const has720 = heights.some((height) => height >= 700 && height <= 740);
  const has1080 = heights.some((height) => height >= 1000 && height <= 1120);
  const sizes = formats
    .map((item) => Number(item && (item.filesize || item.filesize_approx)) || 0)
    .filter((size) => size > 0);
  return {
    title: String(raw.title || raw.fulltitle || "未命名媒體"),
    extractor: String(raw.extractor_key || raw.extractor || raw.webpage_url_domain || ""),
    uploader: String(raw.uploader || raw.channel || raw.creator || ""),
    duration: raw.duration == null || raw.duration === ""
      ? null
      : (Number.isFinite(Number(raw.duration)) ? Math.max(0, Number(raw.duration)) : null),
    hasVideo: videoFormats.length > 0,
    hasAudio: audioFormats.length > 0,
    qualities: {
      p720: has720,
      p1080: has1080,
      best: videoFormats.length > 0,
      maxHeight: maxHeight || null
    },
    defaultQuality: has1080 ? "1080" : "best",
    estimatedBytes: sizes.length ? Math.max(...sizes) : null,
    thumbnailDataUrl: ""
  };
}

function chooseThumbnailUrl(raw) {
  const direct = String(raw && raw.thumbnail || "");
  const list = Array.isArray(raw && raw.thumbnails) ? raw.thumbnails : [];
  const sorted = list
    .filter((item) => item && item.url)
    .sort((a, b) => (Number(b.width) || 0) * (Number(b.height) || 0) - (Number(a.width) || 0) * (Number(a.height) || 0));
  return String((sorted[0] && sorted[0].url) || direct || "");
}

function validateDownloadSelection(payload, metadata) {
  const mode = payload.mode === "audio" ? "audio" : payload.mode === "video" ? "video" : "";
  if (!mode) throw new MediaDownloadError("invalid_options", "請選擇影片或音訊下載。", "invalid mode");
  if (mode === "video") {
    if (!metadata.hasVideo) throw new MediaDownloadError("no_format", "這個來源沒有可下載的影片格式。", "video unavailable");
    const resolution = ["720", "1080", "best"].includes(payload.resolution) ? payload.resolution : "best";
    if (resolution === "720" && !metadata.qualities.p720) {
      throw new MediaDownloadError("no_format", "這個來源沒有 720p 畫質，請選擇其他畫質。", "720p unavailable");
    }
    if (resolution === "1080" && !metadata.qualities.p1080) {
      throw new MediaDownloadError("no_format", "這個來源沒有 1080p 畫質，請選擇其他畫質。", "1080p unavailable");
    }
    return { mode, resolution, audioFormat: "" };
  }
  if (!metadata.hasAudio) throw new MediaDownloadError("no_format", "這個來源沒有可下載的音訊格式。", "audio unavailable");
  const audioFormat = payload.audioFormat === "best" ? "best" : "mp3";
  return { mode, resolution: "", audioFormat };
}

function sanitizeWindowsFilename(value, maxLength = 160) {
  let safe = String(value || "media")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/g, "")
    .trim();
  if (!safe) safe = "media";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  const characters = Array.from(safe);
  if (characters.length > maxLength) safe = characters.slice(0, maxLength).join("").replace(/[ .]+$/g, "");
  return safe || "media";
}

function nextAvailableMediaBase(outputDir, title) {
  const names = new Set(fs.readdirSync(outputDir).map((name) => process.platform === "win32" ? name.toLowerCase() : name));
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = index === 0 ? title : `${title} (${index + 1})`;
    const key = process.platform === "win32" ? candidate.toLowerCase() : candidate;
    const used = Array.from(names).some((name) => name === key || name.startsWith(`${key}.`));
    if (!used) return candidate;
  }
  return `${title} (${Date.now()})`;
}

function escapeYtDlpTemplateLiteral(value) {
  return String(value || "").replace(/%/g, "%%");
}

function ensureWritableOutputDir(value) {
  const outputDir = String(value || "").trim();
  if (!outputDir || !path.isAbsolute(outputDir)) {
    throw new MediaDownloadError("output_not_writable", "請選擇有效的輸出資料夾。", "output directory is empty or not absolute");
  }
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.accessSync(outputDir, fs.constants.W_OK);
  } catch (error) {
    throw new MediaDownloadError("output_not_writable", "無法寫入所選的輸出資料夾。", String(error && error.message ? error.message : error));
  }
  return path.resolve(outputDir);
}

function assertFreeDiskSpace(outputDir, estimatedBytes) {
  if (typeof fs.statfsSync !== "function") return;
  try {
    const stat = fs.statfsSync(outputDir);
    const available = Number(stat.bavail) * Number(stat.bsize);
    const required = Math.max(64 * 1024 * 1024, Number(estimatedBytes) * 1.2 || 0);
    if (Number.isFinite(available) && available > 0 && available < required) {
      throw new MediaDownloadError("disk_space", "磁碟空間不足，請選擇其他資料夾或釋放空間。", `available=${available}; estimatedRequired=${required}`);
    }
  } catch (error) {
    if (error instanceof MediaDownloadError) throw error;
    // Filesystems without statfs support are handled by yt-dlp/FFmpeg errors.
  }
}

function resolveBundledMediaTool(toolName, options = {}) {
  const resourcesPath = options.resourcesPath || process.resourcesPath || path.join(__dirname, "..");
  const projectRoot = options.projectRoot || path.join(__dirname, "..");
  const executable = toolName === "yt-dlp"
    ? (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp")
    : (process.platform === "win32" ? "deno.exe" : "deno");
  const candidates = [
    path.join(resourcesPath, "tools", toolName, "bin", executable),
    path.join(resourcesPath, "tools", toolName, executable),
    path.join(projectRoot, "tools", toolName, "bin", executable),
    path.join(projectRoot, "tools", toolName, executable)
  ].filter(Boolean);
  for (const candidate of Array.from(new Set(candidates))) {
    try {
      if (path.isAbsolute(candidate) && fs.statSync(candidate).isFile()) {
        if (process.platform !== "win32") fs.accessSync(candidate, fs.constants.X_OK);
        return path.resolve(candidate);
      }
    } catch {
      // Try next bundled candidate.
    }
  }
  return "";
}

function parseMediaMachineLine(line) {
  const value = String(line || "").trim();
  for (const [marker, type] of [[PROGRESS_MARKER, "download"], [POSTPROCESS_MARKER, "postprocess"], [OUTPUT_MARKER, "output"]]) {
    const index = value.indexOf(marker);
    if (index < 0) continue;
    const body = value.slice(index + marker.length).trim();
    try {
      return { type, payload: JSON.parse(body) };
    } catch {
      return null;
    }
  }
  return null;
}

function progressFromMachineEvent(event, operationId = "") {
  if (!event || !event.payload || typeof event.payload !== "object") return null;
  const payload = event.payload;
  if (event.type === "postprocess") {
    const postprocessor = String(payload.postprocessor || "");
    const lower = postprocessor.toLowerCase();
    let status = "preparing";
    let message = "正在完成檔案…";
    if (lower.includes("merger")) {
      status = "merging";
      message = "正在合併影片與音訊…";
    } else if (lower.includes("extractaudio") || lower.includes("audioconvert") || lower.includes("videoconvert") || lower.includes("remux")) {
      status = "converting";
      message = "正在轉換輸出格式…";
    }
    return createProgress(status, {
      operationId,
      message,
      filename: payload.filename ? path.basename(String(payload.filename)) : ""
    });
  }
  const downloadedBytes = finiteNumber(payload.downloadedBytes);
  const totalBytes = finiteNumber(payload.totalBytes) || finiteNumber(payload.totalBytesEstimate);
  const percentage = downloadedBytes != null && totalBytes != null && totalBytes > 0
    ? Math.max(0, Math.min(100, downloadedBytes / totalBytes * 100))
    : null;
  const isAudioOnly = payload.acodec && payload.acodec !== "none" && (!payload.vcodec || payload.vcodec === "none");
  return createProgress("downloading", {
    operationId,
    phase: isAudioOnly ? "audio" : "video",
    message: isAudioOnly ? "正在下載音訊…" : "正在下載影片…",
    percentage,
    downloadedBytes,
    totalBytes,
    speed: finiteNumber(payload.speed),
    eta: finiteNumber(payload.eta),
    filename: payload.filename ? path.basename(String(payload.filename)) : ""
  });
}

function createProgress(status, extra = {}) {
  return {
    status,
    operationId: "",
    phase: "",
    message: "",
    percentage: null,
    downloadedBytes: null,
    totalBytes: null,
    speed: null,
    eta: null,
    filename: "",
    outputPath: "",
    outputDir: "",
    error: null,
    ...extra
  };
}

function bindLineReader(stream, callback) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n|\r/g);
    buffer = lines.pop() || "";
    lines.forEach(callback);
  });
  stream.on("end", () => {
    if (buffer) callback(buffer);
  });
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function resolveDownloadedOutputPath(operation, reportedPath) {
  const candidate = String(reportedPath || "");
  if (candidate && isSafeWorkFile(operation.workDir, candidate)) {
    return path.resolve(candidate);
  }
  const entries = fs.readdirSync(operation.workDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name === operation.baseName || entry.name.startsWith(`${operation.baseName}.`))
    .filter((entry) => !/(?:\.part(?:-|\.|$)|\.(?:ytdl|temp)$)/i.test(entry.name))
    .map((entry) => path.join(operation.workDir, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] || "";
}

function publishDownloadedOutput(operation, sourcePath) {
  if (!isSafeWorkFile(operation.workDir, sourcePath)) {
    throw new MediaDownloadError("missing_output", "下載結果的檔案路徑無效。", "workdir output is missing, nested, or symbolic");
  }
  const extension = path.extname(sourcePath) || ".media";
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const baseName = attempt === 0 ? operation.baseName : nextAvailableMediaBase(operation.outputDir, operation.safeTitle);
    const targetPath = path.join(operation.outputDir, `${baseName}${extension}`);
    try {
      fs.linkSync(sourcePath, targetPath);
      try {
        fs.unlinkSync(sourcePath);
      } catch {
        // The final hard link is complete; controlled workdir cleanup retries the source link.
      }
      return targetPath;
    } catch (error) {
      if (error && error.code === "EEXIST") continue;
      if (!error || !["EPERM", "EACCES", "EXDEV", "ENOTSUP"].includes(error.code)) throw error;
      try {
        fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
        try {
          fs.unlinkSync(sourcePath);
        } catch {
          // The exclusive copy is complete; controlled workdir cleanup retries the source.
        }
        return targetPath;
      } catch (copyError) {
        if (copyError && copyError.code === "EEXIST") continue;
        throw copyError;
      }
    }
  }
  throw new MediaDownloadError("output_not_writable", "無法建立不重複的輸出檔名。", "output collision limit reached");
}

function isSafeWorkFile(workDir, filePath) {
  try {
    const workDirStat = fs.lstatSync(workDir);
    if (!workDirStat.isDirectory() || workDirStat.isSymbolicLink()) return false;
    const resolvedWorkDir = fs.realpathSync(workDir);
    const resolvedPath = path.resolve(filePath);
    if (path.dirname(resolvedPath) !== path.resolve(workDir)) return false;
    const stat = fs.lstatSync(resolvedPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const realPath = fs.realpathSync(resolvedPath);
    return path.dirname(realPath) === resolvedWorkDir;
  } catch {
    return false;
  }
}

function cleanupCancelledArtifacts(operation) {
  const removed = [];
  const workDir = String(operation && operation.workDir || "");
  if (!workDir || path.dirname(path.resolve(workDir)) !== path.resolve(operation.outputDir)) return removed;
  try {
    for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
      if (entry.isFile()) removed.push(entry.name);
    }
  } catch {
    return removed;
  }
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {
    // A late-closing handle may keep the controlled work directory locked on Windows.
  }
  return removed;
}

function createProcessFailure(code, signal, stderr) {
  const error = new Error(`yt-dlp exited with code ${code}`);
  error.exitCode = code;
  error.signal = signal || "";
  error.stderr = stderr || "";
  return error;
}

function normalizeMediaError(error, stderrOverride = "") {
  if (error instanceof MediaDownloadError) return error;
  const stderr = String(stderrOverride || (error && error.stderr) || (error && error.message) || error || "");
  const text = stderr.toLowerCase();
  const detail = summarizeDiagnosticText(stderr);
  if (error && error.code === "ENOENT") return new MediaDownloadError("missing_ytdlp", "找不到內建下載工具，請重新安裝 SwiftLocal。", detail);
  if (/no space left|disk full|not enough space|insufficient disk/.test(text)) return new MediaDownloadError("disk_space", "磁碟空間不足，請釋放空間後再試。", detail);
  if (/permission denied|access is denied|read-only file system/.test(text)) return new MediaDownloadError("output_not_writable", "無法寫入輸出資料夾，請選擇其他位置。", detail);
  if (/private video|this video is private/.test(text)) return new MediaDownloadError("private_media", "這是私人內容，V1 不支援登入下載。", detail);
  if (/sign in|log in|login required|authentication required|confirm you.re not a bot/.test(text)) return new MediaDownloadError("login_required", "這個內容需要登入；V1 不支援帳號或 Cookie。", detail);
  if (/geo.?restrict|not available in your country|not available in your region/.test(text)) return new MediaDownloadError("geo_restricted", "這個內容在目前地區無法使用。", detail);
  if (/unsupported url|no suitable extractor/.test(text)) return new MediaDownloadError("unsupported", "目前不支援這個網站或網址。", detail);
  if (/requested format is not available|no video formats found|no formats found/.test(text)) return new MediaDownloadError("no_format", "找不到符合選項的下載格式，請改選其他畫質或音訊格式。", detail);
  if (/video unavailable|media unavailable|has been removed|not available|does not exist/.test(text)) return new MediaDownloadError("unavailable", "這個媒體不存在、已移除或暫時無法使用。", detail);
  if (/ffmpeg|postprocess|conversion failed|merge.*failed/.test(text)) return new MediaDownloadError("ffmpeg_failed", "FFmpeg 合併或轉換失敗，原始來源可能不相容。", detail);
  if (/timed out|timeout|temporary failure|network is unreachable|connection (?:reset|refused)|unable to download|http error 5\d\d|dns/.test(text)) {
    return new MediaDownloadError("network_error", "網絡連線失敗，請檢查連線後再試。", detail);
  }
  return new MediaDownloadError("unexpected_exit", "下載工具異常結束，請稍後再試。", detail || `exitCode=${error && error.exitCode != null ? error.exitCode : "unknown"}`);
}

function publicMediaError(error) {
  const friendly = normalizeMediaError(error);
  return { code: friendly.code, message: friendly.message, detail: summarizeDiagnosticText(friendly.detail) };
}

function redactMediaUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.username = "";
    parsed.password = "";
    parsed.search = parsed.search ? "?[REDACTED]" : "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[REDACTED_URL]";
  }
}

function redactUrlsInText(value) {
  return String(value || "").replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactMediaUrl(url));
}

function redactSensitiveText(value) {
  const sensitiveKey = "authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|token|access[-_]?token|refresh[-_]?token|auth[-_]?token|po[-_]?token|api[-_]?key|apikey|x[-_]?api[-_]?key|signature|sig|password|client[-_]?secret|clientsecret|session|sessionid";
  // Conservatively redact from the first sensitive assignment to the end of
  // the diagnostic chunk. This intentionally sacrifices later log lines so a
  // pretty-printed or nested JSON value cannot leak across line boundaries.
  const assignment = new RegExp(`\\b(${sensitiveKey})\\b["']?\\s*(?::|=|\\s+)[\\s\\S]*`, "i");
  return String(value || "")
    .replace(assignment, "$1=[REDACTED]")
    .split(/\r?\n/)
    .map((line) => line
      .replace(/\b(bearer|basic)\s+\S+/gi, "$1 [REDACTED]"))
    .join("\n");
}

function summarizeDiagnosticText(value) {
  const lines = redactUrlsInText(redactSensitiveText(value))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-20);
  return lines.join("\n").slice(0, 4000);
}

function sanitizeDiagnosticEntry(entry) {
  const safe = {};
  for (const [key, value] of Object.entries(entry || {})) {
    if (/url|token|cookie|password|authorization/i.test(key)) continue;
    if (typeof value === "string") safe[key] = summarizeDiagnosticText(value);
    else if (Array.isArray(value)) safe[key] = value.slice(0, 30).map((item) => summarizeDiagnosticText(item).slice(0, 200));
    else if (value == null || ["number", "boolean"].includes(typeof value)) safe[key] = value;
  }
  return safe;
}

async function fetchThumbnailDataUrl(value, options = {}) {
  const fetchImpl = options.fetchImpl;
  const lookupImpl = options.lookupImpl || dns.promises.lookup;
  const maxBytes = Number(options.maxBytes) || MAX_THUMBNAIL_BYTES;
  let currentUrl = String(value || "");
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const parsed = new URL(currentUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("unsafe thumbnail URL");
    const addresses = await assertPublicRemoteHost(parsed.hostname, lookupImpl);
    if (typeof fetchImpl !== "function") {
      const result = await requestPinnedThumbnail(parsed, addresses, maxBytes);
      if (result.redirect) {
        currentUrl = new URL(result.redirect, parsed).href;
        continue;
      }
      return result.dataUrl;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetchImpl(parsed.href, { redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("thumbnail redirect missing location");
      currentUrl = new URL(location, parsed).href;
      continue;
    }
    if (!response.ok) throw new Error(`thumbnail HTTP ${response.status}`);
    const contentType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType)) throw new Error("thumbnail type rejected");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new Error("thumbnail too large");
    const bytes = await readResponseBodyLimited(response, maxBytes);
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  throw new Error("too many thumbnail redirects");
}

function requestPinnedThumbnail(parsed, addresses, maxBytes) {
  const selected = addresses[0];
  if (!selected) return Promise.reject(new Error("thumbnail address missing"));
  const transport = parsed.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: normalizeHostname(parsed.hostname),
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers: {
        Accept: "image/jpeg,image/png,image/webp,image/gif",
        "User-Agent": "SwiftLocal/MediaThumbnail"
      },
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions && lookupOptions.all) {
          callback(null, [{ address: selected.address, family: selected.family }]);
          return;
        }
        callback(null, selected.address, selected.family);
      },
      servername: net.isIP(normalizeHostname(parsed.hostname)) ? undefined : normalizeHostname(parsed.hostname)
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400) {
        const location = String(response.headers.location || "");
        response.resume();
        if (!location) {
          reject(new Error("thumbnail redirect missing location"));
          return;
        }
        resolve({ redirect: location, dataUrl: "" });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`thumbnail HTTP ${status}`));
        return;
      }
      const contentType = String(response.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType)) {
        response.resume();
        reject(new Error("thumbnail type rejected"));
        return;
      }
      const declared = Number(response.headers["content-length"] || 0);
      if (declared > maxBytes) {
        response.resume();
        reject(new Error("thumbnail too large"));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        const bytes = Buffer.from(chunk);
        total += bytes.length;
        if (total > maxBytes) {
          response.destroy(new Error("thumbnail too large"));
          return;
        }
        chunks.push(bytes);
      });
      response.on("end", () => {
        if (total <= maxBytes) resolve({ redirect: "", dataUrl: `data:${contentType};base64,${Buffer.concat(chunks).toString("base64")}` });
      });
      response.on("error", reject);
    });
    request.setTimeout(8000, () => request.destroy(new Error("thumbnail request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function readResponseBodyLimited(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > maxBytes) throw new Error("thumbnail too large");
    return data;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("thumbnail too large");
    }
    chunks.push(Buffer.from(item.value));
  }
  return Buffer.concat(chunks);
}

async function assertPublicRemoteHost(hostname, lookupImpl) {
  const normalized = normalizeHostname(hostname);
  if (!normalized || isLocalHostname(normalized)) throw new Error("local host rejected");
  if (net.isIP(normalized)) {
    if (isPrivateIp(normalized)) throw new Error("private host rejected");
    return [{ address: normalized, family: net.isIP(normalized) }];
  }
  const addresses = await lookupImpl(normalized, { all: true, verbatim: true });
  const list = Array.isArray(addresses) ? addresses : [addresses];
  if (!list.length || list.some((item) => !item || !net.isIP(item.address) || isPrivateIp(item.address))) {
    throw new Error("private or non-public address rejected");
  }
  return list.map((item) => ({ address: normalizeHostname(item.address), family: Number(item.family) || net.isIP(item.address) }));
}

function isPrivateIp(value) {
  const address = normalizeHostname(value).split("%", 1)[0];
  if (net.isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || parts[0] === 0
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 192 && parts[1] === 0)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
      || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
      || parts[0] >= 224;
  }
  if (net.isIP(address) === 6) {
    const embeddedIpv4 = embeddedIpv4Address(address);
    if (embeddedIpv4) return isPrivateIp(embeddedIpv4);
    // Currently allocated global unicast space is 2000::/3. Conservatively
    // reject everything else plus non-routable/special sub-prefixes within it.
    if (!/^[23][0-9a-f]{3}:/.test(address)) return true;
    const groups = address.split(":");
    const first = Number.parseInt(groups[0], 16);
    const second = Number.parseInt(groups[1] || "0", 16);
    return first === 0x2002
      || (first === 0x2001 && (second === 0 || second === 2 || second === 0xdb8 || (second >= 0x10 && second <= 0x2f)));
  }
  return true;
}

function normalizeHostname(value) {
  return String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isLocalHostname(value) {
  const hostname = normalizeHostname(value);
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal");
}

function embeddedIpv4Address(value) {
  const address = normalizeHostname(value);
  for (const prefix of ["::ffff:", "64:ff9b::", "::"]) {
    if (!address.startsWith(prefix)) continue;
    const tail = address.slice(prefix.length);
    if (net.isIP(tail) === 4) return tail;
    const groups = tail.split(":");
    if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) continue;
    const high = Number.parseInt(groups[0], 16);
    const low = Number.parseInt(groups[1], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return "";
}

async function waitForClose(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const closed = Promise.resolve(promise).then(() => true);
  const result = await Promise.race([closed, timeout]);
  clearTimeout(timer);
  return result;
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null || child.signalCode != null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    child.once("close", () => finish(true));
    child.once("error", () => finish(true));
  });
}

function readExecutableVersion(file, args = ["--version"], timeout = 8000) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    execFile(file, args, { windowsHide: true, timeout }, (error, stdout, stderr) => {
      resolve(error ? "" : `${stdout || ""}${stderr || ""}`.trim().split(/\r?\n/)[0]);
    });
  });
}

module.exports = {
  MediaDownloadError,
  MediaDownloadService,
  PROGRESS_MARKER,
  POSTPROCESS_MARKER,
  OUTPUT_MARKER,
  buildAnalyzeArgs,
  buildDownloadArgs,
  cleanupCancelledArtifacts,
  fetchThumbnailDataUrl,
  isPrivateIp,
  nextAvailableMediaBase,
  normalizeMediaError,
  normalizeMediaMetadata,
  parseMediaMachineLine,
  progressFromMachineEvent,
  publishDownloadedOutput,
  publicMediaError,
  readExecutableVersion,
  redactMediaUrl,
  resolveBundledMediaTool,
  sanitizeWindowsFilename,
  summarizeDiagnosticText,
  validateMediaUrl,
  validatePublicMediaUrl,
  videoFormatSelector
};
