---
title: 從原始碼到執行中的應用程式
description: 跟著一個 feature 走過記錄、驗證、render plan 規劃與執行。
order: 2
source: 659e1f409f8f
---

## 單一表示串連所有工具

Hozu 的 pipeline 是 `feature() source → Feature IR → validator → compiler → runtime`。每個階段各有不同職責。作者描述程式，builder 記錄它，validator 檢查其中的關聯，compiler 推導執行決策，runtime 負責執行。

中介表示（IR）讓這些階段保持連結。一個 view 事件、一個 machine transition 與一個被呼叫的 mutation，會成為結構化資料中彼此關聯的項目。工具可以直接檢視這些關聯，而不必試圖從任意的應用程式函式中推斷。[ADR 0002](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0002-feature-ir-and-authoring.md) 說明了為何 IR 是唯一事實來源。

## 原始碼記錄一個程式

TypeScript 為宣告提供實用的編輯器回饋與型別化的參照。路由描述它的參數，事件描述它的 payload，query 描述它的輸入與輸出。feature 以穩定的名稱註冊這些宣告，連同它的 view 以及任何 machine 或 contract。

用來撰寫 view 或 machine 的 callback 是以記錄器的方式執行。像 `ctx.draft` 這樣的值代表最終程式將會讀取的一條路徑；它並不是 builder 執行當下輸入欄位的內容。作者仍然撰寫一般的 TypeScript；`@hozu/transform` 會在 callback 執行前改寫運算子，因此條件會被記錄下來，而不是只被判斷一次。

例如，一個 view 可以記錄錯誤訊息是否存在：

```ts
ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])
```

transform 會把它轉成一個條件節點，其判斷式（`error ≠ null`）與分支都保留在 IR 中可見。transform 只改寫觸及被記錄值的運算子，讓每一行維持原位，使診斷能指向作者的程式碼，並以診斷拒絕它無法記錄的內容（資料上的方法）。對於運算子詞彙之外的運算，具名的 `fn()` 提供輸入與輸出 schema 以及一個純函式實作。這是工具能夠辨識的明確邊界（[ADR 0039](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0039-ordinary-typescript-in-builders.md)）。

## 驗證檢查關聯

validator 檢查的不只是個別宣告的形狀。它能找出對未註冊 mutation 的參照、某個可見控制項送入無法處理該事件之狀態的事件，或某個 feature 存取另一個 feature 的私有宣告。與渲染相關的檢查也會防止使用者範圍的資料進入共享的可快取區塊。

contract 在這些結構檢查之上加入實際執行。它們把 machine 置於已知狀態，送出事件或 effect 結果，再將產生的狀態、context 與 effect 與作者的預期比較。transition 覆蓋率會找出會做決定（guard、導覽、計算出的值）卻沒有 contract 的 transition。行為 lock `hozu.lock.json` 記錄每一個 transition、誰可以執行各個 query 與 mutation、endpoint、重新導向，以及每個頁面如何回應失敗的 head query；`hozu check` 會重新計算它並回報任何差異（HZ057），因此變更只有透過 `hozu check --update-lock` 才會被接受。

診斷會指出位置、原因與建議的修正方式。JSON 格式支援工具使用，文字格式則讓同樣的資訊在終端機中易於閱讀。有些失敗需要對意圖做出決定，因此有用的診斷不一定附帶自動修補。診斷的設計記錄在 [ADR 0003](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0003-diagnostics-and-cli.md)。

## 編譯推導出計畫

compiler 讀取通過驗證的程式並追蹤其相依關係。query 的 scope 與 freshness 決定快取與請求行為。machine 綁定決定哪些節點需要在 client 端執行。因此一個頁面可以結合靜態外殼、針對請求的內容以及小型互動 island（互動島），而不需要為整條路由手動選擇單一渲染模式。

伺服器 HTML 對不會暫停（suspend）的子樹使用產生的 JavaScript。query 串流在暫停點周圍保留直譯路徑，讓伺服器能在等待資料之前先送出較早的內容。正式建置會寫出供部署使用的 render 模組；Node 開發環境在啟動時使用同一個產生器。[ADR 0024](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0024-generated-render-functions.md) 描述了這個分工。

接著由 runtime 執行計畫。伺服器 resolver 提供 query 與 mutation 的結果，machine 直譯器處理事件，瀏覽器 runtime 更新需要它的 island。靜態節點不會只因為和互動控制項位於同一頁面，就需要 client 端的應用程式 runtime。

## 問最精準的問題

從 `hozu map` 開始一項修改。它列出路由、資料宣告、事件、狀態、view 與 contract 及其原始碼位置。開啟相關的應用程式程式碼，若你需要的關聯仍不清楚，再使用更聚焦的工具。

```sh
pnpm exec hozu map
pnpm exec hozu inspect items
pnpm exec hozu why items.idle
pnpm exec hozu plan home
```

`inspect` 呈現 feature 的摘要與 IR。`why` 描述某個狀態的 transition、effect 以及涵蓋它的 contract。`plan` 顯示某個路由或路徑的渲染決策：每個區塊的模式與其背後的 query、頁面是否可快取，以及它的 island。這些指令回答的是不同的問題，因此每次小幅編輯都全部執行一遍只會增加不必要的工作。

完成預期的變更後，`hozu check` 會執行整合驗證。使用 `hozu get` 檢查渲染後的文字、屬性與表單，使用 `hozu browse` 在真實瀏覽器中執行流程。[CLI 參考](/docs/cli) 列出所有指令，[machines and contracts](/how-it-works/machines-and-contracts) 則詳細說明行為檢查。
