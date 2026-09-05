import { clampHour, clampMinute, taipeiParts, type TaipeiParts } from './time.ts'
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

function nearbyFilledDays(roster: DateRoster, ymd: string, limit = 3): string[] {
  return Object.entries(roster.days)
    .filter(([, names]) => names.length)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([day]) => day >= ymd)
    .slice(0, limit)
    .map(([day, names]) => `${day} ${names.join('、')}`)
}

export function formatNightDuty(roster: DateRoster, ymd: string): string {
  const names = namesForDate(roster, ymd)
  if (!names.length) {
    const nearby = nearbyFilledDays(roster, ymd)
    const extra = nearby.length ? `\n最近已排：${nearby.join('；')}` : ''
    return `【夜間值班通知】\n${ymd} 尚未排班。${extra}`
  }
  const lines = ['【夜間值班通知】', `${ymd} 值班：${names.join('、')}`]
  if (roster.period) lines.push(`時段：${roster.period}`)
  if (roster.remark) lines.push(roster.remark)
  return lines.join('\n')
}

export function formatDayShift(roster: DateRoster, ymd: string): string {
  const names = namesForDate(roster, ymd)
  if (!names.length) {
    const nearby = nearbyFilledDays(roster, ymd)
    const extra = nearby.length ? `\n最近已排：${nearby.join('；')}` : ''
    return `【日間上班通知】\n${ymd} 尚未排班。${extra}`
  }
  const lines = ['【日間上班通知】', `${ymd} 上班：${names.join('、')}`]
  if (roster.period) lines.push(`時段：${roster.period}`)
  if (roster.remark) lines.push(roster.remark)
  return lines.join('\n')
}

export type RosterSpecResult = {
  mode: 'day' | 'list'
  ymd: string
  year: number
  month: number
  ymds: string[]
  title: string
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export function addTaipeiDays(parts: TaipeiParts, days: number): { year: number; month: number; day: number; ymd: string } {
  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  const year = dt.getUTCFullYear()
  const month = dt.getUTCMonth() + 1
  const day = dt.getUTCDate()
  return { year, month, day, ymd: toYmd(year, month, day) }
}

export function weekdayLabel(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  return WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || ''
}

export function shortRosterDate(ymd: string): string {
  const [, month, day] = ymd.split('-')
  return `${Number(month)}/${Number(day)}（${weekdayLabel(ymd)}）`
}

export function ymdsFromParts(parts: TaipeiParts, startOffset: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addTaipeiDays(parts, startOffset + index).ymd)
}

export function ymdsInMonth(year: number, month: number): string[] {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: last }, (_, index) => toYmd(year, month, index + 1))
}

function daySpec(parts: { year: number; month: number; ymd: string }): RosterSpecResult {
  return {
    mode: 'day',
    ymd: parts.ymd,
    year: parts.year,
    month: parts.month,
    ymds: [parts.ymd],
    title: parts.ymd,
  }
}

function listSpec(title: string, ymds: string[], fallback: TaipeiParts): RosterSpecResult {
  const first = ymds[0] || fallback.ymd
  const [year, month] = first.split('-').map(Number)
  return {
    mode: 'list',
    ymd: first,
    year: year || fallback.year,
    month: month || fallback.month,
    ymds,
    title,
  }
}

export function resolveRosterSpec(spec: string | undefined, now = taipeiParts()): RosterSpecResult {
  const text = (spec || '').trim()
  if (!text || /^(今天|今日|今晚)$/.test(text)) return daySpec(now)

  if (/^(昨天|昨日|昨晚)$/.test(text)) return daySpec(addTaipeiDays(now, -1))
  if (/^(明天|明日)$/.test(text)) return daySpec(addTaipeiDays(now, 1))
  if (/^(後天|后天)$/.test(text)) return daySpec(addTaipeiDays(now, 2))

  if (/^(7天|七天|一週|一周|本週|本周|這週|这周|未來7天|未来7天|未來七天)$/.test(text)) {
    const ymds = ymdsFromParts(now, 0, 7)
    return listSpec(`未來 7 天（${shortRosterDate(ymds[0])}～${shortRosterDate(ymds[6])}）`, ymds, now)
  }
  if (/^(近7天|近七天|過去7天|过去7天)$/.test(text)) {
    const ymds = ymdsFromParts(now, -6, 7)
    return listSpec(`近 7 天（${shortRosterDate(ymds[0])}～${shortRosterDate(ymds[6])}）`, ymds, now)
  }
  if (/^(本月|這個月|这个月|月曆|月历|整月)$/.test(text)) {
    return listSpec(`${now.year}年${now.month}月`, ymdsInMonth(now.year, now.month), now)
  }

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (iso) {
    const ymd = toYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    if (isYmd(ymd)) return daySpec({ year: Number(iso[1]), month: Number(iso[2]), ymd })
  }
  const md = text.match(/^(\d{1,2})[/.－-](\d{1,2})$/)
  if (md) {
    const ymd = toYmd(now.year, Number(md[1]), Number(md[2]))
    if (isYmd(ymd)) return daySpec({ year: now.year, month: Number(md[1]), ymd })
  }
  return daySpec(now)
}

export function formatRosterMonth(kind: 'night' | 'day', roster: DateRoster, year: number, month: number): string {
  return formatRosterBySpec(kind, roster, listSpec(`${year}年${month}月`, ymdsInMonth(year, month), {
    ...taipeiParts(),
    year,
    month,
    ymd: toYmd(year, month, 1),
  }))
}

export function formatRosterBySpec(kind: 'night' | 'day', roster: DateRoster, spec: RosterSpecResult): string {
  if (spec.mode === 'day') {
    return kind === 'night' ? formatNightDuty(roster, spec.ymd) : formatDayShift(roster, spec.ymd)
  }
  const title = kind === 'night' ? '【夜間值班】' : '【日間上班】'
  const rows = spec.ymds.map((ymd) => {
    const names = namesForDate(roster, ymd)
    return names.length ? `${shortRosterDate(ymd)} ${names.join('、')}` : `${shortRosterDate(ymd)} 尚未排班`
  })
  const lines = [title, spec.title, ...rows]
  if (roster.period) lines.push(`時段：${roster.period}`)
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
