---
title: Machines 與 contracts
description: 讓 feature 允許的 transition 明確化，再對照預期行為加以檢查。
order: 3
source: eb6affcbabdf
---

## 從一個互動開始

想像一個用來儲存閱讀清單項目的表單。送出之前，使用者可以編輯標題。請求進行中，重複點擊不得再啟動另一次儲存。成功的回應會清空表單；被拒絕的回應會說明問題所在。這些都是產品決策，即使一般元件會把它們分散在各個 handler、載入旗標與 promise callback 之中。

Hozu 把這些決策放進 machine。一個 feature 最多只有一個 machine，靜態的 feature 則可以沒有。machine 宣告它的 context、初始值、初始狀態與 transition。事件、effect 及其 schema 是另外的宣告，註冊在同一個 feature 中。這讓互動在應用程式啟動之前就能被檢視。

## transition 是一個明確的決定

一個小小的確認流程就能說明這個形狀，而且不涉及伺服器。訪客確認一則通知，看到確認訊息，並在宣告的延遲之後回到初始狀態。事件帶有明確為空的 payload，machine 也有明確為空的 context，因為它的狀態已經描述了整個互動。

```ts
import { event, machine, on } from '@hozu/core'
import { z } from 'zod'

export const Acknowledge = event({ payload: z.object({}) })
export const notice = machine({
  context: z.object({}),
  initialContext: {},
  initial: 'idle',
  states: () => ({
    idle: { on: [on(Acknowledge, { target: 'acknowledged' })] },
    acknowledged: {
      ignore: [Acknowledge],
      after: [{ ms: 2000, target: 'idle' }],
    },
  }),
})
```

這裡的延遲是示範用的應用程式選擇，並不是量測得出的框架結果。計時器由框架掌管。`ignore` 宣告讓重複的確認成為刻意的行為，而不是讓一個可見的事件無人處理。沒有 `target` 的 `on` 會停留在原狀態（自 0.20 起）：計時器與已呼叫的 effect 會繼續進行。把目前狀態指定為 target 則會重新進入該狀態，這在進入狀態時會呼叫 mutation 的情況下特別重要。

對於閱讀清單表單，忙碌狀態改為宣告 `invoke(addItem, ...)`。具有 `invoke` 的狀態會捨棄所有它不處理的事件，因此重複點擊不需要任何宣告。它的 `done` transition 描述成功的結果，`failed` transition 則處理已宣告的錯誤，以及框架的非預期錯誤路徑。表單送出一個事件；它不會把非同步請求藏在 view 裡。關於這個邊界，請見[資料指南](/docs/data)。

## 陳述 transition 必須做什麼

contract 從已知狀態開始，提供一個事件或 effect 結果，並陳述預期的結果。自 0.5 起（[ADR 0037](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0037-0-5-lower-reading-and-writing-cost.md)），只有在 transition *做出決定*的地方才需要 contract：在多種結果之間選擇的 guard、導覽，或由 `fn` 計算出的值。上面的確認流程只是在狀態之間移動，因此不需要 contract；它的 transition 會以可讀形式記錄在 `hozu.lock.json` 中：

```text
idle --Acknowledge--> acknowledged
acknowledged --after 2000ms--> idle
```

有 guard 的 transition 則不同。如果只有在通知已讀之後才允許確認，machine 會把這件事保存在 context 中，並由 transition 以它作為 guard：

```ts
export const notice = machine({
  context: z.object({ read: z.boolean() }),
  initialContext: { read: false },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Acknowledge, { target: 'acknowledged', guard: () => ctx.read === true })] },
    acknowledged: {
      ignore: [Acknowledge],
      after: [{ ms: 2000, target: 'idle' }],
    },
  }),
})
```

現在這個 transition 會做出決定，因此需要一個 contract 陳述該決定：

```ts
import { contract } from '@hozu/core'

export const acknowledgesRead = contract(notice, {
  given: { state: 'idle', context: { read: true } },
  when: [{ send: Acknowledge, payload: {} }],
  expect: { state: 'acknowledged' },
})
```

從 feature 在 `declarations` 中列出的模組匯出事件、machine、view 與 contract。HZ016 會回報沒有 contract 的決定，並附上可直接填寫的骨架。已涵蓋的正常路徑，並不能為一條會計算或導覽、卻未被描述的錯誤路徑開脫。

涉及 context 時，`given.context` 預設為 machine 的初始 context。`expect.changes` 陳述一個深層 patch：未提及的欄位必須維持相等，陣列則取代先前的值。預期的 effect 必須明確寫出；省略 `expect.effects` 表示預期沒有任何 effect。

## 讓 lock 與意圖綁在一起

行為 lock 記錄已接受的行為。HZ018 會偵測變更：對於會做決定的 transition，它要求對應的 contract 變更；對於只複製值的 transition，它以 `was: … now: …` 顯示變更。重點在於防止一個看似合理的編輯悄悄重新定義 feature 的功能。這並不是鼓勵你一路修改預期，直到錯誤的實作也能通過。

假設現在確認狀態應該持續更久。先確定這個需求，再修改計時器並執行檢查：HZ018 會顯示 `acknowledged --after 2000ms--> idle` 變成 `after 5000ms`。確認這項變更是刻意的之後，`hozu check --update-lock` 會接受新的基準。當某個 mutation 開始在成功後導覽，或某個 guard 改變了允許的送出條件時，也適用同樣的流程。

最初的直譯器與 contract 設計記錄在 [ADR 0004](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0004-machine-runtime-and-contracts.md)。較精簡的 contract 撰寫形式說明於 [ADR 0022](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0022-authoring-surface-diet.md)。歷史範例使用框架先前的名稱；其原則依然適用，而目前的語法以安裝的 skill 為準。

## 常見決定的精簡形式

幾種較短的形式能讓 machine 保持易讀，同時不隱藏任何決定：
- 在 view 中使用 `ui.set(ctx.field, value)`，會送出一個由框架產生、用來指派單一 context 欄位的事件（自 0.21 起）；payload 會依 context schema 檢查，忙碌狀態會忽略它。
- `target: 'previous'` 會回到最後一個沒有 `invoke` 的狀態，也就是進入忙碌狀態之前的平穩狀態，因此一次儲存可以服務兩種模式（自 0.19 起）；contract 以 `given.previous` 指定它。
- 由使用者設定的模式，例如暫停或列表版面，是 context 欄位而不是狀態，因此儲存某些東西的忙碌狀態不會重設它（0.25 的指南）。
- 在 `keydown` 上使用 `ui.send(Open, {}, { keys: ['Mod+k', '/'] })`，只會在按下這些按鍵時送出（自 0.25 起）。沒有修飾鍵的按鍵會在使用者於欄位中輸入時等待，而輸入法組字期間不會觸發任何事件。
- 不再做決定的 transition（因為它的 guard、導覽或計算值已被移除）只由 lock 審查（自 0.19 起）：HZ018 會要求執行 `hozu check --update-lock`，接著 HZ058 會指出哪些 contract 已不再涵蓋任何決定。

## 了解證明的邊界

contract 是對照你寫下的預期來檢查 machine。它無法證明這份預期符合產品需求、資料庫能正確保存資料，或某個按鈕在手機上容易點到。resolver 測試、渲染頁面檢查與瀏覽器檢查仍各有其任務。

當你需要了解 transition 及涵蓋它們的 contract 時，使用 `hozu why feature.state`。編輯後執行 `hozu check`，再以 `hozu get` 或 `hozu browse` 實際操作產生的頁面。有用的成果是一條證據鏈：明確的需求、經過檢查的 transition，以及與兩者一致的可見結果。
