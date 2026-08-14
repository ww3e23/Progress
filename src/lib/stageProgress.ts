import type {
  BuildingRule,
  Defect,
  ProjectState,
  StageProgressEntry,
  StageStatus,
  Unit,
  WorkItem,
} from '../types'
import { naKey } from './floors'
import { sortFloorsAsc } from './floors'
import { isVillaLayout } from './units'

export function cellKey(unitId: string, workItemId: string, stageId: string): string {
  return `${unitId}|${workItemId}|${stageId}`
}

export function parseCellKey(key: string): {
  unitId: string
  workItemId: string
  stageId: string
} | null {
  const parts = key.split('|')
  if (parts.length !== 3) return null
  const [unitId, workItemId, stageId] = parts
  if (!unitId || !workItemId || !stageId) return null
  return { unitId, workItemId, stageId }
}

export function isProgressRecord(d: Defect): boolean {
  return d.recordKind === 'progress'
}

export function isOpenDefect(d: Defect): boolean {
  if (isProgressRecord(d)) return false
  return d.status !== 'voided' && d.status !== 'completed'
}

export function defectsOnCell(
  defects: Defect[],
  unitId: string,
  workItemId: string,
  stageId: string,
): Defect[] {
  return defects.filter(
    (d) =>
      d.unitId === unitId &&
      d.workItemId === workItemId &&
      d.stageId === stageId &&
      d.status !== 'voided',
  )
}

export function openDefectsOnCell(
  defects: Defect[],
  unitId: string,
  workItemId: string,
  stageId: string,
): Defect[] {
  return defectsOnCell(defects, unitId, workItemId, stageId).filter(isOpenDefect)
}

export function storedStageStatus(
  progress: Record<string, StageProgressEntry> | undefined,
  key: string,
): StageStatus {
  return progress?.[key]?.status ?? 'not_started'
}

/** 未關缺失一律顯示「缺失改善中」，且不可標完成 */
export function effectiveStageStatus(
  stored: StageStatus,
  openDefectCount: number,
): StageStatus {
  if (openDefectCount > 0) return 'defect_fixing'
  if (stored === 'defect_fixing') return 'in_progress'
  return stored
}

export function stageStatusLabel(status: StageStatus): string {
  switch (status) {
    case 'not_started':
      return '未開始'
    case 'in_progress':
      return '施工中'
    case 'completed':
      return '已完成'
    case 'blocked':
      return '卡關／待協調'
    case 'defect_fixing':
      return '缺失改善中'
  }
}

export function stageStatusShort(status: StageStatus): string {
  switch (status) {
    case 'not_started':
      return '—'
    case 'in_progress':
      return '施'
    case 'completed':
      return '✓'
    case 'blocked':
      return '卡'
    case 'defect_fixing':
      return '!'
  }
}

export function stageStatusClass(status: StageStatus): string {
  switch (status) {
    case 'not_started':
      return 'empty'
    case 'in_progress':
      return 'progress'
    case 'completed':
      return 'done'
    case 'blocked':
      return 'blocked'
    case 'defect_fixing':
      return 'defect'
  }
}

export type CycleStageResult =
  | { ok: true; next: StageStatus }
  | { ok: false; error: string }

/** 點一下：未開始 → 施工中 → 完成 → 未開始；卡關點一下恢復施工中；有未關缺失禁止完成 */
export function cycleStageStatus(
  stored: StageStatus,
  openDefectCount: number,
): CycleStageResult {
  const effective = effectiveStageStatus(stored, openDefectCount)
  if (effective === 'defect_fixing') {
    return { ok: false, error: '此格尚有未關閉缺失，無法標完成' }
  }
  if (effective === 'blocked') {
    return { ok: true, next: 'in_progress' }
  }
  if (effective === 'not_started') {
    return { ok: true, next: 'in_progress' }
  }
  if (effective === 'in_progress') {
    if (openDefectCount > 0) {
      return { ok: false, error: '此格尚有未關閉缺失，無法標完成' }
    }
    return { ok: true, next: 'completed' }
  }
  return { ok: true, next: 'not_started' }
}

export function activeWorkItems(state: Pick<ProjectState, 'workItems'>): WorkItem[] {
  return [...(state.workItems ?? [])]
    .filter((w) => w.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function findWorkItem(
  state: Pick<ProjectState, 'workItems'>,
  workItemId: string | null | undefined,
): WorkItem | undefined {
  if (!workItemId) return undefined
  return (state.workItems ?? []).find((w) => w.id === workItemId)
}

export function sortedStages(item: WorkItem) {
  return [...item.stages].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function cellPercent(statuses: StageStatus[]): number {
  if (statuses.length === 0) return 0
  const done = statuses.filter((s) => s === 'completed').length
  return Math.round((done / statuses.length) * 100)
}

export interface StageMatrixRow {
  unit: Unit
  cells: {
    stageId: string
    stageName: string
    stored: StageStatus
    status: StageStatus
    openDefects: number
    key: string
  }[]
  percent: number
  openDefects: number
}

export interface StageMatrix {
  building: BuildingRule
  floor: string
  workItem: WorkItem
  stages: { id: string; name: string }[]
  rows: StageMatrixRow[]
  completedCells: number
  totalCells: number
  percent: number
  openDefects: number
  blockedCells: number
  defectCells: number
}

export function buildStageMatrix(
  state: ProjectState,
  buildingId: string,
  floor: string,
  workItemId: string,
): StageMatrix | null {
  const building = state.buildings.find((b) => b.id === buildingId && b.active)
  const workItem = findWorkItem(state, workItemId)
  if (!building || !workItem || !building.floors.includes(floor)) return null

  const stages = sortedStages(workItem)
  const rows: StageMatrixRow[] = []
  let completedCells = 0
  let totalCells = 0
  let openDefects = 0
  let blockedCells = 0
  let defectCells = 0

  for (const code of building.unitCodes) {
    const markedNa = building.naKeys.includes(naKey(floor, code))
    const unit =
      state.units.find(
        (u) => u.buildingId === buildingId && u.floor === floor && u.code === code,
      ) ?? null
    if (markedNa || !unit?.active) continue

    const cells: StageMatrixRow['cells'] = []
    for (const stage of stages) {
      const key = cellKey(unit.id, workItem.id, stage.id)
      const stored = storedStageStatus(state.stageProgress, key)
      const open = openDefectsOnCell(state.defects, unit.id, workItem.id, stage.id).length
      const status = effectiveStageStatus(stored, open)
      cells.push({
        stageId: stage.id,
        stageName: stage.name,
        stored,
        status,
        openDefects: open,
        key,
      })
      totalCells += 1
      if (status === 'completed') completedCells += 1
      if (status === 'blocked') blockedCells += 1
      if (status === 'defect_fixing') defectCells += 1
      openDefects += open
    }
    rows.push({
      unit,
      cells,
      percent: cellPercent(cells.map((c) => c.status)),
      openDefects: cells.reduce((n, c) => n + c.openDefects, 0),
    })
  }

  return {
    building,
    floor,
    workItem,
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
    rows,
    completedCells,
    totalCells,
    percent: totalCells === 0 ? 0 : Math.round((completedCells / totalCells) * 100),
    openDefects,
    blockedCells,
    defectCells,
  }
}

export function floorsOfBuilding(building: BuildingRule | undefined): string[] {
  if (!building) return []
  return sortFloorsAsc(building.floors)
}

export function workItemRollup(
  state: ProjectState,
  workItem: WorkItem,
): {
  percent: number
  totalCells: number
  completedCells: number
  openDefects: number
  blockedCells: number
  defectCells: number
} {
  let totalCells = 0
  let completedCells = 0
  let openDefects = 0
  let blockedCells = 0
  let defectCells = 0
  const stages = sortedStages(workItem)
  for (const unit of state.units) {
    if (!unit.active) continue
    for (const stage of stages) {
      const key = cellKey(unit.id, workItem.id, stage.id)
      const stored = storedStageStatus(state.stageProgress, key)
      const open = openDefectsOnCell(state.defects, unit.id, workItem.id, stage.id).length
      const status = effectiveStageStatus(stored, open)
      totalCells += 1
      if (status === 'completed') completedCells += 1
      if (status === 'blocked') blockedCells += 1
      if (status === 'defect_fixing') defectCells += 1
      openDefects += open
    }
  }
  return {
    percent: totalCells === 0 ? 0 : Math.round((completedCells / totalCells) * 100),
    totalCells,
    completedCells,
    openDefects,
    blockedCells,
    defectCells,
  }
}

export function unitWorkItemRows(
  state: ProjectState,
  unit: Unit,
): {
  workItem: WorkItem
  cells: StageMatrixRow['cells']
  percent: number
  openDefects: number
}[] {
  return activeWorkItems(state).map((workItem) => {
    const cells = sortedStages(workItem).map((stage) => {
      const key = cellKey(unit.id, workItem.id, stage.id)
      const stored = storedStageStatus(state.stageProgress, key)
      const open = openDefectsOnCell(state.defects, unit.id, workItem.id, stage.id).length
      return {
        stageId: stage.id,
        stageName: stage.name,
        stored,
        status: effectiveStageStatus(stored, open),
        openDefects: open,
        key,
      }
    })
    return {
      workItem,
      cells,
      percent: cellPercent(cells.map((c) => c.status)),
      openDefects: cells.reduce((n, c) => n + c.openDefects, 0),
    }
  })
}

export function overallProgress(state: ProjectState): {
  percent: number
  completedCells: number
  totalCells: number
  openDefects: number
  blockedCells: number
  defectCells: number
} {
  let completedCells = 0
  let totalCells = 0
  let openDefects = 0
  let blockedCells = 0
  let defectCells = 0
  for (const item of activeWorkItems(state)) {
    const r = workItemRollup(state, item)
    completedCells += r.completedCells
    totalCells += r.totalCells
    openDefects += r.openDefects
    blockedCells += r.blockedCells
    defectCells += r.defectCells
  }
  return {
    percent: totalCells === 0 ? 0 : Math.round((completedCells / totalCells) * 100),
    completedCells,
    totalCells,
    openDefects,
    blockedCells,
    defectCells,
  }
}

export function openDefectRemarks(state: ProjectState): Defect[] {
  return state.defects
    .filter(isOpenDefect)
    .sort((a, b) => a.unitCode.localeCompare(b.unitCode, 'zh-Hant') || a.floor.localeCompare(b.floor))
}

export function aggregateStageStatus(statuses: StageStatus[]): {
  status: StageStatus
  mixed: boolean
} {
  if (statuses.length === 0) return { status: 'not_started', mixed: false }
  const uniq = new Set(statuses)
  if (uniq.size === 1) return { status: statuses[0], mixed: false }
  if (statuses.some((s) => s === 'blocked')) return { status: 'blocked', mixed: true }
  if (statuses.some((s) => s === 'defect_fixing')) return { status: 'defect_fixing', mixed: true }
  return { status: 'in_progress', mixed: true }
}

export function activeUnitsOnFloor(
  state: Pick<ProjectState, 'buildings' | 'units'>,
  buildingId: string,
  floor: string,
): Unit[] {
  const building = state.buildings.find((b) => b.id === buildingId && b.active)
  if (!building || !building.floors.includes(floor)) return []
  const out: Unit[] = []
  for (const code of building.unitCodes) {
    if (building.naKeys.includes(naKey(floor, code))) continue
    const unit = state.units.find(
      (u) => u.buildingId === buildingId && u.floor === floor && u.code === code && u.active,
    )
    if (unit) out.push(unit)
  }
  return out
}

export function orderedActiveUnits(state: Pick<ProjectState, 'buildings' | 'units'>): Unit[] {
  const buildings = [...state.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const out: Unit[] = []
  for (const building of buildings) {
    if (isVillaLayout(building)) {
      for (const code of building.unitCodes) {
        for (const floor of floorsOfBuilding(building)) {
          if (building.naKeys.includes(naKey(floor, code))) continue
          const unit = state.units.find(
            (u) =>
              u.buildingId === building.id && u.floor === floor && u.code === code && u.active,
          )
          if (unit) out.push(unit)
        }
      }
    } else {
      for (const floor of floorsOfBuilding(building)) {
        out.push(...activeUnitsOnFloor(state, building.id, floor))
      }
    }
  }
  return out
}

export function stepActiveUnit(
  state: Pick<ProjectState, 'buildings' | 'units'>,
  unitId: string | null | undefined,
  delta: number,
): Unit | null {
  const list = orderedActiveUnits(state)
  if (list.length === 0) return null
  const idx = unitId ? list.findIndex((u) => u.id === unitId) : -1
  const start = idx >= 0 ? idx : 0
  const next = (start + delta + list.length * 10) % list.length
  return list[next] ?? null
}

export interface FloorMatrixCell {
  stageId: string
  stageName: string
  status: StageStatus
  mixed: boolean
  openDefects: number
  unitIds: string[]
  completedUnits: number
  totalUnits: number
}

export interface FloorMatrixRow {
  floor: string
  units: Unit[]
  cells: FloorMatrixCell[]
  percent: number
  openDefects: number
}

export interface WorkItemFloorMatrix {
  building: BuildingRule
  workItem: WorkItem
  stages: { id: string; name: string }[]
  rows: FloorMatrixRow[]
  completedCells: number
  totalCells: number
  percent: number
  openDefects: number
  blockedCells: number
  defectCells: number
}

/** 工項視角：樓層 × 工序，不拆戶；格子為該層所有戶的彙總 */
export function buildWorkItemFloorMatrix(
  state: ProjectState,
  buildingId: string,
  workItemId: string,
): WorkItemFloorMatrix | null {
  const building = state.buildings.find((b) => b.id === buildingId && b.active)
  const workItem = findWorkItem(state, workItemId)
  if (!building || !workItem) return null

  const stages = sortedStages(workItem)
  const rows: FloorMatrixRow[] = []
  let completedCells = 0
  let totalCells = 0
  let openDefects = 0
  let blockedCells = 0
  let defectCells = 0

  for (const floor of floorsOfBuilding(building)) {
    const floorMatrix = buildStageMatrix(state, building.id, floor, workItem.id)
    if (!floorMatrix || floorMatrix.rows.length === 0) continue
    const units = floorMatrix.rows.map((r) => r.unit)
    const cells: FloorMatrixCell[] = stages.map((stage) => {
      const col = floorMatrix.rows
        .map((r) => r.cells.find((c) => c.stageId === stage.id))
        .filter((c): c is StageMatrixRow['cells'][number] => Boolean(c))
      const agg = aggregateStageStatus(col.map((c) => c.status))
      const open = col.reduce((n, c) => n + c.openDefects, 0)
      return {
        stageId: stage.id,
        stageName: stage.name,
        status: agg.status,
        mixed: agg.mixed,
        openDefects: open,
        unitIds: units.map((u) => u.id),
        completedUnits: col.filter((c) => c.status === 'completed').length,
        totalUnits: col.length,
      }
    })
    for (const cell of cells) {
      totalCells += 1
      if (cell.status === 'completed' && !cell.mixed) completedCells += 1
      if (cell.status === 'blocked') blockedCells += 1
      if (cell.status === 'defect_fixing') defectCells += 1
      openDefects += cell.openDefects
    }
    rows.push({
      floor,
      units,
      cells,
      percent: cellPercent(cells.map((c) => (c.mixed ? 'in_progress' : c.status))),
      openDefects: cells.reduce((n, c) => n + c.openDefects, 0),
    })
  }

  return {
    building,
    workItem,
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
    rows,
    completedCells,
    totalCells,
    percent: totalCells === 0 ? 0 : Math.round((completedCells / totalCells) * 100),
    openDefects,
    blockedCells,
    defectCells,
  }
}
