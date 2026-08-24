import type { ChatFeatures } from './types'

export function allowsScheduledWeather(features: ChatFeatures): boolean {
  return Boolean(features.weather)
}

export function allowsScheduledDuty(features: ChatFeatures, weekday: number): boolean {
  return Boolean(features.duty) && features.dutyPeople.length > 0 && features.dutyDays.includes(weekday)
}

export function allowsAdminPush(features: ChatFeatures, kind: string): boolean {
  if (kind === 'weather') return Boolean(features.weather)
  if (kind === 'duty') return Boolean(features.duty)
  if (kind === 'heat' || kind === 'height' || kind === 'rain') return Boolean(features.safety)
  return false
}

export function adminPushBlockedMessage(kind: string): string {
  if (kind === 'weather') return '此群未開啟氣象播報，為避免亂發話，已拒絕發送。'
  if (kind === 'duty') return '此群未開啟值班通知，為避免亂發話，已拒絕發送。'
  if (kind === 'heat' || kind === 'height' || kind === 'rain') {
    return '此群未開啟工安提醒，為避免亂發話，已拒絕發送。'
  }
  return '此群未開啟該功能，已拒絕發送。'
}
