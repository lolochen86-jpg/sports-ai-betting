/**
 * app/api/ai-pipeline/report/route.ts
 * 供本專案與外部其他專案共用模型輸出的 API
 * 
 * 支援 CORS (`Access-Control-Allow-Origin: *`)
 * 
 * Endpoints:
 * - GET /api/ai-pipeline/report?date=latest              — 取得最新一期預測報告 JSON
 * - GET /api/ai-pipeline/report?date=today               — 取得今天預測報告 JSON
 * - GET /api/ai-pipeline/report?date=tomorrow            — 取得明天預測報告 JSON
 * - GET /api/ai-pipeline/report?date=YYYY-MM-DD          — 取得指定日期預測報告 JSON
 * - GET /api/ai-pipeline/report?date=latest&type=simple   — 取得簡化版對照數據 (適合小元件嵌入)
 * - GET /api/ai-pipeline/report?date=latest&type=svg      — 取得 1200px 戰報海報 SVG
 * - GET /api/ai-pipeline/report?date=latest&type=audit    — 取得資料齊全度稽核報告 JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function resolveTargetDate(dateStr: string | null): string {
  const reportsDir = path.join(process.cwd(), 'data', 'reports');

  if (!dateStr || dateStr === 'latest') {
    if (!fs.existsSync(reportsDir)) return getTodayDateStr();
    const files = fs.readdirSync(reportsDir);
    const dateFiles = files
      .filter(f => f.endsWith('-prediction.json'))
      .map(f => f.replace('-prediction.json', ''))
      .sort()
      .reverse();
    return dateFiles[0] || getTodayDateStr();
  }

  if (dateStr === 'today') {
    return getTodayDateStr();
  }

  if (dateStr === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  return dateStr;
}

function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawDate = searchParams.get('date');
    const type = searchParams.get('type') || 'json';

    const date = resolveTargetDate(rawDate);

    // Validate YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: '日期格式無效，請使用 YYYY-MM-DD 或 alias: latest, today, tomorrow' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const reportsDir = path.join(process.cwd(), 'data', 'reports');

    switch (type) {
      case 'svg': {
        const svgPath = path.join(reportsDir, `${date}-prediction.svg`);
        if (!fs.existsSync(svgPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的預測海報尚未生成` },
            { status: 404, headers: CORS_HEADERS }
          );
        }
        const svg = fs.readFileSync(svgPath, 'utf-8');
        return new NextResponse(svg, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      case 'result': {
        const resultPath = path.join(reportsDir, `${date}-result.svg`);
        if (!fs.existsSync(resultPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的賽後結果海報尚未生成` },
            { status: 404, headers: CORS_HEADERS }
          );
        }
        const svg = fs.readFileSync(resultPath, 'utf-8');
        return new NextResponse(svg, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      case 'audit': {
        const auditPath = path.join(reportsDir, `${date}-audit.json`);
        if (!fs.existsSync(auditPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的稽核報告尚未生成` },
            { status: 404, headers: CORS_HEADERS }
          );
        }
        const data = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
        return NextResponse.json({ success: true, date, data }, { headers: CORS_HEADERS });
      }

      case 'simple': {
        const reportPath = path.join(reportsDir, `${date}-prediction.json`);
        if (!fs.existsSync(reportPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的預測報告尚未生成` },
            { status: 404, headers: CORS_HEADERS }
          );
        }
        const fullReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        
        // Extract ultra-clean lightweight format for widgets
        const simpleGames = (fullReport.games || []).map((g: any) => ({
          gameId: g.gameId,
          league: g.league,
          matchup: `${g.awayTeam.nameCn || g.awayTeam.code} @ ${g.homeTeam.nameCn || g.homeTeam.code}`,
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          predictedWinner: g.prediction.winnerTeamName,
          confidence: g.prediction.confidence,
          predictedScore: `${g.prediction.awayExpectedScore} : ${g.prediction.homeExpectedScore}`,
          ouPick: `${g.prediction.ouPick === 'Over' ? '大分' : '小分'} (${g.prediction.ouLine}分)`,
          advantageWinner: g.prediction.winner === 'home' ? g.homeTeam.nameCn : g.awayTeam.nameCn,
        }));

        return NextResponse.json({
          success: true,
          date,
          totalGames: simpleGames.length,
          games: simpleGames,
          summary: fullReport.overallSummary,
        }, { headers: CORS_HEADERS });
      }

      case 'json':
      default: {
        const reportPath = path.join(reportsDir, `${date}-prediction.json`);
        if (!fs.existsSync(reportPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的預測報告尚未生成` },
            { status: 404, headers: CORS_HEADERS }
          );
        }
        const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        return NextResponse.json({ success: true, date, data }, { headers: CORS_HEADERS });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
