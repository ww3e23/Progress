import type { BuildingRule, ProjectState, StageStatus, Unit } from '../types'
import { isVillaLayout } from './units'
import {
  activeWorkItems,
  cellKey,
  completionPercent,
  effectiveStageStatus,
  openDefectsOnCell,
  sortedStages,
  storedStageStatus,
} from './stageProgress'

export function reportStageKey(workItemId: string, stageId: string): string {
  return `${workItemId}|${stageId}`
}

export type ReportStageTone = 'na' | 'done' | 'empty' | 'progress' | 'blocked' | 'defect'

export type ReportStageCell = {
  id: string
  name: string
  percent: number
  householdsTotal: number
  householdsDone: number
  householdsLeft: number
  tone: ReportStageTone
}

export type ReportWorkRow = {
  id: string
  name: string
  percent: number
  stages: ReportStageCell[]
}

type HouseholdGroup = {
  key: string
  units: Unit[]
}

function listHouseholdGroups(state: ProjectState): HouseholdGroup[] {
  const buildings = [...state.buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const groups: HouseholdGroup[] = []
  for (const building of buildings) {
    const units = state.units.filter((u) => u.buildingId === building.id && u.active)
    if (isVillaLayout(building)) {
      for (const code of building.unitCodes) {
        const us = units.filter((u) => u.code === code)
        if (us.length) groups.push({ key: `${building.id}:${code}`, units: us })
      }
    } else {
      const order = unitOrder(building)
      const sorted = [...units].sort((a, b) => {
        const ia = order.get(`${a.floor}|${a.code}`) ?? 9999
        const ib = order.get(`${b.floor}|${b.code}`) ?? 9999
        return ia - ib
      })
      for (const unit of sorted) groups.push({ key: unit.id, units: [unit] })
    }
  }
  return groups
}

function unitOrder(building: BuildingRule): Map<string, number> {
  const map = new Map<string, number>()
  let i = 0
  for (const floor of building.floors) {
    for (const code of building.unitCodes) {
      map.set(`${floor}|${code}`, i)
      i += 1
    }
  }
  return map
}

function toneForStage(input: {
  total: number
  percent: number
  blocked: number
  defect: number
}): ReportStageTone {
  if (input.total === 0) return 'na'
  if (input.defect > 0) return 'defect'
  if (input.blocked > 0) return 'blocked'
  if (input.percent >= 100) return 'done'
  if (input.percent <= 0) return 'empty'
  return 'progress'
}

function householdStageResult(
  state: ProjectState,
  workItemId: string,
  stageId: string,
  units: Unit[],
): { applicable: boolean; done: boolean } {
  let applicable = 0
  let completed = 0
  for (const unit of units) {
    const stored = storedStageStatus(state.stageProgress, cellKey(unit.id, workItemId, stageId))
    const open = openDefectsOnCell(state.defects, unit.id, workItemId, stageId).length
    const status = effectiveStageStatus(stored, open)
    if (status === 'na') continue
    applicable += 1
    if (status === 'completed') completed += 1
  }
  if (applicable === 0) return { applicable: false, done: false }
  return { applicable: true, done: completed === applicable }
}

export function buildReportWorkRows(state: ProjectState): ReportWorkRow[] {
  const households = listHouseholdGroups(state)
  return activeWorkItems(state).map((workItem) => {
    const stages = sortedStages(workItem)
    const stageAcc = stages.map((s) => ({
      id: s.id,
      name: s.name,
      completed: 0,
      total: 0,
      blocked: 0,
      defect: 0,
      householdsTotal: 0,
      householdsDone: 0,
    }))
    let cellCompleted = 0
    let cellTotal = 0
    let cellSeen = 0

    for (const group of households) {
      for (const acc of stageAcc) {
        const house = householdStageResult(state, workItem.id, acc.id, group.units)
        if (house.applicable) {
          acc.householdsTotal += 1
          if (house.done) acc.householdsDone += 1
        }
      }
      for (const unit of group.units) {
        for (const acc of stageAcc) {
          const stored = storedStageStatus(
            state.stageProgress,
            cellKey(unit.id, workItem.id, acc.id),
          )
          const open = openDefectsOnCell(state.defects, unit.id, workItem.id, acc.id).length
          const status: StageStatus = effectiveStageStatus(stored, open)
          cellSeen += 1
          if (status === 'na') continue
          acc.total += 1
          cellTotal += 1
          if (status === 'completed') {
            acc.completed += 1
            cellCompleted += 1
          }
          if (status === 'blocked') acc.blocked += 1
          if (status === 'defect_fixing') acc.defect += 1
        }
      }
    }

    return {
      id: workItem.id,
      name: workItem.name,
      percent: completionPercent(cellCompleted, cellTotal, cellSeen),
      stages: stageAcc.map((s) => {
        const percent = s.total === 0 ? 0 : Math.round((s.completed / s.total) * 100)
        const tone = toneForStage({
          total: s.total,
          percent,
          blocked: s.blocked,
          defect: s.defect,
        })
        return {
          id: s.id,
          name: s.name,
          percent,
          householdsTotal: s.householdsTotal,
          householdsDone: s.householdsDone,
          householdsLeft: Math.max(0, s.householdsTotal - s.householdsDone),
          tone,
        }
      }),
    }
  })
}
