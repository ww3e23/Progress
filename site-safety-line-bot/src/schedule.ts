import { listChatStates } from './chats'
import { formatDayShift, formatNightDuty } from './duty'
import { pushText } from './line'
import { allowsScheduledRoster, allowsScheduledWeather } from './pushGuard'
import { isScheduleDue, scheduleSlot, taipeiParts } from './time'
import { formatWeather } from './weather'
import type { DateRoster, Env } from './types'

const JOB_TTL_SEC = 60 * 60 * 72

export function jobKey(kind: string, chatId: string, ymd: string, hour: number, minute: number): string {
  return `job:${kind}:${chatId}:${ymd}:${scheduleSlot(hour, minute)}`
}

async function claimJob(env: Env, key: string): Promise<boolean> {
  if (!env.TRANSLATE_KV) return false
  if (await env.TRANSLATE_KV.get(key)) return false
  const token = `claim:${crypto.randomUUID()}`
  await env.TRANSLATE_KV.put(key, token, { expirationTtl: JOB_TTL_SEC })
  return (await env.TRANSLATE_KV.get(key)) === token
}

async function releaseJob(env: Env, key: string): Promise<void> {
  if (!env.TRANSLATE_KV) return
  await env.TRANSLATE_KV.delete(key)
}

async function sendOnce(env: Env, key: string, send: () => Promise<void>): Promise<void> {
  if (!(await claimJob(env, key))) return
  try {
    await send()
  } catch (error) {
    await releaseJob(env, key)
    throw error
  }
}

export async function runHourlyJobs(env: Env, nowDate = new Date()): Promise<void> {
  if (!env.TRANSLATE_KV) return
  const now = taipeiParts(nowDate)
  const states = await listChatStates(env)
  for (const { chat, features } of states) {
    try {
      if (allowsScheduledWeather(features) && isScheduleDue(features.weatherHour, features.weatherMinute, now.hour, now.minute)) {
        await sendOnce(env, jobKey('weather', chat.id, now.ymd, features.weatherHour, features.weatherMinute), async () => {
          await pushText(env, chat.id, await formatWeather(features.weatherPlace))
        })
      }
    } catch (error) {
      console.error('weather job failed', chat.id, error)
    }
    try {
      const roster: DateRoster = features.nightDuty
      if (allowsScheduledRoster(roster, now.ymd) && isScheduleDue(roster.hour, roster.minute, now.hour, now.minute)) {
        await sendOnce(env, jobKey('nightDuty', chat.id, now.ymd, roster.hour, roster.minute), async () => {
          await pushText(env, chat.id, formatNightDuty(roster, now.ymd))
        })
      }
    } catch (error) {
      console.error('night duty job failed', chat.id, error)
    }
    try {
      const roster: DateRoster = features.dayShift
      if (allowsScheduledRoster(roster, now.ymd) && isScheduleDue(roster.hour, roster.minute, now.hour, now.minute)) {
        await sendOnce(env, jobKey('dayShift', chat.id, now.ymd, roster.hour, roster.minute), async () => {
          await pushText(env, chat.id, formatDayShift(roster, now.ymd))
        })
      }
    } catch (error) {
      console.error('day shift job failed', chat.id, error)
    }
  }
}
