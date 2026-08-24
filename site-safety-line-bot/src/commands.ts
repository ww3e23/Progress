import type { ChatFeatures } from './types'

export type FeatureCommand =
  | { kind: 'image'; query: string }
  | { kind: 'info'; query: string }
  | { kind: 'weather'; place?: string }
  | { kind: 'duty' }
  | { kind: 'help' }

function stripMention(text: string): string {
  return text.trim().replace(/^[@＠]\S+\s+/, '')
}

export function parseFeatureCommand(text: string): FeatureCommand | null {
  const trimmed = stripMention(text)
  if (!trimmed) return null

  if (/^功能$/i.test(trimmed)) {
    return { kind: 'help' }
  }

  const image = trimmed.match(/^(搜圖|搜图|找圖|找图|圖片|图片)\s+(.+)$/)
  if (image?.[2]) {
    return { kind: 'image', query: image[2].trim() }
  }
  if (/^(搜圖|搜图|找圖|找图)$/.test(trimmed)) {
    return { kind: 'image', query: '' }
  }

  const weather = trimmed.match(/^(天氣|天气|氣象|气象)(?:\s+(.+))?$/)
  if (weather) {
    const place = weather[2]?.trim()
    return { kind: 'weather', place: place || undefined }
  }

  if (/^(值班|今晚值班|排班|誰值班|谁值班)$/.test(trimmed)) {
    return { kind: 'duty' }
  }

  const info = trimmed.match(/^(查詢|查询|搜尋|搜寻|查|搜|問|问)\s+(.+)$/)
  if (info?.[2]) {
    return { kind: 'info', query: info[2].trim() }
  }

  return null
}

export function featureHelp(features: ChatFeatures, enabled: string[]): string {
  if (enabled.length === 0) {
    return '此聊天尚未開啟功能。請管理員到後台勾選：即時翻譯、搜圖、查資料、氣象、值班。'
  }
  const commands: string[] = []
  if (features.translate) commands.push('· 翻譯 泰文／翻譯 關')
  if (features.imageSearch) commands.push('· 搜圖 安全帽')
  if (features.infoSearch) commands.push('· 查 鋼筋搭接')
  if (features.weather) commands.push('· 天氣　或　天氣 台中')
  if (features.duty) commands.push('· 值班')
  return ['此聊天已開啟：', ...enabled.map((item) => `· ${item}`), '', '可用指令：', ...commands].join('\n')
}
