// Scene Studio - YouTube thumbnail.
//
// Opened from the topbar "Thumbnail" button. The thumbnail is drawn on a 1280x720 canvas: a
// background (any scene image, or an AI background made here), a darkening shade on the headline
// side, the headline itself, and optionally the channel logo. The headline is drawn by the browser
// (a headline in one of the styles of review-thumbnail-styles.js under a small Be Vietnam Pro
// kicker), so Vietnamese diacritics are always right — image models garble them.
// "Vẽ chữ bằng AI" (/api/thumbnail-lettering) is the opposite, on request: the image model draws the
// headline into the picture. That result already carries its own text, so the canvas headline is
// hidden for it (thIsLettered).
// "Gợi ý bằng AI" (/api/thumbnail-ideas) asks the LLM for headline options, the cast to show and
// an English background prompt; "Sinh nền" (/api/thumbnail-generate, SSE) draws that background
// with the cast's reference images. "Tải PNG" downloads the canvas. The layout is kept per project
// in localStorage.
//
// Uses review-thumbnail-styles.js (loaded first) and the panel globals ($, api, toast, readSse, state, escapeHtml, lsGet, lsSet, charById,
// fillImageModelSelect, confirmRun, costLine, CANCEL_PROVIDER_NOTE) from review-panel.js, which
// loads first.

const TH_STORE = "reviewThumb:";
const TH_W = 1280;
const TH_H = 720;
const TH_MARGIN = 72;
const TH_TEXT_SHARE = 0.54; // of the width, for the headline
const TH_LINE_HEIGHT = 1.12; // room for stacked Vietnamese marks on capitals (Ễ, Ở); a style may ask for more
const TH_MIN_SIZE = 40;
const TH_KICKER_SCALE = 0.3; // kicker size, × headline size
const TH_KICKER_GAP = 0.3; // space under the kicker, × headline size
const TH_RULE = 64; // gold hairline beside the kicker
const TH_LOGO = 64;
const TH_LOGO_TOP = 32;

const th = {
  bg: null, // url of the chosen background
  image: null, // its loaded <img>
  zoom: 1,
  panX: 0.5, // 0 = left edge of the image, 1 = right edge
  panY: 0.5,
  side: "left",
  style: "gold", // id of a TH_STYLES entry
  job: null, // "background" | "lettering" while th.controller is running
  ideas: [],
  chars: [], // cast ids the AI background shows
  backgrounds: [], // AI backgrounds of this project: [{ file, url }]
  controller: null, // the background generation in flight
  logo: null,
  drag: null,
};

const thSlug = () => state.project?.slug ?? "";
// A picture the image model drew the headline into (server: lettered-<stamp>.jpg).
const thIsLettered = () => /\/lettered-\d+\.jpg$/.test(th.bg ?? "");
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Không tải được ảnh ${url}`));
    img.src = url;
  });
}

// ------------------------------------------------------------------ settings (per project)

function thSave() {
  lsSet(
    TH_STORE + thSlug(),
    JSON.stringify({
      text: $("thumbText").value,
      prompt: $("thumbPrompt").value,
      size: $("thumbSize").value,
      color: $("thumbColor").value,
      accent: $("thumbAccent").value,
      style: th.style,
      letterStyle: $("thumbLetterStyle").value,
      letterAuto: $("thumbLetterStyle").dataset.auto !== "false",
      logo: $("thumbLogo").checked,
      bg: th.bg,
      zoom: th.zoom,
      panX: th.panX,
      panY: th.panY,
      side: th.side,
      ideas: th.ideas,
      chars: th.chars,
    }),
  );
}

function thRestore() {
  let saved = {};
  try {
    saved = JSON.parse(lsGet(TH_STORE + thSlug()) ?? "{}") ?? {};
  } catch {
    // a broken entry starts the dialog fresh
  }
  $("thumbText").value = saved.text ?? "";
  $("thumbPrompt").value = saved.prompt ?? "";
  $("thumbSize").value = saved.size ?? 128;
  const style = thStyle(saved.style);
  const gold = thStyle("gold").colors;
  // The first version's defaults (white, lemon yellow) predate the styles: take the gold ones.
  const oldDefaults =
    !saved.style && saved.color === "#ffffff" && saved.accent === "#ffd31a";
  $("thumbColor").value = oldDefaults ? gold.color : (saved.color ?? style.colors.color);
  $("thumbAccent").value = oldDefaults ? gold.accent : (saved.accent ?? style.colors.accent);
  $("thumbLetterStyle").value = saved.letterStyle ?? style.ai;
  $("thumbLetterStyle").dataset.auto = String(saved.letterAuto ?? true);
  $("thumbLogo").checked = saved.logo ?? true;
  Object.assign(th, {
    bg: saved.bg ?? null,
    zoom: saved.zoom ?? 1,
    panX: saved.panX ?? 0.5,
    panY: saved.panY ?? 0.5,
    side: saved.side ?? "left",
    style: style.id,
    ideas: saved.ideas ?? [],
    chars: saved.chars ?? [],
  });
}

// ------------------------------------------------------------------ drawing

function bgRect(img) {
  const scale =
    Math.max(TH_W / img.naturalWidth, TH_H / img.naturalHeight) * th.zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return { x: -(w - TH_W) * th.panX, y: -(h - TH_H) * th.panY, w, h };
}

function drawBackground(ctx) {
  if (!th.image) {
    ctx.fillStyle = "#16181b";
    ctx.fillRect(0, 0, TH_W, TH_H);
    return;
  }
  const { x, y, w, h } = bgRect(th.image);
  ctx.drawImage(th.image, x, y, w, h);
}

// Cinematic grade: a warm dark falloff on the headline side, then a vignette that pulls the eye in.
function drawShade(ctx) {
  const left = th.side === "left";
  const side = ctx.createLinearGradient(left ? 0 : TH_W, 0, left ? TH_W * 0.78 : TH_W * 0.22, 0);
  side.addColorStop(0, "rgba(10, 6, 2, 0.84)");
  side.addColorStop(0.45, "rgba(10, 6, 2, 0.5)");
  side.addColorStop(1, "rgba(10, 6, 2, 0)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, TH_W, TH_H);
  const vignette = ctx.createRadialGradient(TH_W / 2, TH_H / 2, TH_H * 0.42, TH_W / 2, TH_H / 2, TH_W * 0.72);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, TH_W, TH_H);
}

// Several typed lines: the first is the small kicker, the rest the headline. One line reading
// "Kicker - Headline" (or "Kicker: Headline") splits the same way.
function headlineParts() {
  const typed = $("thumbText").value.split("\n").map((l) => l.trim()).filter(Boolean);
  if (typed.length > 1) return { kicker: typed[0], lines: typed.slice(1) };
  const one = typed[0] ?? "";
  const split = one.match(/^(.+?)\s+[-–—]\s+(.+)$/) ?? one.match(/^([^:]{2,40}):\s+(.+)$/);
  return split ? { kicker: split[1], lines: [split[2]] } : { kicker: "", lines: typed };
}

// Word-wrapped rows in the font already set on ctx.
function wrapRows(ctx, lines, maxWidth) {
  const rows = [];
  for (const line of lines) {
    let row = "";
    for (const word of line.split(/\s+/)) {
      const next = row ? `${row} ${word}` : word;
      if (row && ctx.measureText(next).width > maxWidth) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    rows.push(row);
  }
  return rows;
}

const headlineFont = (size) => thStyle(th.style).font(size);
const thLineHeight = () => thStyle(th.style).lineHeight ?? TH_LINE_HEIGHT;
const kickerFont = (size) => `700 ${Math.round(size * TH_KICKER_SCALE)}px ${TH_SANS}`;

// The block at one headline size: its rows and total height.
function layoutHeadline(ctx, size, parts) {
  ctx.font = headlineFont(size);
  const rows = wrapRows(ctx, parts.lines.map((l) => l.toLocaleUpperCase("vi")), TH_W * TH_TEXT_SHARE - TH_MARGIN);
  const kickerHeight = parts.kicker ? size * (TH_KICKER_SCALE * 1.2 + TH_KICKER_GAP) : 0;
  return { size, rows, height: kickerHeight + rows.length * size * thLineHeight() };
}

// The vertical band the block is centred in: below the logo when it shares that side.
function headlineBand() {
  const logoOn = $("thumbLogo").checked && th.logo;
  const top = logoOn ? TH_LOGO_TOP + TH_LOGO + 24 : TH_MARGIN;
  return { top, height: TH_H - TH_MARGIN - top };
}

// The chosen size, shrunk until the block fits the band.
function fitHeadline(ctx, band, parts) {
  for (let size = Number($("thumbSize").value); size > TH_MIN_SIZE; size -= 4) {
    const layout = layoutHeadline(ctx, size, parts);
    if (layout.height <= band.height) return layout;
  }
  return layoutHeadline(ctx, TH_MIN_SIZE, parts);
}

function drawHeadlineRow(ctx, text, x, y, size) {
  thStyle(th.style).drawRow(ctx, text, x, y, size, {
    accent: $("thumbAccent").value,
    left: th.side === "left",
  });
}

// Small spaced capitals with a gold hairline on the outer side.
function drawKicker(ctx, text, x, y, size) {
  const left = th.side === "left";
  const kSize = Math.round(size * TH_KICKER_SCALE);
  ctx.save();
  Object.assign(ctx, { font: kickerFont(size), letterSpacing: `${kSize * 0.28}px`, fillStyle: $("thumbColor").value });
  Object.assign(ctx, { shadowColor: "rgba(0, 0, 0, .75)", shadowBlur: kSize * 0.5 });
  const textX = left ? x + TH_RULE + 18 : x - TH_RULE - 18;
  ctx.fillText(text.toLocaleUpperCase("vi"), textX, y);
  ctx.fillStyle = $("thumbAccent").value;
  ctx.fillRect(left ? x : x - TH_RULE, y + kSize * 0.5 - 1.5, TH_RULE, 3);
  ctx.restore();
}

function drawHeadline(ctx) {
  const parts = headlineParts();
  if (!parts.lines.length && !parts.kicker) return;
  const band = headlineBand();
  const { size, rows, height } = fitHeadline(ctx, band, parts);
  const left = th.side === "left";
  const x = left ? TH_MARGIN : TH_W - TH_MARGIN;
  let y = band.top + (band.height - height) / 2;
  Object.assign(ctx, { textAlign: left ? "left" : "right", textBaseline: "top" });
  if (parts.kicker) {
    drawKicker(ctx, parts.kicker, x, y, size);
    y += size * (TH_KICKER_SCALE * 1.2 + TH_KICKER_GAP);
  }
  ctx.font = headlineFont(size);
  rows.forEach((row, i) => drawHeadlineRow(ctx, row, x, y + i * size * thLineHeight(), size));
}

// Top corner of the headline side: the bottom right is where YouTube shows the duration.
function drawLogo(ctx) {
  if (!$("thumbLogo").checked || !th.logo) return;
  const left = th.side === "left";
  const name = (state.branding?.name ?? "").toLocaleUpperCase("vi");
  ctx.font = `800 30px ${TH_SANS}`;
  const nameWidth = name ? ctx.measureText(name).width + 14 : 0;
  const x = left ? 40 : TH_W - 40 - TH_LOGO - nameWidth;
  ctx.save();
  Object.assign(ctx, { shadowColor: "rgba(0, 0, 0, .6)", shadowBlur: 6 });
  ctx.drawImage(th.logo, x, TH_LOGO_TOP, TH_LOGO, TH_LOGO);
  Object.assign(ctx, {
    fillStyle: "#fff",
    textAlign: "left",
    textBaseline: "middle",
  });
  if (name) ctx.fillText(name, x + TH_LOGO + 14, TH_LOGO_TOP + TH_LOGO / 2);
  ctx.restore();
}

function thDraw() {
  const ctx = $("thumbCanvas").getContext("2d");
  ctx.clearRect(0, 0, TH_W, TH_H);
  drawBackground(ctx);
  if (!thIsLettered()) {
    if ($("thumbText").value.trim()) drawShade(ctx);
    drawHeadline(ctx);
  }
  drawLogo(ctx);
  $("thumbSizeVal").textContent = $("thumbSize").value;
  $("thumbZoomVal").textContent = `${Math.round(th.zoom * 100)}%`;
}

// ------------------------------------------------------------------ controls

function renderThSide() {
  for (const b of $("thumbSide").querySelectorAll("button"))
    b.setAttribute("aria-pressed", String(b.dataset.side === th.side));
}

function renderThIdeas() {
  $("thumbIdeas").innerHTML = th.ideas
    .map(
      (idea) =>
        `<button type="button" class="thumb-idea">${escapeHtml(idea)}</button>`,
    )
    .join("");
}

function renderThCast() {
  const names = th.chars.map((id) => charById(id)?.name ?? id);
  $("thumbCast").textContent = names.length
    ? `Nhân vật trong nền (giữ mặt theo ảnh tham chiếu): ${names.join(", ")}`
    : "Nền không có nhân vật cố định — bấm Gợi ý bằng AI để chọn.";
}

const TH_TILE = { width: 132, height: 52, scale: 2, sample: "SỬ VIỆT" };

function paintThStyleTile(canvas, style) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const backdrop = ctx.createLinearGradient(0, 0, width, height);
  backdrop.addColorStop(0, "#2a2118");
  backdrop.addColorStop(1, "#0e0b08");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);
  const size = Math.round(height * 0.38);
  Object.assign(ctx, { font: style.font(size), textAlign: "left", textBaseline: "top" });
  style.drawRow(ctx, TH_TILE.sample, 14, (height - size) / 2, size, {
    accent: style.colors.accent,
    left: true,
  });
}

function paintThStyleTiles() {
  for (const tile of $("thumbStyles").querySelectorAll(".thumb-style"))
    paintThStyleTile(tile.querySelector("canvas"), thStyle(tile.dataset.style));
}

function renderThStyleTiles() {
  const { width, height, scale } = TH_TILE;
  $("thumbStyles").innerHTML = TH_STYLES.map(
    (style) => `<button type="button" class="thumb-style" data-style="${style.id}" aria-pressed="${style.id === th.style}">
      <canvas width="${width * scale}" height="${height * scale}" aria-hidden="true"></canvas><span>${escapeHtml(style.label)}</span>
    </button>`,
  ).join("");
  paintThStyleTiles();
}

// Picking a style takes its colours and, until the user writes their own, its AI lettering text.
function selectThStyle(id) {
  const style = thStyle(id);
  th.style = style.id;
  $("thumbColor").value = style.colors.color;
  $("thumbAccent").value = style.colors.accent;
  if ($("thumbLetterStyle").dataset.auto !== "false")
    $("thumbLetterStyle").value = style.ai;
  for (const tile of $("thumbStyles").querySelectorAll(".thumb-style"))
    tile.setAttribute("aria-pressed", String(tile.dataset.style === style.id));
  thDraw();
  thSave();
}

const bgItemHtml = (url, label, kind) =>
  `<li><button type="button" class="thumb-bg" data-url="${escapeHtml(url)}" aria-pressed="${url === th.bg}" title="${escapeHtml(label)}">
    <img src="${escapeHtml(url)}" alt="" loading="lazy" /><span class="thumb-bg-tag ${kind}">${escapeHtml(label)}</span>
  </button></li>`;

function renderThBackgrounds() {
  const ai = th.backgrounds.map((b) =>
    bgItemHtml(b.url, b.file.startsWith("lettered-") ? "AI + chữ" : "AI", "ai"),
  );
  const scenes = (state.scenes ?? [])
    .filter((s) => s.imageUrl)
    .map((s) => bgItemHtml(s.imageUrl, `Scene ${s.scene}`, "scene"));
  $("thumbBgs").innerHTML = [...ai, ...scenes].join("");
}

async function selectThBackground(url, { keepFrame = false } = {}) {
  th.bg = url;
  if (!keepFrame) Object.assign(th, { zoom: 1, panX: 0.5, panY: 0.5 });
  $("thumbZoom").value = Math.round(th.zoom * 100);
  for (const b of $("thumbBgs").querySelectorAll(".thumb-bg"))
    b.setAttribute("aria-pressed", String(b.dataset.url === url));
  try {
    th.image = url ? await loadImage(url) : null;
  } catch (e) {
    th.image = null;
    setThNote(e.message, true);
  }
  thDraw();
  thSave();
  if (thIsLettered())
    setThNote("Ảnh này đã có chữ do AI vẽ nên chữ canvas được ẩn. Kiểm tra từng dấu tiếng Việt trước khi dùng.");
}

function setThNote(text, isError = false) {
  $("thumbNote").textContent = text;
  $("thumbNote").classList.toggle("is-error", isError);
}

function setThCancelable(button, running, idleLabel) {
  button.textContent = running ? "Huỷ" : idleLabel;
  button.classList.toggle("is-cancel", running);
}

// While a job runs its own button turns into Cancel and the other AI button is locked.
function setThWorking(text) {
  $("thumbWorking").hidden = text === null;
  if (text !== null) $("thumbWorkingText").textContent = text;
  const job = th.controller ? th.job : null;
  setThCancelable($("thumbGenerate"), job === "background", "Sinh nền");
  setThCancelable($("thumbLetter"), job === "lettering", "Vẽ chữ bằng AI");
  $("thumbGenerate").disabled = job === "lettering";
  $("thumbLetter").disabled = job === "background";
  $("thumbModel").disabled = job !== null;
  $("thumbPrompt").disabled = job !== null;
}

// ------------------------------------------------------------------ AI

async function suggestThumbnail() {
  const button = $("thumbSuggest");
  button.disabled = true;
  setThNote("LLM đang đọc narration và gợi ý…");
  try {
    const { headlines, chars, prompt } = await api("/api/thumbnail-ideas", {});
    Object.assign(th, { ideas: headlines, chars });
    $("thumbPrompt").value = prompt;
    if (!$("thumbText").value.trim()) $("thumbText").value = headlines[0];
    renderThIdeas();
    renderThCast();
    thDraw();
    thSave();
    setThNote("Bấm một gợi ý để thay tiêu đề; dòng phụ được giữ.");
  } catch (e) {
    setThNote(e.message, true);
  } finally {
    button.disabled = false;
  }
}

async function confirmThumbCost(modelId, what) {
  const model = (state.imageModels ?? []).find((m) => m.id === modelId);
  if (model?.price === 0) return true;
  return confirmRun(
    `Sinh 1 ${what} bằng ${model?.label ?? modelId}.\n${costLine(model, 1)}`,
    "Sinh",
  );
}

async function streamThumbJob(path, body, label, controller) {
  let result = null;
  let failure = null;
  try {
    await readSse(
      path,
      body,
      controller.signal,
      (type, data) => {
        if (type === "log") setThWorking(data);
        else if (type === "done") result = data;
        else if (type === "error") failure = data;
      },
      { label },
    );
  } catch (e) {
    if (e.name !== "AbortError") failure = e.message;
  }
  return { result, failure };
}

// One AI image job (a background or a lettered picture): stream it, and on success make the
// result the current background.
async function runThumbJob({ kind, path, body, label, working, done }) {
  const controller = new AbortController();
  th.controller = controller;
  th.job = kind;
  setThWorking(working);
  setThNote("");
  const { result, failure } = await streamThumbJob(path, body, label, controller);
  if (th.controller !== controller) return; // the dialog was closed, which cancelled the run
  th.controller = null;
  th.job = null;
  setThWorking(null);
  if (result) {
    th.backgrounds = [result, ...th.backgrounds];
    renderThBackgrounds();
    await selectThBackground(result.url);
    setThNote(done);
  } else if (controller.signal.aborted)
    setThNote(`Đã huỷ. ${CANCEL_PROVIDER_NOTE}`);
  else setThNote(failure ?? "Kết nối tới server bị ngắt giữa chừng.", true);
}

async function generateThumbBackground() {
  if (!$("thumbPrompt").value.trim()) {
    setThNote("Nhập prompt nền — hoặc bấm Gợi ý bằng AI.", true);
    $("thumbPrompt").focus();
    return;
  }
  const model = $("thumbModel").value;
  if (!model) {
    setThNote("Chưa có model ảnh dùng được — thêm key trong Model.", true);
    return;
  }
  if (!(await confirmThumbCost(model, "nền thumbnail"))) return;
  await runThumbJob({
    kind: "background",
    path: "/api/thumbnail-generate",
    body: {
      model,
      prompt: $("thumbPrompt").value,
      chars: th.chars,
      side: th.side,
    },
    label: "Sinh nền thumbnail",
    working: "Đang gửi yêu cầu…",
    done: "Đã sinh nền mới — kéo ảnh để căn khung.",
  });
}

// The picture as framed on the canvas, without shade, headline or logo: what the model letters.
function thFramedBackgroundJpeg() {
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width: TH_W, height: TH_H });
  drawBackground(canvas.getContext("2d"));
  return canvas.toDataURL("image/jpeg", 0.92);
}

// Capitals, like the canvas headline, so the model copies exactly what the preview shows.
function thLetteringText() {
  const { kicker, lines } = headlineParts();
  const upper = (text) => text.toLocaleUpperCase("vi");
  return { kicker: upper(kicker), lines: lines.map(upper) };
}

async function letterThumbnailWithAi() {
  const text = thLetteringText();
  const model = $("thumbModel").value;
  const problem =
    (!text.kicker && !text.lines.length && "Nhập chữ cho thumbnail trước.") ||
    (!th.image && "Chọn ảnh nền trước.") ||
    (!model && "Chưa có model ảnh dùng được — thêm key trong Model.");
  if (problem) return setThNote(problem, true);
  if (!(await confirmThumbCost(model, "ảnh thumbnail có chữ AI"))) return;
  await runThumbJob({
    kind: "lettering",
    path: "/api/thumbnail-lettering",
    body: {
      model,
      image: thFramedBackgroundJpeg(),
      ...text,
      styleHint: $("thumbLetterStyle").value,
      side: th.side,
    },
    label: "Vẽ chữ thumbnail",
    working: "Đang gửi ảnh và chữ cho AI…",
    done: "AI đã vẽ chữ. Kiểm tra từng dấu tiếng Việt; chữ canvas được ẩn cho ảnh này, chọn lại nền khác để dùng chữ canvas.",
  });
}

// ------------------------------------------------------------------ open / close / export

async function openThumbDialog() {
  thRestore();
  renderThSide();
  renderThStyleTiles();
  renderThIdeas();
  renderThCast();
  setThNote("");
  if (!th.controller) setThWorking(null);
  $("thumbOverlay").hidden = false;
  th.logo ??= await loadImage("/brand-logo.svg").catch(() => null);
  th.backgrounds = (
    await api("/api/thumbnail-backgrounds").catch(() => ({ items: [] }))
  ).items;
  renderThBackgrounds();
  if (!th.controller) fillImageModelSelect("thumbModel"); // after the awaits: state has loaded by now
  const firstScene =
    (state.scenes ?? []).find((s) => s.imageUrl)?.imageUrl ?? null;
  await selectThBackground(th.bg ?? th.backgrounds[0]?.url ?? firstScene, {
    keepFrame: Boolean(th.bg),
  });
  // The canvas drew with a fallback face if a headline font was still loading.
  Promise.all([thLoadFonts(), document.fonts.load(kickerFont(100), "Ấ")]).then(
    () => {
      thDraw();
      paintThStyleTiles();
    },
    () => {},
  );
}

// Called from the panel's Escape handler too. Closing stops a background in progress.
function closeThumbDialog() {
  if (th.controller) {
    th.controller.abort();
    th.controller = null;
    toast(`Đã huỷ sinh nền thumbnail. ${CANCEL_PROVIDER_NOTE}`, false);
  }
  $("thumbOverlay").hidden = true;
}

function downloadThumbnail() {
  $("thumbCanvas").toBlob((blob) => {
    if (!blob) return setThNote("Không xuất được PNG.", true);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${thSlug() || "video"}-thumbnail.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Đã tải thumbnail PNG.");
  }, "image/png");
}

// Dragging the preview pans the background inside the frame (only along an axis with overflow).
function startThDrag(e) {
  if (!th.image) return;
  th.drag = { x: e.clientX, y: e.clientY };
  $("thumbCanvas").setPointerCapture(e.pointerId);
}

function moveThDrag(e) {
  if (!th.drag) return;
  const { w, h } = bgRect(th.image);
  const scale = TH_W / $("thumbCanvas").clientWidth;
  if (w > TH_W)
    th.panX = clamp01(th.panX - ((e.clientX - th.drag.x) * scale) / (w - TH_W));
  if (h > TH_H)
    th.panY = clamp01(th.panY - ((e.clientY - th.drag.y) * scale) / (h - TH_H));
  th.drag = { x: e.clientX, y: e.clientY };
  thDraw();
}

function endThDrag() {
  if (!th.drag) return;
  th.drag = null;
  thSave();
}

$("btnThumb").addEventListener("click", openThumbDialog);
$("thumbClose").addEventListener("click", closeThumbDialog);
$("thumbOverlay").addEventListener("click", (e) => {
  if (e.target === $("thumbOverlay")) closeThumbDialog();
});
$("thumbLetterStyle").addEventListener("input", (e) => {
  e.target.dataset.auto = "false";
  thSave();
});
$("thumbStyles").addEventListener("click", (e) => {
  const tile = e.target.closest(".thumb-style");
  if (tile) selectThStyle(tile.dataset.style);
});
for (const id of [
  "thumbText",
  "thumbSize",
  "thumbColor",
  "thumbAccent",
  "thumbLogo",
  "thumbPrompt",
])
  $(id).addEventListener("input", () => {
    thDraw();
    thSave();
  });
$("thumbZoom").addEventListener("input", (e) => {
  th.zoom = Number(e.target.value) / 100;
  thDraw();
  thSave();
});
$("thumbSide").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-side]");
  if (!button) return;
  th.side = button.dataset.side;
  renderThSide();
  thDraw();
  thSave();
});
$("thumbIdeas").addEventListener("click", (e) => {
  const button = e.target.closest(".thumb-idea");
  if (!button) return;
  const { kicker } = headlineParts();
  $("thumbText").value = kicker ? `${kicker}\n${button.textContent}` : button.textContent;
  thDraw();
  thSave();
});
$("thumbBgs").addEventListener("click", (e) => {
  const button = e.target.closest(".thumb-bg");
  if (button) selectThBackground(button.dataset.url);
});
$("thumbSuggest").addEventListener("click", suggestThumbnail);
$("thumbGenerate").addEventListener("click", () =>
  th.controller ? th.controller.abort() : generateThumbBackground(),
);
$("thumbLetter").addEventListener("click", () =>
  th.controller ? th.controller.abort() : letterThumbnailWithAi(),
);
$("thumbDownload").addEventListener("click", downloadThumbnail);
$("thumbCanvas").addEventListener("pointerdown", startThDrag);
$("thumbCanvas").addEventListener("pointermove", moveThDrag);
$("thumbCanvas").addEventListener("pointerup", endThDrag);
$("thumbCanvas").addEventListener("pointercancel", endThDrag);
