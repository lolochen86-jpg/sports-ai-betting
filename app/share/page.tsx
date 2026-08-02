'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getTeamNameCn } from '@/lib/sports-api/team-translations';
import type { GameWithTeams, League } from '@/types/sports';

// Inline SVGs for Navigation & UI
const BallIcon = ({ type, className = "w-5 h-5" }: { type: 'NBA' | 'MLB', className?: string }) => {
  if (type === 'NBA') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M6.2 6.2c2.4 2.4 2.4 6.4 0 8.8" />
        <path d="M17.8 6.2c-2.4 2.4-2.4 6.4 0 8.8" />
        <path d="M2 12h20" />
        <path d="M12 2v20" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
      <path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10" />
      <path d="M2 12h20" />
    </svg>
  );
};

const CpuIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="16" height="16" x="4" y="4" rx="2" />
    <rect width="6" height="6" x="9" y="9" rx="1" />
    <path d="M9 1v3" />
    <path d="M15 1v3" />
    <path d="M9 20v3" />
    <path d="M15 20v3" />
    <path d="M20 9h3" />
    <path d="M20 15h3" />
    <path d="M1 9h3" />
    <path d="M1 15h3" />
  </svg>
);

const CalendarIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </svg>
);

const DownloadIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

// Map team codes to beautiful gradients for Canvas logos
function getTeamGradient(code: string): [string, string] {
  const upper = code.toUpperCase();
  const colors: Record<string, [string, string]> = {
    // NBA
    LAL: ['#552583', '#FDB927'], // Purple/Gold
    BOS: ['#007A33', '#10B981'], // Green/Emerald
    GSW: ['#1D428A', '#FFC72C'], // Blue/Yellow
    GS: ['#1D428A', '#FFC72C'],
    BKN: ['#111111', '#555555'], // Dark/Gray
    CHI: ['#CE1141', '#111111'], // Red/Black
    MIA: ['#98002E', '#F9A01B'], // Crimson/Orange
    PHX: ['#1D1160', '#E56020'], // Purple/Orange
    DAL: ['#00538C', '#4f46e5'], // Blue/Indigo
    DEN: ['#0E2240', '#FEC524'], // Navy/Gold
    MIL: ['#00471B', '#a78bfa'], // Green/Lavender
    PHI: ['#006BB6', '#ED174C'], // Blue/Red
    LAC: ['#C8102E', '#1D428A'], // Red/Blue
    NYK: ['#006BB6', '#F58426'], // Blue/Orange
    NY: ['#006BB6', '#F58426'],
    OKC: ['#007AC1', '#EF3B24'], // Light Blue/Red-Orange
    CLE: ['#860038', '#FDBB30'], // Wine/Gold
    IND: ['#002D62', '#FDBB30'], // Navy/Yellow
    MEM: ['#5D76A9', '#12284C'], // Grizzly Blue/Navy
    NOP: ['#0C2340', '#C8102E'], // Navy/Red
    NO: ['#0C2340', '#C8102E'],
    ORL: ['#0077C0', '#C4CED4'], // Blue/Silver
    POR: ['#E03A3E', '#000000'], // Red/Black
    SAC: ['#5A2D81', '#6366f1'], // Purple/Indigo
    SAS: ['#111111', '#C4CED4'], // Silver/Black
    SA: ['#111111', '#C4CED4'],
    TOR: ['#CE1141', '#000000'], // Red/Black
    UTA: ['#002B5C', '#F9A01B'], // Jazz Navy/Gold
    UTAH: ['#002B5C', '#F9A01B'],
    WAS: ['#002B5C', '#E31837'], // Navy/Red
    WSH: ['#002B5C', '#E31837'],
    ATL: ['#E03A3E', '#C4CED4'], // Red/Silver
    CHA: ['#1D1160', '#00788C'], // Purple/Teal
    DET: ['#C8102E', '#1D428A'], // Red/Blue
    MIN: ['#0C2340', '#236192'], // Navy/Blue
    // MLB
    NYY: ['#0C2340', '#1d4ed8'], // Navy/Blue
    LAD: ['#005A9C', '#3b82f6'], // Dodger Blue/Sky Blue
    SF: ['#FD5A1E', '#111111'],  // Orange/Black
    SFG: ['#FD5A1E', '#111111'],
    HOU: ['#002D62', '#EB6E1F'], // Navy/Orange
    BAL: ['#DF4601', '#111111'], // Orange/Black
    CHC: ['#0E3386', '#CC3433'], // Blue/Red
    OAK: ['#003831', '#EEB211'], // Green/Gold
    SD: ['#2F241D', '#FFC72C'],  // Brown/Yellow
    SEA: ['#0C2C56', '#005C5C'], // Navy/Teal
    TEX: ['#003278', '#C0111F'], // Blue/Red
    TOR_MLB: ['#13274F', '#0a84ff'],
    WSH_MLB: ['#AB0003', '#11225B'],
    MIA_MLB: ['#00A3E0', '#EF426F'],
    TB: ['#092C5C', '#8FBCE6'],  // Navy/Light Blue
    MIL_MLB: ['#12284C', '#FFC72C'],
    MIN_MLB: ['#002B5C', '#D31145'],
    KC: ['#004687', '#74B9E7'],  // Royals Blue/Light Blue
    DET_MLB: ['#0C2340', '#fa5252'],
    CWS: ['#111111', '#666666'],  // Black/Gray
    CLE_MLB: ['#0C2340', '#E31937'],
    COL: ['#333366', '#222222'],  // Purple/Black
    CIN: ['#C6011F', '#000000'],  // Red/Black
    STL: ['#C41E3A', '#002F6C'],  // Red/Blue
    PIT: ['#111111', '#FFB81C'],  // Black/Yellow
    PHI_MLB: ['#E81828', '#2980b9'],
    NYM: ['#002C77', '#FF5910'],  // Blue/Orange
    ATL_MLB: ['#13274F', '#CE1141'],
    AZ: ['#A71930', '#E3D4AD'],  // Sedona Red/Sand
  };

  if (colors[upper]) return colors[upper];
  
  // Deterministic HSL gradient fallback based on string hash
  let hash = 0;
  for (let i = 0; i < upper.length; i++) {
    hash = upper.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 140) % 360;
  return [`hsl(${hue1}, 75%, 45%)`, `hsl(${hue2}, 70%, 40%)`];
}

function getDisplayConfidence(confidence: number) {
  if (confidence === undefined || confidence === null) return 0;
  return confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100);
}

export default function SharePage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Initialize with local date in YYYY-MM-DD
    const local = new Date();
    const offset = local.getTimezoneOffset() * 60000;
    const localTime = new Date(local.getTime() - offset);
    return localTime.toISOString().split('T')[0];
  });
  const [activeLeague, setActiveLeague] = useState<League | 'ALL'>('ALL');
  const [mode, setMode] = useState<'prediction' | 'meta' | 'completed'>('prediction');
  
  const [games, setGames] = useState<GameWithTeams[]>([]);
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State for sharing image
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [shareImage, setShareImage] = useState<string | null>(null);
  const [rendering, setRendering] = useState<boolean>(false);

  // Fetch games and predictions
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both APIs in parallel
      const [gamesRes, predictionsRes] = await Promise.all([
        fetch(`/api/games?date=${selectedDate}`),
        fetch(`/api/predictions?date=${selectedDate}`)
      ]);

      if (!gamesRes.ok) throw new Error(`獲取賽事失敗 (${gamesRes.status})`);
      if (!predictionsRes.ok) throw new Error(`獲取預測失敗 (${predictionsRes.status})`);

      const gamesData = await gamesRes.json();
      const predictionsData = await predictionsRes.json();

      if (gamesData.success) {
        setGames(gamesData.data);
      } else {
        throw new Error(gamesData.error || '獲取賽事失敗');
      }

      if (predictionsData.success) {
        const predMap: Record<string, any> = {};
        predictionsData.data.forEach((item: any) => {
          if (item.prediction) {
            predMap[item.gameId] = item.prediction;
          }
        });
        setPredictions(predMap);
      } else {
        throw new Error(predictionsData.error || '獲取預測失敗');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '資料加載時發生錯誤');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter games based on League & Mode
  const getFilteredGames = () => {
    let list = games;

    // Filter by League
    if (activeLeague !== 'ALL') {
      list = list.filter(g => g.league === activeLeague);
    }

    // Filter by Mode
    if (mode === 'completed') {
      // Show completed games first, but we can also display scheduled ones with '--' scores
      // To keep card grid neat and relevant to "完賽分數", we sort completed games to the top
      return [...list].sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return -1;
        if (a.status !== 'completed' && b.status === 'completed') return 1;
        return 0;
      });
    }

    return list;
  };

  const filteredGames = getFilteredGames();

  // Draw Rounded Rectangle Helper
  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Generate and Render Canvas Card Grid
  const generateShareCard = async () => {
    if (filteredGames.length === 0) return;
    setRendering(true);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('無法創建 2D Canvas');

      // Set dimensions
      const canvasWidth = 1200;
      const headerHeight = 220;
      const footerHeight = 120;
      
      const cardWidth = 535;
      const cardHeight = 180;
      const cardSpacingX = 30;
      const cardSpacingY = 25;
      const paddingX = 50;

      const numRows = Math.ceil(filteredGames.length / 2);
      const canvasHeight = headerHeight + numRows * (cardHeight + cardSpacingY) + footerHeight;

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Ensure crisp rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 1. Draw Background Gradient (Deep violet to dark blue/indigo sports theme)
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      bgGradient.addColorStop(0, '#0a0d16');
      bgGradient.addColorStop(0.3, '#0f172a');
      bgGradient.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 2. Draw Subtle Sporty Background Stripes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.lineWidth = 2;
      for (let i = -1000; i < canvasWidth + 1000; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 800, canvasHeight);
        ctx.stroke();
      }

      // Draw Top & Bottom Glowing Orbs
      const topGlow = ctx.createRadialGradient(200, 100, 0, 200, 100, 400);
      topGlow.addColorStop(0, 'rgba(139, 92, 246, 0.08)');
      topGlow.addColorStop(1, 'rgba(139, 92, 246, 0)');
      ctx.fillStyle = topGlow;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const bottomGlow = ctx.createRadialGradient(1000, canvasHeight - 100, 0, 1000, canvasHeight - 100, 500);
      bottomGlow.addColorStop(0, 'rgba(6, 182, 212, 0.06)');
      bottomGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = bottomGlow;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 3. Draw Header
      // Accent glowing line
      ctx.fillStyle = '#8b5cf6';
      ctx.fillRect(0, 0, canvasWidth, 6);

      // SPORTS.AI Logo
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 36px Outfit, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('SPORTS.AI', 50, 45);

      // Logo Subtitle
      ctx.fillStyle = 'rgba(139, 92, 246, 0.8)';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.fillText('智能大數據分析平台', 50, 87);

      // Mode Badge Indicator (Right)
      let modeText = '🏆 完賽最終得分字卡';
      let badgeColor = '#10b981';
      if (mode === 'prediction') {
        modeText = '🤖 SportsAI 預測得分字卡';
        badgeColor = '#8b5cf6';
      } else if (mode === 'meta') {
        modeText = '👑 Meta 元模型預測字卡';
        badgeColor = '#d97706';
      }

      ctx.textAlign = 'right';
      // Draw Mode Badge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, 950, 45, 200, 38, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      ctx.arc(970, 64, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Outfit, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(modeText, 1135, 64);

      // Calendar Date Box (Left bottom header)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px Outfit, sans-serif';
      ctx.fillText(`日期: ${selectedDate}`, 50, 125);

      // Separator Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, 165);
      ctx.lineTo(1150, 165);
      ctx.stroke();

      // 4. Draw Match Cards
      filteredGames.forEach((game, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);

        const cardX = paddingX + col * (cardWidth + cardSpacingX);
        const cardY = headerHeight + row * (cardHeight + cardSpacingY);

        // Get prediction if exists
        const pred = predictions[game.id];

        // Draw Card Glassmorphic Background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
        // Hover border styling based on league
        ctx.strokeStyle = game.league === 'NBA' ? 'rgba(251, 146, 60, 0.15)' : 'rgba(34, 211, 238, 0.15)';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 18);
        ctx.fill();
        ctx.stroke();

        // A. League & Status Badge
        // League Badge
        const leagueColor = game.league === 'NBA' ? '#ff6b00' : '#005A9C';
        ctx.fillStyle = leagueColor;
        drawRoundedRect(ctx, cardX + 20, cardY + 18, 50, 22, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(game.league, cardX + 45, cardY + 29);

        // Game Status Text
        let statusStr = '';
        let statusColor = '#94a3b8';
        if (game.status === 'completed') {
          statusStr = '已完賽';
          statusColor = '#10b981'; // green
        } else if (game.status === 'live') {
          statusStr = '進行中';
          statusColor = '#ef4444'; // red
        } else {
          statusStr = '未開始';
          statusColor = '#3b82f6'; // blue
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        drawRoundedRect(ctx, cardX + 80, cardY + 18, 65, 22, 6);
        ctx.fill();

        ctx.fillStyle = statusColor;
        ctx.font = 'bold 11px Outfit, sans-serif';
        ctx.fillText(statusStr, cardX + 112.5, cardY + 29);

        // B. VS Text (Center Divider)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = 'italic 800 16px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VS', cardX + 267.5, cardY + 85);

        // C. Away Team (Left Side)
        const awayGrad = getTeamGradient(game.awayTeam.code);
        const awayCircleGrad = ctx.createRadialGradient(cardX + 50, cardY + 80, 5, cardX + 50, cardY + 80, 25);
        awayCircleGrad.addColorStop(0, awayGrad[1]);
        awayCircleGrad.addColorStop(1, awayGrad[0]);

        ctx.fillStyle = awayCircleGrad;
        ctx.beginPath();
        ctx.arc(cardX + 50, cardY + 80, 25, 0, Math.PI * 2);
        ctx.fill();

        // Stroke for logo circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Team Letters
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(game.awayTeam.code.substring(0, 3), cardX + 50, cardY + 80);

        // Team Name Chinese
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(getTeamNameCn(game.awayTeam.code, game.league), cardX + 88, cardY + 80);

        // D. Home Team (Right Side)
        const homeGrad = getTeamGradient(game.homeTeam.code);
        const homeCircleGrad = ctx.createRadialGradient(cardX + 485, cardY + 80, 5, cardX + 485, cardY + 80, 25);
        homeCircleGrad.addColorStop(0, homeGrad[1]);
        homeCircleGrad.addColorStop(1, homeGrad[0]);

        ctx.fillStyle = homeCircleGrad;
        ctx.beginPath();
        ctx.arc(cardX + 485, cardY + 80, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(game.homeTeam.code.substring(0, 3), cardX + 485, cardY + 80);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(getTeamNameCn(game.homeTeam.code, game.league), cardX + 447, cardY + 80);

        // E. Scores (Depends on Mode)
        let awayScoreDisp = '--';
        let homeScoreDisp = '--';

        if (mode === 'prediction') {
          if (pred && pred.models && pred.models.SportsAI) {
            awayScoreDisp = Number(pred.models.SportsAI.awayExpectedScore).toFixed(1);
            homeScoreDisp = Number(pred.models.SportsAI.homeExpectedScore).toFixed(1);
          }
        } else if (mode === 'meta') {
          if (pred && pred.models && pred.models.MetaModel) {
            awayScoreDisp = Number(pred.models.MetaModel.awayExpectedScore).toFixed(1);
            homeScoreDisp = Number(pred.models.MetaModel.homeExpectedScore).toFixed(1);
          }
        } else {
          // Completed real score mode
          if (game.homeScore !== null && game.awayScore !== null) {
            awayScoreDisp = String(game.awayScore);
            homeScoreDisp = String(game.homeScore);
          }
        }

        // Render Away Score
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px Outfit, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(awayScoreDisp, cardX + 225, cardY + 80);

        // Render Home Score
        ctx.textAlign = 'left';
        ctx.fillText(homeScoreDisp, cardX + 310, cardY + 80);

        // F. Card Footer Info
        // Separator line inside card
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardX + 20, cardY + 128);
        ctx.lineTo(cardX + 515, cardY + 128);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (mode === 'prediction') {
          if (pred) {
            const sportsAIPred = pred.models?.SportsAI;
            const predWinner = sportsAIPred?.winner || pred.winner;
            const predConfidence = sportsAIPred?.confidence || pred.confidence;
            
            const winnerCn = predWinner === 'home' 
              ? getTeamNameCn(game.homeTeam.code, game.league)
              : getTeamNameCn(game.awayTeam.code, game.league);
            const conf = getDisplayConfidence(predConfidence);

            ctx.fillStyle = 'rgba(167, 139, 250, 0.9)'; // Purple-300
            ctx.font = '800 12px Outfit, sans-serif';
            ctx.fillText(`★ SportsAI 預估: ${winnerCn}勝 (${conf}% 信心)`, cardX + 267.5, cardY + 152);
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.font = 'bold 12px Outfit, sans-serif';
            ctx.fillText('暫無預測計算數據', cardX + 267.5, cardY + 152);
          }
        } else if (mode === 'meta') {
          if (pred) {
            const metaPred = pred.models?.MetaModel;
            const predWinner = metaPred?.winner || pred.winner;
            const predConfidence = metaPred?.confidence || pred.confidence;

            const winnerCn = predWinner === 'home' 
              ? getTeamNameCn(game.homeTeam.code, game.league)
              : getTeamNameCn(game.awayTeam.code, game.league);
            const conf = getDisplayConfidence(predConfidence);

            ctx.fillStyle = 'rgba(251, 191, 36, 0.9)'; // Amber-400
            ctx.font = '800 12px Outfit, sans-serif';
            ctx.fillText(`★ Meta 預估: ${winnerCn}勝 (${conf}% 信心)`, cardX + 267.5, cardY + 152);
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.font = 'bold 12px Outfit, sans-serif';
            ctx.fillText('暫無預測計算數據', cardX + 267.5, cardY + 152);
          }
        } else {
          // Completed mode footer info
          if (game.status === 'completed' && game.homeScore !== null && game.awayScore !== null) {
            const actualWinnerCn = game.homeScore > game.awayScore
              ? getTeamNameCn(game.homeTeam.code, game.league)
              : getTeamNameCn(game.awayTeam.code, game.league);

            let accuracyStr = '';
            if (pred) {
              const actualWinner = game.homeScore > game.awayScore ? 'home' : 'away';
              const metaPred = pred.models?.MetaModel;
              const predCorrect = (metaPred?.winner || pred.winner) === actualWinner;
              accuracyStr = predCorrect ? ' | 🎯 預測精準命中' : ' | ❌ 預測偏差';
            }

            ctx.fillStyle = 'rgba(16, 185, 129, 0.9)'; // Green-500
            ctx.font = '800 12px Outfit, sans-serif';
            ctx.fillText(`實際勝隊: ${actualWinnerCn}${accuracyStr}`, cardX + 267.5, cardY + 152);
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.font = 'bold 12px Outfit, sans-serif';
            ctx.fillText('比賽尚未完賽，暫無最終賽果', cardX + 267.5, cardY + 152);
          }
        }
      });

      // 5. Draw Footer
      const footerY = canvasHeight - footerHeight;
      // Watermark Text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.font = 'bold 13px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('大數據驅動 · 智能決策看盤 · SPORTS.AI 戰報中心', canvasWidth / 2, footerY + 45);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText('不要為了湊關硬買，低賠不等於安全', canvasWidth / 2, footerY + 75);

      // Convert to image
      const dataUrl = canvas.toDataURL('image/png');
      setShareImage(dataUrl);
      setModalOpen(true);
    } catch (err) {
      console.error(err);
      alert('生成圖片時出錯，請重試！');
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="flex-1 w-full min-h-screen bg-[#030712] cyber-grid relative pb-20 text-gray-100 flex flex-col font-sans">
      {/* Background neon blobs */}
      <div className="absolute top-[-200px] left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[100px] right-1/4 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none" />

      {/* ───── 1. Navbar ───── */}
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
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                分享字卡
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8 font-bold text-sm text-gray-300">
            <Link href="/" className="hover:text-purple-400 transition-colors">決策看盤中心</Link>
            <Link href="/smart-parlays" className="hover:text-amber-400 text-amber-400 font-extrabold transition-colors">🎯 智慧二關</Link>
            <Link href="/compare" className="hover:text-purple-400 transition-colors">🔬 新舊模型對照</Link>
            <Link href="/backtest" className="hover:text-purple-400 transition-colors">歷史量化回測</Link>
            <Link href="/history" className="hover:text-purple-400 transition-colors">完賽記錄簿</Link>
            <span className="text-white border-b-2 border-purple-500 pb-1">📸 戰報字卡</span>
            <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black transition-colors">🎰 運彩下注</Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping" />
              <span className="text-xs font-mono font-black text-purple-400">字卡生成器在線</span>
            </div>
          </div>
        </div>
        {/* Mobile Navigation Links */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto whitespace-nowrap pt-3 mt-3 border-t border-white/5 text-xs scrollbar-none font-bold text-gray-300">
          <Link href="/" className="hover:text-purple-400 shrink-0">決策看盤</Link>
          <Link href="/smart-parlays" className="hover:text-amber-400 text-amber-400 font-extrabold shrink-0">🎯 智慧二關</Link>
          <Link href="/compare" className="hover:text-purple-400 shrink-0">🔬 對照</Link>
          <Link href="/backtest" className="hover:text-purple-400 shrink-0">量化回測</Link>
          <Link href="/history" className="hover:text-purple-400 shrink-0">完賽記錄</Link>
          <span className="text-white border-b-2 border-purple-500 pb-0.5 shrink-0">📸 戰報字卡</span>
          <Link href="/betting" className="hover:text-amber-400 text-amber-500/90 font-black shrink-0">🎰 下注</Link>
        </div>
      </nav>

      {/* ───── 2. Main content ───── */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 space-y-8 flex-grow">
        
        {/* Page Hero Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <span className="text-purple-500">📸</span> 戰報分享字卡生成器
            </h1>
            <p className="text-sm text-gray-400 mt-1">自訂賽事看板 · 一鍵繪製高解析度圖片 · 便於社群分享交流</p>
          </div>

          {/* Action button */}
          {filteredGames.length > 0 && (
            <button
              onClick={generateShareCard}
              disabled={rendering}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-sm font-extrabold text-white rounded-xl shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rendering ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  繪製圖片中...
                </>
              ) : (
                <>
                  <DownloadIcon className="w-4 h-4" />
                  生成分享字卡
                </>
              )}
            </button>
          )}
        </div>

        {/* ───── 3. Filter Options Panel ───── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          
          {/* Calendar Picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5" /> 選擇比賽日期
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-purple-500 transition-colors cursor-pointer w-full"
            />
          </div>

          {/* League Tabs */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-purple-300 uppercase tracking-widest">
              🏀⚾ 聯盟篩選
            </label>
            <div className="grid grid-cols-3 p-1 bg-white/5 rounded-xl border border-white/10 w-full">
              <button
                onClick={() => setActiveLeague('ALL')}
                className={`py-2 rounded-lg text-xs font-black transition-all ${activeLeague === 'ALL' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                全部
              </button>
              <button
                onClick={() => setActiveLeague('NBA')}
                className={`py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeLeague === 'NBA' ? 'bg-[#ff6b00] text-white shadow-md shadow-orange-500/20' : 'text-gray-400 hover:text-white'}`}
              >
                <BallIcon type="NBA" className="w-3.5 h-3.5" />
                NBA
              </button>
              <button
                onClick={() => setActiveLeague('MLB')}
                className={`py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeLeague === 'MLB' ? 'bg-cyan-600 text-white shadow-md shadow-cyan-500/20' : 'text-gray-400 hover:text-white'}`}
              >
                <BallIcon type="MLB" className="w-3.5 h-3.5" />
                MLB
              </button>
            </div>
          </div>

          {/* Mode Toggles */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-purple-300 uppercase tracking-widest">
              📊 字卡展示模式
            </label>
            <div className="grid grid-cols-3 p-1 bg-white/5 rounded-xl border border-white/10 w-full">
              <button
                onClick={() => setMode('prediction')}
                className={`py-2 rounded-lg text-xs font-black transition-all ${mode === 'prediction' ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20' : 'text-gray-400 hover:text-white'}`}
              >
                🤖 SportsAI 預測
              </button>
              <button
                onClick={() => setMode('meta')}
                className={`py-2 rounded-lg text-xs font-black transition-all ${mode === 'meta' ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20' : 'text-gray-400 hover:text-white'}`}
              >
                👑 Meta 元模型
              </button>
              <button
                onClick={() => setMode('completed')}
                className={`py-2 rounded-lg text-xs font-black transition-all ${mode === 'completed' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' : 'text-gray-400 hover:text-white'}`}
              >
                🏆 完賽真實比分
              </button>
            </div>
          </div>

        </div>

        {/* ───── 4. Live Preview Grid ───── */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-lg font-black text-gray-200">
              看板預覽 ({filteredGames.length} 場賽事)
            </h3>
            <span className="text-xs text-gray-400 font-mono">
              不要為了湊關硬買，低賠不等於安全
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-2xl space-y-4">
              <svg className="animate-spin h-8 w-8 text-purple-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-semibold text-gray-400">正在分析載入賽事與 AI 數據...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 bg-red-950/10 border border-red-900/20 rounded-2xl space-y-3">
              <span className="text-3xl">⚠️</span>
              <p className="text-sm font-bold text-red-400">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-xs font-black text-red-300 rounded-lg border border-red-500/20 transition-all active:scale-95"
              >
                重新載入
              </button>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-2xl space-y-2">
              <span className="text-4xl">📭</span>
              <p className="text-sm font-black text-gray-400 mt-2">今日在此篩選條件下沒有賽事</p>
              <p className="text-xs text-gray-500">可嘗試切換其他日期或聯盟進行查看</p>
            </div>
          ) : (
            // Cards Grid
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredGames.map((game) => {
                const pred = predictions[game.id];
                const awayGradient = getTeamGradient(game.awayTeam.code);
                const homeGradient = getTeamGradient(game.homeTeam.code);

                // Mode Scores
                let awayScoreDisp = '--';
                let homeScoreDisp = '--';

                if (mode === 'prediction') {
                  if (pred && pred.models && pred.models.SportsAI) {
                    awayScoreDisp = Number(pred.models.SportsAI.awayExpectedScore).toFixed(1);
                    homeScoreDisp = Number(pred.models.SportsAI.homeExpectedScore).toFixed(1);
                  }
                } else if (mode === 'meta') {
                  if (pred && pred.models && pred.models.MetaModel) {
                    awayScoreDisp = Number(pred.models.MetaModel.awayExpectedScore).toFixed(1);
                    homeScoreDisp = Number(pred.models.MetaModel.homeExpectedScore).toFixed(1);
                  }
                } else {
                  if (game.homeScore !== null && game.awayScore !== null) {
                    awayScoreDisp = String(game.awayScore);
                    homeScoreDisp = String(game.homeScore);
                  }
                }

                return (
                  <div
                    key={game.id}
                    className="glass-panel rounded-2xl border border-white/5 p-5 flex flex-col justify-between space-y-4 hover:border-purple-500/25 transition-all shadow-lg"
                  >
                    {/* Header: League & Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black text-white ${game.league === 'NBA' ? 'bg-[#ff6b00]' : 'bg-[#005A9C]'}`}>
                          {game.league}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 text-gray-400 border border-white/5">
                          {game.status === 'completed' ? '已完賽' : game.status === 'live' ? '進行中' : '未開始'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-gray-500">ID: {game.id}</span>
                    </div>

                    {/* Match Score Display */}
                    <div className="flex items-center justify-between py-2">
                      {/* Away Team */}
                      <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                        <div
                          style={{
                            background: `linear-gradient(135deg, ${awayGradient[0]}, ${awayGradient[1]})`
                          }}
                          className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-black text-white shadow-md border border-white/10 shrink-0 select-none"
                        >
                          {game.awayTeam.code.substring(0, 3)}
                        </div>
                        <div className="truncate">
                          <h4 className="text-sm font-black text-white truncate">
                            {getTeamNameCn(game.awayTeam.code, game.league)}
                          </h4>
                          <span className="text-[10px] font-mono font-bold text-gray-500">{game.awayTeam.code}</span>
                        </div>
                      </div>

                      {/* Score or VS */}
                      <div className="flex items-center justify-center space-x-2.5 px-3 shrink-0 text-center font-mono">
                        <span className="text-xl font-black text-white">
                          {awayScoreDisp}
                        </span>
                        <span className="text-xs italic font-black text-gray-500 select-none">VS</span>
                        <span className="text-xl font-black text-white">
                          {homeScoreDisp}
                        </span>
                      </div>

                      {/* Home Team */}
                      <div className="flex items-center space-x-2.5 flex-1 min-w-0 justify-end text-right">
                        <div className="truncate">
                          <h4 className="text-sm font-black text-white truncate">
                            {getTeamNameCn(game.homeTeam.code, game.league)}
                          </h4>
                          <span className="text-[10px] font-mono font-bold text-gray-500">{game.homeTeam.code}</span>
                        </div>
                        <div
                          style={{
                            background: `linear-gradient(135deg, ${homeGradient[0]}, ${homeGradient[1]})`
                          }}
                          className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-black text-white shadow-md border border-white/10 shrink-0 select-none"
                        >
                          {game.homeTeam.code.substring(0, 3)}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: AI analysis factors */}
                    <div className="pt-3 border-t border-white/5 text-center">
                      {mode === 'prediction' ? (
                        pred ? (
                          <div className="text-[11px] font-bold text-purple-300 bg-purple-500/10 py-1.5 px-3 rounded-lg border border-purple-500/10 inline-block">
                            ★ SportsAI 預估: {(pred.models?.SportsAI?.winner || pred.winner) === 'home' ? getTeamNameCn(game.homeTeam.code, game.league) : getTeamNameCn(game.awayTeam.code, game.league)}勝 ({getDisplayConfidence(pred.models?.SportsAI?.confidence || pred.confidence)}% 信心)
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">暫無預測數據</span>
                        )
                      ) : mode === 'meta' ? (
                        pred ? (
                          <div className="text-[11px] font-bold text-amber-300 bg-amber-500/10 py-1.5 px-3 rounded-lg border border-amber-500/10 inline-block">
                            ★ Meta 預估: {(pred.models?.MetaModel?.winner || pred.winner) === 'home' ? getTeamNameCn(game.homeTeam.code, game.league) : getTeamNameCn(game.awayTeam.code, game.league)}勝 ({getDisplayConfidence(pred.models?.MetaModel?.confidence || pred.confidence)}% 信心)
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">暫無預測數據</span>
                        )
                      ) : (
                        game.status === 'completed' && game.homeScore !== null && game.awayScore !== null ? (
                          <div className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 py-1.5 px-3 rounded-lg border border-emerald-500/10 inline-block">
                            實際勝隊: {game.homeScore > game.awayScore ? getTeamNameCn(game.homeTeam.code, game.league) : getTeamNameCn(game.awayTeam.code, game.league)}
                            {pred && (
                              <span className="ml-1 opacity-80 border-l border-emerald-500/25 pl-1.5">
                                {(pred.models?.MetaModel?.winner || pred.winner) === (game.homeScore > game.awayScore ? 'home' : 'away') ? '🎯 預測命中' : '❌ 預測未命中'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">賽事未完賽，暫無最終得分</span>
                        )
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      {/* ───── 5. Image Preview & Download Modal ───── */}
      {modalOpen && shareImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#0b0f19] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>🖼️</span> 戰報分享字卡預覽
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Image Body */}
            <div className="p-6 overflow-y-auto flex-grow flex items-center justify-center bg-black/20">
              <img
                src={shareImage}
                alt="Sports AI Scorecard"
                className="max-w-full max-h-[60vh] object-contain rounded-xl border border-white/10 shadow-lg"
              />
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0a0d16]">
              <div className="flex items-center gap-2 text-xs text-amber-400 font-bold">
                <span>💡</span> 提示：行動端用戶可直接【長按圖片】進行儲存或分享。
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-1/2 sm:w-auto px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black text-gray-300 rounded-xl transition-all"
                >
                  取消
                </button>
                <a
                  href={shareImage}
                  download={`sports-ai-${selectedDate}-${mode}.png`}
                  className="w-1/2 sm:w-auto px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-black text-white rounded-xl shadow-lg shadow-purple-500/20 text-center flex items-center justify-center gap-2"
                >
                  <DownloadIcon className="w-4 h-4" />
                  下載高畫質 PNG
                </a>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
