'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  getHistoricalAccuracy, 
  getBacktestGamesForDate, 
  getStaticLastDate,
  setDynamicGames,
  BacktestTrendPoint,
  RawHistoricalGame 
} from '../../lib/prediction/backtest';
import { translatePlayerName } from '@/lib/sports-api/team-translations';

interface TrendChartProps {
  /** 外部觸發重新抓取的 key，變動時會重新 sync */
  refreshKey?: number;
  /** 同步狀態回報 (供父組件顯示 toast) */
  onSyncStatus?: (status: { syncing: boolean; message: string; newGames: number }) => void;
}

export default function TrendChart({ refreshKey = 0, onSyncStatus }: TrendChartProps) {
  const [leagueFilter, setLeagueFilter] = useState<'ALL' | 'NBA' | 'MLB'>('ALL');
  const [chartType, setChartType] = useState<'winner' | 'ou' | 'totalScore'>('winner');
  const [smoothMode, setSmoothMode] = useState<boolean>(true);
  const [timeRange, setTimeRange] = useState<'7' | '30' | 'ALL'>('ALL');
  const [dataVersion, setDataVersion] = useState(0); // 用於觸發 useMemo 重算
  
  // Model visibility toggles
  const [visibleModels, setVisibleModels] = useState({
    SportsAI: true,
    EloRating: true,
    MonteCarlo: true,
    MetaModel: true,
    MetaModelV2: true
  });
  
  // Interactive Hovering & Selecting States
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const hasSynced = useRef(false);
  const [backwardSyncing, setBackwardSyncing] = useState(false);
  const [backwardProgress, setBackwardProgress] = useState('');

  // ─── 漸進式歷史背景同步 ───
  const syncBackwardGames = useCallback(async () => {
    // 鎖定起點日期為 2026 年開打時間 2026-01-01
    const TARGET_START_DATE = '2026-01-01';
    
    // 讀取當前已經向後同步到的最早日期，如果不存在，預設從 static JSON 的 2026-04-01 開始往回抓
    const earliest = localStorage.getItem('backtest_earliest_synced') || '2026-04-01';
    
    if (earliest <= TARGET_START_DATE) {
      setBackwardProgress('✅ 所有歷史數據 (自 2026/01/01 起) 已加載完成');
      return;
    }

    setBackwardSyncing(true);
    setBackwardProgress(`⏳ 正在同步歷史數據... (目前進度: ${earliest})`);

    try {
      // 計算本批次的 beforeDate 和 afterDate
      const endDate = new Date(earliest);
      endDate.setDate(endDate.getDate() - 1); // 不包含 earliest 當天，因為 earliest 已經抓過了
      const beforeStr = endDate.toISOString().split('T')[0];

      const afterDate = new Date(endDate);
      afterDate.setDate(afterDate.getDate() - 31); // 往前推約一個月
      let afterStr = afterDate.toISOString().split('T')[0];

      // 限制起點
      if (afterStr < '2025-12-31') {
        afterStr = '2025-12-31'; // 這樣 API +1 天後就是 2026-01-01
      }

      if (beforeStr < TARGET_START_DATE) {
        setBackwardSyncing(false);
        setBackwardProgress('✅ 所有歷史數據 (自 2026/01/01 起) 已加載完成');
        localStorage.setItem('backtest_earliest_synced', TARGET_START_DATE);
        return;
      }

      console.log(`Syncing backward: after=${afterStr}, before=${beforeStr}`);
      const res = await fetch(`/api/backtest/sync?after=${afterStr}&before=${beforeStr}&_t=${Date.now()}`);
      if (!res.ok) {
        throw new Error('Sync backward API response not OK');
      }

      const json = await res.json();
      if (json.success && json.data) {
        // 合併並更新
        let existingDynamic: RawHistoricalGame[] = [];
        try {
          const cached = localStorage.getItem('backtest_dynamic_games');
          if (cached) existingDynamic = JSON.parse(cached);
        } catch { /* ignore */ }

        const existingIds = new Set(existingDynamic.map(g => g.id));
        const newGames = json.data.filter((g: RawHistoricalGame) => !existingIds.has(g.id));
        const merged = [...existingDynamic, ...newGames];

        try {
          localStorage.setItem('backtest_dynamic_games', JSON.stringify(merged));
        } catch { /* localStorage full */ }

        // 注入引擎並重算
        setDynamicGames(merged);
        setDataVersion(v => v + 1);

        // 更新 earliest 同步日期為本批次的起點
        const savedEarliest = afterStr === '2025-12-31' ? TARGET_START_DATE : new Date(new Date(afterStr).getTime() + 24*60*60*1000).toISOString().split('T')[0];
        
        localStorage.setItem('backtest_earliest_synced', savedEarliest);
        
        if (savedEarliest <= TARGET_START_DATE) {
          setBackwardSyncing(false);
          setBackwardProgress('✅ 所有歷史數據 (自 2026/01/01 起) 已加載完成');
        } else {
          setBackwardProgress(`⏳ 正在同步歷史數據... (目前進度: ${savedEarliest})`);
          // 2 秒後遞迴抓取下一批次
          setTimeout(() => {
            syncBackwardGames();
          }, 2000);
        }
      } else {
        throw new Error('Sync backward failed or invalid data');
      }
    } catch (err) {
      console.error('Failed in backward sync batch:', err);
      setBackwardSyncing(false);
      setBackwardProgress('⚠️ 部分歷史數據同步中斷，請重試。');
    }
  }, []);

  // ─── 自動同步最新完賽數據 ───
  const syncLatestGames = useCallback(async () => {
    try {
      onSyncStatus?.({ syncing: true, message: '正在從 MLB/NBA 官方 API 抓取最新完賽數據...', newGames: 0 });
      
      const lastDate = getStaticLastDate();
      const res = await fetch(`/api/backtest/sync?after=${lastDate}&_t=${Date.now()}`);
      
      if (!res.ok) {
        onSyncStatus?.({ syncing: false, message: '❌ 同步失敗：API 回應異常', newGames: 0 });
        return;
      }
      
      const json = await res.json();
      
      if (json.success && json.data && json.data.length > 0) {
        // 也嘗試從 localStorage 讀取先前已快取的動態數據
        let existingDynamic: RawHistoricalGame[] = [];
        try {
          const cached = localStorage.getItem('backtest_dynamic_games');
          if (cached) existingDynamic = JSON.parse(cached);
        } catch { /* ignore */ }
        
        // 合併去重
        const existingIds = new Set(existingDynamic.map(g => g.id));
        const newGames = json.data.filter((g: RawHistoricalGame) => !existingIds.has(g.id));
        const merged = [...existingDynamic, ...newGames];
        
        // 寫入 localStorage 持久化
        try {
          localStorage.setItem('backtest_dynamic_games', JSON.stringify(merged));
        } catch { /* localStorage full */ }
        
        // 注入回測引擎
        setDynamicGames(merged);
        setDataVersion(v => v + 1);
        
        onSyncStatus?.({ 
          syncing: false, 
          message: `✅ 成功同步 ${json.meta.datesChecked} 天、共 ${newGames.length} 場新完賽數據${json.meta.remainingDates > 0 ? ` (尚有 ${json.meta.remainingDates} 天待同步)` : ''}`, 
          newGames: newGames.length 
        });

        // 最新數據同步完成後，開始背景向後同步歷史數據
        syncBackwardGames();
      } else {
        // 沒有新數據，但仍嘗試載入 localStorage 的快取
        try {
          const cached = localStorage.getItem('backtest_dynamic_games');
          if (cached) {
            const parsedGames = JSON.parse(cached);
            if (parsedGames.length > 0) {
              setDynamicGames(parsedGames);
              setDataVersion(v => v + 1);
            }
          }
        } catch { /* ignore */ }
        
        onSyncStatus?.({ syncing: false, message: '📊 回測數據已是最新狀態', newGames: 0 });

        // 開始背景向後同步歷史數據
        syncBackwardGames();
      }
    } catch (err) {
      // 網路錯誤時嘗試載入 localStorage 快取
      try {
        const cached = localStorage.getItem('backtest_dynamic_games');
        if (cached) {
          const parsedGames = JSON.parse(cached);
          if (parsedGames.length > 0) {
            setDynamicGames(parsedGames);
            setDataVersion(v => v + 1);
          }
        }
      } catch { /* ignore */ }
      
      onSyncStatus?.({ syncing: false, message: '⚠️ 同步失敗，使用本地快取數據', newGames: 0 });
      console.error('Backtest sync error:', err);
    }
  }, [onSyncStatus]);

  // 首次掛載時自動同步 + 載入 localStorage 快取
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;
    
    // Fetch latest meta-model weights
    fetch(`/api/predictions/weights?_t=${Date.now()}`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.weights) {
          localStorage.setItem('meta_model_weights', JSON.stringify(json.weights));
          setDataVersion(v => v + 1);
        }
      })
      .catch(() => {});

    // 先載入 localStorage 快取 (立即顯示)
    try {
      const cached = localStorage.getItem('backtest_dynamic_games');
      if (cached) {
        const parsedGames = JSON.parse(cached);
        if (parsedGames.length > 0) {
          setDynamicGames(parsedGames);
          setDataVersion(v => v + 1);
        }
      }
    } catch { /* ignore */ }
    
    // 背景同步最新數據
    syncLatestGames();
  }, [syncLatestGames]);

  // 外部 refreshKey 變動時重新同步
  useEffect(() => {
    if (refreshKey > 0) {
      syncLatestGames();
    }
  }, [refreshKey, syncLatestGames]);

  // Fetch deterministic backtest data based on filters
  const fullData = useMemo(() => {
    return getHistoricalAccuracy(leagueFilter, smoothMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueFilter, smoothMode, dataVersion]);

  // Filter based on Time Range
  const chartData = useMemo(() => {
    if (timeRange === '7') {
      return fullData.slice(-7);
    } else if (timeRange === '30') {
      return fullData.slice(-30);
    }
    return fullData;
  }, [fullData, timeRange]);

  // Fallback active date index (default to latest date)
  const activeIndex = useMemo(() => {
    if (chartData.length === 0) return 0;
    if (selectedIndex !== null && selectedIndex < chartData.length) {
      return selectedIndex;
    }
    if (hoverIndex !== null && hoverIndex < chartData.length) {
      return hoverIndex;
    }
    return chartData.length - 1;
  }, [chartData, selectedIndex, hoverIndex]);

  const activeDate = useMemo(() => {
    return chartData[activeIndex]?.date || new Date().toISOString().split('T')[0];
  }, [chartData, activeIndex]);

  // Fetch identical games and model predictions for the selected date
  const activeGames = useMemo(() => {
    return getBacktestGamesForDate(activeDate, leagueFilter);
  }, [activeDate, leagueFilter]);

  // Chart layout dimensions (SVG space coordinates)
  const width = 800;
  const height = 340;
  const paddingLeft = 55;
  const paddingRight = 30;
  const paddingTop = 30;
  const paddingBottom = 40;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  // Range of Accuracy (0% to 100%)
  const minAcc = 0;
  const maxAcc = 100;

  // Helper coordinate conversion functions
  const getX = (index: number) => {
    if (chartData.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (chartData.length - 1)) * chartWidth;
  };
  
  const getY = (acc: number) => {
    const clamped = Math.max(minAcc, Math.min(maxAcc, acc));
    return paddingTop + chartHeight - ((clamped - minAcc) / (maxAcc - minAcc)) * chartHeight;
  };

  // Generate Path Strings for SVG
  const generatePaths = (modelKey: 'SportsAI' | 'EloRating' | 'MonteCarlo' | 'MetaModel' | 'MetaModelV2') => {
    if (chartData.length === 0) return { strokePath: '', areaPath: '' };
    
    let strokePath = '';
    let areaPath = '';
    
    chartData.forEach((d, idx) => {
      const acc = d[modelKey][chartType];
      const x = getX(idx);
      const y = getY(acc);
      
      if (idx === 0) {
        strokePath += `M ${x} ${y}`;
        areaPath += `M ${x} ${getY(minAcc)} L ${x} ${y}`;
      } else {
        strokePath += ` L ${x} ${y}`;
        areaPath += ` L ${x} ${y}`;
      }
      
      if (idx === chartData.length - 1) {
        areaPath += ` L ${x} ${getY(minAcc)} Z`;
      }
    });
    
    return { strokePath, areaPath };
  };

  const sportsPaths = useMemo(() => generatePaths('SportsAI'), [chartData, chartType]);
  const eloPaths = useMemo(() => generatePaths('EloRating'), [chartData, chartType]);
  const mcPaths = useMemo(() => generatePaths('MonteCarlo'), [chartData, chartType]);
  const metaPaths = useMemo(() => generatePaths('MetaModel'), [chartData, chartType]);
  const metaV2Paths = useMemo(() => generatePaths('MetaModelV2'), [chartData, chartType]);

  // Handle SVG Mouse Move to calculate hover index
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!containerRef.current || chartData.length === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const xMouse = e.clientX - rect.left;
    const yMouse = e.clientY - rect.top;
    
    // Scale from actual browser pixels to SVG coordinate space
    const xSvg = (xMouse / rect.width) * width;
    
    // Find closest data point
    let closestIdx = 0;
    let minDistance = Infinity;
    
    chartData.forEach((_, idx) => {
      const xPoint = getX(idx);
      const dist = Math.abs(xPoint - xSvg);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });

    setHoverIndex(closestIdx);
    setHoverPos({ x: xMouse, y: yMouse });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const handleChartClick = () => {
    if (hoverIndex !== null) {
      setSelectedIndex(hoverIndex);
    }
  };

  const hoverData = hoverIndex !== null ? chartData[hoverIndex] : null;

  return (
    <div className="w-full flex flex-col gap-6" ref={containerRef}>
      
      {/* ─── 歷史數據同步狀態 ─── */}
      {backwardProgress && (
        <div className="flex items-center gap-2 text-xs font-mono font-bold px-5 py-2.5 rounded-2xl bg-white/[0.02] border border-white/5 text-gray-400">
          <span className={`w-2 h-2 rounded-full ${backwardSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
          <span>{backwardProgress}</span>
        </div>
      )}
      
      {/* ─── Chart Control Header ─── */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 bg-white/[0.02] border border-white/5 rounded-3xl p-5 backdrop-blur-md">
        
        {/* Toggle Chart Type & Time Interval */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5 shadow-inner">
            <button
              onClick={() => { setChartType('winner'); setHoverIndex(null); setSelectedIndex(null); }}
              className={`px-4 py-2 rounded-lg font-black text-xs transition-all ${chartType === 'winner' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              🎯 獨贏勝負走勢
            </button>
            <button
              onClick={() => { setChartType('ou'); setHoverIndex(null); setSelectedIndex(null); }}
              className={`px-4 py-2 rounded-lg font-black text-xs transition-all ${chartType === 'ou' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              🎲 大小分分界走勢
            </button>
            <button
              onClick={() => { setChartType('totalScore'); setHoverIndex(null); setSelectedIndex(null); }}
              className={`px-4 py-2 rounded-lg font-black text-xs transition-all ${chartType === 'totalScore' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              📊 總得分精準度 (±1.5分)
            </button>
          </div>

          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5 shadow-inner">
            {[
              { id: 'ALL', name: '全部 (自 2026/01/01 起)' },
              { id: '30', name: '最近30天' },
              { id: '7', name: '最近7天' }
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => { setTimeRange(r.id as 'ALL' | '30' | '7'); setHoverIndex(null); setSelectedIndex(null); }}
                className={`px-3.5 py-2 rounded-lg font-black text-xs transition-all ${timeRange === r.id ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        {/* League and Smooth Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5 shadow-inner">
            {[
              { id: 'ALL', name: '綜合聯賽' },
              { id: 'NBA', name: '🏀 NBA 職籃' },
              { id: 'MLB', name: '⚾ MLB 職棒' }
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => { setLeagueFilter(l.id as 'ALL' | 'NBA' | 'MLB'); setHoverIndex(null); setSelectedIndex(null); }}
                className={`px-3.5 py-2 rounded-lg font-black text-xs transition-all ${leagueFilter === l.id ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                {l.name}
              </button>
            ))}
          </div>

          {/* Smooth Toggle */}
          <button
            onClick={() => { setSmoothMode(!smoothMode); setHoverIndex(null); setSelectedIndex(null); }}
            className={`px-4 py-2 rounded-xl border font-black text-xs transition-all flex items-center gap-1.5 ${
              smoothMode 
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]' 
                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            {smoothMode ? '7日平滑曲線開' : '每日波動模式'}
          </button>
        </div>

      </div>

      {/* ─── Chart Display Area ─── */}
      <div className="relative w-full glass-panel rounded-3xl p-4 md:p-6 border border-white/5 shadow-2xl flex flex-col items-center">
        
        {/* Model Toggles / Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 mb-4 w-full">
          {[
            { id: 'MetaModelV2' as const, name: '👑 Meta 2.0 增強元模型 (v2.0)', color: 'border-amber-500 text-amber-400 bg-amber-500/10' },
            { id: 'MetaModel' as const, name: '👑 Meta 堆疊元模型 (v1.0)', color: 'border-pink-500 text-pink-400 bg-pink-500/10' },
            { id: 'SportsAI' as const, name: 'SportsAI 迴歸 (v4.2)', color: 'border-purple-500 text-purple-400 bg-purple-500/10' },
            { id: 'EloRating' as const, name: 'Elo 戰力比對 (v1.8)', color: 'border-orange-500 text-orange-400 bg-orange-500/10' },
            { id: 'MonteCarlo' as const, name: 'Monte Carlo 模擬 (v2.5)', color: 'border-cyan-400 text-cyan-400 bg-cyan-400/10' }
          ].map((model) => (
            <button
              key={model.id}
              onClick={() => setVisibleModels(prev => ({ ...prev, [model.id]: !prev[model.id] }))}
              className={`px-3.5 py-1.5 rounded-full border text-[11px] font-black tracking-wide transition-all duration-300 flex items-center gap-2 ${
                visibleModels[model.id]
                  ? model.color + ' border-opacity-50'
                  : 'bg-white/5 text-gray-500 border-white/5 border-opacity-10 line-through'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                !visibleModels[model.id] ? 'bg-gray-700' : (
                  model.id === 'MetaModelV2' ? 'bg-amber-500' : (
                    model.id === 'MetaModel' ? 'bg-pink-500' : (
                      model.id === 'SportsAI' ? 'bg-purple-500' : (model.id === 'EloRating' ? 'bg-orange-500' : 'bg-cyan-400')
                    )
                  )
                )
              }`} />
              {model.name}
            </button>
          ))}
        </div>

        {/* SVG Render Container */}
        <div className="relative w-full overflow-hidden flex items-center justify-center">
          <svg 
            viewBox={`0 0 ${width} ${height}`} 
            className="w-full h-auto select-none overflow-visible cursor-pointer"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleChartClick}
          >
            {/* Defs for gradients & shadow glows */}
            <defs>
              <linearGradient id="metaV2Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="metaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ec4899" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="sportsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
              
              {/* Glowing filters */}
              <filter id="glow-metaV2" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-meta" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-sports" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-elo" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-mc" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ─── 1. Background Coordinate Grid ─── */}
            {[0, 20, 40, 60, 80, 100].map((yVal) => {
              const y = getY(yVal);
              return (
                <g key={yVal} className="font-mono text-[9px] font-black text-gray-600">
                  <line 
                    x1={paddingLeft} 
                    y1={y} 
                    x2={width - paddingRight} 
                    y2={y} 
                    stroke="rgba(255,255,255,0.04)" 
                    strokeWidth="1"
                    strokeDasharray={yVal === 60 ? '0' : '3 3'}
                  />
                  {/* Highlight standard 60% confidence baseline */}
                  {yVal === 60 && (
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="rgba(168,85,247,0.2)"
                      strokeWidth="1.5"
                    />
                  )}
                  <text 
                    x={paddingLeft - 8} 
                    y={y + 3} 
                    textAnchor="end" 
                    fill={yVal === 60 ? '#a855f7' : 'rgba(255,255,255,0.3)'}
                    className={yVal === 60 ? 'fill-purple-400 font-bold' : ''}
                  >
                    {yVal}%
                  </text>
                </g>
              );
            })}

            {/* X-axis Ticks (Dates) */}
            {chartData.map((d, idx) => {
              const divisor = Math.max(1, Math.round(chartData.length / 5));
              const shouldShowText = idx === 0 || idx === chartData.length - 1 || idx % divisor === 0;
              const x = getX(idx);
              
              return (
                <g key={idx} className="font-mono text-[9px] font-black">
                  {shouldShowText && (
                    <>
                      <line 
                        x1={x} 
                        y1={getY(minAcc)} 
                        x2={x} 
                        y2={getY(minAcc) + 4} 
                        stroke="rgba(255,255,255,0.2)" 
                        strokeWidth="1" 
                      />
                      <text 
                        x={x} 
                        y={getY(minAcc) + 16} 
                        textAnchor="middle" 
                        fill="rgba(255,255,255,0.3)"
                      >
                        {d.date.substring(5)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            
            {/* Draw Axis Lines */}
            <line 
              x1={paddingLeft} 
              y1={getY(minAcc)} 
              x2={width - paddingRight} 
              y2={getY(minAcc)} 
              stroke="rgba(255,255,255,0.15)" 
              strokeWidth="1.5" 
            />
            <line 
              x1={paddingLeft} 
              y1={getY(minAcc)} 
              x2={paddingLeft} 
              y2={getY(maxAcc) - 10} 
              stroke="rgba(255,255,255,0.15)" 
              strokeWidth="1.5" 
            />

            {/* ─── 2. Colored Area Fills under lines ─── */}
            {visibleModels.MetaModelV2 && metaV2Paths.areaPath && (
              <path d={metaV2Paths.areaPath} fill="url(#metaV2Grad)" />
            )}
            {visibleModels.MetaModel && metaPaths.areaPath && (
              <path d={metaPaths.areaPath} fill="url(#metaGrad)" />
            )}
            {visibleModels.MonteCarlo && mcPaths.areaPath && (
              <path d={mcPaths.areaPath} fill="url(#mcGrad)" />
            )}
            {visibleModels.EloRating && eloPaths.areaPath && (
              <path d={eloPaths.areaPath} fill="url(#eloGrad)" />
            )}
            {visibleModels.SportsAI && sportsPaths.areaPath && (
              <path d={sportsPaths.areaPath} fill="url(#sportsGrad)" />
            )}

            {/* ─── 3. Main Accuracy Curves ─── */}
            {visibleModels.MetaModelV2 && metaV2Paths.strokePath && (
              <path 
                d={metaV2Paths.strokePath} 
                fill="none" 
                stroke="#f59e0b" 
                strokeWidth="3.5" 
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow-metaV2)"
              />
            )}
            
            {visibleModels.MetaModel && metaPaths.strokePath && (
              <path 
                d={metaPaths.strokePath} 
                fill="none" 
                stroke="#ec4899" 
                strokeWidth="3.5" 
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow-meta)"
              />
            )}
            
            {visibleModels.MonteCarlo && mcPaths.strokePath && (
              <path 
                d={mcPaths.strokePath} 
                fill="none" 
                stroke="#06b6d4" 
                strokeWidth="2.5" 
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow-mc)"
              />
            )}
            
            {visibleModels.EloRating && eloPaths.strokePath && (
              <path 
                d={eloPaths.strokePath} 
                fill="none" 
                stroke="#f97316" 
                strokeWidth="2.5" 
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow-elo)"
              />
            )}
            
            {visibleModels.SportsAI && sportsPaths.strokePath && (
              <path 
                d={sportsPaths.strokePath} 
                fill="none" 
                stroke="#a855f7" 
                strokeWidth="3" 
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow-sports)"
              />
            )}

            {/* ─── 4. Interactive Hover Positioning Line & Highlight Circles ─── */}
            {hoverIndex !== null && hoverData && (
              <g>
                {/* Vertical Cursor Guide */}
                <line 
                  x1={getX(hoverIndex)} 
                  y1={getY(maxAcc) - 10} 
                  x2={getX(hoverIndex)} 
                  y2={getY(minAcc)} 
                  stroke="rgba(168,85,247,0.2)" 
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />

                {/* Highlight Point circles for each visible model */}
                {visibleModels.MetaModelV2 && (
                  <circle 
                    cx={getX(hoverIndex)} 
                    cy={getY(hoverData.MetaModelV2[chartType])} 
                    r="6" 
                    fill="#030712"
                    stroke="#f59e0b" 
                    strokeWidth="3" 
                  />
                )}

                {visibleModels.MetaModel && (
                  <circle 
                    cx={getX(hoverIndex)} 
                    cy={getY(hoverData.MetaModel[chartType])} 
                    r="6" 
                    fill="#030712"
                    stroke="#ec4899" 
                    strokeWidth="3" 
                  />
                )}
                
                {visibleModels.MonteCarlo && (
                  <circle 
                    cx={getX(hoverIndex)} 
                    cy={getY(hoverData.MonteCarlo[chartType])} 
                    r="5" 
                    fill="#030712"
                    stroke="#06b6d4" 
                    strokeWidth="3" 
                  />
                )}
                
                {visibleModels.EloRating && (
                  <circle 
                    cx={getX(hoverIndex)} 
                    cy={getY(hoverData.EloRating[chartType])} 
                    r="5" 
                    fill="#030712"
                    stroke="#f97316" 
                    strokeWidth="3" 
                  />
                )}
                
                {visibleModels.SportsAI && (
                  <circle 
                    cx={getX(hoverIndex)} 
                    cy={getY(hoverData.SportsAI[chartType])} 
                    r="6" 
                    fill="#030712"
                    stroke="#a855f7" 
                    strokeWidth="3" 
                  />
                )}
              </g>
            )}

            {/* Anchor permanent selected index line */}
            {selectedIndex !== null && selectedIndex < chartData.length && (
              <line 
                x1={getX(selectedIndex)} 
                y1={getY(maxAcc) - 10} 
                x2={getX(selectedIndex)} 
                y2={getY(minAcc)} 
                stroke="rgba(6,182,212,0.4)" 
                strokeWidth="1.5"
              />
            )}
          </svg>
        </div>

        {/* ─── 5. Cyberpunk Floating Tooltip (Dynamic Absolute Pos) ─── */}
        {hoverIndex !== null && hoverData && (
          <div 
            className="absolute z-30 pointer-events-none p-4 rounded-2xl glass-panel-ai border border-purple-500/30 text-white font-sans max-w-[240px] animate-fade-in shadow-2xl flex flex-col gap-2.5 font-bold"
            style={{
              left: `${Math.min(containerRef.current ? containerRef.current.clientWidth - 260 : 400, hoverPos.x + 15)}px`,
              top: `${Math.min(260, Math.max(10, hoverPos.y - 120))}px`
            }}
          >
            <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
              <span className="text-xs font-black text-white">{hoverData.date}</span>
              <span className="text-[9px] font-mono bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20 font-bold shrink-0">
                對位 {hoverData.gameCount} 場 (點擊鎖定)
              </span>
            </div>

            <div className="flex flex-col gap-1.5 font-sans font-bold">
              {visibleModels.MetaModelV2 && (
                <div className="flex justify-between items-center text-xs text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Meta 2.0 增強元模型:
                  </span>
                  <div className="text-right">
                    <span className="font-black font-mono text-amber-200">{hoverData.MetaModelV2[chartType]}%</span>
                    <span className="text-[9px] text-gray-500 font-mono font-bold ml-1">({chartType === 'winner' ? hoverData.MetaModelV2.winnerStats : chartType === 'ou' ? hoverData.MetaModelV2.ouStats : hoverData.MetaModelV2.totalScoreStats}局)</span>
                  </div>
                </div>
              )}

              {visibleModels.MetaModel && (
                <div className="flex justify-between items-center text-xs text-pink-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0" />
                    Meta 集成元模型:
                  </span>
                  <div className="text-right">
                    <span className="font-black font-mono text-pink-200">{hoverData.MetaModel[chartType]}%</span>
                    <span className="text-[9px] text-gray-500 font-mono font-bold ml-1">({chartType === 'winner' ? hoverData.MetaModel.winnerStats : chartType === 'ou' ? hoverData.MetaModel.ouStats : hoverData.MetaModel.totalScoreStats}局)</span>
                  </div>
                </div>
              )}

              {visibleModels.SportsAI && (
                <div className="flex justify-between items-center text-xs text-purple-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                    SportsAI 迴歸模型:
                  </span>
                  <div className="text-right">
                    <span className="font-black font-mono text-purple-200">{hoverData.SportsAI[chartType]}%</span>
                    <span className="text-[9px] text-gray-500 font-mono font-bold ml-1">({chartType === 'winner' ? hoverData.SportsAI.winnerStats : chartType === 'ou' ? hoverData.SportsAI.ouStats : hoverData.SportsAI.totalScoreStats}局)</span>
                  </div>
                </div>
              )}

              {visibleModels.EloRating && (
                <div className="flex justify-between items-center text-xs text-orange-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                    Elo 戰力比對模型:
                  </span>
                  <div className="text-right">
                    <span className="font-black font-mono text-orange-200">{hoverData.EloRating[chartType]}%</span>
                    <span className="text-[9px] text-gray-500 font-mono font-bold ml-1">({chartType === 'winner' ? hoverData.EloRating.winnerStats : chartType === 'ou' ? hoverData.EloRating.ouStats : hoverData.EloRating.totalScoreStats}局)</span>
                  </div>
                </div>
              )}

              {visibleModels.MonteCarlo && (
                <div className="flex justify-between items-center text-xs text-cyan-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                    Monte Carlo 模擬模型:
                  </span>
                  <div className="text-right">
                    <span className="font-black font-mono text-cyan-200">{hoverData.MonteCarlo[chartType]}%</span>
                    <span className="text-[9px] text-gray-500 font-mono font-bold ml-1">({chartType === 'winner' ? hoverData.MonteCarlo.winnerStats : chartType === 'ou' ? hoverData.MonteCarlo.ouStats : hoverData.MonteCarlo.totalScoreStats}局)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ─── 6. Quant Matches Predictions Details Panel (NEW FEATURE) ─── */}
      <div className="w-full flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <h3 className="text-lg font-black text-white flex items-center gap-2 font-sans tracking-wide">
            <span className="w-1.5 h-5 rounded bg-gradient-to-b from-cyan-400 to-blue-500" />
            📊 歷史賽事預測量化對位明細 
            <span className="text-sm font-mono text-purple-400 font-black bg-purple-500/10 px-2.5 py-0.5 rounded border border-purple-500/20">
              {activeDate}
            </span>
          </h3>
          <span className="text-[10px] font-mono text-gray-500 font-bold hidden sm:inline-block">
            * 點選上方走勢折線圖上的任意日期即可動態切換明細
          </span>
        </div>

        {activeGames.length === 0 ? (
          <div className="glass-panel rounded-3xl border border-white/5 p-8 text-center text-gray-500 text-xs font-sans font-bold">
            該日期無符合條件的比賽數據記錄
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 w-full">
            {activeGames.map((game) => {
              const totalScore = game.homeScore + game.awayScore;
              
              return (
                <div 
                  key={game.id}
                  className="glass-panel rounded-3xl border border-white/5 hover:border-purple-500/20 overflow-hidden transition-all duration-300 p-6 flex flex-col gap-5 relative group shadow-lg"
                >
                  {/* Decorative faint background badge */}
                  <div className="absolute top-2 right-4 text-[9px] font-mono text-gray-700 tracking-widest font-black uppercase pointer-events-none group-hover:text-purple-500/10 transition-colors">
                    {game.league} 賽事日誌
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
                        game.league === 'NBA' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      }`}>
                        {game.league === 'NBA' ? '🏀 NBA 職籃' : '⚾ MLB 職棒'}
                      </span>
                      <span className="text-[11px] font-mono text-gray-400 font-bold">
                        賽事編號: {game.id.split('_').slice(-2).join('-')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs md:text-sm">
                      <span className="text-gray-300 font-bold">
                        客隊 <span className="text-white font-black">{game.awayTeam.nameCn}</span> ({game.awayTeam.code})
                      </span>
                      <span className="text-lg font-black font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">
                        {game.awayScore} : {game.homeScore}
                      </span>
                      <span className="text-gray-300 font-bold">
                        主隊 <span className="text-white font-black">{game.homeTeam.nameCn}</span> ({game.homeTeam.code})
                      </span>
                    </div>

                    <div className="text-right text-[10px] font-mono font-bold text-gray-400 flex flex-col items-end gap-0.5">
                      <div>總得分: <span className="text-white font-black font-mono text-xs">{totalScore} 分</span></div>
                      <div className="text-pink-400 font-sans font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                        <span>預估共識平均:</span>
                        <span className="text-pink-300 font-black font-mono text-xs">
                          {((game.SportsAI.ouT + game.EloRating.ouT + game.MonteCarlo.ouT + game.MetaModel.ouT + game.MetaModelV2.ouT) / 5).toFixed(1)} 分
                        </span>
                      </div>
                    </div>
                  </div>

                  {game.league === 'MLB' && game.pitchers && (game.pitchers.home || game.pitchers.away) && (
                    <div className="grid grid-cols-2 gap-4 bg-white/[0.01] border border-white/5 rounded-2xl p-3 text-xs">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-bold block">客隊先發投手 (Away Pitcher):</span>
                        {game.pitchers.away ? (
                          <div className="mt-0.5">
                            <span className="font-black text-gray-200">{translatePlayerName(game.pitchers.away.name)}</span>
                            <span className="text-cyan-400 font-mono font-bold ml-1.5">(ERA: {game.pitchers.away.era.toFixed(2)} | 優勢: {game.pitchers.away.advantageFactor}x)</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">先發未定 (TBD)</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 font-bold block">主隊先發投手 (Home Pitcher):</span>
                        {game.pitchers.home ? (
                          <div className="mt-0.5">
                            <span className="font-black text-gray-200">{translatePlayerName(game.pitchers.home.name)}</span>
                            <span className="text-cyan-400 font-mono font-bold ml-1.5">(ERA: {game.pitchers.home.era.toFixed(2)} | 優勢: {game.pitchers.home.advantageFactor}x)</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">先發未定 (TBD)</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { id: 'MetaModelV2', name: '👑 Meta 2.0 增強元模型', data: game.MetaModelV2, stroke: 'border-amber-500/20 focus:border-amber-500/50 bg-amber-500/5', color: 'text-amber-300', dot: 'bg-amber-500' },
                      { id: 'MetaModel', name: '👑 Meta 堆疊元模型', data: game.MetaModel, stroke: 'border-pink-500/20 focus:border-pink-500/50 bg-pink-500/5', color: 'text-pink-300', dot: 'bg-pink-500' },
                      { id: 'SportsAI', name: '🤖 SportsAI 迴歸', data: game.SportsAI, stroke: 'border-purple-500/20 focus:border-purple-500/50 bg-purple-500/5', color: 'text-purple-300', dot: 'bg-purple-500' },
                      { id: 'EloRating', name: '📈 Elo 戰力比對', data: game.EloRating, stroke: 'border-orange-500/20 focus:border-orange-500/50 bg-orange-500/5', color: 'text-orange-300', dot: 'bg-orange-500' },
                      { id: 'MonteCarlo', name: '🎲 Monte Carlo 模擬', data: game.MonteCarlo, stroke: 'border-cyan-400/20 focus:border-cyan-400/50 bg-cyan-400/5', color: 'text-cyan-300', dot: 'bg-cyan-400' }
                    ].map((m) => {
                      if (!visibleModels[m.id as 'SportsAI' | 'EloRating' | 'MonteCarlo' | 'MetaModel' | 'MetaModelV2']) return null;
                      
                      const predictedWinnerName = m.data.winner === 'home' ? game.homeTeam.nameCn : game.awayTeam.nameCn;
                      const winnerAccBadge = m.data.winnerCorrect
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20';
                        
                      const ouAccBadge = m.data.ouCorrect
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20';
 
                      return (
                        <div 
                          key={m.id}
                          className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${m.stroke} hover:scale-[1.01] transition-transform duration-200`}
                        >
                          <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                            <span className="text-[11px] font-black text-white flex items-center gap-1.5 font-sans">
                              <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                              {m.name}
                            </span>
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${winnerAccBadge}`}>
                              信心度 {m.data.confidence.toFixed(0)}%
                            </span>
                          </div>
 
                          <div className="flex flex-col gap-2 font-sans text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-bold">🎯 獨贏預估勝方:</span>
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className={m.color}>{predictedWinnerName} 獲勝</span>
                                <span className={`text-[8.5px] font-mono px-1 rounded-sm ${winnerAccBadge}`}>
                                  {m.data.winnerCorrect ? '命中' : '未中'}
                                </span>
                              </div>
                            </div>
 
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-bold">🎲 大小分預測:</span>
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className="text-purple-300 font-mono">
                                  {m.data.ouPick === 'Over' ? '大分' : '小分'} (O/U {m.data.ouT})
                                </span>
                                <span className={`text-[8.5px] font-mono px-1 rounded-sm ${ouAccBadge}`}>
                                  {m.data.ouCorrect ? '命中' : '未中'}
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 font-bold">📊 總得分預估:</span>
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className="text-indigo-300 font-mono">
                                  {m.data.predictedTotal} 分
                                </span>
                                <span className={`text-[8.5px] font-mono px-1 rounded-sm ${
                                  m.data.totalScoreCorrect
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}>
                                  {m.data.totalScoreCorrect ? '命中 (±1.5)' : '偏差'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
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
  );
}
