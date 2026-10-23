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
- If the repo has a `projects/` directory, it hosts multiple comparison videos side by side
  (see `compare-image`): `scene-plan.md` is `projects/<slug>/scene-plan.md`, assets live
  under `public/projects/<slug>/`, and the active project comes from `projects/active.json`
  (or `--project <slug>` / `PROJECT` env). There the plan is parsed on demand and never
  mirrored into `src/`; `parse-scene-plan.mjs` only validates, and Remotion reads
  `src/projects-data/<slug>.json` built by `build-remotion.mjs` (see SKILL.md → Start).
  Otherwise use the root-level paths below.

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

## 5. Write the prompts — do not generate

The skill's job here is **text, not pixels**: write each AI scene's `prompt:` into
`scene-plan.md` and reparse. One canonical file per scene lands later at
`public/images/scene-NN.jpg`; replacing one scene never touches another.

**Never call Replicate yourself.** Do not run
[generate-visuals.mjs](../scripts/generate-visuals.mjs) or any other paid image/audio
generation on your own initiative — every call costs the user credit and overwrites committed
assets. Image generation happens only when the user clicks **Generate** in the review UI
(step 7). Approving a style direction, a prompt, or a plan is **not** approval to generate.

The one exception is search scenes: [source-assets.mjs](../scripts/source-assets.mjs) only
downloads free public-domain stills and is safe to run.

When the prompts are ready, go straight to the review gate and hand control to the user. Run
[check-assets.mjs](../scripts/check-assets.mjs) to report what is still missing.

## 6. Validate each image (after the user has generated it)

Character: identity/age/costume/armor/weapon correct and consistent with the reference.
Historical: country/period/dynasty/architecture/weapons correct, no anachronism. Visual:
on-style, good contrast, readable on mobile, depicts the narration _claim_ (a portrait is not
an army or a battle). Technical: 9:16, high-res, no watermark/unwanted text, no malformed
anatomy. On failure, name the fault and regenerate deliberately (see ai-generation.md) or
re-source with a sharper search. Run [check-assets.mjs](../scripts/check-assets.mjs).

## 7. Review gate — user generates & approves images in a web UI (mandatory)

As soon as every prompt is written, start [review-server.mjs](../scripts/review-server.mjs)
(`node scripts/review-server.mjs` → `http://127.0.0.1:8080`), give the user the URL, and stop.
This is the hand-off point: **the user reads the prompts and presses the buttons**, not you.

The user works each AI scene in the panel: read the narration, edit
the generated prompt if needed, hit **Generate/Regenerate** (Replicate, via
[lib/replicate-image.mjs](../scripts/lib/replicate-image.mjs)), and check the 9:16 result.
Saved prompts write back into `scene-plan.md`; search scenes are read-only (source them with
[source-assets.mjs](../scripts/source-assets.mjs)). Only when every AI scene image exists does
the **Approve & generate audio** button enable. Do **not** run OmniVoice any other way — the
UI's approve step launches it. Images are the review-heavy, failure-prone part, and TTS should
not run against visuals that may change. ([contact-sheet.mjs](../scripts/contact-sheet.mjs)
still makes a static `public/review/contact-sheet.jpg` for a quick offline glance.)

## 8. Voice and captions (per scene) — launched by the UI's approve step

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
generated · every AI image was generated by the user in the review UI, never by the skill.
Do not commit or push unless explicitly requested.
