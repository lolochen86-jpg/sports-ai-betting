import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { generatePrediction, generatePredictionV2 } from '@/lib/prediction/engine';
import { extractRecentStats, fetchH2HRecord, detectFatigue, fetchStartingPitcher } from '@/lib/prediction/features';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { gameId, league, date } = await request.json();

    if (!gameId || !league) {
      return NextResponse.json(
        { success: false, error: '缺少必要參數 (gameId 或 league)' },
        { status: 400 }
      );
    }

    const leagueUpper = league.toUpperCase() as 'MLB' | 'NBA';
    if (leagueUpper !== 'MLB' && leagueUpper !== 'NBA') {
      return NextResponse.json(
        { success: false, error: '無效的聯盟名稱' },
        { status: 400 }
      );
    }

    // Fetch games for the specified date
    const formattedDate = date ? String(date).split('T')[0] : undefined;
    let games = [];

    if (leagueUpper === 'MLB') {
      games = await fetchMLBGames(formattedDate);
    } else {
      games = await fetchNBAGames(formattedDate);
    }

    const game = games.find(g => String(g.id) === String(gameId));
    if (!game) {
      return NextResponse.json(
        { success: false, error: '找不到指定賽事，AI 預測引擎目前僅支持對照本日賽事' },
        { status: 404 }
      );
    }

    // Run predictions
    const predictionV1 = await generatePrediction(game, leagueUpper);
    const predictionV2 = await generatePredictionV2(game, leagueUpper);

    // Compute delta details using the MetaModel
    const v1Meta = predictionV1.models.MetaModel;
    const v2Meta = predictionV2.models.MetaModel;

    const winnerChanged = v1Meta.winner !== v2Meta.winner;
    const confidenceDelta = Number((v2Meta.confidence - v1Meta.confidence).toFixed(1));
    const homeScoreDelta = Number((v2Meta.homeExpectedScore - v1Meta.homeExpectedScore).toFixed(1));
    const awayScoreDelta = Number((v2Meta.awayExpectedScore - v1Meta.awayExpectedScore).toFixed(1));
    const ouChanged = v1Meta.ouPick !== v2Meta.ouPick;

    // Fetch features to extract key factors
    const homeId = game.homeTeam.id;
    const awayId = game.awayTeam.id;
    const dateStr = game.gameDate.split('T')[0];

    const [homeRecent, awayRecent, h2hRecord, homeFatigue, awayFatigue, pitchers] = await Promise.all([
      extractRecentStats(homeId, leagueUpper, game.id, game.gameDate),
      extractRecentStats(awayId, leagueUpper, game.id, game.gameDate),
      fetchH2HRecord(homeId, awayId, leagueUpper, game.id, game.gameDate),
      detectFatigue(homeId, dateStr, leagueUpper),
      detectFatigue(awayId, dateStr, leagueUpper),
      leagueUpper === 'MLB' ? fetchStartingPitcher(game.id) : Promise.resolve({ home: null, away: null })
    ]);

    const keyFactors: { type: string; text: string }[] = [];

    // Check Home/Away Splits
    if (homeRecent.homeAvgScored !== undefined) {
      const diff = homeRecent.homeAvgScored - homeRecent.averagePointsScored;
      if (Math.abs(diff) >= (leagueUpper === 'NBA' ? 3 : 0.5)) {
        keyFactors.push({
          type: 'splits',
          text: `主隊主場火力${diff > 0 ? '偏強' : '偏弱'}：${homeRecent.homeAvgScored}分 (均分 ${homeRecent.averagePointsScored}分)`
        });
      }
    }
    if (awayRecent.awayAvgScored !== undefined) {
      const diff = awayRecent.awayAvgScored - awayRecent.averagePointsScored;
      if (Math.abs(diff) >= (leagueUpper === 'NBA' ? 3 : 0.5)) {
        keyFactors.push({
          type: 'splits',
          text: `客隊客場火力${diff > 0 ? '偏強' : '偏弱'}：${awayRecent.awayAvgScored}分 (均分 ${awayRecent.averagePointsScored}分)`
        });
      }
    }

    // Check H2H
    if (h2hRecord && h2hRecord.totalGames >= 3) {
      const winRateA = h2hRecord.teamAWins / h2hRecord.totalGames;
      if (winRateA >= 0.65) {
        keyFactors.push({
          type: 'h2h',
          text: `歷史對戰壓制：主隊 H2H 勝率 ${Math.round(winRateA * 100)}%`
        });
      } else if (winRateA <= 0.35) {
        keyFactors.push({
          type: 'h2h',
          text: `歷史對戰壓制：客隊 H2H 勝率 ${Math.round((1 - winRateA) * 100)}%`
        });
      }
    }

    // Check Fatigue
    if (homeFatigue.fatigueLevel !== 'none') {
      keyFactors.push({
        type: 'fatigue',
        text: `主隊疲勞度：${homeFatigue.fatigueLevel === 'heavy' ? '重度' : '輕度'}疲勞 (${homeFatigue.isBackToBack ? '背靠背' : `3天內${homeFatigue.gamesIn3Days}場`})`
      });
    }
    if (awayFatigue.fatigueLevel !== 'none') {
      keyFactors.push({
        type: 'fatigue',
        text: `客隊疲勞度：${awayFatigue.fatigueLevel === 'heavy' ? '重度' : '輕度'}疲勞 (${awayFatigue.isBackToBack ? '背靠背' : `3天內${awayFatigue.gamesIn3Days}場`})`
      });
    }

    // Check Pitcher (MLB only)
    if (leagueUpper === 'MLB') {
      if (pitchers.home && pitchers.home.advantageFactor !== 1) {
        const factor = pitchers.home.advantageFactor;
        if (factor > 1.15 || factor < 0.85) {
          keyFactors.push({
            type: 'pitcher',
            text: `主隊先發投手優勢：${pitchers.home.name} (ERA ${pitchers.home.era}, 係數 ${factor})`
          });
        }
      }
      if (pitchers.away && pitchers.away.advantageFactor !== 1) {
        const factor = pitchers.away.advantageFactor;
        if (factor > 1.15 || factor < 0.85) {
          keyFactors.push({
            type: 'pitcher',
            text: `客隊先發投手優勢：${pitchers.away.name} (ERA ${pitchers.away.era}, 係數 ${factor})`
          });
        }
      }
    }

    // Check Scoring Momentum
    if (homeRecent.scoringMomentum !== undefined && homeRecent.momentumLabel !== 'stable') {
      keyFactors.push({
        type: 'momentum',
        text: `主隊得分趨勢：${homeRecent.momentumLabel === 'hot' ? '🔥 火燙' : '🧊 冰冷'} (斜率 ${homeRecent.scoringMomentum})`
      });
    }
    if (awayRecent.scoringMomentum !== undefined && awayRecent.momentumLabel !== 'stable') {
      keyFactors.push({
        type: 'momentum',
        text: `客隊得分趨勢：${awayRecent.momentumLabel === 'hot' ? '🔥 火燙' : '🧊 冰冷'} (斜率 ${awayRecent.scoringMomentum})`
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        v1: predictionV1,
        v2: predictionV2,
        delta: {
          winnerChanged,
          v1Winner: v1Meta.winner,
          v2Winner: v2Meta.winner,
          v1Confidence: v1Meta.confidence,
          v2Confidence: v2Meta.confidence,
          confidenceDelta,
          homeScoreDelta,
          awayScoreDelta,
          v1TotalScore: Number((v1Meta.homeExpectedScore + v1Meta.awayExpectedScore).toFixed(1)),
          v2TotalScore: Number((v2Meta.homeExpectedScore + v2Meta.awayExpectedScore).toFixed(1)),
          v1OUPick: v1Meta.ouPick,
          v2OUPick: v2Meta.ouPick,
          ouChanged,
          keyFactors
        }
      }
    });
  } catch (error) {
    console.error('Predictions Compare API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '對照生成失敗，請重試' },
      { status: 500 }
    );
  }
}
