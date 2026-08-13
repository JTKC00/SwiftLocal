"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, test } = require("node:test");
const {
  PROGRESS_MARKER,
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
  redactMediaUrl,
  resolveBundledMediaTool,
  sanitizeWindowsFilename,
  summarizeDiagnosticText,
  validateMediaUrl,
  validatePublicMediaUrl,
  videoFormatSelector
} = require("../../desktop/media-download");

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("online media downloader", () => {
  test("accepts only credential-free HTTP(S) media URLs", () => {
    assert.equal(validateMediaUrl("https://example.com/watch?v=1"), "https://example.com/watch?v=1");
    for (const invalid of ["", "ftp://example.com/file", "file:///tmp/a", "https://user:secret@example.com/a", "not a url"]) {
      assert.throws(() => validateMediaUrl(invalid), /http 或 https/);
    }
    for (const privateUrl of ["http://localhost/a", "http://127.0.0.1/a", "http://10.0.0.1/a", "http://[::1]/a"]) {
      assert.throws(() => validateMediaUrl(privateUrl), /公開存取/);
    }
  });

  test("resolves media hosts and rejects domains pointing to private addresses", async () => {
    await assert.rejects(
      () => validatePublicMediaUrl("https://media.example/video", async () => [{ address: "169.254.169.254", family: 4 }]),
      /公開存取/
    );
    await assert.doesNotReject(
      () => validatePublicMediaUrl("https://media.example/video", async () => [{ address: "93.184.216.34", family: 4 }])
    );
  });

  test("does not allow environment variables to replace bundled executables", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-media-tools-test-"));
    temporaryDirectories.push(directory);
    const oldYtDlp = process.env.SWIFTLOCAL_YTDLP;
    const oldDeno = process.env.SWIFTLOCAL_DENO;
    process.env.SWIFTLOCAL_YTDLP = process.execPath;
    process.env.SWIFTLOCAL_DENO = process.execPath;
    try {
      assert.equal(resolveBundledMediaTool("yt-dlp", { resourcesPath: directory, projectRoot: directory }), "");
      assert.equal(resolveBundledMediaTool("deno", { resourcesPath: directory, projectRoot: directory }), "");
    } finally {
      if (oldYtDlp == null) delete process.env.SWIFTLOCAL_YTDLP;
      else process.env.SWIFTLOCAL_YTDLP = oldYtDlp;
      if (oldDeno == null) delete process.env.SWIFTLOCAL_DENO;
      else process.env.SWIFTLOCAL_DENO = oldDeno;
    }
  });

  test("prefers a packaged resourcesPath tool and requires an executable file", () => {
    const resources = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-media-resources-test-"));
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-media-project-test-"));
    temporaryDirectories.push(resources, project);
    const executable = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    const packaged = path.join(resources, "tools", "yt-dlp", "bin", executable);
    const development = path.join(project, "tools", "yt-dlp", "bin", executable);
    fs.mkdirSync(path.dirname(packaged), { recursive: true });
    fs.mkdirSync(path.dirname(development), { recursive: true });
    fs.writeFileSync(packaged, "packaged");
    fs.writeFileSync(development, "development");
    if (process.platform !== "win32") {
      fs.chmodSync(packaged, 0o755);
      fs.chmodSync(development, 0o755);
    }
    assert.equal(resolveBundledMediaTool("yt-dlp", { resourcesPath: resources, projectRoot: project }), packaged);
    if (process.platform !== "win32") {
      fs.chmodSync(packaged, 0o644);
      assert.equal(resolveBundledMediaTool("yt-dlp", { resourcesPath: resources, projectRoot: project }), development);
    }
  });

  test("builds a metadata-only analysis without playlists, plugins, or user config", () => {
    const args = buildAnalyzeArgs("https://example.com/v", { denoPath: "/tools/deno" });
    for (const flag of ["--ignore-config", "--no-plugin-dirs", "--no-playlist", "--dump-single-json", "--skip-download", "--output-na-placeholder", "--no-js-runtimes", "--js-runtimes"]) {
      assert.ok(args.includes(flag), `missing ${flag}`);
    }
    assert.equal(args.at(-1), "https://example.com/v");
  });

  test("normalizes safe metadata and chooses 1080p as the preferred available quality", () => {
    const metadata = normalizeMediaMetadata({
      id: "one",
      title: "公開影片",
      extractor_key: "Example",
      uploader: "作者",
      duration: 61,
      formats: [
        { format_id: "a", acodec: "aac", vcodec: "none", filesize: 100 },
        { format_id: "v1", acodec: "none", vcodec: "h264", height: 720, filesize_approx: 200 },
        { format_id: "v2", acodec: "none", vcodec: "av01", height: 1080, filesize: 300 }
      ]
    });
    assert.deepEqual(metadata.qualities, { p720: true, p1080: true, best: true, maxHeight: 1080 });
    assert.equal(metadata.defaultQuality, "1080");
    assert.equal(metadata.hasAudio, true);
    assert.equal(metadata.hasVideo, true);
    assert.equal(metadata.estimatedBytes, 300);
    assert.equal("formats" in metadata, false);
    assert.equal(normalizeMediaMetadata({ title: "直播", duration: null, formats: [{ acodec: "aac", vcodec: "none" }] }).duration, null);
  });

  test("rejects playlists and metadata with no downloadable formats", () => {
    assert.throws(() => normalizeMediaMetadata({ _type: "playlist", entries: [{}] }), /播放清單/);
    assert.throws(() => normalizeMediaMetadata({ id: "x", formats: [] }), /影音格式/);
  });

  test("builds MP4-prioritized video and MP3 audio commands with machine progress", () => {
    const common = {
      outputTemplate: "C:\\Downloads\\sample.%(ext)s",
      ffmpegPath: "C:\\tools\\ffmpeg.exe",
      denoPath: "C:\\tools\\deno.exe"
    };
    const video = buildDownloadArgs("https://example.com/v", { ...common, mode: "video", resolution: "720" });
    assert.match(video[video.indexOf("--format") + 1], /height<=720/);
    assert.equal(video[video.indexOf("--merge-output-format") + 1], "mp4");
    assert.ok(video.some((value) => String(value).includes(PROGRESS_MARKER)));
    for (const flag of ["--ignore-config", "--no-playlist", "--no-overwrites", "--ffmpeg-location"]) assert.ok(video.includes(flag));
    const proxied = buildAnalyzeArgs("https://example.com/v", { denoPath: "/tools/deno", proxyUrl: "http://swiftlocal:secret@127.0.0.1:1234" });
    assert.equal(proxied[proxied.indexOf("--proxy") + 1], "http://swiftlocal:secret@127.0.0.1:1234");

    const audio = buildDownloadArgs("https://example.com/v", { ...common, mode: "audio", audioFormat: "mp3" });
    assert.ok(audio.includes("--extract-audio"));
    assert.equal(audio[audio.indexOf("--audio-format") + 1], "mp3");
  });

  test("uses bounded resolution selectors and safe Windows filenames", () => {
    assert.match(videoFormatSelector("1080"), /height<=1080/);
    assert.doesNotMatch(videoFormatSelector("best"), /height<=/);
    assert.equal(sanitizeWindowsFilename("CON."), "_CON");
    assert.equal(sanitizeWindowsFilename("bad:name*"), "bad_name_");
    assert.ok(Array.from(sanitizeWindowsFilename("字".repeat(500))).length <= 160);
    assert.ok(Buffer.byteLength(sanitizeWindowsFilename("繁體中文".repeat(100))) <= 160);
  });

  test("avoids overwriting completed files and cleans only operation-owned files after cancel", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-media-test-"));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, "影片.mp4"), "old");
    assert.equal(nextAvailableMediaBase(directory, "影片"), "影片 (2)");
    const workDir = fs.mkdtempSync(path.join(directory, ".swiftlocal-media-"));
    fs.writeFileSync(path.join(workDir, "影片 (2).part"), "partial");
    fs.writeFileSync(path.join(workDir, "影片 (2).f137.mp4.part-Frag1"), "fragment");
    fs.writeFileSync(path.join(workDir, "影片 (2).temp.mp4"), "postprocess temp");
    fs.writeFileSync(path.join(directory, "影片 (2).mp4.part"), "external user file");
    fs.writeFileSync(path.join(directory, "影片 (2).notes.txt"), "user file");
    fs.writeFileSync(path.join(directory, "unrelated.tmp"), "keep");
    const removed = cleanupCancelledArtifacts({ outputDir: directory, workDir });
    assert.deepEqual(removed.sort(), ["影片 (2).f137.mp4.part-Frag1", "影片 (2).part", "影片 (2).temp.mp4"]);
    assert.equal(fs.existsSync(workDir), false);
    assert.equal(fs.existsSync(path.join(directory, "影片.mp4")), true);
    assert.equal(fs.existsSync(path.join(directory, "影片 (2).mp4.part")), true);
    assert.equal(fs.existsSync(path.join(directory, "影片 (2).notes.txt")), true);
    assert.equal(fs.existsSync(path.join(directory, "unrelated.tmp")), true);

    const publishDir = fs.mkdtempSync(path.join(directory, ".swiftlocal-media-"));
    const source = path.join(publishDir, "影片 (2).mp4");
    fs.writeFileSync(source, "new media");
    fs.writeFileSync(path.join(directory, "影片 (2).mp4"), "raced existing media");
    const published = publishDownloadedOutput({ outputDir: directory, workDir: publishDir, safeTitle: "影片", baseName: "影片 (2)" }, source);
    assert.equal(path.basename(published), "影片 (3).mp4");
    assert.equal(fs.readFileSync(path.join(directory, "影片 (2).mp4"), "utf8"), "raced existing media");

    const symlinkDir = fs.mkdtempSync(path.join(directory, ".swiftlocal-media-"));
    const externalTarget = path.join(directory, "outside.mp4");
    const linkedOutput = path.join(symlinkDir, "影片.mp4");
    fs.writeFileSync(externalTarget, "outside media");
    let symlinkCreated = false;
    try {
      fs.symlinkSync(externalTarget, linkedOutput);
      symlinkCreated = true;
    } catch (error) {
      // Windows may disable unprivileged symlink creation outside Developer Mode.
      if (process.platform !== "win32" || !error || !["EPERM", "EACCES"].includes(error.code)) throw error;
    }
    if (symlinkCreated) {
      assert.throws(
        () => publishDownloadedOutput({ outputDir: directory, workDir: symlinkDir, safeTitle: "影片", baseName: "影片" }, linkedOutput),
        /檔案路徑無效/
      );
      assert.equal(fs.readFileSync(externalTarget, "utf8"), "outside media");
    }

    const externalWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-media-external-workdir-"));
    temporaryDirectories.push(externalWorkDir);
    const linkedWorkDir = path.join(directory, ".swiftlocal-media-linked-workdir");
    const externalOutput = path.join(externalWorkDir, "影片.mp4");
    fs.writeFileSync(externalOutput, "external workdir media");
    let workDirSymlinkCreated = false;
    try {
      fs.symlinkSync(externalWorkDir, linkedWorkDir, process.platform === "win32" ? "junction" : "dir");
      workDirSymlinkCreated = true;
    } catch (error) {
      if (process.platform !== "win32" || !error || !["EPERM", "EACCES"].includes(error.code)) throw error;
    }
    if (workDirSymlinkCreated) {
      assert.throws(
        () => publishDownloadedOutput({ outputDir: directory, workDir: linkedWorkDir, safeTitle: "影片", baseName: "影片" }, externalOutput),
        /檔案路徑無效/
      );
      assert.equal(fs.readFileSync(externalOutput, "utf8"), "external workdir media");
    }
  });

  test("parses real machine values without inventing percent, speed, or ETA", () => {
    const unknown = parseMediaMachineLine(`${PROGRESS_MARKER}{"status":"downloading","downloadedBytes":10,"totalBytes":null,"speed":null,"eta":null,"vcodec":"h264","acodec":"none"}`);
    const unknownProgress = progressFromMachineEvent(unknown, "op");
    assert.equal(unknownProgress.percentage, null);
    assert.equal(unknownProgress.speed, null);
    assert.equal(unknownProgress.eta, null);

    const known = progressFromMachineEvent({ type: "download", payload: { downloadedBytes: 50, totalBytes: 100, speed: 20, eta: 3, vcodec: "none", acodec: "aac" } }, "op");
    assert.equal(known.percentage, 50);
    assert.equal(known.phase, "audio");
    assert.equal(known.speed, 20);
    assert.equal(known.eta, 3);
  });

  test("maps common failures to actionable Traditional Chinese errors", () => {
    assert.equal(normalizeMediaError({ stderr: "ERROR: Requested format is not available" }).code, "no_format");
    assert.equal(normalizeMediaError({ stderr: "Please sign in to continue" }).code, "login_required");
    assert.equal(normalizeMediaError({ stderr: "No space left on device" }).code, "disk_space");
    assert.equal(normalizeMediaError({ stderr: "Unsupported URL" }).code, "unsupported");
  });

  test("redacts URL secrets from diagnostics", () => {
    const redacted = redactMediaUrl("https://example.com/watch?token=secret&id=1#private");
    assert.doesNotMatch(redacted, /secret|token|private/);
    assert.match(redacted, /example\.com/);
    const summary = summarizeDiagnosticText([
      "Authorization: Bearer super-secret",
      "Cookie: session=private-cookie",
      "token=plain-secret",
      "X-Api-Key: secret-key",
      "client_secret=topsecret",
      "session=leak",
      "{\"auth_token\": \"json secret with spaces\"}",
      "{\"client_secret\":123456}",
      "{\"session\":null}",
      "{\"token\":{\"value\":\"nested-secret\"}}",
      "{\"client_secret\":\"abc\\\\\\\"def-secret\"}",
      "X-Api-Key = equals-secret",
      "token: colon-secret",
      "{\"client_secret\":\n  \"multiline-secret\"}",
      "{\"token\": {\n  \"value\": \"nested-multiline-secret\"\n}}",
      "https://example.com/watch?signature=url-secret"
    ].join("\n"));
    assert.doesNotMatch(summary, /super-secret|private-cookie|plain-secret|secret-key|topsecret|leak|json secret|123456|null|nested-secret|def-secret|equals-secret|colon-secret|multiline-secret|nested-multiline-secret|url-secret/);
    assert.match(summary, /\[REDACTED\]/);

    const multilineSummary = summarizeDiagnosticText([
      "download failed with structured detail:",
      "{\"client_secret\":",
      "  \"standalone-multiline-secret\"",
      "}",
      "later diagnostic line"
    ].join("\n"));
    assert.doesNotMatch(multilineSummary, /standalone-multiline-secret|later diagnostic line/);
    assert.match(multilineSummary, /client_secret=\[REDACTED\]/);
  });

  test("blocks private thumbnail hosts and accepts a bounded public image", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.2",
      "::1",
      "fd00::1",
      "fec0::1",
      "::ffff:7f00:1",
      "::127.0.0.1",
      "::7f00:1",
      "64:ff9b::7f00:1"
    ]) assert.equal(isPrivateIp(address), true);
    assert.equal(isPrivateIp("93.184.216.34"), false);
    assert.equal(isPrivateIp("2001:4860:4860::8888"), false);
    assert.equal(isPrivateIp("64:ff9b::5db8:d822"), false);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const value = await fetchThumbnailDataUrl("https://example.com/thumb.jpg", {
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchImpl: async () => new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(bytes.length) } })
    });
    assert.equal(value, `data:image/jpeg;base64,${bytes.toString("base64")}`);
  });
});
