(function () {
  "use strict";

  function mount(options = {}) {
    const api = options.api || null;
    const toast = typeof options.showToast === "function" ? options.showToast : () => {};
    const desktopAvailable = Boolean(options.desktopAvailable && api);
    const elements = collectElements();
    if (!elements.form) return null;

    let analysis = null;
    let busy = false;
    let downloading = false;
    let analysisToolsReady = false;
    let downloadToolsReady = false;
    let unsubscribe = null;

    elements.browserNote.hidden = desktopAvailable;
    elements.workspace.hidden = !desktopAvailable;
    if (!desktopAvailable) {
      elements.toolStatus.textContent = "桌面版限定";
      return { reset: () => true, refreshStatus: async () => {} };
    }

    elements.form.addEventListener("submit", analyze);
    elements.pickOutput.addEventListener("click", chooseOutputDirectory);
    elements.start.addEventListener("click", startDownload);
    elements.cancel.addEventListener("click", cancelDownload);
    elements.openFile.addEventListener("click", () => openResult("file"));
    elements.openFolder.addEventListener("click", () => openResult("folder"));
    elements.modeInputs.forEach((input) => input.addEventListener("change", renderModeOptions));
    elements.url.addEventListener("input", () => {
      if (analysis && elements.url.value.trim() !== analysis.url) invalidateAnalysis();
      updateControls();
    });
    if (typeof api.onMediaDownloadProgress === "function") {
      unsubscribe = api.onMediaDownloadProgress(renderProgress);
    }
    void refreshStatus();

    async function refreshStatus() {
      try {
        const status = unwrap(await api.getMediaDownloadStatus());
        elements.output.value = elements.output.value || status.defaultOutputDir || "";
        const missing = Object.entries(status.tools || {})
          .filter(([, value]) => !value || !value.available)
          .map(([key]) => ({ ytDlp: "yt-dlp", ffmpeg: "FFmpeg", deno: "媒體分析元件" }[key] || key));
        analysisToolsReady = Boolean(status.tools && status.tools.ytDlp && status.tools.ytDlp.available && status.tools.deno && status.tools.deno.available);
        downloadToolsReady = Boolean(status.ready);
        elements.toolStatus.textContent = status.ready ? "元件就緒" : `缺少 ${missing.join("、") || "必要元件"}`;
        elements.toolStatus.classList.toggle("is-error", !status.ready);
        if (status.progress && status.active) renderProgress(status.progress);
        updateControls();
      } catch (error) {
        analysisToolsReady = false;
        downloadToolsReady = false;
        elements.toolStatus.textContent = "無法檢查元件";
        elements.toolStatus.classList.add("is-error");
        showError(error);
      }
    }

    async function analyze(event) {
      event.preventDefault();
      if (busy) return;
      clearError();
      hideCompletion();
      analysis = null;
      busy = true;
      downloading = false;
      elements.analysisStatus.textContent = "正在分析媒體…";
      elements.previewBadge.textContent = "分析中";
      elements.previewEmpty.textContent = "正在讀取可用格式與媒體資料…";
      elements.previewEmpty.hidden = false;
      elements.previewContent.hidden = true;
      updateControls();
      try {
        const url = elements.url.value.trim();
        const result = unwrap(await api.analyzeMediaUrl({ url }));
        analysis = { id: result.analysisId, metadata: result.metadata || {}, url };
        renderMetadata(analysis.metadata);
        elements.analysisStatus.textContent = "分析完成，請選擇下載設定。";
        elements.previewBadge.textContent = "可下載";
        toast("媒體分析完成", "success");
      } catch (error) {
        elements.analysisStatus.textContent = "分析失敗，請檢查網址或網絡後再試。";
        elements.previewBadge.textContent = "分析失敗";
        elements.previewEmpty.textContent = "未能取得媒體資料。";
        showError(error);
      } finally {
        busy = false;
        updateControls();
      }
    }

    function renderMetadata(metadata) {
      elements.previewEmpty.hidden = true;
      elements.previewContent.hidden = false;
      elements.mediaTitle.textContent = metadata.title || "未命名媒體";
      elements.thumbnail.removeAttribute("src");
      elements.thumbnail.hidden = true;
      elements.thumbnailEmpty.hidden = false;
      if (metadata.thumbnailDataUrl && /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(metadata.thumbnailDataUrl)) {
        elements.thumbnail.src = metadata.thumbnailDataUrl;
        elements.thumbnail.alt = `${metadata.title || "媒體"}縮圖`;
        elements.thumbnail.hidden = false;
        elements.thumbnailEmpty.hidden = true;
      }
      elements.metadata.replaceChildren();
      addMetadataRow("來源", metadata.extractor);
      addMetadataRow("發佈者", metadata.uploader);
      addMetadataRow("長度", formatDuration(metadata.duration));
      if (metadata.qualities && metadata.qualities.maxHeight) {
        addMetadataRow("最高畫質", `${metadata.qualities.maxHeight}p`);
      }

      const videoMode = elements.modeInputs.find((input) => input.value === "video");
      const audioMode = elements.modeInputs.find((input) => input.value === "audio");
      videoMode.disabled = !metadata.hasVideo;
      audioMode.disabled = !metadata.hasAudio;
      if (!metadata.hasVideo && metadata.hasAudio) audioMode.checked = true;
      else videoMode.checked = true;

      const qualities = metadata.qualities || {};
      elements.quality720.disabled = !qualities.p720;
      elements.quality1080.disabled = !qualities.p1080;
      elements.qualityBest.disabled = !qualities.best;
      const preferred = document.querySelector(`input[name='media-download-quality'][value='${metadata.defaultQuality || "best"}']`);
      if (preferred && !preferred.disabled) preferred.checked = true;
      else if (!elements.qualityBest.disabled) elements.qualityBest.checked = true;
      renderModeOptions();
    }

    function addMetadataRow(label, value) {
      if (value == null || value === "") return;
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = String(value);
      elements.metadata.append(term, description);
    }

    function renderModeOptions() {
      const mode = selectedValue(elements.modeInputs) || "video";
      elements.videoOptions.hidden = mode !== "video";
      elements.audioOptions.hidden = mode !== "audio";
      updateControls();
    }

    async function chooseOutputDirectory() {
      if (busy) return;
      try {
        const directory = await api.chooseDirectory();
        if (directory) elements.output.value = directory;
        updateControls();
      } catch (error) {
        showError(error);
      }
    }

    async function startDownload() {
      if (!analysis || busy || !elements.output.value) return;
      clearError();
      hideCompletion();
      busy = true;
      downloading = true;
      elements.progressCard.hidden = false;
      renderProgress({ status: "preparing", message: "正在準備下載…", percentage: null });
      updateControls();
      const mode = selectedValue(elements.modeInputs) || "video";
      try {
        const result = unwrap(await api.startMediaDownload({
          analysisId: analysis.id,
          mode,
          resolution: selectedValue(elements.qualityInputs) || "best",
          audioFormat: selectedValue(elements.audioFormatInputs) || "mp3",
          outputDir: elements.output.value
        }));
        renderCompletion(result);
        toast("下載完成", "success");
      } catch (error) {
        const mediaError = normalizeError(error);
        if (mediaError.code === "cancelled") {
          elements.analysisStatus.textContent = "下載已取消；可以保留目前設定後再試。";
          elements.progressCard.hidden = true;
          toast("下載已取消", "info");
        } else {
          showError(mediaError);
        }
      } finally {
        busy = false;
        downloading = false;
        updateControls();
      }
    }

    async function cancelDownload() {
      if (!downloading) return;
      elements.cancel.disabled = true;
      elements.progressMessage.textContent = "正在取消並清理暫存檔…";
      try {
        unwrap(await api.cancelMediaDownload());
      } catch (error) {
        showError(error);
      }
    }

    function renderProgress(progress = {}) {
      const status = String(progress.status || "");
      if (status === "analyzing") {
        elements.analysisStatus.textContent = progress.message || "正在分析媒體…";
        return;
      }
      if (["idle", "ready"].includes(status)) return;
      if (status === "completed") {
        renderCompletion(progress);
        return;
      }
      if (status === "error") {
        showError(progress.error || { message: progress.message });
        return;
      }
      if (status === "cancelled") {
        elements.progressCard.hidden = true;
        return;
      }
      elements.progressCard.hidden = false;
      elements.progressMessage.textContent = progress.message || phaseLabel(status);
      const percentage = finiteNumber(progress.percentage);
      if (percentage == null) {
        elements.progress.removeAttribute("value");
        elements.progressPercent.textContent = phaseLabel(status);
      } else {
        elements.progress.value = Math.max(0, Math.min(100, percentage));
        elements.progressPercent.textContent = `${Math.round(percentage)}%`;
      }
      const metrics = [];
      const downloaded = finiteNumber(progress.downloadedBytes);
      const total = finiteNumber(progress.totalBytes);
      const speed = finiteNumber(progress.speed);
      const eta = finiteNumber(progress.eta);
      if (downloaded != null) metrics.push(total != null ? `${formatBytes(downloaded)} / ${formatBytes(total)}` : formatBytes(downloaded));
      if (speed != null) metrics.push(`${formatBytes(speed)}/秒`);
      if (eta != null) metrics.push(`約剩 ${formatDuration(eta)}`);
      elements.progressMetrics.textContent = metrics.join(" · ");
    }

    function renderCompletion(result = {}) {
      if (!result.outputPath) return;
      elements.progressCard.hidden = false;
      elements.progress.value = 100;
      elements.progressPercent.textContent = "100%";
      elements.progressMessage.textContent = "下載完成";
      elements.progressMetrics.textContent = result.size != null ? formatBytes(result.size) : "";
      elements.completeName.textContent = result.filename || "下載結果";
      elements.completePath.textContent = result.outputPath;
      elements.completeCard.hidden = false;
      elements.analysisStatus.textContent = "檔案已儲存到所選資料夾。";
    }

    async function openResult(kind) {
      try {
        unwrap(await api.openMediaDownloadResult(kind));
      } catch (error) {
        showError(error);
      }
    }

    function showError(error) {
      const normalized = normalizeError(error);
      const duplicate = !elements.errorCard.hidden && elements.errorMessage.textContent === normalized.message;
      elements.errorMessage.textContent = normalized.message;
      const detail = normalized.detail || "";
      elements.errorDetails.hidden = !detail;
      elements.errorDetails.querySelector("pre").textContent = detail;
      elements.errorCard.hidden = false;
      if (!duplicate) toast(normalized.message, "error", 6000);
    }

    function clearError() {
      elements.errorCard.hidden = true;
      elements.errorMessage.textContent = "";
      elements.errorDetails.hidden = true;
      elements.errorDetails.querySelector("pre").textContent = "";
    }

    function hideCompletion() {
      elements.completeCard.hidden = true;
      elements.completeName.textContent = "";
      elements.completePath.textContent = "";
    }

    function invalidateAnalysis() {
      analysis = null;
      elements.options.disabled = true;
      elements.previewBadge.textContent = "需要重新分析";
      elements.analysisStatus.textContent = "網址已變更，請重新分析。";
    }

    function updateControls() {
      const hasAnalysis = Boolean(analysis);
      elements.url.disabled = busy;
      elements.analyze.disabled = busy || !analysisToolsReady || !elements.url.value.trim();
      elements.pickOutput.disabled = busy;
      elements.options.disabled = busy || !hasAnalysis;
      elements.start.disabled = busy || !downloadToolsReady || !hasAnalysis || !elements.output.value;
      elements.cancel.hidden = !downloading;
      elements.cancel.disabled = !downloading;
    }

    function reset() {
      if (downloading) {
        toast("下載進行中；請先按「取消下載」。", "error");
        return false;
      }
      analysis = null;
      busy = false;
      elements.url.value = "";
      elements.options.disabled = true;
      elements.modeInputs[0].checked = true;
      elements.qualityBest.checked = true;
      elements.audioFormatInputs[0].checked = true;
      elements.previewContent.hidden = true;
      elements.previewEmpty.hidden = false;
      elements.previewEmpty.textContent = "分析後會在這裡顯示縮圖與媒體資料。";
      elements.thumbnail.removeAttribute("src");
      elements.thumbnail.alt = "";
      elements.metadata.replaceChildren();
      elements.previewBadge.textContent = "等待分析";
      elements.analysisStatus.textContent = "先貼上單一影片或音訊網址。";
      elements.progressCard.hidden = true;
      clearError();
      hideCompletion();
      renderModeOptions();
      updateControls();
      return true;
    }

    return { reset, refreshStatus, destroy: () => { if (unsubscribe) unsubscribe(); } };
  }

  function collectElements() {
    const byId = (id) => document.getElementById(id);
    return {
      form: byId("media-download-form"),
      browserNote: byId("media-download-browser-note"),
      workspace: byId("media-download-workspace"),
      toolStatus: byId("media-download-tool-status"),
      url: byId("media-download-url"),
      analyze: byId("media-download-analyze"),
      analysisStatus: byId("media-download-analysis-status"),
      options: byId("media-download-options"),
      modeInputs: Array.from(document.querySelectorAll("input[name='media-download-mode']")),
      qualityInputs: Array.from(document.querySelectorAll("input[name='media-download-quality']")),
      audioFormatInputs: Array.from(document.querySelectorAll("input[name='media-download-audio-format']")),
      quality720: byId("media-download-quality-720"),
      quality1080: byId("media-download-quality-1080"),
      qualityBest: byId("media-download-quality-best"),
      videoOptions: byId("media-download-video-options"),
      audioOptions: byId("media-download-audio-options"),
      output: byId("media-download-output-dir"),
      pickOutput: byId("media-download-pick-output"),
      start: byId("media-download-start"),
      cancel: byId("media-download-cancel"),
      previewBadge: byId("media-download-preview-badge"),
      previewEmpty: byId("media-download-preview-empty"),
      previewContent: byId("media-download-preview-content"),
      thumbnail: byId("media-download-thumbnail"),
      thumbnailEmpty: byId("media-download-thumbnail-empty"),
      mediaTitle: byId("media-download-media-title"),
      metadata: byId("media-download-metadata"),
      progressCard: byId("media-download-progress-card"),
      progress: byId("media-download-progress"),
      progressPercent: byId("media-download-progress-percent"),
      progressMessage: byId("media-download-progress-message"),
      progressMetrics: byId("media-download-progress-metrics"),
      errorCard: byId("media-download-error-card"),
      errorMessage: byId("media-download-error-message"),
      errorDetails: byId("media-download-error-details"),
      completeCard: byId("media-download-complete-card"),
      completeName: byId("media-download-complete-name"),
      completePath: byId("media-download-complete-path"),
      openFile: byId("media-download-open-file"),
      openFolder: byId("media-download-open-folder")
    };
  }

  function unwrap(response) {
    if (response && response.ok === true) return response.data;
    if (response && response.ok === false) throw response.error || new Error("操作失敗");
    return response;
  }

  function normalizeError(error) {
    if (error && typeof error === "object") {
      return {
        code: String(error.code || "unexpected"),
        message: String(error.message || "操作失敗，請稍後再試。"),
        detail: String(error.detail || "")
      };
    }
    return { code: "unexpected", message: String(error || "操作失敗，請稍後再試。"), detail: "" };
  }

  function selectedValue(inputs) {
    const selected = inputs.find((input) => input.checked && !input.disabled);
    return selected ? selected.value : "";
  }

  function finiteNumber(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function formatBytes(value) {
    const bytes = finiteNumber(value);
    if (bytes == null) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = bytes;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index += 1;
    }
    return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
  }

  function formatDuration(value) {
    const total = finiteNumber(value);
    if (total == null) return "";
    const seconds = Math.round(total);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
      : `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function phaseLabel(status) {
    return ({
      preparing: "準備中",
      downloading: "下載中",
      merging: "合併中",
      converting: "轉換中",
      cancelling: "取消中"
    })[status] || "處理中";
  }

  window.SwiftLocalMediaDownloader = { mount };
})();
