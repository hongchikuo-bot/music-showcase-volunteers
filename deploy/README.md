# Music Showcase · 志工認領網站

單一 HTML 檔案的志工認領看板，中／英／雙語，支援**雲端即時同步**（Google Sheet，零成本）。

## 🌐 已上線

**<https://hongchikuo-bot.github.io/music-showcase-volunteers/>**

> ⚠️ **目前還不要分享給社群成員。**
> 網站現在是「本機模式」——每個人在自己裝置上按認領，**只有他自己看得到**，主辦看不到。
> 對志工認領來說這樣沒有意義（大家會各填各的）。
> **請先完成下面的「二、啟用雲端同步」，狀態燈變成 🟢 雲端已連線之後再分享。**

```
music_showcase_site/
├── index.html              ← 網站本體（唯一需要部署的檔案）
├── README.md               ← 這份說明
├── seed.json               ← 12 筆預設志工任務（給雲端初始用）
├── mock_server.py          ← 本機模擬後端，部署前先試用／日後回歸測試
├── 啟動網站.command         ← 雙擊＝啟動本機伺服器＋自動開瀏覽器
└── apps-script/
    └── Code.gs             ← Google Sheet 後端程式碼（貼到 Apps Script）
```

---

## 兩種運作模式

| | 本機模式（預設） | 雲端模式 |
|---|---|---|
| 資料存哪 | 各自的瀏覽器 localStorage | Google Sheet |
| 主辦看得到大家的認領嗎 | ❌ 要手動匯出／匯入 JSON | ✅ 即時 |
| 需要設定嗎 | 不用，打開就能用 | 要部署一次 Apps Script（約 5 分鐘） |
| 頁首標示 | 🟡 本機模式 | 🟢 雲端已連線 |

**未設定時就是本機模式**，直接雙擊 `index.html` 即可使用。

---

## 一、本機試用

```bash
cd /Users/macmima1234/root/music_showcase_site
python3 mock_server.py 8899
```

- 本機模式 → <http://localhost:8899/>
- 雲端模式 → <http://localhost:8899/cloud.html>（自動把 API 指到模擬後端）

`mock_server.py` 的 JSON 契約與 Apps Script **完全相同**，所以在這裡測過的行為，部署後會一致。

---

## 二、啟用雲端同步（Google Apps Script）

### 1. 建立 Google Sheet
1. 開 <https://sheet.new>，建立一份新試算表
2. 命名為 `Music Showcase 志工認領`（名稱隨意）
3. **不需要**手動建欄位，程式第一次執行會自己建

### 2. 貼上後端程式
1. 在試算表上方選 **擴充功能 → Apps Script**
2. 把左側 `Code.gs` 裡的內容全部刪掉
3. 把本專案 `apps-script/Code.gs` 的內容**整份貼上**
4. 按 💾 儲存（專案名稱可設為 `MusicShowcaseBoard`）

### 3. 部署成 Web App
1. 右上角 **部署 → 新增部署作業**
2. 左側齒輪選 **網頁應用程式**
3. 設定：
   - **說明**：`v1`
   - **執行身分**：**我（你的 Google 帳號）**
   - **具有存取權的使用者**：**任何人** ← 一定要選這個，否則志工打不開
4. 按 **部署** → 會要求授權
   - 選你的帳號 → 「進階」→「前往 …（不安全）」→ 允許
   - （出現警告是因為這是自己寫的未驗證指令碼，正常現象）
5. 複製產生的 **網頁應用程式網址**，長得像：
   `https://script.google.com/macros/s/AKfycb..../exec`

> ⚠️ 之後若改過程式，要 **部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署**，網址才會更新。

### 4. 把網址填進網站

**如果你是在 GitHub 上改**：開 <https://github.com/hongchikuo-bot/music-showcase-volunteers/blob/main/index.html> → 右上角鉛筆 ✏️ → 找到 `API_URL` 那行 → 貼上網址 → Commit changes。等 1 分鐘 Pages 重新建置就生效。

**如果你在本機改**：打開 `index.html`，找到最上面的設定區：

```js
const CONFIG = {
  API_URL: '',          // ← 把剛才複製的網址貼在兩個引號中間
  POLL_MS: 30000        // 自動重新整理間隔（毫秒）
};
```

改完存檔，重新整理網站 — 頁首應該變成 🟢 **雲端已連線**。

### 5. 把 12 筆預設任務寫進 Sheet
1. 點「⚙ 管理」（密碼 `showcase`）
2. 按 **⬆ 推送到雲端**

完成。之後所有人的認領都會即時寫進 Google Sheet，主辦打開網站看到的就是最新狀態。

> Sheet 裡每一列是一項任務，最後一欄 `claimants` 存認領名單（JSON）。
> 想看清單也可以直接在 Apps Script 編輯器執行 `SHOW_STATUS()`，用 `RESET_SHEET()` 清空重來。

---

## 三、免費上線

把 `index.html` 上傳到任一免費靜態託管（不用改程式）：

- **Netlify Drop**：<https://app.netlify.com/drop> 把檔案拖進去，秒得網址
- **GitHub Pages**：建 repo → 上傳 `index.html` → Settings → Pages → main branch
- **Cloudflare Pages**：同上

> 部署到 HTTPS 網址後，雲端模式的 fetch 一樣可用（Apps Script 支援跨網域）。

---

## 四、功能一覽

| 功能 | 說明 |
|---|---|
| 語言切換 | 中文 / English / 雙語（雙語＝中文主行＋英文次行） |
| 需求看板 | 12 項預設任務，8 個分類，可搜尋篩選 |
| 認領 | 填名字＋聯絡方式 → 即時寫入，主辦立刻看到 |
| 取消認領 | 卡片上可撤銷，雲端模式也會同步刪除 |
| 額滿保護 | 前端隱藏＋**後端也會擋**（避免兩人同時搶到最後一格） |
| 同名保護 | 同一個人不能重複認領同一項（前後端都擋） |
| 進度統計 | 頁首顯示需求項目 / 尚缺人手 / 已認領 |
| 同步狀態 | 頁首即時顯示 🟡 本機模式 / 🟢 雲端已連線 / 🔴 連線失敗 |
| 管理後台 | 密碼進入：新增任務、匯出／匯入 JSON、推送雲端、還原預設 |
| 響應式 | 手機單欄、平板兩欄、桌機三欄 |

**管理密碼：`showcase`** → 改法：`index.html` 搜尋 `ADMIN_PW`

---

## 五、客製化對照表

| 想改什麼 | 改哪裡 |
|---|---|
| 雲端網址 | `CONFIG.API_URL` |
| 預設志工任務 | `SEED` 陣列（改完記得重新「推送到雲端」） |
| 分類項目 | `CATS` 陣列 |
| 管理密碼 | `ADMIN_PW` |
| 配色 | CSS 開頭 `:root`（`--wine` 棗紅、`--gold` 金） |
| 文案／標題 | `T.zh` 與 `T.en` 兩個物件 |
| 音樂會日期地點 | 首頁 `.hero-meta` 的三個 `pill` |
| 同步頻率 | `CONFIG.POLL_MS` |

---

## 六、疑難排解

| 症狀 | 原因與處理 |
|---|---|
| 頁首一直 🔴 連線失敗 | `API_URL` 貼錯，或部署時「存取權」沒選**任何人** |
| 改了 Code.gs 但沒生效 | 要重新「管理部署作業 → 編輯 → 新版本」 |
| 網站顯示 🟡 本機模式 | `CONFIG.API_URL` 還是空的 |
| 別人的認領沒出現 | 等 30 秒自動更新，或切到別的視窗再切回來（會立即重新抓） |
| 顯示 ⚠ 連線失敗：HTTP 404 | Web App 網址結尾要是 `/exec`，不是 `/dev` |

---

## 七、修改後的驗證方式

改完 `index.html` 想確認沒弄壞，可以這樣自測：

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');
new Function(h.match(/<script>([\s\S]*)<\/script>/)[1]);console.log('JS OK')"
```

再用 `mock_server.py` 起服務，於瀏覽器 console 檢查 `cloud`、`needs`、頁面文字是否正確。

---

> 「音樂讓我們聚在一起，見證成長，也珍惜友情。」
