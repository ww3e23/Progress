import { formatTranslation, isMostlyChinese, LANGS, shouldSkipTranslate } from './translate'
import type { Env } from './types'

const LLM_MODELS = ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-3.1-8b-instruct-fp8-fast']
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
  const messages = [
    {
      role: 'system',
      content: [
        '你是台灣工地口譯，翻譯給現場主管和外籍工人聽。',
        '只輸出譯文，不要解釋、不要加引號。',
        '翻意思，不要逐字硬翻；用自然口語。',
        '目標是中文時，一律用台灣繁體，用語像現場在講話。',
        '泰文 ปิดบังฝน / กันฝน / ที่บังฝน = 遮雨、擋雨、蓋帆布，絕對不要翻成「直擊」。',
        'อาคาร = 棟／建物；ห้อง = 房間／室內；น้ำไหลเข้า = 進水、漏進去。',
        'ช่วยหาคนมา = 找人來幫忙／叫人過來。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `請翻成${targetName}：\n${text}`,
    },
  ]
  for (const model of LLM_MODELS) {
    try {
      const result = await env.AI!.run(model, { messages, max_tokens: 256 })
      const translated = pickTranslated(result)
      if (translated) return translated
    } catch (error) {
      console.error(`${model} translate failed`, error)
    }
  }
  return ''
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
