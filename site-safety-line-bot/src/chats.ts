import { DEFAULT_DAY_SHIFT, DEFAULT_NIGHT_DUTY, parseRoster } from './duty.ts'
import { clampHour, clampMinute } from './time.ts'
import { chatIdFromSource, LANGS } from './translate.ts'
import { parseWeatherLink } from './weather.ts'
import type { ChatFeatures, ChatRecord, ChatState, ChatType, Env } from './types'

const CHAT_PREFIX = 'chat:'
const FEAT_PREFIX = 'feat:'
const LANG_PREFIX = 'lang:'
const INDEX_KEY = 'index:chats'

export const DEFAULT_FEATURES: ChatFeatures = {
  translate: false,
  translateLang: '',
  imageSearch: false,
  infoSearch: false,
  weather: false,
  weatherPlace: '台北',
  weatherHour: 7,
  weatherMinute: 0,
  weatherLink: '',
  nightDuty: { ...DEFAULT_NIGHT_DUTY, days: {} },
  dayShift: { ...DEFAULT_DAY_SHIFT, days: {} },
  safety: false,
}

function chatKey(id: string): string {
  return `${CHAT_PREFIX}${id}`
}

function featKey(id: string): string {
  return `${FEAT_PREFIX}${id}`
}

export function isGroupLike(chat: { id: string; type?: string }): boolean {
  if (chat.type === 'group' || chat.type === 'room') return true
  if (chat.type === 'user') return false
  return chat.id.startsWith('C') || chat.id.startsWith('R')
}

export function chatTypeFromSource(
  source: { type?: string } | undefined,
): ChatType {
  if (source?.type === 'group') return 'group'
  if (source?.type === 'room') return 'room'
  return 'user'
}

export function parseFeatures(raw: string | null): ChatFeatures {
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      parsed = {}
    }
  }
  const lang = typeof parsed.translateLang === 'string' ? parsed.translateLang : ''
  const known = LANGS.some((item) => item.code === lang)
  const nightDuty = parseRoster(parsed.nightDuty, DEFAULT_NIGHT_DUTY)
  const dayShift = parseRoster(parsed.dayShift, DEFAULT_DAY_SHIFT)
  if (!parsed.nightDuty && 'duty' in parsed) {
    nightDuty.enabled = Boolean(parsed.duty)
    nightDuty.hour = clampHour(parsed.dutyHour, DEFAULT_NIGHT_DUTY.hour)
  }
  return {
    translate: Boolean(parsed.translate),
    translateLang: known ? lang : '',
    imageSearch: Boolean(parsed.imageSearch),
    infoSearch: Boolean(parsed.infoSearch),
    weather: Boolean(parsed.weather),
    weatherPlace: (typeof parsed.weatherPlace === 'string' ? parsed.weatherPlace : DEFAULT_FEATURES.weatherPlace).trim() || DEFAULT_FEATURES.weatherPlace,
    weatherHour: clampHour(parsed.weatherHour, DEFAULT_FEATURES.weatherHour),
    weatherMinute: clampMinute(parsed.weatherMinute, DEFAULT_FEATURES.weatherMinute),
    weatherLink: parseWeatherLink(parsed.weatherLink),
    nightDuty,
    dayShift,
    safety: Boolean(parsed.safety),
  }
}

function parseChat(raw: string | null, fallbackId: string): ChatRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ChatRecord>
    if (!parsed.id) return null
    const type: ChatType = parsed.type === 'group' || parsed.type === 'room' ? parsed.type : 'user'
    return {
      id: parsed.id,
      type,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      note: typeof parsed.note === 'string' ? parsed.note : '',
      lastSeenAt: typeof parsed.lastSeenAt === 'number' ? parsed.lastSeenAt : Date.now(),
      nameFetchedAt: typeof parsed.nameFetchedAt === 'number' ? parsed.nameFetchedAt : undefined,
    }
  } catch {
    return {
      id: fallbackId,
      type: fallbackId.startsWith('C') ? 'group' : fallbackId.startsWith('R') ? 'room' : 'user',
      name: '',
      note: '',
      lastSeenAt: Date.now(),
    }
  }
}

export function displayChatName(chat: ChatRecord): string {
  return chat.note.trim() || chat.name.trim() || chat.id
}

export function parseChatIndex(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { ids?: unknown } | unknown
    const ids = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? (parsed as { ids?: unknown }).ids
        : []
    if (!Array.isArray(ids)) return []
    return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
  } catch {
    return []
  }
}

async function readChatIndex(env: Env): Promise<string[]> {
  if (!env.TRANSLATE_KV) return []
  return parseChatIndex(await env.TRANSLATE_KV.get(INDEX_KEY))
}

async function writeChatIndex(env: Env, ids: string[]): Promise<void> {
  if (!env.TRANSLATE_KV) return
  await env.TRANSLATE_KV.put(INDEX_KEY, JSON.stringify({ ids, updatedAt: Date.now() }))
}

async function rememberChatId(env: Env, id: string): Promise<void> {
  const trimmed = id.trim()
  if (!trimmed || trimmed.startsWith('U')) return
  const ids = await readChatIndex(env)
  if (ids.includes(trimmed)) return
  ids.push(trimmed)
  await writeChatIndex(env, ids)
}

async function forgetChatId(env: Env, id: string): Promise<void> {
  const trimmed = id.trim()
  if (!trimmed) return
  const ids = await readChatIndex(env)
  const next = ids.filter((item) => item !== trimmed)
  if (next.length === ids.length) return
  await writeChatIndex(env, next)
}

export async function getChat(env: Env, id: string): Promise<ChatRecord | null> {
  if (!env.TRANSLATE_KV) return null
  return parseChat(await env.TRANSLATE_KV.get(chatKey(id)), id)
}

export async function putChat(env: Env, chat: ChatRecord): Promise<void> {
  if (!env.TRANSLATE_KV) throw new Error('尚未綁定 TRANSLATE_KV')
  await env.TRANSLATE_KV.put(chatKey(chat.id), JSON.stringify(chat))
  if (isGroupLike(chat)) await rememberChatId(env, chat.id)
}

export async function getFeatures(env: Env, id: string): Promise<ChatFeatures> {
  const features = parseFeatures(env.TRANSLATE_KV ? await env.TRANSLATE_KV.get(featKey(id)) : null)
  if (!features.translateLang && env.TRANSLATE_KV) {
    const lang = await env.TRANSLATE_KV.get(`${LANG_PREFIX}${id}`)
    if (lang && LANGS.some((item) => item.code === lang)) {
      features.translateLang = lang
      if (!features.translate) features.translate = true
    }
  }
  return features
}

export async function putFeatures(env: Env, id: string, features: ChatFeatures): Promise<void> {
  if (!env.TRANSLATE_KV) throw new Error('尚未綁定 TRANSLATE_KV')
  const clean = parseFeatures(JSON.stringify(features))
  await env.TRANSLATE_KV.put(featKey(id), JSON.stringify(clean))
  if (clean.translate && clean.translateLang) {
    await env.TRANSLATE_KV.put(`${LANG_PREFIX}${id}`, clean.translateLang)
  } else {
    await env.TRANSLATE_KV.delete(`${LANG_PREFIX}${id}`)
  }
  await rememberChatId(env, id)
}

export async function deleteChat(env: Env, id: string): Promise<void> {
  if (!env.TRANSLATE_KV) throw new Error('尚未綁定 TRANSLATE_KV')
  await env.TRANSLATE_KV.delete(chatKey(id))
  await env.TRANSLATE_KV.delete(featKey(id))
  await env.TRANSLATE_KV.delete(`${LANG_PREFIX}${id}`)
  await forgetChatId(env, id)
}

export async function listChatStates(env: Env, groupsOnly = true): Promise<ChatState[]> {
  if (!env.TRANSLATE_KV) return []
  const ids = await readChatIndex(env)
  const states: ChatState[] = []
  for (const id of ids) {
    if (!id) continue
    const existing = await getChat(env, id)
    const chat = existing || {
      id,
      type: id.startsWith('C') ? 'group' : id.startsWith('R') ? 'room' : 'user',
      name: '',
      note: '',
      lastSeenAt: 0,
    }
    if (groupsOnly && !isGroupLike(chat)) continue
    states.push({ chat, features: await getFeatures(env, id) })
  }
  states.sort((a, b) => (b.chat.lastSeenAt || 0) - (a.chat.lastSeenAt || 0))
  return states
}

export async function purgePrivateChats(env: Env): Promise<number> {
  if (!env.TRANSLATE_KV) return 0
  const all = await listChatStates(env, false)
  let removed = 0
  for (const { chat } of all) {
    if (isGroupLike(chat)) continue
    await deleteChat(env, chat.id)
    removed += 1
  }
  return removed
}

export async function touchChat(
  env: Env,
  source: { type?: string; groupId?: string; roomId?: string; userId?: string } | undefined,
  fetchName: (chat: ChatRecord) => Promise<string | null>,
): Promise<ChatRecord | null> {
  const id = chatIdFromSource(source)
  if (!id || !env.TRANSLATE_KV) return null
  if (chatTypeFromSource(source) === 'user') return null
  const now = Date.now()
  const existing = await getChat(env, id)
  const chat: ChatRecord = existing || {
    id,
    type: chatTypeFromSource(source),
    name: '',
    note: '',
    lastSeenAt: now,
  }
  chat.type = chatTypeFromSource(source)
  chat.lastSeenAt = now
  const stale = !chat.name || !chat.nameFetchedAt || now - chat.nameFetchedAt > 7 * 24 * 60 * 60 * 1000
  if (stale) {
    const name = await fetchName(chat)
    if (name) {
      chat.name = name
      chat.nameFetchedAt = now
    } else if (!chat.name) {
      chat.name = chat.type === 'group' ? '未命名群組' : chat.type === 'room' ? '未命名聊天室' : '1:1 聊天'
    }
  }
  await putChat(env, chat)
  return chat
}

export async function registerChat(env: Env, id: string, type: ChatType, name = ''): Promise<ChatRecord> {
  const existing = await getChat(env, id)
  const chat: ChatRecord = existing || {
    id: id.trim(),
    type,
    name: name.trim(),
    note: '',
    lastSeenAt: Date.now(),
  }
  if (name.trim()) chat.name = name.trim()
  chat.type = type
  await putChat(env, chat)
  return chat
}

export function enabledFeatureLabels(features: ChatFeatures): string[] {
  const labels: string[] = []
  if (features.translate) {
    const lang = LANGS.find((item) => item.code === features.translateLang)?.label
    labels.push(lang ? `即時翻譯（${lang}）` : '即時翻譯')
  }
  if (features.imageSearch) labels.push('搜尋圖片')
  if (features.infoSearch) labels.push('搜尋資料')
  if (features.weather) {
    const hh = String(features.weatherHour).padStart(2, '0')
    const mm = String(features.weatherMinute).padStart(2, '0')
    labels.push(`氣象播報（${features.weatherPlace} ${hh}:${mm}）`)
  }
  if (features.nightDuty.enabled) {
    const hh = String(features.nightDuty.hour).padStart(2, '0')
    const mm = String(features.nightDuty.minute).padStart(2, '0')
    labels.push(`夜間值班（${hh}:${mm}）`)
  }
  if (features.dayShift.enabled) {
    const hh = String(features.dayShift.hour).padStart(2, '0')
    const mm = String(features.dayShift.minute).padStart(2, '0')
    labels.push(`日間上班（${hh}:${mm}）`)
  }
  if (features.safety) labels.push('工安提醒')
  return labels
}
