import { renderAdminPage } from './admin'
import { handleAdminApi, requireAdmin } from './adminApi'
import { enabledFeatureLabels, getFeatures, putFeatures, touchChat } from './chats'
import { featureHelp, infoUsage, parseFeatureCommand, rosterInfoKind } from './commands'
import { formatDayShift, formatNightDuty, formatRosterMonth, resolveRosterSpec } from './duty'
import { searchImages } from './imageSearch'
import { searchInfo } from './infoSearch'
import {
  deliverMessages,
  deliverText,
  fetchChatTitle,
  hasLineToken,
  imageMessage,
  parseWebhookBody,
  sendReminderMessages,
  verifyLineSignature,
} from './line'
import { isReminderType, menuText, reminderFromText, REMINDERS } from './reminders'
import { runHourlyJobs } from './schedule'
import { chatIdFromSource, isGroupOrRoom, isMostlyChinese, parseTranslateCommand, translateHelp } from './translate'
import { getTranslateLang, setTranslateLang, translateForChat, translateText } from './translateService'
import { formatWeather } from './weather'
import type { ChatFeatures, Env, LineWebhookEvent, ReminderType } from './types'

function textResponse(body: string, status = 200, contentType = 'text/plain;charset=UTF-8'): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  })
}

function unauthorized(): Response {
  return textResponse('未授權：請提供正確的 ADMIN_TOKEN', 401)
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

async function handleTranslateCommand(env: Env, event: LineWebhookEvent, text: string, features: ChatFeatures | null): Promise<boolean> {
  const command = parseTranslateCommand(text)
  if (!command) return false
  const chatId = chatIdFromSource(event.source)
  if (!chatId) {
    await deliverText(env, event, translateHelp())
    return true
  }
  if (features && !features.translate) {
    return false
  }
  if (command.action === 'help') {
    const current = await getTranslateLang(env, chatId)
    const extra = current ? `\n目前：已開啟（${current}）` : '\n目前：關閉'
    await deliverText(env, event, translateHelp() + extra)
    return true
  }
  if (command.action === 'off') {
    await setTranslateLang(env, chatId, null)
    if (features) {
      await putFeatures(env, chatId, { ...features, translateLang: '' })
    }
    await deliverText(env, event, '已暫停此聊天的即時翻譯。再傳「翻譯 泰文」可重新開啟。')
    return true
  }
  if (command.lang) {
    await setTranslateLang(env, chatId, command.lang.code)
    if (features) {
      await putFeatures(env, chatId, { ...features, translate: true, translateLang: command.lang.code })
    }
    await deliverText(env, event, `已開啟即時翻譯：中文 ↔ ${command.lang.label}\n之後訊息會自動翻譯。`)
    return true
  }
  return true
}

async function handleFeatureCommand(env: Env, event: LineWebhookEvent, text: string, features: ChatFeatures): Promise<boolean> {
  const command = parseFeatureCommand(text)
  if (!command) return false

  if (command.kind === 'help') {
    await deliverText(env, event, featureHelp(features, enabledFeatureLabels(features), chatIdFromSource(event.source)))
    return true
  }

  if (command.kind === 'image') {
    if (!features.imageSearch) return false
    if (!command.query) {
      await deliverText(env, event, '用法：*搜圖 安全帽')
      return true
    }
    const images = await searchImages(command.query)
    if (images.length === 0) {
      await deliverText(env, event, `找不到「${command.query}」的圖片，換個關鍵字再試。`)
      return true
    }
    try {
      await deliverMessages(env, event, [
        { type: 'text', text: `搜圖：${command.query}` },
        ...images.map((image) => imageMessage(image.url, image.preview)),
      ])
    } catch (error) {
      console.error('image send failed', error)
      const links = images.map((image) => image.url).join('\n')
      await deliverText(env, event, `搜圖：${command.query}\n${links}`)
    }
    return true
  }

  if (command.kind === 'info') {
    if (!features.infoSearch) return false
    if (!command.query) {
      await deliverText(env, event, infoUsage())
      return true
    }
    const rosterKind = rosterInfoKind(command.query)
    if (rosterKind) {
      const chatId = chatIdFromSource(event.source)
      const fresh = chatId ? await getFeatures(env, chatId, { volatile: true }) : features
      const spec = resolveRosterSpec(/本月|這個月|这个月|月曆|月历/.test(command.query) ? '本月' : undefined)
      if (rosterKind === 'night' && fresh.nightDuty.enabled) {
        await deliverText(env, event, formatNightDuty(fresh.nightDuty, spec.ymd))
        return true
      }
      if (rosterKind === 'night-month' && fresh.nightDuty.enabled) {
        await deliverText(env, event, formatRosterMonth('night', fresh.nightDuty, spec.year, spec.month))
        return true
      }
      if (rosterKind === 'day' && fresh.dayShift.enabled) {
        await deliverText(env, event, formatDayShift(fresh.dayShift, spec.ymd))
        return true
      }
      if (rosterKind === 'day-month' && fresh.dayShift.enabled) {
        await deliverText(env, event, formatRosterMonth('day', fresh.dayShift, spec.year, spec.month))
        return true
      }
    }
    const answer = await searchInfo(env, command.query, features.weatherPlace, features.weatherLink)
    await deliverText(env, event, answer.slice(0, 4900))
    return true
  }

  if (command.kind === 'weather') {
    if (!features.weather) return false
    const place = command.place || features.weatherPlace || '台北'
    await deliverText(env, event, await formatWeather(place, features.weatherLink))
    return true
  }

  if (command.kind === 'duty') {
    if (!features.nightDuty.enabled) return false
    const chatId = chatIdFromSource(event.source)
    const fresh = chatId ? await getFeatures(env, chatId, { volatile: true }) : features
    const spec = resolveRosterSpec(command.spec)
    const text = spec.wholeMonth
      ? formatRosterMonth('night', fresh.nightDuty, spec.year, spec.month)
      : formatNightDuty(fresh.nightDuty, spec.ymd)
    await deliverText(env, event, text)
    return true
  }

  if (command.kind === 'dayShift') {
    if (!features.dayShift.enabled) return false
    const chatId = chatIdFromSource(event.source)
    const fresh = chatId ? await getFeatures(env, chatId, { volatile: true }) : features
    const spec = resolveRosterSpec(command.spec)
    const text = spec.wholeMonth
      ? formatRosterMonth('day', fresh.dayShift, spec.year, spec.month)
      : formatDayShift(fresh.dayShift, spec.ymd)
    await deliverText(env, event, text)
    return true
  }

  return false
}

async function processEvents(env: Env, events: LineWebhookEvent[]): Promise<void> {
  for (const event of events) {
    try {
      await touchChat(env, event.source, (chat) => fetchChatTitle(env, chat))
      const chatId = chatIdFromSource(event.source)
      const features = chatId ? await getFeatures(env, chatId) : null

      if (event.type === 'join') {
        continue
      }
      if (event.type === 'follow') {
        await deliverText(env, event, menuText())
        continue
      }
      if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) {
        continue
      }
      const text = event.message.text
      const mentionees = event.message.mention?.mentionees
      if (await handleTranslateCommand(env, event, text, features)) continue
      if (features && (await handleFeatureCommand(env, event, text, features))) continue

      if (chatId && features?.translate) {
        try {
          const translated = await translateForChat(env, chatId, text, mentionees)
          if (translated) {
            await deliverText(env, event, translated)
            continue
          }
        } catch (error) {
          console.error('translate failed', error)
        }
      }

      if (isGroupOrRoom(event.source)) continue

      const reminder = reminderFromText(text)
      if (reminder) {
        await deliverText(env, event, reminder.text)
        continue
      }
      if (/^(說明|说明|選單|选单|help|menu)$/i.test(text.trim())) {
        await deliverText(env, event, menuText())
      }
    } catch (error) {
      console.error('event failed', error)
    }
  }
}

async function handleWebhook(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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
  const pending = processEvents(env, events)
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(pending)
  } else {
    await pending
  }
  return textResponse('OK')
}

export { FeatureStore } from './featureStore'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/admin/')) {
      if (!requireAdmin(request, env)) return unauthorized()
      try {
        return await handleAdminApi(request, env)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return textResponse(`操作失敗：${message}`, 502)
      }
    }

    if (url.pathname === '/health') {
      return textResponse('OK')
    }

    if (url.pathname === '/status') {
      return textResponse(
        [
          `lineToken=${hasLineToken(env) ? 'yes' : 'no'}`,
          `lineSecret=${env.LINE_CHANNEL_SECRET ? 'yes' : 'no'}`,
          `gemini=${env.GEMINI_API_KEY ? 'yes' : 'no'}`,
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
      return handleWebhook(request, env, ctx)
    }

    if (request.method === 'POST' && url.pathname === '/') {
      return handleWebhook(request, env, ctx)
    }

    return textResponse('工程bot 已啟動')
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const when = typeof controller.scheduledTime === 'number' ? new Date(controller.scheduledTime) : new Date()
    await runHourlyJobs(env, when)
  },
}

export { FeatureStore } from './featureStore'
