"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { PDFDocument, degrees } = require("pdf-lib");

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

class BackendService {
  constructor(options = {}) {
    this.jobs = [];
    this.running = false;
    this.onJobsUpdated = options.onJobsUpdated;
    this.configPath = options.configPath || path.join(process.cwd(), ".swiftlocal-tools.json");
    this.jobsStatePath = options.jobsStatePath || path.join(path.dirname(this.configPath), "jobs-state.json");
    this.defaultOutputDir = options.defaultOutputDir || path.join(process.cwd(), "SwiftLocal-output");
    this.config = loadConfig(this.configPath);
    if (this.config.defaultOutputDir && path.isAbsolute(this.config.defaultOutputDir)) {
      this.defaultOutputDir = this.config.defaultOutputDir;
    }
    this.tools = null;
    this.jobs = loadJobsState(this.jobsStatePath);
    // Persist repairs (e.g. running → failed after crash) immediately.
    saveJobsState(this.jobsStatePath, this.jobs);
    // Resume any work left queued from a previous session (FIFO: oldest first).
    if (this.jobs.some((job) => job.status === "queued")) {
      setImmediate(() => this.runNext());
    }
  }

  async detectTools() {
    const entries = await Promise.all(
      Object.entries(TOOL_DEFINITIONS).map(async ([key, definition]) => [
        key,
        await detectTool(definition, this.config.toolPaths[key])
      ])
    );
    this.tools = Object.fromEntries(entries);
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
      error: "",
      cancelRequested: false,
      _child: null
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
      job.log.push(job.error);
      job.finishedAt = new Date().toISOString();
      this.emitJobs();
      return publicJob(job);
    }
    if (job.status === "running") {
      job.cancelRequested = true;
      job.log.push(
        "取消請求已送出：外部工具（FFmpeg／LibreOffice／Tesseract 等）會盡快中止；本機純處理步驟需等目前段落結束。"
      );
      if (job._child && !job._child.killed) {
        try {
          job._child.kill();
        } catch {
          // ignore kill races
        }
      }
      this.emitJobs();
      return publicJob(job);
    }
    throw new Error("只能取消排隊中或執行中的任務");
  }

  async runNext() {
    if (this.running) {
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
    this.emitJobs();

    try {
      if (!this.tools) {
        await this.detectTools();
      }
      ensureJobNotCancelled(job);
      await this.runJob(job);
      ensureJobNotCancelled(job);
      job.status = "done";
    } catch (error) {
      if (isJobCancelledError(error) || job.cancelRequested) {
        job.status = "cancelled";
        job.error = "任務已取消";
      } else {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
      }
      job.log.push(job.error);
    } finally {
      job._child = null;
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
      const args = libreOfficeArgs(job.outputDir, inputPath, "pdf");
      const before = snapshotOutputDir(job.outputDir);
      const result = await runProcess(tool.path, args, job);
      const outputPath = resolveLibreOfficeOutput(job.outputDir, inputPath, "pdf", before);
      job.log.push(result.output || `converted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
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

  async runPdfToSearchablePdf(job) {
    ensureOutputDir(job.outputDir);
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const probe = fs.readFileSync(inputPath);
      if (pdfBytesLookEncrypted(probe)) {
        throw encryptedPdfError(path.basename(inputPath));
      }
      const outputPath = path.join(
        job.outputDir,
        `${path.parse(inputPath).name}_ocr_searchable.pdf`
      );
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
      const profileDir = path.join(job.outputDir, `${path.parse(inputPath).name}_lo_profile`);
      cleanupLoProfile(profileDir);
      const before = snapshotOutputDir(job.outputDir);
      const args = libreOfficeArgs(job.outputDir, inputPath, convertTo, profileDir);
      let loError = null;
      let loOutput = "";
      try {
        const result = await runProcess(tool.path, args, job, "LibreOffice");
        loOutput = result.output || "";
        const outputPath = resolveLibreOfficeOutput(job.outputDir, inputPath, extension, before);
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 64) {
          removeIncompleteOfficeOutput(outputPath);
          throw new Error(formatProcessError({
            outputMissing: true,
            expectedOutput: path.basename(outputPath),
            stdout: loOutput,
            toolLabel: "LibreOffice"
          }));
        }
        job.log.push(loOutput || `converted: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
        job.outputPaths.push(outputPath);
        continue;
      } catch (error) {
        if (isJobCancelledError(error)) {
          throw error;
        }
        loError = error;
      } finally {
        cleanupLoProfile(profileDir);
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
      ensureJobNotCancelled(job);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_encrypted.pdf`);
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
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_decrypted.pdf`);
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
      ensureJobNotCancelled(job);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}.${extension}`);
      const args = buildFfmpegMediaArgs(inputPath, outputPath, { ...job.options, extension });
      const result = await runProcess(tool.path, args, job);
      job.log.push(result.output || `media: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runImageConvert(job) {
    const tool = requireTool(this.tools, "ffmpeg");
    ensureOutputDir(job.outputDir);
    const extension = sanitizeExtension(job.options.extension || "jpg");
    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}.${extension}`);
      const args = ["-y", "-i", inputPath, outputPath];
      const result = await runProcess(tool.path, args, job);
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
      ensureJobNotCancelled(job);
      const outputBase = path.join(job.outputDir, `${path.parse(inputPath).name}_ocr`);
      const args = [inputPath, outputBase, "-l", language];
      const tessdataDir = bundledTessdataDir(tool.path);
      if (tessdataDir) {
        args.push("--tessdata-dir", tessdataDir);
      }
      const result = await runProcess(tool.path, args, job);
      job.log.push(result.output);
      const outputPath = `${outputBase}.txt`;
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
    }
  }

  async runOcrPdf(job) {
    const tool = requireTool(this.tools, "tesseract");
    ensureOutputDir(job.outputDir);
    const language = String(job.options.language || "eng").trim() || "eng";
    const maxPages = sanitizeOcrPdfMaxPages(job.options.maxPages);
    const tessdataDir = bundledTessdataDir(tool.path);

    for (const inputPath of job.inputPaths) {
      ensureJobNotCancelled(job);
      const probe = fs.readFileSync(inputPath);
      if (pdfBytesLookEncrypted(probe)) {
        throw encryptedPdfError(path.basename(inputPath));
      }

      const pageDir = path.join(job.outputDir, `${path.parse(inputPath).name}_ocr_pages`);
      fs.mkdirSync(pageDir, { recursive: true });
      const pageImages = await renderPdfPagesToPng(inputPath, pageDir, maxPages, job);
      if (!pageImages.length) {
        throw new Error(`PDF 沒有可 OCR 的頁面：${path.basename(inputPath)}`);
      }
      job.log.push(`render: ${path.basename(inputPath)} ${pageImages.length} page(s)`);

      const pageTexts = [];
      for (let i = 0; i < pageImages.length; i += 1) {
        ensureJobNotCancelled(job);
        const pageBase = path.join(pageDir, `page_${String(i + 1).padStart(3, "0")}_ocr`);
        const args = [pageImages[i], pageBase, "-l", language];
        if (tessdataDir) {
          args.push("--tessdata-dir", tessdataDir);
        }
        const result = await runProcess(tool.path, args, job);
        if (result.output) {
          job.log.push(result.output);
        }
        const textPath = `${pageBase}.txt`;
        const text = fs.existsSync(textPath) ? fs.readFileSync(textPath, "utf8") : "";
        pageTexts.push(`--- Page ${i + 1} ---\n${text.trim()}`);
      }

      const outputPath = path.join(job.outputDir, `${path.parse(inputPath).name}_ocr.txt`);
      fs.writeFileSync(outputPath, `${pageTexts.join("\n\n").trim()}\n`, "utf8");
      ensureOutputFile(outputPath, inputPath);
      job.outputPaths.push(outputPath);
      job.log.push(`ocr-pdf: ${path.basename(inputPath)} -> ${path.basename(outputPath)} (${pageImages.length} page(s))`);
    }
  }

  emitJobs() {
    saveJobsState(this.jobsStatePath, this.jobs);
    if (typeof this.onJobsUpdated === "function") {
      this.onJobsUpdated(this.getJobs());
    }
  }
}

function loadJobsState(statePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw && raw.jobs) ? raw.jobs : [];
    return list
      .map((item) => normalizePersistedJob(item))
      .filter(Boolean)
      .slice(0, MAX_PERSISTED_JOBS);
  } catch {
    return [];
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
  // Interrupted mid-run jobs cannot resume safely — mark failed.
  if (status === "running") {
    status = "failed";
    error = error || "應用程式重啟時任務中斷";
    log.push(error);
    finishedAt = finishedAt || new Date().toISOString();
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
    options: item.options && typeof item.options === "object" ? { ...item.options } : {},
    status,
    createdAt: String(item.createdAt || new Date().toISOString()),
    startedAt: item.startedAt ? String(item.startedAt) : null,
    finishedAt,
    outputPaths,
    log,
    error,
    cancelRequested: false,
    _child: null
  };
}

function saveJobsState(statePath, jobs) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      jobs: jobs.slice(0, MAX_PERSISTED_JOBS).map((job) => ({
        id: job.id,
        type: job.type,
        inputPaths: job.inputPaths || [],
        outputDir: job.outputDir || "",
        options: job.options || {},
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        outputPaths: job.outputPaths || [],
        log: (job.log || []).slice(-12),
        error: job.error || ""
      }))
    };
    fs.writeFileSync(statePath, JSON.stringify(payload, null, 2), "utf8");
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
    return {
      available: true,
      label: definition.label,
      path: normalized,
      version,
      source: candidate.source,
      message: "available"
    };
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

function sanitizeOcrPdfMaxPages(value) {
  const parsed = Number.parseInt(String(value || OCR_PDF_MAX_PAGES_DEFAULT), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return OCR_PDF_MAX_PAGES_DEFAULT;
  }
  return Math.min(parsed, OCR_PDF_MAX_PAGES_HARD_LIMIT);
}

async function renderPdfPagesToPng(inputPath, pageDir, maxPages, job) {
  ensureJobNotCancelled(job);
  let createCanvas;
  try {
    ({ createCanvas } = require("@napi-rs/canvas"));
  } catch (error) {
    throw new Error("PDF OCR 需要 @napi-rs/canvas，請執行 npm install");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(inputPath));
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    useWorkerFetch: false,
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
    throw new Error(`無法讀取 PDF「${path.basename(inputPath)}」：${detail}`);
  }

  const limit = Math.min(pdf.numPages, maxPages);
  const images = [];
  try {
    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      ensureJobNotCancelled(job);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_PDF_RENDER_SCALE });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const imagePath = path.join(pageDir, `page_${String(pageNumber).padStart(3, "0")}.png`);
      fs.writeFileSync(imagePath, canvas.toBuffer("image/png"));
      images.push(imagePath);
    }
  } finally {
    await loadingTask.destroy();
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

async function extractPdfText(inputPath) {
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

  const text = await extractPdfText(inputPath);
  const lowText = !String(text || "").trim() || String(text).trim().length < 40;
  const force = mode === "force" || mode === "on" || mode === "true" || mode === "1" || outMode === "searchable";
  const off = mode === "off" || mode === "false" || mode === "0" || mode === "never";
  const wantOcr = !off && (force || ((mode === "auto" || !mode) && lowText) || outMode === "searchable");
  const docxPath = path.join(job.outputDir, `${path.parse(inputPath).name}.docx`);
  const searchablePath = path.join(job.outputDir, `${path.parse(inputPath).name}_ocr_searchable.pdf`);

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
  const language = String(job.options.language || "eng").trim() || "eng";
  const maxPages = sanitizeOcrPdfMaxPages(job.options.maxPages);
  const tessdataDir = bundledTessdataDir(tool.path);
  const pageDir = path.join(job.outputDir, `${path.parse(inputPath).name}_ocr_searchable_work`);
  fs.mkdirSync(pageDir, { recursive: true });
  try {
    const pageImages = await renderPdfPagesToPng(inputPath, pageDir, maxPages, job);
    if (!pageImages.length) {
      throw new Error(`PDF 沒有可 OCR 的頁面：${path.basename(inputPath)}`);
    }
    job.log.push(`render: ${path.basename(inputPath)} ${pageImages.length} page(s)`);
    const merged = await PDFDocument.create();
    for (let i = 0; i < pageImages.length; i += 1) {
      ensureJobNotCancelled(job);
      const pageBase = path.join(pageDir, `page_${String(i + 1).padStart(3, "0")}_searchable`);
      const args = [pageImages[i], pageBase, "-l", language, "pdf"];
      if (tessdataDir) {
        args.push("--tessdata-dir", tessdataDir);
      }
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
    try {
      fs.rmSync(pageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function ocrPdfToText(service, job, inputPath) {
  const tool = requireTool(service.tools, "tesseract");
  const language = String(job.options.language || "eng").trim() || "eng";
  const maxPages = sanitizeOcrPdfMaxPages(job.options.maxPages);
  const tessdataDir = bundledTessdataDir(tool.path);
  const pageDir = path.join(job.outputDir, `${path.parse(inputPath).name}_ocr_docx_pages`);
  fs.mkdirSync(pageDir, { recursive: true });
  try {
    const pageImages = await renderPdfPagesToPng(inputPath, pageDir, maxPages, job);
    if (!pageImages.length) {
      throw new Error(`PDF 沒有可 OCR 的頁面：${path.basename(inputPath)}`);
    }
    const pageTexts = [];
    for (let i = 0; i < pageImages.length; i += 1) {
      ensureJobNotCancelled(job);
      const pageBase = path.join(pageDir, `page_${String(i + 1).padStart(3, "0")}_ocr`);
      const args = [pageImages[i], pageBase, "-l", language];
      if (tessdataDir) {
        args.push("--tessdata-dir", tessdataDir);
      }
      await runProcess(tool.path, args, job, "Tesseract");
      const textPath = `${pageBase}.txt`;
      const pageText = fs.existsSync(textPath) ? fs.readFileSync(textPath, "utf8") : "";
      pageTexts.push(`--- Page ${i + 1} ---\n${pageText.trim()}`);
    }
    return `${pageTexts.join("\n\n").trim()}\n`;
  } finally {
    try {
      fs.rmSync(pageDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
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
  const resolvedProfile = profileDir || path.join(outputDir, `${path.parse(inputPath).name}_lo_profile`);
  fs.mkdirSync(resolvedProfile, { recursive: true });
  const profileUri = path.resolve(resolvedProfile).replace(/\\/g, "/");
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
  return parts.join("\n");
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

function runProcess(file, args, job, toolLabel = "外部程序") {
  return new Promise((resolve, reject) => {
    if (job && job.cancelRequested) {
      reject(new JobCancelledError());
      return;
    }
    let child;
    try {
      child = spawn(file, args, { windowsHide: true });
    } catch (error) {
      const notFound = error && (error.code === "ENOENT" || /ENOENT/i.test(String(error)));
      const permissionDenied = error && (error.code === "EACCES" || /EACCES|permission/i.test(String(error)));
      reject(new Error(formatProcessError({
        notFound,
        permissionDenied,
        executable: file,
        toolLabel,
        stdout: String(error && error.message ? error.message : error || "")
      })));
      return;
    }
    if (job) {
      job._child = child;
    }
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
    child.stderr.on("data", (chunk) => chunks.push(chunk.toString()));
    child.on("error", (error) => {
      if (job) {
        job._child = null;
      }
      const notFound = error && (error.code === "ENOENT" || /ENOENT/i.test(String(error)));
      const permissionDenied = error && (error.code === "EACCES" || /EACCES|permission/i.test(String(error)));
      reject(new Error(formatProcessError({
        notFound,
        permissionDenied,
        executable: file,
        toolLabel,
        stdout: String(error && error.message ? error.message : error || "")
      })));
    });
    child.on("close", (code) => {
      if (job) {
        job._child = null;
      }
      const output = chunks.join("").trim();
      if (job && job.cancelRequested) {
        reject(new JobCancelledError());
        return;
      }
      // qpdf uses exit 3 for "succeeded with warnings" (still produced output).
      const isQpdf = /qpdf/i.test(path.basename(file || ""));
      const qpdfWarningOk = isQpdf && code === 3 && /succeeded with warnings/i.test(output);
      if (code === 0 || qpdfWarningOk) {
        if (/impl_store|error area:io|class:write/i.test(output)) {
          reject(new Error(formatProcessError({
            returncode: code,
            stdout: output,
            executable: file,
            toolLabel
          })));
          return;
        }
        resolve({ output });
      } else {
        reject(new Error(formatProcessError({
          returncode: code,
          stdout: output,
          executable: file,
          toolLabel: isQpdf ? "QPDF" : toolLabel
        })));
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
  removeIncompleteOfficeOutput,
  cleanupLoProfile,
  sanitizeMediaBitrate,
  sanitizeGifFps,
  loadJobsState,
  saveJobsState,
  normalizePersistedJob,
  JobCancelledError
};
