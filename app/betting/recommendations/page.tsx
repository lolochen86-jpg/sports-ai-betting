'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BetRecommendation, StrategySettings, DEFAULT_STRATEGY } from '@/types/betting';
import { translateSelection, getTeamNameCn } from '@/lib/sports-api/team-translations';

export default function RecommendationsPage() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [recommendations, setRecommendations] = useState<BetRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<StrategySettings>(DEFAULT_STRATEGY);

  useEffect(() => {
    const local = localStorage.getItem('betting_strategy_settings');
    if (local) {
      setSettings(JSON.parse(local));
    }
  }, []);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/betting/recommendations?date=${date}`);
      const json = await res.json();
      if (json.success) {
        if (json.isFallback) {
          const localRecsStr = localStorage.getItem(`recommendations_${date}`);
          setRecommendations(localRecsStr ? JSON.parse(localRecsStr) : []);
        } else {
          setRecommendations(json.data || []);
        }
      }
    } catch (e) {
      console.error(e);
      const localRecsStr = localStorage.getItem(`recommendations_${date}`);
      setRecommendations(localRecsStr ? JSON.parse(localRecsStr) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [date]);

  const handleGenerateRecommendations = async () => {
    setGenerating(true);
    try {
      // Pull local odds/edges
      const localOddsStr = localStorage.getItem(`taiwan_odds_${date}`);
      const localOdds = localOddsStr ? JSON.parse(localOddsStr) : [];

      // POST to edge with local odds
      const edgeRes = await fetch('/api/betting/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, odds: localOdds }),
      });
      const edgeJson = await edgeRes.json();
      
      const edgesToPass = edgeJson.success ? edgeJson.data : [];
      localStorage.setItem(`edge_signals_${date}`, JSON.stringify(edgesToPass));

      // 產生推薦 (pass edge signals to server recommender)
      const res = await fetch('/api/betting/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, edges: edgesToPass }),
      });
      const json = await res.json();
      if (json.success) {
        triggerToast('🎉 今日推薦投注生成成功！已遵循風險控管模型。');
        setRecommendations(json.data || []);
        localStorage.setItem(`recommendations_${date}`, JSON.stringify(json.data || []));
      } else {
        triggerToast(`❌ 生成失敗: ${json.error}`);
      }
    } catch {
      triggerToast('❌ 連接伺服器錯誤');
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (recId: string, action: 'accepted' | 'rejected') => {
    try {
      const match = recommendations.find((r) => r.id === recId);
      if (!match) return;

      const updatedRecs = recommendations.map((r) => (r.id === recId ? { ...r, status: action } : r));

      if (action === 'accepted') {
        // Save ticket to localStorage first
        try {
          const localTicketsStr = localStorage.getItem('tickets');
          const localTickets = localTicketsStr ? JSON.parse(localTicketsStr) : [];
          const newTicket = {
            id: `ticket_${Date.now()}`,
            date: date,
            legs: match.legs.map((l) => ({ ...l, result: 'pending' })),
            stake: match.totalStake,
            parlayOdds: match.parlayOdds,
            estimatedPayout: match.estimatedPayout,
            status: 'pending',
            fromRecommendationId: recId,
            actualPayout: 0,
            profitLoss: 0,
            createdAt: new Date().toISOString(),
          };
          localTickets.push(newTicket);
          localStorage.setItem('tickets', JSON.stringify(localTickets));
          
          // Also deduct local budget
          const localBudgetStr = localStorage.getItem(`budget_${date}`);
          if (localBudgetStr) {
            const b = JSON.parse(localBudgetStr);
            b.spent += match.totalStake;
            b.remaining = Math.max(0, b.totalBudget - b.spent);
            b.ticketsUsed += 1;
            localStorage.setItem(`budget_${date}`, JSON.stringify(b));
          }
        } catch (err) {
          console.error('Failed to write ticket to local storage:', err);
        }

        const res = await fetch('/api/betting/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            legs: match.legs,
            stake: match.totalStake,
            parlayOdds: match.parlayOdds,
            estimatedPayout: match.estimatedPayout,
            fromRecommendationId: recId,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const modeText = '國際盤';
          triggerToast(`🎉 注單已成功加入紀錄！請至${modeText}手動下注。`);
        } else {
          triggerToast(`❌ 投注失敗: ${data.error}`);
        }
      } else {
        triggerToast('🚫 已忽略該注單推薦');
      }

      setRecommendations(updatedRecs);
      localStorage.setItem(`recommendations_${date}`, JSON.stringify(updatedRecs));
    } catch {
      triggerToast('❌ 伺服器操作失敗');
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div className="fixed top-20 left-10 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-20 right-10 w-96 h-96 bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Navbar */}
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

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 space-y-8">
        
        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2">
              <Link href="/betting" className="hover:text-amber-400 transition-colors">運彩下注模式</Link>
              <span>/</span>
              <span className="text-amber-400">今日推薦下注</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              🎯 今日推薦下注
            </h1>
            <p className="text-xs text-gray-400 mt-1">根據最優化的 Edge 期望值，自動分配每日預算進行科學投注推薦</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-gray-900 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none"
            />
            <button
              onClick={handleGenerateRecommendations}
              disabled={generating}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-700 text-gray-950 font-black py-2 px-5 rounded-xl text-sm transition-colors shadow-lg"
            >
              {generating ? '正在產生...' : '⚡ 觸發今日推薦'}
            </button>
          </div>
        </div>

        {/* 推薦卡片列表 */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 font-bold">載入中...</div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-16 bg-amber-500/5 border border-amber-500/10 rounded-3xl flex flex-col items-center justify-center space-y-3">
            <span className="text-5xl">🛡️</span>
            <h3 className="text-lg font-extrabold text-amber-400">今日無推薦下注組合</h3>
            <p className="text-xs text-gray-400 max-w-md">
              當前未發現足夠強的正期望值投注信號。本系統提倡無優勢不投注，請遵守資金紀律，避免盲目下注！
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recommendations.map((rec) => (
              <div key={rec.id} className="glass-panel-betting rounded-3xl p-6 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <span className="text-xs bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full">
                      {rec.parlayLegs === 1 ? '單場推薦' : `${rec.parlayLegs}串1 過關`}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono font-bold">ID: {rec.id}</span>
                  </div>

                  {/* Legs */}
                  <div className="space-y-3 my-5">
                    {rec.legs.map((leg, idx) => (
                      <div key={idx} className="bg-gray-900/60 border border-white/5 rounded-xl p-3.5 flex justify-between items-center">
                        <div>
                          <div className="text-xs font-bold text-gray-400">
                            [{leg.league}] {getTeamNameCn(leg.awayTeam, leg.league)} @ {getTeamNameCn(leg.homeTeam, leg.league)}
                          </div>
                          <div className="text-sm font-extrabold text-white mt-1">
                            下注：{translateSelection(leg.selection, leg.league)} {leg.line ? `(${leg.line})` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-gray-500 block font-bold">賠率</span>
                          <span className="text-sm font-mono font-extrabold text-amber-400">{leg.odds.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 總結 */}
                  <div className="flex justify-between items-center bg-gray-950/40 border border-white/5 rounded-xl p-4">
                    <div>
                      <span className="text-[10px] text-gray-400 block font-bold">投注金額</span>
                      <span className="text-sm font-mono text-white font-black">{rec.totalStake} 元</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block font-bold">過關組合賠率</span>
                      <span className="text-sm font-mono text-amber-400 font-black">{rec.parlayOdds.toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block font-bold">預期回報</span>
                      <span className="text-sm font-mono text-emerald-400 font-black">+{rec.estimatedPayout} 元</span>
                    </div>
                  </div>
                </div>

                {/* 按鈕組 */}
                {rec.status === 'recommended' ? (
                  <div className="flex gap-4 pt-3 border-t border-white/5">
                    <button
                      onClick={() => handleAction(rec.id, 'rejected')}
                      className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-extrabold py-2.5 px-4 rounded-xl border border-white/10 text-xs transition-colors"
                    >
                      不採用推薦
                    </button>
                    <button
                      onClick={() => handleAction(rec.id, 'accepted')}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-gray-950 font-black py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg"
                    >
                      採納並生成注單
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-2.5 bg-gray-900/40 border border-white/5 text-xs rounded-xl font-bold text-gray-500">
                    {rec.status === 'accepted' ? `✅ 已接受推薦，請手動至國際盤完成投注` : '❌ 已忽略此推薦'}
                  </div>
                )}
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
