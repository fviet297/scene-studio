# Scene plan — the skill input

The user writes **one markdown file**: the transcript split into scenes, each scene giving
just the **narration** (+ optional `char:`/`search:`). One image per scene. Character
reference images are **pasted by the user** into `public/characters/<id>.png`. Everything
else — the image **`prompt:`**, title, cue, host pose, timing, on-screen AI tag — the skill
decides. For each AI scene the skill writes `prompt:` from that scene's narration and saves
it back into the plan so it stays visible and hand-editable.

[scripts/parse-scene-plan.mjs](../scripts/parse-scene-plan.mjs) parses this into
`src/scene-plan.json` (one image per scene) and `scripts/narration-segments.mjs` (per-scene
TTS). The plan is the single source of truth for images, audio, captions, and timing.

## Format (minimal)

```md
# QUANG TRUNG vs HÀN TÍN

## characters

quang-trung = public/characters/quang-trung.png
han-tin = public/characters/han-tin.png

## scene 1

char: quang-trung, han-tin
narration: Một người là vị vua nổi tiếng của Tây Sơn. Một người là đại tướng khai quốc của nhà Hán...
prompt: Two commanders facing forward, one gazing ahead resolute, the other with a hand at the ready. Setting: split composition — left a late-18th-century Đại Việt battlefield, right an ancient Chu-Han-era Chinese field; distinct armies, banners and terrain per side.

## scene 2

char: quang-trung
narration: Nhà Tây Sơn nổi dậy, nhanh chóng tiến vào Thăng Long...
prompt: Leading a rapid northern march, one arm raised commanding the advance. Setting: late-18th-century Đại Việt (Tây Sơn era) — columns of Tây Sơn infantry with red command banners streaming through cold winter countryside toward the tiled-roof gate towers of Thăng Long citadel.

## scene 3

narration: Trung Hoa rơi vào nội chiến sau khi nhà Tần sụp đổ...
search: Chu-Han contention map
```

### Per scene

- **narration** (required) — the transcript for that scene; drives TTS + captions.
- **prompt** (skill-written, not user-written; absent on `search:` scenes) — what the scene
  image shows. The skill generates it from the narration and writes it back here. One image
  per scene. See **Writing the prompt** below.
- **char:** (optional) — one or more pasted-reference ids to keep consistent. With a `char:`,
  the image is generated with FLUX Kontext from that reference (identity preserved); without
  one, it is a plain 2D generation from the prompt. With several ids, the first is the Kontext
  base and the rest are named in the prompt (one clean subject per reference works best).
- **identity:** (optional; only meaningful with `char:`) — how strictly the reference is
  enforced. Default (omitted) is full lock: face, hair, **and costume/armor/weapon/colors** all
  come from the reference. Set `identity: face` to lock only face/hair/age/style and let the
  `prompt:` re-dress the figure — needed when the narration shows the person out of their
  reference costume (a general poor and in commoner's clothes before his rise, a ruler out of
  armor). See **Writing the prompt**.
- **search:** (optional) — source a real image for this scene instead of generating (use for
  maps, artifacts, real places). Replaces `prompt:` for that scene.
- **time:** (optional) — informational only; real scene length comes from the measured audio.

### Writing the prompt (from narration)

For a `char:` scene the Kontext master prompt already locks the character's identity from the
pasted reference — face, hair, costume, armor, weapon, colors, silhouette, style
([lib/replicate-image.mjs](../scripts/lib/replicate-image.mjs) `MASTER_PROMPT`). So the scene
`prompt:` must **not restate the main character's appearance** — repeating "in armor",
"holding a sword", "quilted tunic" fights the reference and drifts identity.

Write only what the reference cannot carry:

- **The main character's action and gesture** for this narration — marching, pointing across a
  map, raising a sword, kneeling, seated on a throne, rallying troops.
- **Setting**: period + country/dynasty, location, atmosphere, lighting, composition.
- **Everyone and everything else** — supporting troops, the opposing side, architecture,
  banners, terrain — _does_ need description, because none of them has a reference. Describe
  them with period guardrails (VD Vietnamese attackers vs Qing defenders must look clearly
  different), and keep the main figure central and crop-safe.

**Exception — `identity: face`.** When the narration shows the person _out of_ their reference
costume (poor before their rise, out of armor), the full lock would force the reference armor
back on and contradict the scene. Tag that scene `identity: face`: the reference then locks only
face, hair, age and style, and the `prompt:` **should** state the clothing it needs ("a coarse
hemp commoner's robe, no armor"). Use it sparingly — only when the costume must differ.

A no-`char:` AI scene has no identity to preserve, so describe the full scene — action, subject
and setting — but still avoid literal-text visuals: meaning, not words.

## What the parser emits

- `src/scene-plan.json` — `{ characters, scenes[] }`; each scene is `{ scene, from?, to?,
narration, image: { kind: 'ai'|'search', characters: [ids], identity: 'full'|'face', prompt?,
query? } }`.
- `scripts/narration-segments.mjs` — `SEGMENTS[{ scene, text }]` from each narration.

## Canonical image name

One image per scene, written by whichever step produced it (Kontext, plain generate, or
search):

```
public/images/scene-01.jpg   public/images/scene-02.jpg   ...
```

The manifest records which it was (`AI_RECONSTRUCTION` vs a real authenticity class). Every
generated image carries an on-screen "AI phục dựng" tag. Title, cue, and host pose are
derived by the skill from the narration; the user does not write them.
