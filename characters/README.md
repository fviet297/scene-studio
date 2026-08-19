# Reusable historical characters

Existing references remain the visual source of truth:

- `public/characters/lythaito.png`
- `public/characters/lythedan.png`

Use the shared Remotion component without changing either source image:

```tsx
import { HistoricalCharacter } from './characters/HistoricalCharacter';

<HistoricalCharacter character="ly-thai-to" animation="idle" />
<HistoricalCharacter character="ly-the-dan" animation="enter-right" />

<!-- New puppet-ready references, without replacing current assets. -->
<HistoricalCharacter character="ly-thai-to" referenceVersion="v2" animation="idle" />
```

Supported raster-safe animations: `still`, `idle`, `enter-left`, `enter-right`,
`emphasis`, `exit-left`, `exit-right`.

## Upgrade path to SVG puppet

Keep the component API and replace only its renderer after SVG layers exist. Suggested
layer names: `root`, `head`, `face`, `torso`, `armLeft`, `armRight`, `legLeft`,
`legRight`, `costume`, `accessories`.

For every generated pose or SVG redraw, preserve face, apparent age, hairstyle,
costume, colours, accessories, silhouette and illustration style from the existing PNG.
Only pose and expression may change.
