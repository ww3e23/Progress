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
  if (code === 95) return '雷雨'
  if (code === 96 || code === 99) return '雷雨伴冰雹'
  return `天氣代碼 ${code}`
}

function geocodeQuery(place: string): string {
  const trimmed = place.trim()
  if (TW_PLACES[trimmed]) return TW_PLACES[trimmed]
  for (const [zh, en] of Object.entries(TW_PLACES)) {
    if (trimmed.startsWith(zh)) return en
  }
  return trimmed
}

async function geocodeOpenMeteo(query: string): Promise<Geo | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=zh`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as {
    results?: Array<{ name?: string; latitude?: number; longitude?: number }>
  }
  const hit = data.results?.[0]
  if (typeof hit?.latitude !== 'number' || typeof hit?.longitude !== 'number') return null
  return { name: hit.name || query, latitude: hit.latitude, longitude: hit.longitude }
}

async function geocodeNominatim(query: string): Promise<Geo | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${query} 台灣`)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return null
  const data = (await res.json()) as Array<{ lat?: string; lon?: string; name?: string; display_name?: string }>
  const hit = data[0]
  const latitude = Number(hit?.lat)
  const longitude = Number(hit?.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { name: hit?.name || query, latitude, longitude }
}

export async function geocodePlace(place: string): Promise<Geo> {
  const trimmed = place.trim() || '台北'
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

export async function formatWeather(place: string): Promise<string> {
  const geo = await geocodePlace(place)
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${geo.latitude}&longitude=${geo.longitude}` +
    '&current=temperature_2m,weather_code,precipitation,wind_speed_10m' +
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
    daily?: {
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      precipitation_probability_max?: number[]
      precipitation_sum?: number[]
    }
  }
  const current = data.current || {}
  const daily = data.daily || {}
  const todayCode = daily.weather_code?.[0] ?? current.weather_code ?? 0
  const tomorrowCode = daily.weather_code?.[1] ?? todayCode
  const rainHint = (daily.precipitation_probability_max?.[0] || 0) >= 50 || (current.precipitation || 0) > 0
    ? '工地提醒：雨天注意濕滑、高處與電氣作業。'
    : (daily.temperature_2m_max?.[0] || 0) >= 33
      ? '工地提醒：高溫注意補水與輪班休息。'
      : '工地提醒：施工前再看一次現場狀況。'

  return [
    `【氣象】${geo.name}`,
    `現在 ${Math.round(current.temperature_2m || 0)}°C、${weatherLabel(current.weather_code || 0)}，降雨 ${current.precipitation ?? 0}mm，風 ${Math.round(current.wind_speed_10m || 0)}km/h`,
    `今日 ${Math.round(daily.temperature_2m_min?.[0] || 0)}–${Math.round(daily.temperature_2m_max?.[0] || 0)}°C，${weatherLabel(todayCode)}，降雨機率 ${daily.precipitation_probability_max?.[0] ?? 0}%，雨量 ${daily.precipitation_sum?.[0] ?? 0}mm`,
    `明日 ${Math.round(daily.temperature_2m_min?.[1] || 0)}–${Math.round(daily.temperature_2m_max?.[1] || 0)}°C，${weatherLabel(tomorrowCode)}，降雨機率 ${daily.precipitation_probability_max?.[1] ?? 0}%`,
    rainHint,
  ].join('\n')
}

export { weatherLabel, geocodeQuery }
