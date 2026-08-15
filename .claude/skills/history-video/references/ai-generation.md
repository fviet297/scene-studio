# AI image generation

Generate only what cannot be sourced authentically. AI fills concept and action beats;
it never replaces a real identity, a real territory, or a real artifact.

## Decide before generating

| Generate with AI                                     | Source for real instead                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Action: an army marching, a battle underway, a siege | A specific person's face presented as authentic              |
| Abstract concepts: "legacy", "unity", "decline"      | Territorial or campaign maps (AI gets geography wrong)       |
| Atmosphere and establishing shots                    | Artifacts — coins, weights, steles (AI invents inscriptions) |
| Diversity filler so one portrait does not repeat     | Anything already available from a reputable repository       |

If a real museum, archive, or Commons image exists and fits, use it. Generation is the
fallback, not the default.

## Prompt template

```
[period + culture] + [subject or action] + [medium] + [composition] + vertical framing + negatives
```

- **Period + culture**: "12th-century Song dynasty", "10th-century Đại Cồ Việt".
- **Medium**: name a historical medium so it reads as reconstruction, not a fake photo —
  "ink-and-color scroll painting", "temple mural", "bronze relief". Avoid "photograph"
  for pre-photographic eras.
- **Composition**: "central subject, clear negative space at top" keeps room for the
  title and host in the 1080×1920 frame.
- **Negatives**: "no text, no modern elements, no watermark".

Example:

```
Historical reconstruction, 12th-century Song dynasty army marching under banners,
ink-and-color scroll painting style, overcast sky, vertical composition with central
subject and clear negative space at top, no text, no modern elements.
```

## Labeling (mandatory)

- Manifest `authenticity`: `AI_RECONSTRUCTION`; `source`: the model id; `sourceUrl`: `null`;
  store the exact `prompt`.
- Show an on-screen credit for AI shots (e.g. a small "AI reconstruction" tag), so the
  viewer is never misled about authenticity.
- Never label a generated image `AUTHENTIC_PHOTO`, `HISTORICAL_ARTWORK`, or `STATUE`.

## Tooling

[scripts/generate-visuals.mjs](../scripts/generate-visuals.mjs) uses the fal.ai REST API
(`POST https://fal.run/{model}`, `Authorization: Key $FAL_KEY`, default `fal-ai/flux/dev`).
Swap the model or provider by editing the constants. It upserts each result into
`public/images/asset-manifest.json` already labelled. Set `FAL_KEY` before running.
