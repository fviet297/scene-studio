# Reusable historical characters

Character data (id, display name, aliases, reference image, puppet v2 image) comes from each
project's `## characters` block in `scene-plan.md` plus each `projects/<slug>/characters/<id>/profile.json`,
stamped into that project's Remotion bundle (`src/projects-data/<slug>.json`) by
`node scripts/build-remotion.mjs`. `characterRegistry.ts` reads the bundles — there is no
hardcoded character list in this component. Ids are per project, so every lookup names the project:

```tsx
import { HistoricalCharacter } from './characters/HistoricalCharacter';
import { charactersOf } from './characters/HistoricalCharacter/characterRegistry';

const cast = charactersOf('gia-long');
<HistoricalCharacter project="gia-long" character={cast[0].id} animation="idle" />
<HistoricalCharacter project="gia-long" character={cast[1].id} animation="enter-right" />

<!-- Puppet-ready v2 reference, when public/projects/<slug>/characters/v2/<file> exists. -->
<HistoricalCharacter project="gia-long" character={cast[0].id} referenceVersion="v2" animation="idle" />
```

Supported raster-safe animations: `still`, `idle`, `enter-left`, `enter-right`,
`emphasis`, `exit-left`, `exit-right`.

Generate v2 (puppet) references for the active project's characters with
`node scripts/generate-puppet-references.mjs` (or one id: `... ly-thai-to`).

## Upgrade path to SVG puppet

Keep the component API and replace only its renderer after SVG layers exist. Suggested
layer names: `root`, `head`, `face`, `torso`, `armLeft`, `armRight`, `legLeft`,
`legRight`, `costume`, `accessories`.

For every generated pose or SVG redraw, preserve face, apparent age, hairstyle,
costume, colours, accessories, silhouette and illustration style from the existing PNG.
Only pose and expression may change.
