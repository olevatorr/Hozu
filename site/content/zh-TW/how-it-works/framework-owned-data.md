---
title: 由框架掌管的資料
description: 一併宣告讀取、寫入與失效，讓重新整理的行為不會散落在各個 handler 中。
order: 5
source: d4d72c43d677
---

## 困難之處在於讓畫面保持正確

讀取一個列表、送出一個寫入請求，都是簡單的操作。困難之處在於事後協調畫面：哪些 query 已經過時、哪些元件顯示它們、樂觀更新的值是否仍然可見，以及之後的重新整理是否真的反映到渲染出的列表上。即使這些協調是錯的，應用程式仍然可以編譯通過。

Hozu 讓讀取與寫入成為明確的宣告。query 描述它的輸入、輸出、擁有者與 freshness。mutation 描述它的輸入、輸出、錯誤以及會使其失效的 tag。伺服器程式碼實作這些宣告，而一次成功的寫入與必須重新整理的 query 之間的關係，則由框架掌管。

## 一個通過建置的迴歸問題

Trial 0012 要求 agent 建立一個個人筆記應用程式，接著加入釘選與瀏覽器內搜尋。驗收檢查涵蓋了變更後的行為，也再次涵蓋原本的應用程式。兩個 Hozu 建置與兩個 Nuxt 建置一開始都通過了所有建置檢查。接著，其中一次 Nuxt 變更破壞了釘選排序，以及數個原本正常運作的重新整理行為。

報告給出的原因如下：

> The pin handler mutates `note.pinned` in place on `useFetch` data, which Nuxt 4 keeps in a shallow ref, so the sorted list and later refreshes stop updating.

同一份報告指出，`pnpm typecheck` 與 `pnpm build` 都通過了，而 agent 回報成功。重現的迴歸問題包括：新增的筆記沒有出現、連點兩下新增的筆記完全沒有出現，以及已刪除的筆記仍留在列表上。這是某一份特定產生實作的失敗，並不代表 Nuxt 無法正確實作這個應用程式。

在建置、變更與迴歸檢查中，Hozu 的執行通過 72/72，Nuxt 的執行通過 67/72。這次試驗明確地將證據描述為少量：兩次執行中有一次失敗。在得出更廣泛的結論之前，請先閱讀 [trial 0012](/trials/0012-correctness-notes) 中的驗收設計、重現的失敗與成本比較。

## 把讀取與寫入連結起來

列表層級的 tag 是一種宣告，query 與 mutation 都能透過其識別參照它。query 說明哪些 tag 描述它的結果；mutation 說明它的寫入會使哪些 tag 失效。以下摘錄展示了一個公開閱讀清單中的這種關係：

```ts
export const itemsTag = tag({ param: null })
export const listItems = query({
  input: z.object({}),
  output: z.array(Item),
  scope: 'public',
  freshness: 'static',
  tags: () => [itemsTag()],
  runs: 'server',
})
export const addItem = mutation({
  input: z.object({ title: z.string().min(2) }),
  output: Item,
  invalidates: () => [itemsTag()],
  runs: 'server',
  access: 'anyone',
})
```

從 feature 在其 declarations 中列出的某個模組匯出這個 tag 與兩個 effect。mutation 成功後，框架就能找出並重新整理受影響的 query 資料。view 不必手動修改快取中的陣列，再另外說服另一個響應式層相信值已經改變。若是私人筆記應用程式，列表 query 則改為宣告使用者範圍，並透過它的 resolver 取得 session 身分。

tag 也可以帶有以 schema 定義型別的參數。這讓單一項目的 query 可以用一個 tag 作為自己的 key，而較廣的列表使用另一個 tag。請選擇與寫入相符的失效邊界。過窄的 tag 可能讓相關資料維持過時；過寬的 tag 則會造成不必要的重新整理。明確的宣告讓這個決定可以被檢視，但不會替你決定你的領域模型。

## 把實作留在伺服器上

query 或 mutation 的宣告是一個 effect 的 contract，而不是它的資料庫實作。`resolvers(project, implement => [...])` 把實作綁定到宣告的識別上。resolver 可以呼叫資料庫、讀取 Markdown 集合，或在示範應用程式中使用記憶體內的儲存區。

view 透過 `ui.query` 讀取資料。當 feature 的 machine 進入會呼叫某個 mutation 的狀態時，該 mutation 就會執行。成功與已宣告的失敗會透過 machine 的 transition 回傳，並由 contract 描述預期的回應。輸入驗證失敗使用框架的 `Invalid` 錯誤格式，它可以提供欄位層級的訊息。

這種分離意味著，即使儲存實作改變，同一個 view 仍可維持它的資料 contract。誰可以執行某個 effect 並不交給 resolver 決定：每個在伺服器執行的使用者 query 與 mutation 都會宣告 `access`（`'signedIn'`、擁有者規則、`allow` 條件或 `'anyone'`），框架會在 resolver 執行前以 `Forbidden` 拒絕。擁有者規則也會檢查 query 回傳的資料列。resolver 仍須負責資料持久化與正確的領域行為：型別正確的結果並不能證明資料庫查詢選到了正確的紀錄。

## 選擇每個 effect 在哪裡執行

每個 query 與 mutation 都宣告 `runs`。`'server'` 就是上面的 resolver：資料庫、機密或 session。`'browser'` 與 `'either'` 實作在 feature 的 `fetch.ts` 中（`feature({ fetch })`，自 0.11 起）：`'browser'` effect 從不在伺服器上執行，因此存在瀏覽器中的 token 會留在那裡，伺服器則渲染該區塊的 pending 分支；處理公開資料的 `'either'` effect 會先在伺服器上渲染，之後再從瀏覽器讀取。瀏覽器會依照同一份 JSON Schema 檢查每一個回應（[ADR 0049](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0049-0-11-where-effects-run.md)）。

`runs: 'server'` effect 也不一定要用 TypeScript。自 0.22 起，`@hozu/data` 中的 `remote(options, [declarations])` 會把這些 effect 送到以 Go 撰寫的服務，而 `hozu gen` 會依宣告寫出 Go 的 contract：每個 schema 一個 struct、每個宣告的失敗一個錯誤型別、一個需要實作的 interface。存取控制、快取、tag、失效以及依輸出 schema 檢查每個回應，都留在 Hozu 伺服器中，因此回應錯誤的服務會以 `Unexpected` 失敗；宣告改變卻沒有重新執行 `hozu gen` 則是 HZ093。`examples/notes-go` 在所有 resolver 都以 Go 實作的情況下，通過了筆記應用程式的隱藏驗收（[ADR 0068](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0068-resolvers-in-go.md)）。

## 不要重複取得初始結果

當伺服器已經取得某個 query 時，會把結果序列化到頁面的 payload 中。hydration 會使用這份結果，而不是再發出一次相同的初始請求。之後針對新 key 的請求、由 mutation 觸發的重新整理以及即時更新，都是不同的操作；避免重複的初始取得，並不會禁止應用程式讀取最新的資料。有兩種宣告形式可以在沒有寫入的情況下重新讀取：`freshness: { poll: s }` 依計時器重新讀取已掛載的資料（自 0.19 起），而 transition 的 `refresh: () => [tag()]` 會在使用者要求時（例如按下重新載入按鈕）重新讀取帶有該 tag 的 query（自 0.20 起），且不會使任何快取失效。

資料層的設計，包括快取 key、tag 與去重複，記錄在 [ADR 0005](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0005-data-layer.md)。[資料指南](/docs/data) 提供較精簡的撰寫參考。請把這些宣告與有意義的 machine contract 及頁面層級檢查結合使用：由框架掌管的重新整理消除了一類需要手寫的協調工作，而驗收測試仍是確認結果符合使用者需求的依據。
