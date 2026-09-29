---
title: Trade-offs, measured honestly
description: Hozu buys explicit structure and checks with authoring cost, constraints and a different ecosystem fit.
order: 6
---

## A design choice is not a universal advantage

Hozu makes application structure unusually explicit. Queries declare ownership and freshness, views are closed trees, and machine transitions have contracts. This gives the tools more of the program to inspect. It also gives an author or agent more unfamiliar material to learn, read and maintain.

The trial records measure that cost instead of assuming the design must be cheaper. They compare particular tasks, models, scaffolds and change requests. A ratio from one trial is not a prediction for every application, and a passing acceptance suite is evidence about the checked behaviour rather than proof of general correctness.

## The task-board results vary

Trial 0010 used two runs per arm and step for a task board. Hozu’s mean weighted-token cost was 1.64× Nuxt for the build and 1.44× for the change. Correctness stayed equal in all eight runs. The build missed the stated target, while the change met it. The report points to reading the unfamiliar framework and generated source as remaining costs.

Trial 0011 evaluated additional inspection tools and scaffold summaries. Its measured ratios were 2.28× for building and 1.53× for changing, and both targets were missed. Nuxt was not rerun for that comparison; the report uses trial 0010’s baseline. Across the four Hozu 0.3 runs, the reported comparisons were 1.96× and 1.48×. These values should not be silently mixed with a newly measured Nuxt run.

The tools were used, but some guidance was not followed and a scripted-edit mistake contributed to one build. That matters when interpreting a framework-level claim: an agent’s workflow and ordinary mistakes can move the result. Read [trial 0010](/trials/0010-map-scaffold-recipes) and [trial 0011](/trials/0011-inspect-and-summaries) together rather than selecting the more flattering number.

## Correctness and cost can move separately

Trial 0012 introduced an account-based notes task designed around common errors. Hozu passed 72/72 checks across its runs; Nuxt passed 67/72. The difference appeared during one change, after both frameworks had passed every build check. The reproduced Nuxt failure involved in-place mutation of shallow-ref data, which disrupted ordering and subsequent refreshes.

That result illustrates the kind of silent regression Hozu’s contracts and framework-owned data refresh aim to prevent. It does not establish a general failure rate: the trial contains only two runs per framework. Nor was the additional checking free. Hozu’s mean weighted-token comparisons were 2.79× to build and 2.06× to change. [Trial 0012](/trials/0012-correctness-notes) explains both sides of that result.

The account scaffold changed the next build comparison. In trial 0013, two new Hozu runs used `--with auth`; both passed 15/15 acceptance checks and the mean build comparison became 1.66×. Nuxt was not rerun: the baseline is the earlier notes trial. There was no new change-step measurement in that follow-up, so its build improvement must not be presented as a measured improvement to changing the app.

Hozu 0.5 targeted the cause that a study of the transcripts identified: agents spend most of the extra tokens reading the guide, and every additional call carries that reading again ([ADR 0038](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0038-cost-anatomy.md)). With ordinary TypeScript in callbacks, a shorter guide split into `hozu docs` topics, and fewer verification detours, trial 0016 measured 1.38× Nuxt to build and 1.45× to change, with four Claude runs per step. All five runs, including one by Codex, passed all 36 checks. The Nuxt baseline is still the two runs of trial 0012, and the cost target of 1.3× was not reached: reading an unfamiliar guide remains the price. [Trial 0016](/trials/0016-0-5-four-runs) records it.

Hozu 0.7 attacked what remained: the code the surface forced an agent to write ([ADR 0041](https://github.com/olevatorr/Hozu/blob/main/docs/adr/0041-0-7-write-less.md)). [Trial 0019](/trials/0019-0-7-write-less) measured 1.14× Nuxt to build and 1.38× to change on the notes task, and 1.75× and 2.03× on a widget-heavy task (Leaflet, Chart.js, GSAP and Three.js), with two runs per step and every check passing. The extra cost is smaller, not gone.

## The constraints are part of the product

A closed view tree is useful when you want the framework to inspect dependencies and event bindings. It is less convenient when a component design depends on arbitrary render functions, undeclared effects or a large existing library’s assumptions. Hozu offers typed widget boundaries for imperative DOM integration, but that boundary has an opaque implementation; the IR cannot prove every line inside it.

The framework deliberately has no separate pure-SPA mode. An application dominated by user-scoped data is a case the render planner derives, not a second application model that bypasses the server-first pipeline. Global mutable client stores are also outside the stated design: cross-feature state goes through public feature contracts.

If your existing application relies heavily on those patterns, adopting Hozu may require more than translating component syntax. Assess the migration at the boundaries: data ownership, routing, persistent UI and third-party integrations. Do not treat the existence of a widget escape hatch as proof that a particular integration is inexpensive.

## Check the ecosystem fit before committing

Hozu has its own fine-grained DOM runtime rather than compiling to an established component renderer. Existing framework-specific components therefore are not drop-in Hozu views. The relevant question is whether its documented capabilities cover your application and whether the remaining integrations fit the widget boundary. The repository does not provide an ecosystem-size benchmark, so this guide does not invent one.

A small exploratory feature can answer more than a general promise. Scaffold it, inspect its declarations, make a realistic change and verify the result:

```sh
npx hozu add feature notes --page /notes --with detail,remove
npx hozu map
npx hozu check
npx hozu get /notes --forms
```

Choose a familiar framework when its existing components, team experience or required application model are more valuable than Hozu’s explicit checks. Consider Hozu when inspectable behaviour and data boundaries match the problem, and budget for learning its authoring surface. The useful decision is the one supported by your own representative task, with the [published trials](/trials) as context rather than a guarantee.
