# Character system

The identity layer. Build it before any scene image so every appearance of a figure is
the same person. Generic by construction — nothing here names a specific character. All
per-character facts live in `characters/<id>/profile.json`, never in this skill.

## 1. Detection

Read the transcript and extract every historical entity, not just the two headline names:
characters, aliases, dynasties/kingdoms, countries, events, battles, locations, artifacts,
relationships, timestamps. Detect characters generically — never branch on a specific name.

For each character emit a record:

```json
{
  "character_id": "kebab-case-name",
  "name": "Display Name",
  "aliases": ["..."],
  "country": "...",
  "period": "e.g. late 18th century / late 3rd century BCE",
  "dynasty": "dynasty / kingdom / state / era",
  "role": "e.g. Emperor and military commander"
}
```

## 2. Profile (before any scene)

Expand each character into a profile. Fill only from research; leave unknowns explicit.

```
Name · Aliases · Country · Period · Dynasty/State · Role · Approx age
Appearance · Face · Hair · Facial hair · Clothing · Armor · Weapons · Accessories
Symbols · Historical constraints · Visual identity (one-line silhouette summary)
```

Store as `characters/<id>/profile.json`.

### Fact vs interpretation vs unknown

Separate three tiers and never promote one to another:

- **Known fact** — attested (e.g. "was the Tây Sơn emperor").
- **Interpretation** — reconstruction to make an image (e.g. "late-18th-century military dress").
- **Unknown** — no reliable evidence (e.g. "no authentic portrait survives").

When appearance is unknown, build a _historically inspired reconstruction_ and label it as
such. Never claim a generated face is the real likeness.

## 3. Character reference = source of truth (user-provided)

The **user pastes** one reference image per character into the project — the skill does not
invent a face:

```
public/characters/<id>.png    # one clean reference per character (from the scene-plan map)
```

A good reference shows a clear face and full costume/armor/weapon so the character reads at a
glance. The scene-plan file maps each id to its file (`<id> = public/characters/<id>.png`).

**Two characters in one video must be distinguishable at face level.** References generated
from the same style prompt often come back sharing a face shape, eyes, brows and beard, with
only the headwear differing. Every scene that shows both then reads as one person in two hats,
and no scene prompt can fix it — the model is obeying the references. Check a new set by
covering the headwear: if you cannot tell them apart, change one reference's face shape,
apparent age, beard style **and robe colour** before generating any scene.
The reference — not the profile, not the scene prompt — is the source of truth for every AI
scene: [scripts/generate-visuals.mjs](../scripts/generate-visuals.mjs) feeds it to the
image-to-image model so the same person appears in every generated panel. If a character has no reference,
that character's panels must be sourced (search) or the user must add the image.

## 4. Consistency

Once a reference is approved, every scene reuses it. **Preserve**: face, facial structure,
hairstyle, facial hair, apparent age, build, costume, armor, helmet, weapon design, colour
palette, silhouette, illustration style. **May vary**: pose, expression, action, camera,
environment, lighting, composition. Do not redesign the character.

### Priority on conflict

```
Character Reference  >  Character Profile  >  Scene Prompt
```

If a scene prompt accidentally contradicts the reference (e.g. asks for a long beard when
the reference has a short one), the reference wins.

### Changing the art style

Because the reference outranks the prompt, **you cannot restyle a video from the prompt side**
— telling the templates "draw everything as X" while the pasted reference is still drawn in
style Y produces the worst result of all: a style-Y character composited into a style-X scene.

To change art direction, restyle the references themselves:

1. Back the user's pasted originals up to `public/characters/_original/` (once, before any
   restyle — that directory is the pristine source every later run reads from).
2. Swap `STYLE_DNA` in [lib/replicate-image.mjs](../scripts/lib/replicate-image.mjs).
3. Ask permission, then run [restyle-characters.mjs](../scripts/restyle-characters.mjs).
4. Show the user the redrawn references and get approval before generating any scene.

Restyling is where identity is most easily lost. Check the redraw against the original for
facial hair (models tend to shave it), apparent age (they tend to make figures younger),
and helmet/armour ornaments (they tend to reinterpret an ornament as some other object). Name
whichever of these drifted and re-run rather than accepting a figure that reads as a different
person.

## 5. Generic pipeline

```
Detect character → research context → build profile → use the user's reference → reuse across scenes
```

No `if character == "..."` logic anywhere. Country/period/dynasty/role are resolved
dynamically, and only then do clothing, armor, weapon, architecture, banners, and
environment follow. See [scene-plan.md](scene-plan.md) for how references are declared and
scenes drive generation, [ai-generation.md](ai-generation.md) for period guardrails, and
[visual-sourcing.md](visual-sourcing.md) for when to source a real image instead.
