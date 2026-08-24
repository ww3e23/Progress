# 工程bot（LINE）

這是從 Cloudflare 正式機 `site-safety-line-bot` 拆出來的**新專案**，方便改功能、測流程，而不會覆蓋現有 Worker。

| | 正式機（請勿直接改） | 本專案 |
|---|---|---|
| Worker 名稱 | `site-safety-line-bot` | `site-safety-line-bot-dev` |
| 網址 | https://site-safety-line-bot.ww3e23.workers.dev | 部署後為 `https://site-safety-line-bot-dev.<帳號>.workers.dev` |
| 程式碼 | Cloudflare 儀表板 | 本目錄（可進 git） |

正式機觀察到的行為：

- `GET /` → `工程bot 已啟動`
- `GET /health` → `OK`
- `GET /admin` → 工程bot 後台（熱危害／高處作業／降雨）
- `GET /send?type=heat|height|rain` → 發送提醒
- `POST /webhook` → LINE webhook

## 本機開發

```bash
cd site-safety-line-bot
npm install
cp .dev.vars.example .dev.vars
# 編輯 .dev.vars 填入 LINE 與 ADMIN_TOKEN
npm run dev
```

- 健康檢查：http://127.0.0.1:8787/health
- 後台：http://127.0.0.1:8787/admin
- 預覽訊息（不發送）：http://127.0.0.1:8787/send?type=heat&preview=1

## 部署到 Cloudflare（新 Worker，不覆蓋正式機）

```bash
npx wrangler login
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put ADMIN_TOKEN
# 可選：指定群組／使用者，留空則 broadcast
npx wrangler secret put LINE_TO_IDS
npm run deploy
```

部署完成後：

1. LINE Developers Console → Messaging API → Webhook URL 設成  
   `https://site-safety-line-bot-dev.<帳號>.workers.dev/webhook`（先測這條，確認後再改正式機）
2. 打開 `/admin`，輸入 `ADMIN_TOKEN` 後再發送

## 與正式機的差異（方便之後改）

- 原始碼在 git，訊息內容在 `src/reminders.ts`
- `/send` 未知 `type` 不再誤發
- 真正發送需要 `ADMIN_TOKEN`（正式機 `/send` 目前沒有保護）
- 可用 `LINE_TO_IDS` 只推給指定群組，避免誤 broadcast
- LINE 關鍵字（熱危害／高處／降雨）可自動回覆對應提醒

確認新專案沒問題後，若要取代正式機，把 `wrangler.jsonc` 的 `name` 改回 `site-safety-line-bot` 再部署即可。
