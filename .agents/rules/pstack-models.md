---
description: pstack per-role model choices (overrides skill defaults)
trigger: always_on
---
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent`, `inherit`, or `auto` as a value: the role runs on the parent chat model.
# See `.agents/rules/pstack-antigravity-routing.md` for Antigravity `invoke_subagent` vs `swarm` routing and quota fallback rules.
feature, refactoring: inherit
bug-fix: inherit
perf-issue: inherit
hillclimb: inherit
judgment and prose: pro
hardest tasks: pro
how explorer: flash
how explainer: pro
why investigators: flash
why synthesizer: pro
reflect tooling: flash
reflect judgment, divergent, synthesizer: pro
arena runners: gemini-4-neon-high, claude-sonnet-5-5-high
arena cross-judge pool: claude-opus-5-5-high, gemini-4-hydrogen-xhigh
swarm workers: gemini-4-hydrogen-medium
architect runners: gemini-4-hydrogen-high, claude-opus-5-5-high
interrogate reviewers: claude-opus-5-5-high, gemini-4-neon-xhigh
