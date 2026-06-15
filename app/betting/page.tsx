'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DailyBudget, EdgeSignal, BetRecommendation } from '@/types/betting';
import { translateSelection, getTeamNameCn } from '@/lib/sports-api/team-translations';

export default function BettingDashboard() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [budget, setBudget] = useState<DailyBudget | null>(null);
  const [edges, setEdges] = useState<EdgeSignal[]>([]);
  const [recommendations, setRecommendations] = useState<BetRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [budgetRes, edgeRes, recsRes] = await Promise.all([
          fetch(`/api/betting/budget?date=${date}`),
          fetch(`/api/betting/edge?date=${date}`),
          fetch(`/api/betting/recommendations?date=${date}`)
        ]);

        const [budgetJson, edgeJson, recsJson] = await Promise.all([
          budgetRes.json(),
          edgeRes.json(),
          recsRes.json()
        ]);

        if (budgetJson.success) {
          if (budgetJson.isFallback) {
            const localBudgetStr = localStorage.getItem(`budget_${date}`);
            if (localBudgetStr) {
              setBudget(JSON.parse(localBudgetStr));
            } else {
              setBudget(budgetJson.data);
              localStorage.setItem(`budget_${date}`, JSON.stringify(budgetJson.data));
            }
          } else {
            setBudget(budgetJson.data);
          }
        }
        
        if (edgeJson.success) {
          if (edgeJson.isFallback) {
            const localEdgesStr = localStorage.getItem(`edge_signals_${date}`);
            setEdges(localEdgesStr ? JSON.parse(localEdgesStr) : []);
          } else {
            setEdges(edgeJson.data || []);
          }
        }

        if (recsJson.success) {
          if (recsJson.isFallback) {
            const localRecsStr = localStorage.getItem(`recommendations_${date}`);
            setRecommendations(localRecsStr ? JSON.parse(localRecsStr) : []);
          } else {
            setRecommendations(recsJson.data || []);
          }
        }
      } catch (e) {
        console.error('Failed to load dashboard data:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [date]);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleActionRecommendation = async (recId: string, action: 'accepted' | 'rejected') => {
    try {
      const match = recommendations.find((r) => r.id === recId);
      if (!match) return;

      const updatedRecs = recommendations.map((r) => (r.id === recId ? { ...r, status: action } : r));

      if (action === 'accepted') {
        // Save to local storage tickets and update local budget
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

          // budget deduction
          const localBudgetStr = localStorage.getItem(`budget_${date}`);
          if (localBudgetStr) {
            const b = JSON.parse(localBudgetStr);
            b.spent += match.totalStake;
            b.remaining = Math.max(0, b.totalBudget - b.spent);
            b.ticketsUsed += 1;
            localStorage.setItem(`budget_${date}`, JSON.stringify(b));
            setBudget(b);
          }
        } catch (e) {
          console.error(e);
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
          triggerToast('🎉 已成功接受推薦並產生注單！請至國際盤完成手動下注。');
          if (!data.isFallback) {
            // 更新預算與狀態
            const budgetRes = await fetch(`/api/betting/budget?date=${date}`);
            const budgetJson = await budgetRes.json();
            if (budgetJson.success) setBudget(budgetJson.data);
          }
        } else {
          triggerToast(`❌ 投注失敗: ${data.error}`);
        }
      } else {
        triggerToast('🚫 已忽略該注單推薦');
      }

      // 更新推薦清單狀態
      setRecommendations(updatedRecs);
      localStorage.setItem(`recommendations_${date}`, JSON.stringify(updatedRecs));
    } catch (e) {
      triggerToast('❌ 伺服器連接錯誤');
    }
  };

  // 計算今日 Edge 概況
  const positiveEdges = edges.filter((e) => e.isPositiveEdge);
  const maxEdge = positiveEdges.length > 0 ? Math.max(...positiveEdges.map((e) => e.edgePercent)) : 0;

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
            <Link href="/share" className="text-gray-400 hover:text-white transition-colors">📸 戰報字卡</Link>
            <Link href="/betting" className="text-amber-400 border-b-2 border-amber-500 pb-1">🎰 運彩下注</Link>
          </div>
        </nav>
      </header>

      {/* ───── 主內容區 ───── */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 space-y-8">
        
        {/* 標題與日期 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <span className="betting-neon-text text-amber-500">🎰</span> 運彩下注模式
            </h1>
            <p className="text-sm text-gray-400 mt-1">智能分析 · 正期望值投注 · 自動風控檢查</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-amber-400">選擇分析日期:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-gray-900 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        {/* 預算條 */}
        {budget && (
          <div className="glass-panel-betting rounded-3xl p-6 relative overflow-hidden animate-betting-pulse">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-extrabold text-amber-400">今日投注預算控管</h3>
                <p className="text-xs text-gray-400">恪守紀律，固定金額投注以實現複利增長</p>
              </div>
              <div className="flex gap-4 text-sm font-bold">
                <div>
                  <span className="text-gray-400">每日預算: </span>
                  <span className="text-white font-mono">{budget.totalBudget} 元</span>
                </div>
                <div>
                  <span className="text-gray-400">已使用: </span>
                  <span className="text-amber-500 font-mono">{budget.spent} 元</span>
                </div>
                <div>
                  <span className="text-gray-400">剩餘: </span>
                  <span className="text-emerald-400 font-mono">{budget.remaining} 元</span>
                </div>
              </div>
            </div>
            
            {/* 進度條 */}
            <div className="w-full bg-gray-900/60 rounded-full h-3 border border-white/5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-600 to-amber-400 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, (budget.spent / budget.totalBudget) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1.5 font-bold">
              <span>0% (紀律起始)</span>
              <span>100% (今日額度上限)</span>
            </div>
          </div>
        )}

        {/* 快速統計指標 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel rounded-3xl p-6 border border-white/5">
            <span className="text-xs text-gray-400 font-bold block mb-1">今日正 EV 投注信號</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-black font-mono ${positiveEdges.length > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                {positiveEdges.length}
              </span>
              <span className="text-xs text-gray-500">個玩法信號</span>
            </div>
          </div>
          <div className="glass-panel rounded-3xl p-6 border border-white/5">
            <span className="text-xs text-gray-400 font-bold block mb-1">最大邊際期望值 (Edge)</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-black font-mono ${maxEdge > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                +{maxEdge.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-500">超額期望報酬</span>
            </div>
          </div>
          <div className="glass-panel rounded-3xl p-6 border border-white/5">
            <span className="text-xs text-gray-400 font-bold block mb-1">今日系統推薦注單</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black font-mono text-amber-500">
                {recommendations.filter(r => r.status === 'recommended').length}
              </span>
              <span className="text-xs text-gray-500">張待確認</span>
            </div>
          </div>
        </div>

        {/* 今日推薦投注預覽 */}
        <div className="glass-panel rounded-3xl p-6 border border-white/5">
          <h2 className="text-xl font-extrabold text-white mb-6 flex items-center gap-2">
            <span className="text-amber-400">🎯</span> 今日系統推薦下注
          </h2>
          
          {loading ? (
            <div className="text-center py-12 text-gray-400 font-bold">載入中...</div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-16 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex flex-col items-center justify-center space-y-3">
              <span className="text-4xl">🛡️</span>
              <h3 className="text-lg font-extrabold text-amber-400">今日無合適的投注推薦</h3>
              <p className="text-sm text-gray-400 max-w-md">
                當前模型預測與運彩賠率相比，沒有大於設定門檻的正期望值投注信號。請遵守紀律，無優勢不投注！
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {recommendations.map((rec) => (
                <div key={rec.id} className="glass-panel-betting rounded-2xl p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full">
                        {rec.parlayLegs === 1 ? '單場推薦' : `${rec.parlayLegs}串1 過關`}
                      </span>
                      <span className="text-xs font-mono text-gray-400">{rec.id}</span>
                    </div>

                    <div className="space-y-3 my-4">
                      {rec.legs.map((leg, idx) => (
                        <div key={idx} className="bg-gray-900/60 rounded-xl p-3 border border-white/5 flex justify-between items-center">
                          <div>
                            <div className="text-xs font-bold text-gray-400">
                              [{leg.league}] {getTeamNameCn(leg.awayTeam, leg.league)} @ {getTeamNameCn(leg.homeTeam, leg.league)}
                            </div>
                            <div className="text-sm font-extrabold text-white mt-1">
                              下注：{translateSelection(leg.selection, leg.league)} {leg.line ? `(${leg.line})` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-gray-400 block font-semibold">賠率</span>
                            <span className="text-sm font-mono font-extrabold text-amber-400">{leg.odds.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center border-t border-white/5 pt-3">
                      <div>
                        <span className="text-xs text-gray-400 block font-bold">投注金額</span>
                        <span className="text-sm font-mono text-white font-black">{rec.totalStake} 元</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-400 block font-bold">預估回報</span>
                        <span className="text-sm font-mono text-emerald-400 font-black">+{rec.estimatedPayout} 元</span>
                      </div>
                    </div>
                  </div>

                  {rec.status === 'recommended' ? (
                    <div className="flex gap-3 pt-3 border-t border-white/5">
                      <button
                        onClick={() => handleActionRecommendation(rec.id, 'rejected')}
                        className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-extrabold py-2 px-4 rounded-xl border border-white/10 text-xs transition-colors"
                      >
                        拒絕推薦
                      </button>
                      <button
                        onClick={() => handleActionRecommendation(rec.id, 'accepted')}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-gray-950 font-black py-2 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-amber-500/10"
                      >
                        接受下注
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-2 bg-gray-900/40 border border-white/5 text-xs rounded-xl font-bold text-gray-500">
                      {rec.status === 'accepted' ? '✅ 已接受此注單 (請在運彩官網手動完成投注)' : '❌ 已忽略此推薦'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 快速導航網格 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          <Link href="/betting/odds" className="glass-panel-betting hover:bg-amber-500/[0.02] rounded-3xl p-6 text-center border border-amber-500/10 transition-all flex flex-col items-center space-y-3">
            <span className="text-3xl">📥</span>
            <span className="text-sm font-extrabold text-amber-400">國際盤賠率匯入</span>
          </Link>
          <Link href="/betting/edge" className="glass-panel-betting hover:bg-amber-500/[0.02] rounded-3xl p-6 text-center border border-amber-500/10 transition-all flex flex-col items-center space-y-3">
            <span className="text-3xl">📈</span>
            <span className="text-sm font-extrabold text-amber-400">正期望值分析</span>
          </Link>
          <Link href="/betting/recommendations" className="glass-panel-betting hover:bg-amber-500/[0.02] rounded-3xl p-6 text-center border border-amber-500/10 transition-all flex flex-col items-center space-y-3">
            <span className="text-3xl">🎯</span>
            <span className="text-sm font-extrabold text-amber-400">今日推薦下注</span>
          </Link>
          <Link href="/betting/ticket-builder" className="glass-panel-betting hover:bg-amber-500/[0.02] rounded-3xl p-6 text-center border border-amber-500/10 transition-all flex flex-col items-center space-y-3">
            <span className="text-3xl">🎫</span>
            <span className="text-sm font-extrabold text-amber-400">注單組合器</span>
          </Link>
          <Link href="/betting/history" className="glass-panel-betting hover:bg-amber-500/[0.02] rounded-3xl p-6 text-center border border-amber-500/10 transition-all flex flex-col items-center space-y-3">
            <span className="text-3xl">📋</span>
            <span className="text-sm font-extrabold text-amber-400">我的下注紀錄</span>
          </Link>
          <Link href="/betting/settings" className="glass-panel-betting hover:bg-amber-500/[0.02] rounded-3xl p-6 text-center border border-amber-500/10 transition-all flex flex-col items-center space-y-3">
            <span className="text-3xl">⚙️</span>
            <span className="text-sm font-extrabold text-amber-400">策略權重設定</span>
          </Link>
        </div>
      </main>

      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-amber-500/30 text-white px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-50 animate-fade-in flex items-center gap-2">
          <span>🔔</span> {toastMsg}
        </div>
      )}
    </div>
  );
}
