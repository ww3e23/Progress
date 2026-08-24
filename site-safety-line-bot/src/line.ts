import type { Env, LineTextMessage, LineWebhookBody } from './types'

const LINE_API = 'https://api.line.me/v2/bot/message'

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

async function linePost(env: Env, path: string, body: unknown): Promise<Response> {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN')
  }
  return fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export async function replyText(env: Env, replyToken: string, text: string): Promise<void> {
  const messages: LineTextMessage[] = [{ type: 'text', text }]
  const res = await linePost(env, '/reply', { replyToken, messages })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`LINE reply 失敗 (${res.status}): ${detail}`)
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
