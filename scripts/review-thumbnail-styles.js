// Scene Studio - YouTube thumbnail headline styles.
//
// A style owns the headline font and how one row of it is painted; review-thumbnail.js owns the
// layout (wrapping, sizing, kicker, shade, logo). Everything is drawn on the canvas by the browser,
// so Vietnamese diacritics are always right. `colors` are the style's defaults for the two pickers
// ("Dòng phụ" → `color`, the kicker; "Tiêu đề" → `accent`, the headline's main colour). `ai` is the
// English lettering description handed to the image model when the user asks it to draw the text.
//
// Loaded before review-thumbnail.js; exposes TH_SERIF, TH_SANS, TH_STYLES, thStyle, thLoadFonts.

// Lining figures by default (years and ages sit at cap height); Playfair's old-style ones can't be
// switched off on a canvas.
const TH_SERIF = '"Noto Serif Display", Georgia, serif';
const TH_SANS = '"Be Vietnam Pro", system-ui, sans-serif';
const TH_CONDENSED = '"Oswald", "Be Vietnam Pro", system-ui, sans-serif';

const TH_DARK_INK = "#1a1208";

// "#rrggbb" blended toward another colour by t (0..1).
function mixHex(hex, toward, t) {
  const channel = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const rgb = [0, 1, 2].map((i) =>
    Math.round(channel(hex, i) + (channel(toward, i) - channel(hex, i)) * t),
  );
  return `rgb(${rgb.join(", ")})`;
}

// Vertical gradient over one row, from a lit top to a shaded foot through the base colour.
function rowGradient(ctx, y, size, stops) {
  const g = ctx.createLinearGradient(0, y, 0, y + size);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

// Polished metal: a bright top, the colour through the middle, a dark band at the horizon of the
// letters, then a lighter foot.
function metalFill(ctx, y, size, base) {
  return rowGradient(ctx, y, size, [
    [0, mixHex(base, "#ffffff", 0.6)],
    [0.42, base],
    [0.56, mixHex(base, "#000000", 0.38)],
    [1, mixHex(base, "#ffffff", 0.3)],
  ]);
}

function dropShadow(ctx, text, x, y, size, { color, blur, offset }) {
  ctx.save();
  Object.assign(ctx, {
    shadowColor: color,
    shadowBlur: size * blur,
    shadowOffsetY: size * offset,
  });
  ctx.fillStyle = "#140c04";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function strokeRow(ctx, text, x, y, color, width) {
  Object.assign(ctx, {
    lineJoin: "round",
    lineWidth: width,
    strokeStyle: color,
  });
  ctx.strokeText(text, x, y);
}

// Text sits this far below the row's top so the marks stacked on Vietnamese capitals (Ấ, Ặ, Ễ)
// stay inside a strip instead of poking out of it, where dark ink would vanish on the picture.
const STRIP_TEXT_DROP = 0.14;
// Row pitch (× size) for stripped styles: wide enough that a row's marks above its strip fall in
// the gap to the strip above, not on top of that strip's letters.
const STRIP_LINE_HEIGHT = 1.3;

// A solid strip behind one row, hugging the text on the side the headline is aligned to.
function drawStrip(ctx, text, x, y, size, { left, color }) {
  const pad = size * 0.16;
  const width = ctx.measureText(text).width + pad * 2;
  ctx.save();
  Object.assign(ctx, {
    shadowColor: "rgba(0, 0, 0, .55)",
    shadowBlur: size * 0.2,
    shadowOffsetY: size * 0.05,
  });
  ctx.fillStyle = color;
  ctx.fillRect(
    left ? x - pad : x + pad - width,
    y - size * 0.04,
    width,
    size * 1.1,
  );
  ctx.restore();
}

const TH_STYLES = [
  {
    id: "gold",
    label: "Vàng cổ điển",
    font: (size) => `900 ${size}px ${TH_SERIF}`,
    colors: { color: "#f6eedc", accent: "#e3b04b" },
    ai: "polished antique-gold metallic serif capitals with a dark outline and a soft shadow",
    drawRow(ctx, text, x, y, size, { accent }) {
      dropShadow(ctx, text, x, y, size, {
        color: "rgba(0, 0, 0, .8)",
        blur: 0.3,
        offset: 0.06,
      });
      strokeRow(ctx, text, x, y, "#1d1307", size * 0.05);
      ctx.fillStyle = metalFill(ctx, y, size, accent);
      ctx.fillText(text, x, y);
    },
  },
  {
    id: "impact",
    label: "YouTube đậm",
    font: (size) => `800 ${size}px ${TH_SANS}`,
    colors: { color: "#ffffff", accent: "#ffd31a" },
    ai: "huge heavy sans-serif capitals in bright yellow with a thick black outline and a hard drop shadow, classic YouTube thumbnail lettering",
    drawRow(ctx, text, x, y, size, { accent }) {
      dropShadow(ctx, text, x, y, size, {
        color: "rgba(0, 0, 0, .7)",
        blur: 0.2,
        offset: 0.06,
      });
      strokeRow(ctx, text, x, y, "#000000", size * 0.16);
      ctx.fillStyle = accent;
      ctx.fillText(text, x, y);
    },
  },
  {
    id: "banner",
    label: "Dải băng rôn",
    font: (size) => `700 ${size}px ${TH_CONDENSED}`,
    lineHeight: STRIP_LINE_HEIGHT,
    colors: { color: "#ffffff", accent: "#c62d24" },
    ai: "bold condensed white capitals, each line sitting on its own solid crimson banner strip, news-headline style",
    drawRow(ctx, text, x, y, size, { accent, left }) {
      drawStrip(ctx, text, x, y, size, { left, color: accent });
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x, y + size * STRIP_TEXT_DROP);
    },
  },
  {
    id: "lacquer",
    label: "Đỏ sơn mài",
    font: (size) => `900 ${size}px ${TH_SERIF}`,
    colors: { color: "#f6eedc", accent: "#c62d24" },
    ai: "deep crimson lacquer-red serif capitals with a thin gold outline and a dark shadow",
    drawRow(ctx, text, x, y, size, { accent }) {
      dropShadow(ctx, text, x, y, size, {
        color: "rgba(0, 0, 0, .8)",
        blur: 0.28,
        offset: 0.06,
      });
      strokeRow(ctx, text, x, y, "#e3b04b", size * 0.075);
      ctx.fillStyle = rowGradient(ctx, y, size, [
        [0, mixHex(accent, "#ffffff", 0.25)],
        [0.5, accent],
        [1, mixHex(accent, "#000000", 0.45)],
      ]);
      ctx.fillText(text, x, y);
    },
  },
  {
    id: "neon",
    label: "Neon",
    font: (size) => `700 ${size}px ${TH_CONDENSED}`,
    colors: { color: "#ffffff", accent: "#38e8ff" },
    ai: "glowing neon-tube capitals with a white-hot core and a strong cyan glow around the letters",
    drawRow(ctx, text, x, y, size, { accent }) {
      ctx.save();
      ctx.fillStyle = accent;
      for (const blur of [0.5, 0.22]) {
        Object.assign(ctx, { shadowColor: accent, shadowBlur: size * blur });
        ctx.fillText(text, x, y);
      }
      ctx.restore();
      strokeRow(ctx, text, x, y, accent, size * 0.025);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x, y);
    },
  },
  {
    id: "paper",
    label: "Giấy dó",
    font: (size) => `900 ${size}px ${TH_SERIF}`,
    lineHeight: STRIP_LINE_HEIGHT,
    colors: { color: "#f6eedc", accent: "#f2eadb" },
    ai: "dark ink serif capitals printed on cream paper strips, one strip per line",
    drawRow(ctx, text, x, y, size, { accent, left }) {
      drawStrip(ctx, text, x, y, size, { left, color: accent });
      ctx.fillStyle = TH_DARK_INK;
      ctx.fillText(text, x, y + size * STRIP_TEXT_DROP);
    },
  },
];

const thStyle = (id) => TH_STYLES.find((s) => s.id === id) ?? TH_STYLES[0];

// The canvas draws with a fallback face if a headline font is still loading: load every style's.
const thLoadFonts = () =>
  Promise.all(TH_STYLES.map((s) => document.fonts.load(s.font(100), "Ấ")));
