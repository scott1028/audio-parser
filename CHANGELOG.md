# Changelog

本檔記錄專案的重要變更。

## [Unreleased]

### 新增 (Added)

- **`awe live` 即時音準監看**（npm script `npm run live`）：直接串流麥克風 PCM，
  每 ~200ms 清畫面重畫最近 `--window` 秒（預設 6s）。完全沿用 `analyzePitchTrack`
  與 `renderChart`。支援 `--device/--a4/--tolerance/--chart/--window/--min-note/--max-note/--no-color`。
- **折線圖**：`analyze`/`live` 新增 `--chart line|dots`（預設 `line`），以 box-drawing
  字元繪製連續音準曲線（asciichart 風格，子半音解析度）。`dots` 為原本的散點樣式。
- **固定 Y 軸**：`--min-note` / `--max-note`（接受音名如 `C3` 或 Hz）可固定縱軸範圍。
  `cents.js` 新增 `noteToMidi` / `parsePitchBound`。
- **折線補洞**：折線圖自動以內插連接 ≤2 欄的短暫掉幀（`GAP_BRIDGE`），減少清唱小斷點造成的破圖；較長空缺仍保留為真實斷點。
- **偵測調參旗標**：`analyze` / `live` 新增 `--threshold` / `--rms` / `--min-hz` / `--max-hz`，
  穿過至 `analyzePitchTrack`。`yin.js` 新增 `detectOptions()` 供 analyze/live 共用組裝。
- **折線連續灰線**：折線圖改為永遠連續、不中斷——音間空缺以內插連接，開頭/結尾無聲時平拉最近的音，
  整段無聲則在 Y 軸中央畫平線。所有「補出來/沒抓到音高」的段落以**灰色 `╌`**（新增 `gap` 類別）呈現，
  與真實量測的綠/紅/青區隔。`renderChart` 新增 `tMin` / `tMax` 可固定橫軸時間窗。

### 變更 (Changed)

- **live 高度不再亂跳**：預設固定 Y 軸 `C3–C6`、隱藏每音平均表，靜音時仍畫出完整格線
  與統計（顯示「waiting for sound…」），使每幀高度恆定；列數另受終端高度上限約束以避免溢出。
- **live 橫軸固定為最近 N 秒**：透過 `tMin/tMax` 固定為 `0→--window`，時間尺度不再隨資料伸縮；
  `--window` 預設由 6 改為 **10s**（新增 `LIVE_WINDOW_SEC` 常數）。
- **折線補洞改為全橋接**：原本只內插 ≤2 欄的短掉幀（`GAP_BRIDGE`），現移除上限改為連接所有空缺，
  並以灰色標示，取代原先「較長空缺保留為真實斷點」的行為。

### 修正 (Fixed)

- **live 過去音高不再上下浮動**：原本每幀把整個滾動 PCM 視窗從頭重跑 YIN，視窗每幀滑掉的量非 hop 整數倍，
  使同一瞬間每幀被不同對齊的取樣框分析、f0 估值抖動。改為**增量分析 + 釘在絕對時間的已提交歷史**
  （`live.js` 維護 `tail`/`tailStart`/`history`），每段聲音只分析一次即定稿；新音從右側進、舊音往左捲。
  與一次性整段分析逐幀完全一致（已驗證）。

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
