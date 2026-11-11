// Map frames get their own image template. A map scene (a territory, a route, a front seen on an
// illustrated map — the map-scene rules of map-mode.mjs) has no character reference, so it used to
// go through the style's text2img template, whose staging ("wide establishing, elevated view,
// layered depth") and earthy palette turned every map into an oblique landscape painting where the
// territory colours melted into the parchment. This template asks for a true plan view instead,
// and it is style-independent on purpose: it carries neither [STYLE] (the palette would wash the
// territory colours out) nor [GUARD] (style guards ban the saturated colours and flat fills a map
// needs). buildPrompt still adds the no-text policy and figure rules around it.

export const MAP_TEMPLATE = `ONE illustrated historical MAP seen straight down from above, like a page of a hand-painted atlas — the land itself is the subject. [FRAME]

MAP STYLE: true plan view with north at the top: no horizon, no sky, no tilt, no landscape perspective. Pale cream land with light hill-shading; mountain ranges as small grey-green relief; rivers as thin clean blue lines; the sea one clear calm blue, deeper offshore, with fine ripple lines along the shore. Every coastline is a crisp dark ink outline. Clean and uncluttered: large calm areas of plain colour, light paper grain.

TERRITORY: each region the SCENE colours is a flat, even, clearly saturated fill, edged by a darker line of its own hue; neighbouring regions take strongly different colours and meet along one clean simplified line. Land the SCENE leaves uncoloured stays plain cream.

OVERLAYS: every arrow the SCENE names is bold, solid and opaque, with a dark outline and a large clear arrowhead; never more than three arrows. A ring is a bold circle, a boundary a bold dashed line. Overlays sit on top of the map, never faded.

LIFE: only the few small things the SCENE names — boats, a fort, a plume of smoke, a column of troops — as tiny clear icons at map scale; no crowds, no villages filling the land, no painted clouds over the map.

SCENE: [SCENE-SPECIFIC PROMPT]

NEGATIVE: oblique bird's-eye landscape, horizon, sky band, panorama, clouds covering the land, faded or washed-out colour, territory colour blending into the land, one-tone sepia or ochre map, muddy palette, decorative clutter, many small scattered arrows, compass rose, cartouche, legend box, grid lines, frame border, watermark.`;

// Map-scene prompts open on a top-down view ("Wide top-down map of …", or the older "Wide top-down
// illustrated relief map of …" / "Wide top-down view of …"). An opener without the word "map" only
// counts when the prompt paints territory or a route, so an aerial view of an islet or a table seen
// from above stays a normal text2img scene.
const OPENER = /^\s*(?:wide|close)\b/i;
const MAP_OVERLAY = /\b(?:wash(?:ed)?|fill(?:ed)?|route arrows?|patch(?:es)?)\b/i;

export const isMapScene = (scene) => {
  const image = scene?.image;
  if (!image || image.kind === 'search' || image.characters?.length) return false;
  // A scene that already carries a `map:` spec (map-render.mjs) is a map scene whatever its prompt says.
  if (image.map) return true;
  const prompt = image.prompt ?? '';
  const opening = prompt.split(';')[0];
  if (!OPENER.test(prompt) || !/\btop-down\b/i.test(opening)) return false;
  return /\bmap\b/i.test(opening) || MAP_OVERLAY.test(prompt);
};
