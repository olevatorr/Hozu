---
title: Hozu DevTools
description: 指著畫面；交給你的 agent 一份請求，裡面指出檔案、行號，以及用 Hozu 的方式該怎麼改。
order: 17
source: 883a06bbded5
---

## 啟動它

`npm run dev` 會啟動帶有 Hozu DevTools 的開發伺服器：每個頁面底部都有一個小小的 dock（工具列）。正式版建置永遠不會包含它，它也不會更動你程式碼裡的任何東西。

| Dock | 用途 |
| --- | --- |
| Browse / Select | 像平常一樣使用應用程式（瀏覽），或點擊某個部分來選取它（`Alt+Shift+S` 切換） |
| Changes | 你為這份請求描述過的部分（變更），以及已儲存的請求 |
| Page | 頁面的標題、描述與其他 head 欄位 |
| Layers | 頁面的每個部分（圖層）、目前不在畫面上的狀態，以及頁面的預覽 |
| Assets | 應用程式的每個元件集中在一塊看板上（素材），以及 design token |
| API | 頁面讀取的資料與它能做的變更，用你自己的輸入執行 |
| Frame | 以精確尺寸呈現的頁面（框架）：手機、平板、筆電，或拖曳角落調整 |
| Agent | 你的 agent 用 `hozu show` 在這個頁面上留下的說明；有說明時才會出現 |
| Settings | 設定：Builder 或 Developer、外觀、請求是否附上程式碼片段，以及快捷鍵 |

## 描述一項修改

1. 選擇 **Select**（選取），點擊需要修改的地方。快捷鍵和 Figma 一樣：`Shift+Enter` 選取外層的部分，`Enter` 選取內層的第一個部分，`Tab` / `Shift+Tab` 選取相鄰的下一個或上一個部分，按兩下則選取一段文字。選取範圍會顯示尺寸 `W × H`。
2. 檢視器會用白話說明它是什麼：一個在六個地方使用的共用按鈕、一段來自你資料的文字、一則兩處共用的訊息。
3. 寫下該怎麼改。先在頁面上試試某個樣式或其他文字（更長的、中文、英文）：這只是預覽。**Design** 面板就是 Figma 的那一套，順序也相同：Frame（W、H、圓角）、Auto layout（間距、內距）、Layer（不透明度）、Fill、Stroke、Effects（陰影）與 Text。在 Builder 模式下，數值會先顯示它的 design token（`2xl · 24px`、`red · #fb3a0e`）；在 Developer 模式下則顯示 class（`text-2xl · 24px`）。
4. 點擊下一個部分，同樣描述它。每個描述過的部分都會留在同一份請求裡。
5. **Copy for AI**（複製給 AI）會把請求存成 `.hozu/requests/0007-….md`，並複製完整內容讓你貼給你的 agent（最後一行會寫出檔名，讓 agent 能把它標為完成）；或使用 **Save request**（儲存請求），它會存檔並只複製要交給 agent 的那一行。不管你按幾次，兩者都只會存成一個檔案。

client 元件（具有 `client` 模組的元件，例如地圖或畫布）會在瀏覽器端繪製它的內部，因此 DevTools 會把它當成一個部分來選取，並說明是哪個模組繪製它。若要選取它周圍的部分，例如工具列或面板，請把它們寫成 view，元件裡只保留需要瀏覽器端程式碼的部分。

請求中的每個部分都會寫出它的 `file:line`、你選擇的範圍（只有這個 instance、每個項目，或主元件：它的每一處使用）、樣式要使用的主題 class，並且只在單純修改會出錯的地方附上提醒。

## 測量

和 Figma 一樣，按住 **Alt** 並指向：選取某個部分時，紅線會顯示它到指標下方部分的 px 距離（兩個部分之間的間距，或其中一個包住另一個時的四邊內距）；沒有選取任何東西時，指標下方的部分會和包住它的部分相互測量。

## 所有元件集中在一塊看板上

**Assets**（素材）會打開一塊全螢幕看板，列出應用程式的每個元件：每個 variant 各自獨立呈現，以你的樣式表即時渲染，另外還有來自 `previews.ts` 的具名狀態。你不用另外寫展示頁。點擊某個元件可以看到它的 variant、屬性、slot 與 `file:line`；**Where used**（使用位置）會列出使用它的頁面，**Show the instances**（顯示 instance）會框出它在這個頁面上的每一處使用（或打開一個有使用它的頁面）。**Change the main component**（修改主元件）會在目前的請求中加入一項針對每一處使用的修改。**Styles**（樣式）會顯示 design token：顏色、文字大小、圓角與陰影。

## 用你選的資料呈現畫面

`previews.ts` 存放給人看的畫面：處於某個具名狀態的元件，或是 query 以你提供的資料回答的頁面。在 `hozu.config.ts` 中以 `previews: new URL('./previews.ts', import.meta.url)` 指定它：

```ts
import { previews } from '@hozu/core/preview'
import { me } from './features/account/model.ts'
import { listNotes } from './features/notes/model.ts'
import { home } from './routes.ts'
import { Button } from './ui/button.ts'

export default previews((p) => [
  p.component(Button, 'Long label', { variant: { tone: 'primary' }, children: 'Save every note you wrote today' }),
  p.page(home, 'No notes', [p.data(me, { name: 'ada' }), p.data(listNotes, [])]),
  p.page(home, 'Notes failed', [p.data(me, { name: 'ada' }), p.fail(listNotes, 'Unexpected')]),
])
```

**Layers → Previews**（或 **Assets → Screens**）會打開一個畫面；在你離開之前，dock 都會顯示它。開啟期間，每個讀取這些 query 的頁面都會顯示預覽資料，而 mutation 仍然會寫入。這個檔案永遠不會上線：只有 `hozu dev` 與 `hozu check` 會載入它，正式環境的伺服器會忽略這個切換。`hozu check` 會把不再符合應用程式的預覽回報為 HZ092。除非你要求它修改某個預覽，否則你的 agent 不會動這個檔案。

## 查看每一種狀態

Layers 會列出頁面可能處於的狀態：載入中、失敗、空白、儲存中、確認對話框、錯誤訊息。**Preview**（預覽）可以在不執行任何東西的情況下顯示其中一種；在你離開之前，dock 都會標示正在預覽。預覽期間建立的請求會記錄當時的狀態。

## 試用資料

**API** 會在底部打開一個抽屜（在 Frame 中也可以），列出頁面讀取的資料與它能做的變更：每一項在哪裡執行、如何快取，以及實作它的 `file:line`。在該列中編輯輸入（預設是頁面目前使用的值）並執行：你會看到以表格或 JSON 呈現的值，或是宣告過的錯誤，並在下方標出無效的欄位，以及花了多少時間。變更會先在該列中詢問你，因為它會寫入你的開發資料；接著頁面會就地重新讀取它所 invalidate 的資料，就像是頁面上的按鈕做了這項變更一樣。History（歷史紀錄）會保留這個 session 的呼叫，**Copy as hozu call** 則把其中一筆交給你的 agent。

每一列都會標示它是 **reads**（讀取）還是 **writes**（寫入）；**JSON** 可以送出任何輸入，包括 schema 會拒絕的輸入，讓你看看錯誤請求會得到什麼回應。**Requests it sent**（它送出的請求）會列出一次呼叫實際送出的內容，包括來自伺服器與瀏覽器的：方法、URL、雙向的 headers 與 body、狀態碼與時間，並可用 **Copy as curl** 複製到終端機、Postman 或 Bruno。當應用程式有 session 時，**Act as**（以…身分操作）可以把這個瀏覽器的 session 設成任何值（僅限開發環境）。**Endpoints** 會對每個宣告過的 endpoint 送出請求，可帶入它的路徑、query 或 JSON body，以及你自己的 headers，例如 `Authorization: Bearer …`。

## 交給你的 agent

```sh
npx hozu requests --full      # every open request as one prompt
npx hozu requests done 7 --result "The heading is text-2xl"
```

由 `create-hozu` 設定好的 agent 都知道這個流程（`hozu docs requests`）：讀取請求、在每個位置修改、執行 `hozu check`，然後逐一關閉請求，也就是刪除那個檔案。告訴你的 agent：「Do the open Hozu requests.」

## 看看你的 agent 改了什麼

你的 agent 可以回頭指給你看。完成修改後，它會對改過的部分執行 `hozu show`，並附上用你的話寫的說明：

```sh
npx hozu show features/notes/views.ts:42 --note "Delete now asks before it removes a note"
npx hozu show features/notes/views.ts:51 --in "Buy milk" --note "Pinned notes go first"
npx hozu show page:home --note "The page title is shorter"
```

該部分會在你的頁面上出現編號紅框，dock 中也會出現一個顯示數量的 **Agent** 按鈕。較長的說明在框上會被截短：點擊標籤即可閱讀全文。它的面板會依序顯示每則說明，用 Back 與 Next 逐一切換並捲動到對應的部分。**Send reply**（送出回覆）會把你的回答以請求的形式交回去；**Resolve**（已解決）會移除這則說明。`file:line` 不需要執行中的開發伺服器就能找到它的部分。單獨執行 `hozu show` 會列出尚未處理的說明，當某則說明指向的部分移動或消失時，會把它標為 `STALE`。說明只存在於 `hozu dev` 下的 `.hozu/notes.json`：正式版建置永遠看不到它們。

## Builder 或 Developer

設定可以在白話說明（Builder，預設）與原始碼檢視（Developer）之間切換：Developer 會顯示檔案、程式碼片段、元件、transition 與 node id。`npm run dev -- --devtools developer` 會直接以原始碼檢視啟動。外觀會跟隨你的系統，除非你在那裡選擇淺色或深色；**Add the code excerpt**（附上程式碼片段）會把每個位置周圍的七行程式碼放進請求（預設關閉：agent 反正會讀取檔案）。

## 使用你的語言

除非你提供自己的文字，DevTools 預設使用英文。把每個字串印出來、翻譯其中的值，然後指定這個檔案：

```sh
npx hozu devtools messages > devtools.zh-TW.json
npm run dev -- --devtools-messages devtools.zh-TW.json
```

若要在每個專案中使用同一份翻譯，改成在你的 shell 中設定一次：`export HOZU_DEVTOOLS_MESSAGES=~/.config/hozu/devtools.zh-TW.json`。參數的優先順序高於環境變數。保留大括號中的 `{names}`：DevTools 會填入它們。檔案中缺少的字串會以英文顯示，因此升級永遠不會讓檔案失效；`hozu dev` 會告訴你缺少多少個，`npx hozu devtools messages --check devtools.zh-TW.json` 則會列出它們。每次載入頁面時都會重新讀取這個檔案。

只有介面會改變。你的 agent 讀取的請求，以及每一個 CLI 指令，都維持英文。Hozu 的 repository 在 `examples/studio/devtools.zh-TW.json` 中保留了一份完整的繁體中文檔案。
