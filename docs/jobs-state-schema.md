# jobs-state 結構（schema version 2）

本文描述 SwiftLocal **任務持久化檔**的現行契約（對齊 `desktop/backend.js` 與 `backend/services/job_service.py`）。

- **version 1**：基本任務摘要（0.3.2）
- **version 2**：新增 `errorCode` / `errorHint` / `retriable`（0.3.3）

變更此結構時必須：

1. 提高 `version`
2. 實作讀取端遷移（舊 → 新）
3. 補雙後端回歸測試
4. 更新本文件與 CHANGELOG

---

## 檔案位置

| 模式 | 路徑 |
| --- | --- |
| Electron 桌面 | `{userData}/jobs-state.json`（與 `tools.json` 同目錄） |
| FastAPI | `backend/temp/jobs-state.json` |

狀態檔屬本機執行產物，已列入 `.gitignore`，**請勿提交**。

---

## 根物件（version 2）

寫入時固定為物件（非陣列）：

```json
{
  "version": 2,
  "savedAt": "2026-07-26T12:00:00.000Z",
  "jobs": [ /* Job 摘要，最多約 80 筆 */ ]
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `version` | number | 是（寫入） | 結構版本。**目前寫入 `2`。** |
| `savedAt` | string | 是（寫入） | ISO-8601 時間戳，上次寫入時間 |
| `jobs` | array | 是 | 任務摘要列表，新→舊或佇列順序依實作；最多 **80** 筆（`MAX_PERSISTED_JOBS`） |

### 讀取相容

| 檔案形狀 | 行為 |
| --- | --- |
| `{ "version": 2, "jobs": [...] }` | 讀取 `jobs`（含錯誤分類欄位） |
| `{ "version": 1, "jobs": [...] }` | 讀取 `jobs`；缺的 `errorCode` 等給預設空值／`retriable: true` |
| `{ "jobs": [...] }`（缺 version） | 仍讀取 `jobs`（舊寫入／手動檔） |
| `[ ... ]`（純陣列） | **legacy**：整份視為 job 列表 |
| 無法解析的 JSON／非 list 且無 `jobs` | 視為空列表，不拋錯中斷啟動 |

程式常數：

- Desktop：`JOBS_STATE_SCHEMA_VERSION`（`desktop/backend.js`）
- FastAPI：`JOBS_STATE_SCHEMA_VERSION`（`backend/services/job_service.py`）
- 錯誤代碼：`desktop/job-errors.js`、`backend/services/job_errors.py`

---

## Job 摘要物件（version 2）

持久化只存可還原的摘要，**不含**執行中行程把手（如 `_child`）或記憶體專用欄位。

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 任務 ID；缺則丟棄該筆 |
| `type` | string | 是 | 任務類型（如 `pdf-compress`）；缺則丟棄 |
| `inputPaths` | string[] | 建議 | 本機絕對路徑列表（FastAPI 亦可能用 `input_paths` 讀入） |
| `outputDir` | string | 建議 | 輸出目錄（FastAPI 亦接受 `output_dir`） |
| `options` | object | 建議 | 字串鍵值選項；**禁止**含密碼（見安全） |
| `status` | string | 建議 | `queued` \| `running` \| `done` \| `failed` \| `cancelled` |
| `createdAt` | string | 建議 | ISO 時間；FastAPI 亦接受 `created_at` |
| `startedAt` | string \| null | 可選 | FastAPI 亦接受 `started_at` |
| `finishedAt` | string \| null | 可選 | FastAPI 亦接受 `finished_at` |
| `outputPaths` | array | 可選 | 輸出路徑字串列表；FastAPI 讀入時亦支援 `{ name, path }` 物件並對齊 job 輸出目錄 |
| `log` | string[] | 可選 | 最近日誌（寫入約 **12** 行；讀入桌面最多保留 20） |
| `error` | string | 可選 | 錯誤訊息（已清理） |
| `errorCode` | string | 可選 | 統一錯誤代碼（見下表） |
| `errorHint` | string | 可選 | 使用者可操作的下一步建議 |
| `retriable` | boolean | 可選 | 是否允許「重新執行」；預設 `true` |

### 錯誤代碼（`errorCode`）

| code | 中文標籤 |
| --- | --- |
| `missing_tool` | 缺少工具 |
| `missing_language_pack` | 缺少語言包 |
| `encrypted_pdf` | 檔案加密 |
| `corrupted_file` | 檔案損壞 |
| `unsupported_format` | 格式不支援 |
| `disk_full` | 磁碟空間不足 |
| `permission_denied` | 權限不足 |
| `tool_timeout` | 工具逾時 |
| `tool_crashed` | 工具崩潰 |
| `external_process_crash` | 外部程序崩潰 |
| `office_conversion_failed` | Office 轉換失敗 |
| `libreoffice_profile_error` | LibreOffice 設定檔錯誤 |
| `pdf_render_failed` | PDF 渲染失敗 |
| `missing_input` | 輸入檔遺失 |
| `cancelled` | 使用者取消 |
| `unknown` | 未知錯誤 |

公開 API 另可能回傳 `errorCodeLabel`（中文，不需持久化）。

### 啟動時正規化（還原規則）

兩邊一致的行為：

| 條件 | 還原後 |
| --- | --- |
| `status === "running"` | 改為 **`failed`**，錯誤訊息含「重啟／中斷」意涵，寫入 `finishedAt` |
| `status === "queued"` 且類型為 `pdf-encrypt` / `pdf-decrypt` | 改為 **`failed`**，提示需重新輸入密碼（密碼不落盤） |
| `status === "queued"` 且所有 `inputPaths` 皆不存在 | **丟棄**該筆 |
| options / log / error | 再次通過 redact，去除 password／passphrase 鍵與密文 |

桌面與 FastAPI 還原後都會 **立刻回寫** 狀態檔（把 `running→failed` 等修正固化），避免重啟半成品被當成功。

---

## 安全契約

- **不得**在狀態檔中保存 `password`、`passphrase` 或鍵名含上述字樣的欄位。
- log／error 中若曾嵌入密文，寫入前以 `[REDACTED]` 或等價方式清除。
- 公開 API／UI 回傳的 options 同樣經過 redact。
- 診斷報告（未來 0.3.3）必須沿用同一清理規則。

---

## 與資源上限的關係

| 限制 | 預設 | 說明 |
| --- | --- | --- |
| 持久化筆數 | 80 | 超出時優先移除最舊的**已結束**任務 |
| 已結束保留時數 | 72（`SWIFTLOCAL_JOB_RETENTION_HOURS`） | done／failed／cancelled 逾時自動移出列表 |
| 佇列中 queued | 50（可環境變數調整） | 建立任務時檢查，與狀態檔筆數上限不同 |

清理時 **不會** 刪除 queued／running。FastAPI 會刪除對應 `temp/jobs/{id}` 工作目錄；桌面版僅更新 jobs-state（使用者下載目錄中的輸出檔保留）。

---

## 升級／遷移約定

### version 1 → 2（已完成）

- 寫入改為 `version: 2`，job 可含 `errorCode` / `errorHint` / `retriable`
- 讀取 v1 或缺欄位時：`errorCode=""`、`errorHint=""`、`retriable=true`
- 不需改寫舊檔；下次 `save` 會升級為 v2

### 未來 version 3+（例如 batchId）

1. 提高 `JOBS_STATE_SCHEMA_VERSION`
2. 寫入只產生新版本形狀
3. 讀取時對舊 version 做 idempotent 遷移
4. 不得還原已 redact 的密碼
5. 雙後端同一文件與 fixture 測試

---

## 範例（version 2）

```json
{
  "version": 2,
  "savedAt": "2026-07-26T08:15:30.123Z",
  "jobs": [
    {
      "id": "job-abc",
      "type": "pdf-compress",
      "inputPaths": ["C:/Users/demo/in/a.pdf"],
      "outputDir": "C:/Users/demo/Downloads/SwiftLocal",
      "options": { "extension": "pdf" },
      "status": "failed",
      "createdAt": "2026-07-26T08:15:00.000Z",
      "startedAt": "2026-07-26T08:15:01.000Z",
      "finishedAt": "2026-07-26T08:15:05.000Z",
      "outputPaths": [],
      "log": ["找不到 FFmpeg 執行檔"],
      "error": "缺少必要工具：FFmpeg",
      "errorCode": "missing_tool",
      "errorHint": "請到「狀態」頁安裝或指定工具路徑後重試。",
      "retriable": true
    }
  ]
}
```

---

## 相關實作

| 主題 | 檔案 |
| --- | --- |
| 桌面讀寫 | `desktop/backend.js` → `loadJobsState` / `saveJobsState` |
| FastAPI 讀寫 | `backend/services/job_service.py` → `_load_jobs_state` / `_save_jobs_state` / `restore_state` |
| 架構總覽 | `docs/backend-architecture.md` |
| 測試 | `tests/desktop/backend.test.js`、`tests/backend/test_core.py`、`tests/desktop/jobs-state-schema.test.js` |
