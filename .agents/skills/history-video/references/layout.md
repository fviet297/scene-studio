# Frame layout

Canvas **1080×1920, 30 fps**. One scene image per beat, with an auto title/cue, the host, and
the caption composited over/under it. Keep everything crop-safe for vertical mobile.

## Default variant — full-bleed hero image

The scene image fills the frame; text and host sit on scrims over it. Cleanest for the
one-image-per-scene model.

| Region            | Y band (px)           | Notes                                                                                              |
| ----------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| Scene image       | 0–1920 full-bleed     | `objectFit: cover`; **maps use `contain`** on a dark bg (`#1a1a1a`).                               |
| Top scrim + title | 0–320                 | gradient `rgba(0,0,0,.72)→transparent`; title ≤2 lines ~60–68px 900; cue under it ~28–30px accent. |
| AI tag            | top-left, ~12px inset | small "AI phục dựng" chip when the image is `AI_RECONSTRUCTION`.                                   |
| Bottom scrim      | 1480–1920             | gradient `transparent→rgba(0,0,0,.82)`.                                                            |
| Caption           | 1560–1740             | 3–8 words, ~40px 800, high contrast; horizontal safe margins 48px; leave a host column (below).    |
| Host              | 1360–1880             | width ~360–420 (height = w×1.1667); anchored to a bottom corner by animation.                      |

## Safe areas

- **Top ~12%** (0–230) and **bottom ~20%** (1536–1920): no critical image content there — it
  sits under the title and caption/host. Keep the image's focal subject vertically centred.
- Horizontal safe margin **48px** each side for all text.

## Platform UI safe zone (TikTok / Reels / Shorts)

The app overlays its own chrome **on top of** the video; anything under it is unreadable. Treat
these bands as unusable for text, the host, and the focal subject (percentages of 1080×1920):

- **Right rail ~130px** (x ≈ 950–1080): like / comment / share / sound disc. Keep the host and
  any key subject **out of the right edge**; never place `point-right` host flush to 1080.
- **Bottom ~420px** (y ≈ 1500–1920): caption, @username, and the description sit here on
  TikTok. Push the video's own caption band **above** this (bottom edge no lower than ~1500),
  and keep the host's feet above it where possible.
- **Left ~40px** and **top ~120px**: progress bar / occasional UI — keep the AI tag and title
  inside the 48px margin, clear of the very top.

Design so the composition still reads with the right rail and bottom quarter covered: focal
subject **centred and slightly high** (vertical centre ~800–950, not 1100+), title in the top
band, one clear caption line above the platform caption zone. Verify by rendering a still with a
TikTok-UI overlay mask (right rail + bottom 420px dimmed) — nothing critical may fall under it.

## Host column vs caption

Host and caption share the bottom third, so split it horizontally:

- `point-left` → host **left** (`left: 40`), caption occupies the right ~620px.
- `point-right` → host **right** (`left: 640`), caption occupies the left ~620px.
- `explain` / both → host **centre-low** (`left: 340`), caption spans full safe width **above**
  the host (caption band raised to ~1440–1600).

Never let the host's bounding box cover caption text or the image's face/subject.

## Title & cue

Derived by the skill from the narration (the user does not write them): title = a short 2–5
word beat label; cue = one supporting line (dates, places, contrast). Keep the title one line
where possible; never dump a sentence.

## Alternative variant — framed image on paper

The legacy comparison look: a paper background (`#f2eadb`), the image in a rounded bordered box
in the upper ~60%, title/cue/host/caption on the paper below. Use only when a project commits
to that treatment; the full-bleed variant is the default for single-image scenes. Two-panel
comparison (left/right images) is a special case of this and needs the older per-side beat
data, not the one-image plan.

## Motion

Short entrance only (opacity/scale over ~10 frames from the sequence start); compositor-
friendly (`transform`, `opacity`). Do not animate layout properties. Per-scene `<Audio>` lives
inside each scene's `<Sequence>`; the caption track reads absolute seconds from
`src/caption-data.ts`.
