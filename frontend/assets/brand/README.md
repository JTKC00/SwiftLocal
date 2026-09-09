# SwiftLocal 品牌資產

採用已選定的第二款「流動 S」。原始概念板與 ImageGen 分離出的單色標誌保存在 `docs/design/brand-selected-concept.png` 和 `brand-symbol-source.png`。`mark.svg` 由單色原圖描摹為向量路徑；不是手繪近似圖。

- `mark.svg` / `mark-light.svg`：透明背景向量標誌。
- `mark.png` / `mark-light.png`：1024 px 透明 PNG。
- `app-icon.svg` / `app-icon-*.png`：綠底白色標誌，16–1024 px。
- `wordmark-light.*` / `wordmark-dark.*`：SwiftLocal＋快轉通組合。SVG 使用系統字體；需固定字形時使用 PNG。
- `build/icon.ico` / `build/icon.icns`：Windows 與 macOS 應用程式圖示。

執行 `npm run brand:build` 從 SVG master 重建全部輸出；使用既有的 @napi-rs/canvas，無需網絡或額外描摹工具。Windows 字體輸出使用 Segoe UI / Microsoft JhengHei；其他平台重新生成字標可能有字形差異。

主色 #1f7a68；深色介面標誌色 #b3ead9。保持比例，不加陰影、不拉伸。介面功能圖示來自 Feather 4.29.2，授權見 `../icons/LICENSE`。
