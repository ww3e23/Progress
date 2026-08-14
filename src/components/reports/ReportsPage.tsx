import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { GlassSelect } from '../ui/GlassSelect'
import { UnitSwitcher } from '../UnitSwitcher'
import { FloorStageMatrix } from '../progress/FloorStageMatrix'
import { StageCellButton } from '../progress/StageCellButton'
import { exportProgressExcel } from '../../lib/excelProgress'
import { formatActivity } from '../../lib/progress'
import { formatActorLabel } from '../../lib/currentActor'
import { formatUnitTitle, layoutForUnit } from '../../lib/units'
import {
  activeWorkItems,
  buildWorkItemFloorMatrix,
  overallProgress,
  stageStatusLabel,
  stepActiveUnit,
  unitWorkItemRows,
} from '../../lib/stageProgress'

type ReportView = 'workItem' | 'unit'

export function ReportsPage() {
  const state = useProjectStore()
  const project = useCurrentProject()
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<ReportView>('workItem')
  const [unitOpen, setUnitOpen] = useState(false)
  const overview = useMemo(() => overallProgress(state), [state])
  const items = activeWorkItems(state)
  const activities = state.activities ?? []

  const buildings = [...state.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const building =
    buildings.find((b) => b.id === state.currentBuildingId) ?? buildings[0]
  const workItemId =
    state.currentWorkItemId && items.some((w) => w.id === state.currentWorkItemId)
      ? state.currentWorkItemId
      : items[0]?.id

  const floorMatrix = useMemo(() => {
    if (!building || !workItemId) return null
    return buildWorkItemFloorMatrix(state, building.id, workItemId)
  }, [state, building, workItemId])

  const unit =
    state.units.find((u) => u.id === state.currentUnitId) ?? state.units.find((u) => u.active)
  const unitRows = unit ? unitWorkItemRows(state, unit) : []

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
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">PROGRESS REPORT</div>
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: '4px 0 0', fontSize: 22 }}
            hint="工項矩陣看整層工序；各戶進度一次看一戶的全部工項。"
          >
            {project?.name ?? state.projectName}
          </TitleHint>
        </div>
        <div className="view-toggle" role="tablist" aria-label="報表視角">
          <button
            type="button"
            className={view === 'workItem' ? 'on' : ''}
            onClick={() => setView('workItem')}
          >
            工項矩陣
          </button>
          <button type="button" className={view === 'unit' ? 'on' : ''} onClick={() => setView('unit')}>
            各戶進度
          </button>
        </div>
      </header>

      <section className="glass" style={{ padding: 16, margin: '12px 0' }}>
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

      {view === 'workItem' ? (
        <>
          <div className="home-filters">
            <GlassSelect
              label="棟別"
              value={building?.id ?? ''}
              options={buildings.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(id) => useProjectStore.getState().setCurrentBuilding(id)}
            />
            <GlassSelect
              label="工項"
              value={workItemId ?? ''}
              options={items.map((w) => ({ value: w.id, label: w.name }))}
              onChange={(id) => useProjectStore.getState().setCurrentWorkItem(id)}
            />
          </div>
          {floorMatrix && (
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
              {floorMatrix.workItem.name} · {floorMatrix.building.name} · {floorMatrix.percent}%（
              {floorMatrix.completedCells}/{floorMatrix.totalCells}）
            </p>
          )}
          <div className="glass matrix-scroll" style={{ padding: 6, marginBottom: 16 }}>
            {floorMatrix ? (
              <FloorStageMatrix matrix={floorMatrix} canEdit={false} />
            ) : (
              <p style={{ padding: 16, color: 'var(--ink-soft)', fontWeight: 600 }}>請先設定棟別與工項。</p>
            )}
          </div>
        </>
      ) : (
        <>
          {unit ? (
            <div className="unit-pager">
              <button
                type="button"
                className="icon-btn"
                aria-label="上一戶"
                onClick={() => {
                  const next = stepActiveUnit(useProjectStore.getState(), unit.id, -1)
                  if (next) useProjectStore.getState().setCurrentUnit(next.id)
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <button type="button" className="unit-pager-current" onClick={() => setUnitOpen(true)}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {formatUnitTitle(unit, layoutForUnit(state.buildings, unit))}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>點此切換</div>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="下一戶"
                onClick={() => {
                  const next = stepActiveUnit(useProjectStore.getState(), unit.id, 1)
                  if (next) useProjectStore.getState().setCurrentUnit(next.id)
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          ) : (
            <p style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>請先選一戶。</p>
          )}
          {unitRows.map((row) => (
            <section key={row.workItem.id} className="glass" style={{ padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <strong>{row.workItem.name}</strong>
                <span className="nums" style={{ fontWeight: 800 }}>
                  {row.percent}%
                </span>
              </div>
              <div style={{ marginBottom: 8, height: 6, borderRadius: 99, background: 'rgba(30,39,51,0.08)' }}>
                <div
                  style={{
                    width: `${row.percent}%`,
                    height: '100%',
                    background: 'var(--green-deep)',
                    borderRadius: 99,
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {row.cells.map((cell) => (
                  <div key={cell.stageId} style={{ textAlign: 'center', minWidth: 52 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>
                      {cell.stageName}
                    </div>
                    <StageCellButton
                      status={cell.status}
                      openDefects={cell.openDefects}
                      disabled
                      label={`${cell.stageName} ${stageStatusLabel(cell.status)}`}
                      onTap={() => undefined}
                      onLongPress={() => undefined}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {unitOpen && <UnitSwitcher onClose={() => setUnitOpen(false)} />}
        </>
      )}

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
