/**
 * lib/ai-pipeline/orchestrator.ts
 * 三位 AI 協作流程調度器 — 協調資料彙整、報告分析、圖片生成的執行順序
 */

import type {
  PipelineStatus,
  DataAuditReport,
  PredictionReportBundle,
  GameResult,
} from './types';

// Lazy imports to avoid circular dependency issues at module load time
async function getAuditor() {
  return await import('./data-auditor');
}
async function getAnalyst() {
  return await import('./report-analyst');
}
async function getDesigner() {
  return await import('./creative-designer');
}

// ─── In-memory pipeline state ───
let currentStatus: PipelineStatus = {
  status: 'idle',
  phase: null,
  targetDate: '',
};

export function getPipelineStatus(): PipelineStatus {
  return { ...currentStatus };
}

/**
 * 主流程：每晚 20:00 執行
 * 1. AI① 資料彙整員 — 核對隔天賽程資料
 * 2. AI② 報告分析員 — 整合模型產出預測報告（等 AI① 完成後）
 * 3. AI③ 美編設計師 — 生成預測圖片（與 AI② 同步）
 */
export async function runNightlyPipeline(targetDate?: string): Promise<PipelineStatus> {
  const date = targetDate || getTomorrowDate();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 [流程調度器] 啟動每日 AI 預測報告流程`);
  console.log(`📅 目標日期: ${date}`);
  console.log(`⏰ 啟動時間: ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(60)}\n`);

  currentStatus = {
    status: 'running',
    phase: 'audit',
    targetDate: date,
    startedAt: new Date().toISOString(),
  };

  try {
    // ─── Phase 1: AI① 資料彙整員 ───
    console.log('━━━ Phase 1/3: AI① 資料彙整員啟動 ━━━');
    const auditor = await getAuditor();
    const auditReport = await auditor.auditTomorrowGames(date);
    currentStatus.auditReport = auditReport;
    console.log(`✅ [AI① 完成] 共核對 ${auditReport.totalGames} 場賽事, 平均完整度 ${auditReport.summary.averageCompleteness.toFixed(1)}%\n`);

    if (auditReport.totalGames === 0) {
      console.log('⚠️ 目標日期無賽事，流程結束');
      currentStatus = {
        ...currentStatus,
        status: 'completed',
        phase: 'done',
        completedAt: new Date().toISOString(),
      };
      return currentStatus;
    }

    // ─── Phase 2 & 3: AI② + AI③ 同步執行 ───
    console.log('━━━ Phase 2/3: AI② 報告分析員 + AI③ 美編設計師 同步啟動 ━━━');
    currentStatus.phase = 'report';

    const analyst = await getAnalyst();
    const designer = await getDesigner();

    // 同步執行報告分析和圖片生成
    const [predictionReport, _svgResult] = await Promise.all([
      // AI② 報告分析員
      (async () => {
        console.log('📊 [AI② 報告分析員] 開始整合模型預測...');
        const report = await analyst.generatePredictionReport(auditReport);
        console.log(`✅ [AI② 完成] 已產出 ${report.games.length} 場預測報告`);
        return report;
      })(),
      // AI③ 美編設計師 (先用空報告佔位，等報告完成後再生成)
      (async () => {
        // 等待一小段時間讓 AI② 開始產出
        await new Promise(resolve => setTimeout(resolve, 100));
        return null; // 圖片在報告完成後生成
      })(),
    ]);

    currentStatus.predictionReport = predictionReport;

    // AI③ 生成圖片（需要完整報告資料）
    console.log('\n🎨 [AI③ 美編設計師] 開始生成預測圖片...');
    currentStatus.phase = 'image';
    const svg = designer.generatePredictionSVG(predictionReport);

    // 儲存 SVG 到 data/reports/
    const fs = await import('fs');
    const path = await import('path');
    const reportsDir = path.join(process.cwd(), 'data', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const svgPath = path.join(reportsDir, `${date}-prediction.svg`);
    fs.writeFileSync(svgPath, svg, 'utf-8');
    console.log(`✅ [AI③ 完成] 預測圖片已儲存: ${svgPath}`);

    // 儲存報告 JSON
    const reportPath = path.join(reportsDir, `${date}-prediction.json`);
    fs.writeFileSync(reportPath, JSON.stringify(predictionReport, null, 2), 'utf-8');
    console.log(`📝 預測報告 JSON 已儲存: ${reportPath}`);

    // 儲存稽核報告 JSON
    const auditPath = path.join(reportsDir, `${date}-audit.json`);
    fs.writeFileSync(auditPath, JSON.stringify(auditReport, null, 2), 'utf-8');
    console.log(`📋 稽核報告 JSON 已儲存: ${auditPath}`);

    currentStatus.imageResult = {
      predictionImagePath: svgPath,
      width: 1200,
      height: 0, // Dynamic
    };

    // ─── 完成 ───
    currentStatus = {
      ...currentStatus,
      status: 'completed',
      phase: 'done',
      completedAt: new Date().toISOString(),
    };

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🎉 [流程調度器] 全部完成！`);
    console.log(`📅 目標日期: ${date}`);
    console.log(`📊 預測場次: ${predictionReport.games.length}`);
    console.log(`⏱️ 總耗時: ${getElapsed(currentStatus.startedAt!, currentStatus.completedAt!)}`);
    console.log(`${'═'.repeat(60)}\n`);

    return currentStatus;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [流程調度器] 執行失敗: ${errMsg}`);
    currentStatus = {
      ...currentStatus,
      status: 'error',
      error: errMsg,
      completedAt: new Date().toISOString(),
    };
    return currentStatus;
  }
}

/**
 * 賽後結果更新流程
 * 在比賽結束後調用，於預測圖片上疊加實際結果
 */
export async function runPostGameUpdate(
  targetDate: string,
  results: GameResult[]
): Promise<PipelineStatus> {
  console.log(`\n🏆 [流程調度器] 啟動賽後結果更新`);
  console.log(`📅 日期: ${targetDate}`);
  console.log(`⚾ 已完賽場次: ${results.filter(r => r.status === 'completed').length}\n`);

  try {
    const fs = await import('fs');
    const path = await import('path');
    const designer = await getDesigner();

    const reportsDir = path.join(process.cwd(), 'data', 'reports');
    const reportPath = path.join(reportsDir, `${targetDate}-prediction.json`);

    if (!fs.existsSync(reportPath)) {
      throw new Error(`找不到 ${targetDate} 的預測報告`);
    }

    const report: PredictionReportBundle = JSON.parse(
      fs.readFileSync(reportPath, 'utf-8')
    );

    // 生成含結果的 SVG
    const resultSvg = designer.generateResultOverlaySVG(report, results);
    const resultPath = path.join(reportsDir, `${targetDate}-result.svg`);
    fs.writeFileSync(resultPath, resultSvg, 'utf-8');
    console.log(`✅ 賽後結果圖片已儲存: ${resultPath}`);

    return {
      status: 'completed',
      phase: 'done',
      targetDate,
      completedAt: new Date().toISOString(),
      imageResult: {
        predictionImagePath: path.join(reportsDir, `${targetDate}-prediction.svg`),
        resultImagePath: resultPath,
        width: 1200,
        height: 0,
      },
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ 賽後更新失敗: ${errMsg}`);
    return {
      status: 'error',
      phase: null,
      targetDate,
      error: errMsg,
    };
  }
}

// ─── Helpers ───

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getElapsed(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs} 秒`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins} 分 ${remainSecs} 秒`;
}
