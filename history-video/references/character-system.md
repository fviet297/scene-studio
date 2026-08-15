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
The reference — not the profile, not the scene prompt — is the source of truth for every AI
scene: [scripts/generate-visuals.mjs](../scripts/generate-visuals.mjs) feeds it to FLUX
Kontext so the same person appears in every generated panel. If a character has no reference,
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

## 5. Generic pipeline

```
Detect character → research context → build profile → use the user's reference → reuse across scenes
```

No `if character == "..."` logic anywhere. Country/period/dynasty/role are resolved
dynamically, and only then do clothing, armor, weapon, architecture, banners, and
environment follow. See [scene-plan.md](scene-plan.md) for how references are declared and
scenes drive generation, [ai-generation.md](ai-generation.md) for period guardrails, and
[visual-sourcing.md](visual-sourcing.md) for when to source a real image instead.
