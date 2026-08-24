import { askGemini } from './translateService'
import { infoUsage } from './commands'
import { isRebarWeightQuery, rebarWeightTable } from './rebar.ts'
import type { Env } from './types'

export { isRebarWeightQuery, rebarWeightTable }

const UA = 'site-safety-line-bot/1.0 (https://workers.dev)'
const SYSTEM =
  '你是台灣工地現場助理。用台灣繁體中文回答。用「· 」條列，不要 markdown、不要用星號當粗體。工地常用對照表（例如鋼筋號數與 kg/m）請直接列出公認數字，不要叫對方去查表。不要杜撰法規條號。沒把握的數字就說不確定。表格類最多 20 行。'

export function formatInfoForLine(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^[\s>*]*[-*]\s+/gm, '· ')
    .replace(/^\s*\d+\.\s+/gm, '· ')
    .replace(/\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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
  if (!q) return infoUsage()
  if (isRebarWeightQuery(q)) return rebarWeightTable()

  let gemini = ''
  try {
    gemini = await askGemini(env, `工地問題：${q}`, SYSTEM, 512)
  } catch (error) {
    console.error('info gemini failed', error)
  }

  let wiki = ''
  try {
    wiki = await wikipediaExtract(q)
  } catch (error) {
    console.error('wikipedia failed', error)
  }

  if (gemini && wiki) return formatInfoForLine(`${gemini}\n\n參考：${wiki.split('\n')[0]}`)
  if (gemini) return formatInfoForLine(gemini)
  if (wiki) return formatInfoForLine(wiki)
  throw new Error('查不到資料，請換個關鍵字再試')
}
