"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");

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
      const args = ["--headless", "--convert-to", "pdf", "--outdir", job.outputDir, inputPath];
      const result = await runProcess(tool.path, args);
      job.log.push(result.output);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}.pdf`);
      job.outputPaths.push(outputPath);
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
      job.outputPaths.push(`${outputBase}.txt`);
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

function sanitizeExtension(extension) {
  const clean = String(extension).replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!clean) {
    throw new Error("Invalid output extension");
  }
  return clean;
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
