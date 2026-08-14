import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  AreaTemplate,
  BuildingRule,
  ChecklistCategory,
  ChecklistItem,
  Defect,
  DefectStatus,
  FocusedStageCell,
  ProjectState,
  SiteRecordKind,
  StageStatus,
  SyncState,
  WorkItem,
} from '../types'
import { buildDefaultChecklist } from '../data/defaultChecklist'
import { applyDefaultWorkItemsToList, buildDefaultWorkItems } from '../data/defaultWorkItems'
import { createEmptyProjectState, createProjectBundles, ensureProgressFields } from '../data/seed'
import {
  activeUnitsOnFloor,
  aggregateStageStatus,
  cellKey,
  cycleStageStatus as nextCycleStatus,
  effectiveStageStatus,
  openDefectsOnCell,
  storedStageStatus,
} from '../lib/stageProgress'
import { expandUnitsFromBuildings } from '../lib/units'
import { createId } from '../lib/id'
import { PROGRESS_PROJECT_STORAGE_KEY } from '../lib/storageKeys'
import { cloudReady, syncDefect, syncProjectStructure } from '../services/cloudSync'
import { recomputeUnitNextDefectNumber, isDefectNumberTaken } from '../services/projectSync'
import {
  mergeProjectStates,
  pullProjectState,
  pushProjectState,
} from '../services/projectSync'
import { uploadDefectImages, uploadUnitPlanImage } from '../services/storageUpload'
import {
  autoSyncDefectPhotosToDrive,
  deleteDefectPhotosFromDrive,
} from '../services/driveSync'
import { firebaseModeLabel } from '../lib/firebase'
import { lightenProjectState, purgeBloatedInspectionStorage } from '../lib/mediaPersist'
import { hasUploadableLocalMedia } from '../lib/defectMedia'
import { statusLabel } from '../lib/progress'
import { currentActorInfo, currentActorLabel } from '../lib/currentActor'
import {
  backfillProjectActors,
  inferActorNameFromState,
  isPlaceholderActor,
  resolveBackfillActorName,
} from '../lib/backfillActors'
import {
  isUnitAreasCustomized,
  nextAreaTemplateCode,
  normalizeAreaName,
  sanitizeAreaList,
} from '../lib/areas'
import {
  clearPendingDefectMedia,
  listPendingDefectMedia,
  savePendingDefectMedia,
} from '../lib/pendingMediaDb'

if (typeof window !== 'undefined') {
  purgeBloatedInspectionStorage()
}

type BundleMap = Record<string, ProjectState>

interface ProjectActions {
  setCurrentUnit: (unitId: string) => void
  upsertBuilding: (building: BuildingRule) => void
  removeBuilding: (buildingId: string) => void
  addDefect: (input: {
    unitId: string
    categoryId: string
    categoryName: string
    checklistItemId?: string
    area: string
    description: string
    planPhotoDataUrl?: string
    photoDataUrls?: string[]
    /** 自行指定編號（補缺號）；未傳則自動取最大號+1。不改既有缺失編號。 */
    defectNumber?: number
    recordKind?: SiteRecordKind
    workItemId?: string
    stageId?: string
  }) => Promise<Defect | null>
  cycleStageCell: (input: {
    unitId: string
    workItemId: string
    stageId: string
  }) => { ok: boolean; error?: string; status?: StageStatus }
  /** 工項視角：整層同一工序一起輪轉，不拆戶 */
  cycleFloorStage: (input: {
    buildingId: string
    floor: string
    workItemId: string
    stageId: string
  }) => { ok: boolean; error?: string; status?: StageStatus }
  setStageCellStatus: (input: {
    unitId: string
    workItemId: string
    stageId: string
    status: StageStatus
  }) => { ok: boolean; error?: string }
  setFloorStageStatus: (input: {
    buildingId: string
    floor: string
    workItemId: string
    stageId: string
    status: StageStatus
  }) => { ok: boolean; error?: string }
  setCurrentWorkItem: (workItemId: string | null) => void
  setCurrentBuilding: (buildingId: string | null) => void
  setCurrentFloor: (floor: string | null) => void
  setFocusedCell: (cell: FocusedStageCell | null) => void
  upsertWorkItem: (item: WorkItem) => void
  removeWorkItem: (workItemId: string) => { ok: boolean; reason?: string }
  applyDefaultWorkItems: (
    mode?: 'fill-if-empty' | 'fill-missing' | 'replace',
  ) => { ok: boolean; reason?: string; added?: number; revived?: number; message?: string }
  updateDefectStatus: (defectId: string, status: DefectStatus) => void
  /** 修改缺失內容（區域／說明／大項／照片） */
  updateDefect: (
    defectId: string,
    patch: {
      categoryId?: string
      categoryName?: string
      checklistItemId?: string | null
      area?: string
      description?: string
      planPhotoDataUrl?: string | null
      photoDataUrls?: string[]
    },
  ) => Promise<{ ok: boolean; error?: string }>
  /** 刪除缺失（軟刪：改為作廢，並同步雲端） */
  deleteDefect: (defectId: string) => Promise<{ ok: boolean; error?: string }>
  /**
   * 設定某戶查驗區域。
   * renames：區域重新命名時，同步更新該戶既有缺失的 area 字串。
   */
  setUnitAreas: (
    unitId: string,
    areas: string[],
    renames?: { from: string; to: string }[],
  ) => { ok: boolean; error?: string }
  /** 清除此戶自訂區域，改回專案預設 */
  resetUnitAreasToProjectDefault: (unitId: string) => { ok: boolean; error?: string }
  /**
   * 批量綁定格局範本到選取戶別（跟著範本，不算手動自訂）。
   * 預設略過已手動自訂戶別；overwriteCustomized=true 才覆蓋並改綁範本。
   */
  applyAreaTemplateToUnits: (
    unitIds: string[],
    templateId: string,
    options?: { overwriteCustomized?: boolean },
  ) => { ok: boolean; error?: string; applied: number; skipped: number }
  /** 批量清除自訂／範本綁定，改回專案預設 */
  resetUnitsAreasToProjectDefault: (
    unitIds: string[],
  ) => { ok: boolean; error?: string; reset: number }
  /** 設定／清除此戶預設位置圖（圖面）；傳 null 清除 */
  setUnitDefaultPlan: (
    unitId: string,
    planUrl: string | null,
  ) => Promise<{ ok: boolean; error?: string }>
  /** 更新專案預設查驗區域（尚未自訂的戶別會沿用） */
  setProjectAreas: (areas: string[]) => { ok: boolean; error?: string }
  /** 新增／更新格局區域範本（新增時系統自動編碼） */
  saveAreaTemplate: (input: {
    id?: string
    name: string
    areas: string[]
  }) => { ok: boolean; error?: string; template?: AreaTemplate }
  /** 刪除格局區域範本 */
  deleteAreaTemplate: (templateId: string) => { ok: boolean; error?: string }
  markUnitChecked: (unitId: string, checked: number) => void
  /** 標記／取消此戶某大項已查畢 */
  setUnitCategoryDone: (unitId: string, categoryId: string, done: boolean) => void
  /** 一次標記此戶全部大項查畢（或清除） */
  setUnitInspectionComplete: (unitId: string, complete: boolean) => void
  resetDemoData: () => void
  pushStructureToCloud: () => Promise<{ ok: boolean; mode: string }>
  /** 從雲端拉取並與本機合併（登入／切專案／開 App） */
  hydrateFromCloud: (projectId: string) => Promise<{ ok: boolean; error?: string }>
  /** 把 IndexedDB 佇列中的照片掛回記憶體（離線也能看圖） */
  restorePendingMediaToMemory: () => Promise<number>
  /** 清掉「已失敗／待傳但實際沒有可上傳照片」的卡住狀態，避免一直顯示自動重試 */
  healStuckMediaSyncStates: () => Promise<number>
  /** 補傳 IndexedDB 佇列中尚未上雲的照片 */
  flushPendingMediaUploads: () => Promise<{ ok: boolean; uploaded: number }>
  /** 立刻把作用中專案存本機並推上雲端 */
  flushSyncNow: () => Promise<{ ok: boolean }>
  /**
   * 把舊活動／缺失中的「現場查驗」佔位名改成真實查驗人，並寫回本機／上雲。
   * @returns 修正筆數
   */
  backfillActorNames: () => number
  loadProjectBundle: (projectId: string) => void
  saveProjectBundle: (projectId: string) => void
  ensureProjectBundle: (projectId: string, name: string) => void
  removeProjectBundle: (projectId: string) => void
  /** 讀取指定專案歷程（作用中專案用即時資料，其餘讀 bundle） */
  getProjectActivities: (projectId: string) => ProjectState['activities']
  applyDefaultChecklist: (mode?: 'fill-if-empty' | 'replace') => { ok: boolean; reason?: string }
  upsertCategory: (category: ChecklistCategory, items: ChecklistItem[]) => void
  removeCategory: (categoryId: string) => { ok: boolean; reason?: string }
  upsertChecklistItem: (item: ChecklistItem) => void
  removeChecklistItem: (itemId: string) => { ok: boolean; reason?: string }
}


function activityActorFields() {
  const { name, account } = currentActorLabel()
  return {
    actorName: name,
    actorAccount: account || undefined,
  }
}

function defectActorCreateFields() {
  const { name, account } = currentActorLabel()
  return {
    createdByName: name,
    createdByAccount: account || undefined,
    updatedByName: name,
    updatedByAccount: account || undefined,
  }
}

function defectActorUpdateFields() {
  const { name, account } = currentActorLabel()
  return {
    updatedByName: name,
    updatedByAccount: account || undefined,
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let pendingFlush = false

function scheduleCloudSync(get: () => ProjectState & BundleState) {
  if (!cloudReady()) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void flushCloudSync(get)
  }, 700)
}

async function flushCloudSync(get: () => ProjectState & BundleState): Promise<boolean> {
  if (!cloudReady()) return false
  const projectId = get().activeProjectId
  if (!projectId) return false
  if (syncing) {
    pendingFlush = true
    return false
  }
  syncing = true
  try {
    const { useAuthStore } = await import('./useAuthStore')
    const meta = useAuthStore.getState().projects.find((p) => p.id === projectId)
    await pushProjectState(projectId, snapshotProject(get()), meta)
    return true
  } catch (err) {
    console.warn('[flushCloudSync] failed', err)
    return false
  } finally {
    syncing = false
    if (pendingFlush) {
      pendingFlush = false
      void flushCloudSync(get)
    }
  }
}

/** 每次變更：立刻寫入 bundle（防滑掉 App 遺失）；預設 debounce 上雲 */
function afterProjectChange(
  get: () => ProjectState & BundleState & ProjectActions,
  set: (partial: Partial<ProjectState & BundleState>) => void,
  options?: { syncCloud?: boolean },
) {
  const projectId = get().activeProjectId
  if (projectId) {
    const snap = snapshotProject(get())
    set({
      bundles: {
        ...get().bundles,
        [projectId]: snap,
      },
    })
  }
  if (options?.syncCloud !== false) scheduleCloudSync(get)
}

interface BundleState {
  bundles: BundleMap
  activeProjectId: string | null
}

function rebuildUnits(buildings: BuildingRule[], prevUnits: ProjectState['units']) {
  const next = expandUnitsFromBuildings(buildings)
  const prevMap = new Map(prevUnits.map((u) => [u.id, u]))
  return next.map((u) => {
    const old = prevMap.get(u.id)
    if (!old) return u
    return {
      ...u,
      nextDefectNumber: old.nextDefectNumber,
      areas: old.areas?.length ? [...old.areas] : undefined,
      areaTemplateId: old.areaTemplateId || undefined,
      defaultPlanPhotoUrl: old.defaultPlanPhotoUrl || undefined,
    }
  })
}

function preferMediaUrl(a?: string, b?: string): string | undefined {
  if (a?.startsWith('http')) return a
  if (b?.startsWith('http')) return b
  if (a?.startsWith('data:')) return a
  if (b?.startsWith('data:')) return b
  return a || b
}

function mergePhotoLists(a: string[] = [], b: string[] = []): string[] {
  const maxLen = Math.max(a.length, b.length)
  const out: string[] = []
  for (let i = 0; i < maxLen; i += 1) {
    const picked = preferMediaUrl(a[i], b[i])
    if (picked) out.push(picked)
  }
  if (out.length === 0) return a.length ? a : b
  return out
}

function patchStageEntry(
  progress: ProjectState['stageProgress'],
  key: string,
  status: StageStatus,
): ProjectState['stageProgress'] {
  const { name, account } = currentActorLabel()
  return {
    ...progress,
    [key]: {
      status,
      updatedAt: new Date().toISOString(),
      updatedByName: name,
      updatedByAccount: account || undefined,
    },
  }
}

function reconcileCellProgress(
  progress: ProjectState['stageProgress'],
  defects: Defect[],
  unitId: string,
  workItemId?: string,
  stageId?: string,
): ProjectState['stageProgress'] {
  if (!workItemId || !stageId) return progress
  const key = cellKey(unitId, workItemId, stageId)
  const open = openDefectsOnCell(defects, unitId, workItemId, stageId).length
  const stored = storedStageStatus(progress, key)
  if (open > 0) {
    return stored === 'defect_fixing' ? progress : patchStageEntry(progress, key, 'defect_fixing')
  }
  if (stored === 'defect_fixing') {
    return patchStageEntry(progress, key, 'in_progress')
  }
  return progress
}

function snapshotProject(state: ProjectState): ProjectState {
  const ensured = ensureProgressFields(state)
  return {
    projectName: ensured.projectName,
    buildings: ensured.buildings,
    units: ensured.units,
    categories: ensured.categories,
    checklistItems: ensured.checklistItems,
    defects: ensured.defects,
    unitCheckedCount: ensured.unitCheckedCount,
    unitCategoryDone: ensured.unitCategoryDone ?? {},
    activities: ensured.activities,
    currentUnitId: ensured.currentUnitId,
    recentUnitIds: ensured.recentUnitIds,
    areas: ensured.areas,
    areaTemplates: ensured.areaTemplates ?? [],
    workItems: ensured.workItems,
    stageProgress: ensured.stageProgress,
    currentWorkItemId: ensured.currentWorkItemId,
    currentBuildingId: ensured.currentBuildingId,
    currentFloor: ensured.currentFloor,
    focusedCell: ensured.focusedCell,
  }
}

const initialBundles = createProjectBundles()
const emptyBoot = createEmptyProjectState('未選擇專案')

export const useProjectStore = create<ProjectState & BundleState & ProjectActions>()(
  persist(
    (set, get) => ({
      ...emptyBoot,
      bundles: initialBundles,
      activeProjectId: null,

      setCurrentUnit: (unitId) => {
        const recent = [unitId, ...get().recentUnitIds.filter((id) => id !== unitId)].slice(0, 8)
        const unit = get().units.find((u) => u.id === unitId)
        set({
          currentUnitId: unitId,
          recentUnitIds: recent,
          currentBuildingId: unit?.buildingId ?? get().currentBuildingId,
          currentFloor: unit?.floor ?? get().currentFloor,
        })
        afterProjectChange(get, set)
      },

      setCurrentWorkItem: (workItemId) => {
        set({ currentWorkItemId: workItemId })
        afterProjectChange(get, set, { syncCloud: false })
      },

      setCurrentBuilding: (buildingId) => {
        const building = get().buildings.find((b) => b.id === buildingId)
        const floor =
          get().currentFloor && building?.floors.includes(get().currentFloor ?? '')
            ? get().currentFloor
            : (building?.floors[0] ?? null)
        set({ currentBuildingId: buildingId, currentFloor: floor })
        afterProjectChange(get, set, { syncCloud: false })
      },

      setCurrentFloor: (floor) => {
        set({ currentFloor: floor })
        afterProjectChange(get, set, { syncCloud: false })
      },

      setFocusedCell: (cell) => {
        set({ focusedCell: cell })
        if (cell?.unitId) {
          const recent = [cell.unitId, ...get().recentUnitIds.filter((id) => id !== cell.unitId)].slice(
            0,
            8,
          )
          set({ currentUnitId: cell.unitId, recentUnitIds: recent, focusedCell: cell })
        }
      },

      cycleStageCell: ({ unitId, workItemId, stageId }) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return { ok: false, error: '找不到此戶' }
        const key = cellKey(unitId, workItemId, stageId)
        const stored = storedStageStatus(state.stageProgress, key)
        const open = openDefectsOnCell(state.defects, unitId, workItemId, stageId).length
        const result = nextCycleStatus(stored, open)
        if (!result.ok) return { ok: false, error: result.error }
        const workItem = state.workItems.find((w) => w.id === workItemId)
        const stage = workItem?.stages.find((s) => s.id === stageId)
        set({
          stageProgress: patchStageEntry(state.stageProgress, key, result.next),
          currentUnitId: unitId,
          currentWorkItemId: workItemId,
          currentBuildingId: unit.buildingId,
          currentFloor: unit.floor,
          focusedCell: { unitId, workItemId, stageId },
          recentUnitIds: [unitId, ...state.recentUnitIds.filter((id) => id !== unitId)].slice(0, 8),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: `${workItem?.name ?? '工項'}／${stage?.name ?? '工序'} → ${
                result.next === 'completed'
                  ? '已完成'
                  : result.next === 'in_progress'
                    ? '施工中'
                    : '未開始'
              }`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        return { ok: true, status: result.next }
      },

      cycleFloorStage: ({ buildingId, floor, workItemId, stageId }) => {
        const state = get()
        const units = activeUnitsOnFloor(state, buildingId, floor)
        if (units.length === 0) return { ok: false, error: '此樓層沒有有效戶別' }
        const snapshots = units.map((unit) => {
          const key = cellKey(unit.id, workItemId, stageId)
          const stored = storedStageStatus(state.stageProgress, key)
          const open = openDefectsOnCell(state.defects, unit.id, workItemId, stageId).length
          return { unit, key, stored, open, status: effectiveStageStatus(stored, open) }
        })
        const agg = aggregateStageStatus(snapshots.map((s) => s.status))
        const totalOpen = snapshots.reduce((n, s) => n + s.open, 0)
        const result = nextCycleStatus(agg.status, totalOpen)
        if (!result.ok) return { ok: false, error: result.error }

        let progress = state.stageProgress
        let applied = 0
        for (const snap of snapshots) {
          if (result.next === 'completed' && snap.open > 0) continue
          progress = patchStageEntry(progress, snap.key, result.next)
          applied += 1
        }
        if (applied === 0) {
          return { ok: false, error: '此層尚有未關閉缺失，無法標完成' }
        }

        const workItem = state.workItems.find((w) => w.id === workItemId)
        const stage = workItem?.stages.find((s) => s.id === stageId)
        const first = units[0]
        set({
          stageProgress: progress,
          currentWorkItemId: workItemId,
          currentBuildingId: buildingId,
          currentFloor: floor,
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: first?.buildingName ?? '—',
              floor,
              unitCode: '整層',
              summary: `${workItem?.name ?? '工項'}／${stage?.name ?? '工序'} 整層 → ${
                result.next === 'completed'
                  ? '已完成'
                  : result.next === 'in_progress'
                    ? '施工中'
                    : '未開始'
              }（${applied} 戶）`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        return { ok: true, status: result.next }
      },

      setStageCellStatus: ({ unitId, workItemId, stageId, status }) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return { ok: false, error: '找不到此戶' }
        const open = openDefectsOnCell(state.defects, unitId, workItemId, stageId).length
        if (status === 'completed' && open > 0) {
          return { ok: false, error: '此格尚有未關閉缺失，無法標完成' }
        }
        const nextStatus = open > 0 && status !== 'blocked' ? 'defect_fixing' : status
        const key = cellKey(unitId, workItemId, stageId)
        const workItem = state.workItems.find((w) => w.id === workItemId)
        const stage = workItem?.stages.find((s) => s.id === stageId)
        set({
          stageProgress: patchStageEntry(state.stageProgress, key, nextStatus),
          currentUnitId: unitId,
          currentWorkItemId: workItemId,
          currentBuildingId: unit.buildingId,
          currentFloor: unit.floor,
          focusedCell: { unitId, workItemId, stageId },
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: `${workItem?.name ?? '工項'}／${stage?.name ?? '工序'} → ${
                nextStatus === 'blocked' ? '卡關／待協調' : nextStatus === 'in_progress' ? '施工中' : nextStatus
              }`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      setFloorStageStatus: ({ buildingId, floor, workItemId, stageId, status }) => {
        const state = get()
        const units = activeUnitsOnFloor(state, buildingId, floor)
        if (units.length === 0) return { ok: false, error: '此樓層沒有有效戶別' }
        let progress = state.stageProgress
        let applied = 0
        for (const unit of units) {
          const open = openDefectsOnCell(state.defects, unit.id, workItemId, stageId).length
          if (status === 'completed' && open > 0) continue
          const nextStatus = open > 0 && status !== 'blocked' ? 'defect_fixing' : status
          progress = patchStageEntry(progress, cellKey(unit.id, workItemId, stageId), nextStatus)
          applied += 1
        }
        if (applied === 0) return { ok: false, error: '此層尚有未關閉缺失，無法更新' }
        const workItem = state.workItems.find((w) => w.id === workItemId)
        const stage = workItem?.stages.find((s) => s.id === stageId)
        const first = units[0]
        set({
          stageProgress: progress,
          currentWorkItemId: workItemId,
          currentBuildingId: buildingId,
          currentFloor: floor,
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: first?.buildingName ?? '—',
              floor,
              unitCode: '整層',
              summary: `${workItem?.name ?? '工項'}／${stage?.name ?? '工序'} 整層 → ${
                status === 'blocked' ? '卡關／待協調' : status === 'in_progress' ? '施工中' : status
              }（${applied} 戶）`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      upsertWorkItem: (item) => {
        const list = [...(get().workItems ?? [])]
        const idx = list.findIndex((w) => w.id === item.id)
        const stages = item.stages
          .map((s, i) => ({ ...s, name: s.name.trim(), sortOrder: i }))
          .filter((s) => s.name)
        if (stages.length === 0) return
        const next: WorkItem = {
          ...item,
          name: item.name.trim() || '未命名工項',
          stages,
          sortOrder: idx >= 0 ? list[idx].sortOrder : list.length,
        }
        if (idx >= 0) list[idx] = next
        else list.push(next)
        set({
          workItems: list,
          currentWorkItemId: get().currentWorkItemId ?? next.id,
        })
        afterProjectChange(get, set)
      },

      removeWorkItem: (workItemId) => {
        const state = get()
        const used = state.defects.some((d) => d.workItemId === workItemId && d.status !== 'voided')
        if (used) {
          set({
            workItems: state.workItems.map((w) =>
              w.id === workItemId ? { ...w, active: false } : w,
            ),
          })
          afterProjectChange(get, set)
          return { ok: true, reason: '已有紀錄，改為停用' }
        }
        const next = state.workItems.filter((w) => w.id !== workItemId)
        set({
          workItems: next,
          currentWorkItemId:
            state.currentWorkItemId === workItemId
              ? (next.find((w) => w.active)?.id ?? null)
              : state.currentWorkItemId,
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      applyDefaultWorkItems: (mode = 'fill-missing') => {
        const state = get()
        const result = applyDefaultWorkItemsToList(state.workItems ?? [], mode)
        if (result.added === 0 && result.revived === 0 && !result.migrated) {
          return { ok: true, reason: 'already', added: 0, revived: 0, message: result.message }
        }
        const currentStill =
          state.currentWorkItemId &&
          result.workItems.some((w) => w.id === state.currentWorkItemId && w.active)
            ? state.currentWorkItemId
            : (result.workItems.find((w) => w.active)?.id ?? null)
        set({
          workItems: result.workItems,
          currentWorkItemId: currentStill,
        })
        afterProjectChange(get, set)
        return {
          ok: true,
          reason: result.migrated ? 'migrated' : 'updated',
          added: result.added,
          revived: result.revived,
          message: result.message,
        }
      },

      upsertBuilding: (building) => {
        const buildings = [...get().buildings]
        const idx = buildings.findIndex((b) => b.id === building.id)
        if (idx >= 0) buildings[idx] = building
        else buildings.push({ ...building, sortOrder: buildings.length })
        set({ buildings, units: rebuildUnits(buildings, get().units) })
        afterProjectChange(get, set)
      },

      removeBuilding: (buildingId) => {
        const hasDefects = get().defects.some((d) => d.buildingId === buildingId)
        const nextBuildings = hasDefects
          ? get().buildings.map((b) =>
              b.id === buildingId ? { ...b, active: false } : b,
            )
          : get().buildings.filter((b) => b.id !== buildingId)
        set({ buildings: nextBuildings, units: rebuildUnits(nextBuildings, get().units) })
        afterProjectChange(get, set)
      },

      addDefect: async ({
        unitId,
        categoryId,
        categoryName,
        checklistItemId,
        area,
        description,
        planPhotoDataUrl,
        photoDataUrls = [],
        defectNumber: requestedNumber,
        recordKind = 'defect',
        workItemId,
        stageId,
      }) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return null

        const autoNumber = recomputeUnitNextDefectNumber(unitId, state.defects)
        let defectNumber = autoNumber
        if (requestedNumber !== undefined && requestedNumber !== null) {
          const n = Math.floor(Number(requestedNumber))
          if (!Number.isFinite(n) || n < 1) return null
          if (isDefectNumberTaken(unitId, n, state.defects)) return null
          defectNumber = n
        }

        const syncState: SyncState = cloudReady() ? 'pending' : 'demo'
        const defect: Defect = {
          id: createId('def'),
          unitId,
          buildingId: unit.buildingId,
          buildingName: unit.buildingName,
          floor: unit.floor,
          unitCode: unit.code,
          defectNumber,
          categoryId,
          categoryName,
          checklistItemId,
          area,
          description,
          status: recordKind === 'progress' ? 'completed' : 'pending_repair',
          planPhotoDataUrl,
          photoDataUrls,
          syncState,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          recordKind,
          workItemId,
          stageId,
          ...defectActorCreateFields(),
        }

        const nextDefects = [defect, ...state.defects]
        // 自動下一號永遠跟「未作廢最大號 + 1」，補缺號不影響後續自動編號
        const nextCounter = recomputeUnitNextDefectNumber(unitId, nextDefects)
        const kindLabel = recordKind === 'progress' ? '施工紀錄' : `缺失 #${defect.defectNumber}`
        set({
          defects: nextDefects,
          stageProgress: reconcileCellProgress(
            state.stageProgress,
            nextDefects,
            unitId,
            workItemId,
            stageId,
          ),
          currentUnitId: unitId,
          currentWorkItemId: workItemId ?? state.currentWorkItemId,
          currentBuildingId: unit.buildingId,
          currentFloor: unit.floor,
          focusedCell:
            workItemId && stageId ? { unitId, workItemId, stageId } : state.focusedCell,
          units: state.units.map((u) =>
            u.id === unitId ? { ...u, nextDefectNumber: nextCounter } : u,
          ),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: `新增${kindLabel}｜${description || categoryName}`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        // 先寫本機就回傳，雲端上傳改背景做，避免使用者卡在儲存畫面
        afterProjectChange(get, set, { syncCloud: false })

        const projectId = get().activeProjectId
        const hasLocalMedia =
          Boolean(planPhotoDataUrl?.startsWith('data:')) ||
          photoDataUrls.some((p) => p.startsWith('data:'))
        const hasRemoteMedia =
          Boolean(planPhotoDataUrl && /^https?:\/\//i.test(planPhotoDataUrl)) ||
          photoDataUrls.some((p) => /^https?:\/\//i.test(p))

        // 大圖必須先穩存 IndexedDB，再關表單；否則重開 App 會因 localStorage 剝掉 data URL 而丟圖
        if (projectId && hasLocalMedia) {
          try {
            await savePendingDefectMedia({
              defectId: defect.id,
              projectId,
              planPhotoDataUrl: planPhotoDataUrl?.startsWith('data:')
                ? planPhotoDataUrl
                : undefined,
              photoDataUrls: photoDataUrls.filter((p) => p.startsWith('data:')),
              updatedAt: new Date().toISOString(),
            })
          } catch (err) {
            console.warn('[pendingMedia] save failed', err)
          }
        }

        if (cloudReady() && projectId) {
          set({
            defects: get().defects.map((d) =>
              d.id === defect.id ? { ...d, syncState: 'syncing' } : d,
            ),
          })
          if (hasLocalMedia) {
            void get()
              .flushPendingMediaUploads()
              .catch(() => {
                set({
                  defects: get().defects.map((d) =>
                    d.id === defect.id ? { ...d, syncState: 'failed' } : d,
                  ),
                })
              })
          } else {
            // 無本機 data URL 也要立刻寫入雲端；若只有 http 預設圖，物化進 Storage 再同步 Drive
            void syncDefect(projectId, { ...defect, syncState: 'synced' })
              .then(async () => {
                const latest = get().defects.find((d) => d.id === defect.id)
                if (!latest || latest.status === 'voided') return
                let synced = { ...latest, syncState: 'synced' as const }
                if (hasRemoteMedia) {
                  try {
                    const { planUrl, photoUrls } = await uploadDefectImages({
                      projectId,
                      defectId: defect.id,
                      planPhotoDataUrl: latest.planPhotoDataUrl,
                      photoDataUrls: latest.photoDataUrls,
                    })
                    const afterUpload = get().defects.find((d) => d.id === defect.id)
                    if (!afterUpload || afterUpload.status === 'voided') return
                    synced = {
                      ...afterUpload,
                      planPhotoDataUrl: planUrl ?? afterUpload.planPhotoDataUrl,
                      photoDataUrls: photoUrls.length
                        ? photoUrls
                        : afterUpload.photoDataUrls,
                      syncState: 'synced',
                      updatedAt: new Date().toISOString(),
                    }
                    await syncDefect(projectId, synced)
                  } catch (err) {
                    console.warn('[addDefect] materialize remote media failed', err)
                  }
                }
                set({
                  defects: get().defects.map((d) =>
                    d.id === defect.id ? synced : d,
                  ),
                })
                scheduleCloudSync(get)
                // Drive 由後端 onDefectWrittenAutoDrive 統一寫入，勿再 callable 以免競態重複檔
              })
              .catch(() => {
                set({
                  defects: get().defects.map((d) =>
                    d.id === defect.id ? { ...d, syncState: 'failed' } : d,
                  ),
                })
              })
          }
        }

        return get().defects.find((d) => d.id === defect.id) ?? defect
      },

      deleteDefect: async (defectId) => {
        const state = get()
        const defect = state.defects.find((d) => d.id === defectId)
        if (!defect) return { ok: false, error: '找不到此缺失' }
        if (defect.status === 'voided') return { ok: true }

        const next: Defect = {
          ...defect,
          status: 'voided',
          updatedAt: new Date().toISOString(),
          ...defectActorUpdateFields(),
        }
        const nextDefects = state.defects.map((d) => (d.id === defectId ? next : d))
        // 刪除後回收尾號：下一號改回「未作廢最大號 + 1」，避免跳號
        const nextCounter = recomputeUnitNextDefectNumber(defect.unitId, nextDefects)
        set({
          defects: nextDefects,
          stageProgress: reconcileCellProgress(
            state.stageProgress,
            nextDefects,
            defect.unitId,
            defect.workItemId,
            defect.stageId,
          ),
          units: state.units.map((u) =>
            u.id === defect.unitId ? { ...u, nextDefectNumber: nextCounter } : u,
          ),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: defect.buildingName,
              floor: defect.floor,
              unitCode: defect.unitCode,
              summary: `刪除缺失 #${defect.defectNumber}`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set, { syncCloud: false })
        void clearPendingDefectMedia(defectId)

        const projectId = get().activeProjectId
        if (projectId && cloudReady()) {
          try {
            await syncDefect(projectId, next)
            scheduleCloudSync(get)
          } catch (err) {
            console.warn('[deleteDefect] sync failed', err)
            return { ok: true, error: '已本機刪除，雲端同步失敗' }
          }
          // Firestore 觸發器會清 Drive；這裡再強制清一次（含同名重複資料夾）
          try {
            const driveDel = await deleteDefectPhotosFromDrive({
              projectId,
              defectId,
            })
            if (!driveDel.ok) {
              // 再試 reconcile（作廢路徑）
              await autoSyncDefectPhotosToDrive({ projectId, defectId }).catch(() => undefined)
              return {
                ok: true,
                error: `已刪除缺失紀錄，雲端硬碟稍後會再自動清除：${driveDel.error || '未知錯誤'}`,
              }
            }
          } catch (err) {
            console.warn('[deleteDefect] drive trash failed', err)
            void autoSyncDefectPhotosToDrive({ projectId, defectId }).catch(() => undefined)
            return {
              ok: true,
              error: '已刪除缺失紀錄，雲端硬碟稍後會再自動清除',
            }
          }
        }
        return { ok: true }
      },

      updateDefectStatus: (defectId, status) => {
        const state = get()
        const defect = state.defects.find((d) => d.id === defectId)
        if (!defect || defect.status === 'voided') return
        if (defect.status === status) return
        const nextDefects = state.defects.map((d) =>
          d.id === defectId
            ? {
                ...d,
                status,
                updatedAt: new Date().toISOString(),
                ...defectActorUpdateFields(),
              }
            : d,
        )
        set({
          defects: nextDefects,
          stageProgress: reconcileCellProgress(
            state.stageProgress,
            nextDefects,
            defect.unitId,
            defect.workItemId,
            defect.stageId,
          ),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: defect.buildingName,
              floor: defect.floor,
              unitCode: defect.unitCode,
              summary: `狀態更新 → ${statusLabel(status)}`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        const projectId = get().activeProjectId
        if (projectId && cloudReady()) {
          const next = get().defects.find((d) => d.id === defectId)
          if (next) void syncDefect(projectId, next)
        }
      },

      updateDefect: async (defectId, patch) => {
        const state = get()
        const defect = state.defects.find((d) => d.id === defectId)
        if (!defect) return { ok: false, error: '找不到此缺失' }
        if (defect.status === 'voided') return { ok: false, error: '已刪除的缺失無法修改' }

        const nextPlan =
          patch.planPhotoDataUrl === null
            ? undefined
            : patch.planPhotoDataUrl !== undefined
              ? patch.planPhotoDataUrl
              : defect.planPhotoDataUrl
        const nextPhotos =
          patch.photoDataUrls !== undefined ? patch.photoDataUrls : defect.photoDataUrls

        const next: Defect = {
          ...defect,
          categoryId: patch.categoryId ?? defect.categoryId,
          categoryName: patch.categoryName ?? defect.categoryName,
          checklistItemId:
            patch.checklistItemId === null
              ? undefined
              : patch.checklistItemId !== undefined
                ? patch.checklistItemId
                : defect.checklistItemId,
          area: patch.area?.trim() || defect.area,
          description: patch.description?.trim() || defect.description,
          planPhotoDataUrl: nextPlan,
          photoDataUrls: nextPhotos,
          updatedAt: new Date().toISOString(),
          ...defectActorUpdateFields(),
          syncState: cloudReady() ? 'pending' : defect.syncState,
        }

        set({
          defects: state.defects.map((d) => (d.id === defectId ? next : d)),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: defect.buildingName,
              floor: defect.floor,
              unitCode: defect.unitCode,
              summary: `修改缺失 #${defect.defectNumber}`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set, { syncCloud: false })

        const projectId = get().activeProjectId
        const hasLocalMedia =
          Boolean(next.planPhotoDataUrl?.startsWith('data:')) ||
          next.photoDataUrls.some((p) => p.startsWith('data:'))

        if (projectId && hasLocalMedia) {
          try {
            await savePendingDefectMedia({
              defectId: next.id,
              projectId,
              planPhotoDataUrl: next.planPhotoDataUrl?.startsWith('data:')
                ? next.planPhotoDataUrl
                : undefined,
              photoDataUrls: next.photoDataUrls.filter((p) => p.startsWith('data:')),
              updatedAt: next.updatedAt,
            })
          } catch (err) {
            console.warn('[updateDefect] pending media save failed', err)
          }
        }

        if (projectId && cloudReady()) {
          set({
            defects: get().defects.map((d) =>
              d.id === next.id ? { ...d, syncState: 'syncing' } : d,
            ),
          })
          if (hasLocalMedia) {
            void get().flushPendingMediaUploads()
          } else {
            try {
              const synced = {
                ...(get().defects.find((d) => d.id === next.id) ?? next),
                syncState: 'synced' as const,
              }
              await syncDefect(projectId, synced)
              set({
                defects: get().defects.map((d) => (d.id === synced.id ? synced : d)),
              })
              afterProjectChange(get, set, { syncCloud: false })
              scheduleCloudSync(get)
              // 備註／大項變更：Firestore 觸發器會改名／搬移；勿再額外 callable
            } catch (err) {
              console.warn('[updateDefect] sync failed', err)
              return { ok: true, error: '已本機更新，雲端同步失敗' }
            }
          }
        }

        return { ok: true }
      },

      setUnitAreas: (unitId, areas, renames = []) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return { ok: false, error: '找不到此戶別' }

        const cleaned: string[] = []
        const seen = new Set<string>()
        for (const raw of areas) {
          const name = normalizeAreaName(raw)
          if (!name) continue
          if (seen.has(name)) continue
          seen.add(name)
          cleaned.push(name)
        }
        if (cleaned.length === 0) {
          return { ok: false, error: '至少需要保留一個施工區域' }
        }

        const renameMap = new Map<string, string>()
        for (const r of renames) {
          const from = normalizeAreaName(r.from)
          const to = normalizeAreaName(r.to)
          if (from && to && from !== to) renameMap.set(from, to)
        }

        const nextUnits = state.units.map((u) =>
          u.id === unitId
            ? { ...u, areas: cleaned, areaTemplateId: undefined }
            : u,
        )
        const nextDefects =
          renameMap.size === 0
            ? state.defects
            : state.defects.map((d) => {
                if (d.unitId !== unitId) return d
                const to = renameMap.get(d.area)
                if (!to) return d
                return { ...d, area: to, updatedAt: new Date().toISOString() }
              })

        set({
          units: nextUnits,
          defects: nextDefects,
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: `更新 ${unit.code}戶 施工區域（${cleaned.length} 項）`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)

        const projectId = get().activeProjectId
        if (projectId && cloudReady() && renameMap.size > 0) {
          const renamedTargets = new Set(renameMap.values())
          for (const d of get().defects) {
            if (d.unitId === unitId && renamedTargets.has(d.area)) {
              void syncDefect(projectId, d)
            }
          }
        }

        return { ok: true }
      },

      resetUnitAreasToProjectDefault: (unitId) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return { ok: false, error: '找不到此戶別' }
        set({
          units: state.units.map((u) =>
            u.id === unitId
              ? { ...u, areas: undefined, areaTemplateId: undefined }
              : u,
          ),
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      applyAreaTemplateToUnits: (unitIds, templateId, options = {}) => {
        const overwrite = Boolean(options.overwriteCustomized)
        if (unitIds.length === 0) {
          return { ok: false, error: '請先選擇戶別', applied: 0, skipped: 0 }
        }
        const state = get()
        const template = (state.areaTemplates ?? []).find((t) => t.id === templateId)
        if (!template?.areas?.length) {
          return { ok: false, error: '找不到此格局範本', applied: 0, skipped: 0 }
        }

        const idSet = new Set(unitIds)
        let applied = 0
        let skipped = 0
        const sameAreas = (a: string[] | undefined, b: string[]) =>
          Boolean(a) &&
          a!.length === b.length &&
          a!.every((name, i) => name === b[i])

        const nextUnits = state.units.map((u) => {
          if (!idSet.has(u.id) || !u.active) return u
          // 已綁同一範本且無手動自訂 → 略過
          if (!isUnitAreasCustomized(u) && u.areaTemplateId === templateId) {
            skipped += 1
            return u
          }
          // 舊版曾把範本內容複製進 areas：清單相同則改回「綁定範本」
          if (
            isUnitAreasCustomized(u) &&
            sameAreas(u.areas, template.areas)
          ) {
            applied += 1
            return { ...u, areas: undefined, areaTemplateId: templateId }
          }
          if (!overwrite && isUnitAreasCustomized(u)) {
            skipped += 1
            return u
          }
          applied += 1
          return {
            ...u,
            areas: undefined,
            areaTemplateId: templateId,
          }
        })

        if (applied === 0) {
          return {
            ok: false,
            error:
              skipped > 0
                ? `沒有新套用：可能已綁此範本，或皆為手動自訂（可勾選「覆蓋已自訂」）`
                : '沒有可套用的戶別',
            applied: 0,
            skipped,
          }
        }

        set({
          units: nextUnits,
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: '—',
              floor: '—',
              unitCode: '—',
              summary: `套用格局範本 ${template.code}：${applied} 戶${
                skipped ? `，略過 ${skipped} 戶` : ''
              }`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        return { ok: true, applied, skipped }
      },

      resetUnitsAreasToProjectDefault: (unitIds) => {
        if (unitIds.length === 0) {
          return { ok: false, error: '請先選擇戶別', reset: 0 }
        }
        const state = get()
        const idSet = new Set(unitIds)
        let reset = 0
        const nextUnits = state.units.map((u) => {
          if (!idSet.has(u.id) || !u.active) return u
          if (!isUnitAreasCustomized(u) && !u.areaTemplateId) return u
          reset += 1
          return { ...u, areas: undefined, areaTemplateId: undefined }
        })
        if (reset === 0) {
          return { ok: true, reset: 0 }
        }
        set({
          units: nextUnits,
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: '—',
              floor: '—',
              unitCode: '—',
              summary: `還原施工區域為專案預設：${reset} 戶`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        return { ok: true, reset }
      },

      setUnitDefaultPlan: async (unitId, planUrl) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return { ok: false, error: '找不到此戶別' }

        let nextUrl: string | undefined
        if (planUrl === null || planUrl === '') {
          nextUrl = undefined
        } else if (planUrl.startsWith('http://') || planUrl.startsWith('https://')) {
          nextUrl = planUrl
        } else if (planUrl.startsWith('data:')) {
          const projectId = get().activeProjectId
          if (projectId && cloudReady()) {
            try {
              const up = await uploadUnitPlanImage({
                projectId,
                unitId,
                dataUrl: planUrl,
              })
              nextUrl = up?.url || planUrl
            } catch (err) {
              console.warn('[setUnitDefaultPlan] upload failed', err)
              return { ok: false, error: '位置圖上傳失敗，請檢查網路後再試' }
            }
          } else {
            // 示範／離線：暫存 data URL（僅本機）
            nextUrl = planUrl
          }
        } else {
          return { ok: false, error: '不支援的圖片格式' }
        }

        set({
          units: get().units.map((u) =>
            u.id === unitId ? { ...u, defaultPlanPhotoUrl: nextUrl } : u,
          ),
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: nextUrl
                ? `更新 ${unit.code}戶 預設位置圖`
                : `清除 ${unit.code}戶 預設位置圖`,
              ...activityActorFields(),
            },
            ...get().activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      setProjectAreas: (areas) => {
        const cleaned: string[] = []
        const seen = new Set<string>()
        for (const raw of areas) {
          const name = normalizeAreaName(raw)
          if (!name || seen.has(name)) continue
          seen.add(name)
          cleaned.push(name)
        }
        if (cleaned.length === 0) {
          return { ok: false, error: '至少需要保留一個施工區域' }
        }
        set({ areas: cleaned })
        afterProjectChange(get, set)
        return { ok: true }
      },

      saveAreaTemplate: (input) => {
        const cleaned = sanitizeAreaList(input.areas)
        if (cleaned.length === 0) {
          return { ok: false, error: '至少需要一個施工區域' }
        }
        const name = normalizeAreaName(input.name) || '未命名格局'
        const list = [...(get().areaTemplates ?? [])]
        const now = new Date().toISOString()
        let template: AreaTemplate
        if (input.id) {
          const idx = list.findIndex((t) => t.id === input.id)
          if (idx < 0) return { ok: false, error: '找不到此範本' }
          template = {
            ...list[idx],
            name,
            areas: cleaned,
            updatedAt: now,
          }
          list[idx] = template
        } else {
          template = {
            id: createId('atpl'),
            code: nextAreaTemplateCode(list),
            name,
            areas: cleaned,
            updatedAt: now,
          }
          list.push(template)
        }
        list.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
        set({ areaTemplates: list })
        afterProjectChange(get, set)
        return { ok: true, template }
      },

      deleteAreaTemplate: (templateId) => {
        const list = get().areaTemplates ?? []
        if (!list.some((t) => t.id === templateId)) {
          return { ok: false, error: '找不到此範本' }
        }
        set({
          areaTemplates: list.filter((t) => t.id !== templateId),
          // 解除綁定；無手動自訂者改回專案預設
          units: get().units.map((u) =>
            u.areaTemplateId === templateId
              ? { ...u, areaTemplateId: undefined }
              : u,
          ),
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      markUnitChecked: (unitId, checked) => {
        set({
          unitCheckedCount: {
            ...get().unitCheckedCount,
            [unitId]: checked,
          },
        })
        afterProjectChange(get, set)
      },

      setUnitCategoryDone: (unitId, categoryId, done) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        const cat = state.categories.find((c) => c.id === categoryId)
        if (!unit || !cat) return

        const prev = state.unitCategoryDone?.[unitId] ?? []
        const setIds = new Set(prev)
        if (done) setIds.add(categoryId)
        else setIds.delete(categoryId)
        const nextIds = [...setIds]

        const activeIds = state.categories.filter((c) => c.active).map((c) => c.id)
        const allDone =
          activeIds.length > 0 && activeIds.every((id) => nextIds.includes(id))
        const itemTotal = state.categories
          .filter((c) => c.active)
          .reduce((sum, c) => sum + c.itemCount, 0)

        set({
          unitCategoryDone: {
            ...(state.unitCategoryDone ?? {}),
            [unitId]: nextIds,
          },
          unitCheckedCount: {
            ...state.unitCheckedCount,
            [unitId]: allDone ? itemTotal : Math.min(state.unitCheckedCount[unitId] ?? 0, itemTotal),
          },
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: done
                ? `標記大項「${cat.name}」已查畢`
                : `取消大項「${cat.name}」查畢`,
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
      },

      setUnitInspectionComplete: (unitId, complete) => {
        const state = get()
        const unit = state.units.find((u) => u.id === unitId)
        if (!unit) return
        const activeIds = state.categories.filter((c) => c.active).map((c) => c.id)
        const itemTotal = state.categories
          .filter((c) => c.active)
          .reduce((sum, c) => sum + c.itemCount, 0)

        set({
          unitCategoryDone: {
            ...(state.unitCategoryDone ?? {}),
            [unitId]: complete ? activeIds : [],
          },
          unitCheckedCount: {
            ...state.unitCheckedCount,
            [unitId]: complete ? itemTotal : 0,
          },
          activities: [
            {
              id: createId('act'),
              at: new Date().toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              buildingName: unit.buildingName,
              floor: unit.floor,
              unitCode: unit.code,
              summary: complete ? '標記本戶全部大項完成' : '清除本戶完成標記',
              ...activityActorFields(),
            },
            ...state.activities,
          ].slice(0, 40),
        })
        afterProjectChange(get, set)
      },

      resetDemoData: () => {
        const id = get().activeProjectId
        const name = get().projectName || '未命名專案'
        const blank = createEmptyProjectState(name)
        if (!id) {
          set({ ...blank, bundles: {}, activeProjectId: null })
          return
        }
        set({
          ...blank,
          bundles: { ...get().bundles, [id]: blank },
          activeProjectId: id,
        })
        scheduleCloudSync(get)
      },

      loadProjectBundle: (projectId) => {
        let bundle = ensureProgressFields(
          get().bundles[projectId] ?? createEmptyProjectState(projectId),
        )
        if (!bundle.workItems.some((w) => w.active)) {
          bundle = { ...bundle, workItems: buildDefaultWorkItems() }
          set({
            bundles: { ...get().bundles, [projectId]: structuredClone(bundle) },
          })
        }
        set({ ...structuredClone(bundle), activeProjectId: projectId })
        // 先回填本機舊佔位名，再開雲端合併
        get().backfillActorNames()
        // 本機載入後立刻嘗試從雲端還原／合併
        void get().hydrateFromCloud(projectId)
      },

      saveProjectBundle: (projectId) => {
        const snap = snapshotProject(get())
        set({
          bundles: {
            ...get().bundles,
            [projectId]: snap,
          },
        })
      },

      ensureProjectBundle: (projectId, name) => {
        const existing = get().bundles[projectId]
        if (existing) {
          const filled = ensureProgressFields({
            ...existing,
            projectName: existing.projectName || name,
          })
          if (!existing.workItems?.some((w) => w.active)) {
            set({
              bundles: { ...get().bundles, [projectId]: filled },
            })
            if (get().activeProjectId === projectId) {
              set({
                workItems: filled.workItems,
                stageProgress: filled.stageProgress,
                currentWorkItemId: filled.currentWorkItemId,
              })
            }
          }
          return
        }
        set({
          bundles: {
            ...get().bundles,
            [projectId]: createEmptyProjectState(name),
          },
        })
      },

      removeProjectBundle: (projectId) => {
        const { bundles, activeProjectId } = get()
        if (!bundles[projectId] && activeProjectId !== projectId) return
        const next = { ...bundles }
        delete next[projectId]
        if (activeProjectId === projectId) {
          const fallbackId = Object.keys(next)[0] ?? null
          if (fallbackId) {
            set({
              ...structuredClone(next[fallbackId]),
              bundles: next,
              activeProjectId: fallbackId,
            })
          } else {
            set({
              ...createEmptyProjectState('未選擇專案'),
              bundles: next,
              activeProjectId: null,
            })
          }
          return
        }
        set({ bundles: next })
      },

      getProjectActivities: (projectId) => {
        const state = get()
        if (state.activeProjectId === projectId) return state.activities
        return state.bundles[projectId]?.activities ?? []
      },

      applyDefaultChecklist: (mode = 'fill-if-empty') => {
        const state = get()
        const hasActive = state.categories.some((c) => c.active)
        if (mode === 'fill-if-empty' && hasActive) {
          return { ok: false, reason: '已有缺失分類範本，未覆蓋' }
        }
        const { categories, checklistItems } = buildDefaultChecklist()
        if (mode === 'replace') {
          // 保留已停用舊項（若有缺失關聯），再疊上預設
          const keptCats = state.categories.filter((c) => !c.active)
          const keptItems = state.checklistItems.filter((i) => !i.active)
          set({
            categories: [...categories, ...keptCats],
            checklistItems: [...checklistItems, ...keptItems],
          })
        } else {
          set({ categories, checklistItems })
        }
        afterProjectChange(get, set)
        return { ok: true }
      },

      pushStructureToCloud: async () => {
        const mode = firebaseModeLabel()
        if (!cloudReady()) return { ok: false, mode }
        try {
          const projectId = get().activeProjectId ?? 'default'
          get().saveProjectBundle(projectId)
          await syncProjectStructure(projectId, get(), {
            name: get().projectName,
          })
          return { ok: true, mode }
        } catch {
          return { ok: false, mode }
        }
      },

      flushSyncNow: async () => {
        const projectId = get().activeProjectId
        if (projectId) get().saveProjectBundle(projectId)
        if (syncTimer) {
          clearTimeout(syncTimer)
          syncTimer = null
        }
        const ok = await flushCloudSync(get)
        return { ok }
      },

      backfillActorNames: () => {
        const info = currentActorInfo()
        // 用系統管理者登入時，不要把現場紀錄改成「系統管理者」
        if (info.isSystemAdmin) return 0
        const snap = snapshotProject(get())
        const preferred =
          resolveBackfillActorName([inferActorNameFromState(snap), info.accountHint]) || ''
        if (isPlaceholderActor(preferred) && isPlaceholderActor(info.accountHint)) return 0
        const { state, changed } = backfillProjectActors(
          snap,
          preferred || info.accountHint,
          info.accountHint,
        )
        if (changed === 0) return 0
        set({
          activities: state.activities,
          defects: state.defects,
        })
        afterProjectChange(get, set)
        return changed
      },

      hydrateFromCloud: async (projectId) => {
        if (!cloudReady() || !projectId) {
          // 即使離線也先把佇列照片掛回畫面
          await get().restorePendingMediaToMemory()
          get().backfillActorNames()
          return { ok: false, error: '尚未設定 Firebase' }
        }
        try {
          // 先還原佇列照片，避免雲端合併後短暫無圖／被空照片蓋掉
          await get().restorePendingMediaToMemory()

          const remote = await pullProjectState(projectId)
          if (!remote) {
            get().backfillActorNames()
            void get().flushPendingMediaUploads()
            return { ok: true }
          }

          const local =
            get().activeProjectId === projectId
              ? snapshotProject(get())
              : (get().bundles[projectId] ?? createEmptyProjectState(projectId))

          const merged = ensureProgressFields(mergeProjectStates(local, remote))

          set({
            bundles: { ...get().bundles, [projectId]: structuredClone(merged) },
          })

          if (get().activeProjectId === projectId) {
            set({ ...structuredClone(merged), activeProjectId: projectId })
          }

          // 合併後再掛一次佇列，確保 data URL 不被雲端空欄位蓋掉
          await get().restorePendingMediaToMemory()
          await get().healStuckMediaSyncStates()

          // 舊「現場查驗」佔位名 → 真實查驗人，並推回雲端
          const filled = get().backfillActorNames()
          if (filled > 0) {
            scheduleCloudSync(get)
          }

          // 本機有、雲端缺的部分補推回去
          if (
            local.buildings.length > remote.buildings.length ||
            local.defects.length > remote.defects.length
          ) {
            scheduleCloudSync(get)
          }

          void get().flushPendingMediaUploads()
          // Drive 改每日批次／手動強制補齊，開專案不再背景狂掃
          return { ok: true }
        } catch (err) {
          console.warn('[hydrateFromCloud] failed', err)
          await get().restorePendingMediaToMemory()
          await get().healStuckMediaSyncStates()
          get().backfillActorNames()
          return { ok: false, error: '從雲端同步失敗' }
        }
      },

      restorePendingMediaToMemory: async () => {
        const projectId = get().activeProjectId
        if (!projectId) return 0
        try {
          const pending = await listPendingDefectMedia()
          const mine = pending.filter((p) => p.projectId === projectId)
          if (mine.length === 0) return 0

          let restored = 0
          const nextDefects = get().defects.map((defect) => {
            const entry = mine.find((p) => p.defectId === defect.id)
            if (!entry || defect.status === 'voided') return defect

            const planPhotoDataUrl = preferMediaUrl(
              defect.planPhotoDataUrl,
              entry.planPhotoDataUrl,
            )
            const photoDataUrls = mergePhotoLists(
              defect.photoDataUrls,
              entry.photoDataUrls,
            )
            const changed =
              planPhotoDataUrl !== defect.planPhotoDataUrl ||
              photoDataUrls.join('|') !== (defect.photoDataUrls ?? []).join('|')
            if (!changed) return defect
            restored += 1
            return {
              ...defect,
              planPhotoDataUrl,
              photoDataUrls,
              syncState:
                defect.syncState === 'synced' &&
                (planPhotoDataUrl?.startsWith('data:') ||
                  photoDataUrls.some((p) => p.startsWith('data:')))
                  ? 'pending'
                  : defect.syncState,
            }
          })

          if (restored > 0) {
            set({ defects: nextDefects })
            afterProjectChange(get, set, { syncCloud: false })
          }
          return restored
        } catch (err) {
          console.warn('[restorePendingMediaToMemory] failed', err)
          return 0
        }
      },

      healStuckMediaSyncStates: async () => {
        const projectId = get().activeProjectId
        if (!projectId) return 0
        try {
          const pending = await listPendingDefectMedia()
          const pendingIds = new Set(
            pending.filter((p) => p.projectId === projectId).map((p) => p.defectId),
          )
          const healedIds: string[] = []
          const nextDefects = get().defects.map((defect) => {
            if (defect.status === 'voided') return defect
            if (
              defect.syncState !== 'failed' &&
              defect.syncState !== 'pending' &&
              defect.syncState !== 'syncing'
            ) {
              return defect
            }
            // 佇列裡還有圖，或記憶體還有 data URL → 真的還在等上傳，不要清
            if (pendingIds.has(defect.id) || hasUploadableLocalMedia(defect)) {
              return defect
            }
            healedIds.push(defect.id)
            return { ...defect, syncState: 'synced' as const }
          })
          if (healedIds.length === 0) return 0
          set({ defects: nextDefects })
          afterProjectChange(get, set, { syncCloud: false })
          if (cloudReady()) {
            for (const id of healedIds) {
              const d = nextDefects.find((x) => x.id === id)
              if (d) void syncDefect(projectId, d).catch(() => undefined)
            }
          }
          return healedIds.length
        } catch (err) {
          console.warn('[healStuckMediaSyncStates] failed', err)
          return 0
        }
      },

      flushPendingMediaUploads: async () => {
        const projectId = get().activeProjectId
        if (!projectId) return { ok: false, uploaded: 0 }

        // 無論是否連線，先把照片掛回畫面，並清掉假的「上傳失敗」
        await get().restorePendingMediaToMemory()
        await get().healStuckMediaSyncStates()
        if (!cloudReady() || !navigator.onLine) return { ok: false, uploaded: 0 }

        let uploaded = 0
        try {
          const pending = await listPendingDefectMedia()
          const mine = pending.filter((p) => p.projectId === projectId)
          for (const entry of mine) {
            const defect = get().defects.find((d) => d.id === entry.defectId)
            if (!defect || defect.status === 'voided') {
              await clearPendingDefectMedia(entry.defectId)
              continue
            }

            const withLocal: Defect = {
              ...defect,
              planPhotoDataUrl: preferMediaUrl(
                defect.planPhotoDataUrl,
                entry.planPhotoDataUrl,
              ),
              photoDataUrls: mergePhotoLists(
                defect.photoDataUrls,
                entry.photoDataUrls,
              ),
              syncState: 'syncing',
            }
            set({
              defects: get().defects.map((d) => (d.id === defect.id ? withLocal : d)),
            })

            const needsUpload =
              Boolean(withLocal.planPhotoDataUrl?.startsWith('data:')) ||
              withLocal.photoDataUrls.some((p) => p.startsWith('data:'))
            if (!needsUpload) {
              await clearPendingDefectMedia(entry.defectId)
              const latest = get().defects.find((d) => d.id === entry.defectId)
              if (latest && latest.status !== 'voided' && latest.syncState !== 'synced') {
                const synced = { ...latest, syncState: 'synced' as const }
                set({
                  defects: get().defects.map((d) => (d.id === synced.id ? synced : d)),
                })
                void syncDefect(projectId, synced).catch(() => undefined)
              }
              continue
            }

            try {
              // 先寫 Firestore，再上傳 Storage，避免 mirror 觸發時還找不到缺失文件
              await syncDefect(projectId, {
                ...withLocal,
                syncState: 'syncing',
              })
              const { planUrl, photoUrls } = await uploadDefectImages({
                projectId,
                defectId: entry.defectId,
                planPhotoDataUrl: withLocal.planPhotoDataUrl,
                photoDataUrls: withLocal.photoDataUrls,
              })
              // 上傳期間若使用者已刪除，絕不可把非作廢快照寫回雲端（會造成幽靈缺失復活）
              const latest = get().defects.find((d) => d.id === entry.defectId)
              if (!latest || latest.status === 'voided') {
                await clearPendingDefectMedia(entry.defectId)
                if (latest?.status === 'voided') {
                  await syncDefect(projectId, {
                    ...latest,
                    planPhotoDataUrl: planUrl ?? latest.planPhotoDataUrl,
                    photoDataUrls: photoUrls.length ? photoUrls : latest.photoDataUrls,
                    status: 'voided',
                    updatedAt: new Date().toISOString(),
                  })
                }
                continue
              }
              const synced: Defect = {
                ...latest,
                planPhotoDataUrl: planUrl ?? latest.planPhotoDataUrl,
                photoDataUrls: photoUrls.length ? photoUrls : latest.photoDataUrls,
                syncState: 'synced',
                updatedAt: new Date().toISOString(),
              }
              await syncDefect(projectId, synced)
              set({
                defects: get().defects.map((d) => (d.id === synced.id ? synced : d)),
              })
              afterProjectChange(get, set, { syncCloud: false })
              await clearPendingDefectMedia(entry.defectId)
              uploaded += 1
              // Drive 同步交給後端 Firestore 觸發器，避免與 mirror／reconcile 三路競態產生同名重複檔
            } catch (err) {
              console.warn('[flushPendingMediaUploads] one failed', entry.defectId, err)
              set({
                defects: get().defects.map((d) =>
                  d.id === entry.defectId ? { ...d, syncState: 'failed' } : d,
                ),
              })
            }
          }
          if (uploaded > 0) scheduleCloudSync(get)
          return { ok: true, uploaded }
        } catch (err) {
          console.warn('[flushPendingMediaUploads] failed', err)
          return { ok: false, uploaded }
        }
      },

      upsertCategory: (category, items) => {
        const state = get()
        const cats = [...state.categories]
        const idx = cats.findIndex((c) => c.id === category.id)
        const nextItems = [
          ...state.checklistItems.filter((i) => i.categoryId !== category.id),
          ...items.map((it, i) => ({
            ...it,
            categoryId: category.id,
            sortOrder: i,
            active: it.active !== false,
          })),
        ]
        const synced: ChecklistCategory = {
          ...category,
          itemCount: nextItems.filter((i) => i.categoryId === category.id && i.active).length,
          active: true,
        }
        if (idx >= 0) cats[idx] = synced
        else cats.push({ ...synced, sortOrder: cats.length })

        // 連動：已存在缺失的 categoryName 跟著改
        const defects = state.defects.map((d) =>
          d.categoryId === category.id ? { ...d, categoryName: synced.name } : d,
        )

        set({ categories: cats, checklistItems: nextItems, defects })
        afterProjectChange(get, set)
      },

      removeCategory: (categoryId) => {
        const state = get()
        const hasDefects = state.defects.some(
          (d) => d.categoryId === categoryId && d.status !== 'voided',
        )
        if (hasDefects) {
          // 有歷史缺失：只能停用，保留紀錄
          set({
            categories: state.categories.map((c) =>
              c.id === categoryId ? { ...c, active: false } : c,
            ),
            checklistItems: state.checklistItems.map((i) =>
              i.categoryId === categoryId ? { ...i, active: false } : i,
            ),
          })
          afterProjectChange(get, set)
          return { ok: true, reason: '已有缺失紀錄，已改為停用（無法物理刪除）' }
        }
        set({
          categories: state.categories.filter((c) => c.id !== categoryId),
          checklistItems: state.checklistItems.filter((i) => i.categoryId !== categoryId),
        })
        afterProjectChange(get, set)
        return { ok: true }
      },

      upsertChecklistItem: (item) => {
        const state = get()
        const list = [...state.checklistItems]
        const idx = list.findIndex((i) => i.id === item.id)
        if (idx >= 0) list[idx] = item
        else list.push(item)
        const categories = state.categories.map((c) =>
          c.id === item.categoryId
            ? {
                ...c,
                itemCount: list.filter((i) => i.categoryId === c.id && i.active).length,
              }
            : c,
        )
        set({ checklistItems: list, categories })
        afterProjectChange(get, set)
      },

      removeChecklistItem: (itemId) => {
        const state = get()
        const item = state.checklistItems.find((i) => i.id === itemId)
        if (!item) return { ok: false, reason: '找不到細項' }
        const hasDefects = state.defects.some(
          (d) => d.checklistItemId === itemId && d.status !== 'voided',
        )
        if (hasDefects) {
          const list = state.checklistItems.map((i) =>
            i.id === itemId ? { ...i, active: false } : i,
          )
          const categories = state.categories.map((c) =>
            c.id === item.categoryId
              ? {
                  ...c,
                  itemCount: list.filter((i) => i.categoryId === c.id && i.active).length,
                }
              : c,
          )
          set({ checklistItems: list, categories })
          afterProjectChange(get, set)
          return { ok: true, reason: '細項已有缺失，已改為停用' }
        }
        const list = state.checklistItems.filter((i) => i.id !== itemId)
        const categories = state.categories.map((c) =>
          c.id === item.categoryId
            ? {
                ...c,
                itemCount: list.filter((i) => i.categoryId === c.id && i.active).length,
              }
            : c,
        )
        set({ checklistItems: list, categories })
        afterProjectChange(get, set)
        return { ok: true }
      },
    }),
    {
      // 專用 key；刻意不從 site-inspection-v5 遷移，以免帶入查驗資料（含 8-2）
      name: PROGRESS_PROJECT_STORAGE_KEY,
      version: 9,
      // 大圖 base64 不寫入 localStorage，避免配額爆掉（QuotaExceededError）
      partialize: (state) => ({
        ...lightenProjectState(state),
        bundles: Object.fromEntries(
          Object.entries(state.bundles).map(([id, bundle]) => [
            id,
            lightenProjectState(bundle),
          ]),
        ),
        activeProjectId: state.activeProjectId,
      }),
      migrate: (persisted) => {
        const s = persisted as (ProjectState & BundleState) | null
        if (!s || typeof s !== 'object') return s as never
        const withProgress = ensureProgressFields({
          ...s,
          unitCategoryDone: s.unitCategoryDone ?? {},
          areaTemplates: s.areaTemplates ?? [],
        } as ProjectState)
        const bundles = Object.fromEntries(
          Object.entries(s.bundles ?? {}).map(([id, bundle]) => [
            id,
            ensureProgressFields({
              ...bundle,
              unitCategoryDone: bundle.unitCategoryDone ?? {},
              areaTemplates: bundle.areaTemplates ?? [],
            }),
          ]),
        )
        const withCategoryDone = {
          ...s,
          ...withProgress,
          bundles,
        }
        return {
          ...withCategoryDone,
          ...lightenProjectState(withCategoryDone),
          bundles: Object.fromEntries(
            Object.entries(withCategoryDone.bundles ?? {}).map(([id, bundle]) => [
              id,
              lightenProjectState(bundle),
            ]),
          ),
          activeProjectId: withCategoryDone.activeProjectId ?? null,
        } as never
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name),
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value)
          } catch (err) {
            console.warn('[persist] quota exceeded, stripping media and retrying', err)
            try {
              purgeBloatedInspectionStorage()
              const parsed = JSON.parse(value) as {
                state?: ProjectState & BundleState
                version?: number
              }
              if (parsed.state) {
                parsed.state = {
                  ...lightenProjectState(parsed.state),
                  bundles: Object.fromEntries(
                    Object.entries(parsed.state.bundles ?? {}).map(([id, bundle]) => [
                      id,
                      lightenProjectState(bundle),
                    ]),
                  ),
                  activeProjectId: parsed.state.activeProjectId,
                }
                localStorage.setItem(name, JSON.stringify(parsed))
                return
              }
            } catch {
              /* fall through */
            }
            try {
              localStorage.removeItem(name)
            } catch {
              /* ignore */
            }
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      })),
    },
  ),
)

/** App 被滑掉／切背景前盡力寫入雲端 */
if (typeof window !== 'undefined') {
  const flush = () => {
    void useProjectStore.getState().flushSyncNow()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
