export const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --ink: #111010; --ink-2: #1a1918; --ink-3: #0b0a0a; --paper: #f1ede4; --red: #fb3a0e; --green: #2fa36b;
  --text: #ece8df; --mute: #9a948a; --line: rgba(241, 237, 228, 0.1); --line-2: rgba(241, 237, 228, 0.16);
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  font: 13px/1.45 var(--sans); color: var(--text); -webkit-font-smoothing: antialiased;
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
}
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.box { position: fixed; box-sizing: border-box; pointer-events: none; }
.box[hidden], .panel[hidden] { display: none; }
.tag {
  position: absolute; left: -1px; bottom: 100%; margin-bottom: 6px; white-space: nowrap;
  background: var(--ink); color: var(--text); font: 500 11.5px/1 var(--mono); padding: 6px 8px;
  border-radius: 6px; border: 1px solid var(--line-2); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}
.tag b { color: var(--red); font-weight: 600; }
.box.below .tag { bottom: auto; top: 100%; margin: 6px 0 0; }
.badge {
  position: absolute; right: 0; top: 0; transform: translate(50%, -50%);
  min-width: 18px; height: 18px; display: grid; place-items: center; padding: 0 5px; border-radius: 999px;
  background: var(--red); color: #fff; font: 600 11px/1 var(--sans);
}

.dock {
  position: fixed; pointer-events: auto; display: flex; align-items: center; gap: 2px; padding: 4px;
  background: var(--ink); color: var(--text); border: 1px solid var(--line-2); border-radius: 999px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22), 0 1px 2px rgba(0, 0, 0, 0.2);
  user-select: none; touch-action: none;
}
.grip {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; cursor: grab; flex: none;
  background: #fff; box-shadow: inset 0 0 0 1px rgba(17, 16, 16, 0.08); margin-right: 4px;
}
.grip img { width: 18px; height: 18px; display: block; pointer-events: none; }
.dock.folded { padding: 4px; }
.dock.folded .grip { margin-right: 0; }
.grip:active { cursor: grabbing; }
.dock .seg { display: flex; background: rgba(241, 237, 228, 0.06); border-radius: 999px; padding: 2px; }
.dock button.mode, .dock button.act {
  background: none; border: 0; border-radius: 999px; padding: 5px 11px; font: 500 12.5px/1.2 var(--sans); color: var(--mute);
}
.dock button.mode[aria-pressed="true"] { background: rgba(241, 237, 228, 0.14); color: var(--text); }
.dock button.mode:hover, .dock button.act:hover { color: var(--text); }
.dock button.act:hover { background: rgba(241, 237, 228, 0.06); }
.dock .count:not(:empty) {
  display: inline-grid; place-items: center; min-width: 16px; height: 16px; padding: 0 4px; margin-left: 6px;
  border-radius: 999px; background: var(--red); color: #fff; font: 600 10.5px/1 var(--sans); vertical-align: 1px;
}
.dock .hint { padding: 0 10px 0 6px; font: 12px/1 var(--sans); color: var(--mute); white-space: nowrap; }

.panel {
  position: fixed; pointer-events: auto; top: 16px; right: 16px; width: min(400px, calc(100vw - 32px));
  max-height: calc(100vh - 96px); overflow: auto; overscroll-behavior: contain;
  background: var(--ink); border: 1px solid var(--line-2); border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.18);
  scrollbar-width: thin; scrollbar-color: rgba(241, 237, 228, 0.2) transparent;
}
.head { position: sticky; top: 0; background: var(--ink); padding: 14px 16px 12px; border-bottom: 1px solid var(--line); z-index: 1; }
.kicker { font: 500 12px/1.2 var(--sans); color: var(--mute); padding-right: 32px; }
.title { margin: 4px 0 0; font: 600 16px/1.3 var(--sans); color: var(--text); word-break: break-word; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.title code { font: 500 11.5px/1 var(--mono); background: rgba(251, 58, 14, 0.14); color: #ff8a66; padding: 4px 7px; border-radius: 6px; }
.close {
  position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; border: 0; border-radius: 8px;
  background: none; color: var(--mute); font: 400 18px/1 var(--sans);
}
.close:hover { background: rgba(241, 237, 228, 0.08); color: var(--text); }
.picks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.picks button { border: 1px solid var(--line-2); background: none; border-radius: 6px; padding: 3px 8px; font: 500 11.5px/1.3 var(--mono); color: var(--mute); }
.picks button[aria-current="true"] { border-color: var(--red); color: var(--text); background: rgba(251, 58, 14, 0.1); }

.sec { padding: 12px 16px; border-bottom: 1px solid var(--line); }
.sec:last-child { border-bottom: 0; }
.label { font: 500 12px/1 var(--sans); color: var(--mute); margin-bottom: 8px; }
.loc { display: flex; gap: 8px; align-items: center; font: 12px/1.4 var(--mono); color: var(--text); }
.loc > span:nth-child(2) { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.loc button {
  flex: none; border: 1px solid var(--line-2); background: none; border-radius: 6px; padding: 2px 7px;
  font: 500 11px/1.3 var(--sans); color: var(--mute);
}
.loc button:hover { color: var(--text); background: rgba(241, 237, 228, 0.06); }
.loc + .loc { margin-top: 6px; }
.loc .what { color: var(--mute); flex: none; width: 66px; font-family: var(--sans); }
.warn { color: #ff8a66; }
pre {
  margin: 10px 0 0; padding: 8px 0; overflow: auto; background: var(--ink-3); color: #cfc9be;
  border: 1px solid var(--line); border-radius: 8px; font: 11.5px/1.6 var(--mono); tab-size: 2;
  scrollbar-width: thin; scrollbar-color: rgba(241, 237, 228, 0.2) transparent;
}
pre span { display: block; padding: 0 10px; white-space: pre; }
pre span.on { background: rgba(251, 58, 14, 0.14); color: var(--text); box-shadow: inset 2px 0 0 var(--red); }
pre i { font-style: normal; color: #5f5a53; margin-right: 12px; }
.row { font: 12px/1.5 var(--mono); color: var(--text); }
.row b { font-weight: 500; color: var(--mute); font-family: var(--sans); }
.chip {
  display: inline-block; border-radius: 6px; padding: 2px 7px; margin: 0 4px 4px 0;
  background: rgba(241, 237, 228, 0.08); font: 500 11.5px/1.4 var(--mono); color: var(--text);
}
.chip.red { background: rgba(251, 58, 14, 0.14); color: #ff8a66; }
.kids { display: grid; gap: 2px; margin-bottom: 8px; }
.kids button {
  text-align: left; border: 0; border-radius: 6px; background: none; padding: 4px 8px;
  font: 12px/1.4 var(--mono); color: var(--text);
}
.kids button:hover { background: rgba(241, 237, 228, 0.06); }
.nav { display: flex; gap: 6px; }
.nav button {
  border: 1px solid var(--line-2); background: none; border-radius: 6px; padding: 4px 10px;
  font: 500 12px/1.2 var(--sans); color: var(--mute);
}
.nav button:hover { color: var(--text); background: rgba(241, 237, 228, 0.06); }

fieldset { border: 0; margin: 0 0 10px; padding: 0; display: grid; gap: 6px; }
fieldset label { display: flex; gap: 8px; align-items: center; font: 13px/1.3 var(--sans); color: var(--text); cursor: pointer; }
fieldset input { accent-color: var(--red); width: 14px; height: 14px; margin: 0; }
textarea {
  width: 100%; min-height: 80px; resize: vertical; border: 1px solid var(--line-2); border-radius: 8px;
  background: var(--ink-3); padding: 8px 10px; font: 13px/1.45 var(--sans); color: var(--text);
}
textarea:focus { border-color: var(--red); outline: none; box-shadow: 0 0 0 3px rgba(251, 58, 14, 0.2); }
textarea::placeholder { color: #6f695f; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.actions button {
  border: 1px solid var(--line-2); background: rgba(241, 237, 228, 0.04); border-radius: 8px; padding: 8px;
  font: 500 13px/1.2 var(--sans); color: var(--text); transition: background 120ms, border-color 120ms;
}
.actions button:hover { background: rgba(241, 237, 228, 0.1); }
.actions button.primary { grid-column: 1 / -1; background: var(--red); border-color: var(--red); color: #fff; padding: 9px 8px; }
.actions button.primary:hover { background: #ff5126; border-color: #ff5126; }
.status { margin-top: 10px; font: 12.5px/1.45 var(--sans); }
.status.ok { color: #5fc995; }
.status.err { color: #ff8a66; }
.status code { font: 12px/1.4 var(--mono); color: var(--text); }
.empty { padding: 16px; font: 13px/1.5 var(--sans); color: var(--mute); }
.empty b { color: var(--text); font-weight: 600; }
.req {
  display: grid; grid-template-columns: auto 1fr auto; gap: 2px 10px; padding: 10px 16px; border: 0;
  border-bottom: 1px solid var(--line); align-items: baseline; width: 100%; text-align: left; background: none;
}
.req:hover { background: rgba(241, 237, 228, 0.04); }
.req .open-req { border: 0; background: none; padding: 0; text-align: left; cursor: pointer; }
.req .open-req:hover { text-decoration: underline; text-underline-offset: 2px; }
.req .done { font-size: 12px; }
.req .done:hover { color: #5fc995; }
.req .n { font: 11.5px/1 var(--mono); color: var(--mute); }
.req .t { font: 500 13px/1.35 var(--sans); color: var(--text); }
.req .s { font: 500 11px/1 var(--sans); border-radius: 999px; padding: 3px 8px; }
.req .s.open { background: rgba(251, 58, 14, 0.14); color: #ff8a66; }
.req .s.done { background: rgba(47, 163, 107, 0.16); color: #5fc995; }
.req .l { grid-column: 2 / -1; font: 11.5px/1.4 var(--mono); color: var(--mute); word-break: break-all; }
.tip { padding: 12px 16px; background: var(--ink-2); color: var(--mute); font: 12.5px/1.5 var(--sans); }
.tip q { color: var(--text); font-weight: 500; }

.quote { font-weight: 400; color: var(--mute); font-size: 14px; }
.plain { font: 13px/1.5 var(--sans); color: var(--text); padding: 2px 0; }
.plain + .plain { border-top: 1px solid var(--line); padding-top: 6px; margin-top: 4px; }
.file { margin-top: 10px; font: 11.5px/1.4 var(--mono); color: var(--mute); display: flex; gap: 8px; align-items: center; }
button.link { border: 0; background: none; padding: 0; color: var(--mute); font: 500 12px/1.3 var(--sans); text-decoration: underline; text-underline-offset: 2px; }
button.link:hover { color: var(--text); }
.row-end { display: flex; justify-content: flex-end; margin-top: 6px; }
textarea.draft { margin-top: 8px; min-height: 200px; font: 11.5px/1.5 var(--mono); }
textarea[hidden], .draft[hidden] { display: none; }
legend { font: 500 13px/1.3 var(--sans); color: var(--text); padding: 0; margin-bottom: 6px; }
.meta { font: 11px/1.4 var(--mono); color: #6f695f; word-break: break-all; }
.back { border: 0; background: none; padding: 0 0 6px; color: var(--mute); font: 500 12px/1 var(--sans); }
.back:hover { color: var(--text); }
pre.md { margin: 0; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; max-height: 46vh; color: #d9d3c7; }
.finish { display: flex; gap: 8px; margin-top: 10px; }
.finish button { border: 1px solid var(--line-2); background: rgba(241, 237, 228, 0.04); border-radius: 8px; padding: 0 12px; font: 500 13px/1 var(--sans); color: var(--text); }
.finish button:hover { background: rgba(47, 163, 107, 0.2); border-color: rgba(47, 163, 107, 0.5); }
input.outcome { flex: 1; min-width: 0; height: 34px; border: 1px solid var(--line-2); border-radius: 8px; background: var(--ink-3); color: var(--text); padding: 0 10px; font: 13px/1 var(--sans); }
input.outcome:focus { border-color: var(--red); outline: none; box-shadow: 0 0 0 3px rgba(251, 58, 14, 0.2); }
.actions button.danger:hover { background: rgba(251, 58, 14, 0.16); border-color: rgba(251, 58, 14, 0.5); color: #ff8a66; }
.option { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; cursor: pointer; }
.option input { margin-top: 3px; accent-color: var(--red); }
.option > span { display: grid; gap: 2px; }
.option b { font: 500 13px/1.3 var(--sans); color: var(--text); }
.option > span > span { font: 12px/1.4 var(--sans); color: var(--mute); }
.keyrow { display: flex; gap: 10px; align-items: center; font: 12.5px/1.8 var(--sans); color: var(--mute); }
kbd { font: 500 11px/1 var(--mono); color: var(--text); background: rgba(241, 237, 228, 0.08); border: 1px solid var(--line-2); border-radius: 5px; padding: 3px 6px; min-width: 92px; text-align: center; }
.dock button.gear { font-size: 14px; padding: 5px 9px; }

.look { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.look + .look { margin-top: 4px; }
.look .what { flex: none; width: 128px; color: var(--mute); font: 12.5px/1.3 var(--sans); }
.look select {
  flex: 1; min-width: 0; height: 28px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--ink-3);
  color: var(--text); font: 12px/1 var(--mono); padding: 0 6px;
}
.look select:focus { border-color: var(--red); outline: none; }
.look .pick { flex: 1; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.look input[type="color"] { width: 28px; height: 28px; padding: 0; border: 1px solid var(--line-2); border-radius: 6px; background: none; cursor: pointer; }
.look code { font: 11.5px/1 var(--mono); color: var(--mute); }
.swatch { width: 18px; height: 18px; border-radius: 999px; border: 1px solid var(--line-2); padding: 0; }
.swatch:hover { transform: scale(1.12); }
.hint-text { flex: 1; font: 12px/1.4 var(--sans); color: #6f695f; }

.find { margin-top: 10px; }
.find input { width: 100%; }
.layers { padding: 6px 8px 10px; border-bottom: 1px solid var(--line); }
.layer { display: flex; align-items: center; min-height: 26px; }
.layer .indent { flex: none; }
.layer .fold { flex: none; width: 18px; height: 22px; border: 0; background: none; color: var(--mute); padding: 0; font: 11px/1 var(--sans); }
.layer .name {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; text-align: left; border: 0; border-radius: 6px;
  background: none; padding: 3px 6px; font: 12.5px/1.35 var(--mono); color: var(--text); overflow: hidden; white-space: nowrap;
}
.layer .name:hover:not(:disabled) { background: rgba(241, 237, 228, 0.07); }
.layer .name:disabled { cursor: default; }
.layer.off .name { color: #6f695f; }
.layer.group .name { color: var(--mute); font-family: var(--sans); font-size: 12px; }
.badge-ref { font: 11px/1 var(--mono); color: #ff8a66; }
.badge-off { font: 11px/1 var(--sans); color: #6f695f; }
.state { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; font: 13px/1.35 var(--sans); }
.state + .state { border-top: 1px solid var(--line); }
.state.on span { color: #ff8a66; }
.dock .previewing {
  border: 0; border-radius: 999px; background: var(--red); color: #fff; padding: 5px 12px; margin-left: 4px;
  font: 500 12.5px/1.2 var(--sans); white-space: nowrap;
}
.dock .previewing:hover { background: #ff5126; }

.tabs { display: flex; gap: 4px; margin-top: 10px; }
.tab { border: 1px solid var(--line-2); background: none; border-radius: 999px; padding: 4px 10px; font: 500 12px/1.2 var(--sans); color: var(--mute); }
.tab[aria-pressed="true"] { background: rgba(241, 237, 228, 0.12); color: var(--text); border-color: transparent; }
.item { display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: baseline; padding: 8px 0; }
.item + .item { border-top: 1px solid var(--line); }
.item .n { font: 11.5px/1 var(--mono); color: var(--mute); }
.item .what { display: grid; gap: 2px; min-width: 0; }
.item .what b { font: 500 13px/1.3 var(--sans); color: var(--text); }
.item .what span { font: 12.5px/1.4 var(--sans); color: var(--mute); overflow-wrap: anywhere; }
.notice { margin: 12px 16px 0; padding: 10px 12px; border-radius: 8px; background: rgba(47, 163, 107, 0.14); color: #8fe0b6; font: 12.5px/1.45 var(--sans); }
.notice code { font: 12px/1.4 var(--mono); color: var(--text); }
.more { margin-top: 8px; color: var(--mute); font-size: 12.5px; }
.export { margin-top: 4px; }
.choice { display: grid; gap: 4px; }
.choice button { border: 1px solid var(--line-2); background: rgba(241, 237, 228, 0.04); border-radius: 8px; padding: 9px 8px; font: 500 13px/1.2 var(--sans); color: var(--text); }
.choice button:hover { background: rgba(241, 237, 228, 0.1); }
.choice button.primary { background: var(--red); border-color: var(--red); color: #fff; }
.choice button.primary:hover { background: #ff5126; }
.choice .why { font: 12px/1.4 var(--sans); color: var(--mute); margin-bottom: 8px; }

@media (max-width: 720px) { .dock .hint { display: none; } }
@media (max-width: 420px) {
  .dock button.mode, .dock button.act { padding: 5px 8px; }
  .panel { top: 8px; right: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 80px); }
}
@media (prefers-reduced-motion: reduce) { .actions button { transition: none; } }
`

export const outlineCss = `
.frame {
  position: fixed; box-sizing: border-box; pointer-events: none; border: 1.5px solid #fb3a0e; border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.85);
}
.frame.selected { border-width: 2px; background: rgba(251, 58, 14, 0.06); }
.frame[hidden] { display: none; }
`
