# Reusable historical characters

Character data (id, display name, aliases, reference image, puppet v2 image) is generated per
project into `src/characters-data.json` by `node scripts/parse-scene-plan.mjs`, from the active
project's `## characters` block in `scene-plan.md` plus each `projects/<slug>/characters/<id>/profile.json`.
`characterRegistry.ts` reads that file — there is no hardcoded character list in this component.

Use the shared Remotion component with whatever character ids the active project defines:

```tsx
import { HistoricalCharacter } from './characters/HistoricalCharacter';
import { characterList } from './characters/HistoricalCharacter/characterRegistry';

<HistoricalCharacter character={characterList[0].id} animation="idle" />
<HistoricalCharacter character={characterList[1].id} animation="enter-right" />

<!-- Puppet-ready v2 reference, when public/projects/<slug>/characters/v2/<file> exists. -->
<HistoricalCharacter character={characterList[0].id} referenceVersion="v2" animation="idle" />
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
