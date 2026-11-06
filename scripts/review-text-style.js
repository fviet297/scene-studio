// Scene Studio - text style editor.
//
// One dialog edits every burned-in text layer: the subtitles (branding.json → captions) and the
// scene title (→ title). Which layer it edits is set by the button that opens it ("Phụ đề" or
// "Tiêu đề" next to the preview modes), so the two stay separate in the UI while sharing the
// fields (font, size, colour, outline, backdrop, position) and the ready-made styles.
//
// A style is applied to the layer through updateCaptions / updateTitle (review-timeline.js), which
// save branding.json after a pause. The dialog draws its own approximation of the layer on the
// selected scene's picture; the player is remounted once, when the dialog closes.
//
// Needs review-timeline.js (updateCaptions, updateTitle, remountPlayer, isRenderMode,
// CAPTION_DEFAULTS) and the shared `state`, `$`, `current`.

// Mirrors CAPTION_FONTS in src/caption-fonts.ts; the @font-face rules are in review-panel.css.
const TS_FONTS = {
  "be-vietnam": { family: "SceneStudio Be Vietnam Pro", weight: 800 },
  montserrat: { family: "SceneStudio Montserrat", weight: 800 },
  anton: { family: "SceneStudio Anton", weight: 400 },
  bangers: { family: "SceneStudio Bangers", weight: 400 },
  playfair: { family: "SceneStudio Playfair Display", weight: 900 },
  charm: { family: "SceneStudio Charm", weight: 700 },
  lobster: { family: "SceneStudio Lobster", weight: 400 },
  arial: { family: "Arial, sans-serif", weight: 800 },
};

// Mirrors DEFAULT_BRANDING.title (scripts/lib/branding.mjs); `enabled` is a switch, not a look.
const TITLE_DEFAULTS = {
  font: "be-vietnam",
  size: 52,
  color: "#ffffff",
  strokeWidth: 0,
  strokeColor: "#000000",
  backgroundOpacity: 0,
  uppercase: false,
  shadow: true,
  scrim: true,
  position: "top",
  offsetY: 0,
};

// Bounds of the size slider per layer (CAPTION_SIZE_RANGE / TITLE_SIZE_RANGE in branding.mjs).
const TS_SIZE_RANGE = {
  captions: { min: 28, max: 72 },
  title: { min: 28, max: 120 },
};

// Ready-made looks. A preset sets the look only (font, colours, outline, backdrop, case, shadow):
// never the size or the position, which the user has usually tuned already. `captions` and
// `title` differ because a subtitle wants a backdrop and a thick outline, a headline often not.
const tsPreset = (id, label, shared, captions, title) => ({
  id,
  label,
  captions: { ...shared, ...captions },
  title: { ...shared, ...title },
});

const TS_PRESETS = [
  tsPreset(
    "default",
    "Mặc định",
    { font: "be-vietnam", uppercase: false },
    {
      strokeWidth: 7,
      strokeColor: "#000000",
      backgroundOpacity: 0.42,
      spokenColor: "#f6c85f",
      unspokenColor: "#ffffff",
    },
    {
      color: "#ffffff",
      strokeWidth: 0,
      strokeColor: "#000000",
      backgroundOpacity: 0,
      shadow: true,
    },
  ),
  tsPreset(
    "gold",
    "Vàng điện ảnh",
    { font: "playfair", uppercase: false },
    {
      strokeWidth: 5,
      strokeColor: "#1d1307",
      backgroundOpacity: 0.25,
      spokenColor: "#f6c85f",
      unspokenColor: "#fff3d6",
    },
    {
      color: "#f6d98b",
      strokeWidth: 3,
      strokeColor: "#1d1307",
      backgroundOpacity: 0,
      shadow: true,
    },
  ),
  tsPreset(
    "impact",
    "YouTube đậm",
    { font: "anton", uppercase: true },
    {
      strokeWidth: 9,
      strokeColor: "#000000",
      backgroundOpacity: 0,
      spokenColor: "#ffd31a",
      unspokenColor: "#ffffff",
    },
    {
      color: "#ffd31a",
      strokeWidth: 8,
      strokeColor: "#000000",
      backgroundOpacity: 0,
      shadow: true,
    },
  ),
  tsPreset(
    "calligraphy",
    "Thư pháp",
    { font: "charm", uppercase: false },
    {
      strokeWidth: 5,
      strokeColor: "#2a1608",
      backgroundOpacity: 0,
      spokenColor: "#ffd27a",
      unspokenColor: "#fff1cf",
    },
    {
      color: "#fff1cf",
      strokeWidth: 4,
      strokeColor: "#2a1608",
      backgroundOpacity: 0,
      shadow: true,
    },
  ),
  tsPreset(
    "news",
    "Bản tin",
    { font: "montserrat", uppercase: true },
    {
      strokeWidth: 0,
      strokeColor: "#000000",
      backgroundOpacity: 0.7,
      spokenColor: "#ffd31a",
      unspokenColor: "#ffffff",
    },
    {
      color: "#ffffff",
      strokeWidth: 0,
      strokeColor: "#000000",
      backgroundOpacity: 0.7,
      shadow: false,
    },
  ),
  tsPreset(
    "comic",
    "Truyện tranh",
    { font: "bangers", uppercase: false },
    {
      strokeWidth: 8,
      strokeColor: "#1a1a1a",
      backgroundOpacity: 0,
      spokenColor: "#ff5a3c",
      unspokenColor: "#ffffff",
    },
    {
      color: "#ffffff",
      strokeWidth: 8,
      strokeColor: "#1a1a1a",
      backgroundOpacity: 0,
      shadow: true,
    },
  ),
  tsPreset(
    "minimal",
    "Tối giản",
    { font: "be-vietnam", uppercase: false },
    {
      strokeWidth: 0,
      strokeColor: "#000000",
      backgroundOpacity: 0,
      spokenColor: "#7fe3d4",
      unspokenColor: "#ffffff",
    },
    {
      color: "#ffffff",
      strokeWidth: 0,
      strokeColor: "#000000",
      backgroundOpacity: 0,
      shadow: true,
    },
  ),
  tsPreset(
    "lacquer",
    "Đỏ sơn mài",
    { font: "playfair", uppercase: true },
    {
      strokeWidth: 6,
      strokeColor: "#5a0d08",
      backgroundOpacity: 0.2,
      spokenColor: "#ffd9a0",
      unspokenColor: "#ffffff",
    },
    {
      color: "#ffd9a0",
      strokeWidth: 6,
      strokeColor: "#8b1a12",
      backgroundOpacity: 0,
      shadow: true,
    },
  ),
];

// What each layer is called, how it saves, and what it shows when there is nothing real to show.
const TS_TARGETS = {
  captions: {
    label: "Phụ đề",
    enableLabel: "Hiện phụ đề trên video",
    sample: "Lời dẫn chạy theo nhịp đọc của giọng",
    defaults: () => CAPTION_DEFAULTS,
    update: (patch) => updateCaptions(patch),
  },
  title: {
    label: "Tiêu đề scene",
    enableLabel: "Hiện tiêu đề scene trên video",
    sample: "Tiêu đề scene",
    defaults: () => TITLE_DEFAULTS,
    update: (patch) => updateTitle(patch),
  },
};

// Where each layer sits in the preview, as fractions of the stage (the Remotion layout in
// src/CaptionTrack.tsx and src/ScenePlanVideo.tsx, which this only approximates). `unit` turns a
// 1080-wide delivery pixel into a share of the stage width, as deliveryBand() does for the render.
const TS_GEOMETRY = {
  vertical: {
    unit: 1 / 1080,
    scrim: 340 / 1920,
    title: { top: 260 / 1920, bottom: 480 / 1920, side: 110 / 1080 },
    captions: {
      top: 200 / 1920,
      bottom: 480 / 1920,
      left: 60 / 1080,
      right: 190 / 1080,
    },
  },
  wide: {
    // 16:9 master: the 3:2 strip the 9:16 export keeps is 1620 of the 1920 px.
    unit: 1 / 1280,
    scrim: 162 / 1080,
    title: { top: 97 / 1080, bottom: 36 / 1080, side: 315 / 1920 },
    captions: {
      top: 36 / 1080,
      bottom: 36 / 1080,
      leftCrop: 240 / 1920,
      leftFrame: 90 / 1920,
    },
  },
};
const TS_JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" };
const TS_SPOKEN_PREVIEW_WORDS = 3;
const TS_OUTLINE_ALPHA = 0.78;

const ts = { target: null, trigger: null };

const tsStyle = () => (ts.target ? state.branding?.[ts.target] : null);
const tsIsOpen = () => !$("tsOverlay").hidden;

function tsRgba(hex, alpha) {
  const channel = (i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgba(${channel(0)},${channel(1)},${channel(2)},${alpha})`;
}

// A preset is "on" while every field it sets still has its value.
const tsPresetActive = (preset, style) =>
  Object.entries(preset[ts.target]).every(([key, value]) => style[key] === value);

function renderTsPresets(style) {
  $("tsPresets").innerHTML = TS_PRESETS.map((preset) => {
    const look = preset[ts.target];
    const color = look.color ?? look.spokenColor;
    const font = TS_FONTS[look.font];
    const outline = Math.min(look.strokeWidth / 3, 2.5);
    const sample = look.uppercase ? "AA" : "Aa";
    return `<button type="button" class="ts-preset" data-preset="${preset.id}" aria-pressed="${tsPresetActive(preset, style)}">
      <span class="ts-preset-sample" style="font-family:'${font.family}', Arial, sans-serif;font-weight:${font.weight};color:${color};-webkit-text-stroke:${outline}px ${look.strokeColor};paint-order:stroke fill;background:rgba(0,0,0,${0.35 + look.backgroundOpacity * 0.6})">${sample}</span>
      <span class="ts-preset-label">${preset.label}</span>
    </button>`;
  }).join("");
}

// Fill every control from the layer's style. Skips the control being dragged so a slider does not
// jump under the pointer while its own "input" events save.
function syncTextStyleDialog() {
  if (!tsIsOpen()) return;
  const style = tsStyle();
  if (!style) return;
  const target = TS_TARGETS[ts.target];
  $("tsTitle").textContent = `Kiểu chữ · ${target.label}`;
  $("tsEnableLabel").textContent = target.enableLabel;
  for (const el of $("tsOverlay").querySelectorAll("[data-ts-for]"))
    el.hidden = el.dataset.tsFor !== ts.target;
  const range = TS_SIZE_RANGE[ts.target];
  $("tsSize").min = range.min;
  $("tsSize").max = range.max;
  for (const el of $("tsControls").querySelectorAll("[data-ts]")) {
    const key = el.dataset.ts;
    if (el === document.activeElement && el.type === "range") continue;
    if (el.type === "checkbox") el.checked = Boolean(style[key]);
    else if (el.type === "range")
      el.value = style[key] * Number(el.dataset.tsScale ?? 1);
    else el.value = style[key];
  }
  for (const out of $("tsOverlay").querySelectorAll("[data-ts-out]")) {
    const key = out.dataset.tsOut;
    out.textContent =
      key === "backgroundOpacity"
        ? `${Math.round(style[key] * 100)}%`
        : `${style[key]}px`;
  }
  for (const seg of $("tsOverlay").querySelectorAll("[data-ts-seg]"))
    for (const btn of seg.querySelectorAll("button"))
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset.value === style[seg.dataset.tsSeg]),
      );
  $("tsAnchorField").hidden =
    ts.target !== "captions" || state.project?.aspect !== "16:9";
  renderTsPresets(style);
  renderTsPreview(style);
}

function renderTsPreview(style) {
  const stage = $("tsStage");
  const wide = state.project?.aspect === "16:9";
  const geometry = wide ? TS_GEOMETRY.wide : TS_GEOMETRY.vertical;
  stage.style.setProperty("--ts-aspect", wide ? "16 / 9" : "9 / 16");
  const scene = current();
  const img = $("tsStageImg");
  img.hidden = !scene?.hasImage;
  if (scene?.hasImage && img.getAttribute("src") !== scene.imageUrl)
    img.src = scene.imageUrl;
  const unit = stage.clientWidth * geometry.unit;
  const px = (n) => `${Math.round(n * unit * 10) / 10}px`;
  const percent = (fraction) => `${fraction * 100}%`;

  const titleStyle = state.branding?.title;
  $("tsScrim").style.height = percent(geometry.scrim);
  $("tsScrim").hidden = titleStyle?.scrim === false;

  const layer = $("tsLayer");
  const text = $("tsText");
  const box =
    ts.target === "title"
      ? {
          top: geometry.title.top,
          bottom: geometry.title.bottom,
          left: geometry.title.side,
          right: geometry.title.side,
        }
      : {
          top: geometry.captions.top,
          bottom: geometry.captions.bottom,
          left:
            geometry.captions.left ??
            (style.anchor === "frame"
              ? geometry.captions.leftFrame
              : geometry.captions.leftCrop),
          right:
            geometry.captions.right ??
            (style.anchor === "frame"
              ? geometry.captions.leftFrame
              : geometry.captions.leftCrop),
        };
  Object.assign(layer.style, {
    top: percent(box.top),
    bottom: percent(box.bottom),
    left: percent(box.left),
    right: percent(box.right),
    alignItems: TS_JUSTIFY[style.position],
    transform: `translateY(${px(style.offsetY)})`,
  });

  const font = TS_FONTS[style.font] ?? TS_FONTS["be-vietnam"];
  const hasBackdrop = style.backgroundOpacity > 0;
  const outline =
    style.strokeWidth > 0
      ? `${px(style.strokeWidth)} ${tsRgba(style.strokeColor, TS_OUTLINE_ALPHA)}`
      : "";
  const isTitle = ts.target === "title";
  Object.assign(text.style, {
    fontFamily: `"${font.family}", Arial, sans-serif`,
    fontWeight: font.weight,
    fontSize: px(style.size),
    lineHeight: isTitle ? 1.1 : 1.28,
    webkitTextStroke: outline,
    paintOrder: "stroke fill",
    padding: hasBackdrop ? `${px(10)} ${px(24)}` : "0",
    borderRadius: hasBackdrop ? px(16) : "0",
    background: hasBackdrop ? `rgba(0,0,0,${style.backgroundOpacity})` : "none",
    textShadow: isTitle
      ? style.shadow
        ? `0 ${px(2)} ${px(8)} rgba(0,0,0,.6)`
        : "none"
      : `0 ${px(3)} ${px(10)} rgba(0,0,0,.55)`,
  });
  text.replaceChildren(...tsPreviewWords(style));
}

// The real scene title when it has one, else a sample. Subtitles show the first words as "spoken".
function tsPreviewWords(style) {
  const target = TS_TARGETS[ts.target];
  const raw =
    ts.target === "title" ? current()?.title?.trim() || target.sample : target.sample;
  const cased = style.uppercase ? raw.toLocaleUpperCase("vi") : raw;
  if (ts.target === "title") {
    const span = document.createElement("span");
    span.style.color = style.color;
    span.textContent = cased;
    return [span];
  }
  const spokenCount = style.highlight === "none" ? 0 : TS_SPOKEN_PREVIEW_WORDS;
  return cased.split(/\s+/).flatMap((word, index) => {
    const span = document.createElement("span");
    span.style.color = index < spokenCount ? style.spokenColor : style.unspokenColor;
    span.textContent = word;
    return index === 0 ? [span] : [" ", span];
  });
}

function openTextStyle(target, trigger) {
  ts.target = target;
  ts.trigger = trigger ?? null;
  $("tsOverlay").hidden = false;
  syncTextStyleDialog();
  $("tsDone").focus();
}

function closeTextStyle() {
  if (!tsIsOpen()) return;
  $("tsOverlay").hidden = true;
  ts.target = null;
  // The player was left alone while editing; show the final style once.
  if (isRenderMode()) remountPlayer();
  ts.trigger?.focus();
  ts.trigger = null;
}

function readTsControl(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "range") return Number(el.value) / Number(el.dataset.tsScale ?? 1);
  return el.value;
}

$("tsControls").addEventListener("input", (e) => {
  const el = e.target.closest("[data-ts]");
  if (!el || !ts.target) return;
  TS_TARGETS[ts.target].update({ [el.dataset.ts]: readTsControl(el) });
});

$("tsControls").addEventListener("click", (e) => {
  if (!ts.target) return;
  const seg = e.target.closest("[data-ts-seg] button");
  if (seg) {
    TS_TARGETS[ts.target].update({
      [seg.closest("[data-ts-seg]").dataset.tsSeg]: seg.dataset.value,
    });
    return;
  }
  const preset = e.target.closest("button[data-preset]");
  if (preset)
    TS_TARGETS[ts.target].update(
      TS_PRESETS.find((p) => p.id === preset.dataset.preset)[ts.target],
    );
});

$("tsReset").addEventListener("click", () => {
  if (ts.target) TS_TARGETS[ts.target].update(TS_TARGETS[ts.target].defaults());
});
$("tsClose").addEventListener("click", closeTextStyle);
$("tsDone").addEventListener("click", closeTextStyle);
$("tsOverlay").addEventListener("click", (e) => {
  if (e.target === $("tsOverlay")) closeTextStyle();
});
$("tlCaptionsSettings").addEventListener("click", (e) =>
  openTextStyle("captions", e.currentTarget),
);
$("tlTitleSettings").addEventListener("click", (e) =>
  openTextStyle("title", e.currentTarget),
);

// The preview is sized from the stage width: redraw when the dialog or window is resized.
new ResizeObserver(() => {
  if (tsIsOpen() && tsStyle()) renderTsPreview(tsStyle());
}).observe($("tsStage"));
