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

### STYLE_DNA — one knob, one place

The written half of the Style Reference lives in exactly one constant, `STYLE_DNA` in
[scripts/lib/replicate-image.mjs](../scripts/lib/replicate-image.mjs). It is interpolated into
the char-lock template, the face-lock template, the text-to-image path and
[scripts/restyle-characters.mjs](../scripts/restyle-characters.mjs), so **editing that one
line restyles the character references and every scene at once**. Write it as a dense clause
list in this order and never describe style anywhere else:

```
medium · figure proportions · lineart · shading · face · palette
```

Changing art direction is therefore a two-step job, in this order:

1. Swap `STYLE_DNA`.
2. Run `restyle-characters.mjs` so the pasted references are redrawn in the new style, and let
   the user approve them.

Do not skip step 2. The reference outranks the prompt (see
[character-system.md](character-system.md)), so scenes generated from an old-style reference
keep the old look no matter what the template says.

### The whole frame is one style

The commonest failure is a correctly-styled main character pasted onto a background drawn in
another style — stylised figure, painterly landscape, semi-realistic background troops. The
model treats the reference as a sticker unless told otherwise, so the templates lead with
style before identity and state explicitly that:

- the style applies to **every pixel, foreground to horizon** — figures, buildings, terrain,
  banners, sky;
- **supporting characters are drawn to the same degree of stylisation** as the main character
  — spell out that they share the identical figure proportions, line weight, eye and face
  construction, shading _and level of detail_, never a different proportion system and never
  painted silhouettes;
- **a crowd is many small full characters**, not a textured mass. Left unsaid, the model
  renders ranks of troops as loose painterly blobs even when the hero is cleanly stylised —
  this is the single most common way a scene ends up looking like two different artworks;
- the main character sits **inside** the world at the same line weight and light, not on top
  of it;
- banners, flags and shields stay **blank** — models otherwise fill them with gibberish script.

Give these their own headed blocks near the top of the template, before the identity lock.
Buried in a bullet list after the character description, they get dropped.

### Reference-conditioned generation (default here)

Scenes that name a character are produced by **image-to-image with the user's pasted
reference**, not by text alone — this keeps the same face across scenes. The default model is
**ByteDance Seedream 4.5** (`bytedance/seedream-4.5`), which does both image-to-image and
text-to-image from one endpoint: feed `public/characters/<id>.png` via `image_input` plus a
scene prompt that begins with a preserve clause ("Reproduce the exact same character — face,
hair, costume, armour, colours — do not redesign"), then the action/setting, then the style +
guardrails. [scripts/generate-visuals.mjs](../scripts/generate-visuals.mjs) does this for every
`kind: "ai"` scene in `src/scene-plan.json` that has a `char`, and uses plain text-to-image
(same model, no `image_input`) for AI scenes with a prompt but no character. Either way it
writes one canonical file `public/images/scene-NN.jpg`. FLUX Kontext (`flux-kontext-dev`) still
works as a fallback if `REPLICATE_KONTEXT_MODEL` points at it.

**Seedream vs FLUX — practical notes (learned in production):**

- Seedream follows the prompt far more literally, so it needs **fewer, calmer instructions**,
  not a wall of repeated `DO NOT` lines. An over-long lock prompt made FLUX collapse the whole
  scene into a plain-background full-frame portrait and clone the hero's armour onto every
  extra; a short, plain-language lock on Seedream gives the marching army, the citadel, and the
  environment the scene actually describes.
- **Hard 4000-character prompt limit** on Seedream (`input.prompt`). The character-lock
  template plus the scene `prompt:` must together stay under 4000 chars — keep the template
  compact (see [scripts/lib/replicate-image.mjs](../scripts/lib/replicate-image.mjs)
  `MASTER_PROMPT`, ~2.3k chars) or generation fails with a 422.
- Seedream returns a JPG/PNG/WebP URL array; when account credit is low Replicate throttles to
  ~6 req/min with burst 1, so the shared lib retries on HTTP 429 honouring `retry_after`.

## Narration → prompt (never copy the line)

```
Narration → event → visual concept → prompt
```

**Find the event first.** Before writing anything, say in one clause who does what to whom,
where, in THIS line — that clause is the frame's main action, and the prompt exists to stage
it. "Kiều Công Tiễn giết Dương Đình Nghệ" is a killing inside a citadel courtyard: draw the
attack and the guards breaking, not a quiet gate. "Đại quân Tống áp sát biên giới" is an army
on the move: draw that army massing on a frontier road, not a beacon fire seen from the
capital.

**An abstract line still points at a concrete moment — draw the moment.** A verdict, a lesson
or a metaphor ("nền tự chủ coi như gãy", "biến thế yếu thành một cái bẫy") refers to something
happening in the world: the trap being built, stakes driven into the riverbed at night, the
ambush party settling into the reeds. Draw that. A map on a table, an empty throne or an object
still life turns a story beat into a pause.

**Actors without a `char:` reference are still drawn.** The reference rule limits
identity-locked figures only. A rival, an assassin, an enemy general, a killed predecessor —
anyone the narration names who has no reference — appears as an anonymous figure: at distance,
from behind, or inside a crowd, face not readable, their own culture and era pinned like any
other extra. Never empty the frame ("no person in focus", "no faces") to avoid them; an empty
room reads as a missing scene.

Do not visualise words literally: "tài quân sự xuất chúng" → a commander directing troops,
not the text on screen. One narration with several events may need several images (map, then
army, then territory) rather than one crowded frame.

## Prompt budget (check before writing scene prompts)

Seedream 4.5 enforces `maxLength: 4000` characters and its own schema adds: _"BytePlus
recommends keeping prompts under 600 English words for best results."_ The templates in
[lib/replicate-image.mjs](../scripts/lib/replicate-image.mjs) plus `NO_TEXT_POLICY` consume
most of that, leaving a scene prompt roughly:

| template          | when                      | chars left for the scene prompt |
| ----------------- | ------------------------- | ------------------------------- |
| `masterPrompt`    | one `char:` id            | ~670                            |
| `faceLockPrompt`  | one id + `identity: face` | ~615                            |
| `multiCharPrompt` | two or more ids           | ~590                            |

Those figures assume the default `STYLE_DNA`; a longer style line shrinks every one of them,
since `[STYLE]` is interpolated into each template. Measure after editing either. Overflow
fails loudly, but under-budget degradation is silent: the model quietly drops the style and
background instructions rather than erroring.

Therefore **never repeat in a scene prompt what the template already states.** The template
owns art style, supporting-cast stylisation, "ordinary soldiers wear plainer gear than the
commander", composition/framing/negative-space, figure anatomy and prop coherence (the
COHERENT ANATOMY & PROPS block), and the generic negatives. The scene prompt
owns only what changes per scene:

```
action · period & country · setting · who else is present (ethnicity, costume, weapons)
· architecture · scene-specific negatives (which wrong culture or era to avoid)
```

Verify before generating — assemble template + prompt and count:

```bash
node -e "…"   # chars must be < 4000; words should be < 600
```

`buildInput` throws with the character count if a prompt exceeds the hard limit, so a too-long
prompt fails loudly instead of erroring inside the API after the reference upload. The word
recommendation is not enforced — that one is on you to check.

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

**Multiple characters** — list every id in `char:`; the pipeline uploads all of them (Seedream
accepts 1–14) and `multiCharPrompt` locks each figure to its own reference. The template maps
**reference N to the Nth character named in the scene prompt**, so the prompt must name them
in `char:` order — "the first character … the second character …" — and give each one its own
side of the frame. `identity: face` is ignored here on purpose: unlocking costume is exactly
what lets the model blend two people into one repeated face.

A missing reference file now throws instead of being skipped: dropping reference 2 would shift
every character after it and silently mis-map the whole scene.

**Comparison (split-screen)** — only when it aids the comparison, not every scene. Left =
character A with A's country/period/environment; right = character B with B's. Full-body,
clearly visible, clean vertical separation. Two characters who share a face in their own
reference sheets will still read as one person here — that is a character-reference problem,
not a prompt problem; see [character-system.md](character-system.md).

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

## Concrete historical detail (name it, or the model invents it)

A vague noun lets the model fall back to its most common training image — usually generic
Hollywood-Chinese armor and European-fantasy castles. Every material element in a prompt must
be **named for the correct culture and century**, never left to the model.

Two layers, and you need both:

| Layer             | Owns                                                                                               | Where           |
| ----------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| Generic exclusion | "ONE CULTURE PER IMAGE" — never mix a neighbouring culture or a later dynasty, in either direction | template, once  |
| Named nouns       | _which_ culture this scene is, and which specific wrong one to forbid                              | scene `prompt:` |

The template rule alone is not enough — it tells the model to stay in one culture but not which
one, and a bare "citadel" still resolves to whatever the model saw most. The scene prompt alone
is not enough either, because it can only forbid what you thought to list. So:

- **Background soldiers / army** carry the same identity risk as the hero, in two ways:
  - _Culture/era of gear_ — name it, not just the lead: "background soldiers in late-18th-
    century Đại Việt / Tây Sơn infantry dress — conical nón, quilted tunics, spears and rattan
    shields", not "soldiers with flags". Unnamed extras default to Qing/Chinese troops.
  - _Face ethnicity_ — image-to-image models copy the reference face onto the crowd and,
    left unpinned, drift the extras to **European/Western faces**. State it explicitly:
    "all soldiers have distinctly East-Asian / Vietnamese faces, never European or Western
    features". Do this for both sides of a two-culture comparison (Han-Chinese faces for the
    Han scene, Vietnamese faces for the Đại Việt scene).
  - _Do not clone the hero_ — the reference is the hero's design only. Say the extras "wear
    plain foot-soldier gear clearly different from and simpler than the commander's armour",
    or the model duplicates the hero's golden armour and helmet across the whole rank.
- **Architecture** is the most frequent anachronism. Never write "citadel", "palace", "tower"
  bare — a bare tower becomes a European Gothic spire. Name the specific structure and style,
  or "Han-era rammed-earth walls and timber watchtowers". Forbid the wrong ones explicitly
  (no European castle, no Gothic spire, no pagoda where a gate belongs).

  **A culture label is not a description.** "Vietnamese Later-Lê style" is a name the model has
  almost no training images for; it will render whatever it does know for that region — Chinese
  — and the label changes nothing. Describe the **shape**, not the style name.

  Worse, do not hand the model the neighbouring culture's signature noun and then forbid that
  culture in the same prompt. "Vietnamese Later-Lê gate towers **with upturned eaves**" is a
  self-contradiction: _upturned eaves_ and _gate tower_ are the Chinese cues (飞檐, 城楼), and a
  concrete visual noun always beats an abstract negation elsewhere in the prompt. The model
  draws the eaves and ignores "no Chinese architecture". This is the commonest cause of culture
  bleed and no amount of extra negatives fixes it — the request itself is wrong.

  **Naming a drawable object in a negative summons it.** Seedream has no `negative_prompt`
  field: everything you send is one positive token stream, and a `NEGATIVE:` heading is just
  more prompt text. Measured on scene 1 of the Quang Trung video — the prompt said
  `no multi-tier pagoda, no Chinese flying eaves` and `banners stay BLANK (no letters or fake
script)`; the render came back with three multi-tier pagoda roofs, flying eaves, and gibberish
  script on the banners. Every named object appeared. Meanwhile `photorealistic`, `3D` and
  `watermark` in the same negative list worked fine.

  The distinction is what kind of word it is:

  | In a negative                                                       | Behaviour            |
  | ------------------------------------------------------------------- | -------------------- |
  | Style adjective (`photorealistic`, `3D`, `gradients`, `haze`)       | suppressed correctly |
  | Drawable object noun (`pagoda`, `gate tower`, `lettering`, `spire`) | **rendered**         |

  So: keep negatives to style qualities, and express every object constraint **positively** —
  describe the surface you want instead of the thing you don't. "Banners are plain undecorated
  crimson cloth" beats "no lettering on banners". "The wall top is a bare flat walkway with open
  sky directly above" beats "no gate tower".

- **Banners: the noun itself summons the script.** A "command banner" (帥旗) is, in essentially
  every training image, a flag with a character on it — so asking for one and then forbidding
  text is the same self-contradiction as the eaves. Models are especially prone to answering
  with modern Latin-alphabet lettering, which on a pre-modern banner is wrong twice over: an
  invented word _and_ a script that did not exist in that period (Vietnamese quốc ngữ was not in
  official use before the 20th century; a Tây Sơn or Han banner would carry chữ Hán/Nôm or
  nothing).

  Drop the loaded noun and describe the cloth: _"tall plain crimson cloth banners on bare wooden
  poles"_, never _"tall red Tây Sơn command banners"_. A bare **shape word summons an emblem
  just as a role word does** — `swallowtail banner`, `pennant`, `war flag` all leave the field
  open, so pin the cloth every time ("swallowtail-cut plain crimson cloth, no emblem or
  lettering"). On a Chinese scene the default fill is an **imperial dragon** (hoàng long): it is
  the single strongest Chinese banner attractor and is tied to no one dynasty, so `no Qing` /
  `no Ming` never removes it — only a positive "plain solid-color cloth, no emblem or lettering"
  does. Back it with a positive BARE SURFACES block in the template ("one uninterrupted field of
  a single flat colour, edge to edge, showing only folds and hem"), and keep only the bare token
  `text` in the negative list — `watermark` and `text` behave as style-class tokens and do get
  suppressed; `lettering on banners` does not.

  For Đại Việt against Chinese, the discriminating forms are:

  | Element      | Đại Việt                                                       | Chinese (forbid)                         |
  | ------------ | -------------------------------------------------------------- | ---------------------------------------- |
  | Citadel gate | low wide brick wall, arched vaulted passage, flat rampart walk | tall wooden gate tower on a plinth       |
  | Roof line    | squat and heavy, lifts only at the very corner tip (đầu đao)   | whole eave line sweeps up (flying eaves) |
  | Tile         | dark unglazed lotus-tip tile (ngói mũi hài)                    | glazed yellow or green imperial tile     |
  | Brackets     | none visible; stout plain timber posts                         | dougong bracket clusters                 |
  | Hall         | low đình-style timber hall, roof sweeping close to the ground  | tall multi-tier pagoda-roofed hall       |

  Build the same table for whatever two cultures a video compares, before writing any prompt.

- **Banners, weapons, materials**: name them ("red Tây Sơn command banners with Nôm/Hán
  characters", "bronze Qin dagger-axe (ge)"), and forbid the neighbouring culture's version.
- **Resolve identity per element**: for a Vietnamese scene say "Vietnamese, not Chinese;
  Đại Việt, not Qing/Ming"; for a Chinese scene pin the exact dynasty and forbid later ones.
  A comparison video mixing two cultures needs this on **every** scene — the model will pull
  the more-common culture into the rarer one otherwise (Đại Việt scenes drift Chinese).

Write these as concrete nouns inside the scene `prompt:` itself (action + named setting), so
each `char:` scene still leads with action while the _setting_ is historically pinned. When a
generated image shows the wrong culture (Qing armor on Đại Việt troops, Gothic tower in
Thăng Long), the fix is a sharper named noun, not a reroll.

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

**Frame the main figure as a medium-wide environmental shot, not a full-frame portrait.** An
image-to-image model, told only to "keep the whole character visible and uncropped", answers
with a single figure filling the frame and no scene. Ask instead for the main character to
occupy only **about one third to one half of the frame height** (waist-up to three-quarter
figure), leaving clear room for the soldiers, architecture and landscape to be visible in the
mid-ground and background. Keep only the head/face uncropped and inside the safe zone. This is
what makes a scene read as an event (a march, a battle, a court) rather than a character card.

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
- European faces on Asian extras → "all soldiers have distinctly East-Asian / Vietnamese (or
  Han-Chinese) faces, never European or Western features"
- extras cloned in the hero's armour → "ordinary soldiers wear plain foot-soldier gear clearly
  different from and simpler than the commander's armour"
- hero fills the whole frame, no scene → "medium-wide shot, the main figure fills only one
  third to one half of the frame height, soldiers and environment visible around and behind"
- extra/third hand, fused figures, twisted pose, a weapon warped or passing through the hand →
  the template's COHERENT ANATOMY & PROPS block owns this; if one still slips, add a _positive_
  per-scene clause ("he grips the spear in two hands, the shaft straight and unbroken"), never a
  "no extra hand" negative — a hand named in a negative gets rendered (see the negative table above)
- rider's head and horse face opposite ways → "the rider and his mount both face and gallop the
  same way, toward <the target>", stated positively; never "not looking backward"
- shading looks 3D / gradient / glossy against the flat 2D style → keep it in the negative as a
  style quality ("no 3D gradient, cast shadow or gloss") and positively "flat even cel shading"

### Failure modes that come from the prompt's own wording

These four cost several rerolls each. All of them look like model failures and are not.

- **A culture label draws the wrong country.** "a pre-modern Southeast Asian kingdom" is a
  label, not something drawable, so the model falls back to the best-known neighbour — the
  request produced a map of China, Yellow River and all. Describe the **shape**: the coastline,
  the river that fans into a delta, the limestone basin. Never hand the model a style or
  culture label and expect it to resolve it.
- **A slot you leave unnamed gets filled with a modern object.** A river boat drawn with no
  hull description came back with black rubber car tyres as fenders. The fix is positive, never
  a negative: say "plain painted wood hull with coiled rope and woven bamboo bundles along the
  sides" so the slot is already occupied. Naming the tyre in a negative renders a tyre.
- **Two transport modes in one frame with no ground stated.** "on a river boat … behind, a
  column of ox-carts" gave carts walking on the water, because nothing said where the carts
  were. Either commit to one mode ("everything travels on the water, nothing moves along the
  banks") or state the surface for each.
- **`GUARD`'s "clear central subject" invents a person in a scene that has none.** On a
  symbol-only map with no `char:`, that clause plus a `STYLE_DNA` describing eyes, brows and
  hands is enough for the model to grow a giant character out of the route line. For an
  unpeopled scene, either give it a `char:` and make the person deliberate, or drop the
  central-subject clause from `GUARD` and say the map itself is the subject.

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
`AI_RECONSTRUCTION` and upserting the manifest: image-to-image (character reference) when the
scene has a `char`, plain text-to-image otherwise. Both go through the shared
[scripts/lib/replicate-image.mjs](../scripts/lib/replicate-image.mjs), whose `buildInput`
shapes the request per provider (Seedream `image_input`/`size`/`aspect_ratio` vs FLUX
`input_image`/`output_format`) and rejects prompts over the 4000-char limit.

[scripts/restyle-characters.mjs](../scripts/restyle-characters.mjs) redraws each pasted
character reference in the current `STYLE_DNA`, keeping the same person, costume and colours.
It always reads the pristine original from `public/characters/_original/` — back the pasted
references up there before the first run — so repeated restyles never compound style drift.
Run it after any `STYLE_DNA` change, one call per character, and have the user approve the
results before any scene is generated.

- **Replicate** (`REPLICATE_API_TOKEN`; models `REPLICATE_KONTEXT_MODEL` and
  `REPLICATE_TEXT_MODEL`, both default `bytedance/seedream-4.5`). Point either at
  `black-forest-labs/flux-kontext-dev` / `flux-dev` to fall back to FLUX. Load the key from a
  git-ignored `.env`.
- Mind Seedream's **4000-char prompt limit** and low-credit **429 throttling** (see the
  practical notes above); the lib already retries 429 and the template is kept compact.

Keep the preserve clause, style line, and guardrails identical across every scene so all AI
shots stay on the same characters and the same Style Reference.

**Who runs it:** the user, from the review UI — one scene per button press. The skill writes
prompts and never calls Replicate on its own initiative, because every call costs credit and
overwrites a committed asset. `node scripts/generate-visuals.mjs <sceneN>` is the CLI escape
hatch for when the user explicitly asks for a batch; state the number of calls first and get a
yes for that specific run.
