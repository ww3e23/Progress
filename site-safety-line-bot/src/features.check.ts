import { isGroupLike, parseChatIndex, parseFeatures, DEFAULT_FEATURES } from './chats.ts'
import { featureHelp, parseFeatureCommand, rosterInfoQuery } from './commands.ts'
import { isRebarWeightQuery, rebarWeightTable } from './rebar.ts'
import { formatDayShift, formatNightDuty, formatRosterBySpec, formatRosterMonth, parseNamesInput, parseRosterPaste, resolveRosterSpec } from './duty.ts'
import { featureVolKeys, pickNewestRaw } from './featureStore.ts'
import { allowsAdminPush, allowsScheduledRoster, allowsScheduledWeather } from './pushGuard.ts'
import { menuText } from './reminders.ts'
import { clampMinute, isScheduleDue, scheduleSlot, taipeiParts } from './time.ts'
import { parseTranslateCommand } from './translate.ts'
import { geocodeQuery, weatherLabel, representativeWeatherCode, taiwanSafeWeatherCode, buildWeatherMessage, weatherSiteHint, parseWeatherLink, isWeatherQuery, weatherPlaceFromQuery } from './weather.ts'

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

assert(parseFeatureCommand('*搜圖 安全帽')?.kind === 'image', 'image command')
assert(parseFeatureCommand('*搜圖 安全帽')?.kind === 'image' && parseFeatureCommand('*搜圖 安全帽')?.['query'] === '安全帽', 'image query')
assert(parseFeatureCommand('*查 鋼筋搭接')?.kind === 'info', 'info command')
assert(parseFeatureCommand('*查 模板支撐')?.['query'] === '模板支撐', 'info any topic')
assert(parseFeatureCommand('*查熱危害')?.['query'] === '熱危害', 'info without extra space')
assert(parseFeatureCommand('*查')?.kind === 'info' && parseFeatureCommand('*查')?.['query'] === '', 'empty info query')
assert(parseFeatureCommand('*搜 熱危害')?.kind === 'info', 'info search alias')
assert(isRebarWeightQuery('列出所有鋼筋號數以及對應的重量') === true, 'rebar weight query')
assert(isRebarWeightQuery('鋼筋搭接') === false, 'lap splice is not weight table')
assert(isRebarWeightQuery('D25一米多重') === true, 'single size weight')
assert(isRebarWeightQuery('钢筋重量') === true, 'simplified rebar weight')
assert(rebarWeightTable().includes('D25（#8）　3.98'), 'rebar D25 weight')
assert(rebarWeightTable().includes('0.56'), 'rebar D10 weight')
assert(rebarWeightTable().includes('D36（#11）　7.90'), 'rebar D36 weight')
assert(parseFeatureCommand('*天氣')?.kind === 'weather', 'weather command')
assert(parseFeatureCommand('*天氣 台中')?.kind === 'weather', 'weather place')
assert(parseFeatureCommand('*值班')?.kind === 'duty', 'duty command')
assert(parseFeatureCommand('＊今晚值班')?.kind === 'duty', 'fullwidth star duty')
assert(parseFeatureCommand('*值班 本月')?.kind === 'duty' && parseFeatureCommand('*值班 本月')?.['spec'] === '本月', 'duty month command')
assert(parseFeatureCommand('*明天值班')?.kind === 'duty' && parseFeatureCommand('*明天值班')?.['spec'] === '明天', 'time-first tomorrow duty')
assert(parseFeatureCommand('*昨天值班')?.['spec'] === '昨天', 'time-first yesterday duty')
assert(parseFeatureCommand('*7天值班')?.['spec'] === '7天', 'time-first week duty')
assert(parseFeatureCommand('*本月值班')?.['spec'] === '本月', 'time-first month duty')
assert(parseFeatureCommand('*明天上班')?.kind === 'dayShift' && parseFeatureCommand('*明天上班')?.['spec'] === '明天', 'time-first tomorrow shift')
assert(parseFeatureCommand('*昨天上班')?.kind === 'dayShift' && parseFeatureCommand('*昨天上班')?.['spec'] === '昨天', 'time-first yesterday shift')
assert(parseFeatureCommand('*7天上班')?.['spec'] === '7天', 'time-first week shift')
assert(parseFeatureCommand('*本月上班')?.['spec'] === '本月', 'time-first month shift')
assert(parseFeatureCommand('*9/8值班')?.['spec'] === '9/8', 'time-first dated duty')
assert(parseFeatureCommand('明天值班') === null, 'time-first duty still needs star')
assert(parseFeatureCommand('*值班 昨天')?.['spec'] === '昨天', 'duty yesterday command')
assert(parseFeatureCommand('*值班 7天')?.['spec'] === '7天', 'duty week command')
assert(parseFeatureCommand('*上班 明天')?.kind === 'dayShift' && parseFeatureCommand('*上班 明天')?.['spec'] === '明天', 'day shift tomorrow')
assert(parseFeatureCommand('*值班 9/8')?.['spec'] === '9/8', 'duty date command')
assert(parseFeatureCommand('*上班')?.kind === 'dayShift', 'day shift command')
assert(rosterInfoQuery('值班')?.kind === 'night', 'info duty uses roster')
assert(rosterInfoQuery('昨天值班')?.spec === '昨天', 'info yesterday duty')
assert(rosterInfoQuery('7天上班')?.kind === 'day' && rosterInfoQuery('7天上班')?.spec === '7天', 'info week day shift')
assert(rosterInfoQuery('本月值班')?.spec === '本月', 'info month duty uses roster')
assert(rosterInfoQuery('熱危害') === null, 'other info not roster')
assert(parseFeatureCommand('*功能')?.kind === 'help', 'help command')
assert(parseFeatureCommand('值班') === null, 'duty without star is ignored')
assert(parseFeatureCommand('天氣') === null, 'weather without star is ignored')
assert(parseFeatureCommand('查 鋼筋搭接') === null, 'info without star is ignored')
assert(parseFeatureCommand('翻譯快一點') === null, 'faster is not a feature command')
assert(parseFeatureCommand('選單') === null, 'menu stays on reminders')
assert(parseFeatureCommand('*搜圖')?.kind === 'image' && parseFeatureCommand('*搜圖')?.['query'] === '', 'empty image query')

assert(geocodeQuery('台北') === 'Taipei', 'taipei alias')
assert(geocodeQuery('臺中') === 'Taichung', 'taichung alias')
assert(geocodeQuery('新竹') === 'Hsinchu', 'hsinchu city alias')
assert(geocodeQuery('新竹縣寶山鄉') === '新竹縣寶山鄉', 'do not map township to city')
assert(isWeatherQuery('今天新竹會不會下冰雹') === true, 'hail question is weather')
assert(weatherPlaceFromQuery('新竹縣寶山鄉天氣', '台北') === '新竹縣寶山鄉', 'weather place 寶山')
assert(weatherPlaceFromQuery('今天會不會下冰雹', '新竹縣寶山鄉') === '新竹縣寶山鄉', 'weather fallback place')
assert(weatherLabel(81) === '陣雨', 'weather code 81')
assert(weatherLabel(95) === '雷雨', 'weather code 95')
assert(weatherLabel(96) === '雷雨', 'hail code is still 雷雨 for Taiwan')
assert(weatherLabel(99) === '雷雨', 'heavy hail code is still 雷雨')
assert(weatherLabel(56) === '毛毛雨', 'freezing drizzle is 毛毛雨')
assert(weatherLabel(67) === '雨', 'freezing rain is 雨')
assert(weatherLabel(75) === '雨', 'snow code is 雨 on Taiwan sites')
assert(weatherLabel(85) === '陣雨', 'snow shower is 陣雨')
assert(taiwanSafeWeatherCode(48) === 45, 'rime fog is fog')
assert(!weatherLabel(71).includes('雪'), 'do not say 雪')
assert(!weatherLabel(96).includes('冰雹'), 'do not say 冰雹')
assert(representativeWeatherCode([0, 0, 2, 96, 95, 95, 51]) === 95, 'one hail hour does not headline the day')
assert(representativeWeatherCode([51, 51, 3, 1], 96) === 51, 'drizzle day not hail')
assert(weatherSiteHint(100, 0.6, 27) === '雨天注意濕滑、高處與電氣作業。', 'rain hint')
assert(weatherSiteHint(100, 0.6, 27, '雷雨') === '午後可能有雷陣雨，高處、起重與電氣作業留意。', 'thunder hint')
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
  '午後可能有雷陣雨，高處、起重與電氣作業留意。',
].join('\n'), 'weather layout for LINE')
assert(!weatherText.includes('現在 26°C、雷雨，降雨'), 'old cramped weather line gone')
assert(!weatherText.includes('【參考】'), 'no source link by default')
assert(parseWeatherLink('') === '', 'empty weather link')
assert(parseWeatherLink('open-meteo') === 'open-meteo', 'open-meteo token')
assert(parseWeatherLink('javascript:alert(1)') === '', 'reject javascript link')
assert(parseWeatherLink('https://www.cwa.gov.tw/V8/C/').startsWith('https://www.cwa.gov.tw/'), 'https weather link')
assert(buildWeatherMessage({
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
  link: 'https://open-meteo.com/',
}).includes('https://open-meteo.com/'), 'optional source link')

assert(clampMinute(17, 0) === 17, 'valid minute')
assert(clampMinute(99, 0) === 0, 'invalid minute fallback')
assert(isScheduleDue(17, 42, 17, 42) === true, 'due on the minute')
assert(isScheduleDue(17, 42, 17, 43) === true, 'due one minute late')
assert(isScheduleDue(17, 42, 17, 45) === true, 'due within 3 min grace')
assert(isScheduleDue(17, 42, 17, 46) === false, 'past 3 min grace')
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
assert(!formatNightDuty(nightOn, '2026-08-21').includes('請完成巡視'), 'no hardcoded patrol line')
assert(formatNightDuty({ ...nightOn, remark: '請確認出入口上鎖。' }, '2026-08-21').includes('請確認出入口上鎖。'), 'custom remark')
assert(formatNightDuty(nightOn, '2026-08-22').includes('尚未排班'), 'night empty day')
assert(formatNightDuty(nightOn, '2026-08-20').includes('最近已排：2026-08-21'), 'empty today still shows nearby roster')
assert(formatRosterMonth('night', nightOn, 2026, 8).includes('8/21（五） 范士朋、田啟均'), 'month roster lists names')
assert(formatRosterMonth('night', nightOn, 2026, 9).includes('尚未排班'), 'other month empty')

const dutyNow = { year: 2026, month: 9, day: 5, hour: 17, minute: 19, weekday: 6, ymd: '2026-09-05', dayOfYear: 247 }
assert(resolveRosterSpec(undefined, dutyNow).ymd === '2026-09-05', 'duty default today')
assert(resolveRosterSpec('昨天', dutyNow).ymd === '2026-09-04', 'duty yesterday')
assert(resolveRosterSpec('明天', dutyNow).ymd === '2026-09-06', 'duty tomorrow')
assert(resolveRosterSpec('本月', dutyNow).mode === 'list' && resolveRosterSpec('本月', dutyNow).ymds.length === 30, 'duty this month')
assert(resolveRosterSpec('7天', dutyNow).mode === 'list' && resolveRosterSpec('7天', dutyNow).ymds.join(',') === '2026-09-05,2026-09-06,2026-09-07,2026-09-08,2026-09-09,2026-09-10,2026-09-11', 'duty next 7 days')
assert(resolveRosterSpec('9/8', dutyNow).ymd === '2026-09-08', 'duty month/day')
assert(formatRosterBySpec('night', nightOn, resolveRosterSpec('7天', { ...dutyNow, ymd: '2026-08-21', year: 2026, month: 8, day: 21 })).includes('8/21（五） 范士朋、田啟均'), '7 day list includes filled day')
assert(formatRosterBySpec('night', nightOn, resolveRosterSpec('7天', { ...dutyNow, ymd: '2026-08-21', year: 2026, month: 8, day: 21 })).includes('尚未排班'), '7 day list shows empty days')
assert(pickNewestRaw(['{"updatedAt":1}', '{"updatedAt":9,"ok":true}', '{"updatedAt":3}'])?.includes('"ok":true') === true, 'newest feature raw')
assert(featureVolKeys('Cabc', 1_000_000).read.length === 2, 'volatile read keys')
assert(featureVolKeys('Cabc', 1_000_000).write.length === 6, 'volatile write keys')
assert(formatDayShift({ ...DEFAULT_FEATURES.dayShift, days: { '2026-08-24': ['陳學鴻'] } }, '2026-08-24').includes('陳學鴻'), 'day shift message')
assert(!formatDayShift({ ...DEFAULT_FEATURES.dayShift, days: { '2026-08-24': ['陳學鴻'] } }, '2026-08-24').includes('夜間'), 'day shift not mixed with night')

const help = featureHelp(features, ['即時翻譯（泰文）'])
assert(help.includes('翻譯 泰文'), 'help lists translate')
assert(help.includes('*搜圖 安全帽'), 'help lists enabled image')
assert(help.includes('*值班'), 'help lists night duty')
assert(help.includes('*明天值班'), 'help lists time-first duty')
assert(help.includes('*7天值班'), 'help lists week duty')
assert(featureHelp(features, ['即時翻譯（泰文）'], 'Cabc123').includes('此群 ID：Cabc123'), 'help shows group id')
assert(featureHelp({ ...features, infoSearch: true }, ['即時翻譯（泰文）']).includes('*查 熱危害'), 'help says any site question')
const helpNoImage = featureHelp({ ...features, imageSearch: false, nightDuty: DEFAULT_FEATURES.nightDuty }, ['即時翻譯（泰文）'])
assert(!helpNoImage.includes('*搜圖 安全帽'), 'help hides disabled image')
assert(!helpNoImage.includes('*值班'), 'help hides disabled night duty')

const now = taipeiParts()
assert(/^\d{4}-\d{2}-\d{2}$/.test(now.ymd), 'ymd format')
assert(now.hour >= 0 && now.hour <= 23, 'taipei hour')
assert(now.weekday >= 0 && now.weekday <= 6, 'taipei weekday')

assert(parseTranslateCommand('翻譯 關')?.action === 'off', 'translate off still works')
assert(isGroupLike({ id: 'Cabc', type: 'group' }) === true, 'group like')
assert(isGroupLike({ id: 'Uabc', type: 'user' }) === false, 'user not group')
assert(parseChatIndex(null).length === 0, 'empty index')
assert(parseChatIndex('{"ids":["Caaa","Caaa","Cbbb"]}').join(',') === 'Caaa,Cbbb', 'unique index ids')
assert(parseChatIndex('["Cxxx"]').join(',') === 'Cxxx', 'array index')
assert(menuText().includes('功能'), 'menu mentions 功能')

console.log('feature tests passed')
