export interface TaipeiParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  ymd: string
  dayOfYear: number
}

export function taipeiParts(now = new Date()): TaipeiParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  const read = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value
    return Number(value)
  }

  const year = read('year')
  const month = read('month')
  const day = read('day')
  const hour = read('hour')
  const minute = read('minute')
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, month - 1, day)
  const dayOfYear = Math.floor((current - start) / 86400000)

  return {
    year,
    month,
    day,
    hour,
    minute,
    ymd: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    dayOfYear,
  }
}

export function clampHour(value: unknown, fallback: number): number {
  const hour = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback
  return hour
}
