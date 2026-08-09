import { promises as fs } from 'fs';
import { PredictionReportBundle, GameResult, GamePredictionReport } from './types';

export function getTeamColor(code: string): string {
  const teamColors: Record<string, string> = {
    // NBA
    BOS: '#007A33', BKN: '#000000', NYK: '#F58426', PHI: '#006BB6', TOR: '#CE1141',
    CHI: '#CE1141', CLE: '#860038', DET: '#1D42BA', IND: '#FDBB30', MIL: '#00471B',
    DEN: '#0E2240', MIN: '#0C2340', OKC: '#007AC1', POR: '#E03A3E', UTA: '#002B5C',
    GSW: '#1D428A', LAC: '#C8102E', LAL: '#552583', PHX: '#1D1160', SAC: '#5A2D81',
    DAL: '#00538C', HOU: '#CE1141', MEM: '#5D76A9', NOP: '#0C2340', SAS: '#C4CED4',
    MIA: '#98002E', ORL: '#0077C0', ATL: '#E03A3E', CHA: '#1D1160', WAS: '#002B5C',
    // MLB
    NYY: '#003087', BAL: '#DF4601', TB: '#092C5C', TOR_MLB: '#134A8E', BOS_MLB: '#BD3039',
    MIN_MLB: '#002B5C', CLE_MLB: '#E31937', DET_MLB: '#0C2340', CWS: '#27251F', KC: '#004687',
    TEX: '#003278', HOU_MLB: '#002D62', SEA: '#005C5C', LAA: '#BA0021', OAK: '#003831',
    ATL_MLB: '#CE1141', PHI_MLB: '#E81828', MIA_MLB: '#00A3E0', NYM: '#FF5910', WSH: '#AB0003',
    MIL_MLB: '#FFC52F', CHC: '#0E3386', CIN: '#C6011F', PIT: '#FDB827', STL: '#C41E3A',
    LAD: '#005A9C', ARI: '#A71930', SD: '#2F241D', SF: '#FD5A1E', COL: '#33006F'
  };
  return teamColors[code] || '#475569';
}

export function getLeagueColor(league: string): string {
  return league === 'NBA' ? '#ff6b00' : '#005A9C';
}

export function generatePredictionSVG(report: PredictionReportBundle): string {
  return buildSVG(report, null);
}

export function generateResultOverlaySVG(report: PredictionReportBundle, results: GameResult[]): string {
  return buildSVG(report, results);
}

export async function saveSVGToFile(svg: string, filePath: string): Promise<void> {
  await fs.writeFile(filePath, svg, 'utf-8');
}

function buildSVG(report: PredictionReportBundle, results: GameResult[] | null): string {
  const games = report.games;
  const canvasWidth = 1200;
  const headerHeight = 220;
  const footerHeight = 120;
  const cardWidth = 535;
  const cardHeight = 200;
  const cardSpacingX = 30;
  const cardSpacingY = 25;
  const paddingX = 50;

  const numRows = Math.ceil(games.length / 2);
  const canvasHeight = headerHeight + (numRows > 0 ? numRows * (cardHeight + cardSpacingY) : 0) + footerHeight;

  const modeText = results ? '✅ 完賽結果對位驗算戰報' : '🔮 賽前 AI 獨贏勝率預測戰報';
  const modeColor = results ? '#10b981' : '#8b5cf6';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a0d16" />
        <stop offset="30%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e1b4b" />
      </linearGradient>
      <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(255, 255, 255, 0.08)" />
        <stop offset="100%" stop-color="rgba(255, 255, 255, 0.02)" />
      </linearGradient>
    </defs>
    <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#bgGrad)" />
    
    <!-- Top Accent Line -->
    <rect width="${canvasWidth}" height="6" fill="${modeColor}" />
    
    <!-- Header Logo & Subtitle -->
    <text x="50" y="60" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="36" font-weight="900">SPORTS.AI</text>
    <text x="50" y="90" fill="rgba(139, 92, 246, 0.8)" font-family="Outfit, Noto Sans TC, sans-serif" font-size="14" font-weight="bold">智能大數據分析平台</text>
    
    <!-- Date Box -->
    <text x="50" y="140" fill="#94a3b8" font-family="Outfit, Noto Sans TC, sans-serif" font-size="16" font-weight="bold">日期: ${report.targetDate}</text>
    
    <!-- Mode Badge -->
    <rect x="950" y="35" width="200" height="38" rx="8" fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
    <circle cx="970" cy="54" r="5" fill="${modeColor}" />
    <text x="1135" y="54" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="14" font-weight="bold" text-anchor="end" dominant-baseline="central">${modeText}</text>
    
    <line x1="50" y1="165" x2="1150" y2="165" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
  `;

  let totalCorrect = 0;
  let totalMatches = 0;

  games.forEach((game, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cardX = paddingX + col * (cardWidth + cardSpacingX);
    const cardY = headerHeight + row * (cardHeight + cardSpacingY);
    
    const leagueColor = getLeagueColor(game.league);
    const homeColor = getTeamColor(game.homeTeam.code);
    const awayColor = getTeamColor(game.awayTeam.code);

    let awayScore = game.prediction.awayExpectedScore.toFixed(1);
    let homeScore = game.prediction.homeExpectedScore.toFixed(1);
    let resultFooter = '';

    const gameResult = results?.find(r => r.gameId === game.gameId);
    
    if (results && gameResult && gameResult.status === 'completed') {
      awayScore = String(gameResult.awayScore);
      homeScore = String(gameResult.homeScore);
      
      const actualWinner = gameResult.homeScore > gameResult.awayScore ? 'home' : 'away';
      const predCorrect = game.prediction.winner === actualWinner;
      
      totalMatches++;
      if (predCorrect) totalCorrect++;

      const hitMissBadge = predCorrect ? '✅ 命中' : '❌ 偏差';
      resultFooter = `<text x="267.5" y="125" fill="${predCorrect ? '#10b981' : '#ef4444'}" font-family="Outfit, Noto Sans TC, sans-serif" font-size="13" font-weight="800" text-anchor="middle" dominant-baseline="central">實際結果: ${actualWinner === 'home' ? game.homeTeam.nameCn : game.awayTeam.nameCn}勝 | ${hitMissBadge}</text>`;
    } else {
      resultFooter = `<text x="267.5" y="125" fill="rgba(167, 139, 250, 0.95)" font-family="Outfit, Noto Sans TC, sans-serif" font-size="13" font-weight="800" text-anchor="middle" dominant-baseline="central">🎯 勝負: ${game.prediction.winnerTeamName}勝 (${game.prediction.confidence}%)  |  🎲 大小分: ${game.prediction.ouPick === 'Over' ? '大分' : '小分'} (${game.prediction.ouLine}分)</text>`;
    }

    // Escape reasoning string
    const escapeXml = (unsafe: string) => unsafe.replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });

    const reasoningLines = game.reasoning.slice(0, 2).map((r, rIdx) => 
      `<text x="30" y="${155 + rIdx * 22}" fill="#94a3b8" font-family="Outfit, Noto Sans TC, sans-serif" font-size="12" dominant-baseline="central">${r.icon} [${escapeXml(r.category)}] ${escapeXml(r.explanation).substring(0, 30)}...</text>`
    ).join('');

    svg += `
      <g transform="translate(${cardX}, ${cardY})">
        <rect width="${cardWidth}" height="${cardHeight}" rx="18" fill="url(#cardGrad)" stroke="${leagueColor}" stroke-opacity="0.15" stroke-width="1.5" />
        
        <rect x="20" y="18" width="50" height="22" rx="6" fill="${leagueColor}" />
        <text x="45" y="29" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="900" text-anchor="middle" dominant-baseline="central">${game.league}</text>
        
        <text x="267.5" y="60" fill="rgba(255, 255, 255, 0.2)" font-family="Outfit, Noto Sans TC, sans-serif" font-size="16" font-weight="800" font-style="italic" text-anchor="middle" dominant-baseline="central">VS</text>
        
        <circle cx="70" cy="60" r="25" fill="${awayColor}" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
        <text x="70" y="60" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="14" font-weight="900" text-anchor="middle" dominant-baseline="central">${game.awayTeam.code.substring(0, 3)}</text>
        <text x="110" y="60" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="16" font-weight="bold" dominant-baseline="central">${escapeXml(game.awayTeam.nameCn)}</text>
        <text x="225" y="60" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="28" font-weight="900" text-anchor="end" dominant-baseline="central">${awayScore}</text>

        <circle cx="465" cy="60" r="25" fill="${homeColor}" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
        <text x="465" y="60" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="14" font-weight="900" text-anchor="middle" dominant-baseline="central">${game.homeTeam.code.substring(0, 3)}</text>
        <text x="425" y="60" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="16" font-weight="bold" text-anchor="end" dominant-baseline="central">${escapeXml(game.homeTeam.nameCn)}</text>
        <text x="310" y="60" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="28" font-weight="900" text-anchor="start" dominant-baseline="central">${homeScore}</text>

        <line x1="20" y1="100" x2="515" y2="100" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" />
        
        ${resultFooter}
        ${reasoningLines}
      </g>
    `;
  });

  // Footer Content
  let accuracySummary = '';
  if (results && totalMatches > 0) {
    const accuracy = ((totalCorrect / totalMatches) * 100).toFixed(1);
    accuracySummary = `<text x="${canvasWidth / 2}" y="${canvasHeight - 90}" fill="#10b981" font-family="Outfit, Noto Sans TC, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" dominant-baseline="central">🎯 今日總結命中率: ${accuracy}% (${totalCorrect}/${totalMatches})</text>`;
  }

  svg += `
    ${accuracySummary}
    <text x="${canvasWidth / 2}" y="${canvasHeight - 60}" fill="rgba(255, 255, 255, 0.15)" font-family="Outfit, Noto Sans TC, sans-serif" font-size="13" font-weight="bold" text-anchor="middle" dominant-baseline="central">大數據驅動 · 智能決策看盤 · SPORTS.AI 戰報中心</text>
    <text x="${canvasWidth / 2}" y="${canvasHeight - 35}" fill="rgba(255, 255, 255, 0.08)" font-family="Outfit, Noto Sans TC, sans-serif" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="central">僅供參考，請自行謹慎評估風險 | Generated by Creative Designer AI</text>
  </svg>`;

  return svg;
}
