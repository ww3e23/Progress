import { useMemo, useState } from 'react'
import { ChevronDown, FileSpreadsheet } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { exportProgressExcel } from '../../lib/excelProgress'
import { formatActivity } from '../../lib/progress'
import { formatActorLabel } from '../../lib/currentActor'
import {
  activeWorkItems,
  overallProgress,
  workItemRollup,
} from '../../lib/stageProgress'

export function ReportsPage() {
  const state = useProjectStore()
  const project = useCurrentProject()
  const [busy, setBusy] = useState(false)
  const [itemsOpen, setItemsOpen] = useState(
    () => activeWorkItems(useProjectStore.getState()).length <= 6,
  )
  const overview = useMemo(() => overallProgress(state), [state])
  const items = activeWorkItems(state)
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
      <header style={{ marginBottom: 14 }}>
        <div className="eyebrow">PROGRESS REPORT</div>
        <TitleHint
          as="h1"
          className="serif"
          style={{ margin: '4px 0 0', fontSize: 22 }}
          hint="完成率由各工項格子自動加總。下方為現場操作紀錄。"
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
      <div className="glass" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <button
          type="button"
          className="building-fold-toggle"
          aria-expanded={itemsOpen}
          onClick={() => setItemsOpen((v) => !v)}
        >
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {items.length} 個工項
            </div>
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink-soft)',
                fontSize: 12,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {items.length === 0
                ? '尚未設定工項'
                : itemsOpen
                  ? '點此收合工項完成率'
                  : items.map((w) => w.name).join('、')}
            </div>
          </div>
          <ChevronDown
            size={20}
            style={{
              flexShrink: 0,
              color: 'var(--ink-soft)',
              transform: itemsOpen ? 'rotate(180deg)' : undefined,
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
        {itemsOpen && (
          <div className="fold-list">
            {items.map((item) => {
              const r = workItemRollup(state, item)
              return (
                <div key={item.id} className="building-fold-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{item.name}</strong>
                      <span className="nums" style={{ fontWeight: 800 }}>
                        {r.percent}%
                      </span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
                      完成 {r.completedCells}/{r.totalCells}
                      {r.openDefects ? ` · 缺 ${r.openDefects}` : ''}
                      {r.blockedCells ? ` · 卡關 ${r.blockedCells}` : ''}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        height: 6,
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
                  </div>
                </div>
              )
            })}
            {items.length === 0 && (
              <p style={{ margin: 0, padding: 14, color: 'var(--ink-soft)', fontWeight: 600 }}>
                尚未設定工項。
              </p>
            )}
          </div>
        )}
      </div>

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
