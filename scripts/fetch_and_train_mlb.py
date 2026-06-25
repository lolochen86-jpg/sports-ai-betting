import os
import time
import json
from datetime import datetime
import pandas as pd
import requests
from tqdm import tqdm
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score

def fetch_mlb_games(season: int) -> pd.DataFrame:
    """
    Fetches MLB game results for a given season from the official MLB API.
    Caches the results locally to avoid redundant API hits.
    """
    os.makedirs('data', exist_ok=True)
    cache_path = f"data/{season}_mlb_games.csv"
    if os.path.exists(cache_path):
        print(f"📁 載入 {season} 賽季快取資料: {cache_path}")
        return pd.read_csv(cache_path)

    print(f"📡 開始抓取 {season} 常規賽比分數據...")
    schedule_url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        "sportId": 1,
        "season": season,
        "gameType": "R"
    }

    try:
        res = requests.get(schedule_url, params=params, timeout=15)
        if res.status_code != 200:
            print(f"❌ 無法獲取 {season} 排程數據 (HTTP {res.status_code})")
            return pd.DataFrame()
    except Exception as e:
        print(f"❌ 請求排程數據發生錯誤: {e}")
        return pd.DataFrame()

    schedule_data = res.json()
    games_list = []

    for date_obj in schedule_data.get('dates', []):
        for game in date_obj.get('games', []):
            # Only pull finalized regular season games
            state = game.get('status', {}).get('abstractGameState', '')
            if state != 'Final':
                continue
            game_pk = game.get('gamePk')
            if not game_pk:
                continue
            games_list.append(game)

    print(f"🔍 在 {season} 賽季中找到 {len(games_list)} 場已完賽常規賽")

    records = []
    for game in tqdm(games_list, desc=f"抓取 {season} 比數"):
        game_pk = game['gamePk']
        date = game.get('officialDate', '')

        # Gather values from schedule info
        sched_home_score = game.get('teams', {}).get('home', {}).get('score')
        sched_away_score = game.get('teams', {}).get('away', {}).get('score')
        sched_home_name = game.get('teams', {}).get('home', {}).get('team', {}).get('name', '')
        sched_away_name = game.get('teams', {}).get('away', {}).get('team', {}).get('name', '')

        home_name = sched_home_name
        away_name = sched_away_name
        home_score = sched_home_score
        away_score = sched_away_score

        # Only pull boxscore if scores are missing from schedule (saves thousands of HTTP calls)
        if home_score is None or away_score is None:
            box_url = f"https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
            box_res = None
            delay = 1.0

            # Max 3 retries with exponential backoff
            for retry in range(3):
                try:
                    box_res = requests.get(box_url, timeout=5)
                    if box_res.status_code == 200:
                        break
                except Exception:
                    pass
                time.sleep(delay)
                delay *= 2

            if box_res and box_res.status_code == 200:
                try:
                    box_data = box_res.json()
                    teams_box = box_data.get('teams', {})
                    home_name = teams_box.get('home', {}).get('team', {}).get('name', home_name)
                    away_name = teams_box.get('away', {}).get('team', {}).get('name', away_name)
                    
                    h_runs = teams_box.get('home', {}).get('teamStats', {}).get('batting', {}).get('runs')
                    a_runs = teams_box.get('away', {}).get('teamStats', {}).get('batting', {}).get('runs')

                    if h_runs is not None:
                        home_score = h_runs
                    if a_runs is not None:
                        away_score = a_runs
                except Exception:
                    pass
            
            # Avoid hitting rate limits
            time.sleep(0.3)

        if home_score is None or away_score is None:
            continue

        try:
            home_score = int(home_score)
            away_score = int(away_score)
        except ValueError:
            continue

        home_team_won = 1 if home_score > away_score else 0

        records.append({
            "gamePk": game_pk,
            "date": date,
            "home_team": home_name,
            "away_team": away_name,
            "home_score": home_score,
            "away_score": away_score,
            "home_team_won": home_team_won
        })
        
        time.sleep(0.3) # 避免限流

    df = pd.DataFrame(records)
    if not df.empty:
        df.to_csv(cache_path, index=False)
        print(f"💾 抓取完成，共 {len(df)} 筆資料已存入 {cache_path}")
    return df

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes lookahead-bias-free rolling statistics for both teams.
    Excludes the first 15 games of the season for each team.
    """
    # Sort chronologically
    df = df.sort_values(by='date').reset_index(drop=True)
    
    team_history = {}
    feature_rows = []

    for _, row in df.iterrows():
        home = row['home_team']
        away = row['away_team']
        date = row['date']

        if home not in team_history:
            team_history[home] = []
        if away not in team_history:
            team_history[away] = []

        home_hist = team_history[home]
        away_hist = team_history[away]

        # Restrict to after the warmup period (15 games)
        if len(home_hist) >= 15 and len(away_hist) >= 15:
            # Season-to-date Win Rate
            home_win_pct = sum(1 for g in home_hist if g['won']) / len(home_hist)
            away_win_pct = sum(1 for g in away_hist if g['won']) / len(away_hist)

            # Last 10 games rolling win rate, avg runs scored, avg runs allowed
            home_l10 = home_hist[-10:]
            home_l10_win_pct = sum(1 for g in home_l10 if g['won']) / len(home_l10)
            home_rs_avg = sum(g['runs_scored'] for g in home_l10) / len(home_l10)
            home_ra_avg = sum(g['runs_allowed'] for g in home_l10) / len(home_l10)

            away_l10 = away_hist[-10:]
            away_l10_win_pct = sum(1 for g in away_l10 if g['won']) / len(away_l10)
            away_rs_avg = sum(g['runs_scored'] for g in away_l10) / len(away_l10)
            away_ra_avg = sum(g['runs_allowed'] for g in away_l10) / len(away_l10)

            feature_rows.append({
                "gamePk": row['gamePk'],
                "date": date,
                "home_team": home,
                "away_team": away,
                "home_win_pct": home_win_pct,
                "away_win_pct": away_win_pct,
                "home_l10_win_pct": home_l10_win_pct,
                "away_l10_win_pct": away_l10_win_pct,
                "home_rs_avg": home_rs_avg,
                "away_rs_avg": away_rs_avg,
                "home_ra_avg": home_ra_avg,
                "away_ra_avg": away_ra_avg,
                "is_home_advantage": 1,
                "home_team_won": row['home_team_won']
            })

        # Append game outcome to team historical records (affects future games only)
        team_history[home].append({
            "won": row['home_team_won'] == 1,
            "runs_scored": row['home_score'],
            "runs_allowed": row['away_score']
        })
        team_history[away].append({
            "won": row['home_team_won'] == 0,
            "runs_scored": row['away_score'],
            "runs_allowed": row['home_score']
        })

    features_df = pd.DataFrame(feature_rows)
    print(f"📊 特徵工程完畢：排除首15場熱身後，共有 {len(features_df)} 筆可用樣本")
    return features_df

def train_and_export(df: pd.DataFrame):
    """
    Trains a Logistic Regression model on the engineered features and exports
    the weights, mean scaling values, and evaluation metrics to JSON.
    """
    if df.empty:
        print("❌ 無特徵數據可用於模型訓練。")
        return

    features = [
        "home_win_pct", "away_win_pct",
        "home_l10_win_pct", "away_l10_win_pct",
        "home_rs_avg", "away_rs_avg",
        "home_ra_avg", "away_ra_avg",
        "is_home_advantage"
    ]

    # Chronological Split (80% Train, 20% Test)
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]

    X_train = train_df[features]
    y_train = train_df['home_team_won']
    X_test = test_df[features]
    y_test = test_df['home_team_won']

    # Standardize features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train Logistic Regression
    model = LogisticRegression(max_iter=1000, C=1.0)
    model.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    y_pred_proba = model.predict_proba(X_test_scaled)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_pred_proba)

    print("\n--- 模型評估結果 ---")
    print(f"🎯 測試集 Accuracy : {acc:.4f}")
    print(f"📈 測試集 ROC-AUC  : {auc:.4f}")
    print(f"👥 訓練樣本數      : {len(X_train)}")
    print(f"👥 測試樣本數      : {len(X_test)}\n")

    # Serialize weights and scaling metrics
    scaler_mean = dict(zip(features, scaler.mean_))
    scaler_std = dict(zip(features, scaler.scale_))
    coefficients = dict(zip(features, model.coef_[0]))
    intercept = float(model.intercept_[0])

    model_json = {
        "intercept": intercept,
        "coefficients": coefficients,
        "scaler_mean": scaler_mean,
        "scaler_std": scaler_std,
        "accuracy": float(acc),
        "roc_auc": float(auc),
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "seasons": ["2024", "2025"],
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "sport": "MLB",
        "version": "2.0.0-real-data"
    }

    os.makedirs('public/models', exist_ok=True)
    model_path = 'public/models/mlb_model.json'
    with open(model_path, 'w', encoding='utf-8') as f:
        json.dump(model_json, f, indent=2, ensure_ascii=False)

    print(f"✅ 模型與標準化權重成功匯出至: {model_path}")

if __name__ == "__main__":
    df_2024 = fetch_mlb_games(2024)
    df_2025 = fetch_mlb_games(2025)
    
    if not df_2024.empty or not df_2025.empty:
        df_all = pd.concat([df_2024, df_2025]).reset_index(drop=True)
        df_features = build_features(df_all)
        train_and_export(df_features)
        print("✅ 完成！public/models/mlb_model.json 已更新")
    else:
        print("❌ 無法抓取到任何 MLB 比賽數據。")
