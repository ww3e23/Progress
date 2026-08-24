export interface FoundImage {
  url: string
  preview: string
  title: string
}

const UA = 'site-safety-line-bot/1.0 (https://workers.dev)'

function flickrPreview(url: string): string {
  return url.replace(/_b\.(jpe?g|png)$/i, '_z.$1').replace(/_o\.(jpe?g|png)$/i, '_z.$1')
}

function isHttpsImage(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && /\.(jpe?g|png)(\?|$)/i.test(parsed.pathname + parsed.search)
  } catch {
    return false
  }
}

async function fromOpenverse(query: string): Promise<FoundImage[]> {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=6`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return []
  const data = (await res.json()) as {
    results?: Array<{ url?: string; thumbnail?: string; title?: string }>
  }
  const images: FoundImage[] = []
  for (const item of data.results || []) {
    const original = item.url || ''
    if (!isHttpsImage(original) && !original.startsWith('https://')) continue
    if (!original.startsWith('https://')) continue
    images.push({
      url: original,
      preview: item.thumbnail || flickrPreview(original),
      title: item.title || query,
    })
    if (images.length >= 2) break
  }
  return images
}

async function fromWikimedia(query: string): Promise<FoundImage[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6' +
    `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=1024&format=json`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return []
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string }> }> }
  }
  const images: FoundImage[] = []
  for (const page of Object.values(data.query?.pages || {})) {
    const info = page.imageinfo?.[0]
    const mime = info?.mime || ''
    if (mime && mime !== 'image/jpeg' && mime !== 'image/png') continue
    const original = info?.url || info?.thumburl || ''
    if (!original.startsWith('https://')) continue
    images.push({
      url: original,
      preview: info?.thumburl || original,
      title: (page.title || query).replace(/^File:/, ''),
    })
    if (images.length >= 2) break
  }
  return images
}

export async function searchImages(query: string): Promise<FoundImage[]> {
  const q = query.trim().slice(0, 80)
  if (!q) return []
  try {
    const openverse = await fromOpenverse(q)
    if (openverse.length > 0) return openverse
  } catch (error) {
    console.error('openverse failed', error)
  }
  try {
    return await fromWikimedia(q)
  } catch (error) {
    console.error('wikimedia failed', error)
    return []
  }
}
