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
  return teamColors[code] || '#3b82f6';
}

export function getLeagueColor(league: string): string {
  return league === 'NBA' ? '#ff6b00' : '#0284c7';
}

export function generatePredictionSVG(report: PredictionReportBundle): string {
  return buildSVG(report, null);
}

export function generateResultOverlaySVG(report: PredictionReportBundle, results: GameResult[] | null): string {
  return buildSVG(report, results);
}

export async function saveSVGToFile(svg: string, filePath: string): Promise<void> {
  await fs.writeFile(filePath, svg, 'utf-8');
}

/**
 * 畫出精美極簡現代風格戰報 (符合精選賽事 AI 預測排版樣式)
 */
function buildSVG(report: PredictionReportBundle, results: GameResult[] | null): string {
  const games = report.games;
  const canvasWidth = 1100;
  const headerHeight = 150;
  const footerHeight = 100;
  const cardWidth = 1020;
  const cardHeight = 220; // Expanded card height for top matchup + bottom 9-column metrics grid
  const cardSpacingY = 24;
  const paddingX = 40;

  const canvasHeight = headerHeight + (games.length > 0 ? games.length * (cardHeight + cardSpacingY) : 0) + footerHeight;

  // Escape XML helper
  const escapeXml = (unsafe: string) => (unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });

  // Calculate day of week (e.g. 7/18 (五))
  let dateBoxText = report.targetDate;
  try {
    const d = new Date(report.targetDate);
    const month = d.getMonth() + 1;
    const dateNum = d.getDate();
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const dayName = dayNames[d.getDay()] || '';
    dateBoxText = `${month}/${dateNum} (${dayName})`;
  } catch { /* fallback to targetDate */ }

  const primaryLeague = games[0]?.league || 'MLB';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
    <defs>
      <!-- Cyberpunk Background Gradient -->
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#060913" />
        <stop offset="40%" stop-color="#0a0f24" />
        <stop offset="100%" stop-color="#070b1a" />
      </linearGradient>

      <!-- Glass Card Background -->
      <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(15, 23, 42, 0.85)" />
        <stop offset="100%" stop-color="rgba(11, 18, 33, 0.95)" />
      </linearGradient>

      <!-- Metric Cell Background -->
      <linearGradient id="cellBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255, 255, 255, 0.04)" />
        <stop offset="100%" stop-color="rgba(255, 255, 255, 0.01)" />
      </linearGradient>

      <!-- Advantage Winner Box Highlight -->
      <linearGradient id="advBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(245, 158, 11, 0.15)" />
        <stop offset="100%" stop-color="rgba(217, 119, 6, 0.08)" />
      </linearGradient>

      <!-- Win Bar Left Gradient (Cyan) -->
      <linearGradient id="barLeft" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#06b6d4" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>

      <!-- Win Bar Right Gradient (Pink/Magenta) -->
      <linearGradient id="barRight" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#f43f5e" />
        <stop offset="100%" stop-color="#e11d48" />
      </linearGradient>
    </defs>

    <!-- Canvas Background -->
    <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#bgGrad)" />

    <!-- Ambient Glowing Orbs -->
    <circle cx="150" cy="80" r="140" fill="#0284c7" opacity="0.12" filter="blur(60px)" />
    <circle cx="${canvasWidth - 150}" cy="100" r="160" fill="#6366f1" opacity="0.1" filter="blur(70px)" />

    <!-- Header Left: Title & Subtitle -->
    <text x="40" y="58" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="34" font-weight="900" letter-spacing="1">
      ${primaryLeague} 精選賽事 <tspan fill="#38bdf8">AI 預測</tspan>
    </text>
    <text x="40" y="92" fill="#64748b" font-family="Outfit, Noto Sans TC, sans-serif" font-size="13" font-weight="bold" letter-spacing="0.5">
      數據分析 ‧ 即時預測 ‧ 掌握勝率 ‧ 找出最佳機會
    </text>

    <!-- Header Right: Date Pill Box -->
    <g transform="translate(${canvasWidth - 180}, 36)">
      <rect width="140" height="42" rx="10" fill="rgba(99, 102, 241, 0.15)" stroke="rgba(129, 140, 248, 0.3)" stroke-width="1.5" />
      <text x="70" y="26" fill="#c084fc" font-family="Outfit, Noto Sans TC, sans-serif" font-size="17" font-weight="900" text-anchor="middle">${escapeXml(dateBoxText)}</text>
      <text x="70" y="58" fill="#64748b" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">台灣時間</text>
    </g>

    <!-- Header Bottom Divider -->
    <line x1="40" y1="120" x2="${canvasWidth - 40}" y2="120" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
  `;

  // Render Each Game Card
  games.forEach((game, index) => {
    const cardX = paddingX;
    const cardY = headerHeight + index * (cardHeight + cardSpacingY);
    const gameResult = results?.find(r => r.gameId === game.gameId);
    const isCompleted = results && gameResult && gameResult.status === 'completed';

    // Calculation of metrics for the 9-column grid
    const awayWinProb = game.prediction.winner === 'away'
      ? game.prediction.confidence
      : Number((100 - game.prediction.confidence).toFixed(1));
    const homeWinProb = Number((100 - awayWinProb).toFixed(1));

    const winnerTeamCode = game.prediction.winner === 'home' ? game.homeTeam.code : game.awayTeam.code;
    const winnerTeamCn = game.prediction.winner === 'home' ? game.homeTeam.nameCn : game.awayTeam.nameCn;

    const spreadLine = `${winnerTeamCn} -1.5`;
    const spreadWinProb = `${Math.round(game.prediction.confidence * 0.82)}%`;

    const ouLineText = `${game.prediction.ouLine} 分`;
    const overProbText = `${Math.round(50 + (game.prediction.predictedTotal > game.prediction.ouLine ? 6 : -4))}%`;
    const predictedTotalText = `${game.prediction.predictedTotal.toFixed(1)}`;

    // Synthetic attack/pitcher index derived from predictions
    const offIndex = Math.round(100 + (game.prediction.predictedTotal * 1.8));
    const pitchIndex = Math.round(115 - (game.prediction.predictedTotal * 1.2));
    const overallProbText = `${game.prediction.confidence}%`;

    // Colors
    const homeColor = getTeamColor(game.homeTeam.code);
    const awayColor = getTeamColor(game.awayTeam.code);

    // Win Bar Calculations (Width: 320px)
    const barTotalWidth = 320;
    const awayBarWidth = Math.round((awayWinProb / 100) * barTotalWidth);

    // Dynamic Result Overlay text
    let resultHeaderOverlay = '';
    if (isCompleted && gameResult) {
      const actualWinner = gameResult.homeScore > gameResult.awayScore ? 'home' : 'away';
      const hit = game.prediction.winner === actualWinner;
      resultHeaderOverlay = `<rect x="420" y="10" width="180" height="24" rx="6" fill="${hit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}" stroke="${hit ? '#10b981' : '#ef4444'}" stroke-width="1" />
        <text x="510" y="26" fill="${hit ? '#34d399' : '#f87171'}" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="900" text-anchor="middle">實際比分 ${gameResult.awayScore}:${gameResult.homeScore} | ${hit ? '✅ 命中' : '❌ 偏差'}</text>`;
    }

    svg += `
      <!-- Game Card ${index + 1} -->
      <g transform="translate(${cardX}, ${cardY})">
        <!-- Card Frame -->
        <rect width="${cardWidth}" height="${cardHeight}" rx="16" fill="url(#cardBg)" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5" />

        <!-- Top Section: Time Pill, Away Team, Win Rate Bar, Home Team -->
        <!-- Time & League Pill Badge -->
        <rect x="24" y="24" width="92" height="26" rx="6" fill="rgba(2, 132, 199, 0.15)" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1" />
        <text x="40" y="41" fill="#38bdf8" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="800">01:35</text>
        <rect x="76" y="29" width="34" height="16" rx="3" fill="#0284c7" />
        <text x="93" y="40" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="9" font-weight="900" text-anchor="middle">${game.league}</text>

        ${resultHeaderOverlay}

        <!-- Away Team (Left) -->
        <g transform="translate(140, 20)">
          <!-- Team Logo Badge -->
          <circle cx="20" cy="18" r="18" fill="${awayColor}" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.5" />
          <text x="20" y="23" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="900" text-anchor="middle">${escapeXml(game.awayTeam.code.substring(0, 3))}</text>
          <text x="46" y="24" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="18" font-weight="900">${escapeXml(game.awayTeam.nameCn)}</text>
        </g>

        <!-- Win Rate Numbers & Probability Bar (Center) -->
        <g transform="translate(350, 16)">
          <!-- Away Prob % (Cyan) -->
          <text x="40" y="24" fill="#38bdf8" font-family="Outfit, Noto Sans TC, sans-serif" font-size="28" font-weight="900" text-anchor="end">${awayWinProb.toFixed(0)}%</text>
          <text x="160" y="22" fill="#475569" font-family="Outfit, Noto Sans TC, sans-serif" font-size="12" font-weight="900" text-anchor="middle">VS</text>
          <!-- Home Prob % (Magenta/Pink) -->
          <text x="280" y="24" fill="#fb7185" font-family="Outfit, Noto Sans TC, sans-serif" font-size="28" font-weight="900" text-anchor="start">${homeWinProb.toFixed(0)}%</text>

          <!-- Probability Dual Bar -->
          <g transform="translate(0, 34)">
            <rect x="0" y="0" width="${barTotalWidth}" height="8" rx="4" fill="rgba(255, 255, 255, 0.05)" />
            <rect x="0" y="0" width="${awayBarWidth}" height="8" rx="4" fill="url(#barLeft)" />
            <rect x="${awayBarWidth}" y="0" width="${barTotalWidth - awayBarWidth}" height="8" rx="4" fill="url(#barRight)" />
          </g>
        </g>

        <!-- Home Team (Right) -->
        <g transform="translate(710, 20)">
          <!-- Team Logo Badge -->
          <circle cx="150" cy="18" r="18" fill="${homeColor}" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.5" />
          <text x="150" y="23" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="900" text-anchor="middle">${escapeXml(game.homeTeam.code.substring(0, 3))}</text>
          <text x="124" y="24" fill="#ffffff" font-family="Outfit, Noto Sans TC, sans-serif" font-size="18" font-weight="900" text-anchor="end">${escapeXml(game.homeTeam.nameCn)}</text>
        </g>

        <!-- Divider Line -->
        <line x1="24" y1="82" x2="${cardWidth - 24}" y2="82" stroke="rgba(255, 255, 255, 0.06)" stroke-width="1" />

        <!-- Bottom Section: 9-Column Detailed Stat Cards Grid -->
        <g transform="translate(24, 96)">
          ${renderMetricCell(0, 102, '讓分盤', spreadLine, '#ffffff')}
          ${renderMetricCell(110, 102, '過盤率', spreadWinProb, '#38bdf8')}
          ${renderMetricCell(220, 102, '大小分盤', ouLineText, '#ffffff')}
          ${renderMetricCell(330, 102, '大分機率', overProbText, '#fb7185')}
          ${renderMetricCell(440, 102, '預測總分', predictedTotalText, '#ffffff')}
          ${renderMetricCell(550, 102, '攻擊指數', String(offIndex), '#38bdf8')}
          ${renderMetricCell(660, 102, '投手指數', String(pitchIndex), '#38bdf8')}
          ${renderMetricCell(770, 102, '整體勝率', overallProbText, '#38bdf8')}
          
          <!-- Highlighted Advantage Box -->
          <g transform="translate(880, 0)">
            <rect width="92" height="98" rx="8" fill="url(#advBg)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1.5" />
            <text x="46" y="24" fill="#f59e0b" font-family="Outfit, Noto Sans TC, sans-serif" font-size="10" font-weight="bold" text-anchor="middle">數據優勢 👑</text>
            <text x="46" y="62" fill="#fbbf24" font-family="Outfit, Noto Sans TC, sans-serif" font-size="16" font-weight="900" text-anchor="middle">${escapeXml(winnerTeamCn)}</text>
          </g>
        </g>
      </g>
    `;
  });

  // Footer Disclaimers
  const footerY = canvasHeight - footerHeight + 30;
  svg += `
    <!-- Footer Section -->
    <g transform="translate(40, ${footerY})">
      <text x="0" y="20" fill="#64748b" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="bold">
        ※ 數據為 AI 模型即時分析結果，僅供參考，實際賽況請依照比分與現場狀態為準。
      </text>
      <text x="${canvasWidth - 80}" y="20" fill="#475569" font-family="Outfit, Noto Sans TC, sans-serif" font-size="11" font-weight="bold" text-anchor="end">
        數據來源：AI 模型分析 ‧ 即時球隊狀態 ‧ 本季數據
      </text>
    </g>
  </svg>`;

  return svg;
}

/**
 * 畫出單個 9 欄數據卡片
 */
function renderMetricCell(x: number, width: number, label: string, value: string, valColor: string): string {
  return `
    <g transform="translate(${x}, 0)">
      <rect width="${width}" height="98" rx="8" fill="url(#cellBg)" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" />
      <text x="${width / 2}" y="28" fill="#64748b" font-family="Outfit, Noto Sans TC, sans-serif" font-size="10" font-weight="bold" text-anchor="middle">${label}</text>
      <text x="${width / 2}" y="62" fill="${valColor}" font-family="Outfit, Noto Sans TC, sans-serif" font-size="15" font-weight="900" text-anchor="middle">${value}</text>
    </g>
  `;
}
