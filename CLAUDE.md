# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Scene Studio: a pipeline plus a local web panel that turns a Vietnamese history script into a vertical (9:16 by default) Remotion video. One `scene-plan.md` per project is the single source of truth for narration, image prompts, motion prompts, characters and timing. The UI text, narration and many code comments are in Vietnamese; match that in user-facing strings.

## Commands

```bash
npm install
npm run dev        # builds stale project bundles, then opens Remotion Studio (http://localhost:3000)
npm run review     # Scene Studio panel (scripts/review-server.mjs), http://127.0.0.1:9000
npm run build      # build stale bundles + `remotion bundle`
npm run lint       # eslint src && tsc
node --test scripts/lib/*.test.mjs                      # all unit tests (node:test, no framework)
node --test scripts/lib/plan-writer.test.mjs            # one test file
node scripts/build-remotion.mjs [--project <slug>] [--all | --stale]
npm run sync -- --list                       # media projects available at the source
npm run sync -- --project a,b [--dry-run]    # pull only those projects' media (no arg: numbered picker)
```

- `ffprobe` (ffmpeg) must be on PATH: the bundle builder measures per-scene audio with it.
- The review server and every CLI script need an active project. Resolution order: `--project <slug>` > `PROJECT` env > `projects/active.json`. `projects/active.json` is gitignored and per machine, so a fresh clone fails with `No active project` until you create it (`{ "active": "<slug>" }`) or set `PROJECT`.
- Copy `.env.example` to `.env`. `REPLICATE_API_TOKEN` is the main key. Provider endpoints, keys and model lists can also be edited in the panel (Model button) and are stored in `data/models.json`, which takes priority over `.env`.
- `public/projects/` (generated media) is gitignored. `npm run sync` copies chosen projects from the source folder (saved from the panel into `data/media-sync.json`, else `MEDIA_SYNC_SOURCE`, else the Mac share `\\192.168.1.6\pet\scene-studio`): it copies missing or newer files and never overwrites a newer local file or deletes anything (`scripts/lib/media-sync.mjs`).
- There is no automated UI test. `docs/tasks/scene-studio-*/` hold progress logs, decisions and handoffs for the panel's UX/IA rounds; read `decisions.md` there before changing panel layout.

## Architecture

**Data flow.** `projects/<slug>/scene-plan.md` (+ `characters/<id>/profile.json`, `branding.json`) and generated media under `public/projects/<slug>/` (images, audio, character refs, scene videos, `asset-manifest.json`) feed `scripts/build-remotion.mjs`. That script parses the plan (`scripts/lib/parse-plan.mjs`), measures audio, aligns captions, and writes `src/projects-data/<slug>.json` plus the generated `src/projects-data/index.ts`. `src/Root.tsx` registers one Remotion `<Composition>` per bundle (id = slug), rendered by `src/ScenePlanVideo.tsx`. Bundles are rebuilt only when stale (any input newer than the bundle); `--all` forces everything.

**Gitignored and regenerated, never hand-edit:** `src/projects-data/`, `public/projects/` (all generated media), `tmp/`, `data/`, `projects/active.json`, `projects/output-dir.json`.

**Project paths.** `scripts/lib/project-paths.mjs` is the only place that maps a slug to directories (`projectPaths(slug)`). Use it instead of building paths by hand; it exists to stop generated files landing in the wrong project. `projects/_template/` scaffolds new projects.

**Review server** (`scripts/review-server.mjs`, a plain `node:http` server, no Express). The route list is documented in the header comment of that file. It serves the vanilla HTML/CSS/JS panel (`scripts/review-panel.html`, `review-panel.css`, `review-*.js`), plus a bundled `@remotion/player` preview (`src/preview/preview-entry.tsx`) so the timeline plays what will render. It rewrites `scene-plan.md` through `scripts/lib/plan-writer.mjs` and rebuilds the bundle on every plan edit. Long generation jobs are streamed, outlive a page reload (`/api/jobs`) and can be cancelled (`/api/cancel`). The panel is intentionally framework-free; keep every element `id`, because the panel JS and the docs reference them.

**Providers and models.** `scripts/lib/providers.mjs` routes a model id by prefix (`plenx:`, custom provider ids, otherwise Replicate). `model-config.mjs`/`model-manager.mjs` own `data/models.json` and apply overrides onto `process.env`, so clients keep reading their usual env vars. Image generation is in `replicate-image.mjs`, `openai-image.mjs`, `muse-image.mjs`; motion (image-to-video) in `motion-video.mjs`, `replicate-video.mjs`, `plenx-video.mjs`, `muse-video.mjs`. `llm-client.mjs` backs the script, motion, social and thumbnail writers.

**Local helper servers.** `scripts/lib/local-services.mjs` starts OmniVoice (narration TTS, ws on 8765, dir `OMNIVOICE_DIR` default `../omnivoice-tool`) and muse2api (image/video, port from `MUSE2API_BASE_URL`, dir `MUSE2API_DIR` default `../museapivn`) as children of the review server, logging to `tmp/services/<id>.log`. Each needs its own Python venv created on the current OS: the interpreter is `bin/python` on macOS/Linux and `Scripts/python.exe` on Windows, and a venv copied across OSes does not work.

**Skill copies.** `.agents/skills/history-video/` and `.claude/skills/history-video/` are two copies of the same skill (workflow, scene-plan format, ai-generation rules) and have drifted apart. Check both when changing the plan format or prompt rules.

## Git workflow

Commit and push directly to `main` by default. Do not create feature branches or pull requests unless there is a concrete reason (for example the user asks for one, or the change is risky enough to need isolated review).

## Conventions that matter

- Image prompts describe action, setting and composition only, never a character's face or costume; identity comes from the `char:` reference image. Physical continuity (boats vs carts, etc.) is validated before a prompt is saved.
- Code that changes audio, image or plan content must keep the bundle's staleness inputs (`newestInput` in `build-remotion.mjs`) correct, or the studio will show an old bundle.
- Scene gap: `SCENE_GAP_SECONDS` (0.5s) is baked into `sceneDurations`, which drives duration, timeline and caption offsets together. Do not add separate padding elsewhere.
- Rendered MP4s default to `OUTPUT_DIR` in `project-paths.mjs`, a macOS iCloud path. On other machines set a render folder in the panel (stored in `projects/output-dir.json`).
