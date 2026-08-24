export interface TaipeiParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
  ymd: string
  dayOfYear: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function taipeiParts(now = new Date()): TaipeiParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now)

  const read = (type: string): string => parts.find((part) => part.type === type)?.value || ''

  const year = Number(read('year'))
  const month = Number(read('month'))
  const day = Number(read('day'))
  const hour = Number(read('hour'))
  const minute = Number(read('minute'))
  const weekday = WEEKDAY_INDEX[read('weekday')] ?? 0
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, month - 1, day)
  const dayOfYear = Math.floor((current - start) / 86400000)

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    ymd: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    dayOfYear,
  }
}

export function clampHour(value: unknown, fallback: number): number {
  const hour = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback
  return hour
}

export function clampMinute(value: unknown, fallback = 0): number {
  const minute = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return fallback
  return minute
}
