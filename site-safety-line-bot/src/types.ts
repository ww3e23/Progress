export interface Env {
  LINE_CHANNEL_ACCESS_TOKEN?: string
  LINE_CHANNEL_SECRET?: string
  ADMIN_TOKEN?: string
  /** Comma-separated LINE group / user / room IDs. Empty = broadcast to all friends. */
  LINE_TO_IDS?: string
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>
  }
  TRANSLATE_KV?: {
    get: (key: string) => Promise<string | null>
    put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>
    delete: (key: string) => Promise<void>
  }
}

export type ReminderType = 'heat' | 'height' | 'rain'

export interface Reminder {
  type: ReminderType
  label: string
  title: string
  text: string
}

export interface LineTextMessage {
  type: 'text'
  text: string
}

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
