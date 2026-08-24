import type { Reminder, ReminderType } from './types'

export const REMINDERS: Record<ReminderType, Reminder> = {
  heat: {
    type: 'heat',
    label: '熱危害',
    title: '熱危害提醒',
    text: [
      '【工地熱危害提醒】',
      '',
      '今日戶外高溫，請落實防中暑措施：',
      '1. 每小時至少補充水分，勿等到口渴才喝。',
      '2. 安排輪班休息，避免連續曝曬。',
      '3. 戴寬邊帽、透氣衣，必要時使用遮陽設施。',
      '4. 出現頭暈、噁心、大量出汗、意識不清，立即移到陰涼處並通報。',
      '',
      '請各班組長現場再口頭宣導一次。',
    ].join('\n'),
  },
  height: {
    type: 'height',
    label: '高處作業',
    title: '高處作業提醒',
    text: [
      '【高處作業安全提醒】',
      '',
      '進入高處作業前請確認：',
      '1. 安全帶已正確佩戴並掛扣於牢固錨點。',
      '2. 護欄、開口蓋板、安全網完好。',
      '3. 梯子、施工架穩固，禁止攀爬欄杆。',
      '4. 禁止高處拋擲物料；下方設置警戒區。',
      '5. 身體不適或強風／降雨時，暫停高處作業。',
      '',
      '未完成防護不得施工。',
    ].join('\n'),
  },
  rain: {
    type: 'rain',
    label: '降雨',
    title: '降雨提醒',
    text: [
      '【降雨／濕滑作業提醒】',
      '',
      '雨天請特別注意：',
      '1. 地面濕滑，走階梯與鷹架務必抓穩、放慢。',
      '2. 高處、開挖、起重作業視情況暫停。',
      '3. 電氣設備防潮，不得用濕手操作。',
      '4. 檢查擋土、排水與坑內積水，發現異常立即通報。',
      '5. 材料覆蓋固定，防止被風吹落。',
      '',
      '以現場主管指示為準，安全優先於趕工。',
    ].join('\n'),
  },
}

const KEYWORD_MAP: Array<{ type: ReminderType; keywords: string[] }> = [
  { type: 'heat', keywords: ['熱危害', '熱', '中暑', 'heat'] },
  { type: 'height', keywords: ['高處作業', '高處', '安全帶', 'height'] },
  { type: 'rain', keywords: ['降雨', '下雨', '雨', '濕滑', 'rain'] },
]

export function isReminderType(value: string | null): value is ReminderType {
  return value === 'heat' || value === 'height' || value === 'rain'
}

export function reminderFromText(text: string): Reminder | null {
  const normalized = text.trim().toLowerCase()
  for (const { type, keywords } of KEYWORD_MAP) {
    if (keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return REMINDERS[type]
    }
  }
  return null
}

export function menuText(): string {
  return [
    '工程bot',
    '',
    '可回覆關鍵字取得提醒：',
    '· 熱危害',
    '· 高處作業',
    '· 降雨',
    '',
    '群組翻譯：翻譯 越南',
    '群組功能：傳「功能」查看',
    '管理後台：/admin',
  ].join('\n')
}
