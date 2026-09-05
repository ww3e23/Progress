import { deleteChat, getChat, getFeatures, listChatStates, parseFeatures, putChat, putFeatures, registerChat } from './chats'
import { formatDayShift, formatNightDuty } from './duty'
import { searchImages } from './imageSearch'
import { searchInfo } from './infoSearch'
import { fetchChatTitle, pushText } from './line'
import { isReminderType, REMINDERS } from './reminders'
import { allowsAdminPush, adminPushBlockedMessage } from './pushGuard'
import { taipeiParts } from './time'
import { formatWeather } from './weather'
import type { ChatRecord, ChatType, Env, ReminderType } from './types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json;charset=UTF-8' },
  })
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}

export function requireAdmin(request: Request, env: Env): boolean {
  const expected = env.ADMIN_TOKEN
  if (!expected) return true
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  const headerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return queryToken === expected || headerToken === expected
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = (await request.json()) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function asChatType(value: unknown): ChatType {
  if (value === 'group' || value === 'room' || value === 'user') return value
  if (typeof value === 'string' && value.startsWith('C')) return 'group'
  if (typeof value === 'string' && value.startsWith('R')) return 'room'
  return 'user'
}

export async function handleAdminApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/api/admin/state' && request.method === 'GET') {
    const chats = await listChatStates(env, true)
    for (const state of chats) {
      if (!state.chat.name) {
        const title = await fetchChatTitle(env, state.chat)
        if (title) {
          state.chat.name = title
          state.chat.nameFetchedAt = Date.now()
          await putChat(env, state.chat)
        }
      }
    }
    return jsonResponse({
      chats,
      removedPrivate: 0,
      adminProtected: Boolean(env.ADMIN_TOKEN),
    })
  }

  if (path === '/api/admin/save' && request.method === 'POST') {
    const body = await readJson(request)
    const chatInput = body.chat as Partial<ChatRecord> | undefined
    const id = typeof chatInput?.id === 'string' ? chatInput.id.trim() : ''
    if (!id) return errorResponse('缺少群組 id')
    const existing = (await getChat(env, id)) || {
      id,
      type: asChatType(chatInput?.type || id),
      name: '',
      note: '',
      lastSeenAt: Date.now(),
    }
    existing.note = typeof chatInput?.note === 'string' ? chatInput.note.trim() : existing.note
    if (typeof chatInput?.name === 'string' && chatInput.name.trim()) existing.name = chatInput.name.trim()
    if (chatInput?.type) existing.type = asChatType(chatInput.type)
    await putChat(env, existing)
    const features = parseFeatures(JSON.stringify(body.features || {}))
    const saved = await putFeatures(env, id, features)
    return jsonResponse({ chat: existing, features: saved })
  }

  if (path === '/api/admin/register' && request.method === 'POST') {
    const body = await readJson(request)
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return errorResponse('請貼上 LINE 群組 ID（通常是 C 開頭）')
    if (id.startsWith('U')) return errorResponse('這是個人帳號，不是群組。後台只管理群組。')
    const type = asChatType(body.type || id)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const chat = await registerChat(env, id, type, name)
    if (!chat.name) {
      const title = await fetchChatTitle(env, chat)
      if (title) {
        chat.name = title
        chat.nameFetchedAt = Date.now()
        await putChat(env, chat)
      }
    }
    return jsonResponse({ chat, features: await getFeatures(env, id) })
  }

  if (path === '/api/admin/refresh-name' && request.method === 'POST') {
    const body = await readJson(request)
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return errorResponse('缺少群組 id')
    const chat = await getChat(env, id)
    if (!chat) return errorResponse('找不到這個聊天', 404)
    const title = await fetchChatTitle(env, chat)
    if (title) {
      chat.name = title
      chat.nameFetchedAt = Date.now()
      await putChat(env, chat)
    }
    return jsonResponse({ chat, name: chat.name })
  }

  if (path === '/api/admin/remove' && request.method === 'POST') {
    const body = await readJson(request)
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return errorResponse('缺少群組 id')
    if (!env.TRANSLATE_KV) return errorResponse('尚未綁定 TRANSLATE_KV', 500)
    await deleteChat(env, id)
    return jsonResponse({ ok: true, id })
  }

  if (path === '/api/admin/preview' && (request.method === 'GET' || request.method === 'POST')) {
    const body = request.method === 'POST' ? await readJson(request) : {}
    const kind = (request.method === 'POST' ? String(body.kind || '') : url.searchParams.get('kind')) || ''
    const query = String((request.method === 'POST' ? body.q || body.query : null) ?? url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim()
    const place = String((request.method === 'POST' ? body.place : null) ?? url.searchParams.get('place') ?? '台北').trim()
    const chatId = String((request.method === 'POST' ? body.chatId : null) ?? url.searchParams.get('chatId') ?? '').trim()
    const features = body.features
      ? parseFeatures(JSON.stringify(body.features))
      : chatId
        ? await getFeatures(env, chatId)
        : parseFeatures(null)
    if (kind === 'weather') {
      return jsonResponse({ kind, preview: await formatWeather(place || features.weatherPlace, features.weatherLink) })
    }
    if (kind === 'duty' || kind === 'nightDuty') {
      return jsonResponse({ kind, preview: formatNightDuty(features.nightDuty, taipeiParts().ymd) })
    }
    if (kind === 'dayShift') {
      return jsonResponse({ kind, preview: formatDayShift(features.dayShift, taipeiParts().ymd) })
    }
    if (kind === 'image') {
      const images = await searchImages(query || '安全帽')
      return jsonResponse({
        kind,
        query: query || '安全帽',
        images,
        preview: images.map((image) => `${image.title}\n${image.url}`).join('\n\n'),
      })
    }
    if (kind === 'info') {
      const preview = await searchInfo(env, query || '安全帽')
      return jsonResponse({ kind, query: query || '安全帽', preview })
    }
    if (isReminderType(kind)) {
      return jsonResponse({ kind, preview: REMINDERS[kind as ReminderType].text })
    }
    return errorResponse('未知預覽類型，請用 kind=weather|nightDuty|dayShift|image|info|heat|height|rain')
  }

  if (path === '/api/admin/send' && request.method === 'POST') {
    const body = await readJson(request)
    const id = typeof body.chatId === 'string' ? body.chatId.trim() : ''
    const kind = typeof body.kind === 'string' ? body.kind : ''
    const previewOnly = body.preview === true || body.preview === '1'
    if (!id && !previewOnly) return errorResponse('缺少群組 id')
    const features = id ? await getFeatures(env, id, { volatile: true }) : parseFeatures(null)
    let text = ''
    if (kind === 'weather') {
      text = await formatWeather(features.weatherPlace, features.weatherLink)
    } else if (kind === 'duty' || kind === 'nightDuty') {
      text = formatNightDuty(features.nightDuty, taipeiParts().ymd)
    } else if (kind === 'dayShift') {
      text = formatDayShift(features.dayShift, taipeiParts().ymd)
    } else if (isReminderType(kind)) {
      text = REMINDERS[kind as ReminderType].text
    } else {
      return errorResponse('未知發送類型')
    }
    if (!previewOnly) {
      if (!allowsAdminPush(features, kind)) {
        return errorResponse(adminPushBlockedMessage(kind), 403)
      }
      await pushText(env, id, text)
    }
    return jsonResponse({ ok: true, preview: text, sent: !previewOnly })
  }

  return errorResponse('找不到這個 API', 404)
}

export { jsonResponse, errorResponse }
