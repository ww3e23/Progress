import type { Env } from './types'

const VOL_PREFIX = 'featvol:'
const BUCKET_MS = 5_000
const VOL_TTL_SEC = 180

interface FeatureStoreState {
  storage: {
    get<T>(key: string): Promise<T | undefined>
    put(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
  }
}

/** Strongly consistent per-chat feature store. KV remains the backup copy. */
export class FeatureStore {
  private readonly ctx: FeatureStoreState

  constructor(ctx: FeatureStoreState) {
    this.ctx = ctx
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'PUT') {
      const body = await request.text()
      await this.ctx.storage.put('features', body)
      return new Response('ok')
    }
    if (request.method === 'DELETE') {
      await this.ctx.storage.delete('features')
      return new Response('ok')
    }
    const value = await this.ctx.storage.get<string>('features')
    if (!value) return new Response('', { status: 404 })
    return new Response(value)
  }
}

export function parseUpdatedAt(raw: string | null): number {
  if (!raw) return 0
  try {
    const value = Number((JSON.parse(raw) as { updatedAt?: unknown }).updatedAt)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

export function pickNewestRaw(raws: Array<string | null | undefined>): string | null {
  let best: string | null = null
  let bestAt = -1
  for (const raw of raws) {
    if (!raw) continue
    const at = parseUpdatedAt(raw)
    if (best === null || at > bestAt) {
      best = raw
      bestAt = at
    }
  }
  return best
}

export function featureVolKeys(id: string, now = Date.now()): { write: string[]; read: string[] } {
  const bucket = Math.floor(now / BUCKET_MS)
  return {
    write: [0, 1, 2, 3, 4, 5].map((offset) => `${VOL_PREFIX}${id}:${bucket + offset}`),
    read: [2, 3].map((offset) => `${VOL_PREFIX}${id}:${bucket + offset}`),
  }
}

function featureStub(env: Env, id: string) {
  if (!env.FEATURE_STORE) return null
  return env.FEATURE_STORE.get(env.FEATURE_STORE.idFromName(id))
}

export async function readFeatureStore(env: Env, id: string): Promise<string | null> {
  const stub = featureStub(env, id)
  if (!stub) return null
  try {
    const res = await stub.fetch('https://feature-store/features')
    if (!res.ok) return null
    const text = await res.text()
    return text.trim() ? text : null
  } catch (error) {
    console.error('feature store get failed', id, error)
    return null
  }
}

export async function writeFeatureStore(env: Env, id: string, raw: string): Promise<void> {
  const stub = featureStub(env, id)
  if (!stub) return
  try {
    const res = await stub.fetch('https://feature-store/features', { method: 'PUT', body: raw })
    if (!res.ok) console.error('feature store put status', id, res.status)
  } catch (error) {
    console.error('feature store put failed', id, error)
  }
}

export async function clearFeatureStore(env: Env, id: string): Promise<void> {
  const stub = featureStub(env, id)
  if (!stub) return
  try {
    await stub.fetch('https://feature-store/features', { method: 'DELETE' })
  } catch (error) {
    console.error('feature store delete failed', id, error)
  }
}

export async function writeFeatureVolatile(env: Env, id: string, raw: string, now = Date.now()): Promise<void> {
  if (!env.TRANSLATE_KV) return
  const { write } = featureVolKeys(id, now)
  await Promise.all(write.map((key) => env.TRANSLATE_KV!.put(key, raw, { expirationTtl: VOL_TTL_SEC })))
}

export async function readFeatureVolatile(env: Env, id: string, now = Date.now()): Promise<string | null> {
  if (!env.TRANSLATE_KV) return null
  const { read } = featureVolKeys(id, now)
  const raws = await Promise.all(read.map((key) => env.TRANSLATE_KV!.get(key, { cacheTtl: 30 })))
  return pickNewestRaw(raws)
}
