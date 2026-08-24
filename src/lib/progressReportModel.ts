import type { ProjectState, StageStatus, WorkItem } from '../types'
import { buildReportWorkRows, reportStageKey } from './reportSummary'
import {
  activeWorkItems,
  buildStageMatrix,
  floorsOfBuilding,
  listWorkItemFloorMatrices,
  openDefectRemarks,
  overallProgress,
  sortedStages,
  stageStatusShort,
} from './stageProgress'
import { isVillaLayout } from './units'

export type ProgressReportCell = {
  status: StageStatus
  mixed: boolean
  openDefects: number
  mark: string
}

export type ProgressReportRow = {
  label: string
  note?: string
  percent: number
  cells: ProgressReportCell[]
}

export type ProgressReportTable = {
  title: string
  rowHeader: string
  stages: { id: string; name: string }[]
  rows: ProgressReportRow[]
}

export type ProgressReportWork = {
  id: string
  name: string
  percent: number
  summaryLines: string[]
  tables: ProgressReportTable[]
  remarks: string[]
}

export type ProgressReportModel = {
  projectName: string
  dateLabel: string
  overallPercent: number
  completedCells: number
  totalCells: number
  openDefects: number
  defectCells: number
  blockedCells: number
  works: ProgressReportWork[]
}

function hiddenSet(state: ProjectState): Set<string> {
  return new Set(state.hiddenReportStageKeys ?? [])
}

function visibleStages(workItem: WorkItem, hidden: Set<string>) {
  return sortedStages(workItem).filter((s) => !hidden.has(reportStageKey(workItem.id, s.id)))
}

function cellMark(status: StageStatus, mixed: boolean): string {
  if (mixed) return '混'
  return stageStatusShort(status)
}

function stageLine(stage: {
  name: string
  householdsTotal: number
  householdsDone: number
  householdsLeft: number
}): string {
  if (stage.householdsTotal === 0) return `${stage.name}：皆不適用。`
  const pct = Math.round((stage.householdsDone / stage.householdsTotal) * 100)
  return `${stage.name}：完成${stage.householdsDone}戶，未完成${stage.householdsLeft}戶，總共${stage.householdsTotal}戶。（${pct}%）`
}

export function buildProgressReportModel(
  projectName: string,
  state: ProjectState,
): ProgressReportModel {
  const hidden = hiddenSet(state)
  const overview = overallProgress(state)
  const summaryRows = buildReportWorkRows(state)
  const workItems = activeWorkItems(state)
  const buildings = [...state.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const works: ProgressReportWork[] = []
  for (const workItem of workItems) {
    const stages = visibleStages(workItem, hidden)
    if (stages.length === 0) continue
    const summary = summaryRows.find((r) => r.id === workItem.id)
    const summaryLines = (summary?.stages ?? [])
      .filter((s) => stages.some((st) => st.id === s.id))
      .map(stageLine)

    const tables: ProgressReportTable[] = []
    const villaMatrices = listWorkItemFloorMatrices(state, workItem.id)
    for (const building of buildings) {
      if (isVillaLayout(building)) {
        const matrices = villaMatrices.filter((m) => m.building.id === building.id)
        for (const matrix of matrices) {
          const rows: ProgressReportRow[] = matrix.rows.map((row) => ({
            label: row.floor,
            note: row.units.length > 1 ? `${row.units.length} 戶` : undefined,
            percent: row.percent,
            cells: stages.map((stage) => {
              const cell = row.cells.find((c) => c.stageId === stage.id)
              const status = cell?.status ?? 'na'
              const mixed = cell?.mixed ?? false
              return {
                status,
                mixed,
                openDefects: cell?.openDefects ?? 0,
                mark: cellMark(status, mixed),
              }
            }),
          }))
          if (rows.length === 0) continue
          tables.push({
            title: matrix.title,
            rowHeader: '樓層',
            stages: stages.map((s) => ({ id: s.id, name: s.name })),
            rows,
          })
        }
      } else {
        const rows: ProgressReportRow[] = []
        for (const floor of floorsOfBuilding(building)) {
          const matrix = buildStageMatrix(state, building.id, floor, workItem.id)
          if (!matrix || matrix.rows.length === 0) continue
          for (const row of matrix.rows) {
            rows.push({
              label: `${floor} ${row.unit.code}`,
              percent: row.percent,
              cells: stages.map((stage) => {
                const cell = row.cells.find((c) => c.stageId === stage.id)
                const status = cell?.status ?? 'na'
                return {
                  status,
                  mixed: false,
                  openDefects: cell?.openDefects ?? 0,
                  mark: cellMark(status, false),
                }
              }),
            })
          }
        }
        if (rows.length === 0) continue
        tables.push({
          title: building.name,
          rowHeader: '樓層／戶',
          stages: stages.map((s) => ({ id: s.id, name: s.name })),
          rows,
        })
      }
    }

    const remarks = openDefectRemarks(state)
      .filter((d) => !d.workItemId || d.workItemId === workItem.id)
      .map((d) => {
        const stage = workItem.stages.find((s) => s.id === d.stageId)?.name
        return [d.buildingName, `${d.floor}${d.unitCode}`, stage, d.description || `缺失 #${d.defectNumber}`]
          .filter(Boolean)
          .join(' ')
      })

    works.push({
      id: workItem.id,
      name: workItem.name,
      percent: summary?.percent ?? 0,
      summaryLines,
      tables,
      remarks,
    })
  }

  const now = new Date()
  return {
    projectName,
    dateLabel: now.toLocaleString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    overallPercent: overview.percent,
    completedCells: overview.completedCells,
    totalCells: overview.totalCells,
    openDefects: overview.openDefects,
    defectCells: overview.defectCells,
    blockedCells: overview.blockedCells,
    works,
  }
}
