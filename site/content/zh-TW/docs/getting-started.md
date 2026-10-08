---
title: 快速開始
description: 建立你的第一個 Hozu 應用程式，並驗證一個可運作的 feature。
order: 1
source: 586cdc2470aa
---

## 不熟悉終端機？把這段貼給你的 agent

在一個空資料夾中開啟 Claude Code、Codex 或 Cursor，貼上這段提示詞。把最後一行換成你想做的東西。

```text
Set up a new Hozu web app for me in this folder, step by step, and explain each step in plain words.

1. Check that Node.js is version 22.18 or newer (`node -v`). If it is missing or older, stop and tell me how to install it.
2. Run `npm create hozu@latest my-app -- --agent claude` (use `--agent agents` if you are not Claude Code), then `cd my-app` and `npm install`.
3. Before writing any code, read the Hozu skill in `my-app/.claude/skills/hozu/SKILL.md` (or `my-app/AGENTS.md`). Hozu is not in your training data: follow the skill, not what you remember from other frameworks.
4. Build the first page of the app I describe below. Run `npx hozu check` and fix every problem it reports.
5. Start `npm run dev` in the background and tell me the address to open (usually http://localhost:3000). Tell me that the dock at the bottom of the page is Hozu DevTools: I can choose Select, click a part and describe a change for you.

My app: <describe what you want, e.g. "a reading list where I add books and mark them as read">
```

## 建立應用程式

Hozu 需要 Node 22.18 或更新版本。它的設定檔與應用程式檔案使用 TypeScript，由 Node 以原生型別剝除（type stripping）直接執行。

建立應用程式時，選擇對應你的 coding agent 的指南：

```sh
npm create hozu@latest my-app -- --agent claude
cd my-app
npm install
```

Codex、Cursor 或 Copilot 請使用 `--agent agents`；團隊同時使用多種 agent 時請使用 `--agent both`。這些旗標會安裝對應的專案指示與 Hozu 撰寫 skill。

## 新增一個 feature

scaffold 會提供一個列表 query、一個新增表單、一個狀態機（state machine）以及暫代用的 resolver。為 feature 命名，並指定明確的路由：

```sh
npx hozu add feature tasks --page /tasks
npx hozu check
npx hozu get /tasks
```

輸出會告訴你該編輯哪些檔案與面向使用者的文字。若想一開始就包含常見互動，加上 `--with detail,toggle,filter,remove`。`auth` 選項還會產生帳號流程及其 contract；用於正式環境前，請替換其中的示範登入。其他 transition 只是複製值，因此 scaffold 不會為它們撰寫 contract：由 `hozu.lock.json` 記錄它們（見 [Machines and contracts](/docs/machines)）。

## 認識專案結構

| 檔案 | 職責 |
| --- | --- |
| `hozu.config.ts` | 註冊 schema 轉接器、feature、路由與頁面。 |
| `routes.ts` | 宣告路徑及其參數 schema。 |
| `features/tasks/model.ts` | 宣告資料、事件與行為。 |
| `features/tasks/views.ts` | 描述 UI 及其 contract。 |
| `features/tasks/feature.ts` | 註冊 feature：它的模組、imports 與 exports。 |
| `features/tasks/server.ts` | 實作 feature 的 query 與 mutation。 |
| `app.ts` | 應用程式模組：resolver、session 儲存區與 client 元件。 |
| `app.css` | 載入 Tailwind 與應用程式樣式。 |

相對路徑的 TypeScript import 以 `.ts` 結尾。import 一律明確：沒有自動匯入的輔助函式，也沒有從檔名推斷的路由。

## 修改並檢查

編輯 scaffold 的文字或資料模型，然後執行 `npx hozu check`。它會檢查 TypeScript、框架規則以及每一個行為 contract。使用 `npx hozu get /tasks --forms` 可以在不啟動伺服器的情況下檢視產生的頁面。

在本機瀏覽器開發時，`npm run dev` 會啟動應用程式，每次編輯都會重新載入，並附帶 [Hozu DevTools](/docs/devtools)：選取頁面的某個部分，就能交給你的 agent 一份標明檔案與行號的請求。`npm start` 則以正式環境模式執行同一個應用程式，不含上述功能（`hozu serve`，執行 `project({ app })` 指定的應用程式模組），除非已設定 `NODE_ENV`：此時有 session 的應用程式需要 `SESSION_SECRET`（`openssl rand -hex 32`），缺少時會拒絕啟動。在修改過程中，同一行程內的指令已足以檢查文字、狀態碼、連結與原生表單。

scaffold 把資料存放在名為 `demo…` 的模組層級陣列中：所有訪客共用它，重新啟動就會遺失。出貨前，請決定資料實際存放在哪裡、[這是誰的資料](/docs/data)，並替換 resolver 中的 `demo…` 暫代實作。

## 了解設計理念

閱讀 [Hozu 如何運作](/how-it-works/why-ai-first)，了解這套 API 背後的決策及其取捨。
