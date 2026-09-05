import { namesForDate } from './duty.ts'
import type { ChatFeatures, DateRoster } from './types.ts'

export function allowsScheduledWeather(features: ChatFeatures): boolean {
  return Boolean(features.weather)
}

export function allowsScheduledRoster(roster: DateRoster, ymd: string): boolean {
  return Boolean(roster.enabled) && namesForDate(roster, ymd).length > 0
}

export function allowsAdminPush(features: ChatFeatures, kind: string): boolean {
  if (kind === 'weather') return Boolean(features.weather)
  if (kind === 'duty' || kind === 'nightDuty') return Boolean(features.nightDuty.enabled)
  if (kind === 'dayShift') return Boolean(features.dayShift.enabled)
  if (kind === 'heat' || kind === 'height' || kind === 'rain') return Boolean(features.safety)
  return false
}

export function adminPushBlockedMessage(kind: string): string {
  if (kind === 'weather') return '此群未開啟氣象播報，為避免亂發話，已拒絕發送。'
  if (kind === 'duty' || kind === 'nightDuty') return '此群未開啟夜間值班通知，為避免亂發話，已拒絕發送。'
  if (kind === 'dayShift') return '此群未開啟日間上班通知，為避免亂發話，已拒絕發送。'
  if (kind === 'heat' || kind === 'height' || kind === 'rain') {
    return '此群未開啟工安提醒，為避免亂發話，已拒絕發送。'
  }
  return '此群未開啟該功能，已拒絕發送。'
}
