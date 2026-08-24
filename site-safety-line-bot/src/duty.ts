import type { ChatFeatures } from './types'

export function dutyPeopleLine(features: ChatFeatures, dayOfYear: number): string {
  const people = features.dutyPeople.map((name) => name.trim()).filter(Boolean)
  if (people.length === 0) return ''
  if (features.dutyMode === 'rotate') {
    const person = people[dayOfYear % people.length]
    return person || people[0]
  }
  return people.join('、')
}

export function formatDuty(features: ChatFeatures, dayOfYear: number): string {
  const line = dutyPeopleLine(features, dayOfYear)
  if (!line) return '尚未設定值班名單。請到後台每一行填一個姓名。'
  const who = features.dutyMode === 'rotate' ? `${line}（輪值）` : line
  return [
    '【夜間值班通知】',
    `今晚值班：${who}`,
    '請完成巡視、確認臨時用電、出入口與危險區域。',
  ].join('\n')
}
