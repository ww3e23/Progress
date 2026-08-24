export const BOT_NAME = '工程bot'
export const TRANSLATE_MARK = '🌐'

export interface LangOption {
  code: string
  label: string
  aliases: string[]
}

export const LANGS: LangOption[] = [
  { code: 'vi', label: '越南文', aliases: ['越南', '越文', '越南文', 'vietnamese', 'vi'] },
  { code: 'id', label: '印尼文', aliases: ['印尼', '印尼文', 'indonesian', 'id'] },
  { code: 'th', label: '泰文', aliases: ['泰文', '泰語', '泰国', '泰國', 'thai', 'th'] },
  { code: 'en', label: '英文', aliases: ['英文', '英語', '英语', 'english', 'en'] },
  { code: 'tl', label: '菲律賓文', aliases: ['菲律賓', '菲律宾', '塔加洛', 'tagalog', 'filipino', 'tl'] },
  { code: 'my', label: '緬甸文', aliases: ['緬甸', '缅甸', 'burmese', 'my'] },
  { code: 'km', label: '柬埔寨文', aliases: ['柬埔寨', '高棉', 'khmer', 'km'] },
]

const CJK_RE = /\p{Script=Han}/u

export function chatIdFromSource(source: { type?: string; groupId?: string; roomId?: string; userId?: string } | undefined): string | null {
  if (!source) return null
  return source.groupId || source.roomId || source.userId || null
}

export function isGroupOrRoom(source: { type?: string } | undefined): boolean {
  return source?.type === 'group' || source?.type === 'room'
}

export function isMostlyChinese(text: string): boolean {
  const chars = [...text.replace(/\s+/g, '')]
  if (chars.length === 0) return false
  const cjk = chars.filter((ch) => CJK_RE.test(ch)).length
  return cjk / chars.length >= 0.25
}

export function shouldSkipTranslate(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (trimmed.startsWith(TRANSLATE_MARK)) return true
  if (trimmed.length <= 1) return true
  return false
}

export function parseTranslateCommand(text: string): { action: 'help' | 'off' | 'on'; lang?: LangOption } | null {
  const trimmed = text.trim().replace(/^[@＠]\S+\s+/, '')
  if (!trimmed.startsWith('翻譯') && !trimmed.startsWith('翻译')) return null

  const rest = trimmed.replace(/^翻譯|^翻译/, '').trim()
  if (!rest || rest === '說明' || rest === '说明' || rest === 'help' || rest === '?') {
    return { action: 'help' }
  }
  if (['關', '关', '關閉', '关闭', '停', 'off'].includes(rest)) {
    return { action: 'off' }
  }
  const on = rest.replace(/^開\s*|^开\s*/, '').trim()
  const needle = on.toLowerCase()
  const lang = LANGS.find((item) =>
    item.aliases.some((alias) => {
      const key = alias.toLowerCase()
      return needle === key || needle.startsWith(key)
    }),
  )
  if (!lang) return { action: 'help' }
  return { action: 'on', lang }
}

export function translateHelp(): string {
  return [
    `${BOT_NAME} 即時翻譯（免費，僅此群組）`,
    '',
    '開啟：翻譯 越南',
    '也可：翻譯 印尼／泰文／英文／菲律賓／緬甸／柬埔寨',
    '關閉：翻譯 關',
    '',
    '開啟後，中文會翻成外語，外語會翻成中文。',
  ].join('\n')
}

export function formatTranslation(targetLabel: string, translated: string): string {
  return `${TRANSLATE_MARK} ${targetLabel}：\n${translated}`
}
