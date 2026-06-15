'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TaiwanOdds, StrategySettings, DEFAULT_STRATEGY } from '@/types/betting';
import { findTeamCodeByName, getTeamNameCn } from '@/lib/sports-api/team-translations';

interface ParsedOcrGame {
  league: 'NBA' | 'MLB';
  gameNumber?: string;
  gameDate: string;
  homeTeam: string; // code
  awayTeam: string; // code
  homeOdds: number;
  awayOdds: number;
}

const OCR_TEAMS = [
  // MLB
  { code: 'AZ', league: 'MLB', names: ['響尾蛇', '亞利桑那', 'ARI', 'AZ'] },
  { code: 'ATL', league: 'MLB', names: ['勇士', '亞特蘭大勇士', 'ATL'] },
  { code: 'BAL', league: 'MLB', names: ['金鶯', '巴爾的摩金鶯', 'BAL'] },
  { code: 'BOS', league: 'MLB', names: ['紅襪', '波士頓紅襪', 'BOS'] },
  { code: 'CHC', league: 'MLB', names: ['小熊', '芝加哥小熊', 'CHC'] },
  { code: 'CWS', league: 'MLB', names: ['白襪', '芝加哥白襪', 'CWS'] },
  { code: 'CIN', league: 'MLB', names: ['紅人', '辛辛那提紅人', 'CIN'] },
  { code: 'CLE', league: 'MLB', names: ['守護者', '克里夫蘭守護者', '克里夫蘭乳老', 'CLE'] },
  { code: 'COL', league: 'MLB', names: ['洛磯', '科羅拉多洛磯', 'COL'] },
  { code: 'DET', league: 'MLB', names: ['老虎', '底特律老虎', 'DET'] },
  { code: 'HOU', league: 'MLB', names: ['太空人', '休士頓太空人', 'HOU'] },
  { code: 'KC', league: 'MLB', names: ['皇家', '堪薩斯皇家', 'KC'] },
  { code: 'LAA', league: 'MLB', names: ['天使', '洛杉磯天使', 'LAA'] },
  { code: 'LAD', league: 'MLB', names: ['道奇', '洛杉磯道奇', 'LAD'] },
  { code: 'MIA', league: 'MLB', names: ['馬林魚', '邁阿密馬林魚', 'MIA'] },
  { code: 'MIL', league: 'MLB', names: ['釀酒人', '密爾瓦基釀酒人', 'MIL'] },
  { code: 'MIN', league: 'MLB', names: ['雙城', '明尼蘇達雙城', 'MIN'] },
  { code: 'NYM', league: 'MLB', names: ['大都會', '紐約大都會', 'NYM'] },
  { code: 'NYY', league: 'MLB', names: ['洋基', '紐約洋基', 'NYY'] },
  { code: 'OAK', league: 'MLB', names: ['運動家', '奧克蘭運動家', 'OAK'] },
  { code: 'PHI', league: 'MLB', names: ['費城人', '費城費城人', 'PHI'] },
  { code: 'PIT', league: 'MLB', names: ['海盜', '匹茲堡海盜', 'PIT'] },
  { code: 'SD', league: 'MLB', names: ['教士', '聖地牙哥教士', 'SD'] },
  { code: 'SF', league: 'MLB', names: ['巨人', '舊金山巨人', 'SF'] },
  { code: 'SEA', league: 'MLB', names: ['水手', '西雅圖水手', 'SEA'] },
  { code: 'STL', league: 'MLB', names: ['紅雀', '聖路易紅雀', 'STL'] },
  { code: 'TB', league: 'MLB', names: ['光芒', '坦帕灣光芒', 'TB'] },
  { code: 'TEX', league: 'MLB', names: ['遊騎兵', '德州遊騎兵', 'TEX'] },
  { code: 'TOR', league: 'MLB', names: ['藍鳥', '多倫多藍鳥', 'TOR'] },
  { code: 'WSH', league: 'MLB', names: ['國民', '華盛頓國民', 'WSH', 'WAS'] },

  // NBA
  { code: 'LAL', league: 'NBA', names: ['湖人', '洛杉磯湖人', 'LAL'] },
  { code: 'LAC', league: 'NBA', names: ['快艇', '洛杉磯快艇', 'LAC'] },
  { code: 'GSW', league: 'NBA', names: ['勇士', '金州勇士', 'GSW', 'GS'] },
  { code: 'BOS', league: 'NBA', names: ['塞爾提克', '波士頓塞爾提克', 'BOS'] },
  { code: 'BKN', league: 'NBA', names: ['籃網', '布魯克林籃網', 'BKN', 'BRK'] },
  { code: 'CHI', league: 'NBA', names: ['公牛', '芝加哥公牛', 'CHI'] },
  { code: 'NYK', league: 'NBA', names: ['尼克', '紐約尼克', 'NYK', 'NY'] },
  { code: 'MIA', league: 'NBA', names: ['熱火', '邁阿密熱火', 'MIA'] },
  { code: 'PHX', league: 'NBA', names: ['太陽', '鳳凰城太陽', 'PHX', 'PHO'] },
  { code: 'PHI', league: 'NBA', names: ['76人', '費城76人', 'PHI'] },
  { code: 'DAL', league: 'NBA', names: ['獨行俠', '達拉斯獨行俠', '小牛', 'DAL'] },
  { code: 'DEN', league: 'NBA', names: ['金塊', '丹佛金塊', 'DEN'] },
  { code: 'HOU', league: 'NBA', names: ['火箭', '休士頓火箭', 'HOU'] },
  { code: 'IND', league: 'NBA', names: ['溜馬', '印第安納溜馬', 'IND'] },
  { code: 'MEM', league: 'NBA', names: ['灰熊', '曼菲斯灰熊', 'MEM'] },
  { code: 'MIL', league: 'NBA', names: ['公鹿', '密爾瓦基公鹿', 'MIL'] },
  { code: 'MIN', league: 'NBA', names: ['灰狼', '明尼蘇達灰狼', 'MIN'] },
  { code: 'NOP', league: 'NBA', names: ['鵜鶘', '紐奧良鵜鶘', 'NOP'] },
  { code: 'OKC', league: 'NBA', names: ['雷霆', '奧克拉荷馬雷霆', 'OKC'] },
  { code: 'ORL', league: 'NBA', names: ['魔術', '奧蘭多魔術', 'ORL'] },
  { code: 'POR', league: 'NBA', names: ['拓荒者', '波特蘭拓荒者', 'POR'] },
  { code: 'SAC', league: 'NBA', names: ['國王', '沙加緬度國王', 'SAC'] },
  { code: 'SAS', league: 'NBA', names: ['馬刺', '聖安東尼奧馬刺', 'SAS', 'SA'] },
  { code: 'TOR', league: 'NBA', names: ['暴龍', '多倫多暴龍', 'TOR'] },
  { code: 'UTA', league: 'NBA', names: ['爵士', '猶他爵士', 'UTA', 'UTAH'] },
  { code: 'WAS', league: 'NBA', names: ['巫師', '華盛頓巫師', 'WAS', 'WSH'] },
  { code: 'ATL', league: 'NBA', names: ['老鷹', '亞特蘭大老鷹', 'ATL'] },
  { code: 'CHA', league: 'NBA', names: ['黃蜂', '夏洛特黃蜂', 'CHA'] },
  { code: 'DET', league: 'NBA', names: ['活塞', '底特律活塞', 'DET'] }
];

const parseOcrDate = (blockText: string, defaultDateStr: string): string => {
  const defaultDate = new Date(defaultDateStr);
  let year = defaultDate.getFullYear();
  let month = defaultDate.getMonth() + 1;
  let day = defaultDate.getDate();

  const slashMatch = blockText.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slashMatch) {
    month = parseInt(slashMatch[1], 10);
    day = parseInt(slashMatch[2], 10);
  } else {
    const dayMatch = blockText.match(/(\d{1,2})日/);
    if (dayMatch) {
      day = parseInt(dayMatch[1], 10);
    }
  }

  const formatNum = (n: number) => String(n).padStart(2, '0');
  return `${year}-${formatNum(month)}-${formatNum(day)}`;
};

const parseOcrText = (text: string, defaultDate: string): ParsedOcrGame[] => {
  const blocks = text.split(/(?=\b\d{3}\b)/);
  const parsedGames: ParsedOcrGame[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    const numMatch = block.match(/^\b(\d{3})\b/);
    const gameNumber = numMatch ? numMatch[1] : undefined;

    const foundTeams: { code: string; league: 'NBA' | 'MLB'; index: number; name: string }[] = [];
    for (const team of OCR_TEAMS) {
      for (const name of team.names) {
        const idx = block.indexOf(name);
        if (idx !== -1) {
          foundTeams.push({
            code: team.code,
            league: team.league as any,
            index: idx,
            name: name
          });
          break;
        }
      }
    }

    foundTeams.sort((a, b) => a.index - b.index);

    if (foundTeams.length < 2) {
      continue;
    }

    const league = foundTeams[0].league;
    const awayTeam = foundTeams[0].code;
    const homeTeam = foundTeams[1].code;

    const oddsMatches: { value: number; index: number }[] = [];
    const oddsRegex = /\b\d\.\d{2}\b/g;
    let match;
    while ((match = oddsRegex.exec(block)) !== null) {
      oddsMatches.push({
        value: parseFloat(match[0]),
        index: match.index
      });
    }

    if (oddsMatches.length < 2) {
      continue;
    }

    const awayOdds = oddsMatches[0].value;
    const homeOdds = oddsMatches[1].value;

    const parsedDate = parseOcrDate(block, defaultDate);

    parsedGames.push({
      league,
      gameNumber,
      gameDate: parsedDate,
      awayTeam,
      homeTeam,
      awayOdds,
      homeOdds
    });
  }

  return parsedGames;
};

function findTeamInString(str: string, game: any): string | null {
  const homeCode = game.homeTeam.code;
  const awayCode = game.awayTeam.code;
  
  const homeTranslation = OCR_TEAMS.find(t => t.code === homeCode);
  if (homeTranslation) {
    for (const name of homeTranslation.names) {
      if (str.includes(name)) return homeCode;
    }
  }

  const awayTranslation = OCR_TEAMS.find(t => t.code === awayCode);
  if (awayTranslation) {
    for (const name of awayTranslation.names) {
      if (str.includes(name)) return awayCode;
    }
  }

  return null;
}

interface ParsedOddsItem {
  marketType: 'moneyline' | 'spread' | 'totals';
  selection: string;
  taiwanOdds: number;
  line: number | null;
}

interface TextParseResult {
  success: boolean;
  error?: string;
  game?: any;
  odds?: ParsedOddsItem[];
}

const parseCopiedText = (rawText: string, apiGames: any[], defaultDate: string): TextParseResult => {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { success: false, error: '貼上內容為空' };
  }

  const foundTeams: { code: string; league: 'NBA' | 'MLB'; name: string }[] = [];
  for (const team of OCR_TEAMS) {
    for (const name of team.names) {
      if (rawText.includes(name)) {
        foundTeams.push({
          code: team.code,
          league: team.league as any,
          name: name
        });
        break;
      }
    }
  }

  if (foundTeams.length < 2) {
    return { success: false, error: '未能識別出對戰隊伍，請確認內容包含正確隊伍名稱 (例如：紐約洋基)' };
  }

  const teamA = foundTeams[0].code;
  const teamB = foundTeams[1].code;
  const league = foundTeams[0].league;

  const matchedGame = apiGames.find(g => 
    g.league === league &&
    ((g.awayTeam.code === teamA && g.homeTeam.code === teamB) ||
     (g.awayTeam.code === teamB && g.homeTeam.code === teamA))
  );

  if (!matchedGame) {
    return { success: false, error: `找不到對應 ${teamA} vs ${teamB} 的今日賽程` };
  }

  const awayTeamCode = matchedGame.awayTeam.code;
  const homeTeamCode = matchedGame.homeTeam.code;

  let currentMarket: 'moneyline' | 'spread' | 'totals' | null = null;
  let spreadLine: number | null = null;
  let totalsLine: number | null = null;

  const resultOdds: ParsedOddsItem[] = [];

  let mlAwayOdds: number | null = null;
  let mlHomeOdds: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('不讓分') || line === '獨贏') {
      currentMarket = 'moneyline';
      continue;
    }

    if (line.startsWith('讓分')) {
      currentMarket = 'spread';
      const match = line.match(/讓分\s*([+-]?\d+\.?\d*)/);
      spreadLine = match ? Math.abs(parseFloat(match[1])) : null;
      continue;
    }

    if (line.includes('大小')) {
      currentMarket = 'totals';
      const match = line.match(/大小\s*(\d+\.?\d*)/);
      totalsLine = match ? parseFloat(match[1]) : null;
      continue;
    }

    if (currentMarket === 'moneyline') {
      const num = parseFloat(line);
      if (!isNaN(num) && num > 1.0) {
        if (mlAwayOdds === null) {
          mlAwayOdds = num;
        } else if (mlHomeOdds === null) {
          mlHomeOdds = num;
          resultOdds.push({
            marketType: 'moneyline',
            selection: 'away',
            taiwanOdds: mlAwayOdds,
            line: null
          });
          resultOdds.push({
            marketType: 'moneyline',
            selection: 'home',
            taiwanOdds: mlHomeOdds,
            line: null
          });
          mlAwayOdds = null;
          mlHomeOdds = null;
          currentMarket = null;
        }
      }
    }

    if (currentMarket === 'spread') {
      const isTeamLine = line.includes('+') || line.includes('-');
      if (isTeamLine) {
        const teamCodeInLine = findTeamInString(line, matchedGame);
        const lineValMatch = line.match(/[+-]\d+\.?\d*/);
        const lineVal = lineValMatch ? parseFloat(lineValMatch[0]) : null;
        if (spreadLine === null && lineVal !== null) {
          spreadLine = Math.abs(lineVal);
        }

        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const oddsNum = parseFloat(nextLine);
          if (!isNaN(oddsNum) && oddsNum > 1.0) {
            const isHome = teamCodeInLine === homeTeamCode;
            resultOdds.push({
              marketType: 'spread',
              selection: isHome ? 'home' : 'away',
              taiwanOdds: oddsNum,
              line: lineVal
            });
            i++;
          }
        }
      }
    }

    if (currentMarket === 'totals') {
      const isOver = line.startsWith('大');
      const isUnder = line.startsWith('小');
      if (isOver || isUnder) {
        const type = isOver ? 'over' : 'under';
        const lineMatch = line.match(/\d+\.?\d*/);
        const lineVal = lineMatch ? parseFloat(lineMatch[0]) : totalsLine;

        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const oddsNum = parseFloat(nextLine);
          if (!isNaN(oddsNum) && oddsNum > 1.0) {
            resultOdds.push({
              marketType: 'totals',
              selection: type,
              taiwanOdds: oddsNum,
              line: lineVal
            });
            i++;
          }
        }
      }
    }
  }

  return {
    success: true,
    game: matchedGame,
    odds: resultOdds
  };
};

export default function OddsImportPage() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [oddsList, setOddsList] = useState<TaiwanOdds[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGames, setLoadingGames] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<StrategySettings>(DEFAULT_STRATEGY);

  useEffect(() => {
    const local = localStorage.getItem('betting_strategy_settings');
    if (local) {
      setSettings(JSON.parse(local));
    }
  }, []);

  // 賽程資料與輸入狀態
  const [apiGames, setApiGames] = useState<any[]>([]);
  const [oddsInputs, setOddsInputs] = useState<Record<string, Record<string, string>>>({});

  // Tab control state
  const [activeTab, setActiveTab] = useState<'text' | 'csv' | 'ocr'>('text');

  // CSV paste State
  const [csvText, setCsvText] = useState('');

  // Copied text paste State
  const [copiedText, setCopiedText] = useState('');
  const [textParseResult, setTextParseResult] = useState<TextParseResult | null>(null);

  // OCR screenshot states
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<ParsedOcrGame[]>([]);

  // 監聽全局貼上事件，方便直接 Ctrl+V 貼上截圖
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageOcr(file);
            break;
          }
        }
      }
    };
    
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [date, apiGames]);

  const handleImageOcr = async (file: File) => {
    setOcrLoading(true);
    setOcrStatus('正在載入 OCR 辨識引擎...');
    try {
      const Tesseract = (await import('tesseract.js')).default;
      setOcrStatus('正在辨識圖片中，約需 10-15 秒...');
      
      const result = await Tesseract.recognize(
        file,
        'eng+chi_tra',
        {
          logger: (m) => {
            if (m.status === 'recognizing') {
              setOcrStatus(`正在解析圖片：${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );

      const text = result.data.text;
      console.log('OCR Output:', text);
      
      const parsedGames = parseOcrText(text, date);
      setOcrResults(parsedGames);
      if (parsedGames.length > 0) {
        setOcrStatus(`🎉 辨識完成！成功解析 ${parsedGames.length} 場賽事。`);
        triggerToast(`🎉 辨識完成，解析出 ${parsedGames.length} 場賽事！`);
      } else {
        setOcrStatus('⚠️ 辨識完成，但未能解析出任何符合格式的賠率。請確認截圖清晰且包含對戰名稱與獨贏賠率數字。');
        triggerToast('⚠️ 未能解析出賽事');
      }
    } catch (err: any) {
      console.error('OCR Error:', err);
      setOcrStatus(`❌ 辨識失敗: ${err.message || err}`);
      triggerToast('❌ 圖片辨識失敗，請重試');
    } finally {
      setOcrLoading(false);
    }
  };

  const getMatchedGame = (parsed: ParsedOcrGame) => {
    return apiGames.find(g => 
      g.league === parsed.league &&
      (g.awayTeam.code === parsed.awayTeam && g.homeTeam.code === parsed.homeTeam)
    );
  };

  const handleApplyOcrGame = (parsed: ParsedOcrGame) => {
    const matched = getMatchedGame(parsed);
    if (!matched) {
      triggerToast('⚠️ 找不到今日匹配的賽程');
      return;
    }
    
    const gameId = matched.externalId || `${matched.league}_${matched.homeTeam.code}_${matched.awayTeam.code}_${date}`;
    
    setOddsInputs(prev => ({
      ...prev,
      [gameId]: {
        ...prev[gameId],
        ml_home: String(parsed.homeOdds),
        ml_away: String(parsed.awayOdds)
      }
    }));
    
    triggerToast(`📥 已導入 [${matched.awayTeam.code} @ ${matched.homeTeam.code}] 賠率`);
  };

  const handleApplyAllOcrGames = () => {
    let count = 0;
    const updatedInputs = { ...oddsInputs };
    
    ocrResults.forEach(parsed => {
      const matched = getMatchedGame(parsed);
      if (matched) {
        const gameId = matched.externalId || `${matched.league}_${matched.homeTeam.code}_${matched.awayTeam.code}_${date}`;
        if (!updatedInputs[gameId]) {
          updatedInputs[gameId] = {};
        }
        updatedInputs[gameId] = {
          ...updatedInputs[gameId],
          ml_home: String(parsed.homeOdds),
          ml_away: String(parsed.awayOdds)
        };
        count++;
      }
    });
    
    if (count > 0) {
      setOddsInputs(updatedInputs);
      triggerToast(`🎉 成功自動導入 ${count} 場賽事賠率！`);
    } else {
      triggerToast('⚠️ 沒有可導入的賽事 (請確認日期與對戰是否相符)');
    }
  };

  const handleParseCopiedText = () => {
    if (!copiedText.trim()) {
      triggerToast('❌ 請輸入或貼上運彩複製文字');
      return;
    }
    const result = parseCopiedText(copiedText, apiGames, date);
    setTextParseResult(result);
    if (result.success && result.game && result.odds) {
      triggerToast(`🎉 成功解析出 [${result.game.awayTeam.code} @ ${result.game.homeTeam.code}] 的對戰！`);
    } else {
      triggerToast(`❌ 解析失敗: ${result.error}`);
    }
  };

  const handleApplyTextOdds = () => {
    if (!textParseResult || !textParseResult.success || !textParseResult.game || !textParseResult.odds) {
      triggerToast('❌ 沒有可導入的解析數據');
      return;
    }

    const game = textParseResult.game;
    const gameId = game.externalId || `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${date}`;
    
    const updatedInputs = { ...oddsInputs };
    if (!updatedInputs[gameId]) {
      updatedInputs[gameId] = {
        ml_home: '', ml_away: '',
        spread_line: '', spread_home: '', spread_away: '',
        total_line: '', total_over: '', total_under: '',
        highest_tie: '', highest_period: '', highest_period_name: game.league === 'NBA' ? '第四節' : '第5局'
      };
    }

    let count = 0;
    textParseResult.odds.forEach((o: any) => {
      if (o.marketType === 'moneyline') {
        if (o.selection === 'home') updatedInputs[gameId].ml_home = String(o.taiwanOdds);
        if (o.selection === 'away') updatedInputs[gameId].ml_away = String(o.taiwanOdds);
        count++;
      } else if (o.marketType === 'spread') {
        if (o.line !== null) {
          updatedInputs[gameId].spread_line = String(Math.abs(o.line));
        }
        if (o.selection === 'home') updatedInputs[gameId].spread_home = String(o.taiwanOdds);
        if (o.selection === 'away') updatedInputs[gameId].spread_away = String(o.taiwanOdds);
        count++;
      } else if (o.marketType === 'totals') {
        if (o.line !== null) {
          updatedInputs[gameId].total_line = String(o.line);
        }
        if (o.selection === 'over') updatedInputs[gameId].total_over = String(o.taiwanOdds);
        if (o.selection === 'under') updatedInputs[gameId].total_under = String(o.taiwanOdds);
        count++;
      }
    });

    setOddsInputs(updatedInputs);
    triggerToast(`🎉 成功導入 ${count} 筆賠率至 [${game.awayTeam.code} @ ${game.homeTeam.code}]！`);
    setCopiedText('');
    setTextParseResult(null);
  };

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 取得今日已匯入之運彩賠率
  const fetchOdds = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/betting/odds?date=${date}`);
      const json = await res.json();
      if (json.success) {
        if (json.isFallback) {
          // If the backend database is offline, fall back to browser localStorage
          const localOddsStr = localStorage.getItem(`taiwan_odds_${date}`);
          const localOdds = localOddsStr ? JSON.parse(localOddsStr) : [];
          // Merge local and backend returned odds, preferring local since server /tmp is ephemeral
          const merged = [...localOdds];
          (json.data || []).forEach((so: any) => {
            if (!merged.some(lo => lo.gameExternalId === so.gameExternalId && lo.marketType === so.marketType && lo.selection === so.selection)) {
              merged.push(so);
            }
          });
          setOddsList(merged);
          localStorage.setItem(`taiwan_odds_${date}`, JSON.stringify(merged));
        } else {
          setOddsList(json.data || []);
        }
      }
    } catch (e) {
      console.error(e);
      // fallback completely to localStorage
      const localOddsStr = localStorage.getItem(`taiwan_odds_${date}`);
      setOddsList(localOddsStr ? JSON.parse(localOddsStr) : []);
    } finally {
      setLoading(false);
    }
  };

  // 取得當日官方賽程，用來渲染快速輸入面板
  const fetchGames = async () => {
    setLoadingGames(true);
    try {
      const res = await fetch(`/api/games?date=${date}&league=ALL`);
      const json = await res.json();
      if (json.success && json.data) {
        const games = json.data;
        setApiGames(games);
        
        // 初始化每場比賽的賠率輸入欄位狀態
        const initialInputs: Record<string, Record<string, string>> = {};
        games.forEach((game: any) => {
          const gameId = game.externalId || `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${date}`;
          initialInputs[gameId] = {
            ml_home: '',
            ml_away: '',
            spread_line: '',
            spread_home: '',
            spread_away: '',
            total_line: '',
            total_over: '',
            total_under: '',
            highest_tie: '',
            highest_period: '',
            highest_period_name: game.league === 'NBA' ? '第四節' : '第5局'
          };
        });

        // 讀取已經存在的賠率，並填入輸入欄位中 (如果有)
        const currentOdds = oddsList; // 使用當前載入的賠率做比對
        games.forEach((game: any) => {
          const gameId = game.externalId || `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${date}`;
          const matchOdds = oddsList.filter(o => o.gameExternalId === gameId);
          if (matchOdds.length > 0) {
            matchOdds.forEach(odd => {
              if (odd.marketType === 'moneyline') {
                if (odd.selection === 'home') initialInputs[gameId].ml_home = String(odd.taiwanOdds);
                if (odd.selection === 'away') initialInputs[gameId].ml_away = String(odd.taiwanOdds);
              } else if (odd.marketType === 'spread') {
                initialInputs[gameId].spread_line = String(odd.line || '');
                if (odd.selection === 'home') initialInputs[gameId].spread_home = String(odd.taiwanOdds);
                if (odd.selection === 'away') initialInputs[gameId].spread_away = String(odd.taiwanOdds);
              } else if (odd.marketType === 'totals') {
                initialInputs[gameId].total_line = String(odd.line || '');
                if (odd.selection === 'over') initialInputs[gameId].total_over = String(odd.taiwanOdds);
                if (odd.selection === 'under') initialInputs[gameId].total_under = String(odd.taiwanOdds);
              } else if (odd.marketType === 'period_highest') {
                if (odd.selection === '一樣多') {
                  initialInputs[gameId].highest_tie = String(odd.taiwanOdds);
                } else {
                  initialInputs[gameId].highest_period_name = odd.selection;
                  initialInputs[gameId].highest_period = String(odd.taiwanOdds);
                }
              }
            });
          }
        });

        setOddsInputs(initialInputs);
      } else {
        setApiGames([]);
      }
    } catch (e) {
      console.error(e);
      setApiGames([]);
    } finally {
      setLoadingGames(false);
    }
  };

  useEffect(() => {
    fetchOdds();
  }, [date]);

  // 當 oddsList 或 date 改變時，自動載入賽程並匹配舊值
  useEffect(() => {
    fetchGames();
  }, [date, oddsList.length]);

  // ⚡ 一鍵自動下載最新國際盤賠率 (利用 AI 預測勝率及得分差進行逆推與抽水模擬)
  const handleAutoDownloadOdds = async () => {
    if (apiGames.length === 0) {
      triggerToast('❌ 今日無任何賽程，無法下載賠率');
      return;
    }
    
    setLoading(true);
    try {
      triggerToast('⏳ 正在調用 AI 預測引擎，自動計算並填入今日所有國際盤口...');
      
      const updatedInputs = { ...oddsInputs };
      
      // 併行獲取每場比賽的 AI 預測數據
      await Promise.all(apiGames.map(async (game: any) => {
        const gameId = game.externalId || `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${date}`;
        try {
          const res = await fetch('/api/predictions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameId: game.id,
              league: game.league,
              date: date
            })
          });
          if (!res.ok) return;
          const json = await res.json();
          if (json.success && json.data) {
            const pred = json.data;
            
            // Get active model (fallback to MetaModel)
            const activeModelKey = pred.activeModel || 'MetaModel';
            const modelData = pred.models?.[activeModelKey] || pred;
            
            // 1. 獨贏賠率 Moneyline (以預測勝率逆推，加入 4.5% 的抽水/抽成)
            let homeProb = 0.5;
            let awayProb = 0.5;
            
            if (modelData && typeof modelData.confidence === 'number') {
              const conf = modelData.confidence;
              if (modelData.winner === 'home') {
                homeProb = conf / 100;
                awayProb = (100 - conf) / 100;
              } else {
                awayProb = conf / 100;
                homeProb = (100 - conf) / 100;
              }
            }
            
            // 4.5% bookmaker margin (vigorish)
            const homeMlOdds = Number(Math.max(1.01, Math.min(20, (1 / homeProb) * 0.955)).toFixed(2));
            const awayMlOdds = Number(Math.max(1.01, Math.min(20, (1 / awayProb) * 0.955)).toFixed(2));
            
            // 2. 讓分盤 Spread
            // 根據預估得分差計算合理讓分線
            let spreadLine = 0;
            const hExp = typeof modelData.homeExpectedScore === 'number' ? modelData.homeExpectedScore : null;
            const aExp = typeof modelData.awayExpectedScore === 'number' ? modelData.awayExpectedScore : null;
            
            if (hExp !== null && aExp !== null) {
              spreadLine = Math.abs(hExp - aExp);
              spreadLine = Math.round(spreadLine * 2) / 2;
              if (spreadLine === 0) spreadLine = 0.5; // 避免讓 0 分
            } else {
              spreadLine = 1.5;
            }
            
            // 讓分賠率為 1.90 左右 (國際盤 -110)
            const spreadHomeOdds = 1.90;
            const spreadAwayOdds = 1.90;
            
            // 3. 大小分 Totals
            const totalsLine = typeof modelData.ouLine === 'number' ? modelData.ouLine : (game.league === 'NBA' ? 220.5 : 8.5);
            const totalOverOdds = 1.90;
            const totalUnderOdds = 1.90;
            
            // 填入該場比賽的輸入狀態中
            updatedInputs[gameId] = {
              ml_home: String(homeMlOdds),
              ml_away: String(awayMlOdds),
              spread_line: String(spreadLine),
              spread_home: String(spreadHomeOdds),
              spread_away: String(spreadAwayOdds),
              total_line: String(totalsLine),
              total_over: String(totalOverOdds),
              total_under: String(totalUnderOdds),
              highest_tie: '',
              highest_period: '',
              highest_period_name: game.league === 'NBA' ? '第四節' : '第5局'
            };
          }
        } catch (err) {
          console.error(`Failed to download prediction for game ${gameId}:`, err);
        }
      }));
      
      setOddsInputs(updatedInputs);
      triggerToast('⚡ 國際盤賠率已自動載入並填寫，請點擊「一鍵儲存今日賠率」進行保存！');
    } catch (e) {
      console.error(e);
      triggerToast('❌ 自動下載賠率失敗，請稍後重試');
    } finally {
      setLoading(false);
    }
  };

  // 💾 一鍵儲存今日所有已填寫賠率
  const handleSaveAllOdds = async () => {
    if (apiGames.length === 0) {
      triggerToast('❌ 今日無任何賽程，無法儲存');
      return;
    }

    const payload: any[] = [];
    const gameDateISO = new Date(date).toISOString();

    apiGames.forEach((game) => {
      const gameId = game.externalId || `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${date}`;
      const inputs = oddsInputs[gameId];
      if (!inputs) return;

      // 1. Moneyline
      if (inputs.ml_home) {
        payload.push({
          gameExternalId: gameId,
          league: game.league,
          gameDate: gameDateISO,
          homeTeam: game.homeTeam.code,
          awayTeam: game.awayTeam.code,
          marketType: 'moneyline',
          selection: 'home',
          taiwanOdds: parseFloat(inputs.ml_home),
          source: 'manual'
        });
      }
      if (inputs.ml_away) {
        payload.push({
          gameExternalId: gameId,
          league: game.league,
          gameDate: gameDateISO,
          homeTeam: game.homeTeam.code,
          awayTeam: game.awayTeam.code,
          marketType: 'moneyline',
          selection: 'away',
          taiwanOdds: parseFloat(inputs.ml_away),
          source: 'manual'
        });
      }

      // 2. Spread
      if (inputs.spread_line && (inputs.spread_home || inputs.spread_away)) {
        const lineVal = parseFloat(inputs.spread_line);
        if (inputs.spread_home) {
          payload.push({
            gameExternalId: gameId,
            league: game.league,
            gameDate: gameDateISO,
            homeTeam: game.homeTeam.code,
            awayTeam: game.awayTeam.code,
            marketType: 'spread',
            selection: 'home',
            taiwanOdds: parseFloat(inputs.spread_home),
            line: lineVal,
            source: 'manual'
          });
        }
        if (inputs.spread_away) {
          payload.push({
            gameExternalId: gameId,
            league: game.league,
            gameDate: gameDateISO,
            homeTeam: game.homeTeam.code,
            awayTeam: game.awayTeam.code,
            marketType: 'spread',
            selection: 'away',
            taiwanOdds: parseFloat(inputs.spread_away),
            line: lineVal,
            source: 'manual'
          });
        }
      }

      // 3. Totals
      if (inputs.total_line && (inputs.total_over || inputs.total_under)) {
        const lineVal = parseFloat(inputs.total_line);
        if (inputs.total_over) {
          payload.push({
            gameExternalId: gameId,
            league: game.league,
            gameDate: gameDateISO,
            homeTeam: game.homeTeam.code,
            awayTeam: game.awayTeam.code,
            marketType: 'totals',
            selection: 'over',
            taiwanOdds: parseFloat(inputs.total_over),
            line: lineVal,
            source: 'manual'
          });
        }
        if (inputs.total_under) {
          payload.push({
            gameExternalId: gameId,
            league: game.league,
            gameDate: gameDateISO,
            homeTeam: game.homeTeam.code,
            awayTeam: game.awayTeam.code,
            marketType: 'totals',
            selection: 'under',
            taiwanOdds: parseFloat(inputs.total_under),
            line: lineVal,
            source: 'manual'
          });
        }
      }
    });

    if (payload.length === 0) {
      triggerToast('❌ 請至少輸入或下載一項賠率後再儲存');
      return;
    }

    setLoading(true);
    try {
      // 1. Mirror to localStorage
      const localOddsStr = localStorage.getItem(`taiwan_odds_${date}`);
      const localOdds = localOddsStr ? JSON.parse(localOddsStr) : [];
      
      // Remove duplicates first
      const filteredLocal = localOdds.filter((lo: any) => 
        !payload.some(po => po.gameExternalId === lo.gameExternalId && po.marketType === lo.marketType && po.selection === lo.selection)
      );
      
      // Append new records
      payload.forEach((p, index) => {
        filteredLocal.push({
          id: `fodd_local_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
          ...p,
          importedAt: new Date().toISOString()
        });
      });
      localStorage.setItem(`taiwan_odds_${date}`, JSON.stringify(filteredLocal));

      // 2. Call API
      const res = await fetch('/api/betting/odds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        triggerToast('🎉 今日所有國際盤賠率已成功儲存並同步！');
        fetchOdds(); // 重新讀取，刷新狀態
      } else {
        triggerToast('❌ 伺服器同步失敗，已儲存於本機');
        fetchOdds();
      }
    } catch (e) {
      console.error(e);
      triggerToast('❌ 儲存失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (gameId: string, field: string, value: string) => {
    setOddsInputs((prev) => ({
      ...prev,
      [gameId]: {
        ...prev[gameId],
        [field]: value
      }
    }));
  };

  // 儲存單場賽事的所有輸入賠率
  const handleSaveGameOdds = async (game: any) => {
    const gameId = game.externalId || `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${date}`;
    const inputs = oddsInputs[gameId];
    if (!inputs) return;

    const payload: any[] = [];
    const gameDateISO = new Date(game.gameDate || date).toISOString();

    // 1. Moneyline
    if (inputs.ml_home) {
      payload.push({
        gameExternalId: gameId,
        league: game.league,
        gameDate: gameDateISO,
        homeTeam: game.homeTeam.code,
        awayTeam: game.awayTeam.code,
        marketType: 'moneyline',
        selection: 'home',
        taiwanOdds: parseFloat(inputs.ml_home),
        source: 'manual'
      });
    }
    if (inputs.ml_away) {
      payload.push({
        gameExternalId: gameId,
        league: game.league,
        gameDate: gameDateISO,
        homeTeam: game.homeTeam.code,
        awayTeam: game.awayTeam.code,
        marketType: 'moneyline',
        selection: 'away',
        taiwanOdds: parseFloat(inputs.ml_away),
        source: 'manual'
      });
    }

    // 2. Spread讓分
    if (inputs.spread_line && (inputs.spread_home || inputs.spread_away)) {
      const lineVal = parseFloat(inputs.spread_line);
      if (inputs.spread_home) {
        payload.push({
          gameExternalId: gameId,
          league: game.league,
          gameDate: gameDateISO,
          homeTeam: game.homeTeam.code,
          awayTeam: game.awayTeam.code,
          marketType: 'spread',
          selection: 'home',
          taiwanOdds: parseFloat(inputs.spread_home),
          line: lineVal,
          source: 'manual'
        });
      }
      if (inputs.spread_away) {
        payload.push({
          gameExternalId: gameId,
          league: game.league,
          gameDate: gameDateISO,
          homeTeam: game.homeTeam.code,
          awayTeam: game.awayTeam.code,
          marketType: 'spread',
          selection: 'away',
          taiwanOdds: parseFloat(inputs.spread_away),
          line: lineVal,
          source: 'manual'
        });
      }
    }

    // 3. Totals大小分
    if (inputs.total_line && (inputs.total_over || inputs.total_under)) {
      const lineVal = parseFloat(inputs.total_line);
      if (inputs.total_over) {
        payload.push({
          gameExternalId: gameId,
          league: game.league,
          gameDate: gameDateISO,
          homeTeam: game.homeTeam.code,
          awayTeam: game.awayTeam.code,
          marketType: 'totals',
          selection: 'over',
          taiwanOdds: parseFloat(inputs.total_over),
          line: lineVal,
          source: 'manual'
        });
      }
      if (inputs.total_under) {
        payload.push({
          gameExternalId: gameId,
          league: game.league,
          gameDate: gameDateISO,
          homeTeam: game.homeTeam.code,
          awayTeam: game.awayTeam.code,
          marketType: 'totals',
          selection: 'under',
          taiwanOdds: parseFloat(inputs.total_under),
          line: lineVal,
          source: 'manual'
        });
      }
    }

    // 4. Period Highest 單局得分最高
    if (inputs.highest_tie) {
      payload.push({
        gameExternalId: gameId,
        league: game.league,
        gameDate: gameDateISO,
        homeTeam: game.homeTeam.code,
        awayTeam: game.awayTeam.code,
        marketType: 'period_highest',
        selection: '一樣多',
        taiwanOdds: parseFloat(inputs.highest_tie),
        source: 'manual'
      });
    }
    if (inputs.highest_period && inputs.highest_period_name) {
      payload.push({
        gameExternalId: gameId,
        league: game.league,
        gameDate: gameDateISO,
        homeTeam: game.homeTeam.code,
        awayTeam: game.awayTeam.code,
        marketType: 'period_highest',
        selection: inputs.highest_period_name,
        taiwanOdds: parseFloat(inputs.highest_period),
        source: 'manual'
      });
    }

    if (payload.length === 0) {
      triggerToast('❌ 請至少輸入一項賠率後再儲存');
      return;
    }

    // Mirror to localStorage first in case database is offline
    try {
      const localOddsStr = localStorage.getItem(`taiwan_odds_${date}`);
      const localOdds = localOddsStr ? JSON.parse(localOddsStr) : [];
      // Remove matching ones first to avoid duplicates
      const filteredLocal = localOdds.filter((lo: any) => 
        !payload.some(po => po.gameExternalId === lo.gameExternalId && po.marketType === lo.marketType && po.selection === lo.selection)
      );
      // Append new records
      payload.forEach((p, index) => {
        filteredLocal.push({
          id: `fodd_local_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
          ...p,
          importedAt: new Date().toISOString()
        });
      });
      localStorage.setItem(`taiwan_odds_${date}`, JSON.stringify(filteredLocal));
    } catch (e) {
      console.error('Failed to write to localStorage:', e);
    }

    try {
      const res = await fetch('/api/betting/odds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        triggerToast(`🎉 成功儲存 [${game.awayTeam.code} @ ${game.homeTeam.code}] 賠率！`);
        fetchOdds();
      } else {
        triggerToast(`❌ 儲存失敗: ${json.error}`);
      }
    } catch {
      triggerToast('❌ 連接伺服器錯誤，已暫存至本地瀏覽器');
      fetchOdds();
    }
  };

  // 批量匯入 CSV
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      triggerToast('❌ 請輸入 CSV 內容');
      return;
    }

    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed: any[] = [];
    const parseErrors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      // 支援英文逗號(,) 或 Excel/Google Sheets 直接複製產生的 Tab鍵(\t)
      const parts = rawLine.split(/[\t,]/).map((p) => p.trim());
      
      // 跳過 Markdown 代碼區塊標記或空白列
      if (rawLine.startsWith('```') || parts.length < 2) {
        continue;
      }

      if (parts.length < 7) {
        parseErrors.push(`第 ${i + 1} 行：欄位數不足 (目前 ${parts.length} 個，至少需要 7 個)`);
        continue;
      }

      let [leg, gDate, home, away, market, sel, oddsRaw, lineRaw] = parts;

      // 1. 聯盟標準化 (NBA / MLB)
      const upperLeg = leg.toUpperCase();
      if (upperLeg !== 'NBA' && upperLeg !== 'MLB') {
        // 如果是常見的標頭列字樣，直接跳過而不計入錯誤
        if (upperLeg === '聯盟' || upperLeg === 'LEAGUE') {
          continue;
        }
        parseErrors.push(`第 ${i + 1} 行：無效的聯盟 "${leg}" (僅支援 NBA, MLB)`);
        continue;
      }
      const leagueType = upperLeg as 'NBA' | 'MLB';

      // 2. 賠率數值解析
      const oNum = parseFloat(oddsRaw);
      if (isNaN(oNum) || oNum <= 0) {
        if (oddsRaw === '賠率' || oddsRaw === 'odds') {
          continue; // 標頭列
        }
        parseErrors.push(`第 ${i + 1} 行：賠率 "${oddsRaw}" 必須為大於 0 的數字`);
        continue;
      }

      // 3. 隊伍代碼翻譯 (支援中文隊名與別名)
      const resolvedHome = findTeamCodeByName(home, leagueType);
      const resolvedAway = findTeamCodeByName(away, leagueType);

      if (!resolvedHome || !resolvedAway) {
        parseErrors.push(`第 ${i + 1} 行：無法識別的隊伍 "${!resolvedHome ? home : away}" (聯盟：${leagueType})`);
        continue;
      }

      // 4. 日期解析與容錯 (若 CSV 內日期格式損壞，則降級使用畫面上目前選擇的日期)
      let parsedDateStr = '';
      try {
        let dObj = new Date(gDate);
        if (isNaN(dObj.getTime())) {
          dObj = new Date(date);
        }
        if (isNaN(dObj.getTime())) {
          dObj = new Date();
        }
        parsedDateStr = dObj.toISOString();
      } catch {
        parsedDateStr = new Date(date).toISOString();
      }

      // 5. 玩法(MarketType)對譯與標準化
      let finalMarket = market.toLowerCase();
      if (finalMarket === 'moneyline' || market === '獨贏' || market === '不讓分') {
        finalMarket = 'moneyline';
      } else if (finalMarket === 'spread' || market === '讓分') {
        finalMarket = 'spread';
      } else if (finalMarket === 'totals' || market === '大小' || market === '大小分') {
        finalMarket = 'totals';
      } else {
        parseErrors.push(`第 ${i + 1} 行：未知玩法 "${market}" (支援：moneyline/獨贏, spread/讓分, totals/大小)`);
        continue;
      }

      // 6. 投注選擇(Selection)對譯與標準化
      let finalSel = sel;
      if (finalMarket === 'moneyline' || finalMarket === 'spread') {
        if (sel === 'home' || sel === '主' || sel === '主隊') {
          finalSel = 'home';
        } else if (sel === 'away' || sel === '客' || sel === '客隊') {
          finalSel = 'away';
        }
      } else if (finalMarket === 'totals') {
        if (sel === 'over' || sel === '大' || sel === '大分') {
          finalSel = 'over';
        } else if (sel === 'under' || sel === '小' || sel === '小分') {
          finalSel = 'under';
        }
      }

      // 7. 分值(Line)解析
      let finalLine: number | null = null;
      if (lineRaw) {
        const parsedLine = parseFloat(lineRaw);
        if (!isNaN(parsedLine)) {
          finalLine = parsedLine;
        }
      }

      const datePart = parsedDateStr.split('T')[0];
      const gameExternalId = `${leagueType}_${resolvedHome}_${resolvedAway}_${datePart}`;

      parsed.push({
        gameExternalId,
        league: leagueType,
        gameDate: parsedDateStr,
        homeTeam: resolvedHome,
        awayTeam: resolvedAway,
        marketType: finalMarket as any,
        selection: finalSel,
        taiwanOdds: oNum,
        line: finalLine,
        source: 'csv',
      });
    }

    if (parsed.length === 0) {
      if (parseErrors.length > 0) {
        console.error('CSV Parsing Failures:', parseErrors);
        triggerToast(`❌ 解析失敗：\n${parseErrors.slice(0, 3).join('\n')}${parseErrors.length > 3 ? '\n...' : ''}`);
      } else {
        triggerToast('❌ 未能成功解析任何賠率，請確認 CSV 格式是否正確');
      }
      return;
    }

    if (parseErrors.length > 0) {
      console.warn('Some CSV rows failed to parse:', parseErrors);
    }

    // Mirror to localStorage first
    try {
      const localOddsStr = localStorage.getItem(`taiwan_odds_${date}`);
      const localOdds = localOddsStr ? JSON.parse(localOddsStr) : [];
      const filteredLocal = localOdds.filter((lo: any) => 
        !parsed.some(po => po.gameExternalId === lo.gameExternalId && po.marketType === lo.marketType && po.selection === lo.selection)
      );
      parsed.forEach((p, index) => {
        filteredLocal.push({
          id: `fodd_local_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
          ...p,
          importedAt: new Date().toISOString()
        });
      });
      localStorage.setItem(`taiwan_odds_${date}`, JSON.stringify(filteredLocal));
    } catch (e) {
      console.error('Failed to write CSV to localStorage:', e);
    }

    try {
      const res = await fetch('/api/betting/odds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const json = await res.json();
      if (json.success) {
        let msg = `🎉 成功批次匯入 ${json.data.length} 筆賠率！`;
        if (parseErrors.length > 0) {
          msg += ` (跳過 ${parseErrors.length} 筆無效/未識別列)`;
        }
        triggerToast(msg);
        setCsvText('');
        fetchOdds();
      } else {
        triggerToast(`❌ 匯入失敗: ${json.error}`);
      }
    } catch (e: any) {
      console.error('API Post Failed:', e);
      triggerToast('❌ 伺服器儲存失敗，已暫存至本地瀏覽器');
      setCsvText('');
      fetchOdds();
    }
  };

  // 依比賽分組賠率
  const gamesMap: Record<string, TaiwanOdds[]> = {};
  for (const o of oddsList) {
    const key = `${o.awayTeam} @ ${o.homeTeam}`;
    if (!gamesMap[key]) gamesMap[key] = [];
    gamesMap[key].push(o);
  }

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
        
        {/* 麵包屑導航 & 標題 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2">
              <Link href="/betting" className="hover:text-amber-400 transition-colors">運彩下注模式</Link>
              <span>/</span>
              <span className="text-amber-400">國際盤賠率匯入</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              📥 國際盤賠率匯入
            </h1>
            <p className="text-xs text-gray-400 mt-1">對照今日官方賽程直接輸入賠率數值，或貼上 CSV/Excel 表格快速載入</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-400">當前日期:</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-gray-900 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none"
              />
            </div>
            
            <button
              type="button"
              onClick={handleAutoDownloadOdds}
              disabled={loadingGames || apiGames.length === 0}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-gray-950 font-black px-4.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/10 cursor-pointer"
              title="自動調用預測引擎與賽程數據計算最新國際盤賠率"
            >
              ⚡ 一鍵自動下載賠率
            </button>
            
            <button
              type="button"
              onClick={handleSaveAllOdds}
              disabled={loadingGames || apiGames.length === 0}
              className="bg-gray-900 hover:bg-gray-800 border border-white/10 text-gray-100 font-extrabold px-4.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="儲存今日所有已填寫/下載的賠率"
            >
              💾 一鍵儲存今日賠率
            </button>
          </div>
        </div>

        {/* 雙卡片：今日賽程直接輸入 vs 批次匯入 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 左欄: 今日賽程直接輸入面板 (佔 2 欄) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-panel rounded-3xl p-6 border border-white/5 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-lg font-extrabold text-amber-400 flex items-center gap-2">
                  <span>📅</span> 今日賽程快速填載面板 (國際盤格式)
                </h3>
                <span className="text-[10px] text-gray-500 font-bold">自動取得賽程，只需填寫數值</span>
              </div>

              {loadingGames ? (
                <div className="text-center py-12 text-gray-400 font-bold">賽程載入中...</div>
              ) : apiGames.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-bold bg-gray-950/40 rounded-2xl border border-white/5">
                  此日期無任何進行中或未開賽的賽程，請嘗試更改日期。
                </div>
              ) : (
                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-1">
                  {apiGames.map((game: any) => {
                    const gameId = game.externalId || `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${date}`;
                    const inputs = oddsInputs[gameId] || {};

                    return (
                      <div key={gameId} className="bg-gray-950/60 border border-white/5 rounded-2xl p-5 space-y-4">
                        
                        {/* 賽事頭資訊 */}
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full">
                              {game.league}
                            </span>
                            <span className="text-sm font-extrabold text-white">
                              {getTeamNameCn(game.awayTeam.code, game.league)} @ {getTeamNameCn(game.homeTeam.code, game.league)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleSaveGameOdds(game)}
                            className="bg-amber-500 hover:bg-amber-600 text-gray-950 font-black text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-md shadow-amber-500/5 flex items-center gap-1"
                          >
                            💾 儲存此場賠率
                          </button>
                        </div>

                        {/* 賠率輸入網格 */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                          {/* 1. 獨贏 */}
                          <div className="bg-gray-900/60 p-3 rounded-xl border border-white/5 space-y-2">
                            <span className="font-extrabold text-gray-400 block border-b border-white/5 pb-1">獨贏 (不讓分)</span>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 font-mono w-8 shrink-0">客勝:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="賠率"
                                  value={inputs.ml_away || ''}
                                  onChange={(e) => handleInputChange(gameId, 'ml_away', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 font-mono w-8 shrink-0">主勝:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="賠率"
                                  value={inputs.ml_home || ''}
                                  onChange={(e) => handleInputChange(gameId, 'ml_home', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                            </div>
                          </div>

                          {/* 2. 讓分 */}
                          <div className="bg-gray-900/60 p-3 rounded-xl border border-white/5 space-y-2">
                            <span className="font-extrabold text-gray-400 block border-b border-white/5 pb-1">讓分 (Spread)</span>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 w-8 shrink-0">讓分:</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  placeholder="分值"
                                  value={inputs.spread_line || ''}
                                  onChange={(e) => handleInputChange(gameId, 'spread_line', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 font-mono w-8 shrink-0">客勝:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="賠率"
                                  value={inputs.spread_away || ''}
                                  onChange={(e) => handleInputChange(gameId, 'spread_away', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 font-mono w-8 shrink-0">主勝:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="賠率"
                                  value={inputs.spread_home || ''}
                                  onChange={(e) => handleInputChange(gameId, 'spread_home', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                            </div>
                          </div>

                          {/* 3. 大小分 */}
                          <div className="bg-gray-900/60 p-3 rounded-xl border border-white/5 space-y-2">
                            <span className="font-extrabold text-gray-400 block border-b border-white/5 pb-1">大小 (Totals)</span>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 w-8 shrink-0">界線:</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  placeholder="分值"
                                  value={inputs.total_line || ''}
                                  onChange={(e) => handleInputChange(gameId, 'total_line', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 w-8 shrink-0">大分:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="賠率"
                                  value={inputs.total_over || ''}
                                  onChange={(e) => handleInputChange(gameId, 'total_over', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 w-8 shrink-0">小分:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="賠率"
                                  value={inputs.total_under || ''}
                                  onChange={(e) => handleInputChange(gameId, 'total_under', e.target.value)}
                                  className="w-full bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-white font-mono"
                                />
                              </div>
                            </div>
                          </div>



                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右欄: 批量錄入面板 */}
          <div className="space-y-6">
            <div className="glass-panel rounded-3xl p-6 border border-white/5 space-y-4">
              
              {/* Tab 切換選單 */}
              <div className="flex border-b border-white/5 pb-2 gap-2 text-[11px] overflow-x-auto">
                <button
                  onClick={() => setActiveTab('text')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold transition-all shrink-0 ${activeTab === 'text' ? 'bg-amber-500 text-gray-950 shadow-md shadow-amber-500/10' : 'text-gray-400 hover:text-white'}`}
                >
                  ✍️ 官網文字貼上
                </button>
                <button
                  onClick={() => setActiveTab('csv')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold transition-all shrink-0 ${activeTab === 'csv' ? 'bg-amber-500 text-gray-950 shadow-md shadow-amber-500/10' : 'text-gray-400 hover:text-white'}`}
                >
                  📋 CSV / Excel
                </button>
                <button
                  onClick={() => setActiveTab('ocr')}
                  className={`px-3 py-1.5 rounded-xl font-extrabold transition-all shrink-0 ${activeTab === 'ocr' ? 'bg-amber-500 text-gray-950 shadow-md shadow-amber-500/10' : 'text-gray-400 hover:text-white'}`}
                >
                  📸 截圖辨識 (OCR)
                </button>
              </div>

              {/* Tab 1: 官網文字貼上 */}
              {activeTab === 'text' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-amber-400 mb-1">✍️ 貼上國際盤賠率文字</h3>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      複製包含「獨贏」、「讓分」、「大小」等所有玩法的文字區塊，貼在下方即可自動解析。
                    </p>
                  </div>

                  <textarea
                    value={copiedText}
                    onChange={(e) => setCopiedText(e.target.value)}
                    placeholder="複製國際盤賠率文字並在此處貼上：&#10;獨贏&#10;主場 客場&#10;紐約洋基 克里夫蘭守護者&#10;2.30 1.40&#10;讓分 -2.5&#10;克里夫蘭守護者 +2.5 1.42..."
                    rows={12}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />

                  <button
                    onClick={handleParseCopiedText}
                    className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-gray-950 font-black py-2 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-amber-500/10"
                  >
                    🔍 觸發文字解析
                  </button>

                  {/* 解析結果顯示與導入 */}
                  {textParseResult && (
                    <div className="bg-gray-950/60 border border-white/5 rounded-2xl p-4 space-y-3">
                      {textParseResult.success ? (
                        <>
                          <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-xs font-extrabold text-green-400 flex items-center gap-1">
                              <span>✓</span> 解析成功
                            </span>
                            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-black">
                              {textParseResult.game.league}
                            </span>
                          </div>
                          
                          <div className="space-y-1.5 text-xs">
                            <div className="font-extrabold text-white">
                              {getTeamNameCn(textParseResult.game.awayTeam.code, textParseResult.game.league)} @ {getTeamNameCn(textParseResult.game.homeTeam.code, textParseResult.game.league)}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              日期：{textParseResult.game.gameDate ? textParseResult.game.gameDate.split('T')[0] : date}
                            </div>
                            
                            <div className="bg-gray-900/60 rounded-xl p-2.5 space-y-1.5 text-[11px] max-h-[150px] overflow-y-auto font-mono">
                              {textParseResult.odds && textParseResult.odds.map((odd, idx) => (
                                <div key={idx} className="flex justify-between text-gray-300">
                                  <span>
                                    {odd.marketType === 'moneyline' ? '獨贏' : odd.marketType === 'spread' ? '讓分' : '大小'}({odd.selection === 'home' ? '主勝' : odd.selection === 'away' ? '客勝' : odd.selection === 'over' ? '大' : '小'})
                                    {odd.line !== null ? ` [${odd.line}]` : ''}
                                  </span>
                                  <span className="text-amber-400 font-extrabold">{odd.taiwanOdds.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={handleApplyTextOdds}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-gray-950 font-black py-1.5 px-3 rounded-xl text-xs transition-colors"
                          >
                            📥 導入至今日快速面板
                          </button>
                        </>
                      ) : (
                        <div className="text-xs font-bold text-red-400 bg-red-500/5 border border-red-500/10 p-3 rounded-xl">
                          ⚠️ 解析錯誤：{textParseResult.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: CSV 貼上批次匯入 */}
              {activeTab === 'csv' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-amber-400 mb-1">📋 批量貼上 (CSV / Excel)</h3>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      支援從 Excel 或 Google Sheets 中選取多欄儲存格直接複製貼上。格式順序為：<br />
                      <code className="text-amber-500 font-mono text-[9px]">聯盟,日期(YYYY-MM-DD),主隊,客隊,玩法,選擇,賠率,分值</code>
                    </p>
                  </div>

                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="例如直接貼上:&#10;NBA	2026-06-04	LAL	BOS	moneyline	home	1.85	&#10;NBA	2026-06-04	LAL	BOS	spread	away	1.75	-3.5"
                    rows={12}
                    className="w-full bg-gray-900 border border-white/10 rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />

                  <button
                    onClick={handleImportCsv}
                    className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-gray-950 font-black py-2 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-amber-500/10"
                  >
                    觸發批次解析與匯入
                  </button>
                </div>
              )}

              {/* Tab 3: OCR 截圖辨識 */}
              {activeTab === 'ocr' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-amber-400 mb-1">📸 截圖辨識賠率 (OCR)</h3>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      上傳圖片，或在頁面任何地方按 <code className="text-amber-500 font-mono text-[9px] bg-white/5 px-1 py-0.5 rounded">Ctrl + V</code> 貼上運彩網頁截圖，自動辨識獨贏賠率填入左側。
                    </p>
                  </div>

                  {/* 上傳觸發區 */}
                  <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        handleImageOcr(file);
                      }
                    }}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleImageOcr(file);
                      };
                      input.click();
                    }}
                    className={`border-2 border-dashed border-white/10 rounded-2xl p-6 text-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all space-y-2 ${ocrLoading ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <div className="text-xl">📸</div>
                    <div className="text-xs font-bold text-gray-300">拖曳圖片至此 / 點擊選取檔案 / 直接 Ctrl+V 貼上</div>
                    <div className="text-[9px] text-gray-500">支援 PNG, JPG 格式 (國際盤賽程賠率截圖)</div>
                  </div>

                  {/* 狀態列 */}
                  {ocrStatus && (
                    <div className="text-[10px] font-bold text-amber-300/80 bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-xl">
                      {ocrStatus}
                    </div>
                  )}

                  {/* OCR 辨識結果 */}
                  {ocrResults.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-400">辨識對戰列表 ({ocrResults.length} 場)</span>
                        <button
                          onClick={handleApplyAllOcrGames}
                          className="bg-amber-500 hover:bg-amber-600 text-gray-950 text-[10px] font-black px-2.5 py-1 rounded-lg transition-colors"
                        >
                          🚀 一鍵導入全部
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                        {ocrResults.map((parsed, idx) => {
                          const matched = getMatchedGame(parsed);
                          return (
                            <div key={idx} className="bg-gray-950/60 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded font-black">
                                    {parsed.league}
                                  </span>
                                  {parsed.gameNumber && (
                                    <span className="text-[9px] text-gray-500 font-mono">
                                      #{parsed.gameNumber}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-gray-400">
                                    {parsed.gameDate}
                                  </span>
                                </div>
                                <div className="font-extrabold text-white">
                                  {getTeamNameCn(parsed.awayTeam, parsed.league)} @ {getTeamNameCn(parsed.homeTeam, parsed.league)}
                                </div>
                                <div className="text-[10px] font-mono text-gray-400">
                                  獨贏賠率：<span className="text-amber-400 font-bold">{parsed.awayOdds}</span> (客) / <span className="text-amber-400 font-bold">{parsed.homeOdds}</span> (主)
                                </div>
                                {matched ? (
                                  <div className="text-[9px] text-green-400/80 font-bold">
                                    ✓ 已匹配今日賽程
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-red-400/80 font-bold">
                                    ⚠️ 未匹配到賽程
                                  </div>
                                )}
                              </div>

                              {matched && (
                                <button
                                  onClick={() => handleApplyOcrGame(parsed)}
                                  className="bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 border border-white/10 hover:border-amber-500/30 font-bold text-[10px] px-2 py-1 rounded-lg transition-all"
                                >
                                  導入
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

        </div>

        {/* 已匯入賠率清單面板 */}
        <div className="glass-panel rounded-3xl p-6 border border-white/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-extrabold text-white">📋 當前已匯入賠率</h2>
              <p className="text-xs text-gray-400 mt-1">日期：{date} (共 {oddsList.length} 筆賠率)</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 font-bold">載入中...</div>
          ) : Object.keys(gamesMap).length === 0 ? (
            <div className="text-center py-12 text-gray-500 font-bold">
              此日期目前尚無任何運彩賠率紀錄。請在上方進行填寫或貼上。
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(gamesMap).map(([gameLabel, list]) => (
                <div key={gameLabel} className="bg-gray-950/40 border border-white/5 rounded-2xl p-6">
                  <h3 className="text-sm font-black text-amber-400 mb-4 flex items-center justify-between">
                    <span>🏀⚾ {gameLabel.replace(/^(.+?) @ (.+)$/, (_, away, home) => `${getTeamNameCn(away, list[0].league)} @ ${getTeamNameCn(home, list[0].league)}`)}</span>
                    <span className="text-[10px] text-gray-500 font-mono font-normal">日期: {list[0].gameDate.split('T')[0]}</span>
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {list.map((odd) => (
                      <div key={odd.id} className="bg-gray-900/60 rounded-xl p-3 border border-white/5 flex justify-between items-center text-xs">
                        <div>
                          <span className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded font-bold">
                            {odd.marketType === 'moneyline' ? '獨贏' : odd.marketType === 'spread' ? '讓分' : odd.marketType === 'totals' ? '大小' : '最高得分局'}
                          </span>
                          <span className="font-extrabold text-white block mt-1">
                            下注：{odd.selection} {odd.line ? `(${odd.line})` : ''}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-gray-500 block text-[9px] font-bold">賠率</span>
                          <span className="font-mono font-extrabold text-amber-400 text-sm">{odd.taiwanOdds.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
