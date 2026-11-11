// Writes the `map:` spec of a map scene (map-render.mjs) with the LLM: from the scene's narration,
// its English beat and its image prompt (which, for a map scene, already describes the map frame),
// it picks a view, the period territories, arrows, rings and short Vietnamese labels — the
// arguments of the H2 kit's "map" template.
//
// The vocabulary (view names, territory ids, place ids) is read at run time from the installed
// kit's packs/bando/places.js, never copied into this repo (see map-render.mjs for why). The reply
// is checked against it: an unknown place or territory drops that one item instead of failing the
// whole map, so one bad guess never costs the scene.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chatJson } from './llm-client.mjs';
import { mapKitDir, normalizeMapSpec } from './map-render.mjs';

export const loadMapVocabulary = async (kitDir = mapKitDir()) => {
  const mod = await import(pathToFileURL(join(kitDir, 'packs', 'bando', 'places.js')).href);
  const regions = Object.fromEntries(Object.entries(mod.REGIONS).map(([id, r]) => [id, r.note ?? '']));
  return { views: mod.VIEWS, regions, countries: Object.keys(mod.COUNTRY ?? {}), places: Object.keys(mod.PLACES), place: mod.place, slug: mod.slug };
};

const FRAME_PX = { '16:9': '1920×1080', '9:16': '1080×1920' };

export const mapSpecSystem = (vocab) => `You turn scenes of a Vietnamese history video into map frames: for every scene given, the spec of ONE animated map frame, drawn by code on a real relief map. Reply with one JSON object {"scenes": [{"scene": <number>, "map": {...}}]} holding one entry per scene given, in order, and nothing else.

SPEC FIELDS (all optional except view)
- view: a view name below, or [west, south, east, north] in degrees, or {"c": <place>, "span": <degrees of longitude across the frame>}. The viewer must be able to tell WHERE the frame is without help, so choose the view by what the viewer can recognise, not by how small the subject is: a place, a wall or a river mouth → {"c", "span": 3.5-5}; a boundary, a gap or a route between two places → {"c", "span": 5-6}; a region → a regional view; the whole country → "viet-nam" or {"c": [107.6, 17.2], "span": 23}. Never go tighter than span 3 and never frame only coast and sea around a tiny subject (see ORIENTATION).
- year: the scene's year as text ("1627"), "~1620" when approximate. Leave it out when the scene gives none.
- regions: territories, each {"r": <territory id or country name>, "color": <hex>, "alpha": 0.6, "at": <seconds>, "grow": true|"fade"|false}. Several ids of one side share one colour. Fixed colours: Vietnam / Đàng Trong / the Nguyễn "#d8383a"; a rival Vietnamese power (the Trịnh north, Đàng Ngoài) "#e0a526"; land that just joined "#e8892b"; an autonomous or allied power "#1c9c86"; a foreign power (Champa, Chân Lạp, Xiêm, China) "#5b5fc7".
- arrows: at most three, each {"from": <place>, "to": <place>, "via": [<place>...], "color": "orange"|"red"|"teal"|"white"|"purple", "at": <s>, "dur": 1.4-2, "w": 16}. orange = an advancing army, red = one's own forces, teal = ships, trade and envoys, white = a retreat, purple = diplomacy.
- labels: at most four short pills, {"text": <1-4 Vietnamese words with full diacritics>, "place": <place>, "color": "red"|"teal"|"brown"|"orange"|"purple"|"blue"|"green"|"dark"|"white", "dx": <px>, "dy": <px>, "size": 30-36, "at": <s>}. dx, dy offset the pill from its point in pixels of the frame given below (default 0, -78).
- names: at most three large region names written on the map, {"text", "place", "color": "yellow"|"red"|"teal"|"orange"|"white"|"blue", "size": 36-44, "at"}.
- lines: {"pts": [<place>...], "color": "yellow", "dash": true, "w": 6, "at", "dur"} for a boundary or a route.
- rings: {"place", "r": 40-70, "color": "red"|"teal"|"#ffd23f", "at"}; pins: {"place", "color", "at"}; marks: {"kind": "!"|"?"|"x", "place", "dx", "dy", "size", "at"}.
- Every "at" is seconds from the start of the clip, between 0.3 and 3.5, staggered in reading order so the map builds up.

PLACES: a place id below (Vietnamese names without diacritics, words joined by "-") or [longitude, latitude].
TERRITORIES: the ids below (period borders, estimates), "dai-viet-<year>" for every piece joined up to that year, or a country name from the list.

RULES
- Show only what the narration and the image prompt say; invent no event, place or border. A label names exactly the place its point is (never put "Thuận Hóa" on Đồng Hới). When unsure where something was, leave the label out.
- LAYOUT: fewer items read better — usually two or three labels and at most two names. Never put two labels or names on the same or neighbouring points: spread their points apart, then push each pill away from the crowd with dx/dy (left of a coast point: negative dx; out to sea: positive dx). Put a region name ("names") on a point well INSIDE its region, never on its border or on a labelled point.
- ARROWS: each arrow follows its own route. An army by land runs through land places; a fleet by sea runs through sea points written as [longitude, latitude] a little offshore (east of the coast). Two arrows never share their whole path.
- ORIENTATION: every frame needs context outside its subject. Put at least one region name ("names", e.g. "QUẢNG BÌNH") well inside land, and tag the nearest well-known town or river (Đồng Hới, sông Gianh, Huế, Hà Tĩnh) so the viewer can place the frame against the coast. When the story is set in the divided country (Trịnh–Nguyễn, Đàng Ngoài / Đàng Trong), add the two "regions" and one "names" per side, so the frame reads as a political map. The subject (a wall, a line, a ring) should span about 5% of the frame width or more; if it is smaller, widen the view less and enlarge the subject (line "w" 9-14, ring "r" 45-70, labels "size" 28-34), do not zoom in. Keep a place tag from covering the subject it sits next to: push it away with dx/dy.
- Keep every label inside the frame, away from the top-left corner (the year badge, x < 360 and y < 290) and the bottom fifth (captions).
- Hoàng Sa and Trường Sa are drawn and labelled as Vietnam automatically: never add a label, region or colour for them and never colour them for another country.
- No big centre text, chapter card or topic bar.

- Neighbouring map scenes change view scale (local, region, whole country) so the video does not repeat one frame. "Local" still obeys ORIENTATION: vary span between 3 and 6 rather than tightening further.

EXAMPLE (scene 29, narration: "Năm 1627, Trịnh Tráng đem quân vào đánh Thuận Hóa, bằng đường bộ và đường biển.")
{"scenes": [{"scene": 29, "map": {"view": "bac-trung-bo", "year": "1627",
 "regions": [{"r": "goc", "color": "#e0a526", "alpha": 0.62, "grow": false}, {"r": "manh-1069", "color": "#d8383a", "grow": false}, {"r": "manh-1306", "color": "#d8383a", "grow": false}],
 "labels": [{"text": "Quân Trịnh", "place": "nghe-an", "color": "orange", "dx": -160, "dy": -50, "size": 32, "at": 0.4}, {"text": "Quân Nguyễn", "place": "dong-hoi", "color": "red", "dx": -190, "dy": 40, "size": 32, "at": 2.6}],
 "arrows": [{"from": "nghe-an", "to": [106.42, 17.78], "via": ["ha-tinh", [106.3, 18.0]], "color": "orange", "at": 0.8, "dur": 2.0, "w": 16}, {"from": [106.25, 18.95], "to": [106.62, 17.8], "via": [[106.95, 18.3]], "color": "orange", "at": 1.2, "dur": 2.0, "w": 16}],
 "rings": [{"place": [106.5, 17.62], "r": 62, "color": "red", "at": 3.0}]}}]}

VIEWS: ${Object.entries(vocab.views).map(([k, b]) => `${k} [${b.join(', ')}]`).join('; ')}

TERRITORY IDS:
${Object.entries(vocab.regions).map(([k, note]) => `- ${k}: ${note}`).join('\n')}

COUNTRY NAMES: ${vocab.countries.join(', ')}

PLACE IDS: ${vocab.places.join(', ')}`;

// scenes: [{ scene, narration, beat, prompt }] — narration is the line the scene plays under (an
// extra shot passes its narration's), beat the English map frame, prompt an older image prompt.
export const mapSpecUser = ({ aspect, scenes }) => [
  `Frame: ${aspect}, label offsets in pixels of a ${FRAME_PX[aspect] ?? FRAME_PX['16:9']} frame.`,
  ...scenes.map((s) => [
    `SCENE ${s.scene}`,
    `Narration (Vietnamese): ${s.narration || '(none)'}`,
    s.beat ? `Map frame to draw: ${s.beat}` : '',
    s.prompt ? `Image prompt describing this map frame: ${s.prompt}` : '',
  ].filter(Boolean).join('\n')),
].join('\n\n');

const REGION_PATTERN = /^(dai-viet|nuoc-viet)-\d{3,4}$/;

// Keep what the kit can draw. Returns { spec, dropped } where dropped lists the removed items.
export const validateMapSpec = (input, vocab) => {
  const spec = normalizeMapSpec(input);
  const dropped = [];
  const known = (p) => (Array.isArray(p) ? p.length >= 2 && p.every(Number.isFinite) : Boolean(vocab.place(p)));
  const isView = (v) => (typeof v === 'string' ? Boolean(vocab.views[v] ?? vocab.views[vocab.slug(v)])
    : Array.isArray(v) ? v.length === 4 && v.every(Number.isFinite)
      : Boolean(v && typeof v === 'object' && known(v.c)));
  if (!isView(spec.view)) {
    dropped.push(`view ${JSON.stringify(spec.view)}`);
    spec.view = 'viet-nam';
  }
  const isRegion = (r) => {
    const id = typeof r === 'string' ? r : r.r ?? r.country;
    return typeof id === 'string' && (Object.hasOwn(vocab.regions, id) || REGION_PATTERN.test(id) || vocab.countries.includes(id));
  };
  const placesOf = (o) => [o.place, o.from, o.to, ...(o.via ?? []), ...(o.pts ?? [])].filter((p) => p !== undefined);
  const keep = (key, ok) => {
    if (!spec[key]) return;
    spec[key] = spec[key].filter((o) => {
      if (ok(o)) return true;
      dropped.push(`${key} ${JSON.stringify(o).slice(0, 120)}`);
      return false;
    });
  };
  keep('regions', isRegion);
  for (const key of ['labels', 'names', 'arrows', 'lines', 'pins', 'rings', 'marks']) keep(key, (o) => placesOf(o).length > 0 && placesOf(o).every(known));
  return { spec, dropped };
};

// The LLM's reply → Map(scene → checked spec). A scene missing from the reply, or whose spec cannot
// be drawn at all, is logged and left out; one bad scene never costs the rest of the batch.
export const parseMapSpecsReply = (reply, scenes, vocab, onLog = () => {}) => {
  const rows = Array.isArray(reply?.scenes) ? reply.scenes : reply?.map ? [{ scene: scenes[0]?.scene, map: reply.map }] : [];
  const specs = new Map();
  for (const { scene } of scenes) {
    const row = rows.find((r) => Number(r?.scene) === scene);
    if (!row?.map) { onLog(`✗ scene ${scene}: LLM không trả đặc tả bản đồ`); continue; }
    try {
      const { spec, dropped } = validateMapSpec(row.map, vocab);
      for (const d of dropped) onLog(`scene ${scene}: bỏ mục không vẽ được: ${d}`);
      specs.set(scene, spec);
    } catch (e) {
      onLog(`✗ scene ${scene}: ${e.message}`);
    }
  }
  return specs;
};

// Ask the LLM for the map specs of several scenes in one call (the vocabulary in the system prompt
// is long, so batching saves most of the cost). → Map(scene → spec).
export const writeMapSpecs = async ({ aspect, scenes, vocab, signal, onLog = () => {} }) => {
  const reply = await chatJson({ system: mapSpecSystem(vocab), user: mapSpecUser({ aspect, scenes }), signal, label: 'map spec', onLog });
  return parseMapSpecsReply(reply, scenes, vocab, onLog);
};

// One scene's map spec; throws when the LLM gave none that can be drawn.
export const writeMapSpec = async ({ aspect, narration, beat, prompt, vocab, signal, onLog = () => {} }) => {
  const specs = await writeMapSpecs({ aspect, scenes: [{ scene: 1, narration, beat, prompt }], vocab, signal, onLog });
  if (!specs.has(1)) throw new Error('LLM không viết được đặc tả bản đồ cho scene này');
  return specs.get(1);
};
