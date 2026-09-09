"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..", "frontend");
const sessionTokenPath = path.resolve(__dirname, "..", "backend", "temp", "session-token");
const port = Number(process.env.PORT) || 4173;
const host = "127.0.0.1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ico", "image/x-icon"]
]);

function createFrontendServer({ frontendRoot = root, tokenPath = sessionTokenPath } = {}) {
  return http.createServer((request, response) => {
    // A loopback listener can still receive requests addressed to a rebinding domain.
    const authority = String(request.headers.host || "").toLowerCase();
    if (!/^(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/.test(authority)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("Forbidden host");
      return;
    }
    let pathname;
    try {
      const base = "http://swiftlocal.invalid";
      const requestUrl = new URL(request.url, base);
      // This server accepts direct origin-form requests, not proxy/authority targets.
      if (!request.url.startsWith("/") || request.url.startsWith("//") || requestUrl.origin !== base) {
        throw new Error("Invalid request target");
      }
      pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname.includes("\0")) throw new Error("Invalid pathname");
    } catch {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("Bad request");
      return;
    }
    if (pathname === "/__swiftlocal/session-token") {
      const fetchSite = String(request.headers["sec-fetch-site"] || "");
      const origin = request.headers.origin;
      if (request.method !== "GET" || (fetchSite && fetchSite !== "same-origin")
        || (origin && origin !== `http://${authority}`)) {
        response.writeHead(403, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ detail: "Forbidden" }));
        return;
      }
      fs.readFile(tokenPath, "utf8", (error, token) => {
        if (error || !String(token || "").trim()) {
          response.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          response.end(JSON.stringify({ detail: "SwiftLocal backend is not running" }));
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ token: String(token).trim() }));
      });
      return;
    }
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const requestedPath = path.resolve(frontendRoot, relativePath);

    if (!requestedPath.startsWith(`${frontendRoot}${path.sep}`) && requestedPath !== frontendRoot) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    fs.stat(requestedPath, (statError, stats) => {
      if (statError) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const filePath = stats.isDirectory() ? path.join(requestedPath, "index.html") : requestedPath;
      fs.readFile(filePath, (readError, content) => {
        if (readError) {
          response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Unable to read file");
          return;
        }

        const type = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
        response.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-store"
        });
        response.end(content);
      });
    });
  });
}

if (require.main === module) {
  const server = createFrontendServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Set PORT=4174 and try again.`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`SwiftLocal is running at http://${host}:${port}`);
  });
}

module.exports = { createFrontendServer };
