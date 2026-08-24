export interface Env {
  LINE_CHANNEL_ACCESS_TOKEN?: string
  LINE_CHANNEL_SECRET?: string
  ADMIN_TOKEN?: string
  /** Comma-separated LINE group / user / room IDs. Empty = broadcast to all friends. */
  LINE_TO_IDS?: string
  GEMINI_API_KEY?: string
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>
  }
  TRANSLATE_KV?: KVStore
}

export interface KVStore {
  get: (key: string) => Promise<string | null>
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>
  delete: (key: string) => Promise<void>
  list?: (options?: { prefix?: string; limit?: number; cursor?: string }) => Promise<{
    keys: Array<{ name: string }>
    list_complete: boolean
    cursor?: string
  }>
}

export type ReminderType = 'heat' | 'height' | 'rain'

export interface Reminder {
  type: ReminderType
  label: string
  title: string
  text: string
}

export type ChatType = 'group' | 'room' | 'user'

export interface DateRoster {
  enabled: boolean
  hour: number
  minute: number
  period: string
  remark: string
  days: Record<string, string[]>
}

export interface ChatRecord {
  id: string
  type: ChatType
  name: string
  note: string
  lastSeenAt: number
  nameFetchedAt?: number
}

export interface ChatFeatures {
  translate: boolean
  translateLang: string
  imageSearch: boolean
  infoSearch: boolean
  weather: boolean
  weatherPlace: string
  weatherHour: number
  weatherMinute: number
  weatherLink: string
  nightDuty: DateRoster
  dayShift: DateRoster
  safety: boolean
}

export interface ChatState {
  chat: ChatRecord
  features: ChatFeatures
}

export interface LineTextMessage {
  type: 'text'
  text: string
}

export interface LineImageMessage {
  type: 'image'
  originalContentUrl: string
  previewImageUrl: string
}

export type LineMessage = LineTextMessage | LineImageMessage

export interface LineWebhookEvent {
  type: string
  replyToken?: string
  source?: {
    type?: string
    userId?: string
    groupId?: string
    roomId?: string
  }
  message?: {
    type: string
    text?: string
  }
}

export interface LineWebhookBody {
  events?: LineWebhookEvent[]
}
