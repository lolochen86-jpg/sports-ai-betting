import { DataAuditReport, GameAuditData, PredictionReportBundle, GamePredictionReport, ReasoningSection } from './types';
import { generatePrediction, PredictionResult } from '@/lib/prediction/engine';
import { generateGameAnnotations, AnnotationInput } from '@/lib/prediction/annotations';
import { GameWithTeams, TeamInfo } from '@/types/sports';

export async function generatePredictionReport(auditReport: DataAuditReport): Promise<PredictionReportBundle> {
  const games: GamePredictionReport[] = [];

  for (const gameAudit of auditReport.games) {
    // Construct GameWithTeams
    const homeTeam: TeamInfo = {
      id: gameAudit.homeTeam.code,
      name: gameAudit.homeTeam.name,
      code: gameAudit.homeTeam.code,
      city: '',
      nameCn: gameAudit.homeTeam.nameCn,
      record: gameAudit.data.homeRecord
    };

    const awayTeam: TeamInfo = {
      id: gameAudit.awayTeam.code,
      name: gameAudit.awayTeam.name,
      code: gameAudit.awayTeam.code,
      city: '',
      nameCn: gameAudit.awayTeam.nameCn,
      record: gameAudit.data.awayRecord
    };

    const gameWithTeams: GameWithTeams = {
      id: gameAudit.gameId,
      league: gameAudit.league,
      homeTeam,
      awayTeam,
      gameDate: gameAudit.gameDate,
      venue: gameAudit.venue,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      homeProbablePitcher: gameAudit.data.homePitcher ? { name: gameAudit.data.homePitcher.name, era: gameAudit.data.homePitcher.era } : undefined,
      awayProbablePitcher: gameAudit.data.awayPitcher ? { name: gameAudit.data.awayPitcher.name, era: gameAudit.data.awayPitcher.era } : undefined,
    };

    const predictionResult = await generatePrediction(gameWithTeams, gameAudit.league);

    const reasoning = buildReasoningExplanation(gameAudit, predictionResult);

    const metaModel = predictionResult.models.MetaModel || predictionResult.models.SportsAI;
    const winnerName = predictionResult.winner === 'home' ? homeTeam.nameCn : awayTeam.nameCn;

    const gameReport: GamePredictionReport = {
      gameId: gameAudit.gameId,
      league: gameAudit.league,
      homeTeam: gameAudit.homeTeam,
      awayTeam: gameAudit.awayTeam,
      venue: gameAudit.venue,
      gameDate: gameAudit.gameDate,
      prediction: {
        winner: predictionResult.winner,
        winnerTeamName: winnerName || predictionResult.winner,
        confidence: predictionResult.confidence,
        ouPick: metaModel.ouPick,
        ouLine: metaModel.ouLine,
        predictedTotal: metaModel.predictedTotal,
        homeExpectedScore: metaModel.homeExpectedScore,
        awayExpectedScore: metaModel.awayExpectedScore,
      },
      reasoning,
      modelBreakdown: Object.values(predictionResult.models).map(m => ({
        modelName: m.name,
        winner: m.winner,
        confidence: m.confidence,
        homeScore: m.homeExpectedScore,
        awayScore: m.awayExpectedScore,
      }))
    };

    games.push(gameReport);
  }

  return {
    targetDate: auditReport.targetDate,
    generatedAt: new Date().toISOString(),
    totalGames: games.length,
    games,
    overallSummary: generateOverallSummary(games)
  };
}

export function buildReasoningExplanation(gameAudit: GameAuditData, prediction: PredictionResult): ReasoningSection[] {
  const sections: ReasoningSection[] = [];
  const { data, league, homeTeam, awayTeam } = gameAudit;

  // Generate annotations
  const homeInput: AnnotationInput = {
    teamName: homeTeam.nameCn || homeTeam.name,
    recentGameScores: data.homeRecentScores,
    pitcherName: data.homePitcher?.nameCn || data.homePitcher?.name,
    pitcherEra: data.homePitcher?.era,
    league,
    side: 'home',
    streak: data.homeStreak
  };

  const awayInput: AnnotationInput = {
    teamName: awayTeam.nameCn || awayTeam.name,
    recentGameScores: data.awayRecentScores,
    pitcherName: data.awayPitcher?.nameCn || data.awayPitcher?.name,
    pitcherEra: data.awayPitcher?.era,
    league,
    side: 'away',
    streak: data.awayStreak
  };

  const annotations = generateGameAnnotations(homeInput, awayInput);

  // a. ⚾/🏀 先發投手對決 / 先發球員對位
  if (league === 'MLB') {
    const hp = data.homePitcher;
    const ap = data.awayPitcher;
    if (hp && ap) {
      let impact: ReasoningSection['impact'] = 'neutral';
      let impactTeam: ReasoningSection['impactTeam'] = undefined;
      let exp = `⚾ 先發投手對決：${homeTeam.code} 派出 ${hp.nameCn || hp.name} (ERA ${hp.era.toFixed(2)}) vs ${awayTeam.code} 派出 ${ap.nameCn || ap.name} (ERA ${ap.era.toFixed(2)})。`;
      if (hp.era < ap.era - 0.5) {
        impact = 'positive';
        impactTeam = 'home';
        exp += ` ${hp.nameCn || hp.name} 具有明顯防禦率優勢。`;
      } else if (ap.era < hp.era - 0.5) {
        impact = 'positive';
        impactTeam = 'away';
        exp += ` ${ap.nameCn || ap.name} 具有明顯防禦率優勢。`;
      } else {
        exp += ' 雙方投手帳面數據接近，預期形成拉鋸。';
      }
      if (hp.recentFormSummary) exp += ` 主投近期：${hp.recentFormSummary}。`;
      if (ap.recentFormSummary) exp += ` 客投近期：${ap.recentFormSummary}。`;
      
      sections.push({
        icon: '⚾',
        category: '先發投手對決',
        explanation: exp,
        impact,
        impactTeam
      });
    } else {
      sections.push({
         icon: '⚾',
         category: '先發投手對決',
         explanation: '先發投手資訊不足，無法進行完整比較。',
         impact: 'neutral'
      });
    }
  } else {
    sections.push({
      icon: '🏀',
      category: '先發球員對位',
      explanation: `${homeTeam.code} 與 ${awayTeam.code} 的先發陣容對位情形。${prediction.keyPlayer ? `重點觀察：${prediction.keyPlayer}` : ''}`,
      impact: 'neutral'
    });
  }

  // b. 🏟️ 場地因子影響
  if (data.parkFactor) {
    const pf = data.parkFactor;
    let impact: ReasoningSection['impact'] = 'neutral';
    if (pf.runFactor > 1.05) impact = 'positive';
    else if (pf.runFactor < 0.95) impact = 'negative';
    
    sections.push({
      icon: '🏟️',
      category: '場地因子影響',
      explanation: `${gameAudit.venue} 場地特性為 ${pf.category} (Run Factor ${(pf.runFactor).toFixed(2)})。${pf.description}`,
      impact
    });
  } else {
    sections.push({
      icon: '🏟️',
      category: '場地因子影響',
      explanation: `${gameAudit.venue} 場地因子無明顯極端數據，影響適中。`,
      impact: 'neutral'
    });
  }

  // c. 🌡️ 氣候條件
  if (data.weather) {
    const w = data.weather;
    sections.push({
      icon: '🌡️',
      category: '氣候條件',
      explanation: w.isIndoor ? `本場於室內場地進行，比賽不受外部氣候影響。` : `氣溫 ${w.tempC}°C，風速 ${w.windSpeedKph} km/h (${w.windDirection})。${w.description}`,
      impact: 'neutral'
    });
  } else {
    sections.push({
      icon: '🌡️',
      category: '氣候條件',
      explanation: '氣候條件在正常範圍內，對比賽無重大影響。',
      impact: 'neutral'
    });
  }

  // d. 📅 賽程安排
  if (data.restTravel) {
    const rt = data.restTravel;
    let impact: ReasoningSection['impact'] = 'neutral';
    let impactTeam: ReasoningSection['impactTeam'] = undefined;
    
    if (rt.homeRestDays > rt.awayRestDays) {
      impact = 'positive';
      impactTeam = 'home';
    } else if (rt.awayRestDays > rt.homeRestDays) {
      impact = 'positive';
      impactTeam = 'away';
    }

    sections.push({
      icon: '📅',
      category: '賽程安排',
      explanation: `${homeTeam.code} 休息 ${rt.homeRestDays} 天 (${rt.homeFatigue})，${awayTeam.code} 休息 ${rt.awayRestDays} 天 (${rt.awayFatigue})。`,
      impact,
      impactTeam
    });
  } else {
     sections.push({
      icon: '📅',
      category: '賽程安排',
      explanation: `雙方近期賽程均屬正常輪值，無明顯體能落差。`,
      impact: 'neutral'
    });
  }

  // e. 🩹 傷兵影響
  const homeInjuries = data.injuries.home.length;
  const awayInjuries = data.injuries.away.length;
  let injImpact: ReasoningSection['impact'] = 'neutral';
  let injImpactTeam: ReasoningSection['impactTeam'] = undefined;

  if (homeInjuries > awayInjuries) {
    injImpact = 'positive';
    injImpactTeam = 'away';
  } else if (awayInjuries > homeInjuries) {
    injImpact = 'positive';
    injImpactTeam = 'home';
  }
  
  sections.push({
    icon: '🩹',
    category: '傷兵影響',
    explanation: `${homeTeam.code} 有 ${homeInjuries} 名主要傷兵名單；${awayTeam.code} 則有 ${awayInjuries} 名。${prediction.injuryImpact ? prediction.injuryImpact : ''}`,
    impact: injImpact,
    impactTeam: injImpactTeam
  });

  // f. 📈 近期趨勢
  let streakImpact: ReasoningSection['impact'] = 'neutral';
  let streakTeam: ReasoningSection['impactTeam'] = undefined;
  
  if (data.homeStreak > data.awayStreak) {
    streakImpact = 'positive';
    streakTeam = 'home';
  } else if (data.awayStreak > data.homeStreak) {
    streakImpact = 'positive';
    streakTeam = 'away';
  }

  let streakExp = `${homeTeam.code} 近期戰績為 ${data.homeRecord} (${data.homeStreak > 0 ? `${data.homeStreak}連勝` : `${Math.abs(data.homeStreak)}連敗`})，${awayTeam.code} 戰績為 ${data.awayRecord} (${data.awayStreak > 0 ? `${data.awayStreak}連勝` : `${Math.abs(data.awayStreak)}連敗`})。`;
  
  if (annotations.length > 0) {
    streakExp += ` \n特殊標註：${annotations.join(' / ')}`;
  }

  sections.push({
    icon: '📈',
    category: '近期趨勢',
    explanation: streakExp,
    impact: streakImpact,
    impactTeam: streakTeam
  });

  // g. 📊 歷史對戰
  if (data.h2h) {
    const h2h = data.h2h;
    let h2hImpact: ReasoningSection['impact'] = 'neutral';
    let h2hTeam: ReasoningSection['impactTeam'] = undefined;
    if (h2h.homeWins > h2h.awayWins) {
      h2hImpact = 'positive';
      h2hTeam = 'home';
    } else if (h2h.awayWins > h2h.homeWins) {
      h2hImpact = 'positive';
      h2hTeam = 'away';
    }
    
    sections.push({
      icon: '📊',
      category: '歷史對戰',
      explanation: `雙方近期交手 ${h2h.totalGames} 次，${homeTeam.code} 取得 ${h2h.homeWins} 勝，${awayTeam.code} 取得 ${h2h.awayWins} 勝。`,
      impact: h2hImpact,
      impactTeam: h2hTeam
    });
  } else {
     sections.push({
      icon: '📊',
      category: '歷史對戰',
      explanation: `雙方近期無足夠交手紀錄可供深度參考。`,
      impact: 'neutral'
    });
  }

  // h. 🤖 模型共識
  let homeModelVotes = 0;
  let awayModelVotes = 0;
  Object.values(prediction.models).forEach(m => {
    if (m.winner === 'home') homeModelVotes++;
    else awayModelVotes++;
  });
  
  const totalModels = homeModelVotes + awayModelVotes;
  const modelImpactTeam = prediction.winner;
  const modelImpact: ReasoningSection['impact'] = 'positive';
  
  sections.push({
    icon: '🤖',
    category: '模型共識',
    explanation: `在 ${totalModels} 個評估模型中，有 ${prediction.winner === 'home' ? homeModelVotes : awayModelVotes} 個模型支持 ${prediction.winner === 'home' ? homeTeam.code : awayTeam.code} 勝出。整合置信度為 ${prediction.confidence}%。`,
    impact: modelImpact,
    impactTeam: modelImpactTeam
  });

  return sections;
}

export function generateOverallSummary(reports: GamePredictionReport[]): string {
  const total = reports.length;
  if (total === 0) return '今日無賽事預測報告。';

  const homeWins = reports.filter(r => r.prediction.winner === 'home').length;
  const awayWins = reports.filter(r => r.prediction.winner === 'away').length;

  return `本日共產出 ${total} 場賽事預測報告。其中看好主隊勝出 ${homeWins} 場，看好客隊勝出 ${awayWins} 場。各場次已透過多維度模型進行交叉驗證並產出詳細深度解析，供進階參考。`;
}
