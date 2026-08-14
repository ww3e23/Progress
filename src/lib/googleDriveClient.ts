/** 瀏覽器直連 Google Drive API（雲端函數未部署時的後備） */

const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })
}

function sanitizeDriveName(name: string, fallback = '未命名'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export async function driveGetEmail(accessToken: string): Promise<string | null> {
  const res = await driveFetch(accessToken, 'https://www.googleapis.com/oauth2/v3/userinfo')
  if (!res.ok) return null
  const data = (await res.json()) as { email?: string }
  return data.email?.trim() || null
}

export async function driveAssertFolder(
  accessToken: string,
  folderId: string,
): Promise<{ id: string; name: string }> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`)
  url.searchParams.set('fields', 'id,name,mimeType,trashed')
  url.searchParams.set('supportsAllDrives', 'true')
  const res = await driveFetch(accessToken, url.toString())
  const data = (await res.json()) as {
    error?: { message?: string }
    id?: string
    name?: string
    trashed?: boolean
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `無法讀取雲端硬碟資料夾（${res.status}）`)
  }
  if (!data.id || data.trashed) {
    throw new Error('找不到綁定的雲端硬碟資料夾，請確認網址仍有效')
  }
  return { id: data.id, name: data.name || '資料夾' }
}

export async function driveFindChildFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string | null> {
  const safe = sanitizeDriveName(name)
  const q = `'${parentId}' in parents and name = '${escapeDriveQueryValue(safe)}' and mimeType = '${FOLDER_MIME}' and trashed = false`
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'files(id,name)')
  url.searchParams.set('pageSize', '1')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  const res = await driveFetch(accessToken, url.toString())
  if (!res.ok) return null
  const data = (await res.json()) as { files?: { id: string }[] }
  return data.files?.[0]?.id ?? null
}

export async function driveEnsureFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const safe = sanitizeDriveName(name)
  const existing = await driveFindChildFolder(accessToken, parentId, safe)
  if (existing) return existing
  const res = await driveFetch(accessToken, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: safe,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  })
  const data = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || '無法在雲端硬碟建立資料夾')
  }
  return data.id
}

export async function driveFindFolderPath(
  accessToken: string,
  rootFolderId: string,
  segments: string[],
): Promise<string | null> {
  let current = rootFolderId
  for (const segment of segments) {
    const next = await driveFindChildFolder(accessToken, current, segment)
    if (!next) return null
    current = next
  }
  return current
}

/** 棟別 → 樓層 → 戶別 → 大項 → 葉層 */
export async function driveEnsureFolderPath(
  accessToken: string,
  rootFolderId: string,
  segments: string[],
): Promise<string> {
  let current = rootFolderId
  for (const segment of segments) {
    current = await driveEnsureFolder(accessToken, current, segment)
  }
  return current
}

export async function driveHasFile(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<boolean> {
  const safe = sanitizeDriveName(name)
  const q = `'${parentId}' in parents and name = '${escapeDriveQueryValue(safe)}' and mimeType != '${FOLDER_MIME}' and trashed = false`
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('fields', 'files(id)')
  url.searchParams.set('pageSize', '1')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  const res = await driveFetch(accessToken, url.toString())
  if (!res.ok) return false
  const data = (await res.json()) as { files?: { id: string }[] }
  return Boolean(data.files?.[0]?.id)
}

export async function driveTrashFolder(accessToken: string, folderId: string): Promise<void> {
  const res = await driveFetch(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`無法將資料夾移到垃圾桶（${res.status}）${text.slice(0, 80)}`)
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(meta || '')?.[1] || 'image/jpeg'
  if (!b64 || !dataUrl.startsWith('data:')) {
    throw new Error('不是本機照片')
  }
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function buildMultipartRelated(metadata: object, blob: Blob): { body: Blob; contentType: string } {
  const boundary = `progress_drive_${Date.now().toString(36)}`
  const metaPart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`
  const fileHead = `--${boundary}\r\nContent-Type: ${blob.type || 'image/jpeg'}\r\n\r\n`
  const end = `\r\n--${boundary}--`
  return {
    contentType: `multipart/related; boundary=${boundary}`,
    body: new Blob([metaPart, fileHead, blob, end]),
  }
}

export async function driveUploadBlob(
  accessToken: string,
  folderId: string,
  filename: string,
  blob: Blob,
): Promise<void> {
  const safe = sanitizeDriveName(filename)
  const { body, contentType } = buildMultipartRelated(
    { name: safe, parents: [folderId] },
    blob,
  )
  const res = await driveFetch(
    accessToken,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`上傳 ${safe} 失敗（${res.status}）${text.slice(0, 120)}`)
  }
}

export async function driveUploadDataUrl(
  accessToken: string,
  folderId: string,
  filename: string,
  dataUrl: string,
): Promise<boolean> {
  if (await driveHasFile(accessToken, folderId, filename)) return false
  if (dataUrl.startsWith('data:')) {
    await driveUploadBlob(accessToken, folderId, filename, dataUrlToBlob(dataUrl))
    return true
  }
  const res = await fetch(dataUrl)
  if (!res.ok) throw new Error(`讀取照片失敗：${filename}`)
  await driveUploadBlob(accessToken, folderId, filename, await res.blob())
  return true
}
