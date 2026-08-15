# Historical visual sourcing

## Search by visual need

For each narration segment identify:

- subject
- action
- location
- historical period
- object
- event
- visual concept

Generate 3–5 queries. Do not search only the named person.

## Source priority

1. Official museums
2. National libraries and archives
3. Wikimedia Commons
4. Library of Congress
5. Internet Archive
6. University collections
7. Other reputable repositories
8. AI reconstruction

## Provider APIs (keyless)

[scripts/source-assets.mjs](../scripts/source-assets.mjs) queries these in a per-asset
fallback chain. Do not settle for one.

- **wikimedia** — `commons.wikimedia.org/w/api.php` search over File namespace; broadest coverage.
- **met** — `collectionapi.metmuseum.org` search + object; public-domain artworks and artifacts.
- **artic** — `api.artic.edu` search + IIIF image; public-domain artworks.
- **loc** — `loc.gov/search/?fo=json`; American archive holdings (flaky JSON, keep last).
- **europeana** — `api.europeana.eu` (needs `EUROPEANA_KEY`); European institutions.

Reorder the chain per asset: artifacts and artworks lead with `met`/`artic`; people and
places lead with `wikimedia`.

## Asset types

- historical artwork
- illustration
- painting
- statue
- artifact
- document
- map
- museum object
- archive image
- historical location
- public-domain illustration
- AI reconstruction

## Authenticity

Use one of:

- `AUTHENTIC_PHOTO`
- `HISTORICAL_ARTWORK`
- `STATUE`
- `MODERN_RECONSTRUCTION`
- `AI_RECONSTRUCTION`

Never imply an ancient artistic likeness is an authentic photograph or contemporary portrait.

## Selection criteria

Prioritize:

1. narration relevance
2. historical appropriateness
3. clear composition
4. vertical adaptability
5. source reputation
6. known license
7. resolution

Do not choose a visual merely because it contains the correct name, is cinematic, or appears first.

## Diversity

For roughly two minutes, aim for a mix of character representations, maps, artworks, locations, artifacts, and simple infographic/timeline visuals. Do not repeat the same portrait throughout.

The sourcing script enforces this: it will not download an image URL a previous scene already used, so identical portraits cannot recur. [scripts/check-assets.mjs](../scripts/check-assets.mjs) then warns when one subject or one source dominates. When a beat keeps colliding, that is the signal to switch to an artifact, a map, or an AI concept shot ([ai-generation.md](ai-generation.md)).

## Vertical compatibility

Check central subject placement, negative space, label crop, background separation, and parallax potential. Maps with important edge labels normally require `contain`.
