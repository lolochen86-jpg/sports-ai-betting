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

interface SlateScannerDashboardProps {
  initialGames?: ScannerGame[];
}

export default function SlateScannerDashboard({ initialGames }: SlateScannerDashboardProps) {
  // Date selection state (Defaults to today in YYYY-MM-DD local time)
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

  // Fetch games and predictions dynamically from the API
  useEffect(() => {
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
  }, [date]);

  // Fallback to initialGames if API has empty response and it was provided
  const displayGames = games.length > 0 ? games : (initialGames || []);

  // Filter games based on league select
  const leagueFilteredGames = displayGames.filter(game => {
    if (activeLeague === 'ALL') return true;
    return game.league === activeLeague;
  });

  // Filter games based on sliders
  const filteredGames = leagueFilteredGames.filter((game) => {
    // Calculate edges
    const spreadEdge = Math.abs(game.prediction.predictedSpread - game.bookmakerSpread);
    const totalEdge = Math.abs(game.prediction.predictedTotal - game.bookmakerTotal);
    const winProbPercentage = game.prediction.winProbability * 100;

    return (
      spreadEdge >= minSpreadEdge &&
      totalEdge >= minTotalEdge &&
      winProbPercentage >= minWinProbability
    );
  });

  return (
    <div className="w-full bg-[#070b19] min-h-screen text-gray-100 p-6 md:p-10 font-sans selection:bg-purple-500 selection:text-white">
      {/* Header Widget */}
      <div className="mb-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
            SLATE SCANNER
          </h1>
          <p className="text-xs font-semibold text-purple-400 mt-1 uppercase tracking-widest font-mono">
            大數據盤口量化掃描系統
          </p>
        </div>

        {/* Controls: Date Picker & League Tabs */}
        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          {/* League Filter */}
          <div className="bg-white/5 border border-white/10 p-1 rounded-2xl flex items-center backdrop-blur-md">
            <button
              onClick={() => setActiveLeague('ALL')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-300 ${
                activeLeague === 'ALL'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              全部聯盟
            </button>
            <button
              onClick={() => setActiveLeague('NBA')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-300 ${
                activeLeague === 'NBA'
                  ? 'bg-[#ff6b00] text-white shadow-lg shadow-orange-500/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              NBA
            </button>
            <button
              onClick={() => setActiveLeague('MLB')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-300 ${
                activeLeague === 'MLB'
                  ? 'bg-[#005A9C] text-white shadow-lg shadow-blue-500/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              MLB
            </button>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl backdrop-blur-md">
            <label htmlFor="scan-date" className="text-xs font-mono font-black text-purple-300">
              📅 選擇日期:
            </label>
            <input
              type="date"
              id="scan-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-xs font-bold font-mono text-white border-0 focus:ring-0 cursor-pointer outline-none"
            />
          </div>

          {/* Scan Status */}
          <div className="bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md ml-auto xl:ml-0">
            <span className={`w-2.5 h-2.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
            <span className="text-xs font-mono font-bold text-gray-300">
              {loading ? '掃描中...' : `掃描完成：共計 ${displayGames.length} 場賽事`}
            </span>
          </div>
        </div>
      </div>

      {/* Sliders Controls Dashboard */}
      <div className="bg-[#0c122c]/60 border border-white/5 rounded-3xl p-6 md:p-8 mb-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow effect */}
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
        <div className="border border-white/5 bg-[#090e24] rounded-3xl p-16 text-center max-w-xl mx-auto flex flex-col items-center justify-center gap-4 shadow-xl">
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
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
                {/* Visual Glow on Hover */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/5 to-cyan-500/5 rounded-bl-full group-hover:scale-150 transition-transform duration-500 pointer-events-none" />

                {/* Card Title & Badges */}
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

                {/* Score Comparing Box (Bookmaker vs AI Model) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Spread Edge section */}
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

                  {/* Total Edge section */}
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

                {/* Win probability block */}
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

                {/* AI Insight Report Section */}
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

                {/* Matchup Context (對戰脈絡區) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                  {/* Left Column: Guest Starter vs Home offense */}
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

                  {/* Right Column: Home Starter vs Guest offense */}
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
    </div>
  );
}
