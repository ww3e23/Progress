import { askGemini } from './translateService'
import type { Env } from './types'

const UA = 'site-safety-line-bot/1.0 (https://workers.dev)'
const SYSTEM =
  '你是台灣工地現場助理。用台灣繁體中文簡短回答，最多 8 行，條列重點。不要捏造法規條號或數字。不確定就明說。'

function wikiRelevant(query: string, title: string, extract: string): boolean {
  const q = query.replace(/\s+/g, '')
  if (q.length < 2) return false
  return title.includes(q) || extract.includes(q)
}

async function wikipediaExtract(query: string): Promise<string> {
  const searchUrl =
    'https://zh.wikipedia.org/w/api.php?action=query&list=search&utf8=1&format=json' +
    `&srlimit=3&srsearch=${encodeURIComponent(query)}`
  const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!searchRes.ok) return ''
  const searchData = (await searchRes.json()) as {
    query?: { search?: Array<{ title?: string }> }
  }
  const title = (searchData.query?.search || []).map((item) => item.title || '').find((item) => item.includes(query.replace(/\s+/g, '')) || query.includes(item)) || searchData.query?.search?.[0]?.title
  if (!title) return ''

  const extractUrl =
    'https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json' +
    `&titles=${encodeURIComponent(title)}`
  const extractRes = await fetch(extractUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!extractRes.ok) return ''
  const extractData = (await extractRes.json()) as {
    query?: { pages?: Record<string, { title?: string; extract?: string }> }
  }
  const page = Object.values(extractData.query?.pages || {})[0]
  const extract = page?.extract?.replace(/\s+/g, ' ').trim() || ''
  if (!extract) return ''
  const heading = page?.title || title
  if (!wikiRelevant(query, heading, extract)) return ''
  return `【${heading}】\n${extract.slice(0, 500)}`
}

export async function searchInfo(env: Env, query: string): Promise<string> {
  const q = query.trim().slice(0, 200)
  if (!q) return '請輸入要查的內容，例如：查 鋼筋搭接'

  let gemini = ''
  try {
    gemini = await askGemini(env, `工地問題：${q}`, SYSTEM, 256)
  } catch (error) {
    console.error('info gemini failed', error)
  }

  let wiki = ''
  try {
    wiki = await wikipediaExtract(q)
  } catch (error) {
    console.error('wikipedia failed', error)
  }

  if (gemini && wiki) return `${gemini}\n\n參考：${wiki.split('\n')[0]}`
  if (gemini) return gemini
  if (wiki) return wiki
  throw new Error('查不到資料，請換個關鍵字再試')
}
