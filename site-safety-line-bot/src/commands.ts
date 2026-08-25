import type { ChatFeatures } from './types'

export type FeatureCommand =
  | { kind: 'image'; query: string }
  | { kind: 'info'; query: string }
  | { kind: 'weather'; place?: string }
  | { kind: 'duty' }
  | { kind: 'dayShift' }
  | { kind: 'help' }

function stripMention(text: string): string {
  return text.trim().replace(/^[@＠]\S+\s+/, '')
}

function starredBody(text: string): string | null {
  const trimmed = stripMention(text)
  const match = trimmed.match(/^[*＊]\s*(.+)$/)
  return match ? match[1].trim() : null
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

  if (/^(值班|今晚值班|夜間值班|夜间值班|排班|誰值班|谁值班)$/.test(body)) {
    return { kind: 'duty' }
  }

  if (/^(上班|今日上班|日間上班|日間人員|谁上班|誰上班)$/.test(body)) {
    return { kind: 'dayShift' }
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
  if (features.nightDuty.enabled) commands.push('· *值班')
  if (features.dayShift.enabled) commands.push('· *上班')
  commands.push('· *功能')
  return [
    '此聊天已開啟：',
    ...enabled.map((item) => `· ${item}`),
    '',
    '指令請用 * 開頭，一般對話不會觸發：',
    ...commands,
  ].join('\n') + footer
}
