'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TaiwanOdds, BetLeg, DailyBudget, StrategySettings, DEFAULT_STRATEGY } from '@/types/betting';
import { translateSelection, getTeamNameCn } from '@/lib/sports-api/team-translations';

export default function TicketBuilderPage() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [oddsList, setOddsList] = useState<TaiwanOdds[]>([]);
  const [budget, setBudget] = useState<DailyBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<StrategySettings>(DEFAULT_STRATEGY);

  // 購物車裡的選擇 (投注腳)
  const [selectedLegs, setSelectedLegs] = useState<BetLeg[]>([]);
  const [stake, setStake] = useState<number>(10);

  useEffect(() => {
    const local = localStorage.getItem('betting_strategy_settings');
    if (local) {
      const parsed = JSON.parse(local);
      setSettings(parsed);
      setStake(parsed.stakePerTicket);
    }
  }, []);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchOddsAndBudget = async () => {
    setLoading(true);
    try {
      const [oddsRes, budgetRes] = await Promise.all([
        fetch(`/api/betting/odds?date=${date}`),
        fetch(`/api/betting/budget?date=${date}`)
      ]);
      const [oddsJson, budgetJson] = await Promise.all([
        oddsRes.json(),
        budgetRes.json()
      ]);
      if (oddsJson.success) setOddsList(oddsJson.data || []);
      if (budgetJson.success) setBudget(budgetJson.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOddsAndBudget();
  }, [date]);

  // 點擊新增/移除腳
  const handleToggleLeg = (odd: TaiwanOdds) => {
    const isSelected = selectedLegs.some((l) => l.gameExternalId === odd.gameExternalId && l.selection === odd.selection && l.marketType === odd.marketType);

    if (isSelected) {
      setSelectedLegs((prev) => prev.filter((l) => !(l.gameExternalId === odd.gameExternalId && l.selection === odd.selection && l.marketType === odd.marketType)));
    } else {
      const isInternational = true;
      // 檢查是否重複同一場比賽
      const duplicateGame = selectedLegs.some((l) => l.gameExternalId === odd.gameExternalId);
      if (duplicateGame) {
        triggerToast('⚠️ 規則限制：一張注單同一場比賽不可重複過關！');
        return;
      }

      const maxLegs = settings.maxParlaySize || 12;
      if (selectedLegs.length >= maxLegs) {
        triggerToast(`⚠️ 過關限制：最高不可超過 ${maxLegs} 串過關！`);
        return;
      }

      setSelectedLegs((prev) => [
        ...prev,
        {
          gameExternalId: odd.gameExternalId,
          league: odd.league,
          homeTeam: odd.homeTeam,
          awayTeam: odd.awayTeam,
          gameDate: odd.gameDate,
          marketType: odd.marketType,
          selection: odd.selection,
          odds: odd.taiwanOdds,
          line: odd.line,
        },
      ]);
    }
  };

  // 計算組合賠率與預估獎金
  const parlayOdds = parseFloat(selectedLegs.reduce((acc, l) => acc * l.odds, 1).toFixed(2));
  const estimatedPayout = Math.round(stake * parlayOdds);

  // 即時校驗規則
  const checkErrors: string[] = [];
  if (selectedLegs.length === 0) {
    checkErrors.push('未選擇任何投注選項');
  }

  const isInternational = true;
  const minRequiredStake = 10;
  const modeText = '國際盤';

  if (stake < minRequiredStake) {
    checkErrors.push(`${modeText}規定：單張注單投注總金額至少需要 ${minRequiredStake} 元`);
  }
  if (stake % 10 !== 0) {
    checkErrors.push(`${modeText}規定：下注金額必須以 10 元為單位`);
  }
  if (budget && budget.remaining < stake) {
    checkErrors.push(`預算超額：今日賸餘預算為 ${budget.remaining} 元，低於下注額`);
  }
  if (budget && budget.ticketsUsed >= budget.maxTickets) {
    checkErrors.push(`限額超標：今日已下注 ${budget.ticketsUsed}/${budget.maxTickets} 張注單，配額已滿`);
  }

  const handleConfirmTicket = async () => {
    if (checkErrors.length > 0) {
      triggerToast(`❌ 無法建立注單: ${checkErrors[0]}`);
      return;
    }

    // Save ticket and update budget in localStorage first
    try {
      const localTicketsStr = localStorage.getItem('tickets');
      const localTickets = localTicketsStr ? JSON.parse(localTicketsStr) : [];
      const newTicket = {
        id: `ticket_${Date.now()}`,
        date: date,
        legs: selectedLegs.map((l) => ({ ...l, result: 'pending' })),
        stake,
        parlayOdds,
        estimatedPayout,
        status: 'pending',
        fromRecommendationId: null,
        actualPayout: 0,
        profitLoss: 0,
        createdAt: new Date().toISOString(),
      };
      localTickets.push(newTicket);
      localStorage.setItem('tickets', JSON.stringify(localTickets));

      // budget deduction
      if (budget) {
        const updated = {
          ...budget,
          spent: budget.spent + stake,
          remaining: Math.max(0, budget.remaining - stake),
          ticketsUsed: budget.ticketsUsed + 1
        };
        localStorage.setItem(`budget_${date}`, JSON.stringify(updated));
        setBudget(updated);
      }
    } catch (e) {
      console.error('Failed to save ticket locally:', e);
    }

    try {
      const res = await fetch('/api/betting/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legs: selectedLegs,
          stake,
          parlayOdds,
          estimatedPayout,
        }),
      });

      const json = await res.json();
      if (json.success) {
        triggerToast('🎉 注單組合成功並已扣除預算！請至運彩官網手動買單。');
        setSelectedLegs([]);
        fetchOddsAndBudget();
      } else {
        triggerToast(`❌ 投注失敗: ${json.error}`);
        setSelectedLegs([]);
        fetchOddsAndBudget();
      }
    } catch {
      triggerToast('❌ 伺服器連接錯誤');
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
              <span className="text-amber-400">注單組合器</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              🎫 國際盤注單組合器
            </h1>
            <p className="text-xs text-gray-400 mt-1">手動挑選各場次賠率，進行多關串關組合，並即時執行下注控管規則校驗</p>
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-gray-900 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none"
          />
        </div>

        {/* 雙欄布局：左邊選賠率，右邊購物車與規則 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 左欄: 可投注盤口 */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-panel rounded-3xl p-6 border border-white/5">
              <h2 className="text-lg font-extrabold text-amber-400 mb-4">📢 可投注盤口清單</h2>
              
              {loading ? (
                <div className="text-center py-12 text-gray-400 font-bold">載入中...</div>
              ) : oddsList.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-bold">
                  當前日期尚無匯入任何賠率。請先在「賠率匯入」頁面進行匯入。
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 分組 */}
                  {Array.from(new Set(oddsList.map(o => `${o.awayTeam} @ ${o.homeTeam}`))).map((gameLabel) => {
                    const list = oddsList.filter(o => `${o.awayTeam} @ ${o.homeTeam}` === gameLabel);
                    return (
                      <div key={gameLabel} className="bg-gray-950/40 border border-white/5 rounded-2xl p-5">
                        <span className="text-xs font-black text-amber-400 block mb-3">🏀⚾ {getTeamNameCn(list[0].awayTeam, list[0].league)} @ {getTeamNameCn(list[0].homeTeam, list[0].league)}</span>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {list.map((odd) => {
                            const isSelected = selectedLegs.some(
                              (l) =>
                                l.gameExternalId === odd.gameExternalId &&
                                l.selection === odd.selection &&
                                l.marketType === odd.marketType
                            );
                            return (
                              <button
                                key={odd.id}
                                onClick={() => handleToggleLeg(odd)}
                                className={`text-left p-3.5 rounded-xl border transition-all ${isSelected ? 'bg-amber-500 border-amber-400 text-gray-950 font-extrabold' : 'bg-gray-900/60 hover:bg-gray-900 border-white/5 text-gray-300 hover:text-white'}`}
                              >
                                <div className={`text-[9px] font-bold block mb-1 ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                                  {odd.marketType === 'moneyline' ? '獨贏' : odd.marketType === 'spread' ? '讓分' : odd.marketType === 'totals' ? '大小' : '最高得分局'}
                                </div>
                                <div className="text-xs font-black truncate">
                                  {translateSelection(odd.selection, odd.league)} {odd.line ? `(${odd.line})` : ''}
                                </div>
                                <div className={`text-xs font-mono font-black mt-1 ${isSelected ? 'text-gray-950' : 'text-amber-400'}`}>
                                  {odd.taiwanOdds.toFixed(2)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右欄: 注單購物車與規則 */}
          <div className="space-y-6">
            <div className="glass-panel-betting rounded-3xl p-6 border border-amber-500/10 flex flex-col justify-between h-full space-y-6">
              
              {/* 組合明細 */}
              <div>
                <h3 className="text-md font-extrabold text-amber-400 border-b border-white/5 pb-3">
                  🎫 串關投注組合 ({selectedLegs.length} 場)
                </h3>
                
                {selectedLegs.length === 0 ? (
                  <div className="text-center py-12 text-xs text-gray-500 font-bold">
                    點擊左側盤口，將選項加入注單
                  </div>
                ) : (
                  <div className="space-y-3 my-4 max-h-[300px] overflow-y-auto pr-1">
                    {selectedLegs.map((leg, idx) => (
                      <div key={idx} className="bg-gray-900/80 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-extrabold text-white">
                            {translateSelection(leg.selection, leg.league)} {leg.line ? `(${leg.line})` : ''}
                          </div>
                          <div className="text-[10px] text-gray-500 font-bold mt-0.5">
                            {getTeamNameCn(leg.awayTeam, leg.league)} @ {getTeamNameCn(leg.homeTeam, leg.league)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-amber-400 font-bold">{leg.odds.toFixed(2)}</span>
                          <button
                            onClick={() => setSelectedLegs(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-400 font-black text-sm px-1.5 py-0.5"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 預估收益計算與下注輸入 */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-gray-400">過關組合賠率:</span>
                  <span className="text-sm font-mono text-amber-400 font-black">
                    {selectedLegs.length > 0 ? parlayOdds.toFixed(2) : '1.00'} 倍
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 block">
                    投注金額 (最低 10 元，10 元單位)
                  </label>
                  <input
                    type="number"
                    step="10"
                    min={10}
                    value={stake}
                    onChange={(e) => setStake(parseInt(e.target.value) || 0)}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-bold bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3.5">
                  <span className="text-gray-400">預估回收獎金:</span>
                  <span className="text-sm font-mono text-emerald-400 font-black">
                    {selectedLegs.length > 0 ? estimatedPayout : '0'} 元
                  </span>
                </div>
              </div>

              {/* 規則校驗 */}
              <div className="space-y-2 pt-4 border-t border-white/5 text-[10px]">
                <span className="font-extrabold text-amber-400 block">
                  國際盤投注規則即時校驗：
                </span>
                {checkErrors.length > 0 ? (
                  <ul className="space-y-1">
                    {checkErrors.map((err, idx) => (
                      <li key={idx} className="text-red-400 font-bold flex items-center gap-1">
                        <span>❌</span> {err}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-emerald-400 font-bold flex items-center gap-1 text-xs">
                    <span>✅</span> 所有運彩與風控限制皆已通過，可以投注。
                  </div>
                )}
              </div>

              {/* 送出注單 */}
              <button
                onClick={handleConfirmTicket}
                disabled={checkErrors.length > 0}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-800 disabled:text-gray-500 text-gray-950 font-black py-3 px-4 rounded-xl text-xs transition-colors shadow-lg"
              >
                確認並加入歷史下注單
              </button>

            </div>
          </div>

        </div>

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
