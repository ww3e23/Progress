import { reminderFromText, isReminderType, menuText } from './reminders.ts'
import { isMostlyChinese, parseTranslateCommand, shouldSkipTranslate, stripLineMentions } from './translate.ts'

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

assert(isReminderType('heat'), 'heat should be valid')
assert(!isReminderType('typhoon'), 'unknown type should be rejected')
assert(reminderFromText('請發熱危害')?.type === 'heat', 'heat keyword')
assert(reminderFromText('高處作業注意')?.type === 'height', 'height keyword')
assert(reminderFromText('今天下雨')?.type === 'rain', 'rain keyword')
assert(reminderFromText('你好') === null, 'unrelated text')
assert(menuText().includes('工程bot'), 'menu should use the new bot name')
assert(menuText().includes('熱危害'), 'menu should list types')

assert(parseTranslateCommand('翻譯 越南')?.lang?.code === 'vi', 'enable vi')
assert(parseTranslateCommand('翻譯 印尼')?.lang?.code === 'id', 'enable id')
assert(parseTranslateCommand('翻譯 關')?.action === 'off', 'disable')
assert(parseTranslateCommand('翻譯')?.action === 'help', 'help')
assert(parseTranslateCommand('翻譯快一點') === null, 'not a translate command')
assert(parseTranslateCommand('翻譯 快一點') === null, 'faster is not help')
assert(parseTranslateCommand('熱危害') === null, 'not a translate command')
assert(isMostlyChinese('明天灌漿請戴安全帽'), 'chinese detect')
assert(!isMostlyChinese('Mai đổ bê tông nhớ đội mũ bảo hộ'), 'vietnamese detect')
assert(shouldSkipTranslate('🌐 中文：hello'), 'skip already translated')
assert(!shouldSkipTranslate('查 鋼筋搭接'), 'plain 查 is not a command')
assert(shouldSkipTranslate('*查 鋼筋搭接'), 'skip starred info command from translate')
assert(shouldSkipTranslate('*搜圖 安全帽'), 'skip starred image command from translate')
assert(stripLineMentions('@范士朋 明天幾點到') === '明天幾點到', 'strip leading mention')
assert(stripLineMentions('@范士朋') === '', 'mention only')
assert(stripLineMentions('明天幾點到') === '明天幾點到', 'plain text stays')
assert(stripLineMentions('@A @B 開會') === '開會', 'strip two mentions')
assert(stripLineMentions('請@范士朋來看') === '請@范士朋來看', 'inline at-sign is not a LINE mention')
assert(
  stripLineMentions('@John Smith 來了', [{ index: 0, length: 11 }]) === '來了',
  'strip mention by LINE index',
)
assert(stripLineMentions('來了 @范士朋') === '來了', 'strip trailing mention')
assert(stripLineMentions('@สมชาย มาแล้ว') === 'มาแล้ว', 'strip thai mention')
assert(shouldSkipTranslate('@范士朋') === true, 'skip mention-only message')
assert(shouldSkipTranslate('@范士朋 明天幾點到') === false, 'translate remaining words')

console.log('reminder tests passed')
