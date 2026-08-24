import { parseFeatures, DEFAULT_FEATURES } from './chats.ts'
import { featureHelp, parseFeatureCommand } from './commands.ts'
import { dutyPeopleLine, formatDuty } from './duty.ts'
import { menuText } from './reminders.ts'
import { clampHour, taipeiParts } from './time.ts'
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
assert(parseFeatureCommand('翻譯 泰文') === null, 'translate is not a feature command')
assert(parseFeatureCommand('選單') === null, 'menu stays on reminders')
assert(parseFeatureCommand('搜圖')?.kind === 'image' && parseFeatureCommand('搜圖')?.['query'] === '', 'empty image query')

assert(geocodeQuery('台北') === 'Taipei', 'taipei alias')
assert(geocodeQuery('臺中') === 'Taichung', 'taichung alias')
assert(weatherLabel(81) === '陣雨', 'weather code 81')
assert(weatherLabel(95) === '雷雨', 'weather code 95')

assert(clampHour(7, 0) === 7, 'valid hour')
assert(clampHour(99, 21) === 21, 'invalid hour fallback')

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
assert(parseFeatures(null).weatherPlace === DEFAULT_FEATURES.weatherPlace, 'defaults')

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

assert(parseTranslateCommand('翻譯 關')?.action === 'off', 'translate off still works')
assert(menuText().includes('功能'), 'menu mentions 功能')

console.log('feature tests passed')
