import React from 'react';
import type { GameWithTeams } from '@/types/sports';

export interface ModelPredictionItem {
  name: string;
  winner: 'home' | 'away';
  confidence: number;
  homeExpectedScore: number;
  awayExpectedScore: number;
  ouLine?: number;
  ouPick?: 'Over' | 'Under';
}

export interface ModelChessSpectrumProps {
  game: GameWithTeams;
  models: Record<string, ModelPredictionItem>;
  selectedModelTab: string;
  onSelectModel: (modelId: string) => void;
}

const MODEL_SPECS: Record<string, {
  id: string;
  shortName: string;
  chessIcon: string;
  colorClass: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
}> = {
  MetaModel: {
    id: 'MetaModel',
    shortName: '👑 Meta元模型',
    chessIcon: '👑',
    colorClass: 'text-amber-300',
    bgGradient: 'from-amber-500/25 via-yellow-500/20 to-amber-600/30',
    borderColor: 'border-amber-400/80',
    glowColor: 'shadow-amber-500/40',
  },
  SportsAI: {
    id: 'SportsAI',
    shortName: '🤖 SportsAI',
    chessIcon: '🤖',
    colorClass: 'text-blue-300',
    bgGradient: 'from-blue-500/25 via-cyan-500/20 to-blue-600/30',
    borderColor: 'border-blue-400/80',
    glowColor: 'shadow-blue-500/40',
  },
  EloRating: {
    id: 'EloRating',
    shortName: '📈 Elo戰力',
    chessIcon: '📈',
    colorClass: 'text-emerald-300',
    bgGradient: 'from-emerald-500/25 via-teal-500/20 to-emerald-600/30',
    borderColor: 'border-emerald-400/80',
    glowColor: 'shadow-emerald-500/40',
  },
  MonteCarlo: {
    id: 'MonteCarlo',
    shortName: '🎲 MonteCarlo',
    chessIcon: '🎲',
    colorClass: 'text-purple-300',
    bgGradient: 'from-purple-500/25 via-indigo-500/20 to-purple-600/30',
    borderColor: 'border-purple-400/80',
    glowColor: 'shadow-purple-500/40',
  },
  PitcherBullpen: {
    id: 'PitcherBullpen',
    shortName: '♟️ 對位模型',
    chessIcon: '♟️',
    colorClass: 'text-orange-300',
    bgGradient: 'from-orange-500/25 via-amber-500/20 to-orange-600/30',
    borderColor: 'border-orange-400/80',
    glowColor: 'shadow-orange-500/40',
  },
  QuantML: {
    id: 'QuantML',
    shortName: '🔬 QuantML',
    chessIcon: '🔬',
    colorClass: 'text-cyan-300',
    bgGradient: 'from-cyan-500/25 via-sky-500/20 to-cyan-600/30',
    borderColor: 'border-cyan-400/80',
    glowColor: 'shadow-cyan-500/40',
  },
};

/**
 * Model Chess Spectrum / Margin Scale Component
 * Renders an interactive margin scale ranging from Away +9 to Home +9 with 0.5-point tick marks.
 * Each AI prediction model is represented as a chess piece placed at its predicted margin.
 */
export const ModelChessSpectrum: React.FC<ModelChessSpectrumProps> = ({
  game,
  models,
  selectedModelTab,
  onSelectModel,
}) => {
  const awayName = game.awayTeam.nameCn || game.awayTeam.name || game.awayTeam.code;
  const homeName = game.homeTeam.nameCn || game.homeTeam.name || game.homeTeam.code;

  // Process models & calculate exact margin positions
  const modelKeys = ['MetaModel', 'SportsAI', 'EloRating', 'MonteCarlo', 'PitcherBullpen', 'QuantML'];
  
  interface ProcessedPiece {
    id: string;
    spec: typeof MODEL_SPECS[string];
    model: ModelPredictionItem;
    diff: number; // homeScore - awayScore
    roundedDiff: number; // rounded to 0.5
    pct: number; // 0% to 100% position on scale
    side: 'away' | 'home' | 'tie';
    marginLabel: string;
    level: number; // vertical lane offset for collision handling
  }

  const pieces: ProcessedPiece[] = [];

  modelKeys.forEach((key) => {
    const m = models[key];
    if (!m) return;

    const rawDiff = m.homeExpectedScore - m.awayExpectedScore;
    // Round to 0.5 step
    const roundedDiff = Math.round(rawDiff * 2) / 2;
    
    // Scale domain: -9 to +9 (18 point span)
    // Map -9 -> 4%, 0 -> 50%, +9 -> 96%
    const clampedDiff = Math.max(-9, Math.min(9, roundedDiff));
    const pct = ((clampedDiff - (-9)) / 18) * 92 + 4;

    let side: 'away' | 'home' | 'tie' = 'tie';
    let marginLabel = '0.0';
    if (roundedDiff > 0) {
      side = 'home';
      marginLabel = `+${roundedDiff.toFixed(1)}`;
    } else if (roundedDiff < 0) {
      side = 'away';
      marginLabel = `${roundedDiff.toFixed(1)}`; // negative for away
    }

    pieces.push({
      id: key,
      spec: MODEL_SPECS[key] || {
        id: key,
        shortName: key,
        chessIcon: '♟️',
        colorClass: 'text-gray-300',
        bgGradient: 'from-gray-700 to-gray-800',
        borderColor: 'border-gray-500',
        glowColor: 'shadow-gray-500/20',
      },
      model: m,
      diff: rawDiff,
      roundedDiff,
      pct,
      side,
      marginLabel,
      level: 0,
    });
  });

  // Sort by position to handle vertical stacking collision
  pieces.sort((a, b) => a.pct - b.pct);

  // Assign vertical stacking levels for items close to each other (< 12% horizontal gap)
  const lanes: number[] = []; // tracks max pct per lane
  pieces.forEach((piece) => {
    let assignedLane = 0;
    while (lanes[assignedLane] !== undefined && piece.pct - lanes[assignedLane] < 12) {
      assignedLane++;
    }
    piece.level = assignedLane;
    lanes[assignedLane] = piece.pct;
  });

  // Maximum height needed based on max collision lane level
  const maxLane = Math.max(0, ...pieces.map((p) => p.level));
  const containerHeightClass = maxLane >= 2 ? 'h-52' : maxLane === 1 ? 'h-44' : 'h-36';

  // Major ticks for labels (1..9 for left and right, and 0 in center)
  const majorNumbers = [
    { num: '9+', val: -9 },
    { num: '8', val: -8 },
    { num: '7', val: -7 },
    { num: '6', val: -6 },
    { num: '5', val: -5 },
    { num: '4', val: -4 },
    { num: '3', val: -3 },
    { num: '2', val: -2 },
    { num: '1', val: -1 },
    { num: '0', val: 0 },
    { num: '1', val: 1 },
    { num: '2', val: 2 },
    { num: '3', val: 3 },
    { num: '4', val: 4 },
    { num: '5', val: 5 },
    { num: '6', val: 6 },
    { num: '7', val: 7 },
    { num: '8', val: 8 },
    { num: '9+', val: 9 },
  ];

  // All 0.5 ticks for scale lines
  const halfTicks: number[] = [];
  for (let v = -9; v <= 9; v += 0.5) {
    halfTicks.push(v);
  }

  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-5 md:p-6 mb-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">♟️</span>
          <div>
            <h4 className="text-base md:text-lg font-black text-white tracking-wide flex items-center gap-2">
              模型預測分差棋盤對位 <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">0.5分級距</span>
            </h4>
            <p className="text-xs text-gray-400 font-sans mt-0.5">
              各模型預測分數分差標定在數線上（左: 客勝，右: 主勝）
            </p>
          </div>
        </div>

        {/* Legend / Selected active tag */}
        <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-mono">
          <span className="text-gray-400">目前選定:</span>
          <span className="font-bold text-amber-300 flex items-center gap-1">
            {MODEL_SPECS[selectedModelTab]?.chessIcon} {MODEL_SPECS[selectedModelTab]?.shortName || selectedModelTab}
          </span>
        </div>
      </div>

      {/* Team Labels Header */}
      <div className="flex justify-between items-center px-2 mb-3 text-xs md:text-sm font-black tracking-wide">
        {/* Away Team (Left) */}
        <div className="flex items-center gap-2 text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-xl border border-cyan-500/20">
          <span className="text-xs font-mono font-normal text-cyan-300">← 客隊</span>
          <span>{awayName} ({game.awayTeam.code})</span>
        </div>

        {/* Center indicator */}
        <div className="text-gray-400 text-xs font-mono font-bold bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
          平手 (0.0)
        </div>

        {/* Home Team (Right) */}
        <div className="flex items-center gap-2 text-orange-400 bg-orange-500/10 px-3 py-1 rounded-xl border border-orange-500/20">
          <span>{homeName} ({game.homeTeam.code})</span>
          <span className="text-xs font-mono font-normal text-orange-300">主隊 →</span>
        </div>
      </div>

      {/* Chess Board Scale Box */}
      <div className={`relative w-full ${containerHeightClass} bg-slate-950/80 rounded-2xl border border-white/10 p-2 shadow-inner transition-all duration-300`}>
        
        {/* Horizontal Baseline */}
        <div className="absolute left-4 right-4 bottom-8 h-1.5 rounded-full bg-gradient-to-r from-cyan-600/60 via-purple-500/50 to-orange-600/60 shadow-inner" />
        
        {/* Center Line (0) */}
        <div className="absolute left-1/2 bottom-5 top-2 w-0.5 bg-purple-400/50 border-r border-dashed border-purple-300/40 transform -translate-x-1/2 z-0" />

        {/* Scale Ticks (Half-points & Majors) */}
        <div className="absolute left-4 right-4 bottom-7 h-4 pointer-events-none">
          {halfTicks.map((val) => {
            const pct = ((val - (-9)) / 18) * 100;
            const isMajor = Number.isInteger(val);
            const isZero = val === 0;

            return (
              <div
                key={val}
                className="absolute transform -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${pct}%` }}
              >
                {/* Tick Line */}
                <div
                  className={`w-0.5 rounded-full ${
                    isZero
                      ? 'h-4 bg-purple-400'
                      : isMajor
                      ? 'h-3 bg-gray-400/80'
                      : 'h-1.5 bg-gray-600/60'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Number Labels Bar (1..9 on Left, 0 in center, 1..9 on Right) */}
        <div className="absolute left-4 right-4 bottom-1 h-5 flex items-center justify-between text-[11px] font-mono font-bold select-none">
          {majorNumbers.map((m) => {
            const pct = ((m.val - (-9)) / 18) * 100;
            const isZero = m.val === 0;
            const isAway = m.val < 0;
            return (
              <span
                key={`num-${m.val}`}
                className={`absolute transform -translate-x-1/2 ${
                  isZero
                    ? 'text-purple-300 font-extrabold text-xs'
                    : isAway
                    ? 'text-cyan-400/80'
                    : 'text-orange-400/80'
                }`}
                style={{ left: `${pct}%` }}
              >
                {m.num}
              </span>
            );
          })}
        </div>

        {/* Model Chess Pieces (Rendered above scale) */}
        {pieces.map((piece) => {
          const isSelected = selectedModelTab === piece.id;
          const bottomPx = 48 + piece.level * 44;

          return (
            <button
              key={piece.id}
              onClick={() => onSelectModel(piece.id)}
              className={`absolute transform -translate-x-1/2 transition-all duration-300 flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold shadow-lg group z-10 hover:z-30 cursor-pointer ${
                piece.spec.bgGradient
              } ${piece.spec.borderColor} ${
                isSelected
                  ? `ring-2 ring-white scale-110 shadow-xl ${piece.spec.glowColor} z-20`
                  : 'hover:scale-105 opacity-90 hover:opacity-100'
              }`}
              style={{
                left: `${piece.pct}%`,
                bottom: `${bottomPx}px`,
              }}
              title={`${piece.spec.shortName}: 客 ${piece.model.awayExpectedScore} vs 主 ${piece.model.homeExpectedScore} (預測分差: ${piece.marginLabel})`}
            >
              <span className="text-base leading-none drop-shadow">{piece.spec.chessIcon}</span>
              <div className="flex flex-col text-left leading-tight">
                <span className={`text-[11px] font-bold ${piece.spec.colorClass}`}>
                  {piece.spec.shortName}
                </span>
                <span className="text-[10px] font-mono font-extrabold text-white/90">
                  {piece.side === 'home' ? `主勝 ${piece.marginLabel}` : piece.side === 'away' ? `客勝 +${Math.abs(piece.roundedDiff)}` : '平手 0.0'}
                </span>
              </div>

              {/* Selection pointer triangle */}
              <div
                className={`absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
                  piece.spec.borderColor
                } ${isSelected ? 'bg-white' : 'bg-slate-900'}`}
              />
            </button>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs font-mono">
        {pieces.map((p) => (
          <div
            key={`foot-${p.id}`}
            onClick={() => onSelectModel(p.id)}
            className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              selectedModelTab === p.id
                ? 'bg-white/10 border-white/30 ring-1 ring-white/20'
                : 'bg-white/5 border-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-gray-300">{p.spec.chessIcon} {p.spec.shortName}</span>
              <span className={`font-black ${p.side === 'home' ? 'text-orange-400' : p.side === 'away' ? 'text-cyan-400' : 'text-purple-300'}`}>
                {p.side === 'home' ? `主+${p.roundedDiff}` : p.side === 'away' ? `客+${Math.abs(p.roundedDiff)}` : '0.0'}
              </span>
            </div>
            <div className="text-[10px] text-gray-400 font-sans mt-1 flex justify-between">
              <span>{p.model.awayExpectedScore} : {p.model.homeExpectedScore}</span>
              <span className="text-gray-300 font-bold">{p.model.confidence}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModelChessSpectrum;
