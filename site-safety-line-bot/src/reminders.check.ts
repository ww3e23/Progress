import { reminderFromText, isReminderType, menuText } from './reminders.ts'
import { isMostlyChinese, parseTranslateCommand, shouldSkipTranslate } from './translate.ts'

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
assert(parseTranslateCommand('熱危害') === null, 'not a translate command')
assert(isMostlyChinese('明天灌漿請戴安全帽'), 'chinese detect')
assert(!isMostlyChinese('Mai đổ bê tông nhớ đội mũ bảo hộ'), 'vietnamese detect')
assert(shouldSkipTranslate('🌐 中文：hello'), 'skip already translated')

console.log('reminder tests passed')
