import { formatTranslation, isMostlyChinese, LANGS, shouldSkipTranslate } from './translate'
import type { Env } from './types'

const LLM_MODEL = '@cf/meta/llama-3.2-3b-instruct'
const FALLBACK_MODEL = '@cf/meta/m2m100-1.2b'
const DAILY_LIMIT = 400
const ZH_LABEL = '中文'

const LANG_NAMES: Record<string, string> = {
  zh: 'Traditional Chinese (Taiwan, 繁體中文)',
  vi: 'Vietnamese',
  id: 'Indonesian',
  th: 'Thai',
  en: 'English',
  tl: 'Filipino (Tagalog)',
  my: 'Burmese',
  km: 'Khmer',
}

type AiResult = {
  translated_text?: string
  translatedText?: string
  response?: string
}

function kvKey(chatId: string): string {
  return `lang:${chatId}`
}

function quotaKey(day: string): string {
  return `quota:${day}`
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getTranslateLang(env: Env, chatId: string): Promise<string | null> {
  if (!env.TRANSLATE_KV) return null
  return env.TRANSLATE_KV.get(kvKey(chatId))
}

export async function setTranslateLang(env: Env, chatId: string, lang: string | null): Promise<void> {
  if (!env.TRANSLATE_KV) throw new Error('尚未綁定 TRANSLATE_KV')
  if (!lang) {
    await env.TRANSLATE_KV.delete(kvKey(chatId))
    return
  }
  await env.TRANSLATE_KV.put(kvKey(chatId), lang)
}

async function underQuota(env: Env): Promise<boolean> {
  if (!env.TRANSLATE_KV) return true
  const raw = await env.TRANSLATE_KV.get(quotaKey(todayUtc()))
  const count = raw ? Number(raw) : 0
  return Number.isFinite(count) && count < DAILY_LIMIT
}

async function bumpQuota(env: Env): Promise<void> {
  if (!env.TRANSLATE_KV) return
  const key = quotaKey(todayUtc())
  const raw = await env.TRANSLATE_KV.get(key)
  const count = raw ? Number(raw) : 0
  await env.TRANSLATE_KV.put(key, String(count + 1), { expirationTtl: 60 * 60 * 48 })
}

function pickTranslated(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const data = result as AiResult
  const text = data.response || data.translated_text || data.translatedText
  return typeof text === 'string' ? cleanTranslation(text) : ''
}

function cleanTranslation(text: string): string {
  return text
    .trim()
    .replace(/^["「『]|["」』]$/g, '')
    .replace(/^(translation|translated|thai|vietnamese|indonesian|english|chinese)\s*[:：]\s*/i, '')
    .trim()
}

async function translateWithLlm(env: Env, text: string, targetLang: string): Promise<string> {
  const targetName = LANG_NAMES[targetLang] || targetLang
  const result = await env.AI!.run(LLM_MODEL, {
    messages: [
      {
        role: 'system',
        content:
          'You are a Taiwan construction-site interpreter. Translate the user message into the requested language. Output ONLY the translation, no quotes and no explanation. Keep numbers, times, names. If the target is Chinese, use Traditional Chinese (台灣用語). Use jobsite terms correctly: 安全帽=safety helmet, 鷹架=scaffold, 灌漿=grouting, 收工=knock off, 缺失=defect.',
      },
      {
        role: 'user',
        content: `Translate into ${targetName}:\n${text}`,
      },
    ],
    max_tokens: 256,
  })
  return pickTranslated(result)
}

async function translateWithM2m(env: Env, text: string, sourceLang: string, targetLang: string): Promise<string> {
  const result = await env.AI!.run(FALLBACK_MODEL, {
    text,
    source_lang: sourceLang,
    target_lang: targetLang,
  })
  return pickTranslated(result)
}

export async function translateText(env: Env, text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!env.AI) throw new Error('尚未綁定 Workers AI')
  try {
    const llm = await translateWithLlm(env, text, targetLang)
    if (llm) return llm
  } catch (error) {
    console.error('llm translate failed', error)
  }
  const fallback = await translateWithM2m(env, text, sourceLang, targetLang)
  if (!fallback) throw new Error('翻譯結果是空的')
  return fallback
}

export async function translateForChat(env: Env, chatId: string, text: string): Promise<string | null> {
  if (shouldSkipTranslate(text)) return null
  const lang = await getTranslateLang(env, chatId)
  if (!lang) return null
  if (!(await underQuota(env))) {
    return '今日翻譯次數已達上限，明天再繼續。'
  }

  const option = LANGS.find((item) => item.code === lang)
  const toChinese = !isMostlyChinese(text)
  const sourceLang = toChinese ? lang : 'zh'
  const targetLang = toChinese ? 'zh' : lang
  const label = toChinese ? ZH_LABEL : option?.label || lang

  const translated = await translateText(env, text, sourceLang, targetLang)
  if (!translated || translated === text) return null
  await bumpQuota(env)
  return formatTranslation(label, translated)
}
