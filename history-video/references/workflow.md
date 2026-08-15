# End-to-end workflow

Build around narration and identity, never around whichever images are easiest to find.

```
transcript → historical analysis → character detection → profiles → character references
→ style reference → scene analysis → visual concept → search OR generate → validate
→ asset manifest → Remotion
```

## 1. Inspect

- Find `src/Root.tsx`, composition dimensions, FPS, duration, the scene component, and the
  host character's animation names.
- List existing assets (`characters/`, `style/`, `public/images/`, `public/audio/`,
  `asset-manifest.json`) and reuse them before generating anything new.

## 2. Parse the scene plan

The input is one scene-plan markdown (per scene: narration + prompt) plus pasted
`public/characters/<id>.png` references. Run
[parse-scene-plan.mjs](../scripts/parse-scene-plan.mjs) → `src/scene-plan.json` (one image
per scene, `kind: ai|search`) + `scripts/narration-segments.mjs` (per-scene TTS). See
[scene-plan.md](scene-plan.md). References are **user-provided** — the skill never invents a
face; profiles/consistency guidance in [character-system.md](character-system.md) inform the
prompts, not a generated reference. Title, cue, and host pose are derived by the skill from
the narration.

## 3. Scenes come from the plan

Each scene carries one image (its prompt or search query) plus narration. Sanity-check the
split — a two-minute video usually needs 8–14 scenes — and that each `kind` matches its
content (map/artifact/real place → search; person/action → ai). Split a scene when one line
mixes a map event with distinct military action.

Visual types: character portrait/action/comparison, historical event, battle, army, map,
timeline, architecture, city, village, landscape, artifact, weapon, document, symbolic,
environment, reconstruction.

## 4. Visual concept, then search or generate

Turn each beat's meaning into a concept, then decide per the table in
[visual-sourcing.md](visual-sourcing.md): source real for identities/maps/artifacts/real
places; generate 2D reconstructions for characters/action/battle/atmosphere, always through
the style + character references. Avoid literal-text images and repeated portraits.

## 5. Produce all scene images

One canonical file per scene in `public/images/scene-NN.jpg`, written by Kontext, text-to-
image, or search. Replacing one scene never touches another. Run
[check-assets.mjs](../scripts/check-assets.mjs).

## 6. Validate each image

Character: identity/age/costume/armor/weapon correct and consistent with the reference.
Historical: country/period/dynasty/architecture/weapons correct, no anachronism. Visual:
on-style, good contrast, readable on mobile, depicts the narration _claim_ (a portrait is not
an army or a battle). Technical: 9:16, high-res, no watermark/unwanted text, no malformed
anatomy. On failure, name the fault and regenerate deliberately (see ai-generation.md) or
re-source with a sharper search. Run [check-assets.mjs](../scripts/check-assets.mjs).

## 7. Review gate — user approves images before any audio (mandatory)

Build one review sheet with [contact-sheet.mjs](../scripts/contact-sheet.mjs) →
`public/review/contact-sheet.jpg`, send it to the user, and **wait for explicit approval**.
Regenerate or re-source rejected scenes and rebuild the sheet. Do **not** call OmniVoice
until the visuals are signed off — images are the review-heavy, failure-prone part, and TTS
should not run against visuals that may change.

## 8. Voice and captions (per scene) — only after approval

Keep narration audio split per scene (`public/audio/scene-NN.mp3`) so a mispronounced part
regenerates in isolation. Measure each file with `ffprobe` and drive `durationInFrames` from
the real totals — never time-stretch to a preset length. Align captions per segment from the
real audio ([align-captions.mjs](../scripts/align-captions.mjs) reads the same durations);
reveal 3–8 word groups on their timestamps.

## 9. Final render & verify

Assemble the composition, render stills at start, middle, scene boundaries, and ending; check
crop, host direction, overlap, subtitle size, and AI tags. Render the MP4 only after stills
pass, then verify codec, resolution, duration, audio stream, and size with `ffprobe`.

## Directory (reference layout)

```
transcript/  characters/<id>/{profile.json,reference.png,prompt.md}  style/style-reference.png
scenes/<id>/{visual-concept.md,prompt.md,image.png,metadata.json}    asset-manifest.json
```

In a Remotion project this maps onto `public/images/`, `public/audio/`, `src/`, and
`public/images/asset-manifest.json`; keep the manifest the single record of every asset.

## Quality gate (do not finish until)

Profiles + approved references + style reference exist · every scene has a concept and an
appropriate asset · character scenes use references · period and country identity correct ·
no obvious anachronism · images 9:16 · no unwanted text/watermark · no major AI artifacts ·
source metadata for searched images · AI images marked `AI_RECONSTRUCTION` · manifest
generated. Do not commit or push unless explicitly requested.
