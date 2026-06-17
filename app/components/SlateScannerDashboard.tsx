'use client';

import React, { useState, useEffect } from 'react';

export interface ScannerGame {
  id: string;
  league: 'NBA' | 'MLB';
  gameDate: string;
  homeTeam: {
    code: string;
    nameCn: string;
    logo?: string;
    avgPoints: number;
    recentForm: string[]; // e.g. ["W", "W", "L", "W", "W"]
  };
  awayTeam: {
    code: string;
    nameCn: string;
    logo?: string;
    avgPoints: number;
    recentForm: string[];
  };
  bookmakerSpread: number; // e.g. -4.5
  bookmakerTotal: number;  // e.g. 218.5
  prediction: {
    winner: 'home' | 'away';
    winProbability: number;  // e.g. 0.68 (68%)
    predictedSpread: number; // e.g. -7.2
    predictedTotal: number;  // e.g. 222.5
    
    // MLB Specific starting pitchers
    pitcherNameHome?: string;
    pitcherEraHome?: number;
    pitcherNameAway?: string;
    pitcherEraAway?: number;

    // NBA Specific injury impact scores (higher = more key players missing)
    injuryImpactHome?: number;
    injuryImpactAway?: number;

    // AI Insight Report
    insightReport?: string;
  };
}

export interface BacktestGameResult extends ScannerGame {
  actual: {
    homeScore: number;
    awayScore: number;
    actualSpread: number;
    actualTotal: number;
    winner: 'home' | 'away';
  };
  result: {
    winnerHit: boolean;
    atsHit: boolean;
    ouHit: boolean;
    spreadError: number;
    totalError: number;
  };
}

export interface BacktestSummary {
  totalGames: number;
  winnerHits: number;
  winnerPct: number;
  atsHits: number;
  atsPct: number;
  ouHits: number;
  ouPct: number;
  avgSpreadError: number;
  avgTotalError: number;
  dateRange: { start: string; end: string };
}

interface SlateScannerDashboardProps {
  initialGames?: ScannerGame[];
}

export default function SlateScannerDashboard({ initialGames }: SlateScannerDashboardProps) {
  // Mode Selection: 'scanner' (Live/Upcoming Scanner) or 'backtest' (Historical Backtest)
  const [activeMode, setActiveMode] = useState<'scanner' | 'backtest'>('scanner');

  // Scanner Date selection state (Defaults to today in YYYY-MM-DD local time)
  const [date, setDate] = useState<string>(() => {
    const local = new Date();
    const offset = local.getTimezoneOffset() * 60000;
    const localTime = new Date(local.getTime() - offset);
    return localTime.toISOString().split('T')[0];
  });

  const [games, setGames] = useState<ScannerGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLeague, setActiveLeague] = useState<'ALL' | 'NBA' | 'MLB'>('ALL');

  // Sliders state
  const [minSpreadEdge, setMinSpreadEdge] = useState<number>(1.0);
  const [minTotalEdge, setMinTotalEdge] = useState<number>(1.0);
  const [minWinProbability, setMinWinProbability] = useState<number>(55); // in %

  // Backtest Date range state
  const [backtestStart, setBacktestStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Default to 7 days ago
    const offset = d.getTimezoneOffset() * 60000;
    const localTime = new Date(d.getTime() - offset);
    return localTime.toISOString().split('T')[0];
  });
  
  const [backtestEnd, setBacktestEnd] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Default to yesterday
    const offset = d.getTimezoneOffset() * 60000;
    const localTime = new Date(d.getTime() - offset);
    return localTime.toISOString().split('T')[0];
  });

  const [backtestResults, setBacktestResults] = useState<{ games: BacktestGameResult[]; summary: BacktestSummary } | null>(null);
  const [backtestLoading, setBacktestLoading] = useState<boolean>(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  // Fetch games and predictions dynamically from the API for Scanner Mode
  useEffect(() => {
    if (activeMode !== 'scanner') return;
    
    let active = true;
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/slate-scanner/games?date=${date}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        
        if (!active) return;
        
        if (json.success) {
          setGames(json.data || []);
        } else {
          throw new Error(json.error || '無法載入掃描資料');
        }
      } catch (err: any) {
        if (!active) return;
        console.error(err);
        setError(err.message || '載入大數據盤口掃描資料時發生錯誤');
        setGames([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, [date, activeMode]);

  // Run Backtest Fetch
  const handleRunBacktest = async () => {
    setBacktestLoading(true);
    setBacktestError(null);
    try {
      const res = await fetch(`/api/slate-scanner/backtest?startDate=${backtestStart}&endDate=${backtestEnd}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setBacktestResults(json.data);
      } else {
        throw new Error(json.error || '回測運行失敗');
      }
    } catch (err: any) {
      console.error(err);
      setBacktestError(err.message || '運行歷史勝率回測時發生錯誤');
      setBacktestResults(null);
    } finally {
      setBacktestLoading(false);
    }
  };

  // Run backtest initially when activeMode switches to 'backtest' and no results exist yet
  useEffect(() => {
    if (activeMode === 'backtest' && !backtestResults && !backtestLoading) {
      handleRunBacktest();
    }
  }, [activeMode]);

  // Fallback to initialGames if API has empty response and it was provided
  const displayGames = games.length > 0 ? games : (initialGames || []);

  // Filter games based on league select (for Scanner)
  const leagueFilteredGames = displayGames.filter(game => {
    if (activeLeague === 'ALL') return true;
    return game.league === activeLeague;
  });

  // Filter games based on sliders (for Scanner)
  const filteredGames = leagueFilteredGames.filter((game) => {
    const spreadEdge = Math.abs(game.prediction.predictedSpread - game.bookmakerSpread);
    const totalEdge = Math.abs(game.prediction.predictedTotal - game.bookmakerTotal);
    const winProbPercentage = game.prediction.winProbability * 100;

    return (
      spreadEdge >= minSpreadEdge &&
      totalEdge >= minTotalEdge &&
      winProbPercentage >= minWinProbability
    );
  });

  // Filter backtest games based on active league
  const filteredBacktestGames = (backtestResults?.games || []).filter((game) => {
    if (activeLeague === 'ALL') return true;
    return game.league === activeLeague;
  });

  return (
    <div className="w-full bg-[#070b19] min-h-screen text-gray-100 p-6 md:p-10 font-sans selection:bg-purple-500 selection:text-white">
      {/* Mode Switcher Nav & Title */}
      <div className="mb-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
            SLATE SCANNER
          </h1>
          <p className="text-xs font-semibold text-purple-400 mt-1 uppercase tracking-widest font-mono">
            大數據盤口量化預測與回測系統
          </p>
        </div>

        {/* Navigation Mode Tabs */}
        <div className="flex bg-white/5 border border-white/10 p-1 rounded-2xl backdrop-blur-md">
          <button
            onClick={() => setActiveMode('scanner')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all duration-300 flex items-center gap-2 ${
              activeMode === 'scanner'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📊 盤口邊際掃描
          </button>
          <button
            onClick={() => setActiveMode('backtest')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all duration-300 flex items-center gap-2 ${
              activeMode === 'backtest'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🛡️ 歷史勝率回測
          </button>
        </div>
      </div>

      {/* Control Widgets */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 w-full bg-white/[0.02] border border-white/5 p-4 rounded-3xl backdrop-blur-md">
        {/* League Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold font-mono text-gray-400">聯賽過濾:</span>
          <div className="bg-white/5 border border-white/10 p-1 rounded-2xl flex items-center backdrop-blur-sm">
            <button
              onClick={() => setActiveLeague('ALL')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-300 ${
                activeLeague === 'ALL'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveLeague('NBA')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-300 ${
                activeLeague === 'NBA'
                  ? 'bg-[#ff6b00] text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              NBA
            </button>
            <button
              onClick={() => setActiveLeague('MLB')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-300 ${
                activeLeague === 'MLB'
                  ? 'bg-[#005A9C] text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              MLB
            </button>
          </div>
        </div>

        {/* Date Filter Configs */}
        {activeMode === 'scanner' ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* Live Date Picker */}
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
              <label htmlFor="scan-date" className="text-xs font-mono font-black text-purple-300">
                📅 選擇賽事日期:
              </label>
              <input
                type="date"
                id="scan-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-xs font-bold font-mono text-white border-0 focus:ring-0 cursor-pointer outline-none"
              />
            </div>

            <div className="bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="text-xs font-mono font-bold text-gray-300">
                {loading ? '掃描中...' : `掃描完成：共計 ${displayGames.length} 場`}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            {/* Backtest Range Picker */}
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl flex-grow sm:flex-grow-0">
              <label className="text-xs font-mono font-black text-purple-300">📅 回測區間:</label>
              <input
                type="date"
                value={backtestStart}
                onChange={(e) => setBacktestStart(e.target.value)}
                className="bg-transparent text-xs font-bold font-mono text-white border-0 focus:ring-0 cursor-pointer outline-none"
              />
              <span className="text-gray-500 text-xs">至</span>
              <input
                type="date"
                value={backtestEnd}
                onChange={(e) => setBacktestEnd(e.target.value)}
                className="bg-transparent text-xs font-bold font-mono text-white border-0 focus:ring-0 cursor-pointer outline-none"
              />
            </div>

            <button
              onClick={handleRunBacktest}
              disabled={backtestLoading}
              className="px-6 py-2 rounded-2xl text-xs font-black text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all duration-300 flex items-center gap-2"
            >
              {backtestLoading ? '運行回測中...' : '🚀 啟動回測'}
            </button>
          </div>
        )}
      </div>

      {/* Scanner Content Mode */}
      {activeMode === 'scanner' && (
        <>
          {/* Sliders Controls Dashboard */}
          <div className="bg-[#0c122c]/60 border border-white/5 rounded-3xl p-6 md:p-8 mb-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute -top-20 -left-20 w-48 h-48 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
            
            <h3 className="text-sm font-black text-gray-300 mb-6 uppercase tracking-wider font-mono border-b border-white/5 pb-3">
              🎛️ 掃描過濾門檻設定 (Scan Filters)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Slider 1: Min Spread Edge */}
              <div className="space-y-3">
                <div className="flex justify-between items-baseline font-mono">
                  <span className="text-xs font-black text-gray-400">讓分優勢門檻 (Min Spread Edge)</span>
                  <span className="text-lg font-black text-purple-400">{minSpreadEdge.toFixed(1)} 分</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="5.0"
                  step="0.1"
                  value={minSpreadEdge}
                  onChange={(e) => setMinSpreadEdge(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>0.0 (寬鬆)</span>
                  <span>2.5</span>
                  <span>5.0 (極嚴)</span>
                </div>
              </div>

              {/* Slider 2: Min Total Edge */}
              <div className="space-y-3">
                <div className="flex justify-between items-baseline font-mono">
                  <span className="text-xs font-black text-gray-400">大小分門檻 (Min Total Edge)</span>
                  <span className="text-lg font-black text-cyan-400">{minTotalEdge.toFixed(1)} 分</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="10.0"
                  step="0.5"
                  value={minTotalEdge}
                  onChange={(e) => setMinTotalEdge(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>0.0 (寬鬆)</span>
                  <span>5.0</span>
                  <span>10.0 (極嚴)</span>
                </div>
              </div>

              {/* Slider 3: Win Probability */}
              <div className="space-y-3">
                <div className="flex justify-between items-baseline font-mono">
                  <span className="text-xs font-black text-gray-400">最低勝率門檻 (Win Prob)</span>
                  <span className="text-lg font-black text-pink-400">{minWinProbability}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="90"
                  step="1"
                  value={minWinProbability}
                  onChange={(e) => setMinWinProbability(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500 focus:outline-none"
                />
                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>50% (平局)</span>
                  <span>70%</span>
                  <span>90% (穩勝)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Loading & Error States */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-sm font-mono text-purple-400 animate-pulse font-bold">大數據掃描中，請稍候...</p>
            </div>
          ) : error ? (
            <div className="border border-red-500/20 bg-red-950/10 rounded-3xl p-10 max-w-xl mx-auto text-center shadow-xl">
              <p className="text-red-400 text-sm font-extrabold">⚠️ {error}</p>
              <button
                onClick={() => setDate(date)}
                className="mt-6 px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold rounded-xl border border-red-500/30 transition-all cursor-pointer font-sans"
              >
                重新整理
              </button>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="border border-white/5 bg-[#090e24] rounded-3xl p-16 text-center max-w-xl mx-auto flex flex-col items-center justify-center gap-4 shadow-xl animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center text-gray-500 border border-white/5">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-white">符合條件的賽事為 0</h3>
                <p className="text-xs text-gray-400 mt-1.5 font-semibold">
                  目前沒有任何賽事同時符合您設定的三個篩選門檻。請嘗試向左拖動滑桿，放寬過濾標準。
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-fade-in">
              {filteredGames.map((game) => {
                const spreadEdge = Math.abs(game.prediction.predictedSpread - game.bookmakerSpread);
                const totalEdge = Math.abs(game.prediction.predictedTotal - game.bookmakerTotal);
                const winProb = Math.round(game.prediction.winProbability * 100);
                
                // Determine core bet vs value badge
                let edgeBadge = null;
                if (spreadEdge > 2.0) {
                  edgeBadge = (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-md shadow-rose-950/20">
                      🔥 核心主推 (Core Bet)
                    </span>
                  );
                } else if (spreadEdge >= 1.0) {
                  edgeBadge = (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                      🛡️ 受讓保險 (Value)
                    </span>
                  );
                }

                const isHomeFavorite = game.bookmakerSpread < 0;
                const absoluteSpreadValue = Math.abs(game.bookmakerSpread);
                const formattedBookmakerSpread = isHomeFavorite 
                  ? `${game.homeTeam.code} -${absoluteSpreadValue}`
                  : `${game.awayTeam.code} -${absoluteSpreadValue}`;

                const isPredHomeFavorite = game.prediction.predictedSpread < 0;
                const absolutePredSpreadValue = Math.abs(game.prediction.predictedSpread);
                const formattedPredSpread = isPredHomeFavorite 
                  ? `${game.homeTeam.code} -${absolutePredSpreadValue.toFixed(1)}`
                  : `${game.awayTeam.code} -${absolutePredSpreadValue.toFixed(1)}`;

                return (
                  <div
                    key={game.id}
                    className="bg-[#0b1028]/80 border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-xl relative overflow-hidden transition-all duration-300 hover:border-purple-500/20 group"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/5 to-cyan-500/5 rounded-bl-full group-hover:scale-150 transition-transform duration-500 pointer-events-none" />

                    <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${game.league === 'NBA' ? 'bg-[#ff6b00]' : 'bg-[#005A9C]'}`}>
                          {game.league}
                        </span>
                        <h2 className="text-base font-black text-white font-mono tracking-wide">
                          {game.awayTeam.nameCn} @ {game.homeTeam.nameCn}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        {edgeBadge}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col justify-between relative">
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest font-bold">讓分盤口與預測 (Spread)</span>
                        <div className="flex justify-between items-center mt-3">
                          <div>
                            <p className="text-[11px] text-gray-400 font-semibold">莊家: <span className="font-mono text-white font-bold">{formattedBookmakerSpread}</span></p>
                            <p className="text-[11px] text-gray-400 font-semibold mt-1">模型: <span className="font-mono text-purple-400 font-bold">{formattedPredSpread}</span></p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-mono font-bold block text-purple-400">讓分優勢 Edge</span>
                            <span className="text-2xl font-black text-purple-300 font-mono tracking-tight">+{spreadEdge.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col justify-between relative">
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest font-bold">大小分盤口與預測 (Total)</span>
                        <div className="flex justify-between items-center mt-3">
                          <div>
                            <p className="text-[11px] text-gray-400 font-semibold">莊家: <span className="font-mono text-white font-bold">{game.bookmakerTotal}</span></p>
                            <p className="text-[11px] text-gray-400 font-semibold mt-1">模型: <span className="font-mono text-cyan-400 font-bold">{game.prediction.predictedTotal.toFixed(1)}</span></p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-mono font-bold block text-cyan-400">總分優勢 Edge</span>
                            <span className="text-2xl font-black text-cyan-300 font-mono tracking-tight">+{totalEdge.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-purple-900/10 via-pink-900/10 to-cyan-900/10 border border-purple-500/10 rounded-2xl p-4 mb-6 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-gray-300">AI 預計勝出：</span>
                        <span className="text-sm font-black text-purple-400">
                          {game.prediction.winner === 'home' ? game.homeTeam.nameCn : game.awayTeam.nameCn}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-[10px] font-bold text-gray-400">置信度:</span>
                        <span className="text-lg font-black text-pink-400">{winProb}%</span>
                      </div>
                    </div>

                    {game.prediction.insightReport && (
                      <div className="bg-purple-950/10 border border-purple-500/10 rounded-2xl p-4 mb-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-bl-full pointer-events-none" />
                        <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest font-black block mb-1.5">
                          💡 AI 盤口數據洞察 (AI Insights)
                        </span>
                        <p className="text-xs text-gray-200 leading-relaxed font-semibold">
                          {game.prediction.insightReport}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-gray-500 tracking-wider block font-mono">
                          {game.league === 'MLB' ? '客隊先發投手 vs 主隊火力' : '客隊火力與近況'}
                        </span>
                        {game.league === 'MLB' ? (
                          <div className="text-xs leading-relaxed">
                            <p className="font-bold text-gray-300">⚾ {game.prediction.pitcherNameAway}</p>
                            <p className="text-gray-400 font-mono text-[11px] mt-0.5">
                              防禦率: <span className="text-rose-400 font-bold">{game.prediction.pitcherEraAway?.toFixed(2)}</span> vs 主隊近 5 均得分: <span className="text-white font-bold">{game.homeTeam.avgPoints}分</span>
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs leading-relaxed">
                            <p className="font-semibold text-gray-300">🔥 近況近 5 場: <span className="text-purple-400 font-mono font-bold">{game.awayTeam.recentForm.join('')}</span></p>
                            <p className="text-gray-400 font-mono text-[11px] mt-0.5">
                              客隊近 5 均得分: <span className="text-white font-bold">{game.awayTeam.avgPoints}分</span>
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 md:border-l md:border-white/5 md:pl-4">
                        <span className="text-[10px] font-bold text-gray-500 tracking-wider block font-mono">
                          {game.league === 'MLB' ? '主隊先發投手 vs 客隊火力' : '主隊火力與近況'}
                        </span>
                        {game.league === 'MLB' ? (
                          <div className="text-xs leading-relaxed">
                            <p className="font-bold text-gray-300">⚾ {game.prediction.pitcherNameHome}</p>
                            <p className="text-gray-400 font-mono text-[11px] mt-0.5">
                              防禦率: <span className="text-emerald-400 font-bold">{game.prediction.pitcherEraHome?.toFixed(2)}</span> vs 客隊近 5 均得分: <span className="text-white font-bold">{game.awayTeam.avgPoints}分</span>
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs leading-relaxed">
                            <p className="font-semibold text-gray-300">🔥 近況近 5 場: <span className="text-purple-400 font-mono font-bold">{game.homeTeam.recentForm.join('')}</span></p>
                            <p className="text-gray-400 font-mono text-[11px] mt-0.5">
                              主隊近 5 均得分: <span className="text-white font-bold">{game.homeTeam.avgPoints}分</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Backtesting Content Mode */}
      {activeMode === 'backtest' && (
        <>
          {backtestLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-sm font-mono text-purple-400 animate-pulse font-bold">正在抓取歷史對戰並重新計算 Ensemble Edge 模型...</p>
            </div>
          ) : backtestError ? (
            <div className="border border-red-500/20 bg-red-950/10 rounded-3xl p-10 max-w-xl mx-auto text-center shadow-xl">
              <p className="text-red-400 text-sm font-extrabold">⚠️ {backtestError}</p>
              <button
                onClick={handleRunBacktest}
                className="mt-6 px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold rounded-xl border border-red-500/30 transition-all cursor-pointer font-sans"
              >
                重新啟動回測
              </button>
            </div>
          ) : !backtestResults || filteredBacktestGames.length === 0 ? (
            <div className="border border-white/5 bg-[#090e24] rounded-3xl p-16 text-center max-w-xl mx-auto flex flex-col items-center justify-center gap-4 shadow-xl">
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center text-gray-500 border border-white/5">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-white">回測範圍內無已完賽的數據</h3>
                <p className="text-xs text-gray-400 mt-1.5 font-semibold">
                  選取的區間沒有發現已完成的 MLB 或 NBA 比賽。請嘗試調整回測日期區間，並確保選擇的過去日期有實際比賽完賽。
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-10 animate-fade-in">
              {/* Backtesting Stats Summary Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-[#0c122c]/80 border border-white/5 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest font-black">總計回測場次</span>
                  <span className="text-3xl font-black font-mono text-white mt-4">{filteredBacktestGames.length} <span className="text-xs text-gray-500 font-semibold">場</span></span>
                </div>
                
                <div className="bg-[#0c122c]/80 border border-white/5 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-black">預測勝出命中率 (SU)</span>
                  <div className="flex items-baseline justify-between mt-4">
                    <span className="text-3xl font-black font-mono text-emerald-300">
                      {Math.round((filteredBacktestGames.filter(g => g.result.winnerHit).length / filteredBacktestGames.length) * 100)}%
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      {filteredBacktestGames.filter(g => g.result.winnerHit).length}/{filteredBacktestGames.length}
                    </span>
                  </div>
                </div>

                <div className="bg-[#0c122c]/80 border border-white/5 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest font-black">讓分盤命中率 (ATS)</span>
                  <div className="flex items-baseline justify-between mt-4">
                    <span className="text-3xl font-black font-mono text-purple-300">
                      {Math.round((filteredBacktestGames.filter(g => g.result.atsHit).length / filteredBacktestGames.length) * 100)}%
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      {filteredBacktestGames.filter(g => g.result.atsHit).length}/{filteredBacktestGames.length}
                    </span>
                  </div>
                </div>

                <div className="bg-[#0c122c]/80 border border-white/5 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between shadow-xl">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-black">大小分命中率 (O/U)</span>
                  <div className="flex items-baseline justify-between mt-4">
                    <span className="text-3xl font-black font-mono text-cyan-300">
                      {Math.round((filteredBacktestGames.filter(g => g.result.ouHit).length / filteredBacktestGames.length) * 100)}%
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      {filteredBacktestGames.filter(g => g.result.ouHit).length}/{filteredBacktestGames.length}
                    </span>
                  </div>
                </div>

                <div className="bg-[#0c122c]/80 border border-white/5 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between col-span-2 lg:col-span-1 shadow-xl">
                  <span className="text-[10px] font-mono text-pink-400 uppercase tracking-widest font-black">模型預估平均偏差</span>
                  <div className="mt-3 space-y-1 text-xs font-mono">
                    <p className="text-gray-400">讓分偏差: <span className="text-pink-300 font-bold">{(filteredBacktestGames.reduce((acc, g) => acc + g.result.spreadError, 0) / filteredBacktestGames.length).toFixed(1)}分</span></p>
                    <p className="text-gray-400">總分偏差: <span className="text-pink-300 font-bold">{(filteredBacktestGames.reduce((acc, g) => acc + g.result.totalError, 0) / filteredBacktestGames.length).toFixed(1)}分</span></p>
                  </div>
                </div>
              </div>

              {/* Detailed Backtesting List */}
              <div className="space-y-6">
                <h3 className="text-sm font-black text-gray-300 uppercase tracking-wider font-mono border-b border-white/5 pb-3">
                  📋 回測對戰明細與預測校對 (Detailed Backtest Results)
                </h3>
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {filteredBacktestGames.map((game) => {
                    const spreadEdge = Math.abs(game.prediction.predictedSpread - game.bookmakerSpread);
                    const totalEdge = Math.abs(game.prediction.predictedTotal - game.bookmakerTotal);
                    
                    const isHomeFavorite = game.bookmakerSpread < 0;
                    const absoluteSpreadValue = Math.abs(game.bookmakerSpread);
                    const formattedBookmakerSpread = isHomeFavorite 
                      ? `${game.homeTeam.code} -${absoluteSpreadValue}`
                      : `${game.awayTeam.code} -${absoluteSpreadValue}`;

                    const isPredHomeFavorite = game.prediction.predictedSpread < 0;
                    const absolutePredSpreadValue = Math.abs(game.prediction.predictedSpread);
                    const formattedPredSpread = isPredHomeFavorite 
                      ? `${game.homeTeam.code} -${absolutePredSpreadValue.toFixed(1)}`
                      : `${game.awayTeam.code} -${absolutePredSpreadValue.toFixed(1)}`;

                    return (
                      <div
                        key={game.id}
                        className="bg-[#0b1028]/80 border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-xl relative overflow-hidden group"
                      >
                        {/* Score Comparison Header */}
                        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${game.league === 'NBA' ? 'bg-[#ff6b00]' : 'bg-[#005A9C]'}`}>
                              {game.league}
                            </span>
                            <span className="text-xs font-mono text-gray-400">{game.gameDate.split('T')[0]}</span>
                            <h2 className="text-sm font-black text-white font-mono tracking-wide">
                              {game.awayTeam.nameCn} @ {game.homeTeam.nameCn}
                            </h2>
                          </div>
                          
                          {/* Hit Status Badges */}
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black ${game.result.winnerHit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                              獨贏 {game.result.winnerHit ? '✓' : '✗'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black ${game.result.atsHit ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                              讓分 {game.result.atsHit ? '✓' : '✗'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black ${game.result.ouHit ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                              大小 {game.result.ouHit ? '✓' : '✗'}
                            </span>
                          </div>
                        </div>

                        {/* Real Result Box */}
                        <div className="bg-gradient-to-r from-emerald-950/20 to-slate-900/20 border border-emerald-500/10 rounded-2xl p-4 mb-4 flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] font-mono text-gray-400 font-black">實際完賽比分:</span>
                            <span className="text-xs font-bold text-gray-200">
                              {game.awayTeam.nameCn} <span className="font-mono text-emerald-400 text-sm font-black">{game.actual.awayScore}</span> : <span className="font-mono text-emerald-400 text-sm font-black">{game.actual.homeScore}</span> {game.homeTeam.nameCn}
                            </span>
                          </div>
                          <div className="text-right font-mono text-[10px] text-gray-400">
                            <p>實際總分: <span className="text-emerald-300 font-bold">{game.actual.actualTotal}</span></p>
                            <p>實際分差: <span className="text-emerald-300 font-bold">{game.actual.actualSpread > 0 ? `客 -${game.actual.actualSpread}` : `主 -${Math.abs(game.actual.actualSpread)}`}</span></p>
                          </div>
                        </div>

                        {/* Prediction vs Bookmaker Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4">
                            <span className="text-[10px] font-mono text-gray-500 block uppercase font-black">讓分盤 (Spread)</span>
                            <div className="mt-2 text-xs font-mono space-y-1">
                              <p className="text-gray-400">盤口: <span className="text-white font-bold">{formattedBookmakerSpread}</span></p>
                              <p className="text-gray-400">模型: <span className="text-purple-400 font-bold">{formattedPredSpread}</span></p>
                              <p className="text-gray-500 text-[10px] pt-1">邊際 Edge: <span className="text-purple-300 font-bold">+{spreadEdge.toFixed(1)}分</span></p>
                            </div>
                          </div>

                          <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4">
                            <span className="text-[10px] font-mono text-gray-500 block uppercase font-black">大小分 (Total)</span>
                            <div className="mt-2 text-xs font-mono space-y-1">
                              <p className="text-gray-400">盤口: <span className="text-white font-bold">{game.bookmakerTotal}</span></p>
                              <p className="text-gray-400">模型: <span className="text-cyan-400 font-bold">{game.prediction.predictedTotal.toFixed(1)}</span></p>
                              <p className="text-gray-500 text-[10px] pt-1">邊際 Edge: <span className="text-cyan-300 font-bold">+{totalEdge.toFixed(1)}分</span></p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
