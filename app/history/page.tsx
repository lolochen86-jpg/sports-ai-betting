'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import realGames from '../../lib/prediction/real_historical_games.json';
import { getBacktestGamesForDate } from '../../lib/prediction/backtest';
import type { RawHistoricalGame } from '../../lib/prediction/backtest';

// ─── Team Chinese Name Mapping ───
const MLB_TEAM_CN: Record<string, string> = {
  ARI: '響尾蛇', ATL: '勇士', BAL: '金鶯', BOS: '紅襪', CHC: '小熊',
  CWS: '白襪', CIN: '紅人', CLE: '守護者', COL: '洛磯', DET: '老虎',
  HOU: '太空人', KC: '皇家', LAA: '天使', LAD: '道奇', MIA: '馬林魚',
  MIL: '釀酒人', MIN: '雙城', NYM: '大都會', NYY: '洋基', OAK: '運動家',
  PHI: '費城人', PIT: '海盜', SD: '教士', SDP: '教士', SF: '巨人', SFG: '巨人', SEA: '水手',
  STL: '紅雀', TB: '光芒', TEX: '遊騎兵', TOR: '藍鳥', WSH: '國民'
};

const NBA_TEAM_CN: Record<string, string> = {
  ATL: '老鷹', BKN: '籃網', BOS: '塞爾提克', CHA: '黃蜂', CHI: '公牛',
  CLE: '騎士', DAL: '獨行俠', DEN: '金塊', DET: '活塞', GS: '勇士',
  GSW: '勇士', IND: '溜馬', LAC: '快艇', LAL: '湖人',
  MEM: '灰熊', MIA: '熱火', MIL: '公鹿', MIN: '灰狼',
  NOP: '鵜鶘', NO: '鵜鶘', NY: '尼克', NYK: '尼克', OKC: '雷霆',
  ORL: '魔術', PHX: '太陽', PHI: '76人', POR: '拓荒者',
  SAC: '國王', SA: '馬刺', SAS: '馬刺', TOR: '暴龍', UTA: '爵士', UTAH: '爵士',
  WAS: '巫師', WSH: '巫師'
};

// Resolve team Chinese name with fallback
const getTeamCn = (code: string, league: 'NBA' | 'MLB', englishName: string): string => {
  const dict = league === 'NBA' ? NBA_TEAM_CN : MLB_TEAM_CN;
  if (dict[code]) return dict[code];
  // Try partial match on english name
  const nameLower = englishName.toLowerCase();
  const knownMap: Record<string, string> = {
    'diamondbacks': '響尾蛇', 'braves': '勇士', 'orioles': '金鶯', 'red sox': '紅襪',
    'cubs': '小熊', 'white sox': '白襪', 'reds': '紅人', 'guardians': '守護者',
    'rockies': '洛磯', 'tigers': '老虎', 'astros': '太空人', 'royals': '皇家',
    'angels': '天使', 'dodgers': '道奇', 'marlins': '馬林魚', 'brewers': '釀酒人',
    'twins': '雙城', 'mets': '大都會', 'yankees': '洋基', 'athletics': '運動家',
    'phillies': '費城人', 'pirates': '海盜', 'padres': '教士', 'giants': '巨人',
    'mariners': '水手', 'cardinals': '紅雀', 'rays': '光芒', 'rangers': '遊騎兵',
    'blue jays': '藍鳥', 'nationals': '國民',
    'hawks': '老鷹', 'nets': '籃網', 'celtics': '塞爾提克', 'hornets': '黃蜂',
    'bulls': '公牛', 'cavaliers': '騎士', 'mavericks': '獨行俠', 'nuggets': '金塊',
    'pistons': '活塞', 'warriors': '勇士', 'pacers': '溜馬', 'clippers': '快艇',
    'lakers': '湖人', 'grizzlies': '灰熊', 'heat': '熱火', 'bucks': '公鹿',
    'timberwolves': '灰狼', 'pelicans': '鵜鶘', 'knicks': '尼克', 'thunder': '雷霆',
    'magic': '魔術', 'suns': '太陽', '76ers': '76人', 'trail blazers': '拓荒者',
    'kings': '國王', 'spurs': '馬刺', 'raptors': '暴龍', 'jazz': '爵士',
    'wizards': '巫師',
  };
  for (const [key, val] of Object.entries(knownMap)) {
    if (nameLower.includes(key)) return val;
  }
  return englishName;
};

// Team gradient colors for badges
const getTeamGradient = (code: string): string => {
  const gradients: Record<string, string> = {
    // MLB
    NYY: 'from-slate-800 to-indigo-950', LAD: 'from-blue-700 to-sky-500', HOU: 'from-orange-500 to-blue-900',
    ATL: 'from-red-800 to-blue-900', BOS: 'from-red-700 to-blue-900', CHC: 'from-blue-700 to-red-600',
    STL: 'from-red-700 to-slate-800', SF: 'from-orange-600 to-slate-900', TEX: 'from-blue-800 to-red-700',
    SD: 'from-amber-700 to-slate-900', PHI: 'from-red-700 to-blue-800', BAL: 'from-orange-500 to-slate-900',
    TB: 'from-blue-600 to-indigo-900', SEA: 'from-teal-700 to-slate-900', MIN: 'from-red-800 to-blue-900',
    DET: 'from-blue-800 to-orange-600', CLE: 'from-red-700 to-blue-900', MIL: 'from-amber-800 to-blue-900',
    KC: 'from-blue-700 to-sky-400', CIN: 'from-red-700 to-slate-900', PIT: 'from-amber-500 to-slate-900',
    ARI: 'from-red-800 to-teal-800', COL: 'from-purple-800 to-slate-900', MIA: 'from-cyan-500 to-red-500',
    LAA: 'from-red-700 to-slate-900', TOR: 'from-blue-700 to-slate-900', NYM: 'from-blue-700 to-orange-500',
    CWS: 'from-slate-800 to-slate-950', OAK: 'from-green-800 to-amber-600', WSH: 'from-red-700 to-blue-900',
    // NBA
    GSW: 'from-blue-600 to-yellow-500', LAL: 'from-purple-800 to-yellow-600', MIA2: 'from-red-700 to-yellow-600',
    BOS2: 'from-green-700 to-emerald-500', MIL2: 'from-emerald-800 to-amber-700', PHI2: 'from-blue-700 to-red-600',
    CHI: 'from-red-700 to-slate-900', CLE2: 'from-red-800 to-amber-700', DAL: 'from-blue-700 to-slate-900',
    DEN: 'from-blue-800 to-amber-600', IND: 'from-blue-800 to-amber-500', LAC: 'from-red-600 to-blue-700',
    MEM: 'from-blue-700 to-cyan-500', NYK: 'from-blue-700 to-orange-500', OKC: 'from-blue-700 to-orange-500',
    PHX: 'from-purple-700 to-orange-500', POR: 'from-red-700 to-slate-900', SAC: 'from-purple-700 to-slate-900',
    SAS: 'from-slate-700 to-slate-900', UTA: 'from-blue-800 to-amber-600',
  };
  return gradients[code] || 'from-slate-700 to-slate-900';
};

// Day of week in Chinese
const getDayOfWeek = (dateStr: string): string => {
  const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const d = new Date(dateStr + 'T12:00:00');
  return days[d.getDay()];
};

const formatDateCn = (dateStr: string): string => {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

// SVG Icons
const CpuIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="16" height="16" x="4" y="4" rx="2" />
    <rect width="6" height="6" x="9" y="9" rx="1" />
    <path d="M9 1v3" /><path d="M15 1v3" /><path d="M9 20v3" /><path d="M15 20v3" />
    <path d="M20 9h3" /><path d="M20 15h3" /><path d="M1 9h3" /><path d="M1 15h3" />
  </svg>
);

interface RawGame {
  id: string;
  league: 'NBA' | 'MLB';
  date: string;
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
}

export default function HistoryPage() {
  const [leagueFilter, setLeagueFilter] = useState<'ALL' | 'NBA' | 'MLB'>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [dynamicGames, setDynGames] = useState<RawGame[]>([]);

  // 載入 localStorage 中的動態快取 + 背景同步
  useEffect(() => {
    // 1. 立即載入 localStorage 快取
    try {
      const cached = localStorage.getItem('backtest_dynamic_games');
      if (cached) {
        const parsed = JSON.parse(cached) as RawGame[];
        if (parsed.length > 0) setDynGames(parsed);
      }
    } catch { /* ignore */ }
    
    // Fetch latest meta-model weights for client-side predictions
    fetch(`/api/predictions/weights?_t=${Date.now()}`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.weights) {
          localStorage.setItem('meta_model_weights', JSON.stringify(json.weights));
        }
      })
      .catch(() => { /* silently fail */ });

    const lastStaticDate = (realGames as RawGame[]).reduce((max, g) => g.date > max ? g.date : max, '2026-04-01');
    fetch(`/api/backtest/sync?after=${lastStaticDate}&_t=${Date.now()}`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data && json.data.length > 0) {
          let existing: RawGame[] = [];
          try {
            const c = localStorage.getItem('backtest_dynamic_games');
            if (c) existing = JSON.parse(c);
          } catch { /* ignore */ }
          
          const ids = new Set(existing.map((g: RawGame) => g.id));
          const newOnes = (json.data as RawGame[]).filter(g => !ids.has(g.id));
          const merged = [...existing, ...newOnes];
          
          try { localStorage.setItem('backtest_dynamic_games', JSON.stringify(merged)); } catch { /* full */ }
          setDynGames(merged);
        }
      })
      .catch(() => { /* silently fail */ });
  }, []);

  // Get all games (static + dynamic) and sort by date descending
  const allGames = useMemo(() => {
    const staticData = realGames as RawGame[];
    const existingIds = new Set(staticData.map(g => g.id));
    const merged = [...staticData];
    for (const g of dynamicGames) {
      if (!existingIds.has(g.id)) {
        merged.push(g);
        existingIds.add(g.id);
      }
    }
    merged.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.id.localeCompare(b.id);
    });
    return merged;
  }, [dynamicGames]);

  // Get unique team codes for filter dropdown
  const teamOptions = useMemo(() => {
    const teams = new Map<string, { code: string; nameCn: string; league: string }>();
    allGames.forEach(g => {
      if (!teams.has(g.homeCode)) {
        teams.set(g.homeCode, { code: g.homeCode, nameCn: getTeamCn(g.homeCode, g.league, g.homeName), league: g.league });
      }
      if (!teams.has(g.awayCode)) {
        teams.set(g.awayCode, { code: g.awayCode, nameCn: getTeamCn(g.awayCode, g.league, g.awayName), league: g.league });
      }
    });
    return Array.from(teams.values()).sort((a, b) => {
      if (a.league !== b.league) return a.league.localeCompare(b.league);
      return a.code.localeCompare(b.code);
    });
  }, [allGames]);

  // Filter games
  const filteredGames = useMemo(() => {
    return allGames.filter(g => {
      if (g.date < '2026-01-01') return false;
      if (leagueFilter !== 'ALL' && g.league !== leagueFilter) return false;
      if (teamFilter !== 'ALL' && g.homeCode !== teamFilter && g.awayCode !== teamFilter) return false;
      return true;
    });
  }, [allGames, leagueFilter, teamFilter]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, RawGame[]>();
    filteredGames.forEach(g => {
      if (!map.has(g.date)) map.set(g.date, []);
      map.get(g.date)!.push(g);
    });
    return Array.from(map.entries());
  }, [filteredGames]);

  // Get AI prediction for expanded game
  const getAIPrediction = (game: RawGame) => {
    const details = getBacktestGamesForDate(game.date, game.league);
    return details.find(d => d.id === game.id);
  };

  return (
    <div className="flex-1 w-full min-h-screen bg-[#030712] cyber-grid relative pb-20">
      {/* Decorative Neon Background Glows */}
      <div className="absolute top-[-200px] left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[100px] right-1/4 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none" />

      {/* 1. Navbar */}
      <nav className="sticky top-0 z-40 w-full glass-panel border-b border-white/5 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform">
              <CpuIcon className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-sans font-black text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-300 to-blue-400">
                SPORTS.AI
              </span>
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                賽事記錄
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8 font-bold text-sm text-gray-300">
            <Link href="/" className="hover:text-purple-400 transition-colors">決策看盤中心</Link>
            <Link href="/backtest" className="hover:text-purple-400 transition-colors">歷史量化回測</Link>
            <span className="text-white border-b-2 border-emerald-500 pb-1">完賽記錄簿</span>
            <Link href="/share" className="hover:text-purple-400 transition-colors">📸 戰報字卡</Link>
            <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black transition-colors">🎰 運彩下注</Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-mono font-black text-emerald-400">共 {filteredGames.length} 場記錄</span>
          </div>
        </div>
        {/* Mobile Navigation Links */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto whitespace-nowrap pt-3 mt-3 border-t border-white/5 text-xs scrollbar-none font-bold text-gray-300">
          <Link href="/" className="hover:text-purple-400 shrink-0">決策看盤</Link>
          <Link href="/backtest" className="hover:text-purple-400 shrink-0">量化回測</Link>
          <span className="text-white border-b-2 border-purple-500 pb-0.5 shrink-0">完賽記錄</span>
          <Link href="/share" className="hover:text-purple-400 shrink-0">📸 戰報字卡</Link>
          <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black shrink-0">🎰 下注</Link>
        </div>
      </nav>

      {/* 2. Page Header */}
      <header className="max-w-7xl mx-auto px-6 pt-10 pb-6 text-center relative">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 mb-5 backdrop-blur-sm">
          <span className="text-xs text-emerald-300 font-mono font-bold tracking-wider uppercase">
            📋 已完賽對局歷史記錄簿
          </span>
        </div>

        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.1] mb-3 text-white">
          歷史完賽記錄總覽
        </h1>

        <p className="max-w-2xl mx-auto text-gray-300 text-sm leading-relaxed mb-6 font-sans font-semibold">
          自 2026/01/01 起所有 NBA 與 MLB 已完賽賽事完整記錄。點擊任意場次可展開查看 AI 預測命中情況。
        </p>

        {/* Action Widgets */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-5xl mx-auto">
          <Link
            href="/"
            className="px-5 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-200 font-black text-xs border border-white/10 hover:border-purple-500/30 transition-all flex items-center gap-2 font-sans"
          >
            <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            返回看盤中心
          </Link>

          {/* League Filter */}
          <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5 shadow-inner">
            {[
              { id: 'ALL', name: '全部聯賽' },
              { id: 'NBA', name: '🏀 NBA' },
              { id: 'MLB', name: '⚾ MLB' }
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => { setLeagueFilter(l.id as 'ALL' | 'NBA' | 'MLB'); setTeamFilter('ALL'); }}
                className={`px-4 py-2 rounded-lg font-black text-xs transition-all ${leagueFilter === l.id ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
              >
                {l.name}
              </button>
            ))}
          </div>

          {/* Team Filter */}
          <div className="relative">
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-2 pr-8 text-xs font-black text-gray-200 cursor-pointer hover:border-purple-500/30 transition-all focus:outline-none focus:border-purple-500/40"
            >
              <option value="ALL">🔍 全部隊伍</option>
              {teamOptions
                .filter(t => leagueFilter === 'ALL' || t.league === leagueFilter)
                .map(t => (
                  <option key={t.code} value={t.code}>
                    {t.league === 'NBA' ? '🏀' : '⚾'} {t.nameCn} ({t.code})
                  </option>
                ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </header>

      {/* 3. Games List */}
      <main className="max-w-5xl mx-auto px-6 py-4">
        {groupedByDate.length === 0 ? (
          <div className="glass-panel rounded-3xl border border-white/5 p-12 text-center text-gray-500 text-sm font-sans font-bold">
            沒有符合條件的完賽記錄
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groupedByDate.map(([date, games]) => (
              <div key={date} className="flex flex-col gap-2">
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 backdrop-blur-sm">
                    <span className="text-sm font-black text-white font-sans">{formatDateCn(date)}</span>
                    <span className="text-xs font-bold text-purple-400 font-mono">{getDayOfWeek(date)}</span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  <span className="text-[10px] font-mono font-bold text-gray-500">{games.length} 場完賽</span>
                </div>

                {/* Game Cards */}
                <div className="flex flex-col gap-2">
                  {games.map((game) => {
                    const homeCn = getTeamCn(game.homeCode, game.league, game.homeName);
                    const awayCn = getTeamCn(game.awayCode, game.league, game.awayName);
                    const homeWon = game.homeScore > game.awayScore;
                    const isExpanded = expandedGameId === game.id;
                    const aiPred = isExpanded ? getAIPrediction(game) : null;
                    const isNBA = game.league === 'NBA';

                    return (
                      <div key={game.id} className="flex flex-col">
                        {/* Compact Game Row */}
                        <button
                          onClick={() => setExpandedGameId(isExpanded ? null : game.id)}
                          className={`w-full glass-panel rounded-2xl border transition-all duration-200 p-3 md:p-4 hover:border-purple-500/30 group cursor-pointer ${
                            isExpanded 
                              ? (isNBA ? 'border-orange-500/30 shadow-[0_0_15px_rgba(255,107,0,0.08)]' : 'border-cyan-500/30 shadow-[0_0_15px_rgba(0,240,255,0.08)]')
                              : 'border-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* League Badge */}
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider ${
                              isNBA ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            }`}>
                              {isNBA ? '🏀' : '⚾'}
                            </span>

                            {/* Away Team */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${getTeamGradient(game.awayCode)} flex items-center justify-center text-[9px] font-black text-white shrink-0 shadow-md`}>
                                {game.awayCode}
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <span className={`text-sm font-black truncate ${!homeWon ? 'text-white' : 'text-gray-400'}`}>{awayCn}</span>
                                <span className="text-[10px] font-mono text-gray-500 font-bold">客隊</span>
                              </div>
                            </div>

                            {/* Score */}
                            <div className="flex items-center gap-2 shrink-0 mx-2">
                              <span className={`text-xl font-black font-mono ${!homeWon ? 'text-emerald-400' : 'text-gray-400'}`}>
                                {game.awayScore}
                              </span>
                              <span className="text-gray-600 font-bold text-xs">:</span>
                              <span className={`text-xl font-black font-mono ${homeWon ? 'text-emerald-400' : 'text-gray-400'}`}>
                                {game.homeScore}
                              </span>
                            </div>

                            {/* Home Team */}
                            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                              <div className="flex flex-col items-end min-w-0">
                                <span className={`text-sm font-black truncate ${homeWon ? 'text-white' : 'text-gray-400'}`}>{homeCn}</span>
                                <span className="text-[10px] font-mono text-gray-500 font-bold">主隊</span>
                              </div>
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${getTeamGradient(game.homeCode)} flex items-center justify-center text-[9px] font-black text-white shrink-0 shadow-md`}>
                                {game.homeCode}
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div className="shrink-0 flex flex-col items-end gap-0.5 ml-2">
                              <span className="px-2 py-0.5 rounded bg-gray-500/20 text-gray-300 text-[9px] font-black">
                                終場
                              </span>
                              <span className="text-[9px] font-mono text-gray-500 font-bold">
                                總分 {game.homeScore + game.awayScore}
                              </span>
                            </div>

                            {/* Expand Arrow */}
                            <svg className={`w-4 h-4 text-gray-500 group-hover:text-purple-400 transition-all shrink-0 ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </button>

                        {/* Expanded AI Prediction Detail */}
                        {isExpanded && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-b-2xl -mt-1 p-4 md:p-5 animate-fade-in">
                            {aiPred ? (
                              <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                  <span className="text-xs font-black text-purple-400 font-sans">🤖 AI 預測回顧</span>
                                  <span className="text-[10px] font-mono text-gray-500 font-bold">
                                    實際: {!homeWon ? awayCn : homeCn} 勝 ({game.awayScore} : {game.homeScore})
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  {[
                                    { name: '👑 Meta 元模型', data: aiPred.MetaModel, color: 'border-pink-500/20 bg-pink-500/5', dot: 'bg-pink-500', textColor: 'text-pink-300' },
                                    { name: '🤖 SportsAI', data: aiPred.SportsAI, color: 'border-purple-500/20 bg-purple-500/5', dot: 'bg-purple-500', textColor: 'text-purple-300' },
                                    { name: '📈 Elo 戰力', data: aiPred.EloRating, color: 'border-orange-500/20 bg-orange-500/5', dot: 'bg-orange-500', textColor: 'text-orange-300' },
                                    { name: '🎲 Monte Carlo', data: aiPred.MonteCarlo, color: 'border-cyan-400/20 bg-cyan-400/5', dot: 'bg-cyan-400', textColor: 'text-cyan-300' },
                                  ].map((m) => {
                                    const predWinnerName = m.data.winner === 'home' ? homeCn : awayCn;
                                    return (
                                      <div key={m.name} className={`rounded-xl border p-3 ${m.color} flex flex-col gap-2`}>
                                        <div className="flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                                          <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                                          <span className="text-[10px] font-black text-white font-sans">{m.name}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                          <span className="text-gray-400 font-bold">獨贏:</span>
                                          <div className="flex items-center gap-1">
                                            <span className={m.textColor + ' font-bold'}>{predWinnerName}</span>
                                            <span className={`text-[8px] font-mono px-1 rounded ${m.data.winnerCorrect ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                              {m.data.winnerCorrect ? '✓命中' : '✗未中'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                          <span className="text-gray-400 font-bold">大小分:</span>
                                          <div className="flex items-center gap-1">
                                            <span className="text-gray-300 font-mono font-bold text-[10px]">
                                              {m.data.ouPick === 'Over' ? '大分' : '小分'}({m.data.ouPick === 'Over' ? '≥' : '<'}{m.data.ouT})
                                            </span>
                                            <span className={`text-[8px] font-mono px-1 rounded ${m.data.ouCorrect ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                              {m.data.ouCorrect ? '✓命中' : '✗未中'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-gray-500 text-xs font-sans font-bold py-4">
                                此場次無對應的 AI 預測回測數據
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
