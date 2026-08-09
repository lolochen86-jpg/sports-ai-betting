'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type {
  PredictionReportBundle,
  DataAuditReport,
  GamePredictionReport,
  ReasoningSection,
  PipelineStatus,
} from '@/lib/ai-pipeline/types';

// ─── Styling Constants ───
const COLORS = {
  bg: '#0a0d16',
  card: 'rgba(30, 27, 75, 0.6)',
  cardBorder: 'rgba(99, 102, 241, 0.15)',
  accent: '#818cf8',
  accentGlow: 'rgba(129, 140, 248, 0.3)',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  mlb: '#005A9C',
  nba: '#ff6b00',
};

export default function DailyReportPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [report, setReport] = useState<PredictionReportBundle | null>(null);
  const [audit, setAudit] = useState<DataAuditReport | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'report' | 'audit' | 'image'>('report');
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState('');

  const fetchReport = useCallback(async (date: string) => {
    setLoading(true);
    setError('');
    try {
      const [reportRes, auditRes] = await Promise.all([
        fetch(`/api/ai-pipeline/report?date=${date}&type=json`),
        fetch(`/api/ai-pipeline/report?date=${date}&type=audit`),
      ]);

      if (reportRes.ok) {
        const reportData = await reportRes.json();
        if (reportData.success) setReport(reportData.data);
      }
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        if (auditData.success) setAudit(auditData.data);
      }

      // Try loading SVG
      const svgRes = await fetch(`/api/ai-pipeline/report?date=${date}&type=svg`);
      if (svgRes.ok) {
        const svg = await svgRes.text();
        setSvgContent(svg);
      }
    } catch {
      setError('無法載入報告');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-pipeline/run');
      if (res.ok) {
        const data = await res.json();
        if (data.success) setPipelineStatus(data.data);
      }
    } catch { /* ignore */ }
  }, []);

  const triggerPipeline = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-pipeline/run?date=${selectedDate}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPipelineStatus(data.data);
        // Poll for completion
        const interval = setInterval(async () => {
          const statusRes = await fetch('/api/ai-pipeline/run');
          const statusData = await statusRes.json();
          if (statusData.success) {
            setPipelineStatus(statusData.data);
            if (statusData.data.status !== 'running') {
              clearInterval(interval);
              fetchReport(selectedDate);
            }
          }
        }, 3000);
      }
    } catch {
      setError('觸發流程失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedDate);
    fetchStatus();
  }, [selectedDate, fetchReport, fetchStatus]);

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'positive': return COLORS.success;
      case 'negative': return COLORS.error;
      default: return COLORS.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return '✅';
      case 'missing': return '❌';
      case 'degraded': return '⚠️';
      default: return '❓';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${COLORS.bg} 0%, #0f172a 50%, #1e1b4b 100%)`,
      color: COLORS.textPrimary,
      fontFamily: "'Outfit', 'Noto Sans TC', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${COLORS.cardBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/" style={{
            color: COLORS.textSecondary,
            textDecoration: 'none',
            fontSize: '14px',
          }}>← 返回首頁</Link>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #818cf8, #a78bfa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            🤖 AI 每日預測戰報
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: `1px solid ${COLORS.cardBorder}`,
              background: 'rgba(30, 27, 75, 0.6)',
              color: COLORS.textPrimary,
              fontSize: '14px',
            }}
          />
          <button
            onClick={triggerPipeline}
            disabled={loading || pipelineStatus?.status === 'running'}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: pipelineStatus?.status === 'running'
                ? 'rgba(99, 102, 241, 0.3)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '14px',
              cursor: pipelineStatus?.status === 'running' ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {pipelineStatus?.status === 'running'
              ? `⏳ 執行中 (${pipelineStatus.phase})...`
              : '🚀 執行 AI 預測流程'}
          </button>
        </div>
      </header>

      {/* Pipeline Status Bar */}
      {pipelineStatus && pipelineStatus.status !== 'idle' && (
        <div style={{
          margin: '16px 32px',
          padding: '16px 24px',
          borderRadius: '12px',
          background: pipelineStatus.status === 'running'
            ? 'rgba(99, 102, 241, 0.1)'
            : pipelineStatus.status === 'completed'
              ? 'rgba(34, 197, 94, 0.1)'
              : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${
            pipelineStatus.status === 'running' ? 'rgba(99, 102, 241, 0.3)'
              : pipelineStatus.status === 'completed' ? 'rgba(34, 197, 94, 0.3)'
                : 'rgba(239, 68, 68, 0.3)'
          }`,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{ fontSize: '20px' }}>
            {pipelineStatus.status === 'running' ? '⏳'
              : pipelineStatus.status === 'completed' ? '✅'
                : '❌'}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>
              {pipelineStatus.status === 'running' && `三位 AI 正在協作中... (Phase: ${pipelineStatus.phase})`}
              {pipelineStatus.status === 'completed' && '預測報告已生成完成！'}
              {pipelineStatus.status === 'error' && `流程出錯: ${pipelineStatus.error}`}
            </div>
            {pipelineStatus.completedAt && (
              <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '2px' }}>
                完成時間: {new Date(pipelineStatus.completedAt).toLocaleString('zh-TW')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <nav style={{
        padding: '0 32px',
        marginTop: '8px',
        display: 'flex',
        gap: '4px',
        borderBottom: `1px solid ${COLORS.cardBorder}`,
      }}>
        {[
          { key: 'report' as const, label: '📊 預測報告', icon: '📊' },
          { key: 'audit' as const, label: '🔍 資料檢核', icon: '🔍' },
          { key: 'image' as const, label: '🖼️ 預測圖片', icon: '🖼️' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'transparent',
              color: activeTab === tab.key ? COLORS.accent : COLORS.textSecondary,
              fontWeight: activeTab === tab.key ? 700 : 400,
              fontSize: '14px',
              cursor: 'pointer',
              borderBottom: activeTab === tab.key
                ? `2px solid ${COLORS.accent}`
                : '2px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
        {error && (
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: COLORS.error,
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '60px 0',
            color: COLORS.textSecondary,
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <p>載入中...</p>
          </div>
        )}

        {/* Tab: 預測報告 */}
        {activeTab === 'report' && !loading && (
          <>
            {report ? (
              <div>
                {/* Summary Header */}
                <div style={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: COLORS.card,
                  border: `1px solid ${COLORS.cardBorder}`,
                  marginBottom: '24px',
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
                    📅 {report.targetDate} 預測總覽
                  </h2>
                  <p style={{ color: COLORS.textSecondary, fontSize: '14px', lineHeight: 1.8 }}>
                    {report.overallSummary}
                  </p>
                  <div style={{ marginTop: '12px', display: 'flex', gap: '24px' }}>
                    <span style={{ fontSize: '13px', color: COLORS.textSecondary }}>
                      🏟️ 總場次: <strong style={{ color: COLORS.textPrimary }}>{report.totalGames}</strong>
                    </span>
                    <span style={{ fontSize: '13px', color: COLORS.textSecondary }}>
                      ⏰ 生成時間: <strong style={{ color: COLORS.textPrimary }}>
                        {new Date(report.generatedAt).toLocaleString('zh-TW')}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Game Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(620px, 1fr))',
                  gap: '20px',
                }}>
                  {report.games.map((game) => (
                    <GameReportCard key={game.gameId} game={game} />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon="📊"
                title="尚無預測報告"
                desc={`${selectedDate} 的預測報告尚未生成，請點擊上方「執行 AI 預測流程」按鈕`}
              />
            )}
          </>
        )}

        {/* Tab: 資料檢核 */}
        {activeTab === 'audit' && !loading && (
          <>
            {audit ? (
              <div>
                <div style={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: COLORS.card,
                  border: `1px solid ${COLORS.cardBorder}`,
                  marginBottom: '24px',
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
                    🔍 資料完整性檢核報告
                  </h2>
                  <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                    <StatBadge label="總場次" value={audit.totalGames} />
                    <StatBadge label="完全齊全" value={audit.summary.fullyComplete} color={COLORS.success} />
                    <StatBadge label="部分缺少" value={audit.summary.partiallyComplete} color={COLORS.warning} />
                    <StatBadge label="平均完整度" value={`${audit.summary.averageCompleteness.toFixed(1)}%`} />
                  </div>
                  {audit.summary.missingItems.length > 0 && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                    }}>
                      <p style={{ fontSize: '13px', color: COLORS.warning, fontWeight: 600 }}>
                        ⚠️ 缺少項目: {audit.summary.missingItems.join('、')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Per-game audit */}
                {audit.games.map((game) => (
                  <div key={game.gameId} style={{
                    padding: '20px',
                    borderRadius: '12px',
                    background: COLORS.card,
                    border: `1px solid ${COLORS.cardBorder}`,
                    marginBottom: '12px',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: game.league === 'MLB' ? COLORS.mlb : COLORS.nba,
                          fontSize: '11px',
                          fontWeight: 700,
                        }}>
                          {game.league}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                          {game.awayTeam.nameCn} @ {game.homeTeam.nameCn}
                        </span>
                      </div>
                      <div style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        background: game.completeness >= 100
                          ? 'rgba(34, 197, 94, 0.15)'
                          : game.completeness >= 70
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        color: game.completeness >= 100
                          ? COLORS.success
                          : game.completeness >= 70
                            ? COLORS.warning
                            : COLORS.error,
                        fontSize: '12px',
                        fontWeight: 600,
                      }}>
                        {game.completeness.toFixed(0)}% 完整
                      </div>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                      gap: '8px',
                    }}>
                      {game.checks.map((check, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: 'rgba(15, 23, 42, 0.5)',
                          fontSize: '13px',
                        }}>
                          <span>{getStatusIcon(check.status)}</span>
                          <span style={{ color: COLORS.textSecondary }}>{check.label}</span>
                          {check.reason && (
                            <span style={{ color: COLORS.warning, fontSize: '11px', marginLeft: 'auto' }}>
                              ({check.reason})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="🔍"
                title="尚無檢核報告"
                desc="資料完整性檢核報告將在 AI 流程執行後產生"
              />
            )}
          </>
        )}

        {/* Tab: 預測圖片 */}
        {activeTab === 'image' && !loading && (
          <>
            {svgContent ? (
              <div>
                <div style={{
                  padding: '20px',
                  borderRadius: '16px',
                  background: COLORS.card,
                  border: `1px solid ${COLORS.cardBorder}`,
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700 }}>
                    🖼️ {selectedDate} 預測海報
                  </h2>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${selectedDate}-prediction.svg`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: `1px solid ${COLORS.cardBorder}`,
                        background: 'transparent',
                        color: COLORS.accent,
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      📥 下載 SVG
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    borderRadius: '16px',
                    overflow: 'hidden',
                    border: `1px solid ${COLORS.cardBorder}`,
                    background: '#000',
                  }}
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              </div>
            ) : (
              <EmptyState
                icon="🖼️"
                title="尚無預測圖片"
                desc="預測海報將在 AI 流程執行後自動生成"
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───

function GameReportCard({ game }: { game: GamePredictionReport }) {
  const [expanded, setExpanded] = useState(false);
  const leagueColor = game.league === 'MLB' ? COLORS.mlb : COLORS.nba;

  return (
    <div style={{
      borderRadius: '16px',
      background: COLORS.card,
      border: `1px solid ${COLORS.cardBorder}`,
      overflow: 'hidden',
      transition: 'all 0.3s',
    }}>
      {/* Card Header */}
      <div style={{
        padding: '20px',
        borderBottom: `1px solid ${COLORS.cardBorder}`,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              padding: '3px 10px',
              borderRadius: '6px',
              background: leagueColor,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.5px',
            }}>
              {game.league}
            </span>
            <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>
              {game.venue}
            </span>
          </div>
        </div>

        {/* Team Matchup */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
        }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{
              fontSize: '18px',
              fontWeight: 700,
              color: game.prediction.winner === 'away' ? COLORS.success : COLORS.textPrimary,
            }}>
              {game.awayTeam.nameCn}
            </div>
            <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '2px' }}>
              {game.awayTeam.code} (客)
            </div>
          </div>
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: COLORS.textSecondary,
            padding: '6px 14px',
            borderRadius: '20px',
            background: 'rgba(15, 23, 42, 0.6)',
          }}>
            VS
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{
              fontSize: '18px',
              fontWeight: 700,
              color: game.prediction.winner === 'home' ? COLORS.success : COLORS.textPrimary,
            }}>
              {game.homeTeam.nameCn}
            </div>
            <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '2px' }}>
              {game.homeTeam.code} (主)
            </div>
          </div>
        </div>
      </div>

      {/* Prediction Result */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-around',
        background: 'rgba(15, 23, 42, 0.3)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: COLORS.textSecondary, marginBottom: '4px' }}>
            🎯 勝負預測
          </div>
          <div style={{ fontWeight: 700, color: COLORS.success }}>
            {game.prediction.winnerTeamName}
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 800,
            background: `linear-gradient(135deg, ${COLORS.success}, #4ade80)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {game.prediction.confidence}%
          </div>
        </div>
        <div style={{
          width: '1px',
          background: COLORS.cardBorder,
        }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: COLORS.textSecondary, marginBottom: '4px' }}>
            🎲 大小分
          </div>
          <div style={{ fontWeight: 700, color: COLORS.accent }}>
            {game.prediction.ouPick === 'Over' ? '⬆️ 大分' : '⬇️ 小分'}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: COLORS.textPrimary }}>
            O/U {game.prediction.ouLine}
          </div>
        </div>
        <div style={{
          width: '1px',
          background: COLORS.cardBorder,
        }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: COLORS.textSecondary, marginBottom: '4px' }}>
            📊 預測比分
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 800,
            color: COLORS.textPrimary,
          }}>
            {game.prediction.awayExpectedScore.toFixed(1)} - {game.prediction.homeExpectedScore.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Reasoning Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px',
          border: 'none',
          borderTop: `1px solid ${COLORS.cardBorder}`,
          background: 'transparent',
          color: COLORS.accent,
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          transition: 'background 0.2s',
        }}
      >
        {expanded ? '收起推理分析 ▲' : '展開推理分析 ▼'}
        <span style={{ fontSize: '11px', color: COLORS.textSecondary }}>
          ({game.reasoning.length} 項因素)
        </span>
      </button>

      {/* Expanded Reasoning */}
      {expanded && (
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${COLORS.cardBorder}`,
          background: 'rgba(15, 23, 42, 0.4)',
        }}>
          {game.reasoning.map((r: ReasoningSection, idx: number) => (
            <div key={idx} style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(30, 27, 75, 0.4)',
              border: `1px solid ${COLORS.cardBorder}`,
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>{r.icon}</span>
              <div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  marginBottom: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  {r.category}
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: `${getImpactColor(r.impact)}20`,
                    color: getImpactColor(r.impact),
                    fontWeight: 600,
                  }}>
                    {r.impact === 'positive' ? '有利' : r.impact === 'negative' ? '不利' : '中性'}
                    {r.impactTeam && ` ${r.impactTeam === 'home' ? '主隊' : '客隊'}`}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: COLORS.textSecondary, lineHeight: 1.6, margin: 0 }}>
                  {r.explanation}
                </p>
              </div>
            </div>
          ))}

          {/* Model Breakdown */}
          {game.modelBreakdown.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '14px',
              borderRadius: '8px',
              background: 'rgba(15, 23, 42, 0.5)',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: COLORS.accent }}>
                🤖 模型預測一覽
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {game.modelBreakdown.map((m, idx) => (
                  <div key={idx} style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: 'rgba(30, 27, 75, 0.3)',
                    textAlign: 'center',
                    fontSize: '12px',
                  }}>
                    <div style={{ color: COLORS.textSecondary, marginBottom: '2px' }}>{m.modelName}</div>
                    <div style={{ fontWeight: 700, color: COLORS.success }}>
                      {m.winner === 'home' ? game.homeTeam.nameCn : game.awayTeam.nameCn}
                    </div>
                    <div style={{ fontSize: '11px', color: COLORS.textSecondary }}>
                      {m.confidence}% | {m.awayScore.toFixed(1)}-{m.homeScore.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: color || COLORS.textPrimary }}>{value}</div>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '80px 0',
      color: COLORS.textSecondary,
    }}>
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ fontSize: '18px', fontWeight: 700, color: COLORS.textPrimary, marginBottom: '8px' }}>
        {title}
      </h3>
      <p style={{ fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>{desc}</p>
    </div>
  );
}
