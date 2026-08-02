'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import SmartParlayCard from '@/components/SmartParlayCard';
import type { ParlayGeneratorResult } from '@/lib/prediction/parlay-generator';
import type { ParlayHistoryResult, ParlayHistoryEntry } from '@/lib/prediction/parlay-history';

export default function SmartParlaysPage() {
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');
  const [selectedLeague, setSelectedLeague] = useState<'ALL' | 'MLB' | 'NBA'>('ALL');
  const [filterResult, setFilterResult] = useState<'ALL' | 'HIT' | 'MISS'>('ALL');
  
  // Live parlays state
  const [liveData, setLiveData] = useState<ParlayGeneratorResult | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);

  // History state
  const [historyData, setHistoryData] = useState<ParlayHistoryResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Fetch today's live parlays
  useEffect(() => {
    async function fetchLive() {
      setLiveLoading(true);
      try {
        const res = await fetch(`/api/predictions/smart-parlays?league=${selectedLeague}`);
        const json = await res.json();
        if (json.success && json.data) {
          setLiveData(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch live parlays:', err);
      } finally {
        setLiveLoading(false);
      }
    }
    fetchLive();
  }, [selectedLeague]);

  // Fetch historical settlement data
  useEffect(() => {
    async function fetchHistory() {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/smart-parlays/history?league=${selectedLeague}`);
        const json = await res.json();
        if (json.success && json.data) {
          setHistoryData(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch parlay history:', err);
      } finally {
        setHistoryLoading(false);
      }
    }
    fetchHistory();
  }, [selectedLeague]);

  // Filter history entries
  const filteredHistoryEntries = (historyData?.entries || []).filter(entry => {
    if (filterResult === 'HIT') return entry.isPerfectHit;
    if (filterResult === 'MISS') return !entry.isPerfectHit;
    return true;
  });

  const stats = historyData?.stats;

  return (
    <div className="min-h-screen bg-[#0A0D14] text-gray-100 font-sans selection:bg-purple-500 selection:text-white pb-20">
      
      {/* ─── Navigation Header ─── */}
      <nav className="sticky top-0 z-50 bg-[#0A0D14]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-xl">🎯</span>
              <span className="font-black text-lg bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
                SportsAI 智慧二關推薦
              </span>
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-6 font-bold text-sm text-gray-300">
            <Link href="/" className="hover:text-purple-400 transition-colors">決策看盤中心</Link>
            <span className="text-amber-400 border-b-2 border-amber-500 pb-1 font-black">🎯 智慧二關</span>
            <Link href="/backtest" className="hover:text-purple-400 transition-colors">歷史量化回測</Link>
            <Link href="/history" className="hover:text-purple-400 transition-colors">完賽記錄簿</Link>
            <Link href="/share" className="hover:text-purple-400 transition-colors">📸 戰報字卡</Link>
            <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black transition-colors">🎰 運彩下注</Link>
          </div>

          {/* Mobile Nav Links */}
          <div className="flex md:hidden items-center gap-4 overflow-x-auto whitespace-nowrap w-full pt-2 border-t border-white/5 text-xs scrollbar-none font-bold text-gray-300">
            <Link href="/">決策看盤</Link>
            <span className="text-amber-400 border-b-2 border-amber-500 pb-0.5 shrink-0 font-black">🎯 智慧二關</span>
            <Link href="/backtest">量化回測</Link>
            <Link href="/history">完賽記錄</Link>
            <Link href="/share">📸 戰報字卡</Link>
            <Link href="/betting">🎰 下注</Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero & KPI Header ─── */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-4">
        <div className="bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-black border border-purple-500/20 rounded-3xl p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black mb-3">
                <span className="animate-pulse">🔥</span> 跨模型四合一共識演算
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                智慧二關組合推薦與完賽驗證
              </h1>
              <p className="text-gray-400 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed font-medium">
                結合 SportsAI、EloRating、MonteCarlo 與 MetaModel 2.0 四大 AI 量化引擎，自動萃取高勝算獨贏與大小分二關組合（以台灣運彩盤口為主）。
              </p>
            </div>

            {/* League Switcher */}
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-1.5 rounded-2xl shrink-0">
              {(['ALL', 'MLB', 'NBA'] as const).map(league => (
                <button
                  key={league}
                  onClick={() => setSelectedLeague(league)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                    selectedLeague === league
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {league === 'ALL' ? '全部聯盟' : league}
                </button>
              ))}
            </div>
          </div>

          {/* KPI Dashboard Cards */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mt-6 pt-6 border-t border-white/10">
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                <span className="text-[10px] md:text-xs text-gray-400 font-bold block mb-1">歷史追蹤總串關</span>
                <span className="text-xl md:text-2xl font-black text-white font-mono">{stats.totalParlays} <span className="text-xs text-gray-500 font-normal">組</span></span>
                <span className="text-[10px] text-gray-500 block mt-0.5">對位紀錄完整率 100%</span>
              </div>

              <div className="bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/20 rounded-2xl p-4 text-center">
                <span className="text-[10px] md:text-xs text-amber-300 font-bold block mb-1">🎯 二關全過勝率</span>
                <span className="text-xl md:text-2xl font-black text-amber-400 font-mono">{stats.perfectHitRate}%</span>
                <span className="text-[10px] text-amber-400/80 block mt-0.5">{stats.perfectHits} / {stats.totalParlays} 組成功通關</span>
              </div>

              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                <span className="text-[10px] md:text-xs text-gray-400 font-bold block mb-1">📊 單關累積勝率</span>
                <span className="text-xl md:text-2xl font-black text-emerald-400 font-mono">{stats.singleLegHitRate}%</span>
                <span className="text-[10px] text-gray-500 block mt-0.5">{stats.totalLegsHit} / {stats.totalLegs} 關成功命中</span>
              </div>

              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-center">
                <span className="text-[10px] md:text-xs text-gray-400 font-bold block mb-1">🏆 至尊 S 級過關率</span>
                <span className="text-xl md:text-2xl font-black text-purple-300 font-mono">{stats.gradeS.rate}%</span>
                <span className="text-[10px] text-gray-500 block mt-0.5">S 級 {stats.gradeS.hits} / {stats.gradeS.total} 通關</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main Content Tabs ─── */}
      <div className="max-w-7xl mx-auto px-4 mt-4">
        {/* Tabs Bar */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-6">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'today'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🔥 今日 AI 智慧三關推薦</span>
            {liveData && liveData.parlays.length > 0 && (
              <span className="bg-amber-500 text-black px-2 py-0.5 rounded-full text-[10px] font-black">
                {liveData.parlays.length} 組
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-black transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
            }`}
          >
            <span>📊 歷史三關戰績與完賽驗證</span>
            {historyData && (
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-black">
                勝率 {stats?.perfectHitRate}%
              </span>
            )}
          </button>
        </div>

        {/* ─── TAB 1: Live Today's Parlays ─── */}
        {activeTab === 'today' && (
          <div>
            {liveLoading ? (
              <div className="py-16 text-center text-gray-500 font-bold">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                正在進行跨模型四合一對局共識演算...
              </div>
            ) : liveData && liveData.parlays.length > 0 ? (
              <SmartParlayCard
                parlays={liveData.parlays}
                totalGames={liveData.totalGames}
                totalTeamsCovered={liveData.totalTeamsCovered}
                totalTeams={liveData.totalTeams}
                uncoveredTeams={liveData.uncoveredTeams}
              />
            ) : (
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-12 text-center text-gray-400 font-bold">
                <span className="text-3xl block mb-2">🏟️</span>
                目前時間區間無符合共識條件之三關組合，或本日賽事尚未排定。
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: Historical Verification ─── */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* Filter controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-bold">過關篩選：</span>
                {(['ALL', 'HIT', 'MISS'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterResult(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      filterResult === f
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    {f === 'ALL' ? '全部結果' : f === 'HIT' ? '🎯 全過通關' : '❌ 過關中斷'}
                  </button>
                ))}
              </div>

              <span className="text-xs font-mono text-gray-500 font-bold">
                共找到 {filteredHistoryEntries.length} 筆歷史驗證對位資料
              </span>
            </div>

            {historyLoading ? (
              <div className="py-16 text-center text-gray-500 font-bold">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                正在載入歷史完賽過關對位數據...
              </div>
            ) : filteredHistoryEntries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredHistoryEntries.map(entry => (
                  <div
                    key={entry.id}
                    className={`border rounded-2xl p-5 backdrop-blur-md transition-all ${
                      entry.isPerfectHit
                        ? 'bg-gradient-to-b from-emerald-500/10 via-white/[0.02] to-transparent border-emerald-500/30 hover:border-emerald-500/50'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Entry Header */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400 font-bold">{entry.date}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 text-gray-300 border border-white/10">
                          {entry.league}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          entry.grade === 'S' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : entry.grade === 'A' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {entry.grade === 'S' ? '🏆 至尊 S 級' : entry.grade === 'A' ? '⭐ 強勢 A 級' : '📊 B 級組合'}
                        </span>
                      </div>

                      <span className={`px-3 py-1 rounded-xl text-xs font-black border flex items-center gap-1 ${
                        entry.isPerfectHit
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {entry.resultLabel}
                      </span>
                    </div>

                    {/* Legs Detail */}
                    <div className="space-y-2">
                      {entry.legs.map((leg, legIdx) => (
                        <div
                          key={legIdx}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                            leg.isHit
                              ? 'bg-emerald-500/5 border-emerald-500/20 text-gray-200'
                              : 'bg-rose-500/5 border-rose-500/20 text-gray-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${leg.isHit ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            <span className="font-bold">{leg.awayTeam.nameCn} vs {leg.homeTeam.nameCn}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-gray-400">
                              實際比分: <strong className="text-white">{leg.awayScore} - {leg.homeScore}</strong>
                            </span>
                            <span className={`font-mono font-black px-2 py-0.5 rounded ${
                              leg.isHit ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              推薦: {leg.pickTeamName} ({leg.isHit ? '命中' : '失准'})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer Odds / Rate */}
                    <div className="flex justify-between items-center text-[11px] font-mono text-gray-500 pt-3 mt-3 border-t border-white/5">
                      <span>關數對位勝率: {entry.legsHit} / {entry.totalLegs}</span>
                      <span>推估組合勝算: {(entry.combinedProb * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-12 text-center text-gray-400 font-bold">
                無符合篩選條件之歷史過關紀錄。
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
