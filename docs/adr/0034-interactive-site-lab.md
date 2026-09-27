# ADR 0034 — Interactive How it works lab

- Status: approved by the user for implementation
- Scope: one site-only phase, continuing on site-v2

## Options

1. Keep CSS-only radio explanations. This preserves zero JavaScript but does not meet the requested interactive experience.
2. Add a Hozu machine-bound overview with a guided pipeline and live render-plan illustration. This introduces an island on one explicit route and keeps article pages static.
3. Embed a full compiler/editor in the browser. This adds substantial payload and goes beyond an educational demonstration.

## Decision

Choose option 2. The user approved JavaScript on `/how-it-works`. A machine drives a timed pipeline, a deliberately missing contract, repair and replay. Contracts cover every event and timer transition. The page clearly labels its preset illustration rather than claiming to run a compiler. Scope, freshness and a machine-binding switch update a miniature render plan independently of the selected example.

The visual direction is a blue engineering workbench: existing white/ink surfaces, strong blue controls and the Hozu joint mark, with a code pane beside an execution trace. Typography uses the existing local system families, large left-aligned display text and monospace source. Colour and motion communicate execution, validation failure and island boundaries. Motion follows user action and respects reduced motion. No new fonts, libraries or services are required.

The same feature can process rendering controls during a timed run; a change re-enters the current stage and restarts its illustration timer. Timer durations are presentation pacing, not performance measurements. Source and contracts are small excerpts, not an editable compiler session.

## Verification

Check and accept the intended machine lock change, export without skipped routes, verify all local links and script boundaries, then exercise valid, invalid and repaired runs and every render-plan choice in Chromium. Review mobile/tablet/desktop in light and dark, keyboard focus and reduced motion. Serve only static output on port 4799 and stop its PID after review. Run the repository gate once at the end and commit without pushing. The website itself is this phase's runnable demonstration; no duplicate examples app or framework edits are needed.
