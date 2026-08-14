import type { BuildingLayout, BuildingRule, Unit } from '../types'
import { createId } from './id'
import { naKey } from './floors'

const GENERIC_VILLA_CODES = new Set(['整棟', '整戶', '1', '01', 'A'])

/** 依棟別規則展開全部戶別（不需一戶一戶手動新增） */
export function expandUnitsFromBuildings(buildings: BuildingRule[]): Unit[] {
  const units: Unit[] = []
  for (const b of buildings.filter((x) => x.active)) {
    const layout = buildingLayout(b)
    for (const floor of b.floors) {
      for (const code of b.unitCodes) {
        const key = naKey(floor, code)
        const active = !b.naKeys.includes(key)
        units.push({
          id: `${b.id}_${floor}_${code}`,
          buildingId: b.id,
          buildingName: b.name,
          floor,
          code,
          label: formatUnitTitle({ buildingName: b.name, floor, code }, layout),
          active,
          nextDefectNumber: 1,
        })
      }
    }
  }
  return units
}

export function buildingLayout(b: Pick<BuildingRule, 'layout' | 'unitCodes'>): BuildingLayout {
  // 以登記的結構類型為準：大樓即使每層只有一個戶號，也不能改走別墅邏輯。
  if (b.layout === 'villa' || b.layout === 'apartment') return b.layout
  return (b.unitCodes?.length ?? 0) <= 1 ? 'villa' : 'apartment'
}

export function isVillaLayout(b: Pick<BuildingRule, 'layout' | 'unitCodes'>): boolean {
  return buildingLayout(b) === 'villa'
}

function isGenericVillaCode(code: string): boolean {
  return GENERIC_VILLA_CODES.has(code.trim())
}

export function formatUnitTitle(
  unit: Pick<Unit, 'buildingName' | 'floor' | 'code'>,
  layout: BuildingLayout = 'apartment',
): string {
  if (layout === 'villa') {
    const house = isGenericVillaCode(unit.code)
      ? unit.buildingName
      : unit.code === unit.buildingName
        ? unit.buildingName
        : `${unit.buildingName} ${unit.code}`
    return `${house} ${unit.floor}`
  }
  return `${unit.buildingName} ${unit.floor} ${unit.code}戶`
}

export function layoutForUnit(
  buildings: BuildingRule[],
  unit: Pick<Unit, 'buildingId'> | undefined,
): BuildingLayout {
  if (!unit) return 'apartment'
  const b = buildings.find((x) => x.id === unit.buildingId)
  return b ? buildingLayout(b) : 'apartment'
}

/** 別墅＝戶數（不把每層再算一戶）；大樓＝樓層×戶號格位 */
export function countHouseholds(b: BuildingRule): number {
  if (isVillaLayout(b)) {
    return b.unitCodes.filter((code) =>
      b.floors.some((floor) => !b.naKeys.includes(naKey(floor, code))),
    ).length
  }
  return countActiveUnits(b)
}

export function countProjectHouseholds(buildings: BuildingRule[]): number {
  return buildings.filter((b) => b.active).reduce((n, b) => n + countHouseholds(b), 0)
}

export function summarizeBuilding(b: BuildingRule): string {
  if (!b.floors.length) return '尚未設定樓層'
  const first = b.floors[0]
  const last = b.floors[b.floors.length - 1]
  const floorText = b.floors.length === 1 ? first : `${first}–${last}`
  if (isVillaLayout(b)) {
    const n = countHouseholds(b)
    if (n <= 1) return `整棟 · ${floorText}（${b.floors.length} 層）`
    return `${n} 戶整棟 · 各 ${floorText}`
  }
  return `${floorText}｜每層 ${b.unitCodes.length} 戶`
}

export function countActiveUnits(b: BuildingRule): number {
  let n = 0
  for (const floor of b.floors) {
    for (const code of b.unitCodes) {
      if (!b.naKeys.includes(naKey(floor, code))) n += 1
    }
  }
  return n
}

export function newBuildingDraft(partial?: Partial<BuildingRule>): BuildingRule {
  return {
    id: createId('bldg'),
    name: 'A棟',
    floors: ['1F', '2F', '3F', '4F', '5F', '6F', '7F'],
    unitCodes: ['A1', 'A2', 'A3', 'A5'],
    naKeys: [],
    sortOrder: 0,
    active: true,
    layout: 'apartment',
    ...partial,
  }
}

export function newVillaDraft(partial?: Partial<BuildingRule>): BuildingRule {
  return {
    id: createId('bldg'),
    name: '1號',
    floors: ['1F', '2F', '3F'],
    unitCodes: ['整棟'],
    naKeys: [],
    sortOrder: 0,
    active: true,
    layout: 'villa',
    ...partial,
  }
}
