import type { League } from '@/types/sports';

export interface OfficialTendencyInfo {
  name: string;
  league: League;
  strikeZoneBias?: 'wide' | 'tight' | 'neutral'; // MLB
  foulCallRate?: 'high' | 'average' | 'low';      // NBA
  overUnderTendency: 'over_friendly' | 'neutral' | 'under_friendly';
  avgTotalPointsOrRuns: number;
  description: string;
  specialNotes?: string;
}

// ─── MLB Umpires Data Sample ───
export const MLB_UMPIRES: Record<string, OfficialTendencyInfo> = {
  'Angel Hernandez': {
    name: 'Angel Hernandez',
    league: 'MLB',
    strikeZoneBias: 'wide',
    overUnderTendency: 'under_friendly',
    avgTotalPointsOrRuns: 7.8,
    description: '主審 Angel Hernandez (好球帶較大且不可預測，打者三振率較高，有利於小分)',
    specialNotes: '🧢 壞球判好球率高，壓制得分'
  },
  'Pat Hoberg': {
    name: 'Pat Hoberg',
    league: 'MLB',
    strikeZoneBias: 'tight',
    overUnderTendency: 'over_friendly',
    avgTotalPointsOrRuns: 9.4,
    description: '主審 Pat Hoberg (好球帶極度精確嚴格，四壞保送較多，有利於打者發揮與大分)',
    specialNotes: '🔥 精準好球帶增加保送率'
  },
  'CB Bucknor': {
    name: 'CB Bucknor',
    league: 'MLB',
    strikeZoneBias: 'wide',
    overUnderTendency: 'under_friendly',
    avgTotalPointsOrRuns: 8.1,
    description: '主審 CB Bucknor (好球帶較寬，投手具邊角好球優勢)'
  },
  'Doug Eddings': {
    name: 'Doug Eddings',
    league: 'MLB',
    strikeZoneBias: 'tight',
    overUnderTendency: 'over_friendly',
    avgTotalPointsOrRuns: 9.6,
    description: '主審 Doug Eddings (嚴格好球帶，單場平均保送數偏高，大分率 58%)'
  }
};

// ─── NBA Referees Data Sample ───
export const NBA_REFEREES: Record<string, OfficialTendencyInfo> = {
  'Scott Foster': {
    name: 'Scott Foster',
    league: 'NBA',
    foulCallRate: 'high',
    overUnderTendency: 'over_friendly',
    avgTotalPointsOrRuns: 226.5,
    description: '資深裁判 Scott Foster (吹哨頻率較高，罰球次數多，賽事停頓頻繁，大分傾向高)',
    specialNotes: '🏀 哨音嚴格增加罰球次數'
  },
  'Tony Brothers': {
    name: 'Tony Brothers',
    league: 'NBA',
    foulCallRate: 'high',
    overUnderTendency: 'over_friendly',
    avgTotalPointsOrRuns: 228.0,
    description: '資深裁判 Tony Brothers (身體接觸執法嚴格，罰球次數高於常態 8%)'
  },
  'Marc Davis': {
    name: 'Marc Davis',
    league: 'NBA',
    foulCallRate: 'low',
    overUnderTendency: 'under_friendly',
    avgTotalPointsOrRuns: 217.5,
    description: '裁判 Marc Davis (允許較多身體對抗，吹哨較鬆，比賽流暢利於防守戰，偏向小分)'
  },
  'Zach Zarba': {
    name: 'Zach Zarba',
    league: 'NBA',
    foulCallRate: 'average',
    overUnderTendency: 'neutral',
    avgTotalPointsOrRuns: 222.0,
    description: '裁判 Zach Zarba (吹哨尺度中規中矩，比賽節奏平穩)'
  }
};

/**
 * Gets official/referee/umpire tendency info if available.
 */
export function getOfficialInfo(name: string, league: League): OfficialTendencyInfo | null {
  if (!name) return null;
  const map = league === 'MLB' ? MLB_UMPIRES : NBA_REFEREES;
  return map[name] || null;
}
