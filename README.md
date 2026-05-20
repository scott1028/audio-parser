# audio-wave-exaimer

偵測唱歌/演奏走音的 CLI 工具。核心指標：

- **音分誤差 (Cent Deviation)**：1 半音 = 100 cent，衡量音高偏差（以最近的十二平均律音為基準）。
- **音準軌跡 (Pitch Curve)**：時間軸上的基頻 (f0) 變化，於終端機以 ASCII 曲線呈現。

零執行期相依：音訊 I/O 由系統 `ffmpeg` / `arecord` / `aplay` 完成，音高偵測為純 JS 自製 YIN。

## 需求

- Node.js (建議 ≥ 18)
- `ffmpeg`（需含 `libmp3lame`，用於 mp3 編碼/解碼與 ALSA 收音）
- Linux + ALSA（`arecord` / `aplay`，USB 麥克風收音用）

## 使用

```bash
# 列出可用的擷取裝置（USB 麥克風）
node src/index.js devices

# Phase 1：錄音 → mp3（不給 --duration 則按 Ctrl+C 結束）
node src/index.js record --device plughw:3,0 --duration 5 --out test.mp3

# 播放驗證有聲音
node src/index.js play test.mp3

# Phase 2：分析音準，輸出曲線圖與 cent 統計
node src/index.js analyze test.mp3 --a4 440 --tolerance 25

# 即時版：邊唱邊看，終端動態更新（畫面與 analyze 相同，Ctrl+C 結束）
node src/index.js live --device plughw:3,0 --tolerance 25
```

也可用 npm scripts：`npm run devices` / `npm run record -- --duration 5` / `npm run live` 等。

`live` 直接串流麥克風 PCM 並沿用 `analyze` 的音高偵測與繪圖（每 ~200ms 重畫最近 `--window` 秒，預設 6s）。
為避免畫面高度亂跳，`live` 預設用**固定 Y 軸 `C3–C6`** 並隱藏每音平均表；可用 `--min-note` / `--max-note`（音名或 Hz）調整範圍，例如 `--min-note A2 --max-note A5`。

## 分析輸出

```
Pitch Curve  (time 0.0s → 3.0s, ...)
Y = note, X = time ──▶

A#4 ·
A4  ●●●●●●●●●●●●●●●●●●●●     ← 偵測到的音準軌跡
G#4 ·
...
    └────────────────────
    0.0s   0.8s   1.5s ...

Legend: ● on   ▲ sharp (>+25¢)   ▼ flat (<-25¢)

Cent Deviation Summary
  Mean absolute deviation: x.x cents
  In tune (±25¢)         : n/N (xx%)
  ...
```

## 參數

| 旗標 | 說明 | 預設 |
|------|------|------|
| `--device` | ALSA 擷取裝置（`awe devices` 可查） | 自動挑選 |
| `--duration` | 錄音秒數 | 持續至 Ctrl+C |
| `--out` | 輸出 mp3 路徑 | `recordings/rec-<時間>.mp3` |
| `--a4` | A4 參考頻率 (Hz) | 440 |
| `--tolerance` | 視為「準」的 cent 容許範圍 (±) | 25 |
| `--chart` | 曲線樣式 `line`（折線）/ `dots`（散點） | line |
| `--window` | （live）顯示最近幾秒 | 6 |
| `--no-color` | 關閉終端顏色 | （預設彩色） |
