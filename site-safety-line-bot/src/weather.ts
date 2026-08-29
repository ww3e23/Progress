const TW_PLACES: Record<string, string> = {
  台北: 'Taipei',
  臺北: 'Taipei',
  台北市: 'Taipei',
  臺北市: 'Taipei',
  新北: 'New Taipei',
  新北市: 'New Taipei',
  基隆: 'Keelung',
  桃園: 'Taoyuan',
  新竹: 'Hsinchu',
  苗栗: 'Miaoli',
  台中: 'Taichung',
  臺中: 'Taichung',
  彰化: 'Changhua',
  南投: 'Nantou',
  雲林: 'Yunlin',
  嘉義: 'Chiayi',
  台南: 'Tainan',
  臺南: 'Tainan',
  高雄: 'Kaohsiung',
  屏東: 'Pingtung',
  宜蘭: 'Yilan',
  花蓮: 'Hualien',
  台東: 'Taitung',
  臺東: 'Taitung',
  澎湖: 'Penghu',
  金門: 'Kinmen',
  馬祖: 'Matsu',
}

const UA = 'site-safety-line-bot/1.0 (https://workers.dev)'

const TW_COORDS: Record<string, { latitude: number; longitude: number }> = {
  新竹縣寶山鄉: { latitude: 24.76545, longitude: 120.99098 },
  寶山鄉: { latitude: 24.76545, longitude: 120.99098 },
}

interface Geo {
  name: string
  latitude: number
  longitude: number
}

function weatherLabel(code: number): string {
  if (code === 0) return '晴'
  if (code === 1) return '多雲時晴'
  if (code === 2) return '多雲'
  if (code === 3) return '陰'
  if (code === 45 || code === 48) return '霧'
  if (code >= 51 && code <= 57) return '毛毛雨'
  if (code >= 61 && code <= 67) return '雨'
  if (code === 80 || code === 81) return '陣雨'
  if (code === 82) return '大雨'
  if (code >= 71 && code <= 77) return '雪'
  if (code === 95 || code === 96 || code === 99) return '雷雨'
  return `天氣代碼 ${code}`
}

export function representativeWeatherCode(codes: number[], fallback = 0): number {
  const normalized = codes
    .filter((code) => Number.isFinite(code))
    .map((code) => (code === 96 || code === 99 ? 95 : code))
  if (normalized.length === 0) return fallback === 96 || fallback === 99 ? 95 : fallback
  if (normalized.some((code) => code === 95)) return 95
  if (normalized.some((code) => code === 82)) return 82
  if (normalized.some((code) => code === 80 || code === 81)) return 81
  if (normalized.some((code) => code >= 61 && code <= 67)) return 63
  if (normalized.some((code) => code >= 51 && code <= 57)) return 51
  if (normalized.some((code) => code === 45 || code === 48)) return 45
  if (normalized.some((code) => code === 3)) return 3
  if (normalized.some((code) => code === 2)) return 2
  if (normalized.some((code) => code === 1)) return 1
  return normalized[0] ?? fallback
}

function codesForDay(times: string[] | undefined, codes: number[] | undefined, ymd: string): number[] {
  if (!times || !codes || !ymd) return []
  const out: number[] = []
  for (let i = 0; i < times.length; i += 1) {
    if (times[i]?.startsWith(ymd)) out.push(Number(codes[i] ?? 0))
  }
  return out
}

function geocodeQuery(place: string): string {
  const trimmed = place.trim()
  if (TW_PLACES[trimmed]) return TW_PLACES[trimmed]
  for (const [zh, en] of Object.entries(TW_PLACES)) {
    if (trimmed === zh || trimmed === `${zh}市` || trimmed === `${zh}縣`) return en
  }
  return trimmed
}

function knownTaiwanPlace(place: string): Geo | null {
  const hit = TW_COORDS[place]
  if (!hit) return null
  return { name: place, ...hit }
}

async function geocodeOpenMeteo(query: string): Promise<Geo | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=zh`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as {
    results?: Array<{ name?: string; latitude?: number; longitude?: number; country_code?: string }>
  }
  const chosen = (data.results || []).find((item) => item.country_code === 'TW')
  if (typeof chosen?.latitude !== 'number' || typeof chosen?.longitude !== 'number') return null
  return { name: chosen.name || query, latitude: chosen.latitude, longitude: chosen.longitude }
}

async function geocodeNominatim(query: string): Promise<Geo | null> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=tw&addressdetails=1' +
    `&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return null
  const data = (await res.json()) as Array<{
    lat?: string
    lon?: string
    name?: string
    class?: string
    addresstype?: string
    display_name?: string
  }>
  const hit =
    data.find((item) => item.class === 'boundary' || ['town', 'city', 'suburb', 'village', 'county'].includes(item.addresstype || '')) ||
    data[0]
  const latitude = Number(hit?.lat)
  const longitude = Number(hit?.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { name: hit?.name || query, latitude, longitude }
}

export async function geocodePlace(place: string): Promise<Geo> {
  const trimmed = place.trim() || '台北'
  const known = knownTaiwanPlace(trimmed)
  if (known) return known
  if (/[鄉鎮市區村]/.test(trimmed)) {
    const township = await geocodeNominatim(trimmed)
    if (township) return { ...township, name: trimmed }
  }
  const mapped = geocodeQuery(trimmed)
  const first = await geocodeOpenMeteo(mapped)
  if (first) return { ...first, name: trimmed }
  if (mapped !== trimmed) {
    const second = await geocodeOpenMeteo(trimmed)
    if (second) return { ...second, name: trimmed }
  }
  const nominatim = await geocodeNominatim(trimmed)
  if (nominatim) return { ...nominatim, name: trimmed }
  throw new Error(`找不到地點：${trimmed}`)
}

export interface WeatherSnapshot {
  place: string
  nowTemp: number
  nowLabel: string
  nowRainMm: number
  nowWindKmh: number
  todayMin: number
  todayMax: number
  todayLabel: string
  todayRainChance: number
  todayRainMm: number
  tomorrowMin: number
  tomorrowMax: number
  tomorrowLabel: string
  tomorrowRainChance: number
  link?: string
}

export function parseWeatherLink(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const text = raw.trim()
  if (!text) return ''
  if (/^open-meteo$/i.test(text)) return 'open-meteo'
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString().slice(0, 300)
  } catch {
    return ''
  }
}

export function openMeteoPageUrl(latitude: number, longitude: number): string {
  return `https://open-meteo.com/en/docs#latitude=${latitude}&longitude=${longitude}`
}

function formatMm(value: number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0 mm'
  const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
  return `${text} mm`
}

export function weatherSiteHint(rainChance: number, nowRainMm: number, todayMax: number, todayLabel = ''): string {
  if (todayLabel.includes('雷雨')) return '午後可能有雷陣雨，高處、起重與電氣作業留意。'
  if (rainChance >= 50 || nowRainMm > 0) return '雨天注意濕滑、高處與電氣作業。'
  if (todayMax >= 33) return '高溫注意補水與輪班休息。'
  return '施工前再看一次現場狀況。'
}

export function buildWeatherMessage(weather: WeatherSnapshot): string {
  const lines = [
    `氣象｜${weather.place}`,
    '',
    '【現在】',
    `${weather.nowTemp}°C　${weather.nowLabel}`,
    `降雨　${formatMm(weather.nowRainMm)}`,
    `風速　${weather.nowWindKmh} km/h`,
    '',
    '【今日】',
    `${weather.todayMin}–${weather.todayMax}°C　${weather.todayLabel}`,
    `降雨機率　${weather.todayRainChance}%`,
    `雨量　${formatMm(weather.todayRainMm)}`,
    '',
    '【明日】',
    `${weather.tomorrowMin}–${weather.tomorrowMax}°C　${weather.tomorrowLabel}`,
    `降雨機率　${weather.tomorrowRainChance}%`,
    '',
    '【工地提醒】',
    weatherSiteHint(weather.todayRainChance, weather.nowRainMm, weather.todayMax, weather.todayLabel),
  ]
  if (weather.link) {
    lines.push('', '【參考】', weather.link)
  }
  return lines.join('\n')
}

export async function formatWeather(place: string, link = ''): Promise<string> {
  const geo = await geocodePlace(place)
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${geo.latitude}&longitude=${geo.longitude}` +
    '&current=temperature_2m,weather_code,precipitation,wind_speed_10m' +
    '&hourly=weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum' +
    '&timezone=Asia%2FTaipei&forecast_days=2'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`氣象服務失敗（${res.status}）`)
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number
      weather_code?: number
      precipitation?: number
      wind_speed_10m?: number
    }
    hourly?: {
      time?: string[]
      weather_code?: number[]
    }
    daily?: {
      time?: string[]
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      precipitation_probability_max?: number[]
      precipitation_sum?: number[]
    }
  }
  const current = data.current || {}
  const daily = data.daily || {}
  const todayYmd = daily.time?.[0] || ''
  const tomorrowYmd = daily.time?.[1] || ''
  const todayCode = representativeWeatherCode(codesForDay(data.hourly?.time, data.hourly?.weather_code, todayYmd), daily.weather_code?.[0] ?? current.weather_code ?? 0)
  const tomorrowCode = representativeWeatherCode(codesForDay(data.hourly?.time, data.hourly?.weather_code, tomorrowYmd), daily.weather_code?.[1] ?? todayCode)
  const parsedLink = parseWeatherLink(link)
  const resolvedLink = parsedLink === 'open-meteo' ? openMeteoPageUrl(geo.latitude, geo.longitude) : parsedLink
  return buildWeatherMessage({
    place: geo.name,
    nowTemp: Math.round(current.temperature_2m || 0),
    nowLabel: weatherLabel(current.weather_code || 0),
    nowRainMm: Number(current.precipitation ?? 0),
    nowWindKmh: Math.round(current.wind_speed_10m || 0),
    todayMin: Math.round(daily.temperature_2m_min?.[0] || 0),
    todayMax: Math.round(daily.temperature_2m_max?.[0] || 0),
    todayLabel: weatherLabel(todayCode),
    todayRainChance: daily.precipitation_probability_max?.[0] ?? 0,
    todayRainMm: Number(daily.precipitation_sum?.[0] ?? 0),
    tomorrowMin: Math.round(daily.temperature_2m_min?.[1] || 0),
    tomorrowMax: Math.round(daily.temperature_2m_max?.[1] || 0),
    tomorrowLabel: weatherLabel(tomorrowCode),
    tomorrowRainChance: daily.precipitation_probability_max?.[1] ?? 0,
    link: resolvedLink,
  })
}

export function isWeatherQuery(query: string): boolean {
  const text = query.replace(/\s+/g, '')
  return /天氣|天气|氣象|气象|預報|预报|降雨|下雨|幾度|几度|冰雹|雷雨|颱風|台风/.test(text)
}

export function weatherPlaceFromQuery(query: string, fallback = '台北'): string {
  const text = query.trim()
  if (/寶山/.test(text)) return '新竹縣寶山鄉'
  const place = text
    .replace(/今天|今日|明天|明日|會不會|会不会|有沒有|有没有|嗎|吗|呢|怎麼|怎么/g, ' ')
    .replace(/天氣|天气|氣象|气象|預報|预报|降雨|下雨|幾度|几度|冰雹|雷雨|伴隨|伴随|少量|短暫|短暂/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!place || /^(下|有|的|是)+$/.test(place)) return fallback
  return place
}

export { weatherLabel, geocodeQuery }
