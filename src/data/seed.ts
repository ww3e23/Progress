import type { ProjectState } from '../types'
import { DEFAULT_AREAS } from '../lib/areas'
import { buildDefaultWorkItems } from './defaultWorkItems'

export function ensureProgressFields(state: ProjectState): ProjectState {
  const workItems = state.workItems?.length ? state.workItems : buildDefaultWorkItems()
  return {
    ...state,
    workItems,
    stageProgress: state.stageProgress ?? {},
    hiddenReportStageKeys: Array.isArray(state.hiddenReportStageKeys)
      ? state.hiddenReportStageKeys.map(String).filter(Boolean)
      : [],
    currentWorkItemId:
      state.currentWorkItemId && workItems.some((w) => w.id === state.currentWorkItemId)
        ? state.currentWorkItemId
        : (workItems.find((w) => w.active)?.id ?? null),
    currentBuildingId: state.currentBuildingId ?? state.buildings.find((b) => b.active)?.id ?? null,
    currentFloor: state.currentFloor ?? null,
    focusedCell: state.focusedCell ?? null,
  }
}

/** 新專案預設狀態：含工項範本，無棟別／缺失／歷程 */
export function createEmptyProjectState(name = '未命名專案'): ProjectState {
  const workItems = buildDefaultWorkItems()
  return {
    projectName: name,
    buildings: [],
    units: [],
    categories: [],
    checklistItems: [],
    defects: [],
    unitCheckedCount: {},
    unitCategoryDone: {},
    activities: [],
    currentUnitId: '',
    recentUnitIds: [],
    areas: [...DEFAULT_AREAS],
    areaTemplates: [],
    workItems,
    hiddenReportStageKeys: [],
    stageProgress: {},
    currentWorkItemId: workItems[0]?.id ?? null,
    currentBuildingId: null,
    currentFloor: null,
    focusedCell: null,
  }
}

/** @deprecated 相容舊引用 */
export const seedState: ProjectState = createEmptyProjectState('未選擇專案')

/** 初始無任何專案資料包 */
export function createProjectBundles(): Record<string, ProjectState> {
  return {}
}
