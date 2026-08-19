# Historical visual sourcing

Decide, per visual, whether to **search** a real image or **generate** one. The goal is the
image the viewer needs to see for that line — not any image containing the name.

## Search vs generate

| Search (real)                                      | Generate (2D reconstruction)                          |
| -------------------------------------------------- | ----------------------------------------------------- |
| Territorial / campaign maps                        | A character with no authentic likeness                |
| Real artifacts — coins, weights, steles, documents | Battlefield, siege, army on the move                  |
| Historical artworks / paintings from a repository  | Childhood / origin, character action                  |
| Photos of a place as it survives today             | Cinematic scene requiring character consistency       |
| Anything with a reliable public-domain source      | A specific visual that does not exist as a real image |

AI gets faces-as-authentic, geography (maps), and inscriptions (artifacts) wrong — source
those. See [ai-generation.md](ai-generation.md).

## Per-visual analysis

For each narration segment identify subject, action, location, period, object, event, and
visual concept. One narration ≠ one image: a line with several events may need a map, then an
army, then a territory shot. Do not visualise words literally, and do not repeat the same
portrait down the whole video — for war show a battlefield, for a march an army, for
unification a map, for origins a childhood scene, for legacy a monument or symbolic shot.

## Query generation (when searching)

Search by visual need, not by the bare name. Build 3–5 queries per visual.

- Bad: `Quang Trung`
- Good: `Quang Trung Tay Son army historical illustration`, `Nguyen Hue 1789 battle`,
  `Tay Son northern campaign artwork`
- Bad: `Han Xin` → Good: `Han Xin Chu-Han Contention illustration`, `Han Xin Jingxing battle`,
  `ancient Han military formation`

Watch for search traps: a name can return an unrelated modern monument, the wrong person of
the same surname, a barcode/logo, or a near-black scan. Verify every hit.

## Do not restrict to Wikimedia

Search across repositories and pick by provenance, not convenience:

1. Official museums 2. National libraries & archives 3. Wikimedia Commons
2. Library of Congress 5. Internet Archive 6. University collections 7. Other reputable
   public-domain collections 8. AI reconstruction (last).

### Keyless provider APIs

[scripts/source-assets.mjs](../scripts/source-assets.mjs) queries these in a per-asset
fallback chain — do not settle for one:

- **wikimedia** — `commons.wikimedia.org/w/api.php` File-namespace search; broadest.
- **met** — `collectionapi.metmuseum.org`; public-domain artworks/artifacts.
- **artic** — `api.artic.edu` + IIIF; public-domain artworks.
- **loc** — `loc.gov/search/?fo=json`; American holdings (flaky JSON, keep last).
- **europeana** — `api.europeana.eu` (needs `EUROPEANA_KEY`); European institutions.

Artifacts/artworks lead with `met`/`artic`; people/places lead with `wikimedia`. When a
search's top hit is wrong, fetch the exact file by title via `Special:FilePath/<title>?width=`
(the thumbnail endpoint can return an HTML error for CJK/diacritic names — verify the
downloaded bytes start with an image signature).

## Selection criteria

Rank by: narration relevance, historical/period accuracy, country accuracy, clear
composition, vertical adaptability, source reputation, known license, resolution. Never pick
an image only because it appears first, is high-res, is pretty, or merely contains the right
name.

## Authenticity classes

Classify every asset — and never imply an artistic likeness is a photograph:

`AUTHENTIC_PHOTO` · `HISTORICAL_ARTWORK` · `ARCHIVAL` · `STATUE` · `MODERN_RECONSTRUCTION` ·
`MAP` · `ILLUSTRATION` · `AI_RECONSTRUCTION`

## Diversity & vertical fit

Aim for a mix across a ~2-minute video: character shots, maps, artworks, locations,
artifacts, timeline/infographic. The sourcing script refuses a URL a prior scene used, and
[check-assets.mjs](../scripts/check-assets.mjs) warns when one subject or one source
dominates — that collision is the signal to switch to an artifact, a map, or an AI concept
shot. Check central placement, negative space, label crop, and background separation; maps
with edge labels need `objectFit: contain`.

## Source metadata

Record provenance for every searched asset (`id, type, source, sourceUrl, creator, license,
title, accessed_at`). Open and verify the source page — never infer reuse rights from a
search thumbnail.
