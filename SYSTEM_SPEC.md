# 運彩AI分析師 — 完整系統規格文件

**版本**: v1.1  
**日期**: 2026-05-17  
**起始本金**: NT$3,000（動態複利操作，本金隨盈虧即時更新）

---

## 一、系統定位與目標

| 項目 | 內容 |
|---|---|
| 系統名稱 | 運彩AI分析師 (TW Sports AI Analyst) |
| 主要球種 | NBA、MLB |
| 操盤方式 | 串關為主（2〜4 串），輔以高值單關 |
| 資金管理 | 分數凱利公式（Fractional Kelly）— 以**當日餘額**為基準動態計算 |
| 每日流程 | 自動抓數據 → 分析 → 選場 → 生成報告 → 推送 GitHub Pages |
| 公布時間 | 每天晚上 **22:00（台灣時間 UTC+8）** 發布隔日下注明細 |

---

## 二、整體架構

```
┌─────────────────────────────────────────────────────────────┐
│                    每日排程（22:00 台灣時間）                   │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────┐    ┌─────────────────────┐
│  模組 A：數據抓取     │    │  模組 B：賠率抓取     │
│  - NBA Stats API    │    │  - 台灣運彩官網        │
│  - MLB Stats API    │    │  - 盤口解析           │
│  - 傷兵 / 先發資訊   │    │  - 歷史賠率儲存        │
└──────────┬──────────┘    └──────────┬──────────┘
           │                          │
           └──────────┬───────────────┘
                      ▼
           ┌─────────────────────┐
           │  模組 C：分析引擎    │
           │  - 真實勝率估算      │
           │  - 期望值計算        │
           │  - 凱利公式下注額    │
           │  - 串關組合篩選      │
           └──────────┬──────────┘
                      ▼
           ┌─────────────────────┐
           │  模組 D：報告產生器  │
           │  - 今日選場明細      │
           │  - 昨日成績結算      │
           │  - 資金餘額更新      │
           │  - GitHub Pages 推送 │
           └─────────────────────┘
```

---

## 三、模組 A：數據抓取

### 3.1 NBA 數據來源

| 數據類型 | 來源 | 更新頻率 |
|---|---|---|
| 球隊近期勝敗（L10/L20） | NBA Stats API (`leaguedashteamstats`) | 每日 |
| 主客場勝率分拆 | NBA Stats API | 每日 |
| 球隊進攻 / 防守效率 | Basketball-Reference | 每日 |
| 傷兵名單 | NBA Official Injury Report | 每日 09:00 ET |
| 先發陣容確認 | RotoWire / Rotowire API | 比賽前 2h |
| 近 5 場大小分趨勢 | Basketball-Reference | 每日 |
| 頭對頭歷史（H2H） | Basketball-Reference | 每週 |

**核心指標計算：**
```
進攻效率 (ORtg)  = 每 100 回合得分
防守效率 (DRtg)  = 每 100 回合失分
淨效率 (NetRtg)  = ORtg - DRtg
步調 (Pace)      = 每 48 分鐘回合數
主場優勢係數     = 主場勝率 / 客場勝率（全聯盟平均 ≈ 1.12）
```

### 3.2 MLB 數據來源

| 數據類型 | 來源 | 更新頻率 |
|---|---|---|
| 先發投手（ERA, FIP, WHIP） | Baseball-Reference / MLB Stats API | 每日 |
| 打線陣容 | MLB Stats API (`lineups` endpoint) | 比賽前 3h |
| 球場因素（Park Factor） | FanGraphs | 每週 |
| 牛棚負擔（Bullpen Fatigue） | Baseball-Reference | 每日 |
| 球隊攻擊指標（wOBA, wRC+） | FanGraphs | 每日 |
| 近 10 場勝敗與得失分 | MLB Stats API | 每日 |

---

## 四、模組 B：賠率抓取

### 4.1 台灣運彩官網解析

- **目標 URL**: `https://www.sportslottery.com.tw/`
- **抓取欄位**: 主隊賠率、客隊賠率、讓分盤口、大小分盤口
- **賠率格式**: 台灣運彩使用「十進位制（Decimal Odds）」

```python
# 賠率轉換公式
implied_prob = 1 / decimal_odds
overround = sum(1/odd for odd in [home_odd, away_odd]) - 1  # 莊家優勢
fair_implied_prob = implied_prob / (1 + overround)          # 去除莊家利潤後的隱含勝率
```

### 4.2 賠率儲存格式

```json
{
  "date": "2026-05-18",
  "game_id": "NBA_LAL_GSW",
  "home_team": "LAL",
  "away_team": "GSW",
  "home_odds": 1.85,
  "away_odds": 2.10,
  "spread": -3.5,
  "total_line": 228.5,
  "over_odds": 1.90,
  "under_odds": 1.90,
  "timestamp": "2026-05-17T22:00:00+08:00"
}
```

---

## 五、數據完整性要求（強制規範）

> **核心原則：任何下注決策都必須有真實數據支撐。沒有數據就沒有下注。**

### 5.1 每場選場的必要數據清單

每一個下注選項，必須在報告中呈現以下**所有欄位**，缺少任何一項則該場視為「數據不足，自動排除」：

#### NBA 必要數據

| 數據項目 | 來源 | 最低要求 |
|---|---|---|
| 雙方近 10 場勝率（主/客分拆） | NBA Stats API | 至少 7 場有效記錄 |
| 雙方進攻效率 ORtg | NBA Stats API | 本賽季數據 |
| 雙方防守效率 DRtg | NBA Stats API | 本賽季數據 |
| 雙方淨效率 NetRtg 排名 | NBA Stats API | 本賽季數據 |
| 傷兵名單（先發5人狀態） | NBA Official Injury Report | 比賽前 6 小時內更新 |
| 運彩盤口賠率（讓分/大小分） | 台灣運彩官網 | 下注當日賠率 |
| 隱含勝率（含去莊家利潤） | 計算得出 | 必須顯示計算過程 |
| 模型估算勝率 | 分析引擎輸出 | 必須顯示各調整項數值 |
| Edge 值 | 計算得出 | 必須 ≥ 4% 才納入 |

#### MLB 必要數據

| 數據項目 | 來源 | 最低要求 |
|---|---|---|
| 先發投手姓名與確認狀態 | MLB Stats API / RotoWire | 比賽前 3 小時確認 |
| 先發投手 ERA（本季） | MLB Stats API | 至少先發 3 場以上 |
| 先發投手 FIP（本季） | FanGraphs | 至少先發 3 場以上 |
| 先發投手 WHIP（本季） | Baseball-Reference | 本賽季數據 |
| 打線 wRC+（球隊整體） | FanGraphs | 本賽季數據 |
| 球場因素（Park Factor） | FanGraphs | 本賽季或前季 |
| 牛棚近 3 日 ERA | Baseball-Reference | 必要 |
| 運彩賠率 | 台灣運彩官網 | 下注當日賠率 |
| 隱含勝率 + Edge | 計算得出 | 同 NBA 要求 |

### 5.2 選場決策透明化（每注必標）

報告中每一注都必須附上「**數據卡**」，格式如下：

```
【數據卡範例 — NBA BOS vs NYK，下注 BOS -5.5】

原始數據：
  BOS  NetRtg: +8.2（聯盟第3）  主場勝率: 72%（L10: 7-3）
  NYK  NetRtg: +1.4（聯盟第16）  客場勝率: 44%（L10: 4-6）
  傷兵：NYK Brunson（出賽成疑）→ 估算影響 -3.2% 勝率

模型計算：
  Elo差: BOS 1658 vs NYK 1521 (+137, 主場+100 → 有效差 237)
  Elo勝率: 62.4%
  效率調整: +(8.2-1.4)/10 × 0.15 = +10.2%
  傷兵調整: -3.2%（Brunson）
  近期狀態: BOS L10 70% vs NYK L10 40% → +1.5%
  最終估算勝率: 70.9%

賠率分析：
  運彩 BOS -5.5 賠率: 1.90
  隱含勝率（去莊）: 52.6%  ← (1/1.90) / 1.048
  Edge: 70.9% - 52.6% = +18.3%  ← 遠超4%門檻，A級

凱利計算：
  b=0.90, p=0.709, q=0.291
  Full Kelly: (0.90×0.709 - 0.291)/0.90 = 38.4%
  1/4 Kelly:  38.4% × 0.25 = 9.6%
  當日餘額: NT$3,240
  建議注碼: NT$3,240 × 9.6% = NT$311 → 取整 NT$300
  硬上限檢查: NT$300 < NT$3,240×8%=NT$259 ← 超出上限，調整為 NT$259
  最終注碼: NT$259
```

### 5.3 數據缺失處理規則

```
IF 先發投手未確認（MLB）:
    → 該場自動排除，不下注

IF 傷兵報告超過 6 小時未更新（NBA）:
    → 降級為 C 級信心，凱利係數 0.12，且加警示標記

IF 運彩賠率在下注前 1 小時內有變動（線移）:
    → 重新計算 Edge，若 Edge 跌破 4% 則取消該注

IF 任一必要數據欄位為空（抓取失敗）:
    → 整場排除，記錄為「數據抓取失敗，略過」
```

---

## 七、模組 C：分析引擎

### 7.1 真實勝率估算模型

#### NBA — Elo + 效率差模型（所有輸入必須來自比賽前已公開的數據）

```
步驟 1：基礎勝率（Elo）
  Elo_diff = home_elo - away_elo + home_advantage(100 points)
  base_win_prob = 1 / (1 + 10^(-Elo_diff / 400))

步驟 2：效率調整
  efficiency_adj = sigmoid((home_NetRtg - away_NetRtg) / 10) * 0.15

步驟 3：傷兵調整
  injury_adj = Σ(missing_player_VORP * -0.02)

步驟 4：近期狀態調整
  form_adj = (home_L10_win% - away_L10_win%) * 0.05

步驟 5：最終勝率
  true_prob = base_win_prob + efficiency_adj + injury_adj + form_adj
  true_prob = clamp(true_prob, 0.05, 0.95)
```

#### MLB — 投手主導模型

```
步驟 1：先發投手對決
  pitcher_score = (away_FIP - home_FIP) / 10  # FIP 越低越強
  base_win_prob = 0.50 + pitcher_score

步驟 2：打線品質調整
  offense_adj = (home_wRC+ - away_wRC+) / 1000

步驟 3：球場因素
  park_adj = (park_factor - 1.0) * home_team_advantage * 0.05

步驟 4：牛棚疲勞調整
  bullpen_adj = (home_bullpen_ERA_3d - away_bullpen_ERA_3d) * -0.02

步驟 5：最終勝率
  true_prob = base_win_prob + offense_adj + park_adj + bullpen_adj
  true_prob = clamp(true_prob, 0.05, 0.95)
```

### 7.2 期望值計算（Edge）

```
edge = true_prob - fair_implied_prob

納入標準：
  - edge ≥ +0.04（4% 以上優勢）
  - true_prob ≥ 0.52
  - 賠率 ≥ 1.70（避免極低賠率串關稀釋報酬）
  - 賠率 ≤ 3.50（避免純賭運氣的冷門）
```

### 7.3 凱利公式（動態本金版）

> **核心原則**：每日下注額以**當日最新餘額（current_bankroll）**為基準計算，
> 贏了下注額自動增大，虧了自動縮小，實現複利效應同時控制破產風險。

#### 本金狀態追蹤

```
初始本金      = NT$3,000
current_bankroll = 初始本金 + 歷日累積盈虧   # 每日賽後即時更新
```

#### 單場凱利

```
b = decimal_odds - 1              # 淨賠率
p = true_prob                     # 估算勝率
q = 1 - p                         # 估算敗率
kelly_fraction = (b*p - q) / b    # 全額凱利比例

# 使用 1/4 分數凱利（fractional kelly）降低波動
bet_fraction = kelly_fraction * 0.25

# 注碼以「當日餘額」為基準，非固定金額
bet_amount = current_bankroll * bet_fraction

# 單注硬上限：不超過當日餘額的 8%（防止模型誤判釀成重傷）
bet_amount = min(bet_amount, current_bankroll * 0.08)
```

#### 串關凱利調整

```
parlay_true_prob = Π(true_prob_i)           # 各場勝率相乘
parlay_payout    = Π(decimal_odds_i)        # 各場賠率相乘
parlay_ev        = parlay_true_prob * parlay_payout - 1

# 只有 parlay_ev > 0.08（8%以上期望值）才納入串關
# 串關注碼 = 凱利分數 × 0.15 × current_bankroll（比單關更保守）
parlay_bet = current_bankroll * kelly_fraction * 0.15
```

#### 本金區間與行為對照

| 本金餘額 | 狀況 | 系統行為 |
|---|---|---|
| > NT$3,000 | 獲利中 | 正常操作，注碼隨本金等比增大 |
| NT$2,000〜3,000 | 小虧 | 正常操作，注碼自動縮小 |
| NT$1,500〜2,000 | 中度回撤 | 凱利係數降至 0.15，暫停旗艦串關 |
| NT$1,000〜1,500 | 重度回撤 | 凱利係數降至 0.10，只下單關 |
| < NT$1,000 | 危險區 | 暫停下注 3 天，重新驗證模型 |
| < NT$300 | 終止線 | 系統停止，本金已不足有效操作 |

### 7.4 每日選場邏輯

```
優先順序：
  1. 篩選 edge ≥ 4% 的單場候選（通常 3〜8 場）
  2. 按 edge 由高到低排序
  3. 嘗試組合 2-串、3-串（串關整體 EV ≥ 8%）
  4. 旗艦 4-串（整體 EV > 10%，僅限本金 > NT$1,500 時啟用）

每日下注配置（比例以 current_bankroll 計算）：
  - 15〜20% → 高 edge 單關（2〜3 場）
  - 40〜50% → 2-串、3-串（3〜5 組）
  - 20〜30% → 旗艦 4-串（1〜2 組）
  - 保留 10% 現金不動（緊急備用）

若無高品質串關（EV<8%）：
  → 全部可用資金轉為單關，寧可少下不強押
```

---

## 八、模組 D：每日報告格式

### 8.1 報告結構

```markdown
# 運彩AI分析師 — YYYY-MM-DD 下注明細

## 📊 資金狀況
| 項目 | 金額 |
|---|---|
| 起始本金 | NT$3,000 |
| 昨日下注總額 | NT$XXX |
| 昨日盈虧 | +/- NT$XXX |
| **目前餘額** | **NT$X,XXX** |
| 累積報酬率 | +X.X% |
| 本金高點 | NT$X,XXX |
| 距高點回撤 | -X.X% |

---

## ✅ 昨日成績（YYYY-MM-DD 賽事）

| # | 下注內容 | 下注額 | 結果 | 盈虧 |
|---|---|---|---|---|
| 1 | NBA LAL -3.5 | NT$200 | ✅ 命中 | +NT$180 |
| 2 | MLB NYY 勝場 | NT$200 | ❌ 未中 | -NT$200 |
| 3 | 3-串(LAL+BOS+NYY) | NT$300 | ❌ 未中 | -NT$300 |

---

## 🎯 今日下注明細（YYYY-MM-DD 賽事）

### 單關

| # | 賽事 | 下注方向 | 賠率 | 估算勝率 | Edge | 下注額 |
|---|---|---|---|---|---|---|
| 1 | NBA GSW vs LAL | **LAL -4.5** | 1.88 | 58.2% | +5.1% | NT$XXX |

### 串關

| # | 組合 | 內容 | 總賠率 | 串關EV | 下注額 | 潛在獎金 |
|---|---|---|---|---|---|---|
| 2 | 2-串 | GSW 勝 + NYM 勝 | 3.42 | +9.3% | NT$XXX | NT$XXX |
| 3 | 3-串 | BOS -3 + HOU 勝 + LAD 勝 | 6.80 | +8.7% | NT$XXX | NT$XXX |
| 4 | 4-串（旗艦）| ... | 12.50 | +10.2% | NT$XXX | NT$XXX |

---

## 📈 分析摘要

> **今日重點賽事**：
> - [賽事分析重點，150字以內]

---

*本報告由 AI 自動生成，僅供研究參考，不構成投資建議。運彩有風險，理性下注。*
*發布時間：每日 22:00（台灣時間）*
```

### 8.2 GitHub Pages 部署結構

```
repository: tw-sports-ai/
├── index.html              # 首頁（最新報告 + 統計圖表）
├── reports/
│   ├── 2026-05-18.md       # 每日報告
│   ├── 2026-05-17.md
│   └── ...
├── data/
│   ├── bankroll.json       # 資金追蹤
│   ├── performance.json    # 績效統計
│   └── picks_history.csv   # 歷史選場記錄
├── scripts/
│   ├── fetch_nba.py        # NBA 數據抓取
│   ├── fetch_mlb.py        # MLB 數據抓取
│   ├── fetch_odds.py       # 運彩賠率抓取
│   ├── analyze.py          # 分析引擎
│   ├── kelly.py            # 凱利計算模組
│   ├── report_gen.py       # 報告生成
│   └── deploy.py           # GitHub 自動推送
└── .github/
    └── workflows/
        └── daily_run.yml   # GitHub Actions 自動排程
```

---

## 九、自動化排程（GitHub Actions）

```yaml
# .github/workflows/daily_run.yml
name: 每日運彩分析

on:
  schedule:
    - cron: '0 14 * * *'   # UTC 14:00 = 台灣時間 22:00
  workflow_dispatch:         # 允許手動觸發

jobs:
  analyze-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: 安裝依賴
        run: pip install requests pandas numpy scipy beautifulsoup4 pybaseball
      
      - name: 抓取 NBA 數據
        run: python scripts/fetch_nba.py
        
      - name: 抓取 MLB 數據
        run: python scripts/fetch_mlb.py
        
      - name: 抓取運彩賠率
        run: python scripts/fetch_odds.py
        
      - name: 執行分析引擎
        run: python scripts/analyze.py
        
      - name: 結算昨日成績
        run: python scripts/settle_yesterday.py
        
      - name: 生成報告
        run: python scripts/report_gen.py
        
      - name: 推送至 GitHub Pages
        run: |
          git config --global user.name "Sports AI Bot"
          git config --global user.email "bot@example.com"
          git add .
          git commit -m "每日報告 $(date '+%Y-%m-%d')"
          git push
```

---

## 十、績效追蹤指標

| 指標 | 說明 | 健康目標 |
|---|---|---|
| ROI（投資報酬率） | 總獲利 / 總下注額 | > +5% |
| 命中率（單關） | 命中注數 / 總注數 | > 54% |
| 串關命中率（2-串） | 命中組數 / 總組數 | > 28% |
| 平均 Edge | 所有選場的平均優勢值 | > 4% |
| 最大回撤 | 資金從高點下跌最大幅度 | < 40% |
| 凱利執行準確度 | 實際下注額 vs 凱利建議誤差 | < 5% |

---

## 十一、風險控制機制

### 11.1 停損規則

```
單日最大損失上限：當日餘額的 15%
  → 若當日已虧損達上限，停止當日所有下注

連續虧損保護：
  → 連續 5 天虧損 → 降低凱利分數至 0.15（原 0.25）
  → 連續 10 天虧損 → 暫停下注 3 天，重新檢視模型
  → 本金跌破 NT$1,000 → 切換純單關保守模式

串關最高賠率上限：15.0
  → 超過 15 倍的串關組合自動排除（風險過高）

單注最大金額上限：當日餘額 × 8%
  → 無論凱利建議多高，硬性上限保護本金
```

### 11.2 模型信心分級

| 等級 | 條件 | 凱利係數 | 最大單注上限 |
|---|---|---|---|
| A 級（強） | Edge ≥ 7%, 數據完整 | 0.25 | NT$400 |
| B 級（中） | Edge 4〜7%, 數據完整 | 0.20 | NT$300 |
| C 級（弱） | Edge 4〜7%, 數據部分缺失 | 0.12 | NT$150 |
| 不下注 | Edge < 4% | — | — |

---

## 十一、歷史回測框架（Backtest）

### 11B.1 回測定義與目標

| 項目 | 設定 |
|---|---|
| 起始日期 | 2026-04-01（或 4 月任意有賽事的第一天） |
| 起始本金 | NT$3,000 |
| 結束條件 A | 本金歸零（≤ NT$0） → 回測終止，記錄「破產日期」 |
| 結束條件 B | 本金超過 NT$6,000（翻倍）→ 回測終止，記錄「達標日期」 |
| 結束條件 C | 2026-05-17（今日，最新可用數據截止）→ 自然結束 |
| 球種 | NBA（2025-26 球季季後賽）、MLB（2026 球季常規賽） |

> **嚴格無未來數據原則（No-Lookahead）**：
> 每一天的分析，只能使用「該天賽事開打前已公開的數據」。
> 例如 4 月 5 日的下注，只能用 4 月 4 日結束時已有的統計。

---

### 11B.2 歷史賠率來源（運彩替代方案）

台灣運彩官網不提供歷史賠率查詢，回測使用以下替代方案：

| 優先順序 | 來源 | 說明 |
|---|---|---|
| 1 | **Pinnacle Historical Odds** | 國際最精準賠率商，歷史數據免費查詢 |
| 2 | **The Odds API**（付費） | 支援多莊家歷史賠率，格式標準化 |
| 3 | **oddsportal.com 爬蟲** | 免費，含台灣運彩部分歷史數據 |
| 4 | **運彩公式還原** | 用 Pinnacle 賠率 × 台灣運彩固定莊家邊際（約 4.8%）換算 |

**莊家邊際換算公式（用於回測）：**
```
# 台灣運彩平均讓利率（overround）≈ 4.8%（兩隊盤）
# 將 Pinnacle 公平賠率還原為運彩等效賠率：
tw_odds = pinnacle_fair_odds / (1 + 0.048)

# 或直接使用 Pinnacle 賠率計算 Edge（更保守，因 Pinnacle 本身賠率已很高）
```

---

### 11B.3 逐日回測流程

```
FOR each trading_day IN [2026-04-01 → 結束條件觸發]:

    1. 讀取 bankroll（前一日結算後餘額）
    
    2. IF bankroll ≤ 0:
           記錄「破產」→ 終止回測
       IF bankroll > 6000:
           記錄「達標」→ 終止回測
    
    3. 抓取當日賽事列表（NBA + MLB）
       IF 無賽事（例假日）:
           skip，bankroll 不變
    
    4. 對每場賽事執行數據完整性檢查（§5.1 清單）
       缺失欄位 → 排除該場
    
    5. 計算每場 true_prob、implied_prob、edge
       edge < 4% → 排除
    
    6. 篩選後建立選場清單，執行凱利計算
       依本金區間決定凱利係數（§7.3 本金區間表）
    
    7. 串關篩選（EV ≥ 8%）+ 4-串旗艦（EV ≥ 10%）
    
    8. 記錄下注明細到 backtest_log.csv
    
    9. 比賽結束後，讀取實際比賽結果
       根據結果計算 win/loss，更新 bankroll
    
    10. 產生當日數據卡（同格式，用於驗證）
```

---

### 11B.4 回測輸出格式

#### 每日記錄（`backtest_log.csv`）

```csv
date,game_id,sport,bet_type,direction,odds,true_prob,implied_prob,edge,kelly_frac,bet_amount,bankroll_before,result,pnl,bankroll_after
2026-04-01,NBA_BOS_NYK,NBA,spread,BOS-5.5,1.90,0.709,0.526,0.183,0.096,259,3000,WIN,+233,3233
2026-04-01,NBA_LAL_GSW_MLB_NYY_BOS,PARLAY,3-parlay,,6.80,0.142,0.147,0.082,,300,3000,LOSS,-300,2933
...
```

#### 回測摘要報告（`backtest_summary.md`）

```markdown
## 回測結果摘要

**測試期間**：2026-04-XX → 2026-XX-XX  
**起始本金**：NT$3,000  
**結束本金**：NT$X,XXX  
**結束原因**：[本金歸零 / 突破NT$6,000 / 數據截止]  
**總天數**：XX 天（有下注 XX 天）

### 資金曲線關鍵點
| 日期 | 事件 | 本金 |
|---|---|---|
| 2026-04-01 | 回測開始 | NT$3,000 |
| YYYY-MM-DD | 本金高點 | NT$X,XXX |
| YYYY-MM-DD | 最大回撤低點 | NT$X,XXX |
| YYYY-MM-DD | 回測結束 | NT$X,XXX |

### 整體績效
| 指標 | 數值 |
|---|---|
| 總下注次數 | XX 注 |
| 命中率（單關） | XX% |
| 串關命中率 | XX% |
| 總投入金額 | NT$X,XXX |
| 總獲利 | NT$X,XXX |
| ROI | +/-XX.X% |
| 最大回撤 | -XX.X% |
| 平均每日 Edge | +X.X% |
| 平均凱利準確度 | XX% |

### 各月份績效分拆
| 月份 | 下注數 | 命中率 | 月盈虧 | 月末本金 |
|---|---|---|---|---|
| 2026-04 | XX | XX% | +/-NT$XXX | NT$X,XXX |
| 2026-05 | XX | XX% | +/-NT$XXX | NT$X,XXX |
```

---

### 11B.5 回測防坑清單

| 常見偏差 | 防範措施 |
|---|---|
| **未來數據洩漏** | 所有數據查詢加上 `as_of_date` 參數，限制到比賽前一天 |
| **選擇性樣本偏差** | 不允許事後排除任何已下注記錄，全部如實記錄 |
| **賠率時機偏差** | 使用開盤賠率或下注當時的賠率快照，非收盤賠率 |
| **傷兵資訊超前** | 傷兵狀態快照必須是「賽前 6 小時前發布的版本」 |
| **過度擬合** | 模型參數鎖定後不得因回測結果反向調整，需保持一致 |

---

## 十二、技術棧總覽

| 類別 | 工具 |
|---|---|
| 語言 | Python 3.11 |
| NBA 數據 | `nba_api` 套件、Basketball-Reference 爬蟲 |
| MLB 數據 | `pybaseball` 套件、MLB Stats API |
| 運彩賠率 | Requests + BeautifulSoup4 |
| 數據分析 | Pandas、NumPy、SciPy |
| 報告生成 | Jinja2 模板 → Markdown / HTML |
| 自動排程 | GitHub Actions（免費，每月 2000 分鐘） |
| 網站呈現 | GitHub Pages（免費靜態託管） |
| 資料儲存 | JSON + CSV（存在 repo 內，版本可追溯） |

---

## 十三、開發里程碑

| 階段 | 任務 | 預估時間 |
|---|---|---|
| P1 | 建立 repo 架構 + GitHub Actions 骨架 | 0.5 天 |
| P2 | NBA/MLB 數據抓取模組（含 as_of_date 防洩漏機制）| 1 天 |
| P3 | 賠率抓取模組（運彩官網 + Pinnacle 歷史賠率備援）| 1 天 |
| P4 | 分析引擎：Elo 模型 + MLB 投手模型 + 數據完整性驗證 | 1.5 天 |
| P5 | 凱利計算 + 動態本金管理 + 信心分級 | 0.5 天 |
| P6 | 回測引擎：逐日模擬（2026-04 → 結束條件）| 1.5 天 |
| P7 | 報告生成器（含數據卡）+ GitHub Pages 模板 | 1 天 |
| P8 | 結算模組（昨日成績自動比對）+ 資金曲線圖 | 1 天 |
| P9 | 整合測試：回測跑完驗證，確認無未來數據洩漏 | 1 天 |
| **合計** | | **約 9 天** |

> **里程碑優先順序**：P6（回測）必須在 P7（正式報告）前完成，
> 回測結果驗證模型有效性，才能決定是否上線實際下注。

---

## 十四、注意事項與法律聲明

1. **台灣運彩為合法政府彩券**，本系統操作合法。
2. 本系統分析結果為**統計機率估算**，不保證獲利，過去績效不代表未來表現。
3. 凱利公式假設估算勝率精確，**實際模型誤差會影響效果**，建議前 30 天用紙上交易驗證。
4. 運彩下注有單注上限，串關高倍率時需注意**官網最高派彩限制**。
5. 建議設定**個人停損預算**，理性娛樂，量力而為。

---

*文件版本：v1.2 | 最後更新：2026-05-17*
