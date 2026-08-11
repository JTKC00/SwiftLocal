# 線上媒體下載 V1 驗收清單

## 封裝前自動檢查

在 Windows x64 封裝機執行：

```powershell
npm ci
npm run tools:media-download
npm run tools:media-download:check
npm run typecheck
npm test
npm run check:pack:full
```

`tools:media-download` 只從 `tools/media-download-tools.lock.json` 所列的官方 release URL 下載 yt-dlp 與 Deno，SHA-256 不符會中止。`check:pack:full` 必須同時確認 Windows PE 版的 Tesseract、FFmpeg、QPDF、yt-dlp、Deno 及 LibreOffice；macOS／Linux 同名執行檔不能通過。

## 產出與封裝驗證

```powershell
npm run pack:win:full
```

`pack:win:full` 會在 electron-builder 成功後自動執行同等的成品驗證；若要對既有產物重跑，使用 `npm run verify:win:artifacts -- --full`。

預期產物：

- `dist-full/SwiftLocal-<version>-full-installer-x64.exe`
- `dist-full/SwiftLocal-<version>-full-portable-x64.exe`
- `dist-full/win-unpacked/resources/tools/yt-dlp/bin/yt-dlp.exe`
- `dist-full/win-unpacked/resources/tools/deno/bin/deno.exe`
- `dist-full/win-unpacked/resources/tools/ffmpeg/bin/ffmpeg.exe`

驗證腳本會檢查 Installer／Portable 檔名與最小大小、主程式版本、`app.asar` 版本、PDF 關聯、tools 資源，以及三個媒體工具的 Windows `MZ` PE header。它還會以內建 7-Zip 抽出兩個 `.exe` 的 payload，逐一比對 `app.asar`、yt-dlp、Deno、FFmpeg 與 `win-unpacked` 的 SHA-256；單純改檔案時間不能讓舊產物通過。

所有 yt-dlp HTTP／HTTPS 連線都經由每次操作專屬、帶隨機認證的 `127.0.0.1` 代理。代理會對每個請求及 HTTPS CONNECT 重新解析主機、拒絕私有／本機地址，並把實際上游連線鎖定到已驗證的公開 IP，因此後續 redirect 或 DNS rebinding 不能繞過公開媒體限制。

## 手動測試 A：公開 YouTube 1080p

1. 從首頁按「下載線上媒體」，或在「影音」內切到「線上媒體下載」。
2. 貼上一個你有權測試的單一公開 YouTube 影片網址，按「分析媒體」。
3. 確認固定尺寸預覽沒有跳動，並只顯示來源實際提供的標題、縮圖、來源、發佈者、長度及最高畫質。
4. 確認預設選中 1080p；不可用的畫質必須 disabled。
5. 選擇新資料夾後下載影片，確認進度只顯示真實百分比、大小、速度及 ETA；沒有值的欄位不可捏造。
6. 完成後按「開啟檔案」及「開啟資料夾」，確認檔案可播放。

成功條件：輸出為 1920×1080 MP4，內含影片及音訊；分離串流由 FFmpeg 合併成功；介面路徑與實檔一致。

## 手動測試 B：720p

1. 分析一個提供 720p 的公開來源。
2. 選擇 720p 後下載。
3. 以播放器或 FFmpeg 檢查輸出。

成功條件：輸出為 1280×720 MP4，內含可解碼的影片與音訊。

## 手動測試 C：只下載音訊

1. 使用同一公開來源重新分析。
2. 選「只下載音訊」及「MP3」，開始下載。
3. 下載期間確認狀態由下載音訊進入轉換階段。
4. 完成後播放 MP3；再測一次「保留最佳音訊格式」。

成功條件：MP3 可播放且由內建 FFmpeg 轉檔；最佳音訊輸出保留可用的最佳音訊容器；不殘留 `.part` 或中間來源檔。

## 手動測試 D：取消

1. 分析較長的公開影片並開始下載。
2. 看到真實下載進度後按「取消下載」。
3. 確認狀態先顯示正在取消，然後回復可操作。
4. 以工作管理員確認 yt-dlp、Deno 與本次 FFmpeg 子程序均已結束。

成功條件：程序樹停止；本次下載的 `.part`、fragment 與中間串流被清除；既有檔案及同名前綴的使用者檔案保留。

## 手動測試 E：無效或非公開網址

- 無效文字或 `file://`：顯示「請輸入有效的 http 或 https 媒體網址」。
- `localhost`、私有 IP 或解析到私有 IP 的主機：顯示只支援公開媒體網址。

成功條件：不啟動 yt-dlp，App 不崩潰，修正網址後可再次分析。

## 手動測試 F：不支援或不可用內容

- 已移除／不存在的公開網址：顯示媒體不可用。
- 私人或需要登入的內容：清楚說明 V1 不支援帳號或 Cookie。
- 播放清單：要求改貼單一媒體網址。
- 地區限制、沒有格式、網絡錯誤：顯示相符的可行動繁中訊息。

成功條件：失敗後仍可輸入另一網址繼續使用；技術詳情不得含 Cookie、Authorization、token 或完整 query。

## 手動測試 G：檔名與檔案系統

1. 使用標題含 `<>:"/\\|?*` 或 Windows 保留名稱的測試 metadata。
2. 下載同一媒體兩次。
3. 測試無寫入權限及磁碟空間不足的輸出位置。

成功條件：非法字元被安全替換；第二次建立 `(2)` 而不覆寫；檔案系統錯誤有清楚提示。

## 手動測試 H：Full Installer 與 Portable

1. 在乾淨 Windows x64 VM 安裝 Full Installer，且不要另裝 Python、yt-dlp 或 FFmpeg。
2. 執行 Test A、C、D，再解除安裝並確認捷徑／PDF 關聯名稱正確。
3. 在另一個乾淨使用者環境解壓／執行 Portable，重做 Test A 與 C。
4. 執行 `npm run verify:win:artifacts -- --full`，確認 Installer／Portable 不早於對應的 `win-unpacked` 內容。

成功條件：兩種包裝都可獨立分析、下載、合併、轉 MP3、取消及開啟結果；不依賴 PATH 或 Python。

## 其他錯誤場景

逐項測試：

- 無權限輸出資料夾：要求改選位置。
- FFmpeg 合併／轉換失敗：保留短版技術詳情，普通錯誤區只顯示可行動訊息。

成功條件：每個錯誤都有繁中可行動訊息；技術詳情可展開，但不得顯示 Cookie、token、完整含 query 的來源 URL 或授權資料。

## 本次開發機實測紀錄（macOS arm64）

- yt-dlp `2026.07.04`、Deno `2.9.5`、FFmpeg `8.1.1` 已實際執行。
- 公開 19 秒 YouTube 影片成功分析；標題、縮圖、長度及可用畫質正確。
- 影片成功輸出為 MP4；第二次同名下載建立 `(2)`，沒有覆寫。
- 公開來源的 720p 已實際輸出為 1280×720 MP4，內含 AV1 影片與 AAC 音訊。
- 公開來源的 1080p 已實際輸出為 1920×1080 MP4，內含 AV1 影片與 AAC 音訊。
- 音訊成功由 FFmpeg 輸出為 MP3，並經 FFmpeg 解碼檢查。
- 真實事件包含影片下載、音訊下載、合併及完成；缺值以 JSON `null` 傳遞。
- 下載後立即取消，程序樹及專屬本機代理結束；受控暫存目錄移除且測試資料夾保持空白。
- 代理的認證、公開 IP 鎖定、拒絕私有解析與 yt-dlp HTTPS CONNECT 已實際測試。
- Playwright 已在 1440×900 與 390×844 檢查分析、48% 進度與完成狀態。

Windows Installer／Portable 的最終 VM 實測不得由這份 macOS 記錄取代；必須在 Windows x64 依上列步驟另行簽核。
