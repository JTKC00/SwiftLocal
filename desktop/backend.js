"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { PDFDocument, degrees } = require("pdf-lib");

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
    ensureOutputDir(job.outputDir);
    for (const inputPath of job.inputPaths) {
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}.docx`);
      const text = await extractPdfText(inputPath);
      writeTextDocx(outputPath, text || path.basename(inputPath));
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
      job.log.push(`converted text: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
    }
  }

  async runPdfToOffice(job) {
    throw new Error("PDF to Office formats other than DOCX are not supported in the desktop app. Use PDF → DOCX for text extraction.");
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

async function extractPdfText(inputPath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(inputPath));
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: 0
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
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
