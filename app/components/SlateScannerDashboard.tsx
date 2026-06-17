'use client';

import React, { useState } from 'react';

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
  };
}

interface SlateScannerDashboardProps {
  initialGames?: ScannerGame[];
}

// High-Fidelity Mock Data for Preview / Fallback
const DEFAULT_MOCK_GAMES: ScannerGame[] = [
  {
    id: "g-1",
    league: "MLB",
    gameDate: "2026-06-18T23:05:00Z",
    homeTeam: {
      code: "PHI",
      nameCn: "費城費城人",
      avgPoints: 5.3,
      recentForm: ["W", "W", "L", "W", "W"]
    },
    awayTeam: {
      code: "MIA",
      nameCn: "邁阿密馬林魚",
      avgPoints: 2.6,
      recentForm: ["L", "L", "W", "L", "L"]
    },
    bookmakerSpread: -1.5,
    bookmakerTotal: 8.0,
    prediction: {
      winner: "home",
      winProbability: 0.74,
      predictedSpread: -4.1,
      predictedTotal: 9.3,
      pitcherNameHome: "Zack Wheeler",
      pitcherEraHome: 2.45,
      pitcherNameAway: "Edward Cabrera",
      pitcherEraAway: 4.80
    }
  },
  {
    id: "g-2",
    league: "NBA",
    gameDate: "2026-06-19T00:30:00Z",
    homeTeam: {
      code: "BOS",
      nameCn: "波士頓塞爾提克",
      avgPoints: 114.5,
      recentForm: ["W", "W", "W", "L", "W"]
    },
    awayTeam: {
      code: "DAL",
      nameCn: "達拉斯獨行俠",
      avgPoints: 109.2,
      recentForm: ["L", "L", "W", "W", "L"]
    },
    bookmakerSpread: -6.5,
    bookmakerTotal: 212.5,
    prediction: {
      winner: "home",
      winProbability: 0.695,
      predictedSpread: -9.2,
      predictedTotal: 215.8,
      injuryImpactHome: 1.2, // Porzingis questionable
      injuryImpactAway: 0.0  // Doncic/Kyrie fully fit
    }
  },
  {
    id: "g-3",
    league: "MLB",
    gameDate: "2026-06-18T22:40:00Z",
    homeTeam: {
      code: "NYY",
      nameCn: "紐約洋基",
      avgPoints: 6.2,
      recentForm: ["W", "L", "W", "W", "W"]
    },
    awayTeam: {
      code: "CWS",
      nameCn: "芝加哥白襪",
      avgPoints: 3.9,
      recentForm: ["L", "L", "L", "W", "L"]
    },
    bookmakerSpread: -2.5,
    bookmakerTotal: 8.5,
    prediction: {
      winner: "home",
      winProbability: 0.815,
      predictedSpread: -4.7,
      predictedTotal: 10.1,
      pitcherNameHome: "Gerrit Cole",
      pitcherEraHome: 2.10,
      pitcherNameAway: "Chris Flexen",
      pitcherEraAway: 5.25
    }
  },
  {
    id: "g-4",
    league: "NBA",
    gameDate: "2026-06-19T02:00:00Z",
    homeTeam: {
      code: "LAL",
      nameCn: "洛杉磯湖人",
      avgPoints: 112.8,
      recentForm: ["W", "L", "W", "L", "W"]
    },
    awayTeam: {
      code: "GSW",
      nameCn: "金州勇士",
      avgPoints: 115.4,
      recentForm: ["L", "W", "W", "W", "L"]
    },
    bookmakerSpread: -1.5,
    bookmakerTotal: 224.5,
    prediction: {
      winner: "away",
      winProbability: 0.58,
      predictedSpread: 2.1, // Away favorite
      predictedTotal: 221.2,
      injuryImpactHome: 4.8, // Anthony Davis questionable
      injuryImpactAway: 0.5
    }
  },
  {
    id: "g-5",
    league: "MLB",
    gameDate: "2026-06-18T23:10:00Z",
    homeTeam: {
      code: "LAD",
      nameCn: "洛杉磯道奇",
      avgPoints: 6.0,
      recentForm: ["W", "W", "W", "L", "W"]
    },
    awayTeam: {
      code: "TB",
      nameCn: "坦帕灣光芒",
      avgPoints: 3.3,
      recentForm: ["L", "W", "L", "L", "W"]
    },
    bookmakerSpread: -1.5,
    bookmakerTotal: 7.5,
    prediction: {
      winner: "home",
      winProbability: 0.655,
      predictedSpread: -2.3,
      predictedTotal: 8.8,
      pitcherNameHome: "Yoshinobu Yamamoto",
      pitcherEraHome: 2.90,
      pitcherNameAway: "Taj Bradley",
      pitcherEraAway: 3.85
    }
  }
];

export default function SlateScannerDashboard({ initialGames = DEFAULT_MOCK_GAMES }: SlateScannerDashboardProps) {
  // Sliders state
  const [minSpreadEdge, setMinSpreadEdge] = useState<number>(1.0);
  const [minTotalEdge, setMinTotalEdge] = useState<number>(1.0);
  const [minWinProbability, setMinWinProbability] = useState<number>(55); // in %

  // Filter games based on sliders
  const filteredGames = initialGames.filter((game) => {
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
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
            SLATE SCANNER
          </h1>
          <p className="text-xs font-semibold text-purple-400 mt-1 uppercase tracking-widest font-mono">
            大數據盤口量化掃描系統
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3 backdrop-blur-md">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-bold text-gray-300">
            掃描完成：共計 {initialGames.length} 場賽事
          </span>
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

      {/* Render Filtered Cards Grid */}
      {filteredGames.length === 0 ? (
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
                  {/* Let's render Spread Edge section */}
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

                  {/* Let's render Total Edge section */}
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

                {/* Matchup Context (對戰脈絡區) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                  {/* Left Column: Guest Starter vs Home offense */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 tracking-wider block font-mono">
                      {game.league === 'MLB' ? '客隊先發投手 vs 主隊火力' : '客隊傷情 vs 主隊火力'}
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
                        <p className="font-bold text-gray-300">🤕 傷情影響值 (Away): <span className="text-yellow-400 font-mono font-bold">+{game.prediction.injuryImpactAway?.toFixed(1)}</span></p>
                        <p className="text-gray-400 font-mono text-[11px] mt-0.5">
                          主隊近 5 均得分: <span className="text-white font-bold">{game.homeTeam.avgPoints}分</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Home Starter vs Guest offense */}
                  <div className="space-y-1 md:border-l md:border-white/5 md:pl-4">
                    <span className="text-[10px] font-bold text-gray-500 tracking-wider block font-mono">
                      {game.league === 'MLB' ? '主隊先發投手 vs 客隊火力' : '主隊傷情 vs 客隊火力'}
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
                        <p className="font-bold text-gray-300">🤕 傷情影響值 (Home): <span className="text-yellow-400 font-mono font-bold">+{game.prediction.injuryImpactHome?.toFixed(1)}</span></p>
                        <p className="text-gray-400 font-mono text-[11px] mt-0.5">
                          客隊近 5 均得分: <span className="text-white font-bold">{game.awayTeam.avgPoints}分</span>
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
