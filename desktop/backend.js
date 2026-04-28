"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { PDFDocument, degrees } = require("pdf-lib");

const OFFICE_FILTER_MAP = {
  docx: "MS Word 2007 XML",
  xlsx: "Calc MS Excel 2007 XML",
  pptx: "Impress MS PowerPoint 2007 XML",
  odt: "writer8"
};

const TOOL_DEFINITIONS = {
  libreOffice: {
    label: "LibreOffice",
    env: "SWIFTLOCAL_LIBREOFFICE",
    commands: ["soffice", "libreoffice"],
    windowsPaths: [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    ],
    versionArgs: ["--version"]
  },
  ffmpeg: {
    label: "FFmpeg",
    env: "SWIFTLOCAL_FFMPEG",
    commands: ["ffmpeg"],
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
    windowsPaths: [
      "C:\\Program Files\\qpdf\\bin\\qpdf.exe",
      "C:\\Program Files (x86)\\qpdf\\bin\\qpdf.exe"
    ],
    versionArgs: ["--version"]
  }
};

class BackendService {
  constructor(options = {}) {
    this.jobs = [];
    this.running = false;
    this.onJobsUpdated = options.onJobsUpdated;
    this.configPath = options.configPath || path.join(process.cwd(), ".swiftlocal-tools.json");
    this.defaultOutputDir = options.defaultOutputDir || path.join(process.cwd(), "SwiftLocal-output");
    this.config = loadConfig(this.configPath);
    this.tools = null;
  }

  async detectTools() {
    const entries = await Promise.all(
      Object.entries(TOOL_DEFINITIONS).map(async ([key, definition]) => [
        key,
        await detectTool(definition, this.config.toolPaths[key])
      ])
    );
    this.tools = Object.fromEntries(entries);
    return this.tools;
  }

  getConfig() {
    return {
      toolPaths: { ...this.config.toolPaths }
    };
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

  enqueue(payload) {
    const job = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: payload.type,
      inputPaths: payload.inputPaths || [],
      outputDir: payload.outputDir || this.defaultOutputDir,
      options: payload.options || {},
      status: "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      outputPaths: [],
      log: [],
      error: ""
    };
    this.jobs.unshift(job);
    this.emitJobs();
    this.runNext();
    return publicJob(job);
  }

  deleteJob(jobId) {
    const index = this.jobs.findIndex((item) => item.id === jobId);
    if (index === -1) {
      return false;
    }
    this.jobs.splice(index, 1);
    this.emitJobs();
    return true;
  }

  async runNext() {
    if (this.running) {
      return;
    }
    const job = this.jobs.find((item) => item.status === "queued");
    if (!job) {
      return;
    }

    this.running = true;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    this.emitJobs();

    try {
      if (!this.tools) {
        await this.detectTools();
      }
      await this.runJob(job);
      job.status = "done";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      job.log.push(job.error);
    } finally {
      job.finishedAt = new Date().toISOString();
      this.running = false;
      this.emitJobs();
      this.runNext();
    }
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
    if (job.type === "media-convert") {
      await this.runMediaConvert(job);
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
      const args = libreOfficeArgs(job.outputDir, inputPath, "pdf");
      const result = await runProcess(tool.path, args);
      job.log.push(result.output);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}.pdf`);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runPdfToDocx(job) {
    await this.runPdfToOffice({ ...job, options: { ...job.options, extension: "docx" } });
  }

  async runPdfToOffice(job) {
    const tool = requireTool(this.tools, "libreOffice");
    ensureOutputDir(job.outputDir);
    const extension = sanitizeOfficeExtension(job.options.extension || "docx");
    const convertTo = `${extension}:${OFFICE_FILTER_MAP[extension]}`;
    for (const inputPath of job.inputPaths) {
      const args = libreOfficeArgs(job.outputDir, inputPath, convertTo);
      const result = await runProcess(tool.path, args);
      job.log.push(result.output);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}.${extension}`);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runPdfMerge(job) {
    ensureOutputDir(job.outputDir);
    if (!job.inputPaths.length) {
      throw new Error("PDF merge requires at least one input file");
    }
    const outputPath = path.join(job.outputDir, "merged.pdf");
    const output = await PDFDocument.create();
    for (const inputPath of job.inputPaths) {
      const input = await loadPdf(inputPath);
      const copiedPages = await output.copyPages(input, input.getPageIndices());
      copiedPages.forEach((page) => output.addPage(page));
    }
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
      const indexes = ranges[i];
      const output = await PDFDocument.create();
      const pages = await output.copyPages(input, indexes);
      pages.forEach((page) => output.addPage(page));
      const label = pageRangeLabel(indexes);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_p${label}.pdf`);
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
      const input = await loadPdf(inputPath);
      const indexes = flattenPageRanges(parsePageRanges(job.options.pages || "", input.getPageCount()));
      indexes.forEach((index) => {
        const page = input.getPage(index);
        const current = page.getRotation().angle || 0;
        page.setRotation(degrees((current + angle) % 360));
      });
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_rotated.pdf`);
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
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_encrypted.pdf`);
      const args = ["--encrypt", password, password, "256", "--", inputPath, outputPath];
      const result = await runProcess(tool.path, args);
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
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_decrypted.pdf`);
      const args = password
        ? [`--password=${password}`, "--decrypt", inputPath, outputPath]
        : ["--decrypt", inputPath, outputPath];
      const result = await runProcess(tool.path, args);
      job.log.push(result.output || `decrypted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runPdfCompress(job) {
    ensureOutputDir(job.outputDir);
    for (const inputPath of job.inputPaths) {
      const input = await loadPdf(inputPath);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_compressed.pdf`);
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
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}.${extension}`);
      const args = ["-y", "-i", inputPath, outputPath];
      const result = await runProcess(tool.path, args);
      job.log.push(result.output);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runOcrImage(job) {
    const tool = requireTool(this.tools, "tesseract");
    ensureOutputDir(job.outputDir);
    const language = job.options.language || "eng";
    for (const inputPath of job.inputPaths) {
      const outputBase = path.join(job.outputDir, `${path.parse(inputPath).name}_ocr`);
      const args = [inputPath, outputBase, "-l", language];
      const result = await runProcess(tool.path, args);
      job.log.push(result.output);
      const outputPath = `${outputBase}.txt`;
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  emitJobs() {
    if (typeof this.onJobsUpdated === "function") {
      this.onJobsUpdated(this.getJobs());
    }
  }
}

async function detectTool(definition, configuredPath) {
  const candidates = buildCandidates(definition, configuredPath);
  for (const candidate of candidates) {
    const resolved = await resolveCandidate(candidate);
    if (!resolved) {
      continue;
    }
    const version = await readVersion(resolved, definition.versionArgs);
    return {
      available: true,
      label: definition.label,
      path: resolved,
      version,
      message: "available"
    };
  }
  return {
    available: false,
    label: definition.label,
    path: "",
    version: "",
    message: "not found"
  };
}

function buildCandidates(definition, configuredPath) {
  const candidates = [];
  if (configuredPath) {
    candidates.push(configuredPath);
  }
  if (process.env[definition.env]) {
    candidates.push(process.env[definition.env]);
  }
  if (process.platform === "win32") {
    candidates.push(...definition.windowsPaths);
  }
  candidates.push(...definition.commands);
  return candidates;
}

function loadConfig(configPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      toolPaths: parsed && typeof parsed.toolPaths === "object" ? parsed.toolPaths : {}
    };
  } catch {
    return { toolPaths: {} };
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

function ensureOutputDir(outputDir) {
  if (!outputDir) {
    throw new Error("Output folder is required");
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

function ensureOutputFile(outputPath, inputPath) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Conversion finished but output was not created for ${path.basename(inputPath)}`);
  }
}

function sanitizeExtension(extension) {
  const clean = String(extension).replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!clean) {
    throw new Error("Invalid output extension");
  }
  return clean;
}

function sanitizeOfficeExtension(extension) {
  const clean = sanitizeExtension(extension);
  if (!Object.prototype.hasOwnProperty.call(OFFICE_FILTER_MAP, clean)) {
    throw new Error(`Unsupported Office format: ${clean}. Allowed: ${Object.keys(OFFICE_FILTER_MAP).join(", ")}`);
  }
  return clean;
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
  try {
    return await PDFDocument.load(bytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF processing failed for ${path.basename(inputPath)}: ${detail}`);
  }
}

async function savePdf(pdfDoc, outputPath) {
  const bytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, bytes);
}

function libreOfficeArgs(outputDir, inputPath, convertTo) {
  const profileDir = path.join(outputDir, `${path.parse(inputPath).name}_lo_profile`);
  fs.mkdirSync(profileDir, { recursive: true });
  const profileUri = path.resolve(profileDir).replace(/\\/g, "/");
  return [
    "--headless",
    "--nologo",
    "--nodefault",
    "--norestore",
    "--nolockcheck",
    `-env:UserInstallation=file:///${profileUri}`,
    "--convert-to",
    convertTo,
    "--outdir",
    outputDir,
    inputPath
  ];
}

function publicJob(job) {
  return {
    id: job.id,
    type: job.type,
    inputPaths: job.inputPaths.map((item) => path.basename(item)),
    outputDir: job.outputDir,
    options: job.options,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    outputPaths: job.outputPaths
      .filter((item) => fs.existsSync(item))
      .map((item) => ({
        name: path.basename(item),
        path: item,
        size: fs.statSync(item).size
      })),
    log: job.log.slice(-6),
    error: job.error
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

function runProcess(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
    child.stderr.on("data", (chunk) => chunks.push(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = chunks.join("").trim();
      if (code === 0) {
        resolve({ output });
      } else {
        reject(new Error(output || `Process exited with code ${code}`));
      }
    });
  });
}

module.exports = { BackendService };
