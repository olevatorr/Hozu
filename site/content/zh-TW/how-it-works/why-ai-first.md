---
title: 為什麼是 AI-first？
description: Hozu 讓應用程式的行為對工具可見，讓 agent 能檢查的不只是程式碼能否編譯。
order: 1
source: db603f005db2
---

## agent 能夠檢視的程式

Hozu 從一個實際的問題出發：前端框架應該讓 agent 能輕鬆驗證什麼？agent 可以快速產出看似合理的程式碼，但建置成功幾乎無法說明新增一項功能是否保留了既有行為。Hozu 為行為、資料擁有權與渲染規則提供明確的形式，讓它的工具能在開啟瀏覽器之前就加以檢視。

目標是讓無效的程式在結構上難以表達，並讓有效的程式能以低成本驗證。這是一項設計目標，而不是宣稱產生的應用程式會自動正確。開發者仍須決定應用程式該做什麼、撰寫有意義的 contract，並在瀏覽器中檢查實際體驗。

Hozu 應用程式會依序經過 `feature()` 原始碼、Feature IR、validator、compiler 與 runtime。IR 是中介表示（intermediate representation）：描述程式的結構化資料。TypeScript 協助你撰寫這份資料，而 IR 讓之後的每個階段對應用程式都有相同的認知。[ADR 0002](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0002-feature-ir-and-authoring.md) 記錄了最初的決定。

## 把決策放在工具看得到的地方

以閱讀清單為例。它的宣告描述了項目 schema、新增項目的事件、儲存項目的 mutation，以及讀取列表的 query。machine 則描述何時允許新增、請求進行中會發生什麼，以及成功或失敗如何改變畫面。

這些宣告屬於一個 feature。feature 列出匯出它們的模組；每個匯出的宣告都以其名稱註冊。

```ts
import * as model from './model.ts'
import * as views from './views.ts'

export const items = feature({
  id: 'items',
  intent: { summary: 'A reading list' },
  declarations: [model, views],
})
```

使用方會明確匯入另一個 feature，且只使用其匯出的宣告。跨 feature 的參照指向宣告的識別，而不是在鬆散相關的字串中重複名稱。因此框架能夠分辨刻意的公開相依，與某個 view 伸手存取另一個 feature 的私有行為。

view 也採用相同的做法。`ui()` 樹記錄元素、條件、列表與事件綁定。它不會把網路請求藏在任意的渲染函式裡。運算子、條件與指派以一般的 TypeScript 撰寫，並由原始碼轉換記錄為資料；其他任何運算都有一個具名、以 schema 定義型別的 `fn()` 邊界。

## 一個值得為之設計的具體失敗

trial 0012 中的筆記應用程式測試了帳號隔離、重複送出、不使用 JavaScript 的表單，以及之後的釘選與搜尋變更。兩個框架在兩次執行中都通過了所有建置檢查。在變更過程中，有一次 Nuxt 執行引入了型別檢查與正式建置都沒有抓到的失敗。

試驗指出的原因如下：

> The pin handler mutates `note.pinned` in place on `useFetch` data, which Nuxt 4 keeps in a shallow ref, so the sorted list and later refreshes stop updating.

那次執行也不再顯示新增的筆記，並讓已刪除的筆記持續可見。報告記錄 Hozu 的執行共通過 72/72 項檢查，Nuxt 的執行共通過 67/72 項。這是兩次 Nuxt 執行中一個特定迴歸問題的證據，而不是對任一框架整體失敗率的估計。請在 [trial 0012](/trials/0012-correctness-notes) 中閱讀試驗設定與重現的失敗。

Hozu 透過各自獨立、彼此互補的機制來處理這一類錯誤。contract 驗證 machine 的 transition；query 的 tag 與 mutation 的失效機制，讓框架負責重新整理資料。這些機制減少了應用程式作者必須協調的同步程式碼，但兩者都無法證明 resolver 正確實作了產品需求。

## 驗證是有成本的

明確的行為需要更多原始碼與閱讀時間。在任務看板上，trial 0010 量測到 Hozu 的加權 token 在建置時為 Nuxt 的 1.64×，變更時為 1.44×。兩個框架都通過了驗收檢查。建置未達到試驗的目標，變更則達到了。[Trial 0010](/trials/0010-map-scaffold-recipes) 收錄了完整的比較。

在帳號 scaffold 出現之前，筆記試驗量測到建置 2.79×、變更 2.06×。加入該 scaffold 後，trial 0013 的建置比較降到 1.66×，使用的是兩次新的 Hozu 執行與先前的 Nuxt 基準。這項改善針對的是特定的工作流程與任務；它並不能確立普遍的生產力優勢。[Trial 0013](/trials/0013-notes-with-auth-scaffold) 記錄了其範圍。

一項針對所有試驗對話紀錄的研究，接著找出了剩餘成本所在：主要是閱讀指南，再乘以 agent 發出的呼叫次數，而不是撰寫程式碼（[ADR 0038](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0038-cost-anatomy.md)）。Hozu 0.5 的回應是讓 callback 使用一般的 TypeScript，並把指南拆分成可用 `hozu docs` 查找的主題。在同一個筆記任務上，每個步驟四次執行量測到建置為 Nuxt 的 1.38×、變更為 1.45×，而全部五次執行（其中一次由 Codex 執行）都通過了所有檢查。[Trial 0016](/trials/0016-0-5-four-runs) 收錄了細節與限制。

接著，一個大量使用 widget 的任務（地圖、圖表、動畫與 WebGL 地球儀）呈現了成本的另一半：撰寫介面迫使 agent 必須寫出的內容。Hozu 0.7 讓 machine 能從 URL 啟動、讓 `fn` 本體共用輔助函式、以模組註冊宣告，並在狀態之間共用 transition（[ADR 0041](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0041-0-7-write-less.md)）。[Trial 0019](/trials/0019-0-7-write-less) 量測到筆記任務建置為 Nuxt 的 1.14×、變更為 1.38×，widget 任務則為 1.75× 與 2.03×，所有檢查皆通過。

在一次長期執行中，Hozu 0.8 又完成了 16 項變更，沒有任何迴歸，也沒有任何無聲失敗，每次變更的成本為 Nuxt 的 1.34–1.72×（[trial 0021](/trials/0021-0-8-long-run)）。[Trial 0024](/trials/0024-learning-cost) 接著探討其中有多少是學習成本。以 Hozu 0.14 而言，當 agent 從指南學習 Hozu 時，一次變更的成本為 Nuxt 的 1.32–1.42×；在已熟悉指南後則為 1.02–1.06×：結構本身的成本與 Nuxt 大致相當。在 29 項變更中，Hozu 通過了每一步的每項檢查，而 Nuxt 則在三個步驟中悄悄破壞了一個原本正常運作的功能。

## 從你需要回答的問題開始

agent 可以使用 `hozu map` 找出相關的宣告、用 `hozu inspect` 檢視一個 feature，並用 `hozu why` 了解一個狀態。`hozu check` 整合了型別檢查、規則與 contract。接著 `hozu get` 讀取渲染後的頁面，`hozu browse` 則在真實瀏覽器中執行流程，兩者都不需要啟動伺服器。

這套工作流程就是 AI-first 在這裡的實際意義：揭露決策、讓決策之間的關聯可以被檢視，並回傳可據以行動的失敗資訊。請繼續閱讀 [pipeline](/how-it-works/pipeline)，或使用較精簡的 [agent 工作流程指南](/docs/ai-agents) 在應用程式中實際試試看。
