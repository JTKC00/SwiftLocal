"use strict";

/**
 * Coordinate Electron close events with an asynchronous renderer dirty-state
 * query. The guard owns the bypass flag so a confirmed close cannot recurse
 * through BrowserWindow#close or app.quit indefinitely.
 */
function createPdfWorkspaceCloseGuard(options) {
  const opts = options || {};
  const getWindow = typeof opts.getWindow === "function" ? opts.getWindow : () => null;
  const requestDirtyState = typeof opts.requestDirtyState === "function"
    ? opts.requestDirtyState
    : async () => ({ dirty: true, unavailable: true });
  const confirmClose = typeof opts.confirmClose === "function" ? opts.confirmClose : () => false;
  const closeWindow = typeof opts.closeWindow === "function"
    ? opts.closeWindow
    : (window) => window.close();
  const quitApp = typeof opts.quitApp === "function" ? opts.quitApp : () => {};

  let bypass = false;
  let decisionPromise = null;
  let requestedWindowClose = false;
  let requestedQuit = false;

  function liveWindow() {
    let window;
    try {
      window = getWindow();
    } catch {
      return null;
    }
    if (!window) return null;
    try {
      if (typeof window.isDestroyed === "function" && window.isDestroyed()) return null;
    } catch {
      return null;
    }
    return window;
  }

  async function decide(window) {
    let state;
    try {
      state = await requestDirtyState(window);
    } catch {
      state = { dirty: true, unavailable: true };
    }
    if (!state || state.unavailable || state.dirty) {
      try {
        return Boolean(await confirmClose(state || { dirty: true, unavailable: true }, window));
      } catch {
        return false;
      }
    }
    return true;
  }

  function beginDecision() {
    if (decisionPromise) return decisionPromise;
    const window = liveWindow();
    if (!window) return Promise.resolve(true);
    decisionPromise = decide(window)
      .then((allowed) => {
        if (!allowed) return false;
        bypass = true;
        if (requestedQuit) {
          quitApp();
        } else if (requestedWindowClose) {
          closeWindow(window);
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        decisionPromise = null;
        requestedWindowClose = false;
        requestedQuit = false;
      });
    return decisionPromise;
  }

  function handleWindowClose(event) {
    if (bypass) return true;
    const window = liveWindow();
    if (!window) return true;
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    requestedWindowClose = true;
    void beginDecision();
    return false;
  }

  function handleBeforeQuit(event) {
    if (bypass || !liveWindow()) return true;
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    requestedQuit = true;
    void beginDecision();
    return false;
  }

  return {
    handleWindowClose,
    handleBeforeQuit,
    isBypassed: () => bypass,
    reset: () => {
      bypass = false;
      requestedWindowClose = false;
      requestedQuit = false;
      decisionPromise = null;
    }
  };
}

module.exports = {
  createPdfWorkspaceCloseGuard
};
