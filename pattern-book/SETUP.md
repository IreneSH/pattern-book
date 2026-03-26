# Pattern Book 部署指南

## 架構說明
- **前端**: React + Vite → 部署在 Netlify
- **資料庫**: Firebase Firestore（每個用戶資料獨立）
- **登入**: Google 帳號登入（Firebase Auth）
- **費用**: 全部免費（Firebase Spark Plan + Netlify Free Tier）

---

## 步驟一：建立 Firebase 專案

1. 前往 https://console.firebase.google.com
2. 點「新增專案」→ 輸入名稱如 `pattern-book` → 建立
3. 建立完成後，在左側選「建構」→「Firestore Database」
4. 點「建立資料庫」→ 選「以正式版模式開始」→ 選地區（asia-east1 台灣）→ 建立
5. 在 Firestore 頁面點「規則」分頁，把內容替換成以下規則，然後點「發布」：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 步驟二：啟用 Google 登入

1. 在 Firebase Console 左側選「建構」→「Authentication」
2. 點「開始使用」
3. 在「登入方式」分頁，點「Google」→ 啟用它 → 選你的 email 作為支援郵件 → 儲存

## 步驟三：新增 Web 應用

1. 在 Firebase Console 點左上角的齒輪 ⚙️ →「專案設定」
2. 往下捲到「您的應用程式」→ 點 Web 圖示 `</>`
3. 輸入暱稱如 `pattern-book-web` → 註冊應用程式
4. 你會看到 `firebaseConfig` 的內容，把這些值複製下來
5. 打開專案裡的 `src/firebase.js`，把 `YOUR_XXX` 替換成你的實際值

## 步驟四：上傳到 GitHub

```bash
cd pattern-book
git init
git add .
git commit -m "initial commit"
gh repo create pattern-book --public --push --source=.
```

或者手動在 GitHub 建立 repo，然後 push 上去。

## 步驟五：部署到 Netlify

1. 前往 https://app.netlify.com
2. 點「Add new site」→「Import an existing project」
3. 選 GitHub → 找到 `pattern-book` repo
4. Build settings 會自動偵測：
   - Build command: `npm run build`
   - Publish directory: `dist`
5. 點「Deploy site」

## 步驟六：設定 Firebase 授權網域

部署完成後，Netlify 會給你一個網址如 `https://xxx.netlify.app`

1. 回到 Firebase Console →「Authentication」→「設定」→「授權網域」
2. 點「新增網域」→ 輸入你的 Netlify 網址（例如 `xxx.netlify.app`）→ 新增

## 完成！

現在你可以：
- 在任何電腦打開你的 Netlify 網址
- 用 Google 帳號登入
- 開始記錄股價型態
- 每個人登入後只看得到自己的資料

## 分享給朋友

直接把網址給朋友就行。他們用自己的 Google 帳號登入後，會有獨立的資料空間，彼此完全不會影響。

## 自訂網域（選用）

如果你想用自己的網域名稱：
1. 在 Netlify 的 site settings →「Domain management」→「Add custom domain」
2. 記得也要把自訂網域加到 Firebase 的授權網域中
