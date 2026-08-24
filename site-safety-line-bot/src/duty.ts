import { clampHour, clampMinute } from './time.ts'
import type { DateRoster } from './types.ts'

export const DEFAULT_NIGHT_DUTY: DateRoster = {
  enabled: false,
  hour: 21,
  minute: 0,
  period: '05:30-07:30（如遇工班加班配合工班時段）',
  remark: '',
  days: {},
}

export const DEFAULT_DAY_SHIFT: DateRoster = {
  enabled: false,
  hour: 7,
  minute: 0,
  period: '',
  remark: '',
  days: {},
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseNamesInput(text: string): string[] {
  return text
    .split(/[,，、;；|/／\n]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 8)
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function toYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function isYmd(value: string): boolean {
  const match = value.match(YMD_RE)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const dt = new Date(Date.UTC(year, month - 1, day))
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
}

export function parseRosterDays(raw: unknown): Record<string, string[]> {
  const days: Record<string, string[]> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return days
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isYmd(key)) continue
    const names = Array.isArray(value)
      ? parseNamesInput(value.map((item) => String(item)).join('、'))
      : typeof value === 'string'
        ? parseNamesInput(value)
        : []
    if (names.length) days[key] = names
  }
  return days
}

export function parseRoster(raw: unknown, defaults: DateRoster): DateRoster {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Partial<DateRoster>)
    : {}
  const period = typeof obj.period === 'string' ? obj.period.trim().slice(0, 80) : defaults.period
  const remark = typeof obj.remark === 'string' ? obj.remark.replace(/\r\n/g, '\n').trim().slice(0, 400) : ''
  return {
    enabled: Boolean(obj.enabled),
    hour: clampHour(obj.hour, defaults.hour),
    minute: clampMinute(obj.minute, defaults.minute),
    period,
    remark,
    days: parseRosterDays(obj.days),
  }
}

export function namesForDate(roster: DateRoster, ymd: string): string[] {
  return roster.days[ymd] || []
}

export function formatNightDuty(roster: DateRoster, ymd: string): string {
  const names = namesForDate(roster, ymd)
  if (!names.length) return `【夜間值班通知】\n${ymd} 尚未排班。`
  const lines = ['【夜間值班通知】', `${ymd} 值班：${names.join('、')}`]
  if (roster.period) lines.push(`時段：${roster.period}`)
  if (roster.remark) lines.push(roster.remark)
  return lines.join('\n')
}

export function formatDayShift(roster: DateRoster, ymd: string): string {
  const names = namesForDate(roster, ymd)
  if (!names.length) return `【日間上班通知】\n${ymd} 尚未排班。`
  const lines = ['【日間上班通知】', `${ymd} 上班：${names.join('、')}`]
  if (roster.period) lines.push(`時段：${roster.period}`)
  if (roster.remark) lines.push(roster.remark)
  return lines.join('\n')
}

export function parseRosterPaste(text: string, year: number, month: number): Record<string, string[]> {
  const days: Record<string, string[]> = {}
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const iso = line.match(/^(\d{4}-\d{2}-\d{2})(?:\s+|[:：]\s*)(.+)$/)
    if (iso) {
      const names = parseNamesInput(iso[2])
      if (isYmd(iso[1]) && names.length) days[iso[1]] = names
      continue
    }

    const md = line.match(/^(\d{1,2})[/.－-](\d{1,2})(?:\s+|[:：]\s*)(.+)$/)
    if (md) {
      const names = parseNamesInput(md[3])
      const ymd = toYmd(year, Number(md[1]), Number(md[2]))
      if (isYmd(ymd) && names.length) days[ymd] = names
      continue
    }

    const dayOnly = line.match(/^(\d{1,2})(?:\s+|[:：]\s*)(.+)$/)
    if (dayOnly) {
      const names = parseNamesInput(dayOnly[2])
      const ymd = toYmd(year, month, Number(dayOnly[1]))
      if (isYmd(ymd) && names.length) days[ymd] = names
    }
  }
  return days
}
