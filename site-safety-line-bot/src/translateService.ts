import { formatTranslation, isMostlyChinese, LANGS, shouldSkipTranslate } from './translate'
import type { Env } from './types'

const INTERPRETER_PROMPT =
  '台灣工地口譯。只輸出譯文。翻意思，不要硬翻。中文用台灣繁體口語。外語不要夾中文。ปิดบังฝน=遮雨/擋雨，不要翻成直擊。ห้อง=房間。ช่วยหาคนมา=叫人來幫忙。'

const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-flash-latest']
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

function looksWrongLanguage(text: string, targetLang: string): boolean {
  if (targetLang === 'zh') return false
  return isMostlyChinese(text)
}

function pickGeminiText(result: unknown): string {
  const data = result as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''
  return cleanTranslation(text)
}

export async function askGemini(
  env: Env,
  userText: string,
  system = INTERPRETER_PROMPT,
  maxOutputTokens = 128,
): Promise<string> {
  if (!env.GEMINI_API_KEY) return ''
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens,
    },
  }
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        console.error('gemini failed', model, res.status, await res.text())
        continue
      }
      const text = pickGeminiText(await res.json())
      if (text) return text
    } catch (error) {
      console.error('gemini error', model, error)
    }
  }
  return ''
}

async function translateWithGemini(env: Env, text: string, targetLang: string): Promise<string> {
  const targetName = LANG_NAMES[targetLang] || targetLang
  const translated = await askGemini(env, `翻成${targetName}：\n${text}`, INTERPRETER_PROMPT, 128)
  if (translated && !looksWrongLanguage(translated, targetLang)) return translated
  return ''
}

async function translateWithLlm(env: Env, text: string, targetLang: string): Promise<string> {
  if (!env.AI) return ''
  const targetName = LANG_NAMES[targetLang] || targetLang
  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8-fast', {
    messages: [
      {
        role: 'system',
        content: INTERPRETER_PROMPT,
      },
      {
        role: 'user',
        content: `翻成${targetName}：\n${text}`,
      },
    ],
    max_tokens: 128,
  })
  const translated = pickTranslated(result)
  if (translated && !looksWrongLanguage(translated, targetLang)) return translated
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
  try {
    const gemini = await translateWithGemini(env, text, targetLang)
    if (gemini) return gemini
  } catch (error) {
    console.error('gemini translate failed', error)
  }
  if (env.AI) {
    try {
      const llm = await translateWithLlm(env, text, targetLang)
      if (llm) return llm
    } catch (error) {
      console.error('llm translate failed', error)
    }
    const fallback = await translateWithM2m(env, text, sourceLang, targetLang)
    if (fallback) return fallback
  }
  throw new Error('翻譯結果是空的')
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
