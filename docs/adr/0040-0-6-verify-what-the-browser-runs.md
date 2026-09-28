# ADR 0040 — 0.6: verify what the browser runs

- Status: accepted (the owner chose A + B + C + D for 0.6.0)
- Motivation: trial 0017 (a Leaflet / Chart.js / GSAP / Three.js app).
  - Every Hozu run was correct, but cost 2.65× Nuxt to build and 3.5× to change.
  - Part of the gap was spent on what `hozu check`, `get` and `post` cannot see: code that runs only in the browser.
    - An agent that wanted to see its markers and canvases wrote its own headless-Chrome script.
    - One agent spent 80 k tokens finding a `fn()` that worked on the server and broke the client.

## A. HZ047: a `fn()` body that is not self-contained
- **Problem:** `fn` bodies are shipped to the client as source text (ADR 0007 D5).
  - A body that calls a module-level helper runs on the server, but throws in `fns.js`.
  - This stops every island, and `hozu check` stays green.
  - The rule is written in `hozu docs data`, yet nothing enforces it.
- **Options:**
  1. Bundle the helpers into `fns.js`. This needs a bundler in the runtime path, and a helper can close over
     server-only values. Rejected.
  2. Check at build time. **Chosen.**
- **Decision:** `@hozu/transform`, which already parses every authored module, finds the identifiers that a
  `fn({ impl })` body uses but does not declare.
  - An identifier counts as declared when it is a parameter, a local binding or a standard JavaScript / web global.
  - When there are any, it marks the declaration: `__hozu.free(fn({...}), ['matches'])`.
  - `buildProject` reports **HZ047 `fn-not-self-contained`** (error) for a marked `fn` that a feature declares, with the
    names found. The fix: move the helper inside `impl`, or pass the value as input.
  - Like HZ044, the server refuses to start, because the page would be broken for every visitor.
  - Builds from a manifest skip the check.

## B. No favicon request without `site.icon`
- **Problem:** without an icon, every browser requests `/favicon.ico` and logs a 404. Agents treat the log as a bug to
  fix (4 calls in trial 0017).
- **Decision:** when `site.icon` is absent, `<head>` carries `<link rel="icon" href="data:,">`.
  - The browser then makes no request.
  - The CSP already allows `data:` images.

## C. `hozu add widget` adds the right `@hozu/bundle`
- **Problem:** it copied the `@hozu/core` version spec.
  - That is right for a registry range.
  - It is wrong for a `file:` tarball, which then points at the core tarball.
- **Decision:** a `file:` spec has `hozu-core-` replaced with `hozu-bundle-`; any other spec is copied as before.

## D. `hozu browse`: load a page in a real browser, without a server
- **Problem:** widget code, client-only failures, and island behaviour after a click can only be seen in a browser.
  - Agents either skip it (Nuxt runs did) or write a Playwright / CDP script each time, which in trial 0017 cost 4–8
    calls per run.
  - Starting a server for it also collides with the owner's rule against dev servers.
- **Options:**
  1. Depend on Playwright. It downloads a browser, and `@hozu/cli` would gain a third-party runtime dependency.
     Rejected.
  2. Run the page in happy-dom. It has no canvas, no WebGL and no layout, which are exactly what widgets need.
     Rejected.
  3. **Chosen:** drive an installed Chrome, Chromium or Edge over the DevTools protocol, through a pipe.
     - There are no dependencies and no port.
     - Requests are answered by the same in-process handler as `hozu get`, through `Fetch.requestPaused`.
- **Usage:**
  ```
  hozu browse <path> [--do '<step>']... [--select <css>] [--screenshot <file.png>]
                     [--reduced-motion] [--session <json>] [--full] [--json]
  ```
  - **Steps run in order** after the page has hydrated. The actions:
    - `fill <label>=<value>`
    - `select <label>=<option>`
    - `check <label>`
    - `click <name>`
    - `press <key>`
    - `wait <ms>`
  - **Labels and names are accessible names:**
    - `aria-label`;
    - a `<label>`;
    - a placeholder;
    - the button or link text.
    Both the step syntax and the name matching are how the acceptance scripts address the page.
  - **The report is taken after the last step:**
    - status and title;
    - `hydrated` (`html[data-hozu-ready]`);
    - **errors**: uncaught exceptions, `console.error`, failed or ≥ 400 responses;
    - **widgets**: every widget on the page, whether it mounted, its size, and its canvases / child elements.
      A widget whose element has no height gets a hint, since a Leaflet map or a canvas in a zero-height box renders
      nothing;
    - visible text;
    - `--select` elements, matched with real CSS;
    - an optional screenshot, which agents can open as an image.
- **Browser discovery:**
  - `HOZU_CHROME` (or `CHROME_PATH` / `CHROMIUM_PATH`);
  - otherwise the standard install paths on macOS, Linux and Windows;
  - if none is found, a usage error that says how to set it.
- **Runtime support:** a widget element carries `data-hozu-widget="<feature>.<Name>"` from the moment its setup
  succeeds, and `data-hozu-widget-failed` when setup throws. This is also useful in any browser test, like
  `data-hozu-ready`.

## Principle check
- **Principle 7:** HZ047 is a structured diagnostic with a location and a fix. `browse` reports structured JSON.
- **Principle 2:** `browse` starts nothing that outlives the command. The browser is closed on exit, and no server or
  port is opened.
- **Zero-dependency rule:** kept. `@hozu/cli` talks CDP over a pipe with Node built-ins.

## Verification
- **Transform tests:**
  - free names found in `fn` bodies;
  - globals, parameters, nested functions and destructuring are not flagged.
- **A build test and a mistake case** for HZ047; the server refusal.
- **A head test** for the icon.
- **An add-widget test** for a `file:` spec.
- **A `browse` test against `examples/stations`,** skipped when no browser is found. It checks:
  - widgets mounted;
  - a fill step changing the list;
  - an error reported for a broken widget.
- **Skill:** the `testing` and `widgets` topics and the SKILL.md command list teach `browse`. `diagnostics` lists
  HZ047.
- **Gate green.**

## Result
- **Implemented as decided,** with one change: widget hosts carry `data-hozu-widget` from the start of mounting, plus
  `data-hozu-widget-state` (`loading`, `mounted` or `failed`).
  - This lets `browse` tell a widget that is on the page but not mounted from one that is not rendered yet, such as a
    details panel shown after a selection.
- **Trial 0018 (the widget task, two Claude runs, all checks passing):**
  - build 279.9 k, against 345.4 k on 0.5.1 (−19 %; 2.15× Nuxt, was 2.65×);
  - change unchanged at 195 k (3.46×).
- **Both runs used `hozu browse`,** and no run wrote a browser script of its own.
