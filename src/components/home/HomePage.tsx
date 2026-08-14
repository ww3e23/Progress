import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject, useCurrentRole } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { GlassSelect } from '../ui/GlassSelect'
import { Modal } from '../ui/Modal'
import { UnitSwitcher } from '../UnitSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import { StageCellButton } from '../progress/StageCellButton'
import { FloorStageMatrix } from '../progress/FloorStageMatrix'
import { CellActionSheet } from '../progress/CellActionSheet'
import { AddDefectSheet } from '../defects/AddDefectSheet'
import {
  activeWorkItems,
  buildWorkItemFloorMatrix,
  cellKey,
  effectiveStageStatus,
  openDefectsOnCell,
  overallProgress,
  stageStatusLabel,
  stepActiveUnit,
  storedStageStatus,
  unitWorkItemRows,
  type FloorMatrixCell,
} from '../../lib/stageProgress'
import type { FocusedStageCell, StageStatus, Unit } from '../../types'

type HomeView = 'matrix' | 'unit'

export function HomePage() {
  const [view, setView] = useState<HomeView>('matrix')
  const [projectOpen, setProjectOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [longCell, setLongCell] = useState<FocusedStageCell | null>(null)
  const [floorPick, setFloorPick] = useState<{ floor: string; cell: FloorMatrixCell } | null>(null)
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
  const applyDefaultWorkItems = useProjectStore((s) => s.applyDefaultWorkItems)
  const setCurrentWorkItem = useProjectStore((s) => s.setCurrentWorkItem)
  const setCurrentBuilding = useProjectStore((s) => s.setCurrentBuilding)
  const cycleStageCell = useProjectStore((s) => s.cycleStageCell)
  const cycleFloorStage = useProjectStore((s) => s.cycleFloorStage)
  const setStageCellStatus = useProjectStore((s) => s.setStageCellStatus)
  const setFloorStageStatus = useProjectStore((s) => s.setFloorStageStatus)
  const setFocusedCell = useProjectStore((s) => s.setFocusedCell)
  const setCurrentUnit = useProjectStore((s) => s.setCurrentUnit)

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
  const workItemId = currentWorkItemId && items.some((w) => w.id === currentWorkItemId)
    ? currentWorkItemId
    : items[0]?.id

  const matrix = useMemo(() => {
    if (!building || !workItemId) return null
    return buildWorkItemFloorMatrix(
      { ...useProjectStore.getState(), defects, stageProgress, workItems, units, buildings },
      building.id,
      workItemId,
    )
  }, [building, workItemId, defects, stageProgress, workItems, units, buildings])

  const overview = overallProgress(useProjectStore.getState())

  function handleUnitTap(cell: FocusedStageCell) {
    setFocusedCell(cell)
    const result = cycleStageCell(cell)
    if (!result.ok) setToast(result.error || '無法更新')
    else setToast('')
  }

  function handleUnitLong(cell: FocusedStageCell) {
    setFocusedCell(cell)
    setLongCell(cell)
  }

  function handleFloorTap(floor: string, cell: FloorMatrixCell) {
    if (!building || !workItemId) return
    const result = cycleFloorStage({
      buildingId: building.id,
      floor,
      workItemId,
      stageId: cell.stageId,
    })
    if (!result.ok) setToast(result.error || '無法更新')
    else setToast('')
  }

  function handleFloorLong(floor: string, cell: FloorMatrixCell) {
    if (cell.unitIds.length === 1) {
      handleUnitLong({
        unitId: cell.unitIds[0],
        workItemId: workItemId!,
        stageId: cell.stageId,
      })
      return
    }
    setFloorPick({ floor, cell })
  }

  const longUnit = longCell ? units.find((u) => u.id === longCell.unitId) : null
  const longItem = longCell ? items.find((w) => w.id === longCell.workItemId) : null
  const longStage = longItem?.stages.find((s) => s.id === longCell?.stageId)
  const longLive = longCell
    ? (() => {
        const stored = storedStageStatus(
          stageProgress,
          cellKey(longCell.unitId, longCell.workItemId, longCell.stageId),
        )
        const open = openDefectsOnCell(
          defects,
          longCell.unitId,
          longCell.workItemId,
          longCell.stageId,
        ).length
        return { status: effectiveStageStatus(stored, open), open }
      })()
    : { status: 'not_started' as StageStatus, open: 0 }
  const longStatus = longLive.status
  const longOpen = longLive.open

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

      {view === 'matrix' && (
        <div className="home-filters">
          <GlassSelect
            label="棟別"
            value={building.id}
            options={activeBuildings.map((b) => ({ value: b.id, label: b.name }))}
            onChange={setCurrentBuilding}
          />
          <GlassSelect
            label="工項"
            value={workItemId ?? ''}
            options={items.map((w) => ({ value: w.id, label: w.name }))}
            onChange={setCurrentWorkItem}
          />
        </div>
      )}

      {toast && <div className="toast-banner">{toast}</div>}

      {view === 'matrix' ? (
        <>
          <LegendRow />
          {matrix && (
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
              {matrix.workItem.name} · {matrix.building.name} · {matrix.percent}%（{matrix.completedCells}/
              {matrix.totalCells} 層序）
              {matrix.openDefects > 0 ? ` · 缺 ${matrix.openDefects}` : ''}
            </p>
          )}
          <div className="glass matrix-scroll" style={{ padding: 6 }}>
            {matrix ? (
              <FloorStageMatrix
                matrix={matrix}
                canEdit={canEdit}
                onTap={handleFloorTap}
                onLong={handleFloorLong}
              />
            ) : (
              <p style={{ padding: 16, color: 'var(--ink-soft)', fontWeight: 600 }}>請先選擇工項。</p>
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
            以工項為準，一格代表整層。點一下整層輪轉：未開始 → 施工中 → 完成。長按可選戶拍照、記缺失或整層卡關。
          </p>
        </>
      ) : (
        <UnitView
          canEdit={canEdit}
          onOpenSwitcher={() => setUnitOpen(true)}
          onTap={handleUnitTap}
          onLong={handleUnitLong}
          onStep={(delta) => {
            const next = stepActiveUnit(useProjectStore.getState(), useProjectStore.getState().currentUnitId, delta)
            if (next) setCurrentUnit(next.id)
          }}
        />
      )}

      {projectOpen && <ProjectSwitcher onClose={() => setProjectOpen(false)} />}
      {unitOpen && <UnitSwitcher onClose={() => setUnitOpen(false)} />}

      {floorPick && building && workItemId && !longCell && !sheetKind && (
        <FloorUnitPickSheet
          floor={floorPick.floor}
          cell={floorPick.cell}
          workItemName={items.find((w) => w.id === workItemId)?.name ?? '工項'}
          units={units.filter((u) => floorPick.cell.unitIds.includes(u.id))}
          canEdit={canEdit}
          onClose={() => setFloorPick(null)}
          onPickUnit={(unit) => {
            setFloorPick(null)
            handleUnitLong({
              unitId: unit.id,
              workItemId,
              stageId: floorPick.cell.stageId,
            })
          }}
          onBlockFloor={() => {
            const r = setFloorStageStatus({
              buildingId: building.id,
              floor: floorPick.floor,
              workItemId,
              stageId: floorPick.cell.stageId,
              status: 'blocked',
            })
            if (!r.ok) setToast(r.error || '無法卡關')
            setFloorPick(null)
          }}
          onUnblockFloor={() => {
            setFloorStageStatus({
              buildingId: building.id,
              floor: floorPick.floor,
              workItemId,
              stageId: floorPick.cell.stageId,
              status: 'in_progress',
            })
            setFloorPick(null)
          }}
        />
      )}

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

function LegendRow() {
  return (
    <div className="legend-row">
      <span><i className="legend-dot" style={{ background: '#fff', border: '1px solid #e2ddd3' }} />未開始</span>
      <span><i className="legend-dot" style={{ background: 'var(--matrix-progress)' }} />施工中</span>
      <span><i className="legend-dot" style={{ background: 'var(--matrix-done)' }} />完成</span>
      <span><i className="legend-dot" style={{ background: '#c64545' }} />卡關</span>
      <span><i className="legend-dot" style={{ background: 'var(--matrix-defect)' }} />缺失改善中</span>
    </div>
  )
}

function FloorUnitPickSheet({
  floor,
  cell,
  workItemName,
  units,
  canEdit,
  onClose,
  onPickUnit,
  onBlockFloor,
  onUnblockFloor,
}: {
  floor: string
  cell: FloorMatrixCell
  workItemName: string
  units: Unit[]
  canEdit: boolean
  onClose: () => void
  onPickUnit: (unit: Unit) => void
  onBlockFloor: () => void
  onUnblockFloor: () => void
}) {
  return (
    <Modal onClose={onClose} variant="bottom" aria-label="整層格子">
      <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 20 }}>
        {floor}　{cell.stageName}
      </h3>
      <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
        {workItemName} · 整層 {units.length} 戶 · {stageStatusLabel(cell.status)}
        {cell.mixed ? '（戶別進度不同）' : ''}
        {cell.openDefects > 0 ? ` · 未關缺失 ${cell.openDefects}` : ''}
      </p>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>選一戶拍照／記缺失</div>
      <div className="chip-row" style={{ marginBottom: 14 }}>
        {units.map((u) => (
          <button key={u.id} type="button" className="chip" onClick={() => onPickUnit(u)}>
            {u.code}
          </button>
        ))}
      </div>
      {cell.status === 'blocked' ? (
        <button type="button" className="btn btn-ghost" disabled={!canEdit} onClick={onUnblockFloor}>
          整層解除卡關
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canEdit || cell.openDefects > 0}
          onClick={onBlockFloor}
        >
          整層卡關／待協調
        </button>
      )}
    </Modal>
  )
}

function UnitView({
  canEdit,
  onOpenSwitcher,
  onTap,
  onLong,
  onStep,
}: {
  canEdit: boolean
  onOpenSwitcher: () => void
  onTap: (cell: FocusedStageCell) => void
  onLong: (cell: FocusedStageCell) => void
  onStep: (delta: number) => void
}) {
  const units = useProjectStore((s) => s.units)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const defects = useProjectStore((s) => s.defects)
  const stageProgress = useProjectStore((s) => s.stageProgress)
  const workItems = useProjectStore((s) => s.workItems)
  const setCurrentUnit = useProjectStore((s) => s.setCurrentUnit)
  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const rows = unit
    ? unitWorkItemRows(
        { ...useProjectStore.getState(), defects, stageProgress, workItems, units },
        unit,
      )
    : []

  useEffect(() => {
    if (!currentUnitId) {
      const first = units.find((u) => u.active)
      if (first) setCurrentUnit(first.id)
    }
  }, [currentUnitId, units, setCurrentUnit])

  if (!unit) {
    return <p style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>請先選一戶。</p>
  }

  return (
    <div>
      <div className="unit-pager">
        <button type="button" className="icon-btn" aria-label="上一戶" onClick={() => onStep(-1)}>
          <ChevronLeft size={20} />
        </button>
        <button type="button" className="unit-pager-current" onClick={onOpenSwitcher}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {unit.buildingName} {unit.floor} {unit.code}戶
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>點此挑選戶別</div>
        </button>
        <button type="button" className="icon-btn" aria-label="下一戶" onClick={() => onStep(1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      <LegendRow />
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
