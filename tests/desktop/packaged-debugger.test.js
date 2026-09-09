"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { connectDebugger } = require("../../scripts/verify-packaged-ui");

test("packaged debugger rejects in-flight requests when its connection closes", async (t) => {
  let socket;
  class FakeWebSocket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    constructor() {
      super();
      socket = this;
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send() {}
    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }
  }
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => [{ type: "page", url: "file:///frontend/index.html", webSocketDebuggerUrl: "ws://test" }]
  }));
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => { globalThis.WebSocket = originalWebSocket; });
  const client = await connectDebugger("http://test");
  const request = client.send("Runtime.evaluate");
  socket.close();
  await assert.rejects(request, /connection closed/);
  await assert.rejects(client.send("Runtime.evaluate"), /not open/);
});
