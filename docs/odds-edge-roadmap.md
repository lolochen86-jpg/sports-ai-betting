# Score-to-Odds Edge Analyzer

目標：把 NBA / MLB 的 AI 預測比數轉成可下注市場的機率與公平賠率，再直接對照各大國際盤與台灣運彩拍照 OCR 盤，找出正期望值投注機會。

## 核心資料流

```text
AI 預測比數
-> 勝率 / 讓分 / 大小分機率
-> 公平賠率
-> 國際盤 API 多莊家比價
-> 台灣運彩照片 OCR
-> Edge / EV / Kelly
-> 推薦等級與下注金額
```

## 國際盤資料來源

優先使用正式 odds API 或聚合 API，不從既有報告頁抓資料。

建議順序：

1. The Odds API
   - NBA sport key: `basketball_nba`
   - MLB sport key: `baseball_mlb`
   - markets: `h2h`, `spreads`, `totals`
   - regions: `us`, `uk`, `eu`, `au`
   - 用來取得 DraftKings、FanDuel、BetMGM、Caesars、BetRivers、Bovada、Unibet、William Hill 等 bookmaker。

2. Pinnacle 或 Pinnacle-like sharp source
   - 作為 sharp baseline。
   - 優先比較 closing line、主盤讓分、大小分與 moneyline。

3. 第二聚合來源
   - OddsPapi、odds-api.io、TXOdds 等來源可補強 bookmaker 覆蓋與歷史盤。

## 台灣運彩 OCR

台灣運彩來源以使用者拍照上傳為主。

需要擷取欄位：

- sport: NBA / MLB
- game time
- home team
- away team
- market: moneyline / spread / total
- line: 讓分或大小分盤口
- odds: decimal odds
- screenshot timestamp
- OCR confidence

OCR 必須提供人工校正畫面，因為賠率數字、隊名、讓分正負號最容易誤讀。

## 比數轉賠率

### Moneyline

```text
model_home_prob = score_model_home_win_probability
model_away_prob = 1 - model_home_prob
home_fair_odds = 1 / model_home_prob
away_fair_odds = 1 / model_away_prob
```

### Spread

```text
predicted_margin = predicted_home_score - predicted_away_score
spread_cover_prob = P(model_margin > sportsbook_spread)
spread_fair_odds = 1 / spread_cover_prob
```

NBA 可用常態分布近似分差，MLB 可用 Poisson / Skellam 或 Monte Carlo 模擬分差。

### Total

```text
predicted_total = predicted_home_score + predicted_away_score
over_prob = P(model_total > sportsbook_total)
under_prob = 1 - over_prob
```

NBA 用總分常態分布，MLB 用 Poisson 或 Monte Carlo。

## 去水與市場機率

對任一雙邊市場：

```text
raw_home_prob = 1 / home_odds
raw_away_prob = 1 / away_odds
overround = raw_home_prob + raw_away_prob - 1
fair_home_prob = raw_home_prob / (raw_home_prob + raw_away_prob)
fair_away_prob = raw_away_prob / (raw_home_prob + raw_away_prob)
```

國際盤要計算：

- best odds
- average odds
- sharp odds
- no-vig implied probability
- bookmaker count
- latest update time

## Edge / EV / Kelly

```text
edge = model_prob - market_no_vig_prob
ev = model_prob * decimal_odds - 1
b = decimal_odds - 1
kelly = (b * model_prob - (1 - model_prob)) / b
fractional_kelly = max(0, kelly) * 0.25
```

推薦等級：

- Pass: `ev <= 0` 或 `edge < 2%`
- Watch: `edge >= 2%`
- Small Edge: `edge >= 4%` 且 `ev > 0`
- Strong Edge: `edge >= 7%` 且 `ev >= 5%`

## 三方比對輸出

每一場比賽每一個市場都輸出：

- AI predicted score
- model probability
- model fair odds
- international best odds
- international sharp no-vig probability
- Taiwan Sports Lottery OCR odds
- Taiwan implied probability
- edge vs international
- edge vs Taiwan Sports Lottery
- EV
- Kelly stake
- recommendation

## 實作順序

1. 新增 odds-provider abstraction：`international`、`sharp`、`taiwan_ocr`
2. 新增 score-to-market converter：moneyline、spread、total
3. 串 The Odds API，正規化 bookmaker / team / market
4. 新增 OCR upload pipeline：圖片上傳、OCR parse、人工校正
5. 新增 comparison engine：AI vs international、AI vs Taiwan、Taiwan vs international
6. 更新報告與首頁：每場最佳 edge、台彩是否優於國際盤、不下注原因

## 風險與限制

- 賠率 API 通常有免費額度與請求限制，需要快取。
- 台彩 OCR 不能全自動信任，必須允許人工校正。
- 國際盤與台彩盤口可能不同，需要同市場同盤口才可比較。
- 若盤口不同，例如國際盤 `BOS -5.5`、台彩 `BOS -6.5`，必須重新計算該盤口 cover probability。
- 所有輸出都應標記資料時間，避免用過期盤做決策。
