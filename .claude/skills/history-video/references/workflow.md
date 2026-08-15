# End-to-end workflow

## 1. Inspect

- Find `src/Root.tsx`, composition dimensions, FPS, and duration.
- Find the main scene component and all character animation names.
- Measure narration duration with `ffprobe`.
- List existing images and identify repeated generic portraits.

## 2. Segment narration

Create visual beats shorter than broad script chapters. A two-minute video usually needs 8–14 beats.

For each beat record:

- time range
- narration claim
- left visual need
- right visual need
- host direction
- title/cue
- authenticity class

Split a sentence across multiple assets when it contains a map event plus military action or object standardization.

## 3. Source visuals

Source with [scripts/source-assets.mjs](../scripts/source-assets.mjs) — a per-asset provider
fallback chain across museums, Commons, Library of Congress, and more, with URL de-duplication
so no image repeats. Use bare image search only for discovery, never as the download path.

Examples:

- “Loạn 12 sứ quân” -> territorial map, not Hoa Lư landscape.
- “Qin defeats six states” -> Warring States map plus army artifact.
- “standardized currency and measurement” -> Ban Liang coin and Qin standard weight.
- “legacy” -> surviving locations, artifacts, maps, or institutional diagrams.

For any beat the chain cannot fill — an action, a concept, or a shot that would otherwise
force a repeated portrait — generate it with [scripts/generate-visuals.mjs](../scripts/generate-visuals.mjs)
and label it `AI_RECONSTRUCTION`. See [ai-generation.md](ai-generation.md) for the boundary
between what to generate and what to source for real.

## 4. Organize assets

Create exact scene filenames. Never reference one generic source filename from multiple scene entries. Preserve originals if they might still be useful; scene-specific copies are safe and reversible.

## 5. Implement layout

- 1080x1920, commonly 30 FPS.
- Keep comparison panels in the upper area.
- Keep the host below panels and above/beside captions.
- Use one name label per panel.
- Avoid `VS` for neutral historical comparison.
- Dim the non-focused side instead of removing it.

## 6. Voice and captions

Generate voice first when possible. Let natural narration duration determine composition length:
measure the final MP3 with `ffprobe` and set `durationInFrames` from it. Do not time-stretch the
audio to hit a preset length. Generate or align timestamps from the final audio, not pre-generation
estimates — [scripts/align-captions.mjs](../scripts/align-captions.mjs) reads the same `ffprobe`
duration.

If voice is regenerated, regenerate caption data. If audio is ever time-stretched, all existing
timestamps become invalid unless transformed by the exact same factor.

## 7. Review loop

Run [scripts/check-assets.mjs](../scripts/check-assets.mjs) first — fix missing files, reused
images, and single-source warnings before rendering anything. Then, per scene, confirm the visual
depicts the narration claim itself, not just the named person.

Render representative stills. Inspect maps separately because `cover` often cuts labels. Use `contain` with a compatible panel background.

After stills pass, render the full file. Keep versioned output names during iteration (`-v2`, `-synced`, etc.), and expose the newest verified file clearly.
