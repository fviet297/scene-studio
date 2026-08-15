# AI image generation

Generate what cannot be sourced authentically, and generate it consistently. AI fills
character scenes, action, battles, atmosphere, and concept beats; it never replaces a real
identity's face-as-authentic, real territory (maps), or real artifacts (coins, steles,
inscriptions — AI invents them). See the decision table in [visual-sourcing.md](visual-sourcing.md).

Every generated image is labelled `AI_RECONSTRUCTION` in metadata and, when it depicts a
real person or event, carries a small on-screen "AI reconstruction" tag. Never call it an
authentic portrait, real photo, or original historical image.

## Style reference (one per project)

Before generating scenes, fix one Style Reference (`style/style-reference.png`) that pins
line art, colour treatment, shading, proportions, background treatment, and lighting. Every
later generation targets that style so the video reads as one hand.

**Default style — 2D, not 3D:**

```
2D hand-drawn historical animation illustration, clean bold outlines, flat colours,
subtle painterly shading, expressive characters, cinematic educational-documentary
aesthetic, detailed but readable, suitable for vertical mobile video.
```

Avoid by default: 3D, CGI, photorealism, realistic photography, plastic skin, Pixar/Disney
3D, game-character render. (If a project instead commits to a real-sourced/archival look,
the Style Reference is that treatment and generated shots must match it — consistency
within a project beats any global default.)

### Style hierarchy

```
Style Reference (how it looks) + Character Reference (who it is) + Scene Prompt (what happens)
```

### Reference-conditioned generation (default here)

Scenes that name a character are produced by **image-to-image with the user's pasted
reference**, not by text alone — this keeps the same face across scenes. The default is FLUX
**Kontext**: feed `public/characters/<id>.png` as the input image and a scene prompt that
begins with a preserve clause ("Keep the exact same character — face, hair, costume, armor,
colors — do not redesign"), then the action/setting, then the style + guardrails.
[scripts/generate-visuals.mjs](../scripts/generate-visuals.mjs) does this for every
`kind: "ai"` scene in `src/scene-plan.json` that has a `char`, and falls back to FLUX
text-to-image (flux-dev) for AI scenes with a prompt but no character (no identity to
preserve). Either way it writes one canonical file `public/images/scene-NN.jpg`.

## Narration → prompt (never copy the line)

```
Narration → meaning → visual concept → prompt
```

Do not visualise words literally: "tài quân sự xuất chúng" → a commander directing troops,
not the text on screen. One narration with several events may need several images (map, then
army, then territory) rather than one crowded frame.

## Prompt templates

Keep one consistent medium line (the Style Reference) in every prompt. Aspect ratio 9:16.

**Generic scene** — `[subject] · historical context (period/dynasty/country) · location ·
event · action · character · clothing · armor · weapons · environment · composition`,
then the style line, then the negatives.

**Character scene** — lead with: "Use the provided <name> character reference as the visual
identity source. Preserve exactly: face, proportions, hairstyle, facial hair, apparent age,
build, costume, armor, helmet, weapon, palette, silhouette, style." Then scene/period/
location/action/camera/composition. End: "Do not redesign the character. Do not change the
historical period. Do not introduce anachronistic clothing or equipment."

**Multiple characters** — pass each reference independently; preserve each face/costume/
silhouette; do not merge their designs or periods unless historically shared.

**Comparison (split-screen)** — only when it aids the comparison, not every scene. Left =
character A with A's country/period/environment; right = character B with B's. Full-body,
clearly visible, clean vertical separation.

**Battle** — event, period, location, main character, army, action; visible period weapons/
armor/banners/architecture, real battlefield geography, correct formation; cinematic wide
shot with fore/middle/background depth, dust and atmosphere.

**Map** — clarity over art: period, region, factions, key locations, movement, territorial
change; simplified geography, clear boundaries, strong hierarchy, minimal detail. (Usually
better _sourced_ — see visual-sourcing.md.)

**Architecture / artifact** — period, culture, accurate proportions, historically correct
materials/design, simple background; no modern structures or fantasy elements.

## Historical guardrails (in every prompt)

```
historically appropriate clothing and military equipment for the specified period,
no later-dynasty elements, no modern objects, no fantasy armor, no anachronistic weapons
```

Prevent cross-period bleed: no Ming armor in a Qin scene, no Qing dress in a Han scene, no
Nguyễn-dynasty costume in a Tây Sơn scene, no samurai/European-medieval armor in the wrong
culture, no modern gear on an ancient field. Resolve period from `country + century +
dynasty + era + role`, never "ancient Chinese/Vietnamese warrior".

## Negative prompt (tune per character/period)

```
3D render, CGI, photorealistic, realistic photography, plastic skin, 3D game character,
fantasy armor, futuristic armor, modern military uniform, modern weapons, guns, sci-fi,
anachronistic clothing, wrong dynasty, wrong period, wrong culture, samurai armor,
European medieval armor, modern architecture, distorted anatomy, extra fingers, extra
limbs, duplicate characters, deformed hands, bad face, blurry face, text, subtitle, logo,
watermark
```

## Composition for 9:16

Keep the subject central and crop-safe. Top ~10–15% and bottom ~15–20% are caption safe
areas — no critical content there. Face visible, silhouette readable, negative space at top
for title/host.

## Validate, then regenerate deliberately

After each generation check: correct identity/age/costume/armor/weapon; correct country/
period/dynasty/architecture; 2D and on-style; good contrast, readable on mobile; 9:16, high
res, no watermark/text, no malformed hands/limbs/duplicate figures.

On failure, name the fault and add a targeted clause — do not reroll blindly:

- wrong face → "strictly preserve the provided character reference"
- wrong costume → "period-specific historically appropriate costume"
- wrong dynasty → pin the exact period, e.g. "late 18th-century Tây Sơn Vietnam only"
- cut off → "full body, head-to-feet visible, centered, safe margins"
- too 3D → "flat 2D hand-drawn illustration, no 3D rendering, no CGI"

## Metadata

Generated images record:

```json
{
  "id": "scene-04-...",
  "type": "AI_RECONSTRUCTION",
  "character_ids": ["<id>"],
  "style_reference": "style/style-reference.png",
  "character_references": ["characters/<id>/reference.png"],
  "prompt": "...",
  "source": "AI generated (<provider> <model>)",
  "sourceUrl": null,
  "authenticity": "AI_RECONSTRUCTION",
  "aspect_ratio": "9:16"
}
```

## Tooling

[scripts/generate-visuals.mjs](../scripts/generate-visuals.mjs) reads `src/scene-plan.json`
and generates one image per `kind: "ai"` scene into `public/images/scene-NN.jpg`, labelling
`AI_RECONSTRUCTION` and upserting the manifest: FLUX Kontext when the scene has a `char`
reference, FLUX text-to-image otherwise.

- **Replicate** (`REPLICATE_API_TOKEN`; models `REPLICATE_KONTEXT_MODEL` default
  `black-forest-labs/flux-kontext-dev`, `REPLICATE_TEXT_MODEL` default
  `black-forest-labs/flux-dev`). Load the key from a git-ignored `.env`.

Keep the preserve clause, style line, and guardrails identical across every scene so all AI
shots stay on the same characters and the same Style Reference. Regenerate one scene with
`node scripts/generate-visuals.mjs <sceneN>`.
