import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { exportProgressExcel } from '../../lib/excelProgress'
import { formatActivity } from '../../lib/progress'
import { formatActorLabel } from '../../lib/currentActor'
import { overallProgress } from '../../lib/stageProgress'
import { buildReportWorkRows } from '../../lib/reportSummary'
import { ReportWorkMatrix } from './ReportWorkMatrix'

export function ReportsPage() {
  const state = useProjectStore()
  const project = useCurrentProject()
  const [busy, setBusy] = useState(false)
  const overview = useMemo(() => overallProgress(state), [state])
  const rows = useMemo(() => buildReportWorkRows(state), [state])
  const activities = state.activities ?? []

  async function exportExcel() {
    if (busy) return
    setBusy(true)
    try {
      await exportProgressExcel(project?.name || state.projectName, state)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rise">
      <header>
        <div className="eyebrow">PROGRESS REPORT</div>
        <TitleHint
          as="h1"
          className="serif"
          style={{ margin: '4px 0 0', fontSize: 22 }}
          hint="全案工種一次看：矩陣不可改，樓層已匯總。下方文字是各工種戶數。"
        >
          {project?.name ?? state.projectName}
        </TitleHint>
      </header>

      <section className="glass report-overview">
        <div>
          <div className="report-overview-label">全案完成率</div>
          <div className="serif nums report-overview-pct">{overview.percent}%</div>
          <div className="report-overview-sub">
            {overview.completedCells}/{overview.totalCells} 格完成
          </div>
        </div>
        <div className="report-overview-side">
          <span>未關缺失 {overview.openDefects}</span>
          <span>缺失改善中 {overview.defectCells}</span>
          <span>卡關 {overview.blockedCells}</span>
        </div>
      </section>

      <div className="legend-row report-legend">
        <span>
          <i className="legend-dot" style={{ background: '#fff', border: '1px solid #e2ddd3' }} />
          未開始
        </span>
        <span>
          <i className="legend-dot" style={{ background: 'var(--matrix-progress)' }} />
          施工中
        </span>
        <span>
          <i className="legend-dot" style={{ background: 'var(--matrix-done)' }} />
          完成
        </span>
        <span>
          <i className="legend-dot" style={{ background: 'var(--matrix-na)', border: '1px solid #c5ced8' }} />
          不適用
        </span>
        <span>
          <i className="legend-dot" style={{ background: '#c64545' }} />
          卡關
        </span>
        <span>
          <i className="legend-dot" style={{ background: 'var(--matrix-defect)' }} />
          缺失
        </span>
      </div>

      <ReportWorkMatrix rows={rows} />

      <div className="section-row">
        <h2>各工種戶數</h2>
      </div>
      <div className="glass report-copy">
        {rows.length === 0 ? (
          <p className="report-empty" style={{ padding: 0 }}>
            尚無工種可統計。
          </p>
        ) : (
          rows.map((row) => (
            <p key={row.id}>
              {row.householdsTotal === 0
                ? `${row.name}：沒有應施作戶（皆不適用）。`
                : `${row.name}：已完成 ${row.householdsDone} 戶，未完成 ${row.householdsLeft} 戶，應施作 ${row.householdsTotal} 戶，進度 ${row.percent}%。`}
            </p>
          ))
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', margin: '14px 0 4px' }}
        disabled={busy}
        onClick={() => void exportExcel()}
      >
        <FileSpreadsheet size={18} />
        {busy ? '匯出中…' : '匯出進度 Excel'}
      </button>

      <div className="section-row">
        <h2>操作紀錄</h2>
      </div>
      <div className="glass" style={{ padding: '4px 14px' }}>
        {activities.map((a) => (
          <div
            key={a.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '56px minmax(0, 1fr)',
              gap: 8,
              padding: '12px 0',
              borderBottom: '1px solid rgba(34,41,31,0.08)',
              fontSize: 13,
            }}
          >
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>{a.at}</span>
            <div style={{ minWidth: 0 }}>
              <div>
                <strong>{formatActivity(a)}</strong>
                <span style={{ color: 'var(--ink-soft)' }}> · {a.summary}</span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: 'var(--green-deep)',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                操作人：{formatActorLabel(a.actorName, a.actorAccount)}
              </div>
            </div>
          </div>
        ))}
        {activities.length === 0 && (
          <div style={{ padding: '14px 0', color: 'var(--ink-soft)', fontWeight: 600 }}>
            尚無操作紀錄
          </div>
        )}
      </div>
    </div>
  )
}
