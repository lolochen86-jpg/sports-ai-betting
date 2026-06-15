'use client';



import { useState, useEffect } from 'react';
import Link from 'next/link';
import { EdgeSignal } from '@/types/betting';
import { translateSelection, getTeamNameCn } from '@/lib/sports-api/team-translations';

export default function EdgeAnalysisPage() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [signals, setSignals] = useState<EdgeSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<'ALL' | 'NBA' | 'MLB'>('ALL');
  const [minEvFilter, setMinEvFilter] = useState<number>(0);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleCalculateEdgesAuto = async (targetDate: string) => {
    try {
      const localOddsStr = localStorage.getItem(`taiwan_odds_${targetDate}`);
      const localOdds = localOddsStr ? JSON.parse(localOddsStr) : [];
      if (localOdds.length === 0) return;

      const res = await fetch('/api/betting/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate, odds: localOdds }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSignals(json.data);
        localStorage.setItem(`edge_signals_${targetDate}`, JSON.stringify(json.data));
      }
    } catch (e) {
      console.error('Auto-calculation failed:', e);
    }
  };

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/betting/edge?date=${date}`);
      const json = await res.json();
      if (json.success) {
        if (json.isFallback) {
          const localSignalsStr = localStorage.getItem(`edge_signals_${date}`);
          if (localSignalsStr) {
            setSignals(JSON.parse(localSignalsStr));
          } else {
            await handleCalculateEdgesAuto(date);
          }
        } else {
          setSignals(json.data || []);
        }
      }
    } catch (e) {
      console.error(e);
      const localSignalsStr = localStorage.getItem(`edge_signals_${date}`);
      if (localSignalsStr) {
        setSignals(JSON.parse(localSignalsStr));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
  }, [date]);

  const handleCalculateEdges = async () => {
    setCalculating(true);
    try {
      const localOddsStr = localStorage.getItem(`taiwan_odds_${date}`);
      const localOdds = localOddsStr ? JSON.parse(localOddsStr) : [];

      const res = await fetch('/api/betting/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, odds: localOdds }),
      });
      const json = await res.json();
      if (json.success) {
        triggerToast('🎉 Edge 正期望值分析重新計算成功！');
        setSignals(json.data || []);
        localStorage.setItem(`edge_signals_${date}`, JSON.stringify(json.data || []));
      } else {
        triggerToast(`❌ 計算失敗: ${json.error}`);
      }
    } catch {
      triggerToast('❌ 連接伺服器失敗');
    } finally {
      setCalculating(false);
    }
  };

  // 篩選訊號
  const filteredSignals = signals.filter((s) => {
    if (selectedLeague !== 'ALL' && s.odds.league !== selectedLeague) return false;
    if (s.edgePercent < minEvFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 flex flex-col relative overflow-hidden">
      {/* 裝飾背景發光 */}
      <div className="fixed top-20 left-10 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-20 right-10 w-96 h-96 bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* ───── 導航列 ───── */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/5">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="text-2xl">🏀⚾</span>
            <span className="bg-gradient-to-r from-orange-400 via-purple-500 to-cyan-400 text-transparent bg-clip-text">
              AI 預測平台
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">決策看盤中心</Link>
            <Link href="/backtest" className="text-gray-400 hover:text-white transition-colors">歷史量化回測</Link>
            <Link href="/history" className="text-gray-400 hover:text-white transition-colors">完賽記錄簿</Link>
            <Link href="/betting" className="text-amber-400 border-b-2 border-amber-500 pb-1">🎰 運彩下注</Link>
          </div>
        </nav>
      </header>

      {/* ───── 主內容 ───── */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 space-y-8">
        
        {/* 麵包屑與標題 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2">
              <Link href="/betting" className="hover:text-amber-400 transition-colors">運彩下注模式</Link>
              <span>/</span>
              <span className="text-amber-400">正期望值分析</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              📈 Edge 正期望值分析
            </h1>
            <p className="text-xs text-gray-400 mt-1">對比國際盤賠率與 AI 模型勝率，尋找正預期收益 (EV &gt; 0) 的投注優勢</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-gray-900 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none"
            />
            <button
              onClick={handleCalculateEdges}
              disabled={calculating}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-700 text-gray-950 font-black py-2 px-5 rounded-xl text-sm transition-colors shadow-lg shadow-amber-500/10 flex items-center gap-2"
            >
              {calculating ? '計算中...' : '🔄 重新計算期望值'}
            </button>
          </div>
        </div>

        {/* 篩選工具列 */}
        <div className="glass-panel rounded-3xl p-5 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <label className="text-xs font-bold text-gray-400 shrink-0">聯盟篩選:</label>
            <div className="flex bg-gray-900/60 p-1 border border-white/10 rounded-xl">
              <button
                onClick={() => setSelectedLeague('ALL')}
                className={`text-xs font-extrabold px-3 py-1.5 rounded-lg transition-colors ${selectedLeague === 'ALL' ? 'bg-amber-500 text-gray-950 shadow' : 'text-gray-400 hover:text-white'}`}
              >
                全部
              </button>
              <button
                onClick={() => setSelectedLeague('NBA')}
                className={`text-xs font-extrabold px-3 py-1.5 rounded-lg transition-colors ${selectedLeague === 'NBA' ? 'bg-amber-500 text-gray-950 shadow' : 'text-gray-400 hover:text-white'}`}
              >
                NBA
              </button>
              <button
                onClick={() => setSelectedLeague('MLB')}
                className={`text-xs font-extrabold px-3 py-1.5 rounded-lg transition-colors ${selectedLeague === 'MLB' ? 'bg-amber-500 text-gray-950 shadow' : 'text-gray-400 hover:text-white'}`}
              >
                MLB
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <label className="text-xs font-bold text-gray-400 shrink-0">最小期望值 (EV):</label>
            <div className="flex items-center gap-2 w-full md:w-48">
              <input
                type="range"
                min="-10"
                max="20"
                value={minEvFilter}
                onChange={(e) => setMinEvFilter(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="text-xs font-mono font-black text-amber-400 min-w-[40px] text-right">
                {minEvFilter >= 0 ? `+${minEvFilter}` : minEvFilter}%
              </span>
            </div>
          </div>
        </div>

        {/* 訊號清單 */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 font-bold">分析中...</div>
        ) : filteredSignals.length === 0 ? (
          <div className="text-center py-16 bg-gray-950/40 border border-white/5 rounded-3xl text-gray-500 font-bold">
            找不到符合篩選條件的期望值 (Edge) 投注信號。請嘗試調整篩選條件或重設日期。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSignals.map((sig) => (
              <div
                key={sig.id}
                className={`glass-panel rounded-2xl p-6 border transition-all ${sig.isPositiveEdge ? 'border-emerald-500/20' : 'border-white/5'}`}
              >
                {/* 頂部資訊 */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[10px] bg-gray-800 text-gray-400 font-extrabold px-2 py-0.5 rounded-full mr-2">
                      {sig.odds.league}
                    </span>
                    <span className="text-xs font-mono text-gray-500">
                      模型: {sig.modelSource}
                    </span>
                    <h3 className="text-md font-extrabold text-white mt-2">
                      {getTeamNameCn(sig.odds.awayTeam, sig.odds.league)} @ {getTeamNameCn(sig.odds.homeTeam, sig.odds.league)}
                    </h3>
                  </div>

                  {/* EV Badge */}
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block font-bold">期望值 (Edge)</span>
                    <span className={`text-lg font-mono font-black ${sig.isPositiveEdge ? 'text-emerald-400' : 'text-red-400'}`}>
                      {sig.edgePercent >= 0 ? `+${sig.edgePercent.toFixed(1)}%` : `${sig.edgePercent.toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                {/* 玩法細節與對比 */}
                <div className="bg-gray-900/60 border border-white/5 rounded-xl p-4 space-y-3 my-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold">玩法下注</span>
                    <span className="text-white font-extrabold">
                      {sig.odds.marketType === 'moneyline' ? '獨贏' : sig.odds.marketType === 'spread' ? '讓分' : sig.odds.marketType === 'totals' ? '大小' : '最高得分局'}: {translateSelection(sig.odds.selection, sig.odds.league)} {sig.odds.line ? `(${sig.odds.line})` : ''}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold">國際盤賠率</span>
                    <span className="text-amber-400 font-mono font-black text-sm">{sig.odds.taiwanOdds.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold">模型估計機率</span>
                    <span className="text-emerald-400 font-mono font-black">{(sig.modelProbability * 100).toFixed(1)}%</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-bold">模型公平賠率 (Fair Odds)</span>
                    <span className="text-white font-mono font-extrabold">{sig.fairOdds.toFixed(2)}</span>
                  </div>
                </div>

                {/* 信心度進度條 */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-bold">
                    <span className="text-gray-400">綜合評估信心度</span>
                    <span className="text-amber-400 font-mono">{sig.confidenceScore}%</span>
                  </div>
                  <div className="w-full bg-gray-900 rounded-full h-2 border border-white/5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${sig.confidenceScore}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-amber-500/30 text-white px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-50 animate-fade-in">
          <span>🔔</span> {toastMsg}
        </div>
      )}
    </div>
  );
}
