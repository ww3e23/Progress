import type { ChatFeatures } from './types'

export type FeatureCommand =
  | { kind: 'image'; query: string }
  | { kind: 'info'; query: string }
  | { kind: 'weather'; place?: string }
  | { kind: 'duty'; spec?: string }
  | { kind: 'dayShift'; spec?: string }
  | { kind: 'help' }

export type RosterInfoQuery = { kind: 'night' | 'day'; spec?: string }

function stripMention(text: string): string {
  return text.trim().replace(/^[@＠]\S+\s+/, '')
}

function starredBody(text: string): string | null {
  const trimmed = stripMention(text)
  const match = trimmed.match(/^[*＊]\s*(.+)$/)
  return match ? match[1].trim() : null
}

const ROSTER_RANGE =
  '昨天|昨日|昨晚|今天|今日|今晚|明天|明日|後天|后天|7天|七天|一週|一周|本週|本周|這週|这周|近7天|近七天|過去7天|过去7天|本月|這個月|这个月|整月|月曆|月历'

function rosterRangeSpec(raw: string): string | undefined {
  if (/昨天|昨日|昨晚/.test(raw)) return '昨天'
  if (/明天|明日/.test(raw)) return '明天'
  if (/後天|后天/.test(raw)) return '後天'
  if (/近7天|近七天|過去7天|过去7天/.test(raw)) return '近7天'
  if (/7天|七天|一週|一周|本週|本周|這週|这周/.test(raw)) return '7天'
  if (/本月|這個月|这个月|整月|月曆|月历/.test(raw)) return '本月'
  return undefined
}

function parseTimeFirstRoster(body: string): FeatureCommand | null {
  const compact = body.replace(/\s+/g, '')
  const dated = compact.match(/^(\d{1,2}[/.－-]\d{1,2})的?(誰|谁)?(夜間|夜间|日間|日间)?(值班|排班|上班)$/)
  if (dated) {
    return { kind: dated[4] === '上班' ? 'dayShift' : 'duty', spec: dated[1] }
  }
  const match = compact.match(new RegExp(`^(${ROSTER_RANGE})的?(誰|谁)?(夜間|夜间|日間|日间)?(值班|排班|上班)$`))
  if (!match) return null
  return {
    kind: match[4] === '上班' ? 'dayShift' : 'duty',
    spec: rosterRangeSpec(match[1]),
  }
}

export function parseFeatureCommand(text: string): FeatureCommand | null {
  const body = starredBody(text)
  if (!body) return null

  if (/^功能$/i.test(body)) {
    return { kind: 'help' }
  }

  const image = body.match(/^(搜圖|搜图|找圖|找图|圖片|图片)\s+(.+)$/)
  if (image?.[2]) {
    return { kind: 'image', query: image[2].trim() }
  }
  if (/^(搜圖|搜图|找圖|找图)$/.test(body)) {
    return { kind: 'image', query: '' }
  }

  const weather = body.match(/^(天氣|天气|氣象|气象)(?:\s+(.+))?$/)
  if (weather) {
    const place = weather[2]?.trim()
    return { kind: 'weather', place: place || undefined }
  }

  const timeFirst = parseTimeFirstRoster(body)
  if (timeFirst) return timeFirst

  const duty = body.match(/^(值班|今晚值班|夜間值班|夜间值班|排班|誰值班|谁值班)(?:\s+(.+))?$/)
  if (duty) {
    return { kind: 'duty', spec: duty[2]?.trim() || undefined }
  }

  const dayShift = body.match(/^(上班|今日上班|日間上班|日間人員|谁上班|誰上班)(?:\s+(.+))?$/)
  if (dayShift) {
    return { kind: 'dayShift', spec: dayShift[2]?.trim() || undefined }
  }

  const info = body.match(/^(查詢|查询|搜尋|搜寻|查|問|问)(?:\s*(.+))?$/)
  if (info) {
    return { kind: 'info', query: (info[2] || '').trim() }
  }

  const searchAlias = body.match(/^(搜)\s+(.+)$/)
  if (searchAlias?.[2]) {
    return { kind: 'info', query: searchAlias[2].trim() }
  }

  return null
}

export function rosterInfoQuery(query: string): RosterInfoQuery | null {
  const text = query.replace(/\s+/g, '')
  if (!text) return null
  const isDay = /(日間|白天)?上班/.test(text) && !/值班/.test(text)
  const isNight = /值班|排班|今晚誰|今晚谁/.test(text)
  if (!isDay && !isNight) return null
  let spec: string | undefined
  if (/昨天|昨日|昨晚/.test(text)) spec = '昨天'
  else if (/明天|明日/.test(text)) spec = '明天'
  else if (/後天|后天/.test(text)) spec = '後天'
  else if (/近7天|近七天|過去7天|过去7天/.test(text)) spec = '近7天'
  else if (/7天|七天|一週|一周|本週|本周|這週|这周/.test(text)) spec = '7天'
  else if (/本月|這個月|这个月|月曆|月历|整月/.test(text)) spec = '本月'
  return { kind: isDay ? 'day' : 'night', spec }
}

export function infoUsage(): string {
  return [
    '用法：*查 你要問的內容',
    '工地相關都可以問，不限某一項。例如：',
    '· *查 熱危害',
    '· *查 高處作業',
    '· *查 模板支撐',
    '· *查 鋼筋搭接',
  ].join('\n')
}

export function featureHelp(features: ChatFeatures, enabled: string[], chatId?: string | null): string {
  const footer =
    chatId && (chatId.startsWith('C') || chatId.startsWith('R'))
      ? `\n\n此群 ID：${chatId}\n若後台沒看到這個群，傳完這句再去重新整理即可。`
      : ''
  if (enabled.length === 0) {
    return '此聊天尚未開啟功能。請管理員到後台勾選：即時翻譯、搜圖、查資料、氣象、夜間值班、日間上班。' + footer
  }
  const commands: string[] = []
  if (features.translate) commands.push('· 翻譯 泰文／翻譯 關')
  if (features.imageSearch) commands.push('· *搜圖 安全帽')
  if (features.infoSearch) commands.push('· *查 熱危害（工地問題都可以問）')
  if (features.weather) commands.push('· *天氣　或　*天氣 台中')
  if (features.nightDuty.enabled) commands.push('· *值班／*明天值班／*昨天值班／*7天值班／*本月值班')
  if (features.dayShift.enabled) commands.push('· *上班／*明天上班／*昨天上班／*7天上班／*本月上班')
  commands.push('· *功能')
  return [
    '此聊天已開啟：',
    ...enabled.map((item) => `· ${item}`),
    '',
    '指令請用 * 開頭，一般對話不會觸發：',
    ...commands,
  ].join('\n') + footer
}
