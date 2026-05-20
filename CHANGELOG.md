# Changelog

本檔記錄專案的重要變更。

## [Unreleased]

### 新增 (Added)

- **`awe live` 即時音準監看**（npm script `npm run live`）：直接串流麥克風 PCM，
  每 ~200ms 清畫面重畫最近 `--window` 秒（預設 6s）。完全沿用 `analyzePitchTrack`
  與 `renderChart`，畫面與 `awe analyze` 一致。支援 `--device/--a4/--tolerance/--chart/--window/--no-color`。
- **折線圖**：`analyze`/`live` 新增 `--chart line|dots`（預設 `line`），以 box-drawing
  字元繪製連續音準曲線（asciichart 風格，子半音解析度）。`dots` 為原本的散點樣式。

## [1.0.0] - 2026-05-21

走音檢測工具初版，核心指標為**音分誤差 (Cent Deviation)** 與**音準軌跡 (Pitch Curve)**。
純 Node.js + 系統 ffmpeg/ALSA，零執行期 npm 相依。

### 新增 (Added)

- **Phase 1 — 錄音/播放**
  - `awe devices`：解析 `arecord -l` 列出 USB 擷取裝置，並挑選預設麥克風。
  - `awe record`：透過 ffmpeg 從 ALSA 收音並編碼為 mp3（`--device` / `--duration` / `--out`，無 duration 時 Ctrl+C 結束）。
  - `awe play`：以 ffplay（或 `ffmpeg | aplay`）播放驗證有聲音。
- **Phase 2 — 分析**
  - `awe analyze`：mp3 → ffmpeg 解碼 PCM → 自製 YIN 逐幀偵測 f0 → 終端 ASCII 音準曲線 + cent 統計（`--a4` / `--tolerance` / `--no-color`）。
  - 自製 YIN 音高偵測（`src/pitch/yin.js`）、hz→音名→cent 轉換（`src/pitch/cents.js`）。
  - 終端輸出：音準曲線圖、cent 偏差統計（平均絕對誤差 / 準確率 / 最大偏差 / 判定）、各音平均偏差表。
- `README.md`、`package.json`(type:module, bin `awe`, scripts)。

### 變更 (Changed)

- `--tolerance` 預設由 50 改為 **25** 音分。cent 以「最近半音」為基準恆落在 ±50 內，門檻設 50 會使準確率永遠 100% 而失去意義；25¢ 才能有效區分「準」與「明顯偏高/偏低」。

### 檔案結構

```
audio-wave-exaimer/
├ package.json
├ README.md
├ CHANGELOG.md
└ src/
   ├ index.js           # CLI 分派：devices / record / play / analyze
   ├ constants.js       # A4, 音名表, 取樣率, frame/hop, 門檻
   ├ devices.js         # 解析 arecord -l 列裝置
   ├ record.js          # Phase1: ffmpeg ALSA → mp3
   ├ play.js            # ffplay / ffmpeg|aplay 播放
   ├ decode.js          # ffmpeg → Float32Array PCM
   ├ analyze.js         # Phase2 編排
   ├ pitch/yin.js       # 自製 YIN 音高偵測
   ├ pitch/cents.js     # hz→MIDI→音名 + cent
   └ render/chart.js    # ASCII 曲線 + cent 統計
```

### 驗證 (Verification)

| 測試 | 預期 | 實測 | 結果 |
|------|------|------|------|
| `devices` | 列出 USB 麥克風 | 偵測到 ATR4697-USB (plughw:3,0) 並設為預設 | ✅ |
| A4 純音 440Hz | ≈A4, 0¢, 平坦 | A4, 平均 0.3¢, 100% 準 | ✅ |
| +30¢ 偏高音 | 標記 sharp | A4 +30.3¢, 0% 準, 「Often off pitch」 | ✅ |
| 音階 C4→E4→G4→C5 | 上升階梯曲線 | 階梯曲線正確、各音 ~0¢ | ✅ |
| Phase1 實錄 2s | 有效 mp3 | 44100Hz mono mp3, ffprobe 正常 | ✅ |
| 彩色輸出 | ANSI 不破版 | 綠/紅/青正確套用 | ✅ |

> 註：「播放有聲音」屬人工確認 AC，需親耳驗證（`awe play <file>`）。

### 待辦 (TODO)

- [ ] 對照參考旋律/MIDI 模式（目前只比對最近半音）。
- [ ] 匯出 CSV/JSON 供後續視覺化。

### 參考 (Reference)

- de Cheveigné & Kawahara (2002), *YIN, a fundamental frequency estimator for speech and music*, JASA 111(4).
