# Host mascot

A rigged 2D bird host, already in the project at `src/characters/HistoryHost`. **Use it as
is — never redraw or recreate it.** It points at the subject being narrated and reacts to the
beat. Two independent axes: a body **animation** and a face **expression**, so any animation
combines with any expression.

## Component

```tsx
import { HistoryHost } from "./characters/HistoryHost";

<HistoryHost
  animation="point-left"
  expression="confident"
  width={405}
  style={{ position: "absolute", left: 18, top: 1360 }}
/>;
```

Props: `animation?`, `expression?`, `width?` (px), `height?` (overrides derived), `style?`,
`className?`. The viewBox is **480×560**, so `height = width × 1.1667` when only `width` is
set (e.g. `width: 405 → ~472`). Place it with an absolute `style`. Inside a Remotion
`<Sequence>` the clip plays from the sequence's local start automatically.

## Animations

Use these per scene (`FEATURED_ANIMATIONS`):

| animation     | when                                             |
| ------------- | ------------------------------------------------ |
| `point-left`  | narration is about the LEFT / first subject      |
| `point-right` | narration is about the RIGHT / second subject    |
| `explain`     | discussing both, or an abstract/comparative line |
| `think`       | uncertainty, a question, "but…", a turn          |
| `celebrate`   | victory, triumph, a high point                   |
| `happy`       | warm/positive closing or aside                   |
| `surprised`   | a shock, reveal, or sudden reversal              |
| `wave`        | intro / outro greeting                           |
| `idle`        | filler when nothing specific is cued             |

Also defined (transitions/micro, rarely set by hand): `blink`, `breathing`, `head-tilt`,
`walk`, `fly-in`, `fly-out`.

## Expressions (face only)

`neutral` · `happy` · `surprised` · `confident` · `thinking`. Default `confident` reads well
for a history host; pair with the animation (e.g. `think` + `thinking`, `celebrate` +
`happy`). Expression composes on top of the animation's own face override.

## Placement rules

- **Point toward the focused side.** `point-left` sits on the LEFT; `point-right` on the
  RIGHT; centred/`explain` sits centre-low. See [layout.md](layout.md) for the host column
  and coordinates.
- **Never overlap the caption card or the image's focal subject.** Reserve a host column on
  one side of the bottom third; the caption takes the remaining width.
- Keep `width` in the ~360–420 range for a 1080-wide frame; larger crowds the caption.
- Derive the animation from the narration automatically — the user does not specify it.

## Do not

Recreate, restyle, or replace the mascot; animate it by hand outside its clip system; or set
transition clips (`fly-in`, `walk`, …) as a scene's main pose unless a transition is intended.
