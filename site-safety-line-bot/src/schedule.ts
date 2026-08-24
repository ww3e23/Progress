import { listChatStates } from './chats'
import { formatDayShift, formatNightDuty } from './duty'
import { pushText } from './line'
import { allowsScheduledRoster, allowsScheduledWeather } from './pushGuard'
import { isScheduleDue, scheduleSlot, taipeiParts } from './time'
import { formatWeather } from './weather'
import type { DateRoster, Env } from './types'

async function alreadySent(env: Env, key: string): Promise<boolean> {
  if (!env.TRANSLATE_KV) return false
  return Boolean(await env.TRANSLATE_KV.get(key))
}

async function markSent(env: Env, key: string): Promise<void> {
  if (!env.TRANSLATE_KV) return
  await env.TRANSLATE_KV.put(key, '1', { expirationTtl: 60 * 60 * 72 })
}

function jobKey(kind: string, chatId: string, ymd: string, hour: number, minute: number): string {
  return `job:${kind}:${chatId}:${ymd}:${scheduleSlot(hour, minute)}`
}

export async function runHourlyJobs(env: Env, nowDate = new Date()): Promise<void> {
  if (!env.TRANSLATE_KV) return
  const now = taipeiParts(nowDate)
  const states = await listChatStates(env)
  for (const { chat, features } of states) {
    try {
      if (allowsScheduledWeather(features) && isScheduleDue(features.weatherHour, features.weatherMinute, now.hour, now.minute)) {
        const key = jobKey('weather', chat.id, now.ymd, features.weatherHour, features.weatherMinute)
        if (!(await alreadySent(env, key))) {
          const text = await formatWeather(features.weatherPlace)
          await pushText(env, chat.id, text)
          await markSent(env, key)
        }
      }
    } catch (error) {
      console.error('weather job failed', chat.id, error)
    }
    try {
      const roster: DateRoster = features.nightDuty
      if (allowsScheduledRoster(roster, now.ymd) && isScheduleDue(roster.hour, roster.minute, now.hour, now.minute)) {
        const key = jobKey('nightDuty', chat.id, now.ymd, roster.hour, roster.minute)
        if (!(await alreadySent(env, key))) {
          await pushText(env, chat.id, formatNightDuty(roster, now.ymd))
          await markSent(env, key)
        }
      }
    } catch (error) {
      console.error('night duty job failed', chat.id, error)
    }
    try {
      const roster: DateRoster = features.dayShift
      if (allowsScheduledRoster(roster, now.ymd) && isScheduleDue(roster.hour, roster.minute, now.hour, now.minute)) {
        const key = jobKey('dayShift', chat.id, now.ymd, roster.hour, roster.minute)
        if (!(await alreadySent(env, key))) {
          await pushText(env, chat.id, formatDayShift(roster, now.ymd))
          await markSent(env, key)
        }
      }
    } catch (error) {
      console.error('day shift job failed', chat.id, error)
    }
  }
}
