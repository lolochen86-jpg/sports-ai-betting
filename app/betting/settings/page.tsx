'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { StrategySettings, DEFAULT_STRATEGY } from '@/types/betting';

export default function SettingsPage() {
  const [settings, setSettings] = useState<StrategySettings>(DEFAULT_STRATEGY);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/betting/budget?date=today'); // 簡化
        // 為了直接抓取 settings，我們直接讀取 localStorage 或讓 api 回傳
        // 由於 Next 端是用 dbFallback, 我們在 client 先以 localStorage 作為 settings 載入，
        // 並可以寫入 API 同步。
        const local = localStorage.getItem('betting_strategy_settings');
        if (local) {
          const parsed = JSON.parse(local);
          parsed.bookmakerMode = 'international'; // 強制鎖定為國際盤
          setSettings(parsed);
        } else {
          setSettings(DEFAULT_STRATEGY);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // 驗證權重總和為 1 (或接近 1)
    const weightsSum =
      settings.modelWeights.MetaModel +
      settings.modelWeights.SportsAI +
      settings.modelWeights.EloRating +
      settings.modelWeights.MonteCarlo;

    if (Math.abs(weightsSum - 1.0) > 0.01) {
      triggerToast('⚠️ 四項模型預測權重總和必須等於 100%！');
      return;
    }

    try {
      const updatedSettings = {
        ...settings,
        bookmakerMode: 'international' as const,
      };
      localStorage.setItem('betting_strategy_settings', JSON.stringify(updatedSettings));

      // 同步變更今日的預算配額
      const today = new Date().toISOString().split('T')[0];
      await fetch('/api/betting/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          totalBudget: updatedSettings.dailyBudget,
          maxTickets: updatedSettings.maxTicketsPerDay,
          stakePerTicket: updatedSettings.stakePerTicket,
          settings: updatedSettings,
        }),
      });

      triggerToast('🎉 策略參數與風控設定保存成功！');
    } catch {
      triggerToast('❌ 部分設定伺服器同步失敗，已儲存於本機。');
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
            <span className="text-amber-400">策略設定</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            ⚙️ 策略與風控參數設定
          </h1>
          <p className="text-xs text-gray-400 mt-1">自訂期望值閥值、模型加權比例及每日預算上限等量化指標</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 font-bold">載入中...</div>
        ) : (
          <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* 左欄：每日預算與風控閥值 */}
            <div className="glass-panel rounded-3xl p-6 border border-white/5 space-y-6">
              <h3 className="text-lg font-extrabold text-amber-400">🛡️ 每日預算與投注限額</h3>
              
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-bold block">下注盤口模式 (賠率/規則)</label>
                <div className="w-full bg-gray-900/40 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>國際盤 (固定：最低 10 元/張，一注 10 元)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-bold block">每日總投注預算 (元)</label>
                  <input
                    type="number"
                    value={settings.dailyBudget}
                    onChange={(e) => setSettings({ ...settings, dailyBudget: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-bold block">每日最大注單張數</label>
                  <input
                    type="number"
                    value={settings.maxTicketsPerDay}
                    onChange={(e) => setSettings({ ...settings, maxTicketsPerDay: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-bold block">單張注單投注額 (元)</label>
                  <input
                    type="number"
                    value={settings.stakePerTicket}
                    onChange={(e) => setSettings({ ...settings, stakePerTicket: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-bold block">偏好過關數 (串關數)</label>
                  <select
                    value={settings.preferredParlaySize}
                    onChange={(e) => setSettings({ ...settings, preferredParlaySize: parseInt(e.target.value) || 1 })}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    <option value={1}>單場推薦 (1串1)</option>
                    <option value={2}>2 串 1 過關</option>
                    <option value={3}>3 串 1 過關</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-white/5 pt-4">
                <h3 className="text-sm font-extrabold text-amber-400 mb-4">📈 期望值 (Edge) 推薦門檻</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 font-bold block">最低邊際期望值 (EV%) 門檻</label>
                    <input
                      type="number"
                      step="0.5"
                      value={settings.minExpectedValue}
                      onChange={(e) => setSettings({ ...settings, minExpectedValue: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none"
                    />
                    <span className="text-[10px] text-gray-500 font-bold">高於此正 EV% 系統才會推薦</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 font-bold block">最低綜合評估信心度 (%)</label>
                    <input
                      type="number"
                      value={settings.minConfidence}
                      onChange={(e) => setSettings({ ...settings, minConfidence: parseInt(e.target.value) || 0 })}
                      className="w-full bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 右欄：模型權重加權 */}
            <div className="glass-panel rounded-3xl p-6 border border-white/5 space-y-6">
              <div>
                <h3 className="text-lg font-extrabold text-amber-400">🤖 AI 模型預測權重分配</h3>
                <p className="text-xs text-gray-400 mt-1">設定不同元模型與獨立預測引擎在期望值計算時的占比權重。總和須為 100%。</p>
              </div>

              <div className="space-y-4">
                {/* MetaModel */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-white">元集成模型 (MetaModel)</span>
                    <span className="text-amber-400 font-mono">{(settings.modelWeights.MetaModel * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.modelWeights.MetaModel * 100}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) / 100;
                      setSettings({
                        ...settings,
                        modelWeights: { ...settings.modelWeights, MetaModel: val },
                      });
                    }}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                {/* SportsAI */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-white">大數據統計模型 (SportsAI)</span>
                    <span className="text-amber-400 font-mono">{(settings.modelWeights.SportsAI * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.modelWeights.SportsAI * 100}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) / 100;
                      setSettings({
                        ...settings,
                        modelWeights: { ...settings.modelWeights, SportsAI: val },
                      });
                    }}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                {/* EloRating */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-white">動態戰力積分模型 (EloRating)</span>
                    <span className="text-amber-400 font-mono">{(settings.modelWeights.EloRating * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.modelWeights.EloRating * 100}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) / 100;
                      setSettings({
                        ...settings,
                        modelWeights: { ...settings.modelWeights, EloRating: val },
                      });
                    }}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                {/* MonteCarlo */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-white">蒙地卡羅模擬模型 (MonteCarlo)</span>
                    <span className="text-amber-400 font-mono">{(settings.modelWeights.MonteCarlo * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={settings.modelWeights.MonteCarlo * 100}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) / 100;
                      setSettings({
                        ...settings,
                        modelWeights: { ...settings.modelWeights, MonteCarlo: val },
                      });
                    }}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 flex justify-between items-center text-xs font-bold text-gray-500">
                <span>合計權重值:</span>
                <span className={`font-mono ${(Math.abs(settings.modelWeights.MetaModel + settings.modelWeights.SportsAI + settings.modelWeights.EloRating + settings.modelWeights.MonteCarlo - 1.0) < 0.01) ? 'text-emerald-400' : 'text-red-400'}`}>
                  {Math.round((settings.modelWeights.MetaModel + settings.modelWeights.SportsAI + settings.modelWeights.EloRating + settings.modelWeights.MonteCarlo) * 100)}%
                </span>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-gray-950 font-black py-3 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-amber-500/10 mt-6"
              >
                保存參數與同步風控設定
              </button>
            </div>

          </form>
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
