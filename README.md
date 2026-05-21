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

`live` 直接串流麥克風 PCM 並沿用 `analyze` 的音高偵測與繪圖（每 ~200ms 重畫最近 `--window` 秒，預設 10s）。
為避免畫面高度亂跳，`live` 預設用**固定 Y 軸 `C3–C6`** 並隱藏每音平均表；可用 `--min-note` / `--max-note`（音名或 Hz）調整範圍，例如 `--min-note A2 --max-note A5`。
**橫軸也固定為最近 `--window` 秒（0→N）**，時間尺度不會隨資料伸縮。

### 情境：用手機/喇叭播放歌曲（best-effort 抓主旋律）

手機喇叭音量小、伴奏為複音，命中率有限。下列旗標把偵測**聚焦在人聲旋律範圍**、放寬門檻與靜音 floor：

```bash
# 即時監看
node src/index.js live \
  --rms 0.002 --threshold 0.2 --min-hz 130 --max-hz 700 \
  --min-note C3 --max-note F5

# 分析已錄好的檔案
node src/index.js analyze song.mp3 \
  --rms 0.002 --threshold 0.2 --min-hz 130 --max-hz 700
```

各旗標用意：`--rms 0.002` 收得到小聲；`--threshold 0.2` 放寬靈敏度多抓旋律幀；
`--min-hz 130`(≈C3) 濾掉貝斯/大鼓；`--max-hz 700`(≈F5) 聚焦主唱、濾掉鈸/高泛音；
`--min-note C3 --max-note F5`（僅 live）把 Y 軸固定到旋律音域。

**男聲版**（基頻較低，主旋律約 A2–A4、高音可到 ~C5，所以音域整個往下移）：

```bash
# 即時監看
node src/index.js live \
  --rms 0.002 --threshold 0.2 --min-hz 90 --max-hz 520 \
  --min-note E2 --max-note C5

# 分析檔案
node src/index.js analyze song.mp3 \
  --rms 0.002 --threshold 0.2 --min-hz 90 --max-hz 520
```

與通用版差異：`--min-hz 130→90`(≈F#2，收得到男聲低音)、`--max-hz 700→520`(≈C5，砍更多伴奏)、
Y 軸 `C3–F5 → E2–C5`。微調：貝斯/大鼓干擾多 → `--min-hz` 拉高到 110–130；飆假音被砍 → `--max-hz 600`、`--max-note E5`。
（「印度歌手/英文歌」對設定不影響；只有男聲音域是關鍵。若是印度古典風的 meend 滑音，曲線連續滑動屬正常，tanpura drone 可能搶偵測，需更窄的 `--min-hz` 避開。）

> ⚠️ 整首歌為**複音**，YIN 無法穩定追音；此組合只是盡量抓最大聲的主旋律，會有八度誤判等雜訊。
> 想要連續可靠的旋律線，請改成**清唱**（詳見 [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)）。

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
| `--window` | （live）顯示最近幾秒（同時固定橫軸 0→N） | 10 |
| `--min-note` / `--max-note` | 固定 Y 軸範圍（音名如 `C3` 或 Hz） | live 預設 C3–C6 |
| `--threshold` | YIN 靈敏度（約 0.05–0.30，越大越敏感） | 0.12 |
| `--rms` | 靜音門檻（越小越能收小聲） | 0.005 |
| `--min-hz` / `--max-hz` | 合理基頻範圍，範圍外捨棄 | 65 / 1100 |
| `--no-color` | 關閉終端顏色 | （預設彩色） |

> 折線圖永遠是**一條連續線、不中斷**：音與音之間的空缺以內插連接，開頭/結尾無聲時平拉最近的音，整段無聲則在 Y 軸中央畫平線。
> 凡是這類「補出來/沒真的抓到音高」的段落一律以**灰色 `╌`** 呈現，與真正量測到的綠/紅/青清楚區隔。
> 注意 Y 軸是**音高**（最底為最低音界，非 0；0Hz 在對數刻度為 −∞）；若要看音量請用另一種圖。
> 放寬 `--threshold` / `--rms` 可多抓小聲或雜訊輸入，但會增加八度誤判等雜訊；對**複音歌曲**仍無法穩定追音（見 `TROUBLESHOOTING.md`）。
