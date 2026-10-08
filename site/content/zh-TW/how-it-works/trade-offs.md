---
title: 取捨，誠實量測
description: Hozu 以撰寫成本、限制條件與不同的生態系契合度，換取明確的結構與檢查。
order: 6
source: dcb05e02c41c
---

## 設計選擇並非放諸四海皆準的優勢

Hozu 讓應用程式的結構異常明確。query 宣告擁有者與 freshness，view 是封閉的樹，machine 的 transition 有 contract。這讓工具能檢視更多的程式內容，但也讓作者或 agent 有更多陌生的內容需要學習、閱讀與維護。

試驗紀錄量測這項成本，而不是假設這種設計一定比較便宜。它們比較的是特定的任務、模型、scaffold 與變更需求。單一試驗得出的比值並不能預測每一個應用程式，而通過驗收測試組是針對所檢查行為的證據，並不能證明整體的正確性。

## 為什麼與 Nuxt 比較

以下每一項成本數據都是 Hozu 對比 Nuxt，這是刻意的選擇。Nuxt 是模型的主場：它存在於每個模型的訓練資料中，agent 寫起來駕輕就熟。Hozu 則不然，每個 session 都要從指南學習它。試驗讓其他條件全部相同：相同的模型、相同的規格、相同的隱藏驗收。只有框架不同。

因此這個比值主要量測的是學習成本。一項針對對話紀錄的研究發現，多出來的 token 大多花在閱讀指南上，再乘以 agent 發出的每一次呼叫（[ADR 0038](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0038-cost-anatomy.md)）。在長期執行中，0.8 每次變更的量測結果為 Nuxt 的 1.34–1.72×（[trial 0021](/trials/0021-0-8-long-run)）。隨著指南變短，以及模型開始認識 Hozu，這個差距預期會縮小。正確性的差異則來自結構：框架讓哪些東西難以寫出。這部分預期不會縮小。Trial 0024 預先登記於 [ADR 0055](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0055-trial-0024-learning-cost.md)，它以相同的 29 項變更，分別在冷啟動指南、已熟悉指南以及 Nuxt 下執行，藉此把這兩者區分開來。

在八項保留的變更上，agent 實際面對的 Hozu 0.14 花費了 Nuxt 加權 token 的 1.42×（第二次執行為 1.32×）。在已熟悉指南後，成本為 1.06×（1.02×）：與 Nuxt 大致相同。因此剩下的大部分是學習成本，而且每個 session 只需付出一次。兩組 Hozu 都通過了每一步的每項檢查；Nuxt 則在三個步驟中悄悄破壞了一個原本正常運作的匯出功能，而它的型別檢查與建置都通過了。限制在於：只有一個應用程式、一個模型（Claude Opus），而「已熟悉」組是以扣除攜帶預載指南的成本來估算的。[Trial 0024](/trials/0024-learning-cost) 收錄了方法與所有數據。

## 任務看板的結果有所差異

Trial 0010 在任務看板上，每組每個步驟執行兩次。Hozu 的平均加權 token 成本，建置為 Nuxt 的 1.64×，變更為 1.44×。八次執行的正確性全都相同。建置未達到設定的目標，變更則達到了。報告指出，閱讀陌生的框架與產生的原始碼是仍然存在的成本。

Trial 0011 評估了額外的檢視工具與 scaffold 摘要。量測到的比值為建置 2.28×、變更 1.53×，兩項目標都未達成。這次比較沒有重新執行 Nuxt；報告使用 trial 0010 的基準。在四次 Hozu 0.3 的執行中，報告的比較結果為 1.96× 與 1.48×。這些數值不應與新量測的 Nuxt 執行結果默默混用。

工具確實有被使用，但部分指引沒有被遵循，而一次腳本化編輯的錯誤也影響了其中一次建置。在解讀框架層級的主張時，這一點很重要：agent 的工作流程與一般的失誤都可能左右結果。請把 [trial 0010](/trials/0010-map-scaffold-recipes) 與 [trial 0011](/trials/0011-inspect-and-summaries) 一起閱讀，而不是挑選比較好看的數字。

## 正確性與成本可以各自變動

Trial 0012 引入了一個以常見錯誤為設計核心、需要帳號的筆記任務。Hozu 在其所有執行中通過 72/72 項檢查；Nuxt 通過 67/72。差異出現在一次變更中，而在此之前兩個框架都已通過所有建置檢查。重現的 Nuxt 失敗涉及就地修改 shallow ref 資料，進而打亂了排序與後續的重新整理。

這個結果說明了 Hozu 的 contract 與由框架掌管的資料重新整理所要防止的那一類無聲迴歸。它並不能確立一般性的失敗率：這次試驗每個框架只有兩次執行。額外的檢查也不是免費的。Hozu 的平均加權 token 比較為建置 2.79×、變更 2.06×。[Trial 0012](/trials/0012-correctness-notes) 說明了這個結果的兩面。

帳號 scaffold 改變了下一次的建置比較。在 trial 0013 中，兩次新的 Hozu 執行使用了 `--with auth`；兩者都通過了 15/15 項驗收檢查，平均建置比較變為 1.66×。Nuxt 沒有重新執行：基準是先前的筆記試驗。這次後續試驗沒有新的變更步驟量測，因此它在建置上的改善，不得被呈現為修改應用程式時經過量測的改善。

Hozu 0.5 針對的是一項對話紀錄研究所找出的原因：agent 把多出來的 token 大多花在閱讀指南上，而每一次額外的呼叫都會再次攜帶這些閱讀內容（[ADR 0038](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0038-cost-anatomy.md)）。透過在 callback 中使用一般的 TypeScript、把指南精簡並拆分為 `hozu docs` 主題，以及減少驗證上的繞路，trial 0016 在每個步驟四次 Claude 執行下，量測到建置為 Nuxt 的 1.38×、變更為 1.45×。全部五次執行（包括一次由 Codex 執行）都通過了所有 36 項檢查。Nuxt 的基準仍是 trial 0012 的兩次執行，且 1.3× 的成本目標並未達成：閱讀陌生的指南仍是需要付出的代價。[Trial 0016](/trials/0016-0-5-four-runs) 記錄了這些內容。

Hozu 0.7 處理剩下的部分：撰寫介面迫使 agent 必須寫出的程式碼（[ADR 0041](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0041-0-7-write-less.md)）。[Trial 0019](/trials/0019-0-7-write-less) 在筆記任務上量測到建置為 Nuxt 的 1.14×、變更為 1.38×，在大量使用 widget 的任務（Leaflet、Chart.js、GSAP 與 Three.js）上則為 1.75× 與 2.03×，每個步驟執行兩次，且所有檢查皆通過。額外成本變小了，但並未消失。

## 限制本身就是產品的一部分

當你希望框架檢視相依關係與事件綁定時，封閉的 view 樹很有用。但當元件設計依賴任意的 render 函式、未宣告的 effect 或大型既有函式庫的假設時，它就比較不方便。Hozu 為命令式 DOM 整合提供型別化的 client 元件：它們的 props、slot 與發出的事件（`emits`）都有宣告，但 client 模組本身是不透明的；IR 無法證明其中的每一行。

這個框架刻意不提供獨立的純 SPA 模式。以使用者範圍資料為主的應用程式，是 render planner 推導出的一種情況，而不是繞過伺服器優先 pipeline 的第二種應用程式模型。全域可變的 client 端 store 也不在既定設計之內：跨 feature 的狀態透過公開的 feature contract 傳遞。

如果你既有的應用程式大量依賴這些模式，採用 Hozu 可能不只是轉換元件語法而已。請從邊界評估遷移：資料擁有權、路由、持續存在的 UI 以及第三方整合。不要把 client 元件的存在，當作某項特定整合成本低廉的證明。

## 投入之前先確認生態系契合度

Hozu 擁有自己的細粒度 DOM runtime，而不是編譯到既有的元件渲染器。因此既有、特定於某框架的元件無法直接作為 Hozu view 使用。真正該問的是：它文件記載的功能是否涵蓋你的應用程式，以及其餘的整合是否適合 client 元件的邊界。這個儲存庫沒有提供生態系規模的效能測試，因此本指南也不會憑空捏造。

伺服器端與 TypeScript 的綁定程度較低。自 0.22 起，`runs: 'server'` effect 可以透過 `remote()` 以 Go 服務實作，並由 `hozu gen` 依宣告寫出 contract，而存取控制、快取與輸出檢查都留在 Hozu 伺服器中（[ADR 0068](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0068-resolvers-in-go.md)）。一位試驗 agent 把商店後台的訂單生命週期、庫存與儀表板統計移到 Go；它自己的結論是，除非已經有 Go 服務存在，或有經過量測的需求，否則應繼續使用 TypeScript（[ADR 0070](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0070-0-23.md)）。這個邊界也讓每次呼叫多一次跨行程往返，只有在 resolver 確實做了實質工作時才划算。

主流元件框架不需要特別要求就會提供的某些東西，Hozu 必須刻意加入。例如 0.25 在條件的兩個分支形狀相同時保留同一個元素，讓焦點得以維持，並加入了宣告式的鍵盤快捷鍵（[ADR 0072](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0072-0-25.md)）。請預期會遇到這類缺口；每補上一個，changelog 都會記錄下來。

一個小型的探索性 feature，能比籠統的承諾回答更多問題。用 scaffold 建立它、檢視它的宣告、做一次貼近實際的變更，並驗證結果：

```sh
npx hozu add feature notes --page /notes --with detail,remove
npx hozu map
npx hozu check
npx hozu get /notes --forms
```

當某個熟悉框架的既有元件、團隊經驗或所需的應用程式模型，比 Hozu 的明確檢查更有價值時，請選擇該框架。當可檢視的行為與資料邊界符合你的問題時，可以考慮 Hozu，並為學習它的撰寫介面預留成本。有用的決定，是由你自己具代表性的任務所支持的決定，並把[已發表的試驗](/trials)當作參考背景，而非保證。
