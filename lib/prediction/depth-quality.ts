import type { League } from '@/types/sports';

export interface TeamDepthInfo {
  teamCode: string;
  league: League;
  bullpenTier: 'elite' | 'above_avg' | 'average' | 'below_avg' | 'weak';
  bullpenERA?: number;      // MLB Bullpen ERA
  benchScoringPPG?: number; // NBA Bench Points Per Game
  depthScore: number;       // 0 - 100 rating
  description: string;
  specialNotes?: string;
}

// ─── MLB Bullpen Quality Data (30 teams) ───
export const MLB_BULLPEN_QUALITY: Record<string, TeamDepthInfo> = {
  CLE: { teamCode: 'CLE', league: 'MLB', bullpenTier: 'elite', bullpenERA: 2.85, depthScore: 95, description: '克里夫蘭守護者 (聯盟頂尖牛棚戰力，勝利組壓制力極強 ERA 2.85)', specialNotes: '🔥 後段局數鎖定勝局能力極佳' },
  ATL: { teamCode: 'ATL', league: 'MLB', bullpenTier: 'elite', bullpenERA: 3.12, depthScore: 92, description: '亞特蘭大勇士 (高壓制力牛棚陣容，放鬆局數極少)', specialNotes: '🔥 後援三振率高居聯盟前列' },
  NYY: { teamCode: 'NYY', league: 'MLB', bullpenTier: 'elite', bullpenERA: 3.25, depthScore: 90, description: '紐約洋基 (牛棚深度充足，具備多位極速飆火球後援投手)', specialNotes: '🔥 8-9局鎖定率超過 88%' },
  LAD: { teamCode: 'LAD', league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.45, depthScore: 86, description: '洛杉磯道奇 (牛棚調度彈性高，左投/右投配置均衡)' },
  BAL: { teamCode: 'BAL', league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.52, depthScore: 85, description: '巴爾的摩金鶯 (牛棚年輕有活力，終結者壓制力優異)' },
  SD:  { teamCode: 'SD',  league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.58, depthScore: 84, description: '聖地牙哥教士 (牛棚三振能力佳，高壓情況經驗豐富)' },
  PHI: { teamCode: 'PHI', league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.65, depthScore: 83, description: '費城人 (牛棚具備多位火球投手，防守穩定)' },
  HOU: { teamCode: 'HOU', league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.70, depthScore: 82, description: '休士頓太空人 (季後賽經驗豐富牛棚，體能調度佳)' },
  SEA: { teamCode: 'SEA', league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.72, depthScore: 81, description: '西雅圖水手 (牛棚控球精確，被打擊率低)' },
  TBR: { teamCode: 'TB',  league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.75, depthScore: 80, description: '坦帕灣光芒 (戰術型車輪戰牛棚，左/右對位精準)' },
  TB:  { teamCode: 'TB',  league: 'MLB', bullpenTier: 'above_avg', bullpenERA: 3.75, depthScore: 80, description: '坦帕灣光芒 (戰術型車輪戰牛棚，左/右對位精準)' },
  TEX: { teamCode: 'TEX', league: 'MLB', bullpenTier: 'average', bullpenERA: 4.10, depthScore: 72, description: '遊騎兵 (牛棚表現常態，季中穩定度尚可)' },
  BOS: { teamCode: 'BOS', league: 'MLB', bullpenTier: 'average', bullpenERA: 4.15, depthScore: 71, description: '波士頓紅襪 (牛棚發揮平穩，偶有失常局數)' },
  MIN: { teamCode: 'MIN', league: 'MLB', bullpenTier: 'average', bullpenERA: 4.18, depthScore: 70, description: '雙城 (牛棚戰力中規中矩)' },
  CHC: { teamCode: 'CHC', league: 'MLB', bullpenTier: 'average', bullpenERA: 4.22, depthScore: 69, description: '小熊 (牛棚穩定度中等)' },
  AZ:  { teamCode: 'ARI', league: 'MLB', bullpenTier: 'average', bullpenERA: 4.25, depthScore: 68, description: '響尾蛇 (牛棚續航力常態)' },
  ARI: { teamCode: 'ARI', league: 'MLB', bullpenTier: 'average', bullpenERA: 4.25, depthScore: 68, description: '響尾蛇 (牛棚續航力常態)' },
  SF:  { teamCode: 'SF',  league: 'MLB', bullpenTier: 'average', bullpenERA: 4.28, depthScore: 67, description: '巨人 (牛棚防禦率中等)' },
  DET: { teamCode: 'DET', league: 'MLB', bullpenTier: 'average', bullpenERA: 4.30, depthScore: 66, description: '老虎 (牛棚中段局數發揮穩定)' },
  NYM: { teamCode: 'NYM', league: 'MLB', bullpenTier: 'below_avg', bullpenERA: 4.45, depthScore: 62, description: '大都會 (牛棚負擔較重，比賽末段偶有放火風險)', specialNotes: '⚠️ 牛棚場均消耗用球數偏多' },
  STL: { teamCode: 'STL', league: 'MLB', bullpenTier: 'below_avg', bullpenERA: 4.50, depthScore: 60, description: '紅雀 (牛棚防禦率偏高)' },
  CIN: { teamCode: 'CIN', league: 'MLB', bullpenTier: 'below_avg', bullpenERA: 4.55, depthScore: 59, description: '紅人 (牛棚控球波動大)' },
  KC:  { teamCode: 'KC',  league: 'MLB', bullpenTier: 'below_avg', bullpenERA: 4.60, depthScore: 58, description: '皇家 (牛棚深度有限)' },
  PIT: { teamCode: 'PIT', league: 'MLB', bullpenTier: 'below_avg', bullpenERA: 4.65, depthScore: 57, description: '海盜 (牛棚失分率偏高)' },
  MIL: { teamCode: 'MIL', league: 'MLB', bullpenTier: 'below_avg', bullpenERA: 4.70, depthScore: 56, description: '釀酒人 (牛棚戰力稍顯吃緊)' },
  TOR: { teamCode: 'TOR', league: 'MLB', bullpenTier: 'weak', bullpenERA: 4.88, depthScore: 50, description: '藍鳥 (牛棚防禦率高達 4.88，後段局數失分風險高)', specialNotes: '⚠️ 7-9 局防守失分風險較高' },
  MIA: { teamCode: 'MIA', league: 'MLB', bullpenTier: 'weak', bullpenERA: 4.95, depthScore: 48, description: '馬林魚 (牛棚車輪戰深度缺乏)' },
  CWS: { teamCode: 'CWS', league: 'MLB', bullpenTier: 'weak', bullpenERA: 5.20, depthScore: 42, description: '白襪 (牛棚防守整體失分偏多)' },
  COL: { teamCode: 'COL', league: 'MLB', bullpenTier: 'weak', bullpenERA: 5.35, depthScore: 40, description: '洛磯 (受庫爾斯球場影響與牛棚深度不足)' },
  WSH: { teamCode: 'WSH', league: 'MLB', bullpenTier: 'weak', bullpenERA: 5.15, depthScore: 44, description: '國民 (牛棚高壓壓制力較弱)' },
  ATH: { teamCode: 'OAK', league: 'MLB', bullpenTier: 'weak', bullpenERA: 4.90, depthScore: 49, description: '運動家 (牛棚戰力穩定度待提升)' },
  OAK: { teamCode: 'OAK', league: 'MLB', bullpenTier: 'weak', bullpenERA: 4.90, depthScore: 49, description: '運動家 (牛棚戰力穩定度待提升)' },
  LAA: { teamCode: 'LAA', league: 'MLB', bullpenTier: 'weak', bullpenERA: 4.85, depthScore: 51, description: '天使 (牛棚後段守成能力有限)' }
};

// ─── NBA Bench Depth Quality Data (30 teams) ───
export const NBA_BENCH_DEPTH: Record<string, TeamDepthInfo> = {
  BOS: { teamCode: 'BOS', league: 'NBA', bullpenTier: 'elite', benchScoringPPG: 41.5, depthScore: 96, description: '波士頓塞爾提克 (替補陣容深度極佳，攻防一體 PPG 41.5)', specialNotes: '🔥 板凳進攻與防守效率均為聯盟頂級' },
  MIN: { teamCode: 'MIN', league: 'NBA', bullpenTier: 'elite', benchScoringPPG: 39.8, depthScore: 92, description: '明尼蘇達灰狼 (替補內線與防守硬度極高)' },
  OKC: { teamCode: 'OKC', league: 'NBA', bullpenTier: 'elite', benchScoringPPG: 40.2, depthScore: 91, description: '奧克拉荷馬雷霆 (替補年輕活力十足，得分點分散)' },
  DEN: { teamCode: 'DEN', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 36.5, depthScore: 84, description: '丹佛金塊 (替補陣容輪替穩定)' },
  DAL: { teamCode: 'DAL', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 38.0, depthScore: 85, description: '達拉斯獨行俠 (替補外線火力旺盛)' },
  MIL: { teamCode: 'MIL', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 35.8, depthScore: 83, description: '密爾瓦基公鹿 (替補老將經驗豐富)' },
  NYK: { teamCode: 'NYK', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 37.2, depthScore: 82, description: '紐約尼克 (替補防守強度高)' },
  IND: { teamCode: 'IND', league: 'NBA', bullpenTier: 'elite', benchScoringPPG: 44.2, depthScore: 94, description: '印第安納溜馬 (板凳得分聯盟第一 PPG 44.2，進攻速度極快)', specialNotes: '🔥 全聯盟最強板凳得分火力' },
  MIA: { teamCode: 'MIA', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 37.8, depthScore: 81, description: '邁阿密熱火 (體系執行力極高之替補陣容)' },
  CLE: { teamCode: 'CLE', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 36.2, depthScore: 80, description: '克里夫蘭騎士 (替補後衛發揮穩定)' },
  LAC: { teamCode: 'LAC', league: 'NBA', bullpenTier: 'average', benchScoringPPG: 34.5, depthScore: 74, description: '洛杉磯快艇 (替補經驗充足但腳步偏慢)' },
  LAL: { teamCode: 'LAL', league: 'NBA', bullpenTier: 'average', benchScoringPPG: 33.8, depthScore: 72, description: '洛杉磯湖人 (替補表現依賴先發帶領)' },
  PHX: { teamCode: 'PHX', league: 'NBA', bullpenTier: 'average', benchScoringPPG: 32.0, depthScore: 70, description: '鳳凰城太陽 (替補火力適中)' },
  GSW: { teamCode: 'GSW', league: 'NBA', benchScoringPPG: 38.5, bullpenTier: 'above_avg', depthScore: 82, description: '金州勇士 (替補傳切戰術流暢)' },
  SAC: { teamCode: 'SAC', league: 'NBA', bullpenTier: 'average', benchScoringPPG: 34.0, depthScore: 73, description: '沙加緬度國王 (替補進攻節奏快)' },
  PHI: { teamCode: 'PHI', league: 'NBA', bullpenTier: 'average', benchScoringPPG: 32.5, depthScore: 71, description: '費城76人 (替補防守尚可)' },
  ORL: { teamCode: 'ORL', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 39.0, depthScore: 83, description: '奧蘭多魔術 (替補身高身材優勢明顯)' },
  NOP: { teamCode: 'NOP', league: 'NBA', bullpenTier: 'average', benchScoringPPG: 35.0, depthScore: 74, description: '紐奧良鵜鶘 (替補運動能力強)' },
  HOU: { teamCode: 'HOU', league: 'NBA', bullpenTier: 'above_avg', benchScoringPPG: 38.2, depthScore: 81, description: '休士頓火箭 (替補防守拼勁十足)' },
  CHI: { teamCode: 'CHI', league: 'NBA', bullpenTier: 'below_avg', benchScoringPPG: 30.5, depthScore: 62, description: '芝加哥公牛 (替補得分產出偏低)' },
  ATL: { teamCode: 'ATL', league: 'NBA', bullpenTier: 'below_avg', benchScoringPPG: 31.2, depthScore: 64, description: '亞特蘭大老鷹 (替補防守效率一般)' },
  BKN: { teamCode: 'BKN', league: 'NBA', bullpenTier: 'below_avg', benchScoringPPG: 31.0, depthScore: 63, description: '布魯克林籃網 (替補穩定度不足)' },
  TOR: { teamCode: 'TOR', league: 'NBA', bullpenTier: 'below_avg', benchScoringPPG: 29.8, depthScore: 60, description: '多倫多暴龍 (替補投射命中率較低)' },
  MEM: { teamCode: 'MEM', league: 'NBA', bullpenTier: 'average', benchScoringPPG: 35.5, depthScore: 75, description: '曼菲斯灰熊 (替補陣容拼勁佳)' },
  UTA: { teamCode: 'UTA', league: 'NBA', bullpenTier: 'below_avg', benchScoringPPG: 32.0, depthScore: 61, description: '猶他爵士 (替補失誤率偏高)' },
  SAS: { teamCode: 'SAS', league: 'NBA', bullpenTier: 'below_avg', benchScoringPPG: 31.5, depthScore: 62, description: '聖安東尼奧馬刺 (替補經驗尚需磨練)' },
  POR: { teamCode: 'POR', league: 'NBA', bullpenTier: 'weak', benchScoringPPG: 27.5, depthScore: 48, description: '波特蘭拓荒者 (替補陣容深度嚴重匱乏)' },
  CHA: { teamCode: 'CHA', league: 'NBA', bullpenTier: 'weak', benchScoringPPG: 28.0, depthScore: 46, description: '夏洛特黃蜂 (替補防守效率低落)' },
  WAS: { teamCode: 'WAS', league: 'NBA', bullpenTier: 'weak', benchScoringPPG: 26.8, depthScore: 42, description: '華盛頓巫師 (替補淨得分率為聯盟倒數)' },
  DET: { teamCode: 'DET', league: 'NBA', bullpenTier: 'weak', benchScoringPPG: 27.2, depthScore: 44, description: '底特律活塞 (替補投射與控球穩定度低)' }
};

export const DEFAULT_DEPTH_INFO: TeamDepthInfo = {
  teamCode: 'GENERIC',
  league: 'MLB',
  bullpenTier: 'average',
  depthScore: 70,
  description: '常態陣容深度'
};

/**
 * Gets team depth / bullpen quality info.
 */
export function getTeamDepth(teamCode: string, league: League): TeamDepthInfo {
  const code = teamCode ? teamCode.toUpperCase() : '';
  if (league === 'MLB') {
    return MLB_BULLPEN_QUALITY[code] || { ...DEFAULT_DEPTH_INFO, teamCode: code, league: 'MLB' };
  } else {
    return NBA_BENCH_DEPTH[code] || { ...DEFAULT_DEPTH_INFO, teamCode: code, league: 'NBA' };
  }
}
