import { listChatStates } from './chats'
import { formatDuty } from './duty'
import { pushText } from './line'
import { allowsScheduledDuty, allowsScheduledWeather } from './pushGuard'
import { taipeiParts } from './time'
import { formatWeather } from './weather'
import type { Env } from './types'

async function alreadySent(env: Env, kind: string, chatId: string, ymd: string): Promise<boolean> {
  if (!env.TRANSLATE_KV) return false
  const key = `job:${kind}:${chatId}:${ymd}`
  const raw = await env.TRANSLATE_KV.get(key)
  return Boolean(raw)
}

async function markSent(env: Env, kind: string, chatId: string, ymd: string): Promise<void> {
  if (!env.TRANSLATE_KV) return
  await env.TRANSLATE_KV.put(`job:${kind}:${chatId}:${ymd}`, '1', { expirationTtl: 60 * 60 * 72 })
}

export async function runHourlyJobs(env: Env): Promise<void> {
  if (!env.TRANSLATE_KV) return
  const now = taipeiParts()
  const states = await listChatStates(env)
  for (const { chat, features } of states) {
    try {
      if (allowsScheduledWeather(features) && features.weatherHour === now.hour) {
        if (!(await alreadySent(env, 'weather', chat.id, now.ymd))) {
          const text = await formatWeather(features.weatherPlace)
          await pushText(env, chat.id, text)
          await markSent(env, 'weather', chat.id, now.ymd)
        }
      }
    } catch (error) {
      console.error('weather job failed', chat.id, error)
    }
    try {
      if (allowsScheduledDuty(features, now.weekday) && features.dutyHour === now.hour) {
        if (!(await alreadySent(env, 'duty', chat.id, now.ymd))) {
          await pushText(env, chat.id, formatDuty(features, now.dayOfYear))
          await markSent(env, 'duty', chat.id, now.ymd)
        }
      }
    } catch (error) {
      console.error('duty job failed', chat.id, error)
    }
  }
}
