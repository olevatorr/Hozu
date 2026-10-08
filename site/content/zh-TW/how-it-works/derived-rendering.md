---
title: 渲染跟隨資料
description: 宣告資料的擁有者與 freshness，讓 compiler 推導快取、串流與 island。
order: 4
source: 3845a79cc16f
---

## 從資料需求開始

商品頁面與帳號面板可以共處同一個畫面，卻需要不同的處理方式。商品描述可能是公開的，而且很少變動；帳號面板則屬於已登入的訪客。為整個頁面選擇單一的渲染標籤，會掩蓋這個差異。Hozu 改為要求每個 query 宣告誰能看到它的結果，以及結果必須多新。

compiler 會沿著記錄下來的 view 樹追蹤這些宣告。它為個別區塊推導出 render plan，並另外推導出 hydration 計畫。因此公開的撰寫介面描述的是資料需求，而不是要你維護另一組路由層級的快取開關。[ADR 0006](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0006-rendering.md) 確立了這個邊界。

## 公開資料可以有多種形式

這個宣告描述一份可以事先計算好的公開商品目錄。輸出 schema 定義 view 可以讀取的內容，而政策欄位表達的是關於資料的事實。

```ts
export const catalogue = query({
  input: z.object({}),
  output: z.array(Product),
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
```

具有 static freshness 的公開資料會產生靜態區塊。`freshness: { revalidate: 60 }` 政策則宣告重新驗證的間隔；`freshness: { swr: 60 }` 宣告 stale-while-revalidate 行為。`freshness: 'request'` 會在每次請求時重新讀取公開資料且不予快取，`freshness: { poll: 30 }` 則讓瀏覽器依該計時器重新讀取已掛載的資料（5 秒到一天），公開結果會快取間隔的一半時間。這些間隔是應用程式政策的範例，不是建議值，也不是效能測試的量測結果。部署後若要執行重新產生或背景更新，需要有伺服器。

live freshness 會讓區塊成為請求時產生，並使用框架的 live query 傳輸機制。它不會只因為周圍的 HTML 是靜態的，就能變成完全靜態的 GitHub Pages 部署。使用上方的探索器比較這些情況，再用 `hozu plan` 檢視實際專案；圖示刻意省略了巢狀相依關係。

## 使用者範圍是硬性邊界

使用者範圍的 query 屬於該請求的 session 身分。它的資料絕不能進入共享的可快取區塊，而且完全不會跨請求快取：它的 freshness 是 `'request'`（每次請求讀取一次）、`'live'`（另外會推送）或 `{ poll: s }`（由瀏覽器依計時器重新讀取）。其他任何 freshness 都會產生診斷（HZ049）。scope 是擁有權的限制，而不是讓 compiler 與效能權衡的提示。

```ts
export const myNotes = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'signedIn',
})
```

專案宣告 session schema，resolver 會收到對應的身分。`access` 說明誰可以讀取它，框架會在 resolver 執行前強制執行這項規則。公開的 resolver 不會收到該 session。若公開可快取 query 的輸入依賴使用者範圍的請求資料，同樣不安全；validator 檢查的是資料流向，而不只是讀取最外層 query 的標籤。

靜態外殼可以包含另外串流的請求專屬區塊。外殼維持可共享，而私有區塊則為該請求產生。巢狀區塊會繼承其相依項目中較動態的需求，因此一組各自合理的宣告，仍可能產生請求時的計畫。

## HTML 與 hydration 回答不同的問題

渲染決定 HTML 與資料何時產生。hydration 決定哪些瀏覽器端節點需要互動行為。靜態 query 不會讓 view 變成可互動，而請求時產生的內容也不代表整個頁面都需要 client 端應用程式。

Hozu 從綁定 machine 的節點推導出 island：事件、依狀態決定的可見性以及綁定 context 的值，都需要 client runtime。另有兩種宣告會加入它們自己的 island：client 元件，其宣告的模組在瀏覽器中執行；以及 query 宣告 `runs: 'browser'` 的區塊，伺服器會將它渲染為 pending 分支，再由瀏覽器填入。未綁定的內容維持為 HTML。伺服器取得的資料會序列化到 payload 中，而不是在 island 啟動時再取得一次。這種分離讓一篇以靜態為主的文章可以包含小型互動，而不必把整份文件宣告為 client 元件。頁面只有在確實有 island 渲染時才會取得 client runtime：位於列表、分支或 query 結果中的 island，會在它第一次出現的位置預先載入，因此列表為空的頁面不會傳送任何 JavaScript（[ADR 0036](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0036-preload-where-islands-render.md)）。

像 `assert: 'static'` 這樣的頁面斷言，是請 validator 確認推導出的結果。它無法覆寫不相容的 query，也無法強迫私有資料進入快取頁面。當結果出乎你意料時，請閱讀計畫；修改斷言並不能取代理解造成該結果的相依關係。

## 只有一種導覽

每個內部連結都會載入一份文件。speculation rules 讓支援的瀏覽器在滑鼠懸停時預先渲染目標頁面，因此載入通常是瞬間完成的，也沒有 client 端路由器決定哪些東西能跨連結保留。Hozu 0.8 移除了 [ADR 0015](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0015-phase-7a-soft-navigation.md) 中推導的軟導覽（soft navigation），因為檢查器和 lock 都看不到它保留了什麼（[ADR 0043](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0043-0-8-close-the-escape-hatches.md)）。

必須跨頁面存續的狀態存放在 URL（seed）、伺服器（query）或 client 元件自己的儲存空間中，另有一種情況由框架推導。自 0.21 起，若下一個頁面也顯示某個 machine 的 view（兩個以上頁面列出的 view，或再次造訪同一網址），該 machine 會把它的快照保存在分頁的 `sessionStorage` 中，並在新頁面 hydration 伺服器的 HTML 之後恢復它。哪些 machine 保留狀態，取決於頁面宣告的 view，而不是程式碼中的選擇；重新載入、被嵌入框架中的頁面以及 DevTools 預覽都會從頭開始（[ADR 0067](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0067-0-21-continuity.md)，並由 [ADR 0069](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0069-0-22-trial-feedback.md) 縮小範圍）。

各瀏覽器載入文件時的呈現方式不同。Chrome、Edge 與 Safari 會保留舊頁面直到新頁面繪製完成，因此載入時不會出現空白畫面。Arc 瀏覽器（於 1.167.1、Chromium 154 確認）在每次載入文件時都會讓視窗變成空白，一般的多頁網站也一樣；使用 client 端路由器的框架在那裡能避開這個問題，因為它們不載入文件。Hozu 保留文件載入（見 [ADR 0073](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0073-0-26.md)），因此在 Arc 中每次點擊連結都會出現短暫的空白畫面。

跨文件的 view transition 處理視覺層面的問題。Hozu 0.4.0 會輸出 `@view-transition { navigation: auto }`，讓支援的瀏覽器能在一般文件之間轉場，而不需要加入 client 端路由器；偏好減少動態效果的設定會移除動畫。自 0.21 起，建置會為兩個以上頁面列出的每個 view 的根元素標上 `data-hz-view`，`@hozu/css` 再為它加上 `view-transition-name`，讓共用的頁首或面板維持原位，而頁面其餘部分變換。沒有人需要手動為它們命名。

本網站沒有自行設定任何 transition 名稱：它的頁尾列在每個頁面上，由框架命名。網站中的互動說明使用原生控制項與 CSS，因此它們的存在不需要 Hozu island。[changelog](/changelog) 與 [ADR 0032](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0032-0-4-static-site-gaps.md) 描述了框架的相關變更。關於部署上的影響，請繼續閱讀[部署指南](/docs/deploying)。
