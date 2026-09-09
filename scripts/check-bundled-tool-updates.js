"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const lockPath = path.join(projectRoot, "tools", "bundled-tools.lock.json");

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a value`);
  return process.argv[index + 1];
}

const reportPath = path.resolve(projectRoot, optionValue("--report", "bundled-tool-watch-report.md"));

function normalizeVersion(value) {
  const match = String(value || "").trim().match(/[0-9]+(?:\.[0-9]+)+/);
  if (!match) throw new Error(`Unable to parse version: ${value}`);
  return match[0];
}

function versionParts(value) {
  return normalizeVersion(value).split(".").map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] || 0;
    const bv = b[index] || 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

function maxVersion(values) {
  return values.reduce((best, current) => (compareVersions(current, best) > 0 ? current : best));
}

function stripHtml(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SwiftLocal-bundled-tool-watch/1",
      ...headers
    },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function latestGithubRelease(source) {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const apiUrl = `https://api.github.com/repos/${source.repository}/releases/latest`;
  const payload = JSON.parse(await fetchText(apiUrl, headers));
  if (!payload.tag_name || payload.draft || payload.prerelease) {
    throw new Error(`Latest GitHub release is not a stable tagged release for ${source.repository}`);
  }
  return {
    version: normalizeVersion(payload.tag_name),
    url: payload.html_url || `https://github.com/${source.repository}/releases/latest`
  };
}

async function latestHtmlVersion(source) {
  const text = stripHtml(await fetchText(source.url));
  const regex = new RegExp(source.pattern, "gi");
  const versions = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) versions.push(normalizeVersion(match[1]));
    if (match[0] === "") regex.lastIndex += 1;
  }
  if (!versions.length) throw new Error(`No version matched ${source.url}`);
  const version = source.selection === "first" ? versions[0] : maxVersion(versions);
  return { version, url: source.url };
}

async function fetchLatest(source) {
  if (source.type === "github-release") return latestGithubRelease(source);
  if (source.type === "html-regex") return latestHtmlVersion(source);
  throw new Error(`Unsupported upstream type: ${source.type}`);
}

function readProperty(object, propertyPath) {
  return propertyPath.split(".").reduce((value, key) => {
    if (value === null || value === undefined || !(key in value)) {
      throw new Error(`Missing JSON property: ${propertyPath}`);
    }
    return value[key];
  }, object);
}

function bundledVersion(tool) {
  const source = tool.bundledVersionSource;
  if (!source) return null;
  if (source.type !== "json") throw new Error(`Unsupported bundledVersionSource type: ${source.type}`);
  const filePath = path.resolve(projectRoot, source.path);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return normalizeVersion(readProperty(payload, source.property));
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function appendGithubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value)}\n`, "utf8");
}

async function main() {
  const config = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (config.schemaVersion !== 1 || !config.tools || typeof config.tools !== "object") {
    throw new Error("Unsupported or invalid tools/bundled-tools.lock.json");
  }

  const results = [];
  for (const [key, tool] of Object.entries(config.tools)) {
    let bundled = null;
    let bundledError = "";
    try {
      bundled = bundledVersion(tool);
    } catch (error) {
      bundledError = error.message;
    }

    const reviewed = normalizeVersion(tool.reviewedVersion);
    const bundledHint = tool.bundledVersionHint ? normalizeVersion(tool.bundledVersionHint) : null;
    try {
      const latest = await fetchLatest(tool.upstream);
      const reviewedBehind = compareVersions(latest.version, reviewed) > 0;
      const bundledComparable = bundled || bundledHint;
      const bundledBehind = bundledComparable ? compareVersions(latest.version, bundledComparable) > 0 : false;
      const actionRequired = reviewedBehind || bundledBehind;
      results.push({
        key,
        name: tool.name,
        bundled,
        bundledHint: bundledHint || "",
        bundledNote: tool.bundledVersionNote || "",
        bundledError,
        reviewed,
        latest: latest.version,
        releaseUrl: latest.url,
        actionRequired,
        error: ""
      });
    } catch (error) {
      results.push({
        key,
        name: tool.name,
        bundled,
        bundledHint: bundledHint || "",
        bundledNote: tool.bundledVersionNote || "",
        bundledError,
        reviewed,
        latest: "",
        releaseUrl: tool.upstream.url || (tool.upstream.repository ? `https://github.com/${tool.upstream.repository}/releases` : ""),
        actionRequired: false,
        error: error.message
      });
    }
  }

  const updates = results.filter((result) => result.actionRequired);
  const errors = results.filter((result) => result.error || result.bundledError);
  const actionable = updates.length > 0 || errors.length > 0;
  const fingerprintPayload = results.map((result) => ({
    key: result.key,
    bundled: result.bundled,
    bundledHint: result.bundledHint,
    bundledError: result.bundledError,
    reviewed: result.reviewed,
    latest: result.latest,
    actionRequired: result.actionRequired,
    error: result.error
  }));
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex").slice(0, 20);
  const checkedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const lines = [
    "# Bundled Tool Watch",
    "",
    `Checked: ${checkedAt}`,
    "",
    "> Notify-only maintenance check. This workflow never downloads, replaces, commits, or auto-merges bundled binaries.",
    "",
    "| Tool | Bundled / hint | Reviewed baseline | Latest upstream | Status |",
    "| --- | --- | --- | --- | --- |"
  ];

  for (const result of results) {
    const bundledDisplay = result.bundled
      ? result.bundled
      : result.bundledHint
        ? `${result.bundledHint} (hint only)`
        : "not lock-pinned";
    const latestDisplay = result.latest
      ? `[${result.latest}](${result.releaseUrl})`
      : "source check failed";
    let status = "Current against reviewed baseline";
    if (result.actionRequired) status = "**Review update**";
    if (result.error || result.bundledError) status = "**Check failed / incomplete**";
    lines.push(`| ${markdownCell(result.name)} | ${markdownCell(bundledDisplay)} | ${markdownCell(result.reviewed)} | ${latestDisplay} | ${status} |`);
  }

  if (updates.length) {
    lines.push("", "## Updates to review", "");
    for (const result of updates) {
      const fromVersion = result.bundled || result.bundledHint || result.reviewed;
      lines.push(`- **${result.name}: ${fromVersion} → ${result.latest}** — review release notes, update the appropriate lock/source, then run release smoke before shipping.`);
    }
  }

  const trackingNotes = results.filter((result) => !result.bundled && result.bundledNote);
  if (trackingNotes.length) {
    lines.push("", "## Bundled-version tracking gaps", "");
    for (const result of trackingNotes) {
      lines.push(`- **${result.name}:** ${result.bundledNote}`);
    }
  }

  if (errors.length) {
    lines.push("", "## Watch errors", "");
    for (const result of errors) {
      const details = [result.error, result.bundledError].filter(Boolean).join("; ");
      lines.push(`- **${result.name}:** ${details}`);
    }
  }

  lines.push(
    "",
    "## Maintenance rule",
    "",
    "After reviewing an upstream release, update `reviewedVersion` in `tools/bundled-tools.lock.json`. For lock-pinned tools, also update their real download/checksum lock before releasing a new SwiftLocal build.",
    "",
    `<!-- bundled-tool-watch:${fingerprint} -->`,
    ""
  );

  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  appendGithubOutput("actionable", actionable ? "true" : "false");
  appendGithubOutput("updates_count", updates.length);
  appendGithubOutput("errors_count", errors.length);
  appendGithubOutput("fingerprint", fingerprint);
  appendGithubOutput("report_path", path.relative(projectRoot, reportPath).replace(/\\/g, "/"));

  console.log(`Bundled Tool Watch: ${updates.length} update(s), ${errors.length} error(s).`);
  console.log(`Report: ${path.relative(projectRoot, reportPath)}`);
}

main().catch((error) => {
  console.error(`Bundled Tool Watch failed: ${error.message}`);
  process.exit(1);
});
