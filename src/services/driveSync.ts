import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'
import {
  getGoogleOAuthClientId,
  requestGoogleDriveAccessToken,
  requestGoogleDriveAccessTokenSilent,
} from '../lib/googleDriveAuth'
import {
  driveAssertFolder,
  driveEnsureFolderPath,
  driveFindFolderPath,
  driveGetEmail,
  driveTrashFolder,
  driveUploadDataUrl,
} from '../lib/googleDriveClient'
import { useAuthStore } from '../store/useAuthStore'
import { useProjectStore } from '../store/useProjectStore'
import { getPendingDefectMedia } from '../lib/pendingMediaDb'
import { syncDefect } from './cloudSync'

export type DriveSyncResult = {
  ok: boolean
  projectId: string
  uploaded: number
  skipped: number
  scanned: number
  cleanedVoided?: number
  cleanedDupFolders?: number
  force?: boolean
  errors: string[]
  clientEmail?: string | null
  folderLayout?: string
}

export type DriveSyncOptions = {
  defectIds?: string[]
  /** 強制對 Drive 真實掃描／補檔（手動「強制補齊」用） */
  force?: boolean
}

/** 同步 Drive 前，先把本機已刪除（作廢）的缺失寫回 Firestore，避免幽靈缺失又被上傳 */
async function pushLocalVoidedDefects(projectId: string): Promise<number> {
  const voided = useProjectStore.getState().defects.filter((d) => d.status === 'voided')
  if (voided.length === 0) return 0
  let n = 0
  await Promise.all(
    voided.map(async (d) => {
      try {
        const ok = await syncDefect(projectId, d)
        if (ok) n += 1
      } catch {
        /* ignore single failure */
      }
    }),
  )
  return n
}

export type DriveOwnerConnectResult = {
  ok: boolean
  projectId: string
  email?: string | null
  reusedRefreshToken?: boolean
  /** true＝尚未部署雲端函數，改用瀏覽器直連（同步時可能再跳一次 Google） */
  browserDirect?: boolean
}

export const FIREBASE_DRIVE_UNAVAILABLE =
  '施工進度站尚未接上獨立 Firebase 專案（site-progress-app-8d6c2），無法完成雲端硬碟綁定。\n\n' +
  '請勿使用查驗 CI 的 ci-inspection。'

async function ensureFirebaseUser() {
  if (!isFirebaseConfigured()) {
    return { ok: false as const, error: FIREBASE_DRIVE_UNAVAILABLE }
  }
  const app = getFirebaseApp()
  const auth = getFirebaseAuth()
  if (!app || !auth) return { ok: false as const, error: 'Firebase 尚未就緒' }
  await auth.authStateReady()
  if (!auth.currentUser) {
    return { ok: false as const, error: '請先重新登入（需要 Firebase 登入狀態才能同步）' }
  }
  return { ok: true as const, app }
}

function isFunctionsUnavailable(err: unknown): boolean {
  const anyErr = err as { code?: string; message?: string }
  const blob = `${anyErr.code || ''} ${anyErr.message || err}`.toLowerCase()
  return (
    blob.includes('internal') ||
    blob.includes('not-found') ||
    blob.includes('not found') ||
    blob.includes('unavailable') ||
    blob.includes('failed to fetch') ||
    blob.includes('cors')
  )
}

let functionsKnownDown = false

function noteFunctionsUnavailable(err: unknown): boolean {
  if (!isFunctionsUnavailable(err)) return false
  functionsKnownDown = true
  return true
}

function describeDriveError(err: unknown): string {
  const anyErr = err as { code?: string; message?: string }
  const raw = String(anyErr.message || err)
  if (isFunctionsUnavailable(err)) {
    return '雲端函數尚未部署，已改用你剛授權的 Google 帳號在瀏覽器直接寫入雲端硬碟。'
  }
  return raw.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)$/, '') || '操作失敗'
}

function markDriveOwnerConnected(projectId: string, email: string | null) {
  const project = useAuthStore.getState().projects.find((p) => p.id === projectId)
  if (!project) return
  useAuthStore.getState().upsertProject({
    ...project,
    driveOwnerConnected: true,
    driveOwnerEmail: email || project.driveOwnerEmail,
  })
}

function projectBundle(projectId: string) {
  const s = useProjectStore.getState()
  if (s.activeProjectId === projectId) {
    return { defects: s.defects, checklistItems: s.checklistItems }
  }
  const b = s.bundles[projectId]
  return { defects: b?.defects ?? [], checklistItems: b?.checklistItems ?? [] }
}

function defectsForProject(projectId: string) {
  return projectBundle(projectId).defects
}

function leafFolderName(projectId: string, defect: ReturnType<typeof defectsForProject>[number]): string {
  const item = projectBundle(projectId).checklistItems.find((i) => i.id === defect.checklistItemId)
  const itemLabel = (item?.description || '').trim()
  const desc = (defect.description || '').trim()
  const parts = [`#${defect.defectNumber}`]
  if (itemLabel) parts.push(itemLabel)
  if (desc && desc !== itemLabel) parts.push(desc.slice(0, 60))
  else if (!itemLabel) parts.push(desc || '未命名缺失')
  return parts.join(' ')
}

function usablePhotoUrl(url?: string): boolean {
  return Boolean(url && (url.startsWith('data:') || /^https?:\/\//i.test(url)))
}

async function photosForDefect(
  projectId: string,
  d: ReturnType<typeof defectsForProject>[number],
): Promise<Array<{ name: string; url: string }>> {
  let plan = d.planPhotoDataUrl
  let photos = [...(d.photoDataUrls ?? [])]
  if (!usablePhotoUrl(plan) || photos.some((p) => !usablePhotoUrl(p))) {
    try {
      const pending = await getPendingDefectMedia(d.id)
      if (pending && (!pending.projectId || pending.projectId === projectId)) {
        if (!usablePhotoUrl(plan) && usablePhotoUrl(pending.planPhotoDataUrl)) {
          plan = pending.planPhotoDataUrl
        }
        if (pending.photoDataUrls?.length) {
          photos = photos.length
            ? photos.map((p, i) => (usablePhotoUrl(p) ? p : pending.photoDataUrls[i] || p))
            : pending.photoDataUrls
        }
      }
    } catch {
      /* IndexedDB 不可用時略過 */
    }
  }
  return [
    ...(usablePhotoUrl(plan) ? [{ name: 'plan.jpg', url: plan as string }] : []),
    ...photos
      .filter((url) => usablePhotoUrl(url))
      .map((url, i) => ({ name: `photo-${i + 1}.jpg`, url })),
  ]
}

async function syncPhotosFromBrowser(
  projectId: string,
  accessToken: string,
  options?: DriveSyncOptions,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const project = useAuthStore.getState().projects.find((p) => p.id === projectId)
  const folderId = project?.driveFolderId
  if (!folderId) return { ok: false, error: '請先貼上並儲存雲端硬碟資料夾網址' }

  await driveAssertFolder(accessToken, folderId)
  const email = await driveGetEmail(accessToken)
  let defects = defectsForProject(projectId).filter((d) => d.status !== 'voided')
  if (options?.defectIds?.length) {
    const allow = new Set(options.defectIds)
    defects = defects.filter((d) => allow.has(d.id))
  }

  let uploaded = 0
  let skipped = 0
  const errors: string[] = []
  for (const d of defects) {
    const photos = await photosForDefect(projectId, d)
    if (photos.length === 0) {
      skipped += 1
      continue
    }
    const segments = [
      d.buildingName || '未指定棟別',
      d.floor || '未指定樓層',
      d.unitCode || '未指定戶別',
      d.categoryName || d.area || '未指定大項',
      leafFolderName(projectId, d),
    ]
    try {
      const leaf = await driveEnsureFolderPath(accessToken, folderId, segments)
      for (const photo of photos) {
        const wrote = await driveUploadDataUrl(accessToken, leaf, photo.name, photo.url)
        if (wrote) uploaded += 1
        else skipped += 1
      }
    } catch (err) {
      errors.push(`${segments.join('/')}: ${describeDriveError(err)}`)
    }
  }

  markDriveOwnerConnected(projectId, email)
  return {
    ok: true,
    result: {
      ok: true,
      projectId,
      uploaded,
      skipped,
      scanned: defects.length,
      errors,
      clientEmail: email,
      folderLayout: '棟別 / 樓層 / 戶別 / 大項 / #編號 小項名稱 備註',
    },
  }
}

async function withBrowserDriveToken(
  preferSilent: boolean,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!getGoogleOAuthClientId()) {
    return {
      ok: false,
      error:
        '尚未設定 Google OAuth 用戶端。請到 GCP 建立「網頁應用程式」用戶端，並把用戶端 ID 設成 VITE_GOOGLE_OAUTH_CLIENT_ID 後重新部署。',
    }
  }
  try {
    if (preferSilent) {
      const silent = await requestGoogleDriveAccessTokenSilent()
      if (silent) return { ok: true, token: silent }
    }
    return { ok: true, token: await requestGoogleDriveAccessToken() }
  } catch (err) {
    return { ok: false, error: describeDriveError(err) }
  }
}

/** 後台：綁定專案雲端硬碟擁有者（彈一次 Google，驗證資料夾可寫入） */
export async function connectProjectDriveOwner(
  projectId: string,
): Promise<{ ok: boolean; result?: DriveOwnerConnectResult; error?: string }> {
  if (!isFirebaseConfigured()) {
    return { ok: false, error: FIREBASE_DRIVE_UNAVAILABLE }
  }
  if (!getGoogleOAuthClientId()) {
    return {
      ok: false,
      error:
        '尚未設定 Google OAuth 用戶端。請到 GCP 建立「網頁應用程式」用戶端，並把用戶端 ID 設成 VITE_GOOGLE_OAUTH_CLIENT_ID 後重新部署。',
    }
  }

  try {
    const project = useAuthStore.getState().projects.find((p) => p.id === projectId)
    const folderId = project?.driveFolderId
    if (!folderId) return { ok: false, error: '請先貼上並儲存雲端硬碟資料夾網址' }

    const accessToken = await requestGoogleDriveAccessToken()
    await driveAssertFolder(accessToken, folderId)
    const email = await driveGetEmail(accessToken)
    markDriveOwnerConnected(projectId, email)
    return {
      ok: true,
      result: {
        ok: true,
        projectId,
        email,
        browserDirect: true,
      },
    }
  } catch (err) {
    return { ok: false, error: describeDriveError(err) }
  }
}

/** 後台：解除擁有者綁定 */
export async function disconnectProjectDriveOwner(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready
  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<{ projectId: string }, { ok: boolean }>(
      functions,
      'disconnectProjectDriveOwner',
    )
    await callable({ projectId })
  } catch (err) {
    if (!noteFunctionsUnavailable(err)) {
      return { ok: false, error: describeDriveError(err) }
    }
  }
  const project = useAuthStore.getState().projects.find((p) => p.id === projectId)
  if (project) {
    useAuthStore.getState().upsertProject({
      ...project,
      driveOwnerConnected: false,
      driveOwnerEmail: undefined,
    })
  }
  return { ok: true }
}

/**
 * 現場／後台同步：後端用「已綁定擁有者」寫入雲端硬碟，不彈 Google。
 * 雲端函數未部署時，改用瀏覽器已授權的 Google 帳號直連上傳。
 */
export async function syncProjectPhotosToDrive(
  projectId: string,
  options?: string[] | DriveSyncOptions,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const opts: DriveSyncOptions = Array.isArray(options)
    ? { defectIds: options }
    : options ?? {}
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  await pushLocalVoidedDefects(projectId)

  if (!functionsKnownDown) {
    try {
      const functions = getFunctions(ready.app, 'asia-east1')
      const callable = httpsCallable<
        { projectId: string; defectIds?: string[]; force?: boolean },
        DriveSyncResult
      >(functions, 'syncProjectPhotosToDrive', { timeout: 540_000 })
      const res = await callable({
        projectId,
        ...(opts.defectIds && opts.defectIds.length ? { defectIds: opts.defectIds } : {}),
        ...(opts.force ? { force: true } : {}),
      })
      return { ok: true, result: res.data }
    } catch (err) {
      if (!noteFunctionsUnavailable(err)) {
        return { ok: false, error: describeDriveError(err) }
      }
    }
  }
  const token = await withBrowserDriveToken(false)
  if (!token.ok) return token
  return syncPhotosFromBrowser(projectId, token.token, opts)
}

async function callUserDriveSync(
  projectId: string,
  accessToken: string,
  options?: DriveSyncOptions,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  if (!functionsKnownDown) {
    try {
      const functions = getFunctions(ready.app, 'asia-east1')
      const callable = httpsCallable<
        { projectId: string; accessToken: string; defectIds?: string[]; force?: boolean },
        DriveSyncResult
      >(functions, 'syncProjectPhotosToDriveAsUser', { timeout: 540_000 })
      const res = await callable({
        projectId,
        accessToken,
        ...(options?.defectIds && options.defectIds.length
          ? { defectIds: options.defectIds }
          : {}),
        ...(options?.force ? { force: true } : {}),
      })
      return { ok: true, result: res.data }
    } catch (err) {
      if (!noteFunctionsUnavailable(err)) {
        return { ok: false, error: describeDriveError(err) }
      }
    }
  }
  return syncPhotosFromBrowser(projectId, accessToken, options)
}

/**
 * 後台備援：當場用管理者自己的 Google 帳號同步（不寫入長期擁有者）。
 * 一般請改用「綁定雲端硬碟擁有者」+「同步到雲端硬碟」。
 */
export async function syncProjectPhotosToDriveAsUser(
  projectId: string,
  options?: DriveSyncOptions,
): Promise<{ ok: boolean; result?: DriveSyncResult; error?: string }> {
  if (!getGoogleOAuthClientId()) {
    return {
      ok: false,
      error:
        '尚未設定 Google OAuth 用戶端。請到 GCP 建立「網頁應用程式」用戶端，並把用戶端 ID 設成 VITE_GOOGLE_OAUTH_CLIENT_ID 後重新部署。',
    }
  }

  try {
    await pushLocalVoidedDefects(projectId)
    const accessToken = await requestGoogleDriveAccessToken()
    return await callUserDriveSync(projectId, accessToken, { force: true, ...options })
  } catch (err) {
    return { ok: false, error: describeDriveError(err) }
  }
}

export type DriveReconcileResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  action?: 'trashed' | 'synced' | 'skipped'
  renamed?: boolean
  moved?: boolean
  uploaded?: number
  removed?: number
  folderId?: string | null
}

/**
 * 單筆缺失即時對齊雲端硬碟（新增／編輯／刪除後用）。
 * 不依前端 driveOwnerConnected 旗標擋下——改由後端判斷，避免本機快取過舊而略過自動同步。
 */
export async function reconcileDefectOnDrive(params: {
  projectId: string
  defectId: string
}): Promise<{ ok: boolean; result?: DriveReconcileResult; error?: string }> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) {
    return { ok: true, result: { ok: true, skipped: true, reason: 'no-drive-folder' } }
  }

  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  if (!functionsKnownDown) {
    try {
      const functions = getFunctions(ready.app, 'asia-east1')
      const callable = httpsCallable<
        { projectId: string; defectId: string },
        DriveReconcileResult
      >(functions, 'reconcileDefectOnDrive', { timeout: 180_000 })
      const res = await callable({
        projectId: params.projectId,
        defectId: params.defectId,
      })
      return { ok: true, result: res.data }
    } catch (err) {
      if (!noteFunctionsUnavailable(err)) {
        return { ok: false, error: describeDriveError(err) }
      }
    }
  }
  const token = await withBrowserDriveToken(true)
  if (!token.ok) {
    return { ok: true, result: { ok: true, skipped: true, reason: 'no-browser-token' } }
  }
  const synced = await syncPhotosFromBrowser(params.projectId, token.token, {
    defectIds: [params.defectId],
  })
  if (!synced.ok) return { ok: true, result: { ok: true, skipped: true, reason: synced.error } }
  return {
    ok: true,
    result: {
      ok: true,
      action: 'synced',
      uploaded: synced.result?.uploaded ?? 0,
    },
  }
}

/**
 * 拍照上傳／編輯後背景自動同步。
 * 後端已綁定擁有者時會對齊該筆缺失資料夾；未綁定則略過。
 */
export async function autoSyncDefectPhotosToDrive(params: {
  projectId: string
  defectId: string
}): Promise<void> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) return

  const res = await reconcileDefectOnDrive(params)
  if (!res.ok) {
    console.warn('[drive-auto] 即時對齊失敗', res.error)
    return
  }
  if (res.result?.skipped) {
    console.info('[drive-auto] 略過', res.result.reason)
  }
}

const quietBackfillDone = new Set<string>()

/**
 * 開啟專案後背景補齊雲端硬碟。
 * 已停用自動觸發（改每日批次），保留函式供日後手動／除錯呼叫。
 */
export async function quietBackfillProjectDrive(projectId: string): Promise<void> {
  if (!projectId || quietBackfillDone.has(projectId)) return
  const project = useAuthStore.getState().projects.find((p) => p.id === projectId)
  if (!project?.driveFolderId) return
  // 費用控管：不再於開啟專案時自動全案掃描
  quietBackfillDone.add(projectId)
  console.info('[drive-auto] 開專案背景補齊已停用（改每日批次／手動同步）')
}

export type DriveDeleteResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  trashedFolder?: boolean
  trashedFiles?: number
}

/**
 * 刪除缺失後，同步把雲端硬碟對應資料夾移到垃圾桶。
 * 不依前端 driveOwnerConnected 旗標擋下——改由後端判斷。
 */
export async function deleteDefectPhotosFromDrive(params: {
  projectId: string
  defectId: string
}): Promise<{ ok: boolean; result?: DriveDeleteResult; error?: string }> {
  const project = useAuthStore.getState().projects.find((p) => p.id === params.projectId)
  if (!project?.driveFolderId) {
    return { ok: true, result: { ok: true, skipped: true, reason: 'no-drive-folder' } }
  }

  const ready = await ensureFirebaseUser()
  if (!ready.ok) return ready

  try {
    const functions = getFunctions(ready.app, 'asia-east1')
    const callable = httpsCallable<
      { projectId: string; defectId: string; accessToken?: string },
      DriveDeleteResult
    >(functions, 'deleteDefectPhotosFromDriveAsUser', { timeout: 120_000 })

    // 優先走擁有者 token（後端）；失敗再退回現場授權
    try {
      const res = await callable({
        projectId: params.projectId,
        defectId: params.defectId,
      })
      return { ok: true, result: res.data }
    } catch (ownerErr) {
      if (!isFunctionsUnavailable(ownerErr) && getGoogleOAuthClientId()) {
        const token = await requestGoogleDriveAccessTokenSilent()
        if (token) {
          try {
            const res = await callable({
              projectId: params.projectId,
              defectId: params.defectId,
              accessToken: token,
            })
            return { ok: true, result: res.data }
          } catch {
            /* fall through to browser trash */
          }
        }
      }
      const token = await requestGoogleDriveAccessTokenSilent()
      if (!token || !project.driveFolderId) {
        return { ok: true, result: { ok: true, skipped: true, reason: 'no-browser-token' } }
      }
      const defect = defectsForProject(params.projectId).find((d) => d.id === params.defectId)
      if (!defect) {
        return { ok: true, result: { ok: true, skipped: true, reason: 'no-defect' } }
      }
      const leafId = await driveFindFolderPath(token, project.driveFolderId, [
        defect.buildingName || '未指定棟別',
        defect.floor || '未指定樓層',
        defect.unitCode || '未指定戶別',
        defect.categoryName || defect.area || '未指定大項',
        leafFolderName(params.projectId, defect),
      ])
      if (!leafId) {
        return { ok: true, result: { ok: true, skipped: true, reason: 'folder-not-found' } }
      }
      await driveTrashFolder(token, leafId)
      return { ok: true, result: { ok: true, trashedFolder: true } }
    }
  } catch (err) {
    if (isFunctionsUnavailable(err)) {
      return { ok: true, result: { ok: true, skipped: true, reason: 'functions-unavailable' } }
    }
    return { ok: false, error: describeDriveError(err) }
  }
}
