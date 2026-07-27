/**
 * PDF compatibility probes: encryption, XFA, digital signature hints (scaffold).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfCore = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore.compatibility = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function bytesLookEncrypted(bytes) {
    if (!bytes || !bytes.length) return false;
    const limit = Math.min(bytes.length, 512 * 1024);
    // Search for ASCII "/Encrypt"
    const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // /Encrypt
    outer: for (let i = 0; i <= limit - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) {
        if (bytes[i + j] !== needle[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  function bytesLookLikeXfa(bytes) {
    if (!bytes || !bytes.length) return false;
    const limit = Math.min(bytes.length, 1024 * 1024);
    // Rough markers: /XFA or xdp:xdp
    const markers = [" /XFA", "/XFA", "xdp:xdp", "http://www.xfa.org"];
    let sample = "";
    try {
      const slice = bytes.subarray
        ? bytes.subarray(0, limit)
        : bytes.slice(0, limit);
      sample = String.fromCharCode.apply(null, Array.from(slice.subarray(0, Math.min(slice.length, 200000))));
    } catch {
      return false;
    }
    return markers.some((m) => sample.includes(m));
  }

  /**
   * @returns {{ encrypted: boolean, xfa: boolean, digitalSignatureHint: boolean, advice: string }}
   */
  function probeDocument(bytes) {
    const encrypted = bytesLookEncrypted(bytes);
    const xfa = !encrypted && bytesLookLikeXfa(bytes);
    const digitalSignatureHint = false;
    let advice = "";
    if (encrypted) {
      advice = "此 PDF 可能已加密。請先解密，或使用 Adobe Acrobat 開啟。";
    } else if (xfa) {
      advice = "此文件可能使用 XFA 動態表格。建議使用 Adobe Acrobat Reader 開啟以確保相容。";
    }
    return { encrypted, xfa, digitalSignatureHint, advice };
  }

  return {
    bytesLookEncrypted,
    bytesLookLikeXfa,
    probeDocument
  };
});
