---
name: history-video
description: Build or revise vertical historical explainer and comparison videos in Remotion from a narration script. Use when the task is to source historically relevant scene visuals, organize left/right subjects without implying competition, use a rigged host that points toward the mentioned subject, generate narration through a local WebSocket TTS voice, synchronize incremental subtitles to actual audio, preserve source/license metadata, name assets by scene, render previews, or export a verified MP4.
---

# Historical Remotion Video

Build around narration. Never build around whichever images are easiest to find.

## Start

1. Inspect project `AGENTS.md`, `CODEBASE.md`, Remotion root, composition, character components, narration, audio, and existing image manifest.
2. Preserve existing project conventions and user assets.
3. Create a short project-root task plan for multi-scene work.
4. Read [references/workflow.md](references/workflow.md) before implementing a full video or revising several scenes.
5. Read [references/visual-sourcing.md](references/visual-sourcing.md) whenever selecting or replacing historical imagery.

## Scene model

Represent every visual beat as data with:

```ts
{
  from: 23,
  to: 32,
  left: 'scene-03-left-12-warlords-map.svg',
  right: 'scene-03-right-qin-empire-map.png',
  title: 'MỘT BÊN CHIA CẮT',
  cue: '12 SỨ QUÂN • 7 NƯỚC GIAO CHIẾN',
  animation: 'point-left',
  focus: 'left',
}
```

Use `left` for the first subject and `right` for the second. Use `focus` to dim the unmentioned side. Point the host toward the focused side.

Do not display names twice. Keep one identity label per panel. Do not use `VS` unless the user explicitly wants a competitive framing.

## Asset naming

Use one independent file per scene and side:

```text
scene-01-left-subject.jpg
scene-01-right-subject.jpg
scene-03-left-12-warlords-map.svg
```

If the same source appears in multiple scenes, duplicate it under scene-specific names. This lets users replace one scene without affecting others.

Store project images in `public/images/`. Keep the exact filenames referenced by scene data.

## Visual selection

Before searching, identify subject, action, location, period, object, event, and visual concept. Create 3–5 queries per narration segment.

Prefer a visual that explains the spoken claim. A map is usually better than a portrait for territorial unification. An artifact is usually better than a portrait for currency, writing, measurement, or administration.

Source across multiple repositories, never one. Use [scripts/source-assets.mjs](scripts/source-assets.mjs): each asset declares a query and an ordered provider fallback chain (Wikimedia, Met, Art Institute of Chicago, Library of Congress, optional Europeana). The script refuses any image already used by another scene, so no portrait repeats. If one provider still supplies most assets, widen queries or reorder the chain.

Use maps with `objectFit: contain`; use portraits, locations, and artworks with `cover`. Confirm vertical crop in a representative still.

When no authentic visual fits a concept or action beat, generate one — see [references/ai-generation.md](references/ai-generation.md) and [scripts/generate-visuals.mjs](scripts/generate-visuals.mjs). Generate for concepts, action, and atmosphere; source for real for identities, territory, and artifacts. Label every generated image `AI_RECONSTRUCTION` and never present it as an authentic portrait or photograph.

## Source manifest

Record every selected asset in `public/images/asset-manifest.json`:

```json
{
  "id": "twelve-warlords-map",
  "scene": 3,
  "type": "historical_map",
  "subject": "Anarchy of the 12 Warlords",
  "source": "Wikimedia Commons",
  "sourceUrl": "https://...",
  "license": "Public domain",
  "credit": "...",
  "authenticity": "historical_reconstruction"
}
```

The `source` field must name the actual provider each asset came from, not a fixed default. Do not infer reuse rights from an image-search result. Open and verify the source page.

After sourcing, run [scripts/check-assets.mjs](scripts/check-assets.mjs). It fails on missing files and warns on reused images, one source supplying more than 60% of assets, or a subject that repeats across more than two scenes.

## Voice generation

When the project uses OmniVoice at `ws://127.0.0.1:8765/ws`, copy [scripts/generate-narration.mjs](scripts/generate-narration.mjs) into the project and adapt constants only.

Use:

```json
{
  "lang": "Vietnamese",
  "mode": "clone",
  "voice": "remotion"
}
```

Split long narration into short chunks. Generate sequentially, save WAV chunks, concatenate, then encode the final MP3 at natural pace. Do not time-stretch the completed audio to a predetermined duration unless the user explicitly accepts accelerated speech. Instead measure the final MP3 with `ffprobe` and set the composition `durationInFrames` from it; [scripts/align-captions.mjs](scripts/align-captions.mjs) reads the same real duration so captions and video length share one source of truth.

## Subtitle synchronization

Never assign captions by evenly dividing the full video duration.

Preferred order:

1. Use word timestamps returned by TTS or ASR.
2. Otherwise run forced alignment/Whisper with the known transcript.
3. If unavailable, use [scripts/align-captions.mjs](scripts/align-captions.mjs) as a fallback. It uses actual speech/silence regions and weighted transcript tokens; label this as approximate alignment.

Display short groups, usually 3–8 words. Reveal words when their timestamps are reached. Avoid showing a complete long sentence at once.

## Host behavior

- Mention first/left subject: `point-left`.
- Mention second/right subject: `point-right`.
- Discuss both or abstract comparison: `explain`, `think`, `celebrate`, or `happy`.
- Keep host clear of captions and primary imagery.

Use the character already present in `src/characters`. Do not recreate it.

## Verification

After edits:

1. Run project lint and TypeScript checks.
2. Run [scripts/check-assets.mjs](scripts/check-assets.mjs): every asset exists, no image is reused across scenes, no single source dominates.
3. For each scene, confirm the chosen visual depicts the narration claim itself, not merely the named person. A portrait is not an army, a battle, or a reform.
4. Render stills at the start, middle, scene boundaries, map scenes, and ending.
5. Inspect stills visually for crop, duplicate names, direction, overlap, and subtitle size.
6. Render MP4 only after stills pass.
7. Verify codec, resolution, duration, audio stream, and output size with `ffprobe`.

Do not commit or push unless explicitly requested.
