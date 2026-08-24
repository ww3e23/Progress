import { formatTranslation, isMostlyChinese, LANGS, shouldSkipTranslate } from './translate'
import type { Env } from './types'

const MODEL = '@cf/meta/m2m100-1.2b'
const DAILY_LIMIT = 400
const ZH_LABEL = '中文'

type AiResult = { translated_text?: string; translatedText?: string }

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
  const text = data.translated_text || data.translatedText
  return typeof text === 'string' ? text.trim() : ''
}

export async function translateText(env: Env, text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!env.AI) throw new Error('尚未綁定 Workers AI')
  const result = await env.AI.run(MODEL, {
    text,
    source_lang: sourceLang,
    target_lang: targetLang,
  })
  const translated = pickTranslated(result)
  if (!translated) throw new Error('翻譯結果是空的')
  return translated
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
