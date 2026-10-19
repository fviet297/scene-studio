// Scene Studio - review workbench behaviour.
//
// Shape of this file:
//   state + helpers → render (rail, stage, inspector, sheet) → actions → wiring.
//
// Two rules worth keeping:
//   1. Inspector listeners are wired once and only their values are synced, so a
//      refresh in the middle of typing never rebuilds the field under the cursor.
//   2. Unsaved edits live in `drafts` and survive a refresh; they are cleared
//      only when the server confirms the save.

const $ = (id) => document.getElementById(id);

const api = async (path, body) => {
  const res = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
};

const escapeHtml = (str) =>
  String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const ICON_OK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_BAD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>';

const TEMPLATE_FIELDS = [
  "styleDna",
  "masterPrompt",
  "faceLockPrompt",
  "multiCharPrompt",
  "text2img",
  "guard",
];
const STATE_LABEL = {
  "need-image": "needs image",
  "need-audio": "needs audio",
  "need-render": "not rendered",
  done: "done",
};

let state = {
  title: "Scene Studio",
  scenes: [],
  characters: {},
  characterList: [],
  project: null,
  projects: [],
};
let currentScene = null;
let filter = "all";
let view = "stage";
let busy = false;
// Audio runs in its own lane: it writes only .mp3 files (never the manifest that image
// generation touches), so it may run concurrently with the image/motion `busy` lane.
let audioBusy = false;
let templateVersions = [];
// Latest effective templates (incl. the *_vi reading aids) from /api/templates, kept so the
// "Dịch" buttons on template fields can show the stored Vietnamese without any translation call.
let currentTemplates = {};
const selected = new Set();
const drafts = { prompt: new Map(), narr: new Map() };

const sceneStatus = (s) =>
  !s.hasImage
    ? "need-image"
    : !s.hasAudio
      ? "need-audio"
      : !s.hasMotionVideo
        ? "need-render"
        : "done";
const findScene = (n) => state.scenes.find((s) => s.scene === n) ?? null;
const current = () => findScene(currentScene);
const shownScenes = () =>
  state.scenes.filter((s) => filter === "all" || sceneStatus(s) === filter);

// Filled pip = stage finished. Shape, not colour, carries the meaning.
const pips = (s) => {
  const on = [s.hasImage, s.hasAudio, s.hasMotionVideo];
  const label = `image ${s.hasImage ? "done" : "missing"}, audio ${s.hasAudio ? "done" : "missing"}, motion ${s.hasMotionVideo ? "done" : "missing"}`;
  return `<span class="pips" role="img" aria-label="${label}" title="${label}">${on.map((v) => `<span class="pip${v ? " on" : ""}"></span>`).join("")}</span>`;
};

// ------------------------------------------------------------------ render

function render() {
  $("title").textContent = state.title;
  // Preview panes follow the active project's aspect (9:16 vertical / 16:9 landscape) so a
  // generated still or clip is shown at its real shape instead of a fixed vertical box.
  const aspect =
    state.project?.aspect === "16:9"
      ? "16 / 9"
      : state.project?.aspect === "1:1"
        ? "1 / 1"
        : "9 / 16";
  document.documentElement.style.setProperty("--scene-aspect", aspect);
  if (!findScene(currentScene)) currentScene = state.scenes[0]?.scene ?? null;
  renderProjectSwitch();
  renderImageModelSelect();
  renderMotionModelSelect();
  restoreModelSelection();
  updateDurationHint();
  renderCharGallery();
  renderPipeline();
  renderRail();
  renderStage();
  renderSheet();
  syncScriptGenButtons();
}

function renderProjectSwitch() {
  const options = (state.projects || [])
    .map(
      (p) =>
        `<option value="${escapeHtml(p.slug)}"${p.slug === state.project?.slug ? " selected" : ""}>${escapeHtml(p.title)}</option>`,
    )
    .join("");
  $("projectSelect").innerHTML = options;
}

// Built once (same reason as the motion select below): rebuilding on every refresh() would
// reset whatever model the user picked mid-workflow. Empty value = Auto (Grok Imagine default).
// Two selects share the same option list: the sidebar one drives single-scene generate, the
// contact-sheet one drives the batch "Generate images" button — each keeps its own choice.
function renderImageModelSelect() {
  const options = (state.imageModels || [])
    .map(
      (m) =>
        `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`,
    )
    .join("");
  for (const id of ["imageModelSelect", "batchImageModelSelect"]) {
    const select = $(id);
    if (!select.options.length) select.innerHTML = options;
  }
}

// Built once: the model list is static for the session, and rebuilding on every refresh()
// would reset whatever model the user picked mid-workflow.
function renderMotionModelSelect() {
  const options = (state.motionVideoModels || [])
    .map(
      (m) =>
        `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`,
    )
    .join("");
  for (const id of ["motionModelSelect", "batchMotionModelSelect"]) {
    const select = $(id);
    if (!select.options.length) select.innerHTML = options;
  }
}

// A non-empty custom-model field lets any Replicate model id be used without editing the built-in
// list; it overrides the dropdown for that media. Blank falls back to the dropdown selection.
const customModel = (id) => $(id).value.trim();
const effectiveImageModel = () =>
  customModel("imageModelCustom") || $("imageModelSelect").value;
const effectiveMotionModel = () =>
  customModel("motionModelCustom") || $("motionModelSelect").value;

// --- Sticky model selection -------------------------------------------------
// Pick an image/video model once and it applies to every scene: the per-scene panel and the
// contact-sheet batch select stay in sync, and the choice survives a page reload — no re-selecting
// per scene. localStorage keys per media (dropdown + custom-model field).
const MODEL_STORE = {
  image: "reviewImageModel",
  motion: "reviewMotionModel",
  imageCustom: "reviewImageModelCustom",
  motionCustom: "reviewMotionModelCustom",
};
const lsGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled */
  }
};

// Set a select's value only when that option exists, so a remembered model that has left the list
// (e.g. an env-driven vmedia slug removed) leaves the dropdown on its default instead of blanking.
const setModelSelect = (id, value) => {
  const select = $(id);
  if (value != null && [...select.options].some((o) => o.value === value))
    select.value = value;
};

// Restore the saved model into both the per-scene and batch selects (+ custom fields). Runs once,
// after render() has populated the option lists.
let modelSelectionRestored = false;
function restoreModelSelection() {
  if (modelSelectionRestored) return;
  if (
    !$("imageModelSelect").options.length ||
    !$("motionModelSelect").options.length
  )
    return;
  const image = lsGet(MODEL_STORE.image);
  setModelSelect("imageModelSelect", image);
  setModelSelect("batchImageModelSelect", image);
  const motion = lsGet(MODEL_STORE.motion);
  setModelSelect("motionModelSelect", motion);
  setModelSelect("batchMotionModelSelect", motion);
  const imageCustom = lsGet(MODEL_STORE.imageCustom);
  if (imageCustom) $("imageModelCustom").value = imageCustom;
  const motionCustom = lsGet(MODEL_STORE.motionCustom);
  if (motionCustom) $("motionModelCustom").value = motionCustom;
  modelSelectionRestored = true;
  updatePromptCount();
  updateDurationHint();
}

// Show the selected motion model's allowed clip lengths under the duration box, so a value the
// model would snap (e.g. 6 → 10 on wan's 5/10-only steps) is obvious before generating. A custom
// model isn't in the known list, so its durations are unknown and the server snaps them.
function updateDurationHint() {
  const id = effectiveMotionModel();
  const m = (state.motionVideoModels || []).find((x) => x.id === id);
  $("motionDurationHint").textContent = m
    ? `${id} accepts ${m.durations}`
    : id
      ? `${id}: custom model, durations snapped on the server`
      : "";
}

// Live full-prompt length: fixed template overhead (from the server) + the scene prompt being
// typed. Seedream rejects prompts over its limit, so the count turns red when it would fail.
function updatePromptCount() {
  const el = $("promptCount");
  const s = current();
  if (!s || s.kind !== "ai") {
    el.textContent = "";
    el.classList.remove("over");
    return;
  }
  const total = (s.promptOverhead ?? 0) + $("promptBox").value.length;
  const seedream = effectiveImageModel().startsWith("bytedance/seedream");
  const limit = state.seedreamPromptLimit ?? 4000;
  el.textContent = seedream ? `${total} / ${limit} chars` : `${total} chars`;
  el.classList.toggle("over", seedream && total > limit);
}

function charById(id) {
  return (state.characterList || []).find((c) => c.id === id) ?? null;
}

function renderCharGallery() {
  const list = state.characterList || [];
  $("charGallery").innerHTML = list
    .map((c) => {
      const thumbs = c.refUrl
        ? `<img class="char-thumb" src="${c.refUrl}" alt="Reference for ${escapeHtml(c.name)}" loading="lazy" title="Reference" />`
        : '<span class="char-thumb blank">?</span>';
      const chips = (c.scenes || [])
        .map(
          (n) =>
            `<button type="button" class="char-chip" data-scene="${n}">#${n}</button>`,
        )
        .join("");
      return `<div class="char-card">
        <div class="char-thumbs">${thumbs}</div>
        <div class="char-meta">
          <span class="char-name">${escapeHtml(c.name)}</span>
          <span class="char-id num">${escapeHtml(c.id)}</span>
          <div class="char-scenes">${chips}</div>
          <div class="char-actions">
            <button type="button" class="char-action" data-action="profile" data-id="${escapeHtml(c.id)}">Profile</button>
            <button type="button" class="char-action" data-action="upload" data-id="${escapeHtml(c.id)}">Upload ref</button>
          </div>
        </div>
      </div>`;
    })
    .join("");

  for (const chip of $("charGallery").querySelectorAll(".char-chip")) {
    chip.addEventListener("click", () =>
      selectScene(Number(chip.dataset.scene)),
    );
  }
}

function syncSetupBlock(s) {
  if (document.activeElement !== $("titleBox"))
    $("titleBox").value = s.title || "";
  if (document.activeElement !== $("cueBox")) $("cueBox").value = s.cue || "";
  const list = state.characterList || [];
  $("charPicker").innerHTML = list
    .map((c) => {
      const checked = (s.characters || []).includes(c.id);
      return `<label class="char-check${checked ? " checked" : ""}">
        <input type="checkbox" data-id="${escapeHtml(c.id)}" ${checked ? "checked" : ""} />
        ${escapeHtml(c.name)}
      </label>`;
    })
    .join("");
  for (const input of $("charPicker").querySelectorAll("input")) {
    input.addEventListener("change", () => saveCharSelection(s.scene));
  }
}

function renderPipeline() {
  const total = state.scenes.length;
  const done = {
    img: state.scenes.filter((s) => s.hasImage).length,
    aud: state.scenes.filter((s) => s.hasAudio).length,
    vid: state.scenes.filter((s) => s.hasMotionVideo).length,
  };
  const set = (bar, val, n) => {
    $(bar).style.width = total ? `${Math.round((n / total) * 100)}%` : "0%";
    $(val).textContent = `${n}/${total}`;
  };
  set("mImg", "vImg", done.img);
  set("mAud", "vAud", done.aud);
  set("mVid", "vVid", done.vid);

  const ai = state.scenes.filter((s) => s.kind === "ai");
  const aiDone = ai.filter((s) => s.hasImage).length;
  $("btnApprove").disabled = busy || !(ai.length > 0 && aiDone === ai.length);
  $("btnRender").disabled =
    busy || !(total > 0 && done.img === total && done.aud === total);

  if (!busy) {
    if (aiDone < ai.length)
      setConsole("idle", `${ai.length - aiDone} image(s) left to generate`);
    else if (done.aud < total)
      setConsole("idle", `${total - done.aud} scene(s) still need audio`);
    else if (done.img === total)
      setConsole("idle", "Images and audio ready. Render when you are.");
  }
}

function renderRail() {
  const list = shownScenes();
  $("railList").innerHTML = list
    .map((s) => {
      const thumb = s.hasImage
        ? `<img class="thumb" src="${s.imageUrl}" alt="" loading="lazy" />`
        : '<span class="thumb blank">?</span>';
      return `<li class="rail-row${selected.has(s.scene) ? " selected" : ""}" data-scene="${s.scene}">
      <input type="checkbox" class="rail-check" data-role="pick" ${selected.has(s.scene) ? "checked" : ""} title="Select scene ${s.scene}" aria-label="Select scene ${s.scene}" />
      <button type="button" class="rail-item" data-scene="${s.scene}" aria-current="${s.scene === currentScene}">
        ${thumb}
        <span class="meta">
          <span class="no num">Scene ${s.scene}</span>
          ${pips(s)}
          <span class="line">${escapeHtml((s.narration || "").slice(0, 70)) || "no narration"}</span>
        </span>
      </button>
    </li>`;
    })
    .join("");

  for (const row of $("railList").querySelectorAll(".rail-row")) {
    const n = Number(row.dataset.scene);
    row
      .querySelector(".rail-item")
      .addEventListener("click", () => selectScene(n));
    row.querySelector('[data-role="pick"]').addEventListener("change", (e) => {
      if (e.target.checked) selected.add(n);
      else selected.delete(n);
      renderSelection();
    });
  }
  if (!list.length)
    $("railList").innerHTML =
      '<li class="line" style="padding:14px;color:var(--faint)">No scene matches this filter.</li>';
  renderSelection();
}

function renderStage() {
  const s = current();
  const canvas = $("canvas");
  canvas.querySelector(".frame")?.remove();

  if (!s) {
    $("canvasEmpty").hidden = false;
    $("canvasEmptyText").textContent =
      "No scenes loaded. Run parse-scene-plan.mjs first.";
    $("stScene").textContent = "Scene";
    for (const id of ["stKind", "stSource", "stState"]) $(id).hidden = true;
    $("inspector").style.opacity = ".4";
    return;
  }
  $("inspector").style.opacity = "1";

  const status = sceneStatus(s);
  $("stScene").textContent = `Scene ${s.scene}`;
  $("stKind").hidden = false;
  $("stKind").textContent = s.kind === "ai" ? "AI" : "SEARCH";
  $("stSource").hidden = s.source !== "upload";
  $("stSource").textContent = "your image";
  $("stState").hidden = false;
  $("stState").textContent = STATE_LABEL[status];
  $("stState").classList.toggle("on", status === "done");
  $("stChars").innerHTML = (s.characters || [])
    .map((id) => {
      const c = charById(id);
      const thumb = c?.refUrl;
      const label = escapeHtml(c?.name || id);
      return `<span class="chip">${thumb ? `<img src="${thumb}" alt="" loading="lazy" />` : ""}${label}</span>`;
    })
    .join("");

  if (s.hasImage) {
    $("canvasEmpty").hidden = true;
    const frame = document.createElement("div");
    frame.className = "frame";
    const img = document.createElement("img");
    img.src = s.imageUrl;
    img.alt = `Scene ${s.scene}: ${(s.narration || "").slice(0, 90)}`;
    frame.appendChild(img);
    if (s.source === "ai") {
      const tag = document.createElement("span");
      tag.className = "authenticity";
      frame.appendChild(tag);
    }
    canvas.prepend(frame);
  } else {
    $("canvasEmpty").hidden = false;
    $("canvasEmptyText").textContent =
      s.kind === "search"
        ? "Search scene. Source it, or drop your own image here."
        : "Not generated yet. Generate from the prompt, or drop an image here.";
  }

  const audio = $("audioPlayer");
  audio.hidden = !s.hasAudio;
  $("audioMissing").hidden = s.hasAudio;
  if (s.hasAudio && audio.getAttribute("src") !== s.audioUrl)
    audio.src = s.audioUrl;
  $("btnAudio").textContent = audioBusy
    ? "Generating audio…"
    : s.hasAudio
      ? "Regenerate audio"
      : "Generate audio";

  $("btnMotionVideo").textContent = s.hasMotionVideo
    ? "Regenerate motion video"
    : "Generate motion video";
  $("btnMotionVideo").disabled = busy || !s.hasImage || !s.hasAudio;
  $("btnMotionVideo").title =
    s.hasImage && s.hasAudio
      ? ""
      : "Needs an image and audio first (video length is matched to the audio)";
  $("btnUploadMotionVideo").textContent = s.hasMotionVideo
    ? "Replace motion video"
    : "Upload replacement video";
  $("btnUploadMotionVideo").disabled = busy;
  const motionPrompt = $("motionPromptBox");
  if (document.activeElement !== motionPrompt)
    motionPrompt.value = s.motionPrompt || "";
  $("motionVideoWrap").hidden = !s.hasMotionVideo;
  if (s.hasMotionVideo) {
    const v = $("motionVideo");
    // Poster = the scene still, so the player takes the clip's 9:16 aspect and fills the pane
    // like the image on the left, instead of collapsing to the browser's default 300x150 box.
    if (s.hasImage) v.poster = s.imageUrl;
    if (v.getAttribute("src") !== s.motionVideoUrl) v.src = s.motionVideoUrl;
  }
  $("btnRemoveMotionVideo").hidden = !s.hasMotionVideo;
  $("btnRemoveMotionVideo").disabled = busy;
  $("btnUndoImage").hidden = !s.hasImageBackup;
  $("btnUndoImage").disabled = busy;
  $("btnUndoMotion").hidden = !s.hasMotionBackup;
  $("btnUndoMotion").disabled = busy;

  setStageState("stageImgState", s.hasImage);
  setStageState("stageAudState", s.hasAudio);
  setStageState("stageMotState", s.hasMotionVideo);

  syncSetupBlock(s);
  syncInspector(s);
}

// Stage-header done pill: shape (filled dot via .on) + word, matching the rail pips.
function setStageState(id, done) {
  const el = $(id);
  el.textContent = done ? "ready" : "pending";
  el.classList.toggle("on", done);
}

function syncInspector(s) {
  const narrDraft = drafts.narr.get(s.scene);
  const narr = $("narrBox");
  if (document.activeElement !== narr)
    narr.value = narrDraft ?? s.narration ?? "";
  markDirty(
    narr,
    $("narrSave"),
    $("narrHint"),
    narr.value.trim() !== (s.narration ?? "").trim(),
  );

  const isAi = s.kind === "ai";
  $("promptBlock").hidden = !isAi;
  $("searchBlock").hidden = isAi;
  if (isAi) {
    const box = $("promptBox");
    const draft = drafts.prompt.get(s.scene);
    if (document.activeElement !== box) box.value = draft ?? s.prompt ?? "";
    markDirty(
      box,
      $("promptSave"),
      $("promptHint"),
      box.value.trim() !== (s.prompt ?? "").trim(),
    );
    $("btnGen").textContent = s.hasImage
      ? "Regenerate image"
      : "Generate image";
    $("btnGen").disabled = busy;
    $("btnGenPrompt").disabled = busy || !(s.narration || "").trim();
  } else {
    $("searchQuery").textContent = s.query || "no query";
  }

  $("btnUpload").textContent = s.hasImage
    ? "Replace with your own image"
    : "Upload your own image";
  $("btnAudio").disabled = audioBusy || !(s.narration || "").trim();
  updatePromptCount();
  showError("");
}

function markDirty(field, saveBtn, hint, dirty) {
  field.classList.toggle("dirty", dirty);
  saveBtn.disabled = !dirty;
  hint.textContent = dirty ? "unsaved" : "";
  hint.classList.toggle("dirty", dirty);
}

function renderSheet() {
  for (const n of [...selected]) if (!findScene(n)) selected.delete(n);

  $("tiles").innerHTML = state.scenes
    .map((s) => {
      const status = sceneStatus(s);
      const imageInner = s.hasImage
        ? `<img src="${s.imageUrl}" alt="Scene ${s.scene}" loading="lazy" />`
        : `<span class="empty">${s.kind === "search" ? "search scene" : "not generated"}</span>`;
      const videoInner = s.hasMotionVideo
        ? `<span class="ready-mark">${ICON_OK}<span>Video ready</span></span>`
        : `<span class="empty">no video yet</span>`;
      return `<div class="tile${selected.has(s.scene) ? " selected" : ""}" data-scene="${s.scene}">
      <div class="tile-head"><span class="tile-no">${s.scene}</span></div>
      <div class="tile-media">
        <button type="button" class="media-pane" data-role="open" title="Open scene ${s.scene} in the workbench">
          ${imageInner}${pips(s)}
        </button>
        <button type="button" class="media-pane video-pane${s.hasMotionVideo ? " ready" : ""}" data-role="open" title="Open scene ${s.scene} in the workbench">
          ${videoInner}
        </button>
      </div>
      <div class="tile-foot">
        <label>
          <input type="checkbox" data-role="pick" ${selected.has(s.scene) ? "checked" : ""} />
          <span class="state">${STATE_LABEL[status]}</span>
        </label>
      </div>
    </div>`;
    })
    .join("");

  for (const tile of $("tiles").querySelectorAll(".tile")) {
    const n = Number(tile.dataset.scene);
    for (const btn of tile.querySelectorAll('[data-role="open"]')) {
      btn.addEventListener("click", () => {
        selectScene(n);
        setView("stage");
      });
    }
    tile.querySelector('[data-role="pick"]').addEventListener("change", (e) => {
      if (e.target.checked) selected.add(n);
      else selected.delete(n);
      tile.classList.toggle("selected", e.target.checked);
      renderSelection();
    });
  }
  renderSelection();
}

// True when the given scene numbers, sorted, form an unbroken run in the plan's current scene
// order — i.e. no other existing scene sits between the lowest and highest of the selection.
// Merging across a gap would silently swallow whatever sits between them, so this gates the
// Merge button the same way the server re-checks it before writing.
function isContiguousSelection(nums) {
  if (nums.length < 2) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  const all = state.scenes.map((s) => s.scene);
  const at = all.indexOf(sorted[0]);
  return at >= 0 && sorted.every((n, i) => all[at + i] === n);
}

// Selection is shared by the rail (workbench) and the contact sheet. This keeps every
// selection-driven control in both places in sync from the one `selected` Set, so a scene
// ticked in the rail also reads as ticked when the sheet is opened, and vice versa.
function renderSelection() {
  const chosen = state.scenes.filter((s) => selected.has(s.scene));
  const hasNarr = (s) => (s.narration || "").trim().length > 0;
  const aiCount = chosen.filter((s) => s.kind === "ai").length;
  // Prompt- and audio-generation both read a scene's narration, so a scene without one
  // isn't actionable — mirror the single-scene btnGenPrompt/btnAudio gates instead of
  // gating on a bare selection count that would enable a no-op batch run.
  const promptEligible = chosen.filter(
    (s) => s.kind === "ai" && hasNarr(s),
  ).length;
  const audioEligible = chosen.filter(hasNarr).length;
  const motionEligibleCount = chosen.filter(
    (s) => s.hasImage && s.hasAudio,
  ).length;

  const info = chosen.length
    ? `<b>${chosen.length}</b> selected: scene ${chosen.map((s) => s.scene).join(", ")}`
    : "Nothing selected";
  $("sheetSelInfo").innerHTML = info;
  $("railSelInfo").innerHTML = info;

  const disPrompt = busy || promptEligible === 0;
  const disImg = busy || aiCount === 0;
  const disAud = audioBusy || audioEligible === 0;
  const disMotion = busy || motionEligibleCount === 0;
  const disMerge = busy || !isContiguousSelection(chosen.map((s) => s.scene));
  $("batchPrompt").disabled = disPrompt;
  $("batchImg").disabled = disImg;
  $("batchAud").disabled = disAud;
  $("batchMotion").disabled = disMotion;
  $("batchMerge").disabled = disMerge;
  $("railBatchPrompt").disabled = disPrompt;
  $("railBatchImg").disabled = disImg;
  $("railBatchAud").disabled = disAud;
  $("railBatchMotion").disabled = disMotion;
  $("railBatchMerge").disabled = disMerge;
  $("railBatch").hidden = chosen.length === 0;

  // Reflect the shared selection back onto the rail rows and the select-all box without a
  // full re-render, so a change from either view (or a select-all helper) shows everywhere.
  for (const row of $("railList").querySelectorAll(".rail-row")) {
    const on = selected.has(Number(row.dataset.scene));
    row.classList.toggle("selected", on);
    const box = row.querySelector('[data-role="pick"]');
    if (box) box.checked = on;
  }
  const shown = shownScenes();
  const allShown =
    shown.length > 0 && shown.every((s) => selected.has(s.scene));
  const selAll = $("railSelectAll");
  selAll.checked = allShown;
  selAll.indeterminate = !allShown && shown.some((s) => selected.has(s.scene));

  for (const tile of $("tiles").querySelectorAll(".tile")) {
    const on = selected.has(Number(tile.dataset.scene));
    tile.classList.toggle("selected", on);
    const box = tile.querySelector('[data-role="pick"]');
    if (box) box.checked = on;
  }
}

// ------------------------------------------------------------------ actions

function selectScene(n) {
  currentScene = n;
  for (const btn of $("railList").querySelectorAll(".rail-item")) {
    btn.setAttribute("aria-current", String(Number(btn.dataset.scene) === n));
  }
  $("motionVideoWrap").hidden = true;
  resetTranslation("promptTrans", "btnTransPrompt");
  resetTranslation("motionTrans", "btnTransMotion");
  renderStage();
  $("railList")
    .querySelector(`[data-scene="${n}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function stepScene(delta) {
  const list = shownScenes();
  const i = list.findIndex((s) => s.scene === currentScene);
  const next = list[Math.min(Math.max(i + delta, 0), list.length - 1)];
  if (next) selectScene(next.scene);
}

function setView(next) {
  view = next;
  document.body.className = `view-${next}`;
  $("viewStage").setAttribute("aria-pressed", String(next === "stage"));
  $("viewSheet").setAttribute("aria-pressed", String(next === "sheet"));
}

function showError(message) {
  $("errBlock").hidden = !message;
  $("errText").innerHTML = message
    ? ICON_BAD + `<span>${escapeHtml(message)}</span>`
    : "";
}

function toast(message, ok = true) {
  const el = document.createElement("div");
  el.className = `toast${ok ? "" : " bad"}`;
  el.innerHTML =
    (ok ? ICON_OK : ICON_BAD) + `<span>${escapeHtml(message)}</span>`;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 200);
  }, 4200);
}

function openLightbox(src, caption = "") {
  $("lightboxImg").src = src;
  $("lightboxCap").textContent = caption;
  $("lightbox").hidden = false;
}
function closeLightbox() {
  $("lightbox").hidden = true;
  $("lightboxImg").removeAttribute("src");
}

function setConsole(kind, message, tail = "") {
  $("conDot").className =
    `dot${kind === "running" ? " running" : kind === "error" ? " error" : ""}`;
  $("conMsg").textContent = message;
  $("conTail").textContent = tail;
}

function setBusy(on, label = "working") {
  busy = on;
  const canvas = $("canvas");
  canvas.querySelector(".working")?.remove();
  if (on) {
    const veil = document.createElement("div");
    veil.className = "working";
    veil.innerHTML = `<span class="spinner"></span><span>${escapeHtml(label)}</span>`;
    canvas.appendChild(veil);
  }
  // btnAudio/batchAud/railBatchAud are intentionally absent: the audio lane is gated by
  // `audioBusy`, not the image/motion `busy` lock, so audio can be started while a job runs.
  // btnScript is also absent: the Full script modal only reads the plan until Save, and its Save
  // and per-scene gen buttons already guard against busy, so it stays openable during a job.
  for (const id of [
    "btnGen",
    "btnGenPrompt",
    "btnUpload",
    "btnUndoImage",
    "btnUndoMotion",
    "btnRemoveMotionVideo",
    "btnRender",
    "railBatchPrompt",
    "railBatchImg",
    "railBatchMotion",
    "btnApprove",
    "batchPrompt",
    "batchImg",
    "batchMotion",
    "projectSelect",
    "btnNewProject",
    "btnAddChar",
  ])
    $(id).disabled = on;
  syncScriptGenButtons();
  if (!on) {
    renderPipeline();
    renderSelection();
    const s = current();
    if (s) {
      syncSetupBlock(s);
      syncInspector(s);
    }
  }
}

async function refresh() {
  state = await api("/api/state");
  render();
}

// Unsaved edits and selection are per-project; carrying them across a switch would silently
// apply scene N's draft narration/prompt to a different project's scene N.
function clearProjectLocalState() {
  drafts.prompt.clear();
  drafts.narr.clear();
  selected.clear();
  currentScene = null;
}

async function switchProject(slug) {
  // Also blocked while audio runs: switching changes the server's active-project paths, which
  // an in-flight audio job would otherwise write into.
  if (busy || audioBusy || !slug || slug === state.project?.slug) {
    renderProjectSwitch();
    return;
  }
  setBusy(true, `switching to ${slug}`);
  try {
    clearProjectLocalState();
    state = await api("/api/project", { slug });
    render();
    toast(`Switched to "${state.project.title}".`);
  } catch (e) {
    toast(e.message, false);
    renderProjectSwitch();
  } finally {
    setBusy(false);
  }
}

// Returns [] when char is valid or omitted, an array of unknown ids, or null on a bad type.
// Mirrors the server's normalizeImportChar so a bad row is caught before Apply.
function unknownCharIds(value, idSet) {
  if (value === undefined || value === null) return [];
  let ids;
  if (Array.isArray(value)) ids = value.map(String);
  else if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "" || v === "none" || v === "both" || v === "all") return [];
    ids = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else return null;
  return ids.filter((id) => !idSet.has(id));
}

// The whole scene plan in the /api/scenes-update import shape: every editable field, so the
// exported JSON round-trips through an external tool and back. char is the id array ([] = none).
function buildExportJson() {
  return JSON.stringify(
    state.scenes.map((s) => ({
      scene: s.scene,
      cue: s.cue ?? "",
      char: s.characters ?? [],
      narration: s.narration ?? "",
      prompt: s.prompt ?? "",
      prompt_vi: s.promptVi ?? "",
      motion: s.motion ?? "",
      motion_vi: s.motionVi ?? "",
    })),
    null,
    2,
  );
}

// Streams an SSE endpoint into the console. Opens the log on failure only, so a
// successful run never covers the scene you were looking at.
// Holds the in-flight streaming job's AbortController so the Cancel button can stop it.
// Aborting closes the SSE fetch; the server sees the connection drop and stops before the next
// scene (the scene already generating on Replicate still finishes and still bills).
let currentJob = null;

async function streamJob(path, body, label, onDone) {
  const log = $("conLog");
  log.textContent = "";
  const controller = new AbortController();
  currentJob = controller;
  $("conCancel").disabled = false;
  $("conCancel").hidden = false;
  setBusy(true, label);
  setConsole("running", label);
  let failed = false;
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop();
      for (const chunk of chunks) {
        const type = (chunk.match(/^event: (.*)$/m) || [])[1];
        const raw = (chunk.match(/^data: (.*)$/m) || [])[1];
        if (!raw) continue;
        const line = JSON.parse(raw);
        log.textContent +=
          (type === "done" ? "✓ " : type === "error" ? "✗ " : "") + line + "\n";
        log.scrollTop = log.scrollHeight;
        if (type === "log") setConsole("running", label, line);
        else if (type === "done") {
          setConsole("idle", line);
          toast(line);
          onDone?.();
        } else if (type === "error") {
          failed = true;
          setConsole("error", line);
          toast(line, false);
        }
      }
    }
  } catch (e) {
    if (e.name === "AbortError") {
      log.textContent +=
        "• Cancelled (current scene still finishes on the server)\n";
      setConsole("idle", "Cancelled");
      toast("Cancelled — the scene already generating still finishes.", false);
    } else {
      failed = true;
      log.textContent += `✗ ${e.message}\n`;
      setConsole("error", e.message);
      toast(e.message, false);
    }
  } finally {
    currentJob = null;
    $("conCancel").hidden = true;
    setBusy(false);
    if (failed) openLog(true);
    await refresh().catch(() => {});
  }
}

// Audio lane, independent of streamJob's image/motion `busy` lock. It never touches the shared
// console, veil or Cancel button, so an audio run and an image/motion run can proceed at once
// without their logs colliding. Progress is shown on the button; the result comes via toast.
// Only one audio job runs at a time (single OmniVoice TTS backend), guarded by `audioBusy`.
async function runAudioJob(path, body) {
  if (audioBusy) return;
  audioBusy = true;
  $("btnAudio").disabled = true;
  $("btnAudio").textContent = "Generating audio…";
  // Lock the whole audio lane the setBusy comment documents (btnAudio/batchAud/railBatchAud);
  // railBatchAud fires the same runAudioJob from the rail, so it must go down with batchAud.
  $("batchAud").disabled = true;
  $("railBatchAud").disabled = true;
  syncScriptGenButtons();
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop();
      for (const chunk of chunks) {
        const type = (chunk.match(/^event: (.*)$/m) || [])[1];
        const raw = (chunk.match(/^data: (.*)$/m) || [])[1];
        if (!raw) continue;
        const line = JSON.parse(raw);
        if (type === "done") toast(line);
        else if (type === "error") toast(line, false);
      }
    }
  } catch (e) {
    toast(e.message, false);
  } finally {
    audioBusy = false;
    await refresh().catch(() => {});
  }
}

function openLog(open) {
  $("console").classList.toggle("open", open);
  $("conToggle").setAttribute("aria-expanded", String(open));
  $("conToggle").textContent = open ? "Hide log" : "Show log";
}

async function saveField(kind, value) {
  const s = current();
  if (!s) return;
  const isPrompt = kind === "prompt";
  const btn = isPrompt ? $("promptSave") : $("narrSave");
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    const res = await api(isPrompt ? "/api/prompt" : "/api/narration", {
      scene: s.scene,
      [kind === "prompt" ? "prompt" : "narration"]: value,
    });
    if (isPrompt) {
      s.prompt = res.prompt;
      drafts.prompt.delete(s.scene);
    } else {
      s.narration = res.narration;
      drafts.narr.delete(s.scene);
    }
    showError("");
    renderRail();
    renderStage();
    toast(`Scene ${s.scene}: ${kind} saved.`);
  } catch (e) {
    showError(e.message);
  } finally {
    btn.textContent = isPrompt ? "Save prompt" : "Save narration";
  }
}

async function generateImage() {
  const s = current();
  if (!s) return;
  const prompt = $("promptBox").value;
  if (!prompt.trim()) {
    showError("Prompt is empty.");
    return;
  }
  if (prompt.trim() !== (s.prompt ?? "").trim())
    await saveField("prompt", prompt);

  const model = effectiveImageModel();
  // Streamed so the Replicate call is logged in the panel console (Show log); streamJob owns
  // busy/console/refresh.
  await streamJob(
    "/api/generate",
    { scene: s.scene, model },
    `Generating image for scene ${s.scene}`,
  );
}

async function generatePromptFromNarration() {
  const s = current();
  if (!s) return;
  if (!(s.narration || "").trim()) {
    showError("Narration is empty — write it first.");
    return;
  }
  setBusy(true, `writing prompt for scene ${s.scene}`);
  setConsole("running", `Writing prompt for scene ${s.scene} from narration`);
  try {
    const res = await api("/api/generate-prompt", { scene: s.scene });
    setConsole("idle", `Scene ${s.scene} prompt written.`);
    toast(
      `Scene ${s.scene}: ${res.motion ? "image + motion prompt" : "prompt"} written from narration.`,
    );
    await refresh();
  } catch (e) {
    showError(e.message);
    setConsole("error", e.message);
    toast(e.message, false);
  } finally {
    setBusy(false);
  }
}

async function uploadImage(file) {
  const s = current();
  if (!s || !file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    showError("Use a PNG, JPEG or WebP image.");
    return;
  }
  setBusy(true, "uploading");
  try {
    const res = await fetch(`/api/upload?scene=${s.scene}`, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    toast(`Scene ${s.scene}: image replaced with your upload.`);
    await refresh();
  } catch (e) {
    showError(e.message);
    toast(e.message, false);
  } finally {
    setBusy(false);
  }
}

async function uploadMotionVideo(file) {
  const s = current();
  if (!s || !file) return;
  const isSupportedVideo =
    /^(video\/mp4|video\/quicktime)$/.test(file.type) ||
    /\.(mp4|mov)$/i.test(file.name);
  if (!isSupportedVideo) {
    showError("Use a vertical MP4 or MOV video.");
    return;
  }
  setBusy(true, "uploading replacement video");
  try {
    const res = await fetch(`/api/upload-motion-video?scene=${s.scene}`, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    toast(`Scene ${s.scene}: replacement video uploaded.`);
    await refresh();
  } catch (e) {
    showError(e.message);
    toast(e.message, false);
  } finally {
    setBusy(false);
  }
}

// Restore the previous scene image or motion video from its one-level `.bak` snapshot.
async function undo(kind) {
  const s = current();
  if (!s) return;
  setBusy(
    true,
    `undoing ${kind === "image" ? "image" : "motion video"} for scene ${s.scene}`,
  );
  try {
    state = await api("/api/undo", { scene: s.scene, kind });
    render();
    toast(
      `Scene ${s.scene}: ${kind === "image" ? "image" : "motion video"} reverted.`,
    );
  } catch (e) {
    toast(e.message, false);
  } finally {
    setBusy(false);
  }
}

async function removeMotionVideo() {
  const s = current();
  if (!s?.hasMotionVideo) return;
  setBusy(true, `removing motion video for scene ${s.scene}`);
  try {
    state = await api("/api/remove-motion-video", { scene: s.scene });
    render();
    toast(`Scene ${s.scene}: using source image.`);
  } catch (e) {
    toast(e.message, false);
  } finally {
    setBusy(false);
  }
}

// Where a "Dịch" button's stored Vietnamese lives: the current scene's promptVi/motionVi, or a
// template field's `<key>_vi`. Authored up front (skills / OpenAI prompt writer) and served in
// state, so no translation service is ever called.
function resolveVi(key) {
  if (key === "scenePrompt") return current()?.promptVi || "";
  if (key === "sceneMotion") return current()?.motionVi || "";
  return currentTemplates[`${key}_vi`] || "";
}

// Read-only Vietnamese reading aid shown beside a prompt/template box; never overwrites the box
// (the model needs the English). btn carries data-vi (source key), data-out (area id), data-label
// (idle text). Toggles the stored translation, or a note when none was authored yet.
function runTranslate(btn) {
  const out = $(btn.dataset.out);
  if (!out) return;
  if (!out.hidden) {
    out.hidden = true;
    out.classList.remove("is-empty");
    btn.textContent = btn.dataset.label || "Dịch";
    return;
  }
  const vi = resolveVi(btn.dataset.vi).trim();
  out.textContent =
    vi || "Chưa có bản dịch — chạy lại skill để sinh bản dịch tiếng Việt.";
  out.classList.toggle("is-empty", !vi);
  out.hidden = false;
  btn.textContent = "Ẩn dịch";
}

function resetTranslation(outId, btnId) {
  const out = $(outId);
  if (out) {
    out.hidden = true;
    out.textContent = "";
    out.classList.remove("is-empty");
  }
  const btn = $(btnId);
  if (btn) btn.textContent = btn.dataset.label || "Dịch";
}

// ------------------------------------------------------------------ templates

async function loadTemplates() {
  const response = await api("/api/templates");
  const t = response.templates || response;
  templateVersions = response.versions || ["default"];
  const versionSelect = $("t_version");
  versionSelect.innerHTML = templateVersions
    .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
    .join("");
  versionSelect.value = response.activeVersion || t.activeVersion || "default";
  currentTemplates = t;
  for (const key of TEMPLATE_FIELDS) $(`t_${key}`).value = t[key] || "";
}

// ------------------------------------------------------------------ wiring

$("railFilter").addEventListener("change", (e) => {
  filter = e.target.value;
  renderRail();
});

for (const btn of [$("viewStage"), $("viewSheet")])
  btn.addEventListener("click", () => setView(btn.dataset.view));

// Image and Motion each edit in a focused popup, opened from their inspector row, so the
// prompt and settings get room to read while the stage image stays visible behind.
function openStageDialog(kind) {
  const s = current();
  if (!s) return;
  if (kind === "img") {
    $("imgDlgScene").textContent = `Scene ${s.scene}`;
    $("imgOverlay").hidden = false;
  } else {
    $("motionDlgScene").textContent = `Scene ${s.scene}`;
    $("motionOverlay").hidden = false;
  }
}
$("btnEditImage").addEventListener("click", () => openStageDialog("img"));
$("btnEditMotion").addEventListener("click", () => openStageDialog("motion"));
$("imgClose").addEventListener("click", () => {
  $("imgOverlay").hidden = true;
});
$("imgOverlay").addEventListener("click", (e) => {
  if (e.target === $("imgOverlay")) $("imgOverlay").hidden = true;
});
$("motionClose").addEventListener("click", () => {
  $("motionOverlay").hidden = true;
});
$("motionOverlay").addEventListener("click", (e) => {
  if (e.target === $("motionOverlay")) $("motionOverlay").hidden = true;
});
$("btnCopySearchQuery").addEventListener("click", async () => {
  const query = $("searchQuery").textContent;
  try {
    await navigator.clipboard.writeText(query);
    toast("Đã copy search query.");
  } catch {
    toast("Clipboard không dùng được.", false);
  }
});

$("narrBox").addEventListener("input", (e) => {
  const s = current();
  if (!s) return;
  drafts.narr.set(s.scene, e.target.value);
  markDirty(
    e.target,
    $("narrSave"),
    $("narrHint"),
    e.target.value.trim() !== (s.narration ?? "").trim(),
  );
});
$("promptBox").addEventListener("input", (e) => {
  const s = current();
  if (!s) return;
  drafts.prompt.set(s.scene, e.target.value);
  markDirty(
    e.target,
    $("promptSave"),
    $("promptHint"),
    e.target.value.trim() !== (s.prompt ?? "").trim(),
  );
  updatePromptCount();
});
// Keep the per-scene and batch image selects on one model and remember it, so a model picked for
// one scene is used by every scene and the batch generate without re-selecting.
for (const [from, to] of [
  ["imageModelSelect", "batchImageModelSelect"],
  ["batchImageModelSelect", "imageModelSelect"],
]) {
  $(from).addEventListener("change", () => {
    $(to).value = $(from).value;
    lsSet(MODEL_STORE.image, $(from).value);
    updatePromptCount();
  });
}
$("imageModelCustom").addEventListener("input", () => {
  lsSet(MODEL_STORE.imageCustom, $("imageModelCustom").value.trim());
  updatePromptCount();
});
$("narrSave").addEventListener("click", () =>
  saveField("narration", $("narrBox").value),
);
$("promptSave").addEventListener("click", () =>
  saveField("prompt", $("promptBox").value),
);
$("btnGen").addEventListener("click", generateImage);
$("btnGenPrompt").addEventListener("click", generatePromptFromNarration);

$("btnUpload").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", (e) => {
  uploadImage(e.target.files[0]);
  e.target.value = "";
});
$("btnUploadMotionVideo").addEventListener("click", () =>
  $("motionVideoInput").click(),
);
$("motionVideoInput").addEventListener("change", (e) => {
  uploadMotionVideo(e.target.files[0]);
  e.target.value = "";
});

const canvas = $("canvas");
for (const ev of ["dragenter", "dragover"])
  canvas.addEventListener(ev, (e) => {
    e.preventDefault();
    canvas.classList.add("dragging");
  });
for (const ev of ["dragleave", "drop"])
  canvas.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "dragleave" && canvas.contains(e.relatedTarget)) return;
    canvas.classList.remove("dragging");
  });
canvas.addEventListener("drop", (e) => uploadImage(e.dataTransfer.files[0]));

$("btnAudio").addEventListener("click", () => {
  const s = current();
  if (s)
    runAudioJob("/api/audio", {
      scene: s.scene,
      prompt: $("motionPromptBox").value.trim(),
    });
});
$("btnMotionVideo").addEventListener("click", async () => {
  const s = current();
  if (!s) return;
  const model = effectiveMotionModel();
  // Empty duration box = auto (server matches the narration audio); a number overrides it.
  const durVal = Number($("motionDurationBox").value);
  // Send the edited motion prompt; empty falls back to the server's narration-built prompt.
  const body = {
    scene: s.scene,
    model,
    prompt: $("motionPromptBox").value.trim(),
  };
  if (Number.isFinite(durVal) && durVal > 0) body.duration = durVal;
  setBusy(true, `Generating motion video for scene ${s.scene}`);
  setConsole(
    "running",
    `Generating motion video for scene ${s.scene} (${model})`,
  );
  try {
    await streamJob(
      "/api/generate-motion-video",
      body,
      `Generating motion video for scene ${s.scene} (${model})`,
    );
  } catch (e) {
    showError(e.message);
    setConsole("error", e.message);
    toast(e.message, false);
  } finally {
    setBusy(false);
  }
});
// Same sticky behaviour for the motion-video model across the per-scene and batch selects.
for (const [from, to] of [
  ["motionModelSelect", "batchMotionModelSelect"],
  ["batchMotionModelSelect", "motionModelSelect"],
]) {
  $(from).addEventListener("change", () => {
    $(to).value = $(from).value;
    lsSet(MODEL_STORE.motion, $(from).value);
    updateDurationHint();
  });
}
$("motionModelCustom").addEventListener("input", () => {
  lsSet(MODEL_STORE.motionCustom, $("motionModelCustom").value.trim());
  updateDurationHint();
});
$("btnUndoImage").addEventListener("click", () => undo("image"));
$("btnUndoMotion").addEventListener("click", () => undo("motion"));
$("btnRemoveMotionVideo").addEventListener("click", removeMotionVideo);
$("btnApprove").addEventListener("click", () =>
  streamJob("/api/approve", null, "Generating narration audio for every scene"),
);
$("btnRender").addEventListener("click", () =>
  streamJob(
    "/api/finalize",
    null,
    "Measuring audio, aligning captions, rendering MP4",
    () => {
      const link = $("linkMp4");
      link.hidden = false;
      link.href = `/video?v=${Date.now()}`;
    },
  ),
);

const pickWhere = (test) => {
  for (const s of state.scenes) if (test(s)) selected.add(s.scene);
  renderSheet();
};
$("selAll").addEventListener("click", () => pickWhere(() => true));
$("selNeedImg").addEventListener("click", () =>
  pickWhere((s) => !s.hasImage && s.kind === "ai"),
);
$("selNeedAud").addEventListener("click", () => pickWhere((s) => !s.hasAudio));
$("selNeedPrompt").addEventListener("click", () =>
  pickWhere((s) => s.kind === "ai" && !(s.prompt || "").trim()),
);
$("selNone").addEventListener("click", () => {
  selected.clear();
  renderSheet();
});

// Rail select-all toggles only the currently shown (filtered) scenes, so "All" respects the
// same list the user is looking at. renderRail rebuilds the rows and re-syncs the batch bar.
$("railSelectAll").addEventListener("change", (e) => {
  const shown = shownScenes();
  for (const s of shown)
    if (e.target.checked) selected.add(s.scene);
    else selected.delete(s.scene);
  renderRail();
});
$("railSelClear").addEventListener("click", () => {
  selected.clear();
  renderRail();
});

// One batch action per stage, shared by the rail bar and the contact-sheet bar. Both read the
// same `selected` Set and the same sticky model selects, so either entry point behaves identically.
const runBatchPrompts = () => {
  const scenes = [...selected].sort((a, b) => a - b);
  streamJob(
    "/api/generate-prompts-batch",
    { scenes },
    `Writing prompts for scene ${scenes.join(", ")}`,
  );
};
const runBatchImages = () => {
  const scenes = [...selected].sort((a, b) => a - b);
  streamJob(
    "/api/generate-batch",
    { scenes, model: $("batchImageModelSelect").value },
    `Generating images for scene ${scenes.join(", ")}`,
  );
};
const runBatchAudio = () => {
  const scenes = [...selected].sort((a, b) => a - b);
  runAudioJob("/api/audio-batch", { scenes });
};
const runBatchMotion = () => {
  const scenes = [...selected].sort((a, b) => a - b);
  const model = $("batchMotionModelSelect").value;
  streamJob(
    "/api/generate-motion-videos-batch",
    { scenes, model },
    `Generating motion videos for scene ${scenes.join(", ")} (${model})`,
  );
};
$("batchPrompt").addEventListener("click", runBatchPrompts);
$("batchImg").addEventListener("click", runBatchImages);
$("batchAud").addEventListener("click", runBatchAudio);
$("batchMotion").addEventListener("click", runBatchMotion);
$("railBatchPrompt").addEventListener("click", runBatchPrompts);
$("railBatchImg").addEventListener("click", runBatchImages);
$("railBatchAud").addEventListener("click", runBatchAudio);
$("railBatchMotion").addEventListener("click", runBatchMotion);

// ---- Merge scenes: combine the given adjacent scenes' narration into one, dropping the
// rest of the selection's fields entirely. The dialog's radio picks which scene's image/prompt/
// motion survives; its narration textarea previews the auto-join and can be hand-edited before
// confirming (a further pass stays open in the inspector's narration box after merging).
// Two entry points feed it a scene list: the sheet/rail batch bar (the `selected` Set) and, per
// row, the Full script modal's "Merge ↓" button (just that row + the next one).
let pendingMergeScenes = [];
function openMergeDialog(scenesArg) {
  const nums = Array.isArray(scenesArg) ? scenesArg : [...selected];
  const chosen = [...state.scenes]
    .filter((s) => nums.includes(s.scene))
    .sort((a, b) => a.scene - b.scene);
  if (chosen.length < 2) return;
  pendingMergeScenes = chosen.map((s) => s.scene);
  $("mergeDlgInfo").textContent =
    `Scene ${chosen.map((s) => s.scene).join(", ")}`;
  $("mergeKeepPicker").innerHTML = chosen
    .map(
      (s, i) => `<label class="char-check${i === 0 ? " checked" : ""}">
        <input type="radio" name="mergeKeep" value="${s.scene}" ${i === 0 ? "checked" : ""} />
        Scene ${s.scene}
      </label>`,
    )
    .join("");
  for (const label of $("mergeKeepPicker").querySelectorAll(".char-check")) {
    label.querySelector("input").addEventListener("change", () => {
      for (const l of $("mergeKeepPicker").querySelectorAll(".char-check"))
        l.classList.toggle("checked", l.querySelector("input").checked);
    });
  }
  $("mergePreviewNarr").value = chosen
    .map((s) => (s.narration || "").trim())
    .filter(Boolean)
    .join(" ");
  $("mergeOverlay").hidden = false;
}
$("batchMerge").addEventListener("click", () => openMergeDialog());
$("railBatchMerge").addEventListener("click", () => openMergeDialog());
$("mergeClose").addEventListener("click", () => {
  $("mergeOverlay").hidden = true;
});
$("mergeOverlay").addEventListener("click", (e) => {
  if (e.target === $("mergeOverlay")) $("mergeOverlay").hidden = true;
});
$("btnMergeConfirm").addEventListener("click", async () => {
  const scenes = pendingMergeScenes;
  if (scenes.length < 2) return;
  const keepInput = $("mergeKeepPicker").querySelector("input:checked");
  const keep = keepInput ? Number(keepInput.value) : scenes[0];
  const narration = $("mergePreviewNarr").value;
  const btn = $("btnMergeConfirm");
  btn.disabled = true;
  btn.textContent = "Merging...";
  try {
    state = await api("/api/merge-scenes", { scenes, keep, narration });
    for (const n of scenes) {
      drafts.narr.delete(n);
      drafts.prompt.delete(n);
    }
    for (const n of scenes) selected.delete(n);
    $("mergeOverlay").hidden = true;
    render();
    selectScene(keep);
    // Full script modal renders its own snapshot on open — refresh it in place too, so a merge
    // triggered from a script row (or from the sheet/rail while it happens to be open) shows up
    // without the user having to close and reopen it.
    if (!$("scriptOverlay").hidden) renderScriptList();
    toast(`Merged scene ${scenes.join(", ")} into scene ${keep}.`);
    // Leave the merged narration selected in the inspector for one more hand pass.
    $("narrBox").focus();
    $("narrBox").select();
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Merge scenes";
  }
});

$("conToggle").addEventListener("click", () =>
  openLog(!$("console").classList.contains("open")),
);
$("conCancel").addEventListener("click", () => {
  $("conCancel").disabled = true;
  currentJob?.abort();
});

$("btnTemplates").addEventListener("click", async () => {
  $("tplOverlay").hidden = false;
  try {
    await loadTemplates();
  } catch (e) {
    toast(e.message, false);
  }
  const first = $("t_styleDna");
  first.focus();
  first.setSelectionRange(0, 0);
  first.scrollTop = 0;
});
$("tplClose").addEventListener("click", () => {
  $("tplOverlay").hidden = true;
});
$("tplOverlay").addEventListener("click", (e) => {
  if (e.target === $("tplOverlay")) $("tplOverlay").hidden = true;
});
$("tplReload").addEventListener("click", () =>
  loadTemplates().catch((e) => toast(e.message, false)),
);
$("t_version").addEventListener("change", async (e) => {
  try {
    const response = await api("/api/templates/activate", {
      version: e.target.value,
    });
    const t = response.templates;
    currentTemplates = t;
    for (const key of TEMPLATE_FIELDS) $(`t_${key}`).value = t[key] || "";
    toast(`Switched to ${e.target.value}.`);
  } catch (err) {
    toast(err.message, false);
  }
});
$("t_activate").addEventListener("click", async () => {
  const version = $("t_newVersion").value.trim();
  if (!version) return toast("Enter version name.", false);
  try {
    const body = { version };
    for (const key of TEMPLATE_FIELDS) body[key] = $(`t_${key}`).value;
    const response = await api("/api/templates", body);
    templateVersions = response.versions;
    await loadTemplates();
    $("t_newVersion").value = "";
    toast(`Created ${version}.`);
  } catch (err) {
    toast(err.message, false);
  }
});
$("tplSave").addEventListener("click", async () => {
  const body = Object.fromEntries(
    TEMPLATE_FIELDS.map((key) => [key, $(`t_${key}`).value]),
  );
  body.version = $("t_version").value || "default";
  $("tplSave").disabled = true;
  try {
    await api("/api/templates", body);
    toast("Templates saved.");
  } catch (e) {
    toast(e.message, false);
  } finally {
    $("tplSave").disabled = false;
  }
});

// Keyboard: scene paging and view switching, ignored while typing.
$("lightbox").addEventListener("click", closeLightbox);

// One handler for every "Dịch" button (image prompt, motion prompt, template fields).
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-translate");
  if (btn) runTranslate(btn);
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!$("lightbox").hidden) {
      closeLightbox();
      return;
    }
    if (!$("imgOverlay").hidden) {
      $("imgOverlay").hidden = true;
      return;
    }
    if (!$("motionOverlay").hidden) {
      $("motionOverlay").hidden = true;
      return;
    }
    if (!$("tplOverlay").hidden) {
      $("tplOverlay").hidden = true;
      return;
    }
    if (!$("scriptOverlay").hidden) {
      $("scriptOverlay").hidden = true;
      return;
    }
    if (!$("npOverlay").hidden) {
      $("npOverlay").hidden = true;
      return;
    }
    if (!$("acOverlay").hidden) {
      $("acOverlay").hidden = true;
      return;
    }
    if (!$("profOverlay").hidden) {
      $("profOverlay").hidden = true;
      return;
    }
    if ($("console").classList.contains("open")) {
      openLog(false);
      return;
    }
  }
  // A stage popup edits one scene; block scene paging while it is open so its fields
  // can't drift to another scene behind the dialog.
  if (!$("imgOverlay").hidden || !$("motionOverlay").hidden) return;
  const t = e.target;
  if (
    t &&
    (t.isContentEditable || /^(textarea|input|select)$/i.test(t.tagName))
  )
    return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    stepScene(1);
  } else if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    stepScene(-1);
  } else if (e.key === "1") setView("stage");
  else if (e.key === "2") setView("sheet");
});

// Cmd/Ctrl+Enter saves the field under the cursor.
for (const box of [$("narrBox"), $("promptBox")]) {
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveField(box === $("promptBox") ? "prompt" : "narration", box.value);
    }
  });
}

// ------------------------------------------------------------------ projects

$("projectSelect").addEventListener("change", (e) =>
  switchProject(e.target.value),
);

$("btnNewProject").addEventListener("click", () => {
  $("npSlug").value = "";
  $("npTitleInput").value = "";
  $("npNote").textContent =
    "Scaffolds from projects/_template and switches to it.";
  $("npOverlay").hidden = false;
  $("npSlug").focus();
});
$("npClose").addEventListener("click", () => {
  $("npOverlay").hidden = true;
});
$("npOverlay").addEventListener("click", (e) => {
  if (e.target === $("npOverlay")) $("npOverlay").hidden = true;
});
$("npCreate").addEventListener("click", async () => {
  const slug = $("npSlug").value.trim();
  const title = $("npTitleInput").value.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    $("npNote").textContent =
      "Slug must be lowercase letters, numbers and hyphens, starting with a letter or number.";
    return;
  }
  $("npCreate").disabled = true;
  try {
    clearProjectLocalState();
    state = await api("/api/project-create", { slug, title });
    render();
    $("npOverlay").hidden = true;
    toast(`Created project "${state.project.title}".`);
  } catch (e) {
    $("npNote").textContent = e.message;
  } finally {
    $("npCreate").disabled = false;
  }
});

// ------------------------------------------------------------------ full-script editor
//
// The whole scene plan in one editable column: per scene the narration, image prompt + its
// Vietnamese translation, and the motion prompt + its translation, plus cue and char. Saving
// sends only the changed fields to /api/scenes-update, which writes them verbatim (no derived-
// field clearing). Copy JSON exports the same shape for an external tool; Import JSON pastes it
// back. The surface is self-contained: it reads committed values from `state`, not inspector drafts.

// The scene's editable text, grouped so the three jobs read apart at a glance: what is spoken
// (Narration), what the image shows (Image prompt EN + its translation), and how it moves (Motion
// prompt EN + its translation). `ph` explains an empty field (an empty motion is auto-built at
// generate time). SCRIPT_FIELDS is the flat view the dirty/patch/commit helpers iterate.
const SCRIPT_GROUPS = [
  {
    title: "Narration",
    tone: "narr",
    fields: [
      {
        key: "narration",
        sub: "",
        rows: 3,
        ph: "Lời thoại đọc cho scene",
        get: (s) => s.narration ?? "",
      },
    ],
  },
  {
    title: "Image prompt",
    tone: "image",
    fields: [
      {
        key: "prompt",
        sub: "EN",
        rows: 4,
        ph: "Action + gesture; trống → Write from narration",
        get: (s) => s.prompt ?? "",
      },
      {
        key: "prompt_vi",
        sub: "Dịch",
        rows: 3,
        ph: "Bản dịch prompt (đọc đối chiếu)",
        get: (s) => s.promptVi ?? "",
      },
    ],
  },
  {
    title: "Motion prompt",
    tone: "motion",
    fields: [
      {
        key: "motion",
        sub: "EN",
        rows: 3,
        ph: "Prompt image-to-video; trống = tự sinh khi generate video",
        get: (s) => s.motion ?? "",
      },
      {
        key: "motion_vi",
        sub: "Dịch",
        rows: 3,
        ph: "Bản dịch motion",
        get: (s) => s.motionVi ?? "",
      },
    ],
  },
];
const SCRIPT_FIELDS = SCRIPT_GROUPS.flatMap((g) => g.fields);
const scriptCue = (s) => s.cue ?? "";
const scriptChar = (s) => (s.characters ?? []).join(", ");

const scriptControls = (row) => [...row.querySelectorAll("[data-field]")];

function scriptCommitted(scene, field) {
  const s = findScene(scene);
  if (!s) return "";
  if (field === "cue") return scriptCue(s);
  if (field === "char") return scriptChar(s);
  return SCRIPT_FIELDS.find((f) => f.key === field)?.get(s) ?? "";
}
const scriptCtrlDirty = (ctrl) =>
  ctrl.value.trim() !==
  scriptCommitted(Number(ctrl.dataset.scene), ctrl.dataset.field).trim();

function updateScriptFoot() {
  const rows = [...$("scriptList").querySelectorAll(".script-row")];
  const words = rows.reduce((n, row) => {
    const v = row.querySelector('[data-field="narration"]').value.trim();
    return n + (v ? v.split(/\s+/).length : 0);
  }, 0);
  const dirty = rows.filter((r) => r.classList.contains("dirty")).length;
  $("scriptNote").textContent = state.scenes.length
    ? `${state.scenes.length} scene · ${words} từ${dirty ? ` · ${dirty} scene đã sửa` : ""}`
    : "No scenes.";
  $("scriptSave").disabled = busy || audioBusy || dirty === 0;
}

// Grow a textarea to fit its content so it never shows an inner scrollbar.
function autoGrowScript(ta) {
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight + 2}px`;
}
const autoGrowScriptAll = () =>
  $("scriptList")
    .querySelectorAll("textarea.script-auto")
    .forEach(autoGrowScript);

const scriptGroupHtml = (s, g) => {
  const fields = g.fields
    .map(
      (f) => `<div class="script-field">
        ${f.sub ? `<label>${f.sub}</label>` : ""}
        <textarea class="prose script-auto" data-scene="${s.scene}" data-field="${f.key}" rows="${f.rows}" spellcheck="false" aria-label="${g.title} ${f.sub} scene ${s.scene}" placeholder="${escapeHtml(f.ph)}">${escapeHtml(f.get(s))}</textarea>
      </div>`,
    )
    .join("");
  return `<div class="script-group script-group--${g.tone}"><span class="script-group-title">${g.title}</span>${fields}</div>`;
};

// Per-scene generate buttons for the script modal. They reuse the batch endpoints with a
// single scene, so they behave exactly like the contact-sheet/rail batch runs (same models,
// same busy locks) — no dependency on the stage's currently-selected scene.
const scriptGenHtml = (s, isLast) =>
  `<div class="script-gen">
    <button type="button" class="btn sm script-gen-btn gen-image" data-gen="image" data-scene="${s.scene}" title="Generate ảnh cho scene này (model theo batch image select)">Image</button>
    <button type="button" class="btn sm script-gen-btn gen-audio" data-gen="audio" data-scene="${s.scene}" title="Generate narration audio cho scene này">Audio</button>
    <button type="button" class="btn sm script-gen-btn gen-motion" data-gen="motion" data-scene="${s.scene}" title="Generate motion video cho scene này (cần có image + audio)">Motion</button>
    ${isLast ? "" : `<button type="button" class="btn sm quiet script-gen-btn" data-merge-next="${s.scene}" title="Gộp scene này với scene kế tiếp">Gộp ↓</button>`}
  </div>`;

function renderScriptList() {
  // Narration shows first; the image + motion prompts stay collapsed so the list reads as a pure
  // script until a scene's toggle opens them.
  $("scriptList").innerHTML = state.scenes
    .map((s, i) => {
      const narration = scriptGroupHtml(s, SCRIPT_GROUPS[0]);
      const details = SCRIPT_GROUPS.slice(1)
        .map((g) => scriptGroupHtml(s, g))
        .join("");
      const isLast = i === state.scenes.length - 1;
      return `<div class="script-row" data-scene="${s.scene}">
        <div class="script-row-head">
          <span class="script-no num">#${s.scene}</span>
          <span class="script-edited">đã sửa</span>
          <button type="button" class="script-toggle" aria-expanded="false" title="Hiện / ẩn image prompt và motion prompt">
            <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
            Prompt &amp; motion
          </button>
          <span class="grow"></span>
          <div class="script-head-field"><label>cue</label><input class="text-input script-cue-input" data-scene="${s.scene}" data-field="cue" value="${escapeHtml(scriptCue(s))}" placeholder="neutral" spellcheck="false" /></div>
          <div class="script-head-field"><label>char</label><input class="text-input script-char-input" data-scene="${s.scene}" data-field="char" value="${escapeHtml(scriptChar(s))}" placeholder="char-a, char-b / none" spellcheck="false" /></div>
          ${scriptGenHtml(s, isLast)}
        </div>
        ${narration}
        <div class="script-details" hidden>${details}</div>
      </div>`;
    })
    .join("");
  autoGrowScriptAll();
  updateScriptBulkButtons();
  syncScriptGenButtons();
  updateScriptFoot();
}

// Per-scene generate buttons follow the same gates as the batch bar: image needs an AI scene,
// audio needs narration, motion needs a rendered image + audio — and each stays locked while
// its lane is busy. A row with unsaved edits is disabled too, since generation reads the saved
// server state, not the edited textarea.
function syncScriptGenButtons() {
  const byScene = new Map(state.scenes.map((s) => [s.scene, s]));
  for (const btn of $("scriptList").querySelectorAll("[data-gen]")) {
    const s = byScene.get(Number(btn.dataset.scene));
    const dirty = btn.closest(".script-row")?.classList.contains("dirty");
    let ok = false;
    if (s && !dirty) {
      if (btn.dataset.gen === "image") ok = !busy && s.kind === "ai";
      else if (btn.dataset.gen === "audio")
        ok = !audioBusy && (s.narration || "").trim().length > 0;
      else if (btn.dataset.gen === "motion")
        ok = !busy && s.hasImage && s.hasAudio;
    }
    btn.disabled = !ok;
  }
  // "Merge ↓" reads both this row's and the next row's saved narration — block it while either
  // has unsaved edits, same reasoning as the generate buttons above.
  for (const btn of $("scriptList").querySelectorAll("[data-merge-next]")) {
    const row = btn.closest(".script-row");
    const next = row?.nextElementSibling;
    const dirty =
      row?.classList.contains("dirty") || next?.classList.contains("dirty");
    btn.disabled = busy || audioBusy || !next || dirty;
  }
}

function runScriptGen(kind, sceneNo) {
  const row = $("scriptList").querySelector(
    `.script-row[data-scene="${sceneNo}"]`,
  );
  if (row?.classList.contains("dirty")) {
    toast("Lưu scene này trước khi generate.", false);
    return;
  }
  const scenes = [sceneNo];
  if (kind === "image")
    streamJob(
      "/api/generate-batch",
      { scenes, model: $("batchImageModelSelect").value },
      `Generating image for scene ${sceneNo}`,
    );
  else if (kind === "audio") runAudioJob("/api/audio-batch", { scenes });
  else if (kind === "motion")
    streamJob(
      "/api/generate-motion-videos-batch",
      { scenes, model: $("batchMotionModelSelect").value },
      `Generating motion video for scene ${sceneNo}`,
    );
}

// Enable each header button only when it has work: Expand while a scene is still closed,
// Collapse while a scene is still open.
function updateScriptBulkButtons() {
  const details = [...$("scriptList").querySelectorAll(".script-details")];
  $("scriptExpandAll").disabled = !details.some((d) => d.hidden);
  $("scriptCollapseAll").disabled = !details.some((d) => !d.hidden);
}
function scriptSetAllExpanded(open) {
  for (const row of $("scriptList").querySelectorAll(".script-row")) {
    row.querySelector(".script-details").hidden = !open;
    row
      .querySelector(".script-toggle")
      .setAttribute("aria-expanded", String(open));
  }
  if (open) autoGrowScriptAll();
  updateScriptBulkButtons();
}

// Sync one control's dirty class, then roll the row's dirty state up from its controls.
function refreshScriptRow(row) {
  let anyDirty = false;
  for (const ctrl of scriptControls(row)) {
    const d = scriptCtrlDirty(ctrl);
    ctrl.classList.toggle("dirty", d);
    if (d) anyDirty = true;
  }
  row.classList.toggle("dirty", anyDirty);
}

// { scene, ...changedFields } patch for one dirty row.
function scriptRowPatch(row) {
  const patch = { scene: Number(row.dataset.scene) };
  for (const ctrl of scriptControls(row)) {
    if (scriptCtrlDirty(ctrl)) patch[ctrl.dataset.field] = ctrl.value;
  }
  return patch;
}

function openScriptImport(open) {
  $("scriptImport").hidden = !open;
  $("scriptImportToggle").setAttribute("aria-expanded", String(open));
}

$("btnScript").addEventListener("click", () => {
  openScriptImport(false);
  // Show first: auto-grow reads scrollHeight, which is 0 while the dialog is display:none.
  $("scriptOverlay").hidden = false;
  renderScriptList();
});
$("scriptClose").addEventListener("click", () => {
  $("scriptOverlay").hidden = true;
});
$("scriptOverlay").addEventListener("click", (e) => {
  if (e.target === $("scriptOverlay")) $("scriptOverlay").hidden = true;
});
$("scriptList").addEventListener("input", (e) => {
  const ctrl = e.target.closest("[data-field]");
  if (!ctrl) return;
  if (ctrl.classList.contains("script-auto")) autoGrowScript(ctrl);
  refreshScriptRow(ctrl.closest(".script-row"));
  syncScriptGenButtons();
  updateScriptFoot();
});
// Reveal a scene's image + motion prompts on demand. Auto-grow runs on expand — a hidden
// textarea measures 0 tall, so its height must be recomputed once it is visible.
$("scriptList").addEventListener("click", (e) => {
  const gen = e.target.closest("[data-gen]");
  if (gen) {
    runScriptGen(gen.dataset.gen, Number(gen.dataset.scene));
    return;
  }
  const mergeBtn = e.target.closest("[data-merge-next]");
  if (mergeBtn) {
    const scene = Number(mergeBtn.dataset.mergeNext);
    const i = state.scenes.findIndex((s) => s.scene === scene);
    const next = state.scenes[i + 1];
    if (next) openMergeDialog([scene, next.scene]);
    return;
  }
  const btn = e.target.closest(".script-toggle");
  if (!btn) return;
  const row = btn.closest(".script-row");
  const details = row.querySelector(".script-details");
  const open = details.hidden;
  details.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  if (open) {
    details.querySelectorAll("textarea.script-auto").forEach(autoGrowScript);
    // Bring the just-opened scene to the top so its prompts are in view straight away.
    row.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  updateScriptBulkButtons();
});
$("scriptExpandAll").addEventListener("click", () =>
  scriptSetAllExpanded(true),
);
$("scriptCollapseAll").addEventListener("click", () =>
  scriptSetAllExpanded(false),
);
$("scriptReload").addEventListener("click", async () => {
  try {
    await refresh();
  } catch (e) {
    toast(e.message, false);
  }
  renderScriptList();
});
$("scriptSave").addEventListener("click", async () => {
  if (busy || audioBusy) {
    toast("A job is running — wait for it to finish.", false);
    return;
  }
  const patches = [
    ...$("scriptList").querySelectorAll(".script-row.dirty"),
  ].map(scriptRowPatch);
  if (!patches.length) return;
  const blank = patches.filter((p) => "narration" in p && !p.narration.trim());
  if (blank.length) {
    toast(
      `Narration trống ở scene ${blank.map((p) => p.scene).join(", ")} — điền trước khi lưu.`,
      false,
    );
    return;
  }
  const btn = $("scriptSave");
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    const res = await api("/api/scenes-update", { scenes: patches });
    toast(
      `Đã lưu ${res.updated.length} scene${res.appended.length ? `, thêm ${res.appended.length}` : ""}.`,
    );
    await refresh();
    renderScriptList();
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.textContent = "Save changed";
    updateScriptFoot();
  }
});

// Copy JSON: the whole plan in the import shape, for editing in an external tool.
$("scriptCopy").addEventListener("click", async () => {
  const json = buildExportJson();
  try {
    await navigator.clipboard.writeText(json);
    toast("Đã copy scene plan JSON.");
  } catch {
    openScriptImport(true);
    $("scriptImportBox").value = json;
    toast("Clipboard không dùng được — đã dán vào ô Import.", false);
  }
});

// Import JSON: paste the same shape back. Toggle → Validate → Apply, in place.
let scriptImportRows = null;
$("scriptImportToggle").addEventListener("click", () => {
  const open = $("scriptImport").hidden;
  openScriptImport(open);
  if (open) $("scriptImportBox").focus();
});
$("scriptImportBox").addEventListener("input", () => {
  scriptImportRows = null;
  $("scriptImportApply").disabled = true;
});
$("scriptImportValidate").addEventListener("click", () => {
  scriptImportRows = null;
  $("scriptImportApply").disabled = true;
  const preview = $("scriptImportPreview");
  preview.hidden = false;
  let parsed;
  try {
    parsed = JSON.parse($("scriptImportBox").value);
  } catch (e) {
    preview.textContent = `JSON lỗi: ${e.message}`;
    return;
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.scenes)
      ? parsed.scenes
      : null;
  if (!rows || !rows.length) {
    preview.textContent = "Cần một mảng {scene, ...} hoặc {scenes:[...]}.";
    return;
  }
  const errors = [];
  const known = new Set(state.scenes.map((s) => s.scene));
  const charIds = new Set((state.characterList || []).map((c) => c.id));
  let update = 0;
  let append = 0;
  rows.forEach((row, i) => {
    if (!row || !Number.isFinite(row.scene) || row.scene < 1) {
      errors.push(`row ${i}: scene phải là số dương`);
      return;
    }
    const isNew = !known.has(row.scene);
    if (isNew && (typeof row.narration !== "string" || !row.narration.trim()))
      errors.push(`row ${i} (scene ${row.scene}): scene mới cần narration`);
    else if (
      "narration" in row &&
      typeof row.narration === "string" &&
      !row.narration.trim()
    )
      errors.push(`row ${i} (scene ${row.scene}): narration không được rỗng`);
    const unknown = unknownCharIds(row.char, charIds);
    if (unknown === null)
      errors.push(
        `row ${i} (scene ${row.scene}): char phải là chuỗi hoặc mảng id`,
      );
    else if (unknown.length)
      errors.push(
        `row ${i} (scene ${row.scene}): char lạ ${unknown.join(", ")}`,
      );
    isNew ? append++ : update++;
  });
  if (errors.length) {
    preview.innerHTML = errors.map((e) => escapeHtml(e)).join("<br />");
    return;
  }
  scriptImportRows = rows;
  preview.textContent = `${rows.length} row: ${update} cập nhật, ${append} thêm mới.`;
  $("scriptImportApply").disabled = false;
});
$("scriptImportApply").addEventListener("click", async () => {
  if (!scriptImportRows) return;
  const btn = $("scriptImportApply");
  btn.disabled = true;
  btn.textContent = "Applying...";
  try {
    const res = await api("/api/scenes-update", { scenes: scriptImportRows });
    toast(
      `Import: ${res.updated.length} cập nhật, ${res.appended.length} thêm.`,
    );
    scriptImportRows = null;
    $("scriptImportBox").value = "";
    $("scriptImportPreview").hidden = true;
    openScriptImport(false);
    await refresh();
    renderScriptList();
  } catch (e) {
    $("scriptImportPreview").hidden = false;
    $("scriptImportPreview").textContent = e.message;
  } finally {
    btn.textContent = "Apply";
    btn.disabled = !scriptImportRows;
  }
});

// ------------------------------------------------------------------ scene setup (title/cue/char)

async function saveSceneField(field, value) {
  const s = current();
  if (!s) return;
  try {
    state = await api("/api/scene-field", { scene: s.scene, field, value });
    render();
  } catch (e) {
    toast(e.message, false);
  }
}

function saveCharSelection(sceneNo) {
  const ids = [...$("charPicker").querySelectorAll("input:checked")].map(
    (i) => i.dataset.id,
  );
  const s = current();
  if (!s || s.scene !== sceneNo) return;
  saveSceneField("char", ids.join(", "));
}

$("titleBox").addEventListener("blur", (e) => {
  const s = current();
  if (s && e.target.value.trim() !== (s.title || ""))
    saveSceneField("title", e.target.value.trim());
});
$("cueBox").addEventListener("blur", (e) => {
  const s = current();
  if (s && e.target.value.trim() !== (s.cue || ""))
    saveSceneField("cue", e.target.value.trim());
});

// ------------------------------------------------------------------ characters

let pendingUploadCharId = null;

async function uploadCharacterFile(id, file) {
  const res = await fetch(
    `/api/character-upload?id=${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer(),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  state = data;
  render();
}

$("btnAddChar").addEventListener("click", () => {
  $("acId").value = "";
  $("acName").value = "";
  $("acFile").value = "";
  $("acNote").textContent =
    "Adds to the ## characters block and creates profile.json.";
  $("acOverlay").hidden = false;
  $("acId").focus();
});
$("acClose").addEventListener("click", () => {
  $("acOverlay").hidden = true;
});
$("acOverlay").addEventListener("click", (e) => {
  if (e.target === $("acOverlay")) $("acOverlay").hidden = true;
});
$("acCreate").addEventListener("click", async () => {
  const id = $("acId").value.trim();
  const name = $("acName").value.trim();
  const file = $("acFile").files[0];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    $("acNote").textContent =
      "Id must be lowercase letters, numbers and hyphens.";
    return;
  }
  if (!name) {
    $("acNote").textContent = "Display name is required.";
    return;
  }
  $("acCreate").disabled = true;
  try {
    state = await api("/api/character-create", { id, name });
    if (file) await uploadCharacterFile(id, file);
    else render();
    $("acOverlay").hidden = true;
    toast(`Added character "${name}".`);
  } catch (e) {
    $("acNote").textContent = e.message;
  } finally {
    $("acCreate").disabled = false;
  }
});

$("charGallery").addEventListener("click", (e) => {
  const thumb = e.target.closest("img.char-thumb");
  if (thumb) {
    openLightbox(thumb.src, thumb.title);
    return;
  }
  const btn = e.target.closest(".char-action");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "profile") {
    openProfile(id);
  } else if (btn.dataset.action === "upload") {
    pendingUploadCharId = id;
    $("charFileInput").click();
  }
});
$("charFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !pendingUploadCharId) return;
  const id = pendingUploadCharId;
  pendingUploadCharId = null;
  setBusy(true, `uploading ${id}`);
  try {
    await uploadCharacterFile(id, file);
    toast(`Updated reference for "${id}".`);
  } catch (err) {
    toast(err.message, false);
  } finally {
    setBusy(false);
  }
});
// ------------------------------------------------------------------ character profile

let profileCharId = null;

async function openProfile(id) {
  try {
    const { profile } = await api(
      `/api/character-profile?id=${encodeURIComponent(id)}`,
    );
    profileCharId = id;
    $("profTitle").textContent = `Profile — ${id}`;
    $("prof_name").value = profile.display_name ?? profile.name ?? "";
    $("prof_aliases").value = (profile.aliases ?? []).join(", ");
    $("prof_country").value = profile.country ?? "";
    $("prof_period").value = profile.period ?? "";
    $("prof_dynasty").value = profile.dynasty ?? "";
    $("prof_role").value = profile.role ?? "";
    $("prof_facts").value = (profile.known_facts ?? []).join("\n");
    $("prof_interp").value = profile.interpretation ?? "";
    $("prof_unknowns").value = (profile.unknowns ?? []).join("\n");
    $("prof_import").value = "";
    $("profNote").textContent =
      "country / period / dynasty / role feed the OpenAI prompt writer.";
    $("profOverlay").hidden = false;
    $("prof_name").focus();
  } catch (e) {
    toast(e.message, false);
  }
}

$("profClose").addEventListener("click", () => {
  $("profOverlay").hidden = true;
});
$("profOverlay").addEventListener("click", (e) => {
  if (e.target === $("profOverlay")) $("profOverlay").hidden = true;
});
// Skeleton profile.json shown when "Chèn mẫu" is clicked, so the expected shape is obvious.
const SAMPLE_PROFILE = {
  display_name: "Tên hiển thị",
  aliases: ["biệt danh 1", "biệt danh 2"],
  country: "Đại Việt",
  period: "early 15th century",
  dynasty: "Later Lê dynasty",
  role: "Founding emperor",
  known_facts: ["dữ kiện lịch sử 1", "dữ kiện lịch sử 2"],
  interpretation: "Diễn giải trang phục/hình ảnh dựa trên reference.",
  unknowns: ["điều chưa xác định"],
};

$("profSample").addEventListener("click", () => {
  $("prof_import").value = JSON.stringify(SAMPLE_PROFILE, null, 2);
  $("profNote").textContent = "Đã chèn mẫu — sửa giá trị rồi bấm Nhập từ JSON.";
});
$("profCopySample").addEventListener("click", async () => {
  const json = JSON.stringify(SAMPLE_PROFILE, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    toast("Đã copy JSON mẫu.");
  } catch {
    $("prof_import").value = json;
    toast("Clipboard không khả dụng — đã dán mẫu vào ô import.", false);
  }
});

// Import a profile.json into the form (does not save; user reviews then hits Save profile).
// character_id / name / reference are ignored — the dialog keeps the current character's id.
$("profImport").addEventListener("click", () => {
  let obj;
  try {
    obj = JSON.parse($("prof_import").value);
  } catch (e) {
    $("profNote").textContent = `JSON không hợp lệ: ${e.message}`;
    return;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    $("profNote").textContent = "Cần một object JSON (profile.json).";
    return;
  }
  const asCsv = (v) =>
    Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
  const asLines = (v) =>
    Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : "";
  if (typeof obj.display_name === "string" || typeof obj.name === "string")
    $("prof_name").value = obj.display_name ?? obj.name;
  if ("aliases" in obj) $("prof_aliases").value = asCsv(obj.aliases);
  if (typeof obj.country === "string") $("prof_country").value = obj.country;
  if (typeof obj.period === "string") $("prof_period").value = obj.period;
  if (typeof obj.dynasty === "string") $("prof_dynasty").value = obj.dynasty;
  if (typeof obj.role === "string") $("prof_role").value = obj.role;
  if ("known_facts" in obj) $("prof_facts").value = asLines(obj.known_facts);
  if (typeof obj.interpretation === "string")
    $("prof_interp").value = obj.interpretation;
  if ("unknowns" in obj) $("prof_unknowns").value = asLines(obj.unknowns);
  $("profNote").textContent =
    "Đã nhập vào form. Kiểm tra rồi bấm Save profile.";
});
$("profSave").addEventListener("click", async () => {
  if (!profileCharId) return;
  // aliases: comma-separated field; known_facts/unknowns: one per line (server splits both).
  const patch = {
    display_name: $("prof_name").value,
    aliases: $("prof_aliases")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    country: $("prof_country").value,
    period: $("prof_period").value,
    dynasty: $("prof_dynasty").value,
    role: $("prof_role").value,
    known_facts: $("prof_facts").value,
    interpretation: $("prof_interp").value,
    unknowns: $("prof_unknowns").value,
  };
  $("profSave").disabled = true;
  try {
    state = await api("/api/character-profile", { id: profileCharId, patch });
    render();
    $("profOverlay").hidden = true;
    toast(`Saved profile for "${profileCharId}".`);
  } catch (e) {
    $("profNote").textContent = e.message;
  } finally {
    $("profSave").disabled = false;
  }
});

setConsole("idle", "Loading scenes...");
refresh().catch((e) => {
  setConsole("error", `Failed to load: ${e.message}`);
  toast(e.message, false);
});
