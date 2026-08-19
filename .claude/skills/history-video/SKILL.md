---
name: history-video
description: "Build or revise vertical historical Remotion videos from a scene plan and character references: generate physically coherent AI image prompts, source or generate visuals, preserve identity and period accuracy, label AI assets, run a review UI with editable image/video prompts, generate optional image-to-video previews from public image URLs with job polling/logs, generate per-scene TTS with controlled pauses, synchronize captions, render, and verify MP4 output. Do not add a mascot/host unless explicitly requested."
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

1. Inspect `src/Root.tsx`, composition size/FPS/duration, the scene component, and existing
   `public/characters/`, `public/images/`, `public/audio/`, and
   `asset-manifest.json`. Preserve project conventions and user assets.

   **Multi-project layout (optional):** some repos host several comparison videos side by
   side instead of one (see the `compare-image` reference implementation). Detect this by a
   `projects/` directory at the repo root. When present: `scene-plan.md` lives at
   `projects/<slug>/scene-plan.md`, character references and generated assets sit under
   `public/projects/<slug>/` instead of `public/`, the active project is read from
   `projects/active.json` (or `--project <slug>` / a `PROJECT` env var passed to each
   script), and `parse-scene-plan.mjs` also emits `src/characters-data.json` (character
   gallery data for the review panel). A new project scaffolds from `projects/_template/`.
   Everything else in this skill is unchanged; without a `projects/` directory, use the
   root-level paths described below.

2. Read [references/scene-plan.md](references/scene-plan.md) — the input is one scene-plan
   markdown plus pasted `public/characters/<id>.png`; parse it with
   [scripts/parse-scene-plan.mjs](scripts/parse-scene-plan.mjs).
3. Read [references/workflow.md](references/workflow.md) for the full pipeline before a new
   video or a multi-scene revision.
4. Read [references/character-system.md](references/character-system.md) (identity/consistency),
   [references/visual-sourcing.md](references/visual-sourcing.md) (search vs generate),
   [references/ai-generation.md](references/ai-generation.md) (image models, on-style prompts),
   [references/layout.md](references/layout.md) (frame regions/safe areas).

Stay generic. No `if character == "..."` logic; per-character facts live in
`characters/<id>/profile.json`, never in this skill. It must work for any pair — Đinh Bộ
Lĩnh vs Tần Thủy Hoàng, Lê Lợi vs Lưu Bang, Napoleon vs Quang Trung — with no edit here.

## Input: the scene plan

The user supplies **one markdown file** — the transcript split into scenes, each scene giving
only its **narration** (+ optional `char:`/`search:`) — plus **pasted character reference
images** in `public/characters/<id>.png`. The user does **not** write image prompts. For each
AI scene the skill generates the `prompt:` from that scene's narration (see **Prompt
generation** below) and writes it back into the plan file, then parses with
[scripts/parse-scene-plan.mjs](scripts/parse-scene-plan.mjs) → `src/scene-plan.json` (visual
panels) + `scripts/narration-segments.mjs` (TTS). See
[references/scene-plan.md](references/scene-plan.md) for the exact format. The plan is the
single source of truth for images, audio, captions, and timing.

## Prompt generation (from narration)

The user gives narration only; the skill writes each AI scene's image prompt from it under two
rules:

- **Never describe the character's appearance** (face, costume, build, hair). Identity is
  carried by the pasted `char:` reference through image-to-image generation; restating looks
  fights the reference and drifts identity.
- **Describe only action and gesture** that fit that scene's narration (marching, pointing
  across a map, raising a sword, kneeling, rallying troops), plus setting, atmosphere, and
  composition. The same holds for scenes with no `char:` — action and scene, not a face.
- **Validate physical continuity** before saving the prompt: every person, animal, vehicle,
  and prop must be placed in a physically plausible environment and share the same mode of
  travel. If a convoy is on a river, specify boats/barges for the whole convoy and explicitly
  exclude carts, horses, oxen, or buffalo from the water; keep any land transport on the bank.
  Resolve contradictory cues instead of leaving them for the image model to interpret.

Write the generated `prompt:` back into the scene plan so it is visible, hand-editable, and
stable across re-runs. `search:` scenes get no prompt. Details and an example:
[references/scene-plan.md](references/scene-plan.md).

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

The full-frame scene image sits under an auto-derived title/cue and caption track. A generated
image shows an on-screen "AI phục dựng" tag; never mislabel it as authentic. No `VS` framing
unless the user asks.

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

One image per scene, `kind: "ai"` (has a `prompt` the skill wrote from the narration — see
**Prompt generation**) or `kind: "search"` (has a `search:` query — use for maps, artifacts,
real places). **AI scenes**: write the
prompt into the plan and stop — **the user generates them from the review UI** (see
**Review gate**). Generation runs image-to-image on the scene's pasted character reference +
prompt (default model Seedream 4.5; FLUX Kontext as a fallback), or plain text-to-image when
no `char` → `public/images/scene-NN.jpg`. **Search scenes**: source a real image across repositories via
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

The user reviews and generates the scene images in a local web UI, then approves; approval
triggers audio. Start it with [scripts/review-server.mjs](scripts/review-server.mjs)
(`node scripts/review-server.mjs`, opens `http://127.0.0.1:8080`) after parsing the plan and
pasting the character references.

**Never generate images yourself.** Do not run
[scripts/generate-visuals.mjs](scripts/generate-visuals.mjs) or any other paid
image/audio call on your own initiative — each one costs the user Replicate credit and
overwrites committed assets. Write the prompts, start this server, hand over the URL, and wait.
Approval of a style, a prompt, or a plan is **not** approval to generate; only a button press
in this panel is. If the user explicitly asks you to run a batch from the CLI, say how many
calls it will make and get a yes for that specific run. The panel lists every scene with its narration and, for AI
scenes, the generated **prompt in an editable box**; the user can edit a prompt and hit
**Generate/Regenerate** to run Replicate for that one scene (via the shared
[scripts/lib/replicate-image.mjs](scripts/lib/replicate-image.mjs)), sees the resulting 9:16
image inline, and repeats until every AI scene is right. A saved prompt is written back into
`scene-plan.md`. Search scenes are shown read-only (source them with
[scripts/source-assets.mjs](scripts/source-assets.mjs)). When all AI scene images exist the
**Approve & generate audio** button enables; pressing it runs
[scripts/generate-narration.mjs](scripts/generate-narration.mjs) and streams its log into the
page. Rationale: images are the failure-prone, review-heavy part; no TTS runs until the user
signs off in the UI. ([scripts/contact-sheet.mjs](scripts/contact-sheet.mjs) still produces a
static tiled `public/review/contact-sheet.jpg` for a quick offline glance if needed.)

The panel also exposes, all still user-driven (no paid call happens without a button press):

- **Editable master / template prompts** — a collapsible editor for the five prompt pieces
  every generation combines with the scene prompt (`styleDna`, `masterPrompt`, `faceLockPrompt`,
  `text2img`, `guard`; placeholders `[STYLE]`, `[GUARD]`, `[SCENE-SPECIFIC PROMPT]`). Saved to
  `scripts/prompt-templates.json`, which `getTemplates()`/`saveTemplates()` in
  [scripts/lib/replicate-image.mjs](scripts/lib/replicate-image.mjs) merge over the built-in
  defaults; a blank field falls back to the default. This overrides globally — it changes every
  later generation.
- **Editable narration** per scene — written back to `scene-plan.md` and reparsed (so audio
  segments and captions follow).
- **Per-scene audio** — a Gen/Regen button on each card runs
  [scripts/generate-narration.mjs](scripts/generate-narration.mjs) `<sceneN>` for that one scene
  and plays the result inline; the footer **Approve** still does all scenes at once.
- **Multi-select batch** — tick scenes to batch-generate images (AI scenes, one reference per
  frame, sequential) or audio (a single narration run for the list).

## Optional image-to-video motion previews

After a scene image is approved, expose an editable motion prompt in the review UI. Keep motion
restrained and preserve source identity, costume, architecture, props, period, and composition;
allow only subtle camera push-in/parallax and natural cloth, water, or background movement. No
redesign, new people or objects, anachronism, text, watermark, or cuts. Never start paid video
generation automatically.

For VMedia, upload the local image first and send the returned public `image_url` to the video job;
never send a filesystem path or data URI. Read API key, model, mode, domain, project, ratio,
resolution, duration, and endpoint overrides from `.env`. Include required `resolution` (`720p`),
log request/response summaries without exposing the key, poll the job id through the status
endpoint, download success to `public/scene-videos/scene-NN.mp4`, and show live logs and the
result in the review panel. Missing public URL, job id, status, or video URL is an explicit error.

## Voice generation (per scene) — triggered by the UI's Approve button

Approving in the review UI runs this step; only regenerate scenes by hand afterwards. With
OmniVoice at `ws://127.0.0.1:8765/ws`, copy
[scripts/generate-narration.mjs](scripts/generate-narration.mjs) and adapt constants only.
Use `{ "lang": "Vietnamese", "mode": "clone", "voice": "history" }`. Keep narration split
**per scene** (`public/audio/scene-NN.mp3`) so a mispronounced part regenerates in isolation
(`node scripts/generate-narration.mjs <sceneN>`). Apply conservative silence removal to cap
long internal pauses at about 0.18s retained silence without making speech rushed. Measure
each file with `ffprobe` and set `durationInFrames` from real totals — never time-stretch to a
preset length. If audio is regenerated, always regenerate captions from the same narration
segments and new durations.

## Subtitle synchronization

Never divide the full duration evenly. Prefer TTS/ASR word timestamps; else forced
alignment/Whisper; else [scripts/align-captions.mjs](scripts/align-captions.mjs) (real
speech/silence regions, per segment, weighted tokens — approximate). Reveal 3–8 word groups
on their timestamps; do not show a whole long sentence at once.

## Finalize & render (from the UI)

Once every scene has both an image and audio, the review panel drives the rest of the pipeline
so the user never touches the CLI:

- **Finalize & render MP4** (footer) runs, streaming each step's log:
  [measure-audio.mjs](scripts/measure-audio.mjs) → `src/audio-durations.ts`,
  [align-captions.mjs](scripts/align-captions.mjs) → `src/caption-data.ts`,
  [check-assets.mjs](scripts/check-assets.mjs) (a hard gate — a missing file stops the run),
  then `remotion render ScenePlanVideo out/ScenePlanVideo.mp4`. It is disabled, and its guard
  reports the missing scenes, until every image + audio exists. A play/download link to
  `/video` appears when the render finishes.
- **Per-scene MP4 preview** — each card's Render button renders a single-scene composition
  `SceneOne` (that scene's cinematic image + title/cue overlay + its own audio) to
  `out/scene-NN.mp4` and shows it inline. Duration comes from the scene's measured audio, passed
  as props and read by the composition's `calculateMetadata`, so a preview renders independently
  of the full timeline (no need for `audio-durations.ts` to be current). Captions are a
  whole-video concern and are omitted from the per-scene preview.

This assumes the project's `src/Root.tsx` registers both the full `ScenePlanVideo` composition
and a single-scene `SceneOne` composition (props `{ scene, durationInFrames }`, duration set via
`calculateMetadata`). The skill ships the review tooling, not those Remotion components — they
live in the project.

## Host behavior

No host is rendered by default. Do not derive host poses, reserve host space, import
`HistoryHost`, or add mascot overlays. Keep the lower frame available for captions and imagery.
Only add a host after an explicit user request, then document placement and animation in the
project plan before implementation.

## Verification

1. Project lint and TypeScript checks.
2. [scripts/check-assets.mjs](scripts/check-assets.mjs): every asset exists, none reused, no
   single source dominates.
3. Per scene, confirm the visual depicts the narration claim itself, not merely the named
   person, and that period/country identity is correct with no anachronism.
4. For each generated prompt, check spatial/physical continuity (terrain, water, roads,
   vehicles, animals, and direction of travel) before approving the image.
5. Render stills at start, middle, scene boundaries, map scenes, and ending; inspect crop,
   duplicate names, direction, overlap, subtitle size, and AI tags.
6. Render MP4 only after stills pass; verify codec, resolution, duration, audio stream, and
   size with `ffprobe`.

Do not commit or push unless explicitly requested.
