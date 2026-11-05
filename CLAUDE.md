# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitHub Action for E2E encrypted, self-destructing secret sharing via [vaulted.fyi](https://vaulted.fyi). Two sub-actions: **create** (encrypt + share) and **get** (retrieve + decrypt). All crypto happens client-side using `@vaulted/crypto` — the server never sees plaintext or keys.

Part of the Vaulted ecosystem alongside the [web app](../vaulted/) and CLI. All three share the same `@vaulted/crypto` package and API contract.

## Commands

```bash
npm test                              # Run tests (vitest run)
npm run test:watch                    # Watch mode
npx vitest run src/create.test.ts     # Single test file
npm run typecheck                     # Type-check (tsc --noEmit, TypeScript 7)
npm run build                         # Bundle both actions via esbuild (scripts/build.mjs)
```

## Architecture

### Two Sub-Actions

| Action | Entry point | Logic | action.yml |
|--------|------------|-------|------------|
| **Create** | `src/index.ts` | `src/create.ts` | `./action.yml` |
| **Get** | `src/get-index.ts` | `src/get.ts` | `./get/action.yml` |

Entry points parse GitHub Actions inputs via `@actions/core`, call the logic module, and handle errors with `core.setFailed()`. They guard execution with `if (!process.env.VITEST)` so tests can import without auto-running.

### Encryption Flow

**Create:** `generateKey()` → `encrypt(plaintext, key)` → optional `wrapKeyWithPassphrase()` → POST ciphertext to API → output URL with key in `#` fragment (never sent to server).

**Get:** Parse URL → GET ciphertext from API → optional `unwrapKeyWithPassphrase()` or `importKey()` → `decrypt()` → `core.setSecret()` for log masking (including per-line masking for multiline secrets) → `core.setOutput()`.

### URL Format

```
https://vaulted.fyi/s/{id}#{key}              # without passphrase
https://vaulted.fyi/s/{id}#{wrappedKey}.{salt} # with passphrase
```

### Build System

`scripts/build.mjs` uses esbuild to bundle each entry point + all dependencies into a single ESM file in `dist/` (`dist/create/`, `dist/get/`), with a source map and a `licenses.txt` of the bundled packages. esbuild only strips types, so type errors are caught by `npm run typecheck`, not the build. The `dist/` directory is committed and CI verifies it stays in sync (`git status --porcelain -- dist/`).

**After any source change, run `npm run build` and commit `dist/`.**

## Testing

- **Framework:** Vitest
- **Convention:** Tests colocated next to source (`create.test.ts` next to `create.ts`)
- Tests mock `@actions/core` and `@vaulted/crypto` — no real API calls or crypto
- Tests mock `global.fetch` for API interaction testing

## Coding Conventions

Follows the same conventions as the parent [vaulted](../vaulted/) project:

- Self-documenting code; WHY comments only for non-obvious decisions
- Named exports, no barrel files, direct imports
- One concern per file, keep files small
- TypeScript strict mode, inline interfaces in domain files
- Don't refactor adjacent code while fixing a bug
- Don't add abstractions for hypothetical futures

## Gotchas

- `get/action.yml` references `../dist/get/index.js` (relative path from the `get/` subdirectory)
- The `EXPIRES_MAP` in `create.ts` maps string durations (`1h`, `24h`, `7d`, `30d`) to seconds for the API TTL field
- `parseVaultedUrl()` in `get.ts` extracts origin/id/fragment and supports self-hosted instances (any hostname matching `https://host/s/{id}#{key}`)
