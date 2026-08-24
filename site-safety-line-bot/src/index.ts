import { renderAdminPage } from './admin'
import { hasLineToken, parseWebhookBody, replyText, sendReminderMessages, verifyLineSignature } from './line'
import { isReminderType, menuText, reminderFromText, REMINDERS } from './reminders'
import { chatIdFromSource, isGroupOrRoom, isMostlyChinese, parseTranslateCommand, translateHelp } from './translate'
import { getTranslateLang, setTranslateLang, translateForChat, translateText } from './translateService'
import type { Env, LineWebhookEvent, ReminderType } from './types'

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
  if (!expected) return true
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

async function handleTranslateCommand(env: Env, event: LineWebhookEvent, text: string): Promise<boolean> {
  const command = parseTranslateCommand(text)
  if (!command || !event.replyToken) return false
  const chatId = chatIdFromSource(event.source)
  if (!chatId) {
    await replyText(env, event.replyToken, translateHelp())
    return true
  }
  if (command.action === 'help') {
    const current = await getTranslateLang(env, chatId)
    const extra = current ? `\n目前：已開啟（${current}）` : '\n目前：關閉'
    await replyText(env, event.replyToken, translateHelp() + extra)
    return true
  }
  if (command.action === 'off') {
    await setTranslateLang(env, chatId, null)
    await replyText(env, event.replyToken, '已關閉此聊天的即時翻譯。')
    return true
  }
  if (command.lang) {
    await setTranslateLang(env, chatId, command.lang.code)
    await replyText(env, event.replyToken, `已開啟即時翻譯：中文 ↔ ${command.lang.label}\n之後訊息會自動翻譯。`)
    return true
  }
  return true
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get('x-line-signature')
  if (env.LINE_CHANNEL_SECRET) {
    const ok = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET)
    if (!ok) {
      return textResponse('invalid signature', 401)
    }
  }

  const body = parseWebhookBody(rawBody)
  const events = body.events ?? []

  try {
    await Promise.all(
      events.map(async (event) => {
        if (event.type === 'join' && event.replyToken) {
          await replyText(env, event.replyToken, translateHelp())
          return
        }
        if (!event.replyToken) return
        if (event.type === 'follow') {
          await replyText(env, event.replyToken, menuText())
          return
        }
        if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) {
          return
        }
        const text = event.message.text
        if (await handleTranslateCommand(env, event, text)) return

        const chatId = chatIdFromSource(event.source)
        if (chatId) {
          try {
            const translated = await translateForChat(env, chatId, text)
            if (translated) {
              await replyText(env, event.replyToken, translated)
              return
            }
          } catch (error) {
            console.error('translate failed', error)
          }
        }

        if (isGroupOrRoom(event.source)) return

        const reminder = reminderFromText(text)
        if (reminder) {
          await replyText(env, event.replyToken, reminder.text)
          return
        }
        if (/^(說明|说明|選單|选单|help|menu)$/i.test(text.trim())) {
          await replyText(env, event.replyToken, menuText())
        }
      }),
    )
  } catch (error) {
    console.error('webhook handler failed', error)
  }

  return textResponse('OK')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return textResponse('OK')
    }

    if (url.pathname === '/status') {
      return textResponse(
        [
          `lineToken=${hasLineToken(env) ? 'yes' : 'no'}`,
          `lineSecret=${env.LINE_CHANNEL_SECRET ? 'yes' : 'no'}`,
          `ai=${env.AI ? 'yes' : 'no'}`,
          `kv=${env.TRANSLATE_KV ? 'yes' : 'no'}`,
        ].join('\n'),
      )
    }

    if (url.pathname === '/admin') {
      return textResponse(renderAdminPage(url.origin), 200, 'text/html;charset=UTF-8')
    }

    if (url.pathname === '/translate-preview') {
      const text = (url.searchParams.get('text') || '請戴安全帽').slice(0, 200)
      const to = url.searchParams.get('to') || 'vi'
      try {
        const translated = await translateText(env, text, isMostlyChinese(text) ? 'zh' : to, isMostlyChinese(text) ? to : 'zh')
        return textResponse(translated)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return textResponse(`翻譯失敗：${message}`, 502)
      }
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

    return textResponse('工程bot 已啟動')
  },
}
