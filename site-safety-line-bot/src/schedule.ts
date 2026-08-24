import { listChatStates } from './chats'
import { formatDayShift, formatNightDuty } from './duty'
import { pushText } from './line'
import { allowsScheduledRoster, allowsScheduledWeather } from './pushGuard'
import { taipeiParts } from './time'
import { formatWeather } from './weather'
import type { DateRoster, Env } from './types'

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

function rosterDue(roster: DateRoster, hour: number, minute: number): boolean {
  return roster.hour === hour && roster.minute === minute
}

export async function runHourlyJobs(env: Env): Promise<void> {
  if (!env.TRANSLATE_KV) return
  const now = taipeiParts()
  const states = await listChatStates(env)
  for (const { chat, features } of states) {
    try {
      if (allowsScheduledWeather(features) && features.weatherHour === now.hour && features.weatherMinute === now.minute) {
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
      if (allowsScheduledRoster(features.nightDuty, now.ymd) && rosterDue(features.nightDuty, now.hour, now.minute)) {
        if (!(await alreadySent(env, 'nightDuty', chat.id, now.ymd))) {
          await pushText(env, chat.id, formatNightDuty(features.nightDuty, now.ymd))
          await markSent(env, 'nightDuty', chat.id, now.ymd)
        }
      }
    } catch (error) {
      console.error('night duty job failed', chat.id, error)
    }
    try {
      if (allowsScheduledRoster(features.dayShift, now.ymd) && rosterDue(features.dayShift, now.hour, now.minute)) {
        if (!(await alreadySent(env, 'dayShift', chat.id, now.ymd))) {
          await pushText(env, chat.id, formatDayShift(features.dayShift, now.ymd))
          await markSent(env, 'dayShift', chat.id, now.ymd)
        }
      }
    } catch (error) {
      console.error('day shift job failed', chat.id, error)
    }
  }
}
