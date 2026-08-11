/**
 * app/api/ai-pipeline/run/route.ts
 * 手動觸發或查詢 AI 預測報告流程 (支援 CORS 跨專案調用)
 *
 * POST /api/ai-pipeline/run        — 手動觸發最新/隔日賽程流程
 * POST /api/ai-pipeline/run?date=  — 觸發指定日期的流程
 * GET  /api/ai-pipeline/run        — 查詢目前流程狀態
 */

import { NextRequest, NextResponse } from 'next/server';
import { runNightlyPipeline, getPipelineStatus } from '@/lib/ai-pipeline/orchestrator';

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

export async function GET() {
  try {
    const status = getPipelineStatus();
    return NextResponse.json({
      success: true,
      data: status,
    }, { headers: CORS_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get('date') || undefined;

    // Check if pipeline is already running
    const currentStatus = getPipelineStatus();
    if (currentStatus.status === 'running') {
      return NextResponse.json(
        {
          success: false,
          error: '流程正在執行中，請稍候',
          data: currentStatus,
        },
        { status: 409, headers: CORS_HEADERS }
      );
    }

    // Run pipeline in background (don't await, return immediately)
    runNightlyPipeline(targetDate).catch(err => {
      console.error('[AI Pipeline] Background execution error:', err);
    });

    return NextResponse.json({
      success: true,
      message: `AI 預測報告流程已啟動${targetDate ? ` (目標日期: ${targetDate})` : ''}`,
      data: getPipelineStatus(),
    }, { headers: CORS_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
