import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject, useCurrentRole } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { GlassSelect } from '../ui/GlassSelect'
import { UnitSwitcher } from '../UnitSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import { StageCellButton } from '../progress/StageCellButton'
import { CellActionSheet } from '../progress/CellActionSheet'
import { AddDefectSheet } from '../defects/AddDefectSheet'
import {
  activeWorkItems,
  buildStageMatrix,
  floorsOfBuilding,
  overallProgress,
  stageStatusLabel,
  unitWorkItemRows,
} from '../../lib/stageProgress'
import type { FocusedStageCell, StageStatus } from '../../types'

type HomeView = 'matrix' | 'unit'

export function HomePage() {
  const [view, setView] = useState<HomeView>('matrix')
  const [projectOpen, setProjectOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [longCell, setLongCell] = useState<FocusedStageCell | null>(null)
  const [sheetKind, setSheetKind] = useState<'progress' | 'defect' | null>(null)

  const projectName = useProjectStore((s) => s.projectName)
  const currentProject = useCurrentProject()
  const role = useCurrentRole()
  const canEdit = role === 'admin' || role === 'inspector'
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const workItems = useProjectStore((s) => s.workItems)
  const defects = useProjectStore((s) => s.defects)
  const stageProgress = useProjectStore((s) => s.stageProgress)
  const currentWorkItemId = useProjectStore((s) => s.currentWorkItemId)
  const currentBuildingId = useProjectStore((s) => s.currentBuildingId)
  const currentFloor = useProjectStore((s) => s.currentFloor)
  const applyDefaultWorkItems = useProjectStore((s) => s.applyDefaultWorkItems)
  const setCurrentWorkItem = useProjectStore((s) => s.setCurrentWorkItem)
  const setCurrentBuilding = useProjectStore((s) => s.setCurrentBuilding)
  const setCurrentFloor = useProjectStore((s) => s.setCurrentFloor)
  const cycleStageCell = useProjectStore((s) => s.cycleStageCell)
  const setStageCellStatus = useProjectStore((s) => s.setStageCellStatus)
  const setFocusedCell = useProjectStore((s) => s.setFocusedCell)

  const state = useProjectStore.getState()
  const items = activeWorkItems(state)
  const activeBuildings = [...buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  useEffect(() => {
    if (!items.length) applyDefaultWorkItems('fill-if-empty')
  }, [items.length, applyDefaultWorkItems])

  useEffect(() => {
    if (!currentWorkItemId && items[0]) setCurrentWorkItem(items[0].id)
  }, [currentWorkItemId, items, setCurrentWorkItem])

  useEffect(() => {
    if (!currentBuildingId && activeBuildings[0]) setCurrentBuilding(activeBuildings[0].id)
  }, [currentBuildingId, activeBuildings, setCurrentBuilding])

  const building = activeBuildings.find((b) => b.id === currentBuildingId) ?? activeBuildings[0]
  const floors = floorsOfBuilding(building)
  const floor = currentFloor && floors.includes(currentFloor) ? currentFloor : floors[0]
  const workItemId = currentWorkItemId && items.some((w) => w.id === currentWorkItemId)
    ? currentWorkItemId
    : items[0]?.id

  const matrix = useMemo(() => {
    if (!building || !floor || !workItemId) return null
    return buildStageMatrix(
      { ...useProjectStore.getState(), defects, stageProgress, workItems, units, buildings },
      building.id,
      floor,
      workItemId,
    )
  }, [building, floor, workItemId, defects, stageProgress, workItems, units, buildings])

  const overview = overallProgress(useProjectStore.getState())

  function handleTap(cell: FocusedStageCell) {
    setFocusedCell(cell)
    const result = cycleStageCell(cell)
    if (!result.ok) setToast(result.error || '無法更新')
    else setToast('')
  }

  function handleLong(cell: FocusedStageCell) {
    setFocusedCell(cell)
    setLongCell(cell)
  }

  const longUnit = longCell ? units.find((u) => u.id === longCell.unitId) : null
  const longItem = longCell ? items.find((w) => w.id === longCell.workItemId) : null
  const longStage = longItem?.stages.find((s) => s.id === longCell?.stageId)
  const longStatus: StageStatus =
    matrix?.rows
      .find((r) => r.unit.id === longCell?.unitId)
      ?.cells.find((c) => c.stageId === longCell?.stageId)?.status ?? 'not_started'
  const longOpen =
    matrix?.rows
      .find((r) => r.unit.id === longCell?.unitId)
      ?.cells.find((c) => c.stageId === longCell?.stageId)?.openDefects ?? 0

  if (!building) {
    return (
      <div className="rise">
        <header style={{ marginBottom: 12 }}>
          <div className="eyebrow">SITE PROGRESS</div>
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: '4px 0 0', fontSize: 22 }}
            hint="請到「我的」先建立棟別與戶別，再開始點格子記進度。"
          >
            {currentProject?.name ?? projectName}
          </TitleHint>
        </header>
      </div>
    )
  }

  return (
    <div className="rise">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">SITE PROGRESS</div>
          <button
            type="button"
            className="glass"
            onClick={() => setProjectOpen(true)}
            style={{
              marginTop: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              maxWidth: '100%',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentProject ? currentProject.name : projectName}
            </span>
            <ChevronDown size={16} />
          </button>
          <div style={{ color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, marginTop: 6 }}>
            全案 {overview.percent}% · 缺 {overview.openDefects} · 卡關 {overview.blockedCells}
          </div>
        </div>
        <div className="view-toggle" role="tablist" aria-label="視角">
          <button type="button" className={view === 'matrix' ? 'on' : ''} onClick={() => setView('matrix')}>
            工項矩陣
          </button>
          <button type="button" className={view === 'unit' ? 'on' : ''} onClick={() => setView('unit')}>
            按戶
          </button>
        </div>
      </header>

      <div className="home-filters">
        <GlassSelect
          label="棟別"
          value={building.id}
          options={activeBuildings.map((b) => ({ value: b.id, label: b.name }))}
          onChange={setCurrentBuilding}
        />
        <GlassSelect
          label="樓層"
          value={floor ?? ''}
          options={floors.map((f) => ({ value: f, label: f }))}
          onChange={setCurrentFloor}
        />
        <div className="home-filter-wide">
          <GlassSelect
            label="工項"
            value={workItemId ?? ''}
            options={items.map((w) => ({ value: w.id, label: w.name }))}
            onChange={setCurrentWorkItem}
          />
        </div>
      </div>

      {toast && <div className="toast-banner">{toast}</div>}

      {view === 'matrix' ? (
        <>
          <div className="legend-row">
            <span><i className="legend-dot" style={{ background: '#fff', border: '1px solid #e2ddd3' }} />未開始</span>
            <span><i className="legend-dot" style={{ background: 'var(--matrix-progress)' }} />施工中</span>
            <span><i className="legend-dot" style={{ background: 'var(--matrix-done)' }} />完成</span>
            <span><i className="legend-dot" style={{ background: '#c64545' }} />卡關</span>
            <span><i className="legend-dot" style={{ background: 'var(--matrix-defect)' }} />缺失改善中</span>
          </div>

          {matrix && (
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
              {matrix.workItem.name} · {matrix.floor} · {matrix.percent}%（{matrix.completedCells}/{matrix.totalCells}）
              {matrix.openDefects > 0 ? ` · 缺 ${matrix.openDefects}` : ''}
            </p>
          )}

          <div className="glass matrix-scroll" style={{ padding: 6 }}>
            {matrix && matrix.rows.length > 0 ? (
              <table className="stage-matrix">
                <thead>
                  <tr>
                    <th className="unit-cell">戶</th>
                    {matrix.stages.map((s) => (
                      <th key={s.id} className="stage-head">
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr key={row.unit.id}>
                      <td className="unit-cell">
                        <button
                          type="button"
                          style={{ fontWeight: 800 }}
                          onClick={() => {
                            useProjectStore.getState().setCurrentUnit(row.unit.id)
                            setView('unit')
                          }}
                        >
                          {row.unit.code}
                        </button>
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.stageId}>
                          <StageCellButton
                            status={cell.status}
                            openDefects={cell.openDefects}
                            disabled={!canEdit}
                            label={`${row.unit.code} ${cell.stageName} ${stageStatusLabel(cell.status)}`}
                            onTap={() =>
                              handleTap({
                                unitId: row.unit.id,
                                workItemId: matrix.workItem.id,
                                stageId: cell.stageId,
                              })
                            }
                            onLongPress={() =>
                              handleLong({
                                unitId: row.unit.id,
                                workItemId: matrix.workItem.id,
                                stageId: cell.stageId,
                              })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: 16, color: 'var(--ink-soft)', fontWeight: 600 }}>
                此樓層沒有可施工戶別。
              </p>
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
            點一下輪轉：未開始 → 施工中 → 完成。長按可拍照、記缺失或卡關。
          </p>
        </>
      ) : (
        <UnitView
          canEdit={canEdit}
          onOpenSwitcher={() => setUnitOpen(true)}
          onTap={handleTap}
          onLong={handleLong}
        />
      )}

      {projectOpen && <ProjectSwitcher onClose={() => setProjectOpen(false)} />}
      {unitOpen && <UnitSwitcher onClose={() => setUnitOpen(false)} />}

      {longCell && longUnit && longItem && longStage && !sheetKind && (
        <CellActionSheet
          title={`${longUnit.code}　${longStage.name}`}
          subtitle={`${longUnit.buildingName} ${longUnit.floor} · ${longItem.name}`}
          status={longStatus}
          openDefects={longOpen}
          canEdit={canEdit}
          onClose={() => setLongCell(null)}
          onProgress={() => setSheetKind('progress')}
          onDefect={() => setSheetKind('defect')}
          onBlock={() => {
            const r = setStageCellStatus({ ...longCell, status: 'blocked' })
            if (!r.ok) setToast(r.error || '無法卡關')
            setLongCell(null)
          }}
          onUnblock={() => {
            setStageCellStatus({ ...longCell, status: 'in_progress' })
            setLongCell(null)
          }}
        />
      )}

      {sheetKind && longCell && (
        <AddDefectSheet
          recordKind={sheetKind}
          workItemId={longCell.workItemId}
          stageId={longCell.stageId}
          unitId={longCell.unitId}
          onClose={() => {
            setSheetKind(null)
            setLongCell(null)
          }}
        />
      )}
    </div>
  )
}

function UnitView({
  canEdit,
  onOpenSwitcher,
  onTap,
  onLong,
}: {
  canEdit: boolean
  onOpenSwitcher: () => void
  onTap: (cell: FocusedStageCell) => void
  onLong: (cell: FocusedStageCell) => void
}) {
  const units = useProjectStore((s) => s.units)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const defects = useProjectStore((s) => s.defects)
  const stageProgress = useProjectStore((s) => s.stageProgress)
  const workItems = useProjectStore((s) => s.workItems)
  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const rows = unit
    ? unitWorkItemRows(
        { ...useProjectStore.getState(), defects, stageProgress, workItems, units },
        unit,
      )
    : []

  if (!unit) {
    return <p style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>請先選一戶。</p>
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginBottom: 12 }}
        onClick={onOpenSwitcher}
      >
        {unit.buildingName} · {unit.floor} · {unit.code}戶（切換）
      </button>
      {rows.map((row) => (
        <section key={row.workItem.id} className="glass" style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <strong>{row.workItem.name}</strong>
            <span style={{ color: 'var(--ink-soft)', fontSize: 12, fontWeight: 700 }}>
              {row.percent}%{row.openDefects > 0 ? ` · 缺 ${row.openDefects}` : ''}
            </span>
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
                  disabled={!canEdit}
                  label={`${cell.stageName} ${stageStatusLabel(cell.status)}`}
                  onTap={() =>
                    onTap({
                      unitId: unit.id,
                      workItemId: row.workItem.id,
                      stageId: cell.stageId,
                    })
                  }
                  onLongPress={() =>
                    onLong({
                      unitId: unit.id,
                      workItemId: row.workItem.id,
                      stageId: cell.stageId,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
