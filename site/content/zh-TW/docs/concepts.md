---
title: 核心概念
description: feature 如何成為經過檢查的程式與推導出的 render plan。
order: 2
source: 66f8d2edd90a
---

## 你的應用程式就是資料

Hozu 的型別化 builder 會記錄一份中介表示（intermediate representation，簡稱 IR）。validator 檢查這份表示，compiler 推導出 render plan，runtime 負責提供服務。TypeScript 是撰寫介面；IR 是共享的唯一事實來源。

```text
feature source → Feature IR → validator → compiler → runtime
```

這讓工具能在應用程式上線服務之前回答關於它的問題：某個狀態接受哪些事件、某個 mutation 會重新整理哪些 query，或某個頁面能否匯出為靜態 HTML。

## feature 定義邊界

一個 feature 把相關的宣告組織在一起：query、mutation、事件、view，以及必要時的一個狀態機（machine）。feature 列出存放這些宣告的模組，`declarations: [model, views]`，每個匯出的宣告都以其匯出名稱註冊。其他 feature 只能使用透過其 `exports` 公開的宣告；使用方在 `imports` 中宣告該 feature。

靜態內容不需要 machine。當 UI 具有帶狀態或副作用的互動時，再加入 machine。具有路由的 view 可以從網址與伺服器資料啟動它的 machine：`seed: ({ search, query }) => ({ q: search.q, email: query(me, {}).email })` 在伺服器渲染、hydration（水合，讓伺服器產生的 HTML 在瀏覽器中變得可互動）以及不使用 JavaScript 的表單送出時都會同樣執行；query 失敗時則保留初始 context。

## 行為有 contract

machine 描述狀態與 transition（狀態轉移）。contract 陳述起始狀態、發生的事件或 effect 結果，以及預期的狀態、資料變化與 effect。會做出決定的 transition（guard、導覽或計算出的值）需要 contract。只複製值的 transition 則以可讀形式記錄在 `hozu.lock.json` 中，因此對它們的變更會以 lock diff 的形式審查。

[Machines and contracts](/docs/machines) 會逐步說明這兩者。`expect.changes` 是深層 patch：省略的欄位必須維持不變，陣列則取代舊值。`given.context` 預設為 machine 的初始 context。lock 必須等於 Hozu 計算出的結果：任何差異都會持續被回報，直到 `hozu check --update-lock` 接受它為止；而會做決定的 transition 發生變更時，只有在某個 contract 對先前的行為失敗時才會被接受。針對只複製值的 transition 所寫的 contract 會被標記出來，因為 lock 已經在審查它們。

## 邏輯保持明確

view 與 machine 的 callback 以一般的 TypeScript 撰寫：`ctx.error !== null && ui.p(…)`、`item.done ? 'done' : 'open'`、`` `${n} items` ``，以及在 `assign` 中的 `ctx.draft = e.text`。`@hozu/transform` 把這些運算子記錄為資料，而不是只執行一次。資料上的方法（`.map`、`.toUpperCase()`）無法被記錄：列表請使用 `ui.each`，其他運算請使用具名的 `fn()`。

當某個運算需要一般 JavaScript 時，宣告一個具有輸入與輸出 schema 的具名 `fn()`。在 client 端使用的函式必須是自給自足的：它們的原始碼會獨立傳送，因此不能閉包引用匯入的輔助函式或區域變數。

## 渲染跟隨資料

每個 query 都宣告它的 scope 與 freshness。公開的靜態資料可以在建置時渲染。重新驗證（revalidation）與 stale-while-revalidate 政策會產生對應的快取計畫。使用者範圍（user-scoped）的資料不會進入共享的可快取區塊，並在每次請求時讀取（`'request'`、`'live'` 或 `{ poll }`）。每個 query 與 mutation 也會說明它在哪裡執行（`runs`），以及當它在伺服器上處理使用者資料時，誰可以執行它（`access`）；請見 [Data](/docs/data)。

只有綁定 machine 的 view 會進行 hydration。靜態文件不需要 client 端的應用程式 runtime。會 hydration 的部分會就地更新：輸入改變的 query 會保留它的資料列並依 key 更新，更新所新增的內容會淡入，而兩個頁面共用的 view 在跨連結時會保持不動。頁面可選的 `assert: 'static'` 會請 validator 驗證這個性質；它不會覆寫推導出的計畫。

使用 `npx hozu plan home` 查看 compiler 對某個具名路由所做的決定。

## 了解設計理念

閱讀 [Hozu 如何運作](/how-it-works/pipeline)，了解這套 API 背後的決策及其取捨。
