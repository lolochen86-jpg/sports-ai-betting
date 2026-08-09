/**
 * app/api/ai-pipeline/report/route.ts
 * 取得 AI 預測報告 JSON 或 SVG 圖片
 *
 * GET /api/ai-pipeline/report?date=YYYY-MM-DD             — 取得預測報告 JSON
 * GET /api/ai-pipeline/report?date=YYYY-MM-DD&type=svg    — 取得預測 SVG 圖片
 * GET /api/ai-pipeline/report?date=YYYY-MM-DD&type=result — 取得賽後結果 SVG
 * GET /api/ai-pipeline/report?date=YYYY-MM-DD&type=audit  — 取得稽核報告 JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const type = searchParams.get('type') || 'json';

    if (!date) {
      return NextResponse.json(
        { success: false, error: '請提供 date 參數 (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: '日期格式錯誤，請使用 YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const reportsDir = path.join(process.cwd(), 'data', 'reports');

    switch (type) {
      case 'svg': {
        const svgPath = path.join(reportsDir, `${date}-prediction.svg`);
        if (!fs.existsSync(svgPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的預測圖片尚未生成` },
            { status: 404 }
          );
        }
        const svg = fs.readFileSync(svgPath, 'utf-8');
        return new NextResponse(svg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      case 'result': {
        const resultPath = path.join(reportsDir, `${date}-result.svg`);
        if (!fs.existsSync(resultPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的賽後結果圖片尚未生成` },
            { status: 404 }
          );
        }
        const svg = fs.readFileSync(resultPath, 'utf-8');
        return new NextResponse(svg, {
          headers: {
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
            { status: 404 }
          );
        }
        const data = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
        return NextResponse.json({ success: true, data });
      }

      case 'json':
      default: {
        const reportPath = path.join(reportsDir, `${date}-prediction.json`);
        if (!fs.existsSync(reportPath)) {
          return NextResponse.json(
            { success: false, error: `${date} 的預測報告尚未生成` },
            { status: 404 }
          );
        }
        const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        return NextResponse.json({ success: true, data });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
