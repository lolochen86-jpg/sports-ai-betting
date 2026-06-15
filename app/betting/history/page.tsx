'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BetTicket, ProfitLossSummary } from '@/types/betting';
import { translateSelection, getTeamNameCn } from '@/lib/sports-api/team-translations';

export default function BettingHistoryPage() {
  const [tickets, setTickets] = useState<BetTicket[]>([]);
  const [summary, setSummary] = useState<ProfitLossSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 結算 Modal State
  const [settlingTicketId, setSettlingTicketId] = useState<string | null>(null);
  const [settlementResult, setSettlementResult] = useState<'won' | 'lost' | 'void' | 'cancelled'>('won');
  const [actualPayout, setActualPayout] = useState('');

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const calculateLocalSummary = (ticketList: BetTicket[]): ProfitLossSummary => {
    let totalInvested = 0;
    let totalReturned = 0;
    let wins = 0;
    let losses = 0;
    let pending = 0;

    for (const t of ticketList) {
      if (t.status === 'won') {
        totalInvested += t.stake;
        totalReturned += t.actualPayout || 0;
        wins++;
      } else if (t.status === 'lost') {
        totalInvested += t.stake;
        losses++;
      } else if (t.status === 'pending') {
        pending++;
      }
    }

    const netProfitLoss = totalReturned - totalInvested;
    const roi = totalInvested > 0 ? (netProfitLoss / totalInvested) * 100 : 0;
    const totalBets = wins + losses + pending;
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

    return {
      totalInvested,
      totalReturned,
      netProfitLoss,
      roi: parseFloat(roi.toFixed(2)),
      totalBets,
      wins,
      losses,
      pending,
      winRate: parseFloat(winRate.toFixed(2)),
    };
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/betting/history');
      const json = await res.json();
      if (json.success) {
        if (json.isFallback) {
          const localTicketsStr = localStorage.getItem('tickets');
          const localTickets: BetTicket[] = localTicketsStr ? JSON.parse(localTicketsStr) : [];
          localTickets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setTickets(localTickets);
          setSummary(calculateLocalSummary(localTickets));
        } else {
          setTickets(json.data.tickets || []);
          setSummary(json.data.summary || null);
        }
      }
    } catch (e) {
      console.error(e);
      const localTicketsStr = localStorage.getItem('tickets');
      const localTickets: BetTicket[] = localTicketsStr ? JSON.parse(localTicketsStr) : [];
      localTickets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTickets(localTickets);
      setSummary(calculateLocalSummary(localTickets));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSettleSubmit = async () => {
    if (!settlingTicketId) return;

    const payoutNum = settlementResult === 'won' ? parseFloat(actualPayout) || 0 : 0;

    // Settle locally in localStorage first
    try {
      const localTicketsStr = localStorage.getItem('tickets');
      const localTickets: BetTicket[] = localTicketsStr ? JSON.parse(localTicketsStr) : [];
      const tIdx = localTickets.findIndex(t => t.id === settlingTicketId);
      if (tIdx > -1) {
        const ticket = localTickets[tIdx];
        ticket.status = settlementResult;
        ticket.actualPayout = payoutNum;
        ticket.profitLoss = settlementResult === 'won' ? payoutNum - ticket.stake : (settlementResult === 'lost' ? -ticket.stake : 0);
        localStorage.setItem('tickets', JSON.stringify(localTickets));

        // Refund local budget if cancelled/void
        if (settlementResult === 'cancelled' || settlementResult === 'void') {
          const localBudgetStr = localStorage.getItem(`budget_${ticket.date}`);
          if (localBudgetStr) {
            const b = JSON.parse(localBudgetStr);
            b.spent = Math.max(0, b.spent - ticket.stake);
            b.remaining = Math.max(0, b.totalBudget - b.spent);
            b.ticketsUsed = Math.max(0, b.ticketsUsed - 1);
            localStorage.setItem(`budget_${ticket.date}`, JSON.stringify(b));
          }
        }
      }
    } catch (e) {
      console.error('Failed to settle locally:', e);
    }

    try {
      const res = await fetch('/api/betting/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: settlingTicketId,
          result: settlementResult,
          actualPayout: payoutNum,
        }),
      });

      const json = await res.json();
      if (json.success) {
        triggerToast('🎉 注單結算完成！損益已計入帳簿。');
        setSettlingTicketId(null);
        setActualPayout('');
        fetchHistory(); // 重新整理
      } else {
        triggerToast(`❌ 結算失敗: ${json.error}`);
        setSettlingTicketId(null);
        setActualPayout('');
        fetchHistory();
      }
    } catch {
      triggerToast('❌ 連接伺服器錯誤，已記錄至本地瀏覽器');
      setSettlingTicketId(null);
      setActualPayout('');
      fetchHistory();
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
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2">
            <Link href="/betting" className="hover:text-amber-400 transition-colors">運彩下注模式</Link>
            <span>/</span>
            <span className="text-amber-400">我的下注紀錄</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            📋 下注歷史與損益統計
          </h1>
          <p className="text-xs text-gray-400 mt-1">追蹤所有已確認注單、總體投資回報率 (ROI) 與勝率表現</p>
        </div>

        {/* 損益統計面板 */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="glass-panel rounded-2xl p-5 border border-white/5 text-center">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">累計投入本金</span>
              <span className="text-lg font-mono font-black text-white">{summary.totalInvested} 元</span>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-white/5 text-center">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">累計回收彩金</span>
              <span className="text-lg font-mono font-black text-white">{summary.totalReturned} 元</span>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-white/5 text-center">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">累計損益</span>
              <span className={`text-lg font-mono font-black ${summary.netProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.netProfitLoss >= 0 ? `+${summary.netProfitLoss}` : summary.netProfitLoss} 元
              </span>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-white/5 text-center">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">投報率 (ROI)</span>
              <span className={`text-lg font-mono font-black ${summary.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.roi >= 0 ? `+${summary.roi}%` : `${summary.roi}%`}
              </span>
            </div>
            <div className="glass-panel rounded-2xl p-5 border border-white/5 text-center col-span-2 md:col-span-1">
              <span className="text-[10px] text-gray-500 font-bold block mb-1">下注勝率</span>
              <span className="text-lg font-mono font-black text-amber-400">{summary.winRate.toFixed(1)}%</span>
              <span className="text-[9px] text-gray-500 block font-normal mt-0.5">({summary.wins}勝 {summary.losses}敗)</span>
            </div>
          </div>
        )}

        {/* 下注紀錄列表 */}
        <div className="glass-panel rounded-3xl p-6 border border-white/5">
          <h2 className="text-lg font-extrabold text-white mb-6">📝 投注單列表</h2>
          
          {loading ? (
            <div className="text-center py-12 text-gray-400 font-bold">載入中...</div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-gray-500 font-bold">
              無下注歷史。請使用「今日推薦」或「注單組合器」添加首筆注單！
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((t) => (
                <div key={t.id} className="bg-gray-950/40 border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-2 flex-grow">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === 'won' ? 'bg-emerald-500/20 text-emerald-400' : (t.status === 'lost' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400')}`}>
                        {t.status === 'pending' ? '⏳ 待賽事完畢' : t.status === 'won' ? '✅ 贏 (已派彩)' : '❌ 輸 (無派彩)'}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono font-bold">日期: {t.date}</span>
                    </div>

                    {/* Legs */}
                    <div className="space-y-1.5">
                      {t.legs.map((leg, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="text-gray-400 font-bold">[{leg.league}]</span>{' '}
                          <span className="text-gray-300 font-semibold">{getTeamNameCn(leg.awayTeam, leg.league)} @ {getTeamNameCn(leg.homeTeam, leg.league)}</span>{' '}
                          <span className="text-white font-extrabold">- 下注：{translateSelection(leg.selection, leg.league)} @ {leg.odds.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs text-right w-full md:w-auto justify-between md:justify-end border-t border-white/5 md:border-none pt-3 md:pt-0">
                    <div className="space-y-1">
                      <div className="text-gray-500 font-bold">投注額 / 預估報酬</div>
                      <div className="font-mono text-gray-300 font-extrabold">
                        {t.stake} 元 / <span className="text-emerald-400 font-black">+{t.estimatedPayout} 元</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-gray-500 font-bold">實際回報 / 淨損益</div>
                      <div className="font-mono font-extrabold">
                        <span className="text-white">{t.actualPayout} 元</span> /{' '}
                        <span className={t.profitLoss >= 0 ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                          {t.profitLoss >= 0 ? `+${t.profitLoss}` : t.profitLoss} 元
                        </span>
                      </div>
                    </div>

                    {t.status === 'pending' && (
                      <button
                        onClick={() => {
                          setSettlingTicketId(t.id);
                          setSettlementResult('won');
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-gray-950 font-black py-1.5 px-3 rounded-lg text-[10px]"
                      >
                        結算注單
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* 結算彈窗 Modal */}
      {settlingTicketId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#0b0f19] border border-amber-500/20 rounded-3xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-extrabold text-amber-400">📝 結算注單: {settlingTicketId}</h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1">派彩結果</label>
                <select
                  value={settlementResult}
                  onChange={(e: any) => setSettlementResult(e.target.value)}
                  className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="won">贏 (中獎派彩)</option>
                  <option value="lost">輸 (未中獎)</option>
                  <option value="void">廢單 (本金退還)</option>
                  <option value="cancelled">取消投注</option>
                </select>
              </div>

              {settlementResult === 'won' && (
                <div>
                  <label className="text-xs text-gray-400 font-bold block mb-1">實際回收派彩彩金 (元)</label>
                  <input
                    type="number"
                    placeholder="例如 350"
                    value={actualPayout}
                    onChange={(e) => setActualPayout(e.target.value)}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-3">
              <button
                onClick={() => setSettlingTicketId(null)}
                className="flex-1 bg-gray-950 hover:bg-gray-900 border border-white/10 text-gray-400 font-extrabold py-2 rounded-xl text-xs"
              >
                取消
              </button>
              <button
                onClick={handleSettleSubmit}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-gray-950 font-black py-2 rounded-xl text-xs shadow-lg"
              >
                確認提交
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-amber-500/30 text-white px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-50 animate-fade-in">
          <span>🔔</span> {toastMsg}
        </div>
      )}
    </div>
  );
}
