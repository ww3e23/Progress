import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { exportProgressExcel } from '../../lib/excelProgress'
import { formatActivity } from '../../lib/progress'
import { formatActorLabel } from '../../lib/currentActor'
import { overallProgress } from '../../lib/stageProgress'
import { buildReportWorkRows } from '../../lib/reportSummary'
import { ReportWorkMatrix } from './ReportWorkMatrix'
import { ReportPreview } from './ReportPreview'

export function ReportsPage() {
  const state = useProjectStore()
  const project = useCurrentProject()
  const [busy, setBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const overview = useMemo(() => overallProgress(state), [state])
  const rows = useMemo(() => buildReportWorkRows(state), [state])
  const activities = state.activities ?? []
  const hiddenKeys = state.hiddenReportStageKeys ?? []
  const setHiddenReportStageKeys = useProjectStore((s) => s.setHiddenReportStageKeys)
  const projectName = project?.name || state.projectName

  async function exportExcel() {
    if (busy) return
    setBusy(true)
    try {
      await exportProgressExcel(projectName, state)
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
          hint="全案工種一次看。匯出報表是可列印的進度矩陣；可用「隱藏工序」把已結案的工序拿掉。"
        >
          {projectName}
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

      <ReportWorkMatrix
        rows={rows}
        hiddenKeys={hiddenKeys}
        workItems={state.workItems}
        extraActions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setPreviewOpen(true)}>
              <FileText size={16} /> 匯出報表
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void exportExcel()}
            >
              <FileSpreadsheet size={16} />
              {busy ? '匯出中…' : '匯出 Excel'}
            </button>
          </>
        }
        onChangeHidden={setHiddenReportStageKeys}
      />

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

      {previewOpen && (
        <ReportPreview
          projectName={projectName}
          state={state}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}
