import { renderAdminPage } from './admin'
import { parseWebhookBody, replyText, sendReminderMessages, verifyLineSignature } from './line'
import { isReminderType, menuText, reminderFromText, REMINDERS } from './reminders'
import type { Env, ReminderType } from './types'

function textResponse(body: string, status = 200, contentType = 'text/plain;charset=UTF-8'): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  })
}

function unauthorized(): Response {
  return textResponse('未授權：請提供正確的 ADMIN_TOKEN', 401)
}

function requireAdmin(request: Request, env: Env): boolean {
  const expected = env.ADMIN_TOKEN
  if (!expected) return false
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  const headerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return queryToken === expected || headerToken === expected
}

async function handleSend(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const preview = url.searchParams.get('preview') === '1'
  const typeParam = url.searchParams.get('type')

  if (!isReminderType(typeParam)) {
    return textResponse('未知類型，請使用 type=heat|height|rain', 400)
  }

  const reminder = REMINDERS[typeParam as ReminderType]
  if (preview) {
    return textResponse(reminder.text)
  }

  if (!requireAdmin(request, env)) {
    return unauthorized()
  }

  try {
    const result = await sendReminderMessages(env, reminder.text)
    return textResponse(`提醒已發送（${reminder.label}）\n${result}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return textResponse(`發送失敗：${message}`, 502)
  }
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get('x-line-signature')
  const ok = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET)
  if (!ok) {
    return textResponse('invalid signature', 401)
  }

  const body = parseWebhookBody(rawBody)
  const events = body.events ?? []

  await Promise.all(
    events.map(async (event) => {
      if (!event.replyToken) return
      if (event.type === 'follow') {
        await replyText(env, event.replyToken, menuText())
        return
      }
      if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) {
        return
      }
      const reminder = reminderFromText(event.message.text)
      if (reminder) {
        await replyText(env, event.replyToken, reminder.text)
        return
      }
      await replyText(env, event.replyToken, menuText())
    }),
  )

  return textResponse('OK')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return textResponse('OK')
    }

    if (url.pathname === '/admin') {
      return textResponse(renderAdminPage(url.origin), 200, 'text/html;charset=UTF-8')
    }

    if (url.pathname === '/send') {
      return handleSend(request, env)
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env)
    }

    if (request.method === 'POST' && url.pathname === '/') {
      return handleWebhook(request, env)
    }

    return textResponse('工地安全提醒 Bot 已啟動')
  },
}
