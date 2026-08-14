import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { exportProgressExcel } from '../../lib/excelProgress'
import {
  activeWorkItems,
  openDefectRemarks,
  overallProgress,
  workItemRollup,
} from '../../lib/stageProgress'

export function ReportsPage() {
  const state = useProjectStore()
  const project = useCurrentProject()
  const [busy, setBusy] = useState(false)
  const overview = useMemo(() => overallProgress(state), [state])
  const items = activeWorkItems(state)
  const remarks = useMemo(() => openDefectRemarks(state), [state])

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
      <header style={{ marginBottom: 14 }}>
        <div className="eyebrow">PROGRESS REPORT</div>
        <TitleHint
          as="h1"
          className="serif"
          style={{ margin: '4px 0 0', fontSize: 22 }}
          hint="完成率由各工項格子自動加總。備註來自未關閉缺失，不必再手抄到表下。"
        >
          {project?.name ?? state.projectName}
        </TitleHint>
      </header>

      <section className="glass" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>全案完成率</div>
            <div className="serif nums" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>
              {overview.percent}%
            </div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              {overview.completedCells}/{overview.totalCells} 格完成
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>
            <span>未關缺失 {overview.openDefects}</span>
            <span>缺失改善中 {overview.defectCells}</span>
            <span>卡關 {overview.blockedCells}</span>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', marginBottom: 16 }}
        disabled={busy}
        onClick={() => void exportExcel()}
      >
        <FileSpreadsheet size={18} />
        {busy ? '匯出中…' : '匯出進度 Excel'}
      </button>

      <div className="section-row">
        <h2>各工項</h2>
      </div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {items.map((item) => {
          const r = workItemRollup(state, item)
          return (
            <article key={item.id} className="glass" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{item.name}</strong>
                <span className="nums" style={{ fontWeight: 800 }}>
                  {r.percent}%
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
                完成 {r.completedCells}/{r.totalCells}
                {r.openDefects ? ` · 缺 ${r.openDefects}` : ''}
                {r.blockedCells ? ` · 卡關 ${r.blockedCells}` : ''}
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 8,
                  borderRadius: 99,
                  background: 'rgba(34,41,31,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${r.percent}%`,
                    height: '100%',
                    background: 'var(--green-deep)',
                    borderRadius: 99,
                  }}
                />
              </div>
            </article>
          )
        })}
        {items.length === 0 && (
          <p style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>尚未設定工項。</p>
        )}
      </div>

      <div className="section-row">
        <h2>備註（未關缺失）</h2>
      </div>
      <div className="glass" style={{ padding: 14 }}>
        {remarks.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-soft)', fontWeight: 600 }}>目前沒有未關閉缺失。</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            {remarks.map((d) => {
              const wi = items.find((w) => w.id === d.workItemId)
              const st = wi?.stages.find((s) => s.id === d.stageId)
              return (
                <li key={d.id} style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13 }}>
                  {d.unitCode}-{d.floor}
                  {wi ? ` ${wi.name}` : ''}
                  {st ? `／${st.name}` : ''}：{d.description || `缺失 #${d.defectNumber}`}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
