import type { Env, LineImageMessage, LineMessage, LineTextMessage, LineWebhookBody } from './types'

const LINE_API = 'https://api.line.me/v2/bot/message'
const LINE_BOT = 'https://api.line.me/v2/bot'

export function parseTargetIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export async function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string | undefined,
): Promise<boolean> {
  if (!channelSecret || !signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return timingSafeEqual(expected, signature)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export function parseWebhookBody(raw: string): LineWebhookBody {
  try {
    const parsed = JSON.parse(raw) as LineWebhookBody
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function hasLineToken(env: Env): boolean {
  return Boolean(env.LINE_CHANNEL_ACCESS_TOKEN)
}

function authHeaders(env: Env): HeadersInit {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN')
  return { Authorization: `Bearer ${token}` }
}

async function linePost(env: Env, path: string, body: unknown): Promise<Response> {
  return fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(env),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function lineGetJson(env: Env, path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${LINE_BOT}${path}`, { headers: authHeaders(env) })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch (error) {
    console.error('line get failed', path, error)
    return null
  }
}

export async function fetchChatTitle(env: Env, chat: { id: string; type: string }): Promise<string | null> {
  if (!hasLineToken(env)) return null
  if (chat.type === 'group') {
    const data = await lineGetJson(env, `/group/${encodeURIComponent(chat.id)}/summary`)
    return typeof data?.groupName === 'string' ? data.groupName : null
  }
  if (chat.type === 'room') {
    const data = await lineGetJson(env, `/room/${encodeURIComponent(chat.id)}/summary`)
    return typeof data?.roomName === 'string' ? data.roomName : null
  }
  const data = await lineGetJson(env, `/profile/${encodeURIComponent(chat.id)}`)
  return typeof data?.displayName === 'string' ? data.displayName : null
}

export async function replyMessages(env: Env, replyToken: string, messages: LineMessage[]): Promise<void> {
  const res = await linePost(env, '/reply', { replyToken, messages })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`LINE reply 失敗 (${res.status}): ${detail}`)
  }
}

export async function pushMessages(env: Env, to: string, messages: LineMessage[]): Promise<void> {
  const res = await linePost(env, '/push', { to, messages })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`LINE push 失敗 (${res.status}): ${detail}`)
  }
}

export async function replyText(env: Env, replyToken: string, text: string): Promise<void> {
  const messages: LineTextMessage[] = [{ type: 'text', text }]
  await replyMessages(env, replyToken, messages)
}

export async function pushText(env: Env, to: string, text: string): Promise<void> {
  const messages: LineTextMessage[] = [{ type: 'text', text }]
  await pushMessages(env, to, messages)
}

export async function deliverMessages(
  env: Env,
  event: { replyToken?: string; source?: { userId?: string; groupId?: string; roomId?: string } },
  messages: LineMessage[],
): Promise<void> {
  if (event.replyToken) {
    try {
      await replyMessages(env, event.replyToken, messages)
      return
    } catch (error) {
      console.error('reply failed, fallback push', error)
    }
  }
  const to = event.source?.groupId || event.source?.roomId || event.source?.userId
  if (!to) throw new Error('沒有可推播的聊天對象')
  await pushMessages(env, to, messages)
}

export async function deliverText(
  env: Env,
  event: { replyToken?: string; source?: { userId?: string; groupId?: string; roomId?: string } },
  text: string,
): Promise<void> {
  await deliverMessages(env, event, [{ type: 'text', text }])
}

export function imageMessage(url: string, preview?: string): LineImageMessage {
  return {
    type: 'image',
    originalContentUrl: url,
    previewImageUrl: preview || url,
  }
}

export async function sendReminderMessages(env: Env, text: string): Promise<string> {
  const messages: LineTextMessage[] = [{ type: 'text', text }]
  const targets = parseTargetIds(env.LINE_TO_IDS)

  if (targets.length > 0) {
    const results = await Promise.all(
      targets.map(async (to) => {
        const res = await linePost(env, '/push', { to, messages })
        if (!res.ok) {
          const detail = await res.text()
          return `${to}: ${res.status} ${detail}`
        }
        return `${to}: ok`
      }),
    )
    return `已推播 ${targets.length} 個對象\n${results.join('\n')}`
  }

  const res = await linePost(env, '/broadcast', { messages })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`LINE broadcast 失敗 (${res.status}): ${detail}`)
  }
  return '已 broadcast 給所有好友'
}
