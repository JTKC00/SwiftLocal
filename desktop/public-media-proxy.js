"use strict";

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const crypto = require("node:crypto");

const PROXY_TIMEOUT_MS = 20_000;

async function createPublicMediaProxy(options = {}) {
  if (typeof options.resolveHost !== "function") throw new TypeError("resolveHost is required");
  const token = crypto.randomBytes(24).toString("base64url");
  const expectedAuthorization = `Basic ${Buffer.from(`swiftlocal:${token}`).toString("base64")}`;
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    void forwardHttpRequest(request, response, options.resolveHost, expectedAuthorization);
  });

  server.on("connect", (request, clientSocket, head) => {
    void forwardConnectRequest(request, clientSocket, head, options.resolveHost, expectedAuthorization);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("media proxy did not bind a TCP port");
  let closed = false;
  return {
    url: `http://swiftlocal:${token}@127.0.0.1:${address.port}`,
    async close() {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

async function forwardConnectRequest(request, clientSocket, head, resolveHost, expectedAuthorization) {
  if (!authorized(request, expectedAuthorization)) {
    rejectSocket(clientSocket, 407, "Proxy Authentication Required", "Proxy-Authenticate: Basic realm=SwiftLocal\r\n");
    return;
  }
  let target;
  try {
    target = parseConnectTarget(request.url);
    const addresses = await resolveHost(target.hostname);
    const selected = chooseAddress(addresses);
    const upstream = net.connect({
      host: selected.address,
      port: target.port,
      family: selected.family
    });
    upstream.setTimeout(PROXY_TIMEOUT_MS, () => upstream.destroy(new Error("proxy upstream timeout")));
    upstream.once("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: SwiftLocal\r\n\r\n");
      if (head && head.length) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.once("error", () => {
      if (!clientSocket.destroyed) rejectSocket(clientSocket, 502, "Bad Gateway");
    });
    clientSocket.once("error", () => upstream.destroy());
    clientSocket.once("close", () => upstream.destroy());
  } catch {
    rejectSocket(clientSocket, 403, "Forbidden");
  }
}

async function forwardHttpRequest(request, response, resolveHost, expectedAuthorization) {
  if (!authorized(request, expectedAuthorization)) {
    response.writeHead(407, { "Proxy-Authenticate": "Basic realm=SwiftLocal", Connection: "close" });
    response.end();
    return;
  }
  try {
    const target = new URL(String(request.url || ""));
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error("proxy target rejected");
    const addresses = await resolveHost(target.hostname);
    const selected = chooseAddress(addresses);
    const headers = sanitizeForwardHeaders(request.headers, target);
    const transport = target.protocol === "https:" ? https : http;
    const upstream = transport.request({
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ""),
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: request.method,
      headers,
      servername: net.isIP(target.hostname.replace(/^\[|\]$/g, "")) ? undefined : target.hostname,
      lookup: (_hostname, lookupOptions, callback) => pinnedLookup(selected, lookupOptions, callback)
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, sanitizeResponseHeaders(upstreamResponse.headers));
      upstreamResponse.pipe(response);
    });
    upstream.setTimeout(PROXY_TIMEOUT_MS, () => upstream.destroy(new Error("proxy upstream timeout")));
    upstream.once("error", () => {
      if (!response.headersSent) response.writeHead(502, { Connection: "close" });
      response.end();
    });
    request.pipe(upstream);
  } catch {
    if (!response.headersSent) response.writeHead(403, { Connection: "close" });
    response.end();
  }
}

function parseConnectTarget(value) {
  const raw = String(value || "");
  const parsed = new URL(`http://${raw}`);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const port = Number(parsed.port || 443);
  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535 || parsed.username || parsed.password) {
    throw new Error("invalid CONNECT target");
  }
  return { hostname, port };
}

function chooseAddress(addresses) {
  const list = Array.isArray(addresses) ? addresses : [];
  const selected = list.find((item) => item && net.isIP(item.address) === 4) || list[0];
  if (!selected || !net.isIP(selected.address)) throw new Error("public address missing");
  return { address: selected.address, family: Number(selected.family) || net.isIP(selected.address) };
}

function pinnedLookup(selected, options, callback) {
  if (options && options.all) {
    callback(null, [{ address: selected.address, family: selected.family }]);
    return;
  }
  callback(null, selected.address, selected.family);
}

function authorized(request, expected) {
  const actual = String(request.headers && request.headers["proxy-authorization"] || "");
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sanitizeForwardHeaders(input, target) {
  const headers = { ...input };
  delete headers["proxy-authorization"];
  delete headers["proxy-connection"];
  delete headers.connection;
  headers.host = target.host;
  headers.connection = "close";
  return headers;
}

function sanitizeResponseHeaders(input) {
  const headers = { ...input };
  delete headers["proxy-authenticate"];
  headers.connection = "close";
  return headers;
}

function rejectSocket(socket, status, message, extraHeaders = "") {
  if (!socket || socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${message}\r\n${extraHeaders}Connection: close\r\nContent-Length: 0\r\n\r\n`);
}

module.exports = {
  createPublicMediaProxy,
  parseConnectTarget
};
