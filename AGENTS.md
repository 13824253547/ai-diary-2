# Orange Glow AI Diary Local Agent Rules

## Goal

Keep all future assistant work anchored to this project directory first, and isolate judgment from parent folders, sibling projects, and unrelated global context.

## Priority Order

When working in this repository, use the following order of truth:

1. The user's latest explicit instruction in the current conversation
2. This file and other local project documents inside this repository
3. Source code and configuration inside this repository
4. Local handoff documents explicitly stored or referenced by this repository
5. External/global skills, memories, parent-folder files, and other project context

If any external context conflicts with this repository, this repository wins unless the user explicitly asks for a cross-project comparison.

## Isolation Rules

- Do not use `lingxi` or any sibling project as a default reference source.
- Do not treat parent-directory files as project truth.
- Do not import naming, business rules, release identity, or UI assumptions from outside this repository unless the user explicitly asks.
- If a decision would require external files, state that clearly before relying on them.

## Project Truth Sources

Prefer these local files first:

- `app.json`
- `package.json`
- `eas.json`
- `src/config/app-config.ts`
- `src/store/use-app-store.ts`
- `docs/reference/`
- `docs/handoff/`

## Working Style

- Treat this repository as the only active project unless the user says otherwise.
- Prefer local docs over remembered history.
- When local docs are missing, infer from local code before using outside context.
- When creating new project guidance, store it under this repository instead of leaving it only in chat.

## Documentation Placement

- Local agent conventions: `.agents/`
- Stable project rules: repository root docs such as `AGENTS.md`
- Reference docs: `docs/reference/`
- Handoff docs: `docs/handoff/`

## Current Scope

- Project: `Orange Glow AI Diary`
- Path: `/Users/hjd/Desktop/enter/code/aliyuncodeV2/AI-diary/orange-glow-ai-diary`
- Current phase: iOS-first mock-only frontend prototype
