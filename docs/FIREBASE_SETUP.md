# Firebase 專案設定指引（現場施工進度）

進度 App 必須使用**獨立** Firebase 專案，**禁止**沿用查驗的 `ci-inspection`。

| | 查驗 CI | 現場進度 Progress |
|---|---|---|
| 網址 | https://ww3e23.github.io/CI/ | https://ww3e23.github.io/Progress/ |
| GitHub | [ww3e23/CI](https://github.com/ww3e23/CI) | [ww3e23/Progress](https://github.com/ww3e23/Progress) |
| Firebase | `ci-inspection` | `site-progress-app-8d6c2` |
| 本機帳號 | `ci-inspection-auth-v1` | `site-progress-auth-v1` |
| 本機專案資料 | `ci-inspection-data-v1` | `site-progress-data-v1` |
| IndexedDB | （查驗自用） | `progress-pending-media` |

進度 App **不會**讀寫舊的共用 key（`site-auth-v2`、`site-inspection-v5`），也**不會**同步查驗專案（例如 8-2）。

照下列步驟做完後：
1. Firebase 專案已建立：`site-progress-app-8d6c2`（不要開 ci-inspection）
2. 網頁 SDK 已寫入 `.env.production`，GitHub Pages 建置會帶上
3. 在 Console 發布本 repo 的 `firestore.rules` 與 `storage.rules`
4. 在進度後台為每個建案綁定 Google 雲端硬碟資料夾

## 架構說明

| 層級 | 用途 |
|---|---|
| **Firebase Authentication** | 正式規則需要登入；App 登入時會建立／使用 Email 工作階段 |
| **Firestore** | 專案、棟別、工項進度、缺失文件、Drive 資料夾 ID |
| **Storage** | 圖面／現況照片本體（路徑：`projects/{建案ID}/defects/{缺失ID}/...`） |
| **Cloud Function** | Storage 上傳後，鏡像複製到該建案綁定的 Google 雲端硬碟資料夾 |

> Firebase 專案 ID（`site-progress-app-8d6c2`）≠ App 內建案 ID。  
> 一個 Firebase 專案可服務多個進度建案；**每個建案各自綁一個 Drive 資料夾**。

---

## 1. 建立 Firebase 專案

1. 開啟 [Firebase Console](https://console.firebase.google.com/)
2. **新增專案**：ID 設為 `site-progress-app-8d6c2`（Blaze 方案才可用 Cloud Functions＋Drive API）
3. 新增網頁 App；到「專案設定 → 一般 → 您的應用程式」複製 `firebaseConfig`
4. 授權網域加入 `ww3e23.github.io`、`localhost`

你目前的設定應對應：

| 欄位 | 值 |
|---|---|
| projectId | `site-progress-app-8d6c2` |
| authDomain | `site-progress-app-8d6c2.firebaseapp.com` |
| storageBucket | `site-progress-app-8d6c2.firebasestorage.app` |

---

## 2. 啟用服務

### Authentication
- 登入方式：**電子郵件/密碼** 已啟用
- 建議預先建立 `admin@site.tw`（密碼 `admin1234`）

### Firestore
- 資料庫已建立（建議區域 `asia-east1`）
- 部署本 repo 的 `firestore.rules`

### Storage
- 已開始使用
- 部署本 repo 的 `storage.rules`（路徑允許 `projects/{projectId}/**`）

---

## 3. 本機接上

```bash
cp .env.example .env.local
```

填入（值從 **site-progress-app-8d6c2** 的 Firebase Console 複製，**不要提交到 git**，**不要填 ci-inspection**）：

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=site-progress-app-8d6c2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=site-progress-app-8d6c2
VITE_FIREBASE_STORAGE_BUCKET=site-progress-app-8d6c2.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

```bash
npm install
npm run dev
```

「我的」頁應顯示 **Firebase 已設定**。

---

## 4. 線上站（GitHub Pages）接上

到 https://github.com/ww3e23/Progress → **Settings → Secrets and variables → Actions**  
新增這 6 個 Secret（名稱必須完全一致；值必須來自 `site-progress-app-8d6c2`）：

1. `VITE_FIREBASE_API_KEY`
2. `VITE_FIREBASE_AUTH_DOMAIN` = `site-progress-app-8d6c2.firebaseapp.com`
3. `VITE_FIREBASE_PROJECT_ID` = `site-progress-app-8d6c2`
4. `VITE_FIREBASE_STORAGE_BUCKET` = `site-progress-app-8d6c2.firebasestorage.app`
5. `VITE_FIREBASE_MESSAGING_SENDER_ID`
6. `VITE_FIREBASE_APP_ID`

另建議：`FIREBASE_TOKEN`（`firebase login:ci`，用於部署 Functions／規則到 **site-progress-app-8d6c2**）。

存檔後推送 `main`（或手動跑 **Deploy GitHub Pages**）。  
建置日誌會印出各 `VITE_FIREBASE_*` 是 `SET` 還是 `EMPTY`（不會印出金鑰）。  
若 `VITE_FIREBASE_PROJECT_ID=ci-inspection`，建置會失敗。  
強制重新整理 https://ww3e23.github.io/Progress/ ，「我的」版本號應為 `2026.08.14-firebase-8d6c2`。

---

## 5. Google 雲端硬碟（每個建案不同資料夾）

### 5-1 在 Google Cloud 啟用 Drive API
1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)（同一個 `site-progress-app-8d6c2` 專案）
2. **API 和服務** → 搜尋 **Google Drive API** → 啟用

### 5-2 OAuth 網頁用戶端
1. GCP → **Google Auth Platform** 完成品牌／目標對象（外部）／聯絡信箱  
2. **資料存取權** 加入 `.../auth/drive`  
3. **用戶端** 建立 **網頁應用程式**；JavaScript 來源：
   - `https://ww3e23.github.io`
   - `http://localhost:5173`
4. 把用戶端 ID 設成 `VITE_GOOGLE_OAUTH_CLIENT_ID`（正式站亦可寫在 `.env.production`）  
5. **目標對象 → 測試使用者** 加入你要授權的 Gmail  
6. 在「我的雲端硬碟」建資料夾，複製網址後到進度後台綁定

### 5-3 部署 Function
本機：

```bash
npm install -g firebase-tools
firebase login
firebase use site-progress-app-8d6c2
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules,storage
```

或在 GitHub Secrets 設定 `FIREBASE_TOKEN`，推送 `functions/**` 到 `main` 會自動部署到 **site-progress-app-8d6c2**。

---

## 6. 正式規則部署

若後台出現「無法從雲端同步」或 `Missing or insufficient permissions`：

1. 開啟 [Firestore 規則](https://console.firebase.google.com/project/site-progress-app-8d6c2/firestore/rules)
2. 貼上本 repo 的 `firestore.rules` 全文
3. 按 **發布**
4. 網站重新登入後再按「同步到雲端」

---

## 7. 驗證清單

- [ ] GitHub Secrets 六個都已填，且 **不是** ci-inspection 的值
- [ ] Pages 建置日誌 `VITE_FIREBASE_*` 皆為 `SET`
- [ ] 「我的」顯示 Firebase 已設定、版本 `2026.08.14-isolate-from-ci`
- [ ] 本機 Application → Local Storage 只有 `site-progress-auth-v1` / `site-progress-data-v1`
- [ ] 查驗 CI 的 `ci-inspection-auth-v1` / `ci-inspection-data-v1` 不被進度 App 讀寫
- [ ] 沒有連上 ci-inspection，查驗專案 8-2 不會出現在進度 App
