import { isGroupLike, parseFeatures, DEFAULT_FEATURES } from './chats.ts'
import { featureHelp, parseFeatureCommand } from './commands.ts'
import { dutyPeopleLine, formatDuty } from './duty.ts'
import { allowsAdminPush, allowsScheduledDuty, allowsScheduledWeather } from './pushGuard.ts'
import { menuText } from './reminders.ts'
import { clampHour, clampMinute, taipeiParts } from './time.ts'
import { parseTranslateCommand } from './translate.ts'
import { geocodeQuery, weatherLabel } from './weather.ts'

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
assert(parseFeatureCommand('功能')?.kind === 'help', 'help command')
assert(parseFeatureCommand('翻譯快一點') === null, 'faster is not a feature command')
assert(parseFeatureCommand('選單') === null, 'menu stays on reminders')
assert(parseFeatureCommand('搜圖')?.kind === 'image' && parseFeatureCommand('搜圖')?.['query'] === '', 'empty image query')

assert(geocodeQuery('台北') === 'Taipei', 'taipei alias')
assert(geocodeQuery('臺中') === 'Taichung', 'taichung alias')
assert(weatherLabel(81) === '陣雨', 'weather code 81')
assert(weatherLabel(95) === '雷雨', 'weather code 95')

assert(clampMinute(17, 0) === 17, 'valid minute')
assert(clampMinute(99, 0) === 0, 'invalid minute fallback')
assert(parseFeatures(JSON.stringify({ weatherMinute: 17 })).weatherMinute === 17, 'weather minute')

const features = parseFeatures(JSON.stringify({
  translate: true,
  translateLang: 'th',
  imageSearch: 1,
  weatherPlace: ' 高雄 ',
  weatherHour: '8',
  dutyPeople: [' 阿明 ', '', '阿華'],
  dutyMode: 'rotate',
}))
assert(features.translate === true, 'translate flag')
assert(features.translateLang === 'th', 'translate lang')
assert(features.imageSearch === true, 'image coerced')
assert(features.weatherPlace === '高雄', 'place trimmed')
assert(features.weatherHour === 8, 'hour parsed')
assert(features.dutyPeople.join(',') === '阿明,阿華', 'people cleaned')
assert(features.dutyMode === 'rotate', 'rotate mode')
assert(features.dutyDays.join(',') === '0,1,2,3,4,5,6', 'default all days')
assert(features.safety === false, 'safety default off')
assert(parseFeatures(JSON.stringify({ dutyDays: [1, 3, 1, 9] })).dutyDays.join(',') === '1,3', 'duty days cleaned')

assert(allowsScheduledWeather({ ...DEFAULT_FEATURES, weather: true }) === true, 'weather cron on')
assert(allowsScheduledWeather({ ...DEFAULT_FEATURES, weather: false }) === false, 'weather cron off')
assert(allowsScheduledDuty({ ...DEFAULT_FEATURES, duty: true, dutyPeople: ['A'], dutyDays: [1, 2] }, 1) === true, 'duty weekday match')
assert(allowsScheduledDuty({ ...DEFAULT_FEATURES, duty: true, dutyPeople: ['A'], dutyDays: [1, 2] }, 3) === false, 'duty weekday skip')
assert(allowsAdminPush({ ...DEFAULT_FEATURES, translate: true }, 'weather') === false, 'no weather push')
assert(allowsAdminPush({ ...DEFAULT_FEATURES, translate: true }, 'heat') === false, 'no safety push')
assert(allowsAdminPush({ ...DEFAULT_FEATURES, safety: true }, 'heat') === true, 'safety push ok')

assert(dutyPeopleLine({ ...DEFAULT_FEATURES, dutyPeople: ['A', 'B', 'C'], dutyMode: 'all' }, 10) === 'A、B、C', 'all duty')
assert(dutyPeopleLine({ ...DEFAULT_FEATURES, dutyPeople: ['A', 'B', 'C'], dutyMode: 'rotate' }, 7) === 'B', 'rotate duty')
assert(formatDuty({ ...DEFAULT_FEATURES, dutyPeople: ['阿明'], dutyMode: 'all' }, 0).includes('阿明'), 'duty message')

const help = featureHelp(features, ['即時翻譯（泰文）'])
assert(help.includes('翻譯 泰文'), 'help lists translate')
assert(help.includes('搜圖 安全帽'), 'help lists enabled image')
const helpNoImage = featureHelp({ ...features, imageSearch: false }, ['即時翻譯（泰文）'])
assert(!helpNoImage.includes('搜圖 安全帽'), 'help hides disabled image')

const now = taipeiParts()
assert(/^\d{4}-\d{2}-\d{2}$/.test(now.ymd), 'ymd format')
assert(now.hour >= 0 && now.hour <= 23, 'taipei hour')
assert(now.weekday >= 0 && now.weekday <= 6, 'taipei weekday')

assert(parseTranslateCommand('翻譯 關')?.action === 'off', 'translate off still works')
assert(isGroupLike({ id: 'Cabc', type: 'group' }) === true, 'group like')
assert(isGroupLike({ id: 'Uabc', type: 'user' }) === false, 'user not group')
assert(menuText().includes('功能'), 'menu mentions 功能')

console.log('feature tests passed')
