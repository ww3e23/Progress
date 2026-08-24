import { isGroupLike, parseFeatures, DEFAULT_FEATURES } from './chats.ts'
import { featureHelp, parseFeatureCommand } from './commands.ts'
import { formatDayShift, formatNightDuty, parseNamesInput, parseRosterPaste } from './duty.ts'
import { allowsAdminPush, allowsScheduledRoster, allowsScheduledWeather } from './pushGuard.ts'
import { menuText } from './reminders.ts'
import { clampMinute, isScheduleDue, scheduleSlot, taipeiParts } from './time.ts'
import { parseTranslateCommand } from './translate.ts'
import { geocodeQuery, weatherLabel, buildWeatherMessage, weatherSiteHint } from './weather.ts'

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

assert(parseFeatureCommand('搜圖 安全帽')?.kind === 'image', 'image command')
assert(parseFeatureCommand('搜圖 安全帽')?.kind === 'image' && parseFeatureCommand('搜圖 安全帽')?.['query'] === '安全帽', 'image query')
assert(parseFeatureCommand('查 鋼筋搭接')?.kind === 'info', 'info command')
assert(parseFeatureCommand('搜 熱危害')?.kind === 'info', 'info search alias')
assert(parseFeatureCommand('天氣')?.kind === 'weather', 'weather command')
assert(parseFeatureCommand('天氣 台中')?.kind === 'weather', 'weather place')
assert(parseFeatureCommand('今晚值班')?.kind === 'duty', 'duty command')
assert(parseFeatureCommand('今日上班')?.kind === 'dayShift', 'day shift command')
assert(parseFeatureCommand('功能')?.kind === 'help', 'help command')
assert(parseFeatureCommand('翻譯快一點') === null, 'faster is not a feature command')
assert(parseFeatureCommand('選單') === null, 'menu stays on reminders')
assert(parseFeatureCommand('搜圖')?.kind === 'image' && parseFeatureCommand('搜圖')?.['query'] === '', 'empty image query')

assert(geocodeQuery('台北') === 'Taipei', 'taipei alias')
assert(geocodeQuery('臺中') === 'Taichung', 'taichung alias')
assert(weatherLabel(81) === '陣雨', 'weather code 81')
assert(weatherLabel(95) === '雷雨', 'weather code 95')
assert(weatherSiteHint(100, 0.6, 27) === '雨天注意濕滑、高處與電氣作業。', 'rain hint')
assert(weatherSiteHint(10, 0, 35) === '高溫注意補水與輪班休息。', 'heat hint')

const weatherText = buildWeatherMessage({
  place: '新竹縣寶山鄉',
  nowTemp: 26,
  nowLabel: '雷雨',
  nowRainMm: 0.6,
  nowWindKmh: 10,
  todayMin: 25,
  todayMax: 27,
  todayLabel: '雷雨',
  todayRainChance: 100,
  todayRainMm: 51,
  tomorrowMin: 24,
  tomorrowMax: 27,
  tomorrowLabel: '雷雨',
  tomorrowRainChance: 98,
})
assert(weatherText === [
  '氣象｜新竹縣寶山鄉',
  '',
  '【現在】',
  '26°C　雷雨',
  '降雨　0.6 mm',
  '風速　10 km/h',
  '',
  '【今日】',
  '25–27°C　雷雨',
  '降雨機率　100%',
  '雨量　51 mm',
  '',
  '【明日】',
  '24–27°C　雷雨',
  '降雨機率　98%',
  '',
  '【工地提醒】',
  '雨天注意濕滑、高處與電氣作業。',
].join('\n'), 'weather layout for LINE')
assert(!weatherText.includes('現在 26°C、雷雨，降雨'), 'old cramped weather line gone')

assert(clampMinute(17, 0) === 17, 'valid minute')
assert(clampMinute(99, 0) === 0, 'invalid minute fallback')
assert(isScheduleDue(17, 42, 17, 42) === true, 'due on the minute')
assert(isScheduleDue(17, 42, 17, 43) === true, 'due one minute late')
assert(isScheduleDue(17, 42, 18, 12) === true, 'due within 30 min grace')
assert(isScheduleDue(17, 42, 18, 13) === false, 'past 30 min grace')
assert(isScheduleDue(17, 42, 17, 41) === false, 'not due early')
assert(scheduleSlot(17, 53) === '1753', 'schedule slot pad')
assert(parseFeatures(JSON.stringify({ weatherMinute: 17 })).weatherMinute === 17, 'weather minute')

const features = parseFeatures(JSON.stringify({
  translate: true,
  translateLang: 'th',
  imageSearch: 1,
  weatherPlace: ' 高雄 ',
  weatherHour: '8',
  nightDuty: {
    enabled: true,
    hour: 21,
    minute: 0,
    period: '05:30-07:30（如遇工班加班配合工班時段）',
    days: { '2026-08-21': [' 范士朋 ', '田啟均'] },
  },
}))
assert(features.translate === true, 'translate flag')
assert(features.translateLang === 'th', 'translate lang')
assert(features.imageSearch === true, 'image coerced')
assert(features.weatherPlace === '高雄', 'place trimmed')
assert(features.weatherHour === 8, 'hour parsed')
assert(features.nightDuty.enabled === true, 'night duty on')
assert(features.nightDuty.days['2026-08-21'].join(',') === '范士朋,田啟均', 'night names cleaned')
assert(features.dayShift.enabled === false, 'day shift default off')
assert(features.safety === false, 'safety default off')

const migrated = parseFeatures(JSON.stringify({ duty: true, dutyHour: 20, dutyPeople: ['阿明'] }))
assert(migrated.nightDuty.enabled === true, 'legacy duty migrated')
assert(migrated.nightDuty.hour === 20, 'legacy duty hour migrated')
assert(Object.keys(migrated.nightDuty.days).length === 0, 'legacy people not treated as every-night roster')

assert(parseNamesInput('范士朋, 田啟均').join(',') === '范士朋,田啟均', 'names split')
assert(parseRosterPaste('8/1 陳學鴻\n8/21 范士朋,田啟均\n2 謝采辰', 2026, 8)['2026-08-01'][0] === '陳學鴻', 'paste month/day')
assert(parseRosterPaste('8/21 范士朋,田啟均', 2026, 8)['2026-08-21'].join(',') === '范士朋,田啟均', 'paste two people')
assert(parseRosterPaste('2 謝采辰', 2026, 8)['2026-08-02'][0] === '謝采辰', 'paste day-only')

const nightOn = {
  ...DEFAULT_FEATURES.nightDuty,
  enabled: true,
  days: { '2026-08-21': ['范士朋', '田啟均'] },
}
const nightOff = { ...DEFAULT_FEATURES.nightDuty, enabled: true, days: {} }
assert(allowsScheduledRoster(nightOn, '2026-08-21') === true, 'night roster match')
assert(allowsScheduledRoster(nightOn, '2026-08-22') === false, 'night roster empty day skip')
assert(allowsScheduledRoster(nightOff, '2026-08-21') === false, 'night roster no names skip')
assert(allowsScheduledWeather({ ...DEFAULT_FEATURES, weather: true }) === true, 'weather cron on')
assert(allowsScheduledWeather({ ...DEFAULT_FEATURES, weather: false }) === false, 'weather cron off')
assert(allowsAdminPush({ ...DEFAULT_FEATURES, translate: true }, 'weather') === false, 'no weather push')
assert(allowsAdminPush({ ...DEFAULT_FEATURES, translate: true }, 'heat') === false, 'no safety push')
assert(allowsAdminPush({ ...DEFAULT_FEATURES, safety: true }, 'heat') === true, 'safety push ok')
assert(allowsAdminPush({ ...DEFAULT_FEATURES, nightDuty: nightOn }, 'nightDuty') === true, 'night push ok')
assert(allowsAdminPush(DEFAULT_FEATURES, 'dayShift') === false, 'day push off')

assert(formatNightDuty(nightOn, '2026-08-21').includes('范士朋、田啟均'), 'night message two people')
assert(formatNightDuty(nightOn, '2026-08-21').includes('05:30-07:30'), 'night period')
assert(formatNightDuty(nightOn, '2026-08-22').includes('尚未排班'), 'night empty day')
assert(formatDayShift({ ...DEFAULT_FEATURES.dayShift, days: { '2026-08-24': ['陳學鴻'] } }, '2026-08-24').includes('陳學鴻'), 'day shift message')
assert(!formatDayShift({ ...DEFAULT_FEATURES.dayShift, days: { '2026-08-24': ['陳學鴻'] } }, '2026-08-24').includes('夜間'), 'day shift not mixed with night')

const help = featureHelp(features, ['即時翻譯（泰文）'])
assert(help.includes('翻譯 泰文'), 'help lists translate')
assert(help.includes('搜圖 安全帽'), 'help lists enabled image')
assert(help.includes('值班'), 'help lists night duty')
const helpNoImage = featureHelp({ ...features, imageSearch: false, nightDuty: DEFAULT_FEATURES.nightDuty }, ['即時翻譯（泰文）'])
assert(!helpNoImage.includes('搜圖 安全帽'), 'help hides disabled image')
assert(!helpNoImage.includes('· 值班'), 'help hides disabled night duty')

const now = taipeiParts()
assert(/^\d{4}-\d{2}-\d{2}$/.test(now.ymd), 'ymd format')
assert(now.hour >= 0 && now.hour <= 23, 'taipei hour')
assert(now.weekday >= 0 && now.weekday <= 6, 'taipei weekday')

assert(parseTranslateCommand('翻譯 關')?.action === 'off', 'translate off still works')
assert(isGroupLike({ id: 'Cabc', type: 'group' }) === true, 'group like')
assert(isGroupLike({ id: 'Uabc', type: 'user' }) === false, 'user not group')
assert(menuText().includes('功能'), 'menu mentions 功能')

console.log('feature tests passed')
