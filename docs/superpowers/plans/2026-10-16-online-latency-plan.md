# Online Latency Fix Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline with one whole-change review at the end.

**Goal:** bounded server queues, observable latency, immediate local movement with authoritative reconciliation.
**Architecture:** shared Athlete physics for an isolated movement predictor; server remains authoritative for all match actions. Pending movement inputs and visual correction are bounded. Runtime and transport metrics are aggregate only.
**Tech Stack:** JavaScript, three.js, ws, Node, existing esbuild/Playwright test environment.
**Spec:** 2026-10-16-online-latency-spec.md

## Constraints
Physics120Hz, snapshots20Hz, all v2.9.10 rules preserved. No paid service changes, GitHub push or publication. Original working copy untouched. Mobile flick/fullscreen remains deferred.

## Tasks
- [x] 1. Add deterministic failing tests for runtime metrics, capped catch-up and snapshot backpressure; implement server/runtime-metrics.mjs and server/fixed-loop.mjs, integrate server/index.mjs and server/rooms.mjs. Preserve reliable control messages and serialize once per broadcast.
- [x] 2. Add failing movement-prediction tests: immediate motion, authoritative acknowledgement/replay, boundaries, history limit, stale stop, round/reset. Implement src/movement-predictor.js with shared Athlete and no disc/scoring simulation. Expose applied input acknowledgements, not merely received sequence, in src/match-simulation.js.
- [x] 3. Integrate predictor into src/online.js, preserve local view/curve, bound sent/history maps, warn on stale data, clear on pause/reconnect/goal/new round/end. Cache unchanged status/labels; reuse interpolation values and avoid duplicate matrix update.
- [x] 4. Add 0/150/500ms plus 1-3s stall tests with local transport proxy; verify movement before packet arrival, safe recovery, action authority, teardown and unchanged rematch behavior. Compare frame work/metrics and run all regression tests.
- [x] 5. Run read-only whole-change review, repair important findings with regression tests, build static output and ZIP/source artifacts. Deliver completed vs remaining work and verification limits. Ask separately before any publication.

## Review Focus
Pause/resume and focus loss; state packets during resets; accepted-vs-applied sequence; stale or oversized queues; history/action replay bounds; no leaking room/password/token details via health.

## Execution ledger
- 2026-10-16: User approved written spec with explicit request「実装」; inline execution selected. Isolated source copy at work/v2911/Ricohed protects both prior source and dirty publication clone. No shared main or production changes authorized.
- Ruling: Prediction affects player movement presentation only. Disc, catch, score, possession and action confirmation remain authoritative. Network delay itself may require hosting/path work after measurements; do not claim external delay resolved by local changes.

- Completed: deterministic server and prediction regression tests; delayed FIFO WebSocket browser tests at 0/150/500ms and 2700ms outage; sustained movement converged within 0.004m after release in this run.
- Whole-change review found sent-action sequence mismatch and stale warning after leave. Both reproduced with failing browser tests, repaired, and verified. Reviewer follow-up identified no remaining important issue.
- Verification: all 26 current test suites passed, package test passed, enhanced sustained-delay browser test passed. Local headless CPU/online JS cost comparison completed; this is neither public latency nor real PC FPS.
- Artifacts: static game ZIP and source ZIP prepared without dependencies. Original source, dirty publication clone, GitHub, Cloudflare and Render preserved. No publication performed.
