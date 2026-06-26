'use client';

import React from 'react';

interface SmartParlayLeg {
  gameId: string;
  homeTeam: { name: string; code: string; nameCn?: string };
  awayTeam: { name: string; code: string; nameCn?: string };
  pick: 'home' | 'away';
  pickTeamName: string;
  consensusCount: number;
  avgConfidence: number;
  models: {
    SportsAI: 'home' | 'away';
    EloRating: 'home' | 'away';
    MonteCarlo: 'home' | 'away';
    MetaModel: 'home' | 'away';
  };
  predictedTotal: number;
}

interface SmartParlay {
  id: number;
  legs: SmartParlayLeg[];
  combinedProb: number;
  grade: 'S' | 'A' | 'B';
  coverageTeams: string[];
}

interface SmartParlayCardProps {
  parlays: SmartParlay[];
  totalGames: number;
  totalTeamsCovered: number;
  totalTeams: number;
  uncoveredTeams: string[];
  loading?: boolean;
}

const gradeStyles: Record<string, { bg: string; border: string; text: string; label: string }> = {
  S: {
    bg: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    label: '🏆 至尊共識',
  },
  A: {
    bg: 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    label: '⭐ 強勢推薦',
  },
  B: {
    bg: 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    label: '📊 數據支撐',
  },
};

const ConsensusStars = ({ count }: { count: number }) => (
  <span className="flex items-center gap-0.5">
    {Array.from({ length: 4 }).map((_, i) => (
      <span key={i} className={`text-[10px] ${i < count ? 'text-amber-400' : 'text-gray-700'}`}>
        ★
      </span>
    ))}
  </span>
);

const ModelDots = ({ models, pick }: { models: SmartParlayLeg['models']; pick: 'home' | 'away' }) => {
  const modelNames = ['SportsAI', 'EloRating', 'MonteCarlo', 'MetaModel'] as const;
  const shortNames = ['SA', 'Elo', 'MC', 'Meta'];
  return (
    <div className="flex items-center gap-1.5">
      {modelNames.map((m, i) => {
        const agrees = models[m] === pick;
        return (
          <span
            key={m}
            className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${
              agrees
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-400/60 border border-red-500/15'
            }`}
            title={`${m}: ${models[m] === 'home' ? '主隊' : '客隊'}`}
          >
            {shortNames[i]}
          </span>
        );
      })}
    </div>
  );
};

export default function SmartParlayCard({
  parlays,
  totalGames,
  totalTeamsCovered,
  totalTeams,
  uncoveredTeams,
  loading = false,
}: SmartParlayCardProps) {
  if (loading) {
    return (
      <div className="glass-panel rounded-3xl border border-purple-500/20 p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-white/5 rounded w-48" />
            <div className="h-3 bg-white/5 rounded w-32" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-white/5 rounded-2xl" />
          <div className="h-20 bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!parlays || parlays.length === 0) {
    return (
      <div className="glass-panel rounded-3xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">⚡</span>
          <h3 className="text-sm font-black text-white font-sans">今日智慧三關推薦</h3>
        </div>
        <p className="text-xs text-gray-500 font-sans">尚未產生推薦組合，需要至少 2 場賽事才能計算。</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl border border-purple-500/20 p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-60px] right-[-60px] w-[180px] h-[180px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <span className="text-lg">⚡</span>
          </div>
          <div>
            <h3 className="text-sm font-black text-white font-sans tracking-wide">今日智慧三關推薦</h3>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
              基於 4 大 AI 模型共識度自動選腿 · {totalGames} 場賽事分析
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-400 text-[10px] font-black tracking-wider border border-purple-500/20">
            覆蓋 {totalTeamsCovered}/{totalTeams} 隊
          </span>
        </div>
      </div>

      {/* Parlay Cards */}
      <div className="space-y-4">
        {parlays.map((parlay) => {
          const style = gradeStyles[parlay.grade] || gradeStyles.B;
          return (
            <div
              key={parlay.id}
              className={`rounded-2xl border p-4 ${style.bg} ${style.border} transition-all hover:scale-[1.01]`}
            >
              {/* Parlay Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black ${style.text}`}>{style.label}</span>
                  <span className="text-[10px] font-mono text-gray-500">
                    組合 #{parlay.id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-400">
                    過關機率
                  </span>
                  <span className={`text-sm font-black font-mono ${style.text}`}>
                    {(parlay.combinedProb * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Legs */}
              <div className="space-y-2">
                {parlay.legs.map((leg, legIdx) => {
                  const legNames = ['第一場', '第二場', '第三場'];
                  return (
                    <div
                      key={leg.gameId}
                      className="flex items-center justify-between bg-black/20 rounded-xl px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-[10px] font-sans font-black text-gray-500 shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                          {legNames[legIdx] || `第 ${legIdx + 1} 場`}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-white truncate">
                              {leg.pickTeamName}
                            </span>
                            <span className={`text-[9px] font-black px-1 rounded ${
                              leg.pick === 'home' 
                                ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                              {leg.pick === 'home' ? '主勝' : '客勝'}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500 font-mono truncate mt-0.5">
                            {leg.awayTeam.nameCn || leg.awayTeam.code} @ {leg.homeTeam.nameCn || leg.homeTeam.code}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-end gap-0.5">
                          <ConsensusStars count={leg.consensusCount} />
                          <span className="text-[9px] font-mono text-gray-500">
                            {leg.avgConfidence.toFixed(1)}%
                          </span>
                        </div>
                        <ModelDots models={leg.models} pick={leg.pick} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Parlay Footer */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px] font-mono text-gray-600">
                <span>涵蓋隊伍: {parlay.coverageTeams.join(', ')}</span>
                <span>預估總得分: {parlay.legs.map(l => l.predictedTotal).join(' / ')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Uncovered Teams Notice */}
      {uncoveredTeams.length > 0 && (
        <div className="mt-4 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] text-gray-500 font-mono">
          ⚠️ 未納入串關隊伍: {uncoveredTeams.join(', ')}（共識度不足或場次不夠）
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 text-[10px] text-gray-600 font-mono">
        <span>⚡ AI 多模型共識引擎 v1.0</span>
        <span>共 {parlays.length} 組三關推薦</span>
      </div>
    </div>
  );
}
