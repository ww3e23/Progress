import { reminderFromText, isReminderType, menuText } from './reminders.ts'

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

assert(isReminderType('heat'), 'heat should be valid')
assert(!isReminderType('typhoon'), 'unknown type should be rejected')
assert(reminderFromText('請發熱危害')?.type === 'heat', 'heat keyword')
assert(reminderFromText('高處作業注意')?.type === 'height', 'height keyword')
assert(reminderFromText('今天下雨')?.type === 'rain', 'rain keyword')
assert(reminderFromText('你好') === null, 'unrelated text')
assert(menuText().includes('熱危害'), 'menu should list types')

console.log('reminder tests passed')
