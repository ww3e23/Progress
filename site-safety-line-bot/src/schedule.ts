import { listChatStates } from './chats'
import { formatDayShift, formatNightDuty } from './duty'
import { pushText } from './line'
import { allowsScheduledRoster, allowsScheduledWeather } from './pushGuard'
import { isScheduleDue, scheduleSlot, taipeiParts, type TaipeiParts } from './time'
import { formatWeather } from './weather'
import type { DateRoster, Env } from './types'

const JOB_TTL_SEC = 60 * 60 * 72
const GRACE_MINUTES = 3

export function jobKey(kind: string, chatId: string, ymd: string, hour: number, minute: number): string {
  return `job:${kind}:${chatId}:${ymd}:${scheduleSlot(hour, minute)}`
}

export function isJobDue(hour: number, minute: number, tick: TaipeiParts, wall: TaipeiParts): boolean {
  if (tick.hour === hour && tick.minute === minute) return true
  return isScheduleDue(hour, minute, wall.hour, wall.minute, GRACE_MINUTES)
}

async function claimJob(env: Env, key: string): Promise<boolean> {
  if (!env.TRANSLATE_KV) return false
  if (await env.TRANSLATE_KV.get(key)) return false
  await env.TRANSLATE_KV.put(key, '1', { expirationTtl: JOB_TTL_SEC })
  return true
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
  const tick = taipeiParts(nowDate)
  const wall = taipeiParts()
  console.log('schedule tick', tick.ymd, `${scheduleSlot(tick.hour, tick.minute)}`, 'wall', scheduleSlot(wall.hour, wall.minute))
  const states = await listChatStates(env)
  for (const { chat, features } of states) {
    try {
      if (allowsScheduledWeather(features) && isJobDue(features.weatherHour, features.weatherMinute, tick, wall)) {
        await sendOnce(env, jobKey('weather', chat.id, tick.ymd, features.weatherHour, features.weatherMinute), async () => {
          await pushText(env, chat.id, await formatWeather(features.weatherPlace, features.weatherLink))
        })
      }
    } catch (error) {
      console.error('weather job failed', chat.id, error)
    }
    try {
      const roster: DateRoster = features.nightDuty
      if (allowsScheduledRoster(roster, tick.ymd) && isJobDue(roster.hour, roster.minute, tick, wall)) {
        await sendOnce(env, jobKey('nightDuty', chat.id, tick.ymd, roster.hour, roster.minute), async () => {
          await pushText(env, chat.id, formatNightDuty(roster, tick.ymd))
        })
      }
    } catch (error) {
      console.error('night duty job failed', chat.id, error)
    }
    try {
      const roster: DateRoster = features.dayShift
      if (allowsScheduledRoster(roster, tick.ymd) && isJobDue(roster.hour, roster.minute, tick, wall)) {
        await sendOnce(env, jobKey('dayShift', chat.id, tick.ymd, roster.hour, roster.minute), async () => {
          await pushText(env, chat.id, formatDayShift(roster, tick.ymd))
        })
      }
    } catch (error) {
      console.error('day shift job failed', chat.id, error)
    }
  }
}
