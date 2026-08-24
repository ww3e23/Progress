import { clampHour } from './time.ts'
import { chatIdFromSource, LANGS } from './translate.ts'
import type { ChatFeatures, ChatRecord, ChatState, ChatType, DutyMode, Env } from './types'

const CHAT_PREFIX = 'chat:'
const FEAT_PREFIX = 'feat:'
const LANG_PREFIX = 'lang:'

export const DEFAULT_FEATURES: ChatFeatures = {
  translate: false,
  translateLang: '',
  imageSearch: false,
  infoSearch: false,
  weather: false,
  weatherPlace: '台北',
  weatherHour: 7,
  duty: false,
  dutyPeople: [],
  dutyHour: 21,
  dutyMode: 'all',
}

function chatKey(id: string): string {
  return `${CHAT_PREFIX}${id}`
}

function featKey(id: string): string {
  return `${FEAT_PREFIX}${id}`
}

export function chatTypeFromSource(
  source: { type?: string } | undefined,
): ChatType {
  if (source?.type === 'group') return 'group'
  if (source?.type === 'room') return 'room'
  return 'user'
}

export function parseFeatures(raw: string | null): ChatFeatures {
  let parsed: Partial<ChatFeatures> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Partial<ChatFeatures>
    } catch {
      parsed = {}
    }
  }
  const people = Array.isArray(parsed.dutyPeople)
    ? parsed.dutyPeople.map((name) => String(name).trim()).filter(Boolean)
    : []
  const lang = typeof parsed.translateLang === 'string' ? parsed.translateLang : ''
  const known = LANGS.some((item) => item.code === lang)
  const mode: DutyMode = parsed.dutyMode === 'rotate' ? 'rotate' : 'all'
  return {
    translate: Boolean(parsed.translate),
    translateLang: known ? lang : '',
    imageSearch: Boolean(parsed.imageSearch),
    infoSearch: Boolean(parsed.infoSearch),
    weather: Boolean(parsed.weather),
    weatherPlace: (parsed.weatherPlace || DEFAULT_FEATURES.weatherPlace).trim() || DEFAULT_FEATURES.weatherPlace,
    weatherHour: clampHour(parsed.weatherHour, DEFAULT_FEATURES.weatherHour),
    duty: Boolean(parsed.duty),
    dutyPeople: people,
    dutyHour: clampHour(parsed.dutyHour, DEFAULT_FEATURES.dutyHour),
    dutyMode: mode,
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

async function listKeys(env: Env, prefix: string): Promise<string[]> {
  if (!env.TRANSLATE_KV?.list) return []
  const names: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.TRANSLATE_KV.list({ prefix, limit: 1000, cursor })
    for (const key of page.keys) names.push(key.name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return names
}

export async function getChat(env: Env, id: string): Promise<ChatRecord | null> {
  if (!env.TRANSLATE_KV) return null
  return parseChat(await env.TRANSLATE_KV.get(chatKey(id)), id)
}

export async function putChat(env: Env, chat: ChatRecord): Promise<void> {
  if (!env.TRANSLATE_KV) throw new Error('尚未綁定 TRANSLATE_KV')
  await env.TRANSLATE_KV.put(chatKey(chat.id), JSON.stringify(chat))
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
}

export async function listChatStates(env: Env): Promise<ChatState[]> {
  if (!env.TRANSLATE_KV) return []
  const chatKeys = await listKeys(env, CHAT_PREFIX)
  const langKeys = await listKeys(env, LANG_PREFIX)
  const featKeys = await listKeys(env, FEAT_PREFIX)
  const ids = new Set<string>()
  for (const key of chatKeys) ids.add(key.slice(CHAT_PREFIX.length))
  for (const key of langKeys) ids.add(key.slice(LANG_PREFIX.length))
  for (const key of featKeys) ids.add(key.slice(FEAT_PREFIX.length))

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
    states.push({ chat, features: await getFeatures(env, id) })
  }
  states.sort((a, b) => (b.chat.lastSeenAt || 0) - (a.chat.lastSeenAt || 0))
  return states
}

export async function touchChat(
  env: Env,
  source: { type?: string; groupId?: string; roomId?: string; userId?: string } | undefined,
  fetchName: (chat: ChatRecord) => Promise<string | null>,
): Promise<ChatRecord | null> {
  const id = chatIdFromSource(source)
  if (!id || !env.TRANSLATE_KV) return null
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
  if (features.weather) labels.push(`氣象播報（${features.weatherPlace} ${features.weatherHour}:00）`)
  if (features.duty) labels.push(`夜間值班（${features.dutyHour}:00）`)
  return labels
}
