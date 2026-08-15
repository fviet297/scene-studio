---
name: history-video
description: Build or revise vertical historical explainer and comparison videos in Remotion from a scene-plan markdown (transcript + per-scene timeline and prompts) plus user-pasted character reference images. Use when the task is to parse that plan into scene data and per-scene narration, decide per panel whether to source a real image (maps, artifacts, real places) or generate an AI reconstruction, generate character panels with FLUX Kontext from the pasted references so the same person stays consistent across scenes, keep a 2D historical style, validate period and country identity, label AI images and tag them on screen, preserve source/license metadata, name assets by scene, generate per-scene narration through a local WebSocket TTS voice, synchronize incremental subtitles to real audio, drive a rigged host that points to the mentioned subject, render previews, and export a verified MP4.
---

# Historical Remotion Video

Build around narration **and identity**. Never build around whichever images are easiest to
find. The goal for each line is the image the viewer needs to see — not any image that
merely contains the name.

```
transcript → historical analysis → character detection → profile → character reference
→ scene analysis → visual concept → search OR generate → validate → asset → Remotion
```

Do **not** do: transcript → search a name → download a random image → drop it in.

## Start

1. Inspect `src/Root.tsx`, composition size/FPS/duration, the scene component, the host's
   animation names, and existing `public/characters/`, `public/images/`, `public/audio/`, and
   `asset-manifest.json`. Preserve project conventions and user assets.
2. Read [references/scene-plan.md](references/scene-plan.md) — the input is one scene-plan
   markdown plus pasted `public/characters/<id>.png`; parse it with
   [scripts/parse-scene-plan.mjs](scripts/parse-scene-plan.mjs).
3. Read [references/workflow.md](references/workflow.md) for the full pipeline before a new
   video or a multi-scene revision.
4. Read [references/character-system.md](references/character-system.md) (identity/consistency),
   [references/visual-sourcing.md](references/visual-sourcing.md) (search vs generate),
   [references/ai-generation.md](references/ai-generation.md) (Kontext, on-style prompts),
   [references/layout.md](references/layout.md) (frame regions/safe areas), and
   [references/host.md](references/host.md) (mascot animations/placement).

Stay generic. No `if character == "..."` logic; per-character facts live in
`characters/<id>/profile.json`, never in this skill. It must work for any pair — Đinh Bộ
Lĩnh vs Tần Thủy Hoàng, Lê Lợi vs Lưu Bang, Napoleon vs Quang Trung — with no edit here.

## Input: the scene plan

The user supplies **one markdown file** (transcript split into scenes with timeline,
narration, and per-panel prompts/queries) plus **pasted character reference images** in
`public/characters/<id>.png`. Parse it with
[scripts/parse-scene-plan.mjs](scripts/parse-scene-plan.mjs) → `src/scene-plan.json` (visual
panels) + `scripts/narration-segments.mjs` (TTS). See
[references/scene-plan.md](references/scene-plan.md) for the exact format. The plan is the
single source of truth for images, audio, captions, and timing.

## Characters and style

Character references are **user-provided** — the skill never invents a face. Each panel that
depicts a person is generated from its pasted reference; keep face/costume/silhouette, vary
only pose/action/setting. A profile (fact vs interpretation vs unknown) is a prompting aid,
not a substitute for the reference. Fix one **style** for the project — default **2D
hand-drawn historical illustration**, not 3D/photoreal, unless the project commits to a
real-sourced/archival treatment. See [character-system.md](references/character-system.md)
and [ai-generation.md](references/ai-generation.md).

## Scene model

One image per scene, from `src/scene-plan.json`:

```json
{
  "scene": 3,
  "narration": "Trung Hoa rơi vào nội chiến sau khi nhà Tần sụp đổ...",
  "image": {
    "kind": "search",
    "characters": [],
    "query": "Chu-Han contention map"
  }
}
```

The full-frame scene image sits under an auto-derived title/cue, the host, and the caption
track. **The skill derives title, cue, and host pose from the narration** — the user does not
write them (they gave that latitude). Keep the host clear of the caption and the image's focal
subject. A generated image shows an on-screen "AI phục dựng" tag; never mislabel it as
authentic. No `VS` framing unless the user asks.

## Asset naming

One canonical file per scene in `public/images/`, written by whichever step produced it
(Kontext, text-to-image, or search). Replacing one scene never touches another.

```text
scene-01.jpg   scene-02.jpg   scene-03.jpg
```

## Visual selection

For each beat identify subject, action, location, period, object, event, and visual concept;
turn meaning into a concept before choosing an image. One narration ≠ one image; avoid
literal-text images and repeated portraits (war → battlefield, march → army, unification →
map, origins → childhood, legacy → monument).

One image per scene, `kind: "ai"` (has a `prompt`) or `kind: "search"` (has a `search:`
query — use for maps, artifacts, real places). **AI scenes**:
[scripts/generate-visuals.mjs](scripts/generate-visuals.mjs) runs FLUX Kontext on the scene's
pasted character reference + prompt (or plain text-to-image when no `char`) →
`public/images/scene-NN.jpg`. **Search scenes**: source a real image across repositories via
[scripts/source-assets.mjs](scripts/source-assets.mjs) (Wikimedia, Met, Art Institute, LoC,
optional Europeana) → same canonical filename. Label every generated image
`AI_RECONSTRUCTION`, show a small on-screen "AI phục dựng" tag, and never present it as
authentic. Maps use `objectFit: contain`; other images use `cover` — confirm the vertical
crop in a still.

## Source manifest

Record every asset in `public/images/asset-manifest.json` with `id, scene, type, subject,
source, sourceUrl, license, credit, authenticity` (searched images add provenance; generated
images add `prompt`, `character_references`, `style_reference`). The `source` field names the
actual provider, not a fixed default; open and verify each source page. After sourcing run
[scripts/check-assets.mjs](scripts/check-assets.mjs): it fails on missing files and warns on
reused images, one source over 60%, or a subject in more than two scenes.

## Review gate — approve images before voice (mandatory)

Generate and source **all** scene images first, then **stop and get the user's approval of
the visuals before generating any audio**. Build one review sheet with
[scripts/contact-sheet.mjs](scripts/contact-sheet.mjs) → `public/review/contact-sheet.jpg`
(all `scene-NN.jpg` tiled), send it to the user, and wait. Fix or regenerate any scene they
reject (`node scripts/generate-visuals.mjs <sceneN>` or re-source) and rebuild the sheet.
Only after explicit approval run OmniVoice. Rationale: images are the failure-prone, review-
heavy part; do not spend TTS time until the visuals are signed off.

## Voice generation (per scene) — only after image approval

With OmniVoice at `ws://127.0.0.1:8765/ws`, copy
[scripts/generate-narration.mjs](scripts/generate-narration.mjs) and adapt constants only.
Use `{ "lang": "Vietnamese", "mode": "clone", "voice": "remotion" }`. Keep narration split
**per scene** (`public/audio/scene-NN.mp3`) so a mispronounced part regenerates in isolation
(`node scripts/generate-narration.mjs <sceneN>`). Measure each file with `ffprobe` and set
`durationInFrames` from the real totals — never time-stretch to a preset length. If audio is
regenerated, regenerate captions.

## Subtitle synchronization

Never divide the full duration evenly. Prefer TTS/ASR word timestamps; else forced
alignment/Whisper; else [scripts/align-captions.mjs](scripts/align-captions.mjs) (real
speech/silence regions, per segment, weighted tokens — approximate). Reveal 3–8 word groups
on their timestamps; do not show a whole long sentence at once.

## Host behavior

Mention left subject → `point-left`; right subject → `point-right`; both/abstract → `explain`,
`think`, `celebrate`, `happy`. Keep the host clear of captions and primary imagery. Use the
character already in `src/characters`; do not recreate it. Full animation/expression catalog,
component API, and placement rules: [references/host.md](references/host.md). Frame regions,
safe areas, and host-vs-caption columns: [references/layout.md](references/layout.md).

## Verification

1. Project lint and TypeScript checks.
2. [scripts/check-assets.mjs](scripts/check-assets.mjs): every asset exists, none reused, no
   single source dominates.
3. Per scene, confirm the visual depicts the narration claim itself, not merely the named
   person, and that period/country identity is correct with no anachronism.
4. Render stills at start, middle, scene boundaries, map scenes, and ending; inspect crop,
   duplicate names, direction, overlap, subtitle size, and AI tags.
5. Render MP4 only after stills pass; verify codec, resolution, duration, audio stream, and
   size with `ffprobe`.

Do not commit or push unless explicitly requested.
