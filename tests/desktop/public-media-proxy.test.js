"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { afterEach, test } = require("node:test");
const { createPublicMediaProxy, parseConnectTarget } = require("../../desktop/public-media-proxy");

const closers = [];

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

test("authenticated proxy pins the resolver-selected address for an HTTP request", async (context) => {
  const upstream = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("public media");
  });
  try {
    await listen(upstream);
  } catch (error) {
    if (error && error.code === "EPERM") {
      context.skip("sandbox does not permit loopback listeners");
      return;
    }
    throw error;
  }
  closers.push(() => closeServer(upstream));
  const upstreamAddress = upstream.address();

  let resolvedHost = "";
  const proxy = await createPublicMediaProxy({
    resolveHost: async (hostname) => {
      resolvedHost = hostname;
      return [{ address: "127.0.0.1", family: 4 }];
    }
  });
  closers.push(() => proxy.close());
  const proxyUrl = new URL(proxy.url);
  const body = await request({
    hostname: proxyUrl.hostname,
    port: proxyUrl.port,
    path: `http://media.example:${upstreamAddress.port}/video`,
    headers: {
      "Proxy-Authorization": `Basic ${Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString("base64")}`
    }
  });
  assert.equal(body.status, 200);
  assert.equal(body.text, "public media");
  assert.equal(resolvedHost, "media.example");
});

test("proxy rejects missing credentials and resolver-blocked targets", async (context) => {
  let proxy;
  try {
    proxy = await createPublicMediaProxy({
      resolveHost: async () => {
        throw new Error("private address rejected");
      }
    });
  } catch (error) {
    if (error && error.code === "EPERM") {
      context.skip("sandbox does not permit loopback listeners");
      return;
    }
    throw error;
  }
  closers.push(() => proxy.close());
  const proxyUrl = new URL(proxy.url);
  const unauthorized = await request({ hostname: proxyUrl.hostname, port: proxyUrl.port, path: "http://media.example/video" });
  assert.equal(unauthorized.status, 407);
  const blocked = await request({
    hostname: proxyUrl.hostname,
    port: proxyUrl.port,
    path: "http://media.example/video",
    headers: {
      "Proxy-Authorization": `Basic ${Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString("base64")}`
    }
  });
  assert.equal(blocked.status, 403);
});

test("CONNECT parsing supports hostnames and bracketed IPv6", () => {
  assert.deepEqual(parseConnectTarget("example.com:443"), { hostname: "example.com", port: 443 });
  assert.deepEqual(parseConnectTarget("[2001:4860:4860::8888]:8443"), { hostname: "2001:4860:4860::8888", port: 8443 });
  assert.throws(() => parseConnectTarget("user:pass@example.com:443"), /invalid CONNECT/);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function request(options) {
  return new Promise((resolve, reject) => {
    const client = http.request({ ...options, method: "GET" }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    client.once("error", reject);
    client.end();
  });
}
