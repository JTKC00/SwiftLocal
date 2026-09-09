"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { after, before, describe, test } = require("node:test");
const { createFrontendServer } = require("../../scripts/serve");

describe("browser frontend HTTP boundary", () => {
  let server;
  let port;
  let fixture;
  const token = "temporary-test-session-token";

  before(async () => {
    fixture = await fs.mkdtemp(path.join(os.tmpdir(), "swiftlocal-serve-test-"));
    const tokenPath = path.join(fixture, "session-token");
    await fs.writeFile(tokenPath, token);
    const frontendRoot = path.join(fixture, "frontend");
    await fs.mkdir(frontendRoot);
    await fs.writeFile(path.join(frontendRoot, "index.html"), "<!doctype html><title>Healthy</title>");
    server = createFrontendServer({ frontendRoot, tokenPath });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    port = server.address().port;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (fixture) await fs.rm(fixture, { recursive: true, force: true });
  });

  function request(target, headers = {}, method = "GET") {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1", port, path: target, method,
        headers: { Host: `127.0.0.1:${port}`, ...headers },
        agent: false
      }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
        response.on("error", reject);
      });
      req.on("error", reject);
      req.setTimeout(15000, () => req.destroy(new Error(`HTTP test timed out: ${target}`)));
      req.end();
    });
  }

  test("malformed encodings and NUL return 400 without stopping subsequent requests", async (t) => {
    for (const target of ["/%", "/%E0%A4%A", "/%00", "http://attacker.example/index.html", "//attacker.example/index.html", "//swiftlocal.invalid/index.html"]) {
      await t.test(target, async () => {
        assert.equal((await request(target)).status, 400, target);
        assert.equal((await request("/index.html")).status, 200, `healthy after ${target}`);
      });
    }
  });

  test("rejects attacker authorities before serving files or disclosing a token", async () => {
    for (const Host of ["attacker.example", `localhost.attacker.example:${port}`, "localhost@attacker.example", "%31%32%37.0.0.1"]) {
      for (const target of ["/index.html", "/__swiftlocal/session-token"]) {
        const result = await request(target, { Host, "Sec-Fetch-Site": "same-origin" });
        assert.equal(result.status, 403, `${Host} ${target}`);
        assert.ok(!result.body.includes(token));
      }
    }
  });

  test("both supported loopback names can retrieve the temporary token", async () => {
    for (const name of ["127.0.0.1", "localhost"]) {
      const Host = `${name}:${port}`;
      const result = await request("/__swiftlocal/session-token", {
        Host, "Sec-Fetch-Site": "same-origin", Origin: `http://${Host}`
      });
      assert.equal(result.status, 200);
      assert.deepEqual(JSON.parse(result.body), { token });
      assert.equal(result.headers["cache-control"], "no-store");
    }
    assert.equal((await request("/__swiftlocal/session-token")).status, 200);
  });

  test("token endpoint rejects cross-site metadata, foreign origins and writes", async () => {
    for (const headers of [
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "same-site" },
      { Origin: "http://attacker.example" },
      { "Sec-Fetch-Site": "same-origin", Origin: "http://attacker.example" }
    ]) {
      assert.equal((await request("/__swiftlocal/session-token", headers)).status, 403);
    }
    assert.equal((await request("/__swiftlocal/session-token", {}, "POST")).status, 403);
  });
});
