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
const selected = new Set();
const drafts = { prompt: new Map(), narr: new Map() };

const sceneStatus = (s) =>
  !s.hasImage
    ? "need-image"
    : !s.hasAudio
      ? "need-audio"
      : !s.hasSceneVideo
        ? "need-render"
        : "done";
const findScene = (n) => state.scenes.find((s) => s.scene === n) ?? null;
const current = () => findScene(currentScene);
const shownScenes = () =>
  state.scenes.filter((s) => filter === "all" || sceneStatus(s) === filter);

// Filled pip = stage finished. Shape, not colour, carries the meaning.
const pips = (s) => {
  const on = [s.hasImage, s.hasAudio, s.hasSceneVideo];
  const label = `image ${s.hasImage ? "done" : "missing"}, audio ${s.hasAudio ? "done" : "missing"}, MP4 ${s.hasSceneVideo ? "done" : "missing"}`;
  return `<span class="pips" role="img" aria-label="${label}" title="${label}">${on.map((v) => `<span class="pip${v ? " on" : ""}"></span>`).join("")}</span>`;
};

// ------------------------------------------------------------------ render

function render() {
  $("title").textContent = state.title;
  if (!findScene(currentScene)) currentScene = state.scenes[0]?.scene ?? null;
  renderProjectSwitch();
  renderMotionModelSelect();
  renderCharGallery();
  renderPipeline();
  renderRail();
  renderStage();
  renderSheet();
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

// Built once: the model list is static for the session, and rebuilding on every refresh()
// would reset whatever model the user picked mid-workflow.
function renderMotionModelSelect() {
  const select = $("motionModelSelect");
  if (select.options.length) return;
  select.innerHTML = (state.motionVideoModels || [])
    .map(
      (m) =>
        `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`,
    )
    .join("");
}

function charById(id) {
  return (state.characterList || []).find((c) => c.id === id) ?? null;
}

function renderCharGallery() {
  const list = state.characterList || [];
  $("charGallery").innerHTML = list
    .map((c) => {
      const thumbs = [
        c.refUrl
          ? `<img class="char-thumb" src="${c.refUrl}" alt="" loading="lazy" title="Reference" />`
          : '<span class="char-thumb blank">?</span>',
        c.puppetUrl
          ? `<img class="char-thumb" src="${c.puppetUrl}" alt="" loading="lazy" title="Puppet (v2)" />`
          : "",
      ].join("");
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
            <button type="button" class="char-action" data-action="upload" data-id="${escapeHtml(c.id)}">Upload ref</button>
            <button type="button" class="char-action" data-action="puppet" data-id="${escapeHtml(c.id)}">Puppet</button>
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
  if (document.activeElement !== $("hostBox"))
    $("hostBox").value = s.host || "";
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
    vid: state.scenes.filter((s) => s.hasSceneVideo).length,
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
      return `<li>
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

  for (const btn of $("railList").querySelectorAll(".rail-item")) {
    btn.addEventListener("click", () => selectScene(Number(btn.dataset.scene)));
  }
  if (!list.length)
    $("railList").innerHTML =
      '<li class="line" style="padding:14px;color:var(--faint)">No scene matches this filter.</li>';
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
      const thumb = c?.puppetUrl || c?.refUrl;
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
      tag.textContent = "AI phục dựng";
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
  $("btnAudio").textContent = s.hasAudio
    ? "Regenerate audio"
    : "Generate audio";

  const videoOpen = s.hasSceneVideo && !$("sceneVideoWrap").hidden;
  $("btnSceneVideo").hidden = !s.hasSceneVideo;
  $("btnSceneVideo").textContent = videoOpen ? "Hide MP4" : "Show MP4";
  if (!s.hasSceneVideo) $("sceneVideoWrap").hidden = true;
  else if (videoOpen) $("sceneVideo").src = s.sceneVideoUrl;
  $("btnRenderScene").textContent = s.hasSceneVideo
    ? "Re-render this scene"
    : "Render this scene";
  $("btnRenderScene").disabled = busy || !(s.hasImage && s.hasAudio);
  $("btnRenderScene").title =
    s.hasImage && s.hasAudio ? "" : "Needs an image and audio first";
  $("btnMotionVideo").textContent = s.hasMotionVideo
    ? "Regenerate motion video"
    : "Generate motion video";
  $("btnMotionVideo").disabled = busy || !s.hasImage || !s.hasAudio;
  $("btnMotionVideo").title =
    s.hasImage && s.hasAudio
      ? ""
      : "Needs an image and audio first (video length is matched to the audio)";
  const motionPrompt = $("motionPromptBox");
  if (document.activeElement !== motionPrompt)
    motionPrompt.value = s.motionPrompt || "";
  $("motionVideoWrap").hidden = !s.hasMotionVideo;
  if (s.hasMotionVideo) $("motionVideo").src = s.motionVideoUrl;

  syncSetupBlock(s);
  syncInspector(s);
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
  $("btnAudio").disabled = busy || !(s.narration || "").trim();
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
      const videoInner = s.hasSceneVideo
        ? `<span class="ready-mark">${ICON_OK}<span>Video ready</span></span>`
        : `<span class="empty">no video yet</span>`;
      return `<div class="tile${selected.has(s.scene) ? " selected" : ""}" data-scene="${s.scene}">
      <div class="tile-head"><span class="tile-no">${s.scene}</span></div>
      <div class="tile-media">
        <button type="button" class="media-pane" data-role="open" title="Open scene ${s.scene} in the workbench">
          ${imageInner}${pips(s)}
        </button>
        <button type="button" class="media-pane video-pane${s.hasSceneVideo ? " ready" : ""}" data-role="open" title="Open scene ${s.scene} in the workbench">
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

function renderSelection() {
  const chosen = state.scenes.filter((s) => selected.has(s.scene));
  const aiCount = chosen.filter((s) => s.kind === "ai").length;
  $("sheetSelInfo").innerHTML = chosen.length
    ? `<b>${chosen.length}</b> selected: scene ${chosen.map((s) => s.scene).join(", ")}`
    : "Nothing selected";
  $("batchPrompt").disabled = busy || aiCount === 0;
  $("batchImg").disabled = busy || aiCount === 0;
  $("batchAud").disabled = busy || chosen.length === 0;
}

// ------------------------------------------------------------------ actions

function selectScene(n) {
  currentScene = n;
  for (const btn of $("railList").querySelectorAll(".rail-item")) {
    btn.setAttribute("aria-current", String(Number(btn.dataset.scene) === n));
  }
  $("sceneVideoWrap").hidden = true;
  $("motionVideoWrap").hidden = true;
  $("btnSceneVideo").textContent = "Show MP4";
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
  for (const id of [
    "btnGen",
    "btnGenPrompt",
    "btnAudio",
    "btnUpload",
    "btnRenderScene",
    "btnRender",
    "btnApprove",
    "batchPrompt",
    "batchImg",
    "batchAud",
    "projectSelect",
    "btnNewProject",
    "btnImport",
    "btnAddChar",
    "btnGenPuppets",
  ])
    $(id).disabled = on;
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
  if (busy || !slug || slug === state.project?.slug) return;
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

function buildExportJson() {
  return JSON.stringify(
    state.scenes.map((s) => ({
      scene: s.scene,
      narration: s.narration,
      // Which character(s) the scene is about: [] = none (text-to-image), one id, or several.
      char: s.characters ?? [],
      prompt: s.prompt || undefined,
    })),
    null,
    2,
  );
}

// Streams an SSE endpoint into the console. Opens the log on failure only, so a
// successful run never covers the scene you were looking at.
async function streamJob(path, body, label, onDone) {
  const log = $("conLog");
  log.textContent = "";
  setBusy(true, label);
  setConsole("running", label);
  let failed = false;
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
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
    failed = true;
    log.textContent += `✗ ${e.message}\n`;
    setConsole("error", e.message);
    toast(e.message, false);
  } finally {
    setBusy(false);
    if (failed) openLog(true);
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

  setBusy(true, `generating scene ${s.scene}`);
  setConsole("running", `Generating image for scene ${s.scene}`);
  try {
    const res = await api("/api/generate", { scene: s.scene });
    setConsole("idle", `Scene ${s.scene} image generated (${res.via})`);
    toast(`Scene ${s.scene}: image generated.`);
    await refresh();
  } catch (e) {
    showError(e.message);
    setConsole("error", e.message);
    toast(e.message, false);
  } finally {
    setBusy(false);
  }
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
    toast(`Scene ${s.scene}: prompt written from narration.`);
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

// ------------------------------------------------------------------ templates

async function loadTemplates() {
  const t = await api("/api/templates");
  for (const key of TEMPLATE_FIELDS) $(`t_${key}`).value = t[key] || "";
}

// ------------------------------------------------------------------ wiring

$("railFilter").addEventListener("change", (e) => {
  filter = e.target.value;
  renderRail();
});

for (const btn of [$("viewStage"), $("viewSheet")])
  btn.addEventListener("click", () => setView(btn.dataset.view));

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
    streamJob(
      "/api/audio",
      { scene: s.scene, prompt: $("motionPromptBox").value.trim() },
      `Generating audio for scene ${s.scene}`,
    );
});
$("btnRenderScene").addEventListener("click", () => {
  const s = current();
  if (s)
    streamJob(
      "/api/render-scene",
      { scene: s.scene },
      `Rendering scene ${s.scene} to MP4`,
    );
});
$("btnMotionVideo").addEventListener("click", async () => {
  const s = current();
  if (!s) return;
  const model = $("motionModelSelect").value;
  setBusy(true, `Generating motion video for scene ${s.scene}`);
  setConsole(
    "running",
    `Generating motion video for scene ${s.scene} (${model})`,
  );
  try {
    await streamJob(
      "/api/generate-motion-video",
      { scene: s.scene, model },
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

$("btnSceneVideo").addEventListener("click", () => {
  const wrap = $("sceneVideoWrap");
  const show = wrap.hidden;
  wrap.hidden = !show;
  $("btnSceneVideo").textContent = show ? "Hide MP4" : "Show MP4";
  if (show) $("sceneVideo").src = current()?.sceneVideoUrl ?? "";
  else $("sceneVideo").removeAttribute("src");
});

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
$("batchPrompt").addEventListener("click", () => {
  const scenes = [...selected].sort((a, b) => a - b);
  streamJob(
    "/api/generate-prompts-batch",
    { scenes },
    `Writing prompts for scene ${scenes.join(", ")}`,
  );
});
$("batchImg").addEventListener("click", () => {
  const scenes = [...selected].sort((a, b) => a - b);
  streamJob(
    "/api/generate-batch",
    { scenes },
    `Generating images for scene ${scenes.join(", ")}`,
  );
});
$("batchAud").addEventListener("click", () => {
  const scenes = [...selected].sort((a, b) => a - b);
  streamJob(
    "/api/audio-batch",
    { scenes },
    `Generating audio for scene ${scenes.join(", ")}`,
  );
});

$("conToggle").addEventListener("click", () =>
  openLog(!$("console").classList.contains("open")),
);

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
$("tplSave").addEventListener("click", async () => {
  const body = Object.fromEntries(
    TEMPLATE_FIELDS.map((key) => [key, $(`t_${key}`).value]),
  );
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
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!$("tplOverlay").hidden) {
      $("tplOverlay").hidden = true;
      return;
    }
    if (!$("impOverlay").hidden) {
      $("impOverlay").hidden = true;
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
    if ($("console").classList.contains("open")) {
      openLog(false);
      return;
    }
  }
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

// ------------------------------------------------------------------ import JSON

let importRows = null;

$("btnImport").addEventListener("click", () => {
  $("impBox").value = "";
  $("impPreview").hidden = true;
  $("impApply").disabled = true;
  const ids = (state.characterList || []).map((c) => c.id);
  $("impNote").textContent = ids.length
    ? `Fields per row: scene, narration, char, prompt?. char = "${ids.join('" | "')}" | "both" | "none" (which character the narration is about → prompt). Paste, then Validate.`
    : "Paste JSON, then Validate.";
  $("impOverlay").hidden = false;
  $("impBox").focus();
});
$("impClose").addEventListener("click", () => {
  $("impOverlay").hidden = true;
});
$("impOverlay").addEventListener("click", (e) => {
  if (e.target === $("impOverlay")) $("impOverlay").hidden = true;
});
$("impCopy").addEventListener("click", async () => {
  const json = buildExportJson();
  try {
    await navigator.clipboard.writeText(json);
    toast("Copied current scenes as JSON.");
  } catch {
    $("impBox").value = json;
    toast("Clipboard unavailable, pasted into the box instead.", false);
  }
});
$("impValidate").addEventListener("click", () => {
  importRows = null;
  $("impApply").disabled = true;
  let parsed;
  try {
    parsed = JSON.parse($("impBox").value);
  } catch (e) {
    $("impPreview").hidden = false;
    $("impPreviewText").textContent = `Invalid JSON: ${e.message}`;
    return;
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.scenes)
      ? parsed.scenes
      : null;
  if (!rows || !rows.length) {
    $("impPreview").hidden = false;
    $("impPreviewText").textContent =
      "Expected an array of {scene, narration, ...} or {scenes:[...]}.";
    return;
  }
  const errors = [];
  const known = new Set(state.scenes.map((s) => s.scene));
  const charIds = new Set((state.characterList || []).map((c) => c.id));
  let updateCount = 0;
  let appendCount = 0;
  rows.forEach((row, i) => {
    if (!row || !Number.isFinite(row.scene) || row.scene < 1) {
      errors.push(`row ${i}: scene must be a positive number`);
      return;
    }
    if (typeof row.narration !== "string" || !row.narration.trim())
      errors.push(`row ${i} (scene ${row.scene}): narration is required`);
    const unknown = unknownCharIds(row.char, charIds);
    if (unknown === null)
      errors.push(
        `row ${i} (scene ${row.scene}): char must be a string or array of ids`,
      );
    else if (unknown.length)
      errors.push(
        `row ${i} (scene ${row.scene}): unknown char ${unknown.join(", ")}`,
      );
    if (known.has(row.scene)) updateCount++;
    else appendCount++;
  });
  $("impPreview").hidden = false;
  if (errors.length) {
    $("impPreviewText").innerHTML = errors
      .map((e) => escapeHtml(e))
      .join("<br />");
    return;
  }
  importRows = rows;
  $("impPreviewText").textContent =
    `${rows.length} row(s): ${updateCount} update existing scene(s), ${appendCount} append new scene(s).`;
  $("impApply").disabled = false;
});
$("impApply").addEventListener("click", async () => {
  if (!importRows) return;
  $("impApply").disabled = true;
  $("impApply").textContent = "Applying...";
  try {
    const res = await api("/api/narration-import", importRows);
    toast(
      `Imported: ${res.updated.length} updated, ${res.appended.length} appended.`,
    );
    $("impOverlay").hidden = true;
    await refresh();
  } catch (e) {
    $("impPreviewText").textContent = e.message;
  } finally {
    $("impApply").disabled = false;
    $("impApply").textContent = "Apply";
  }
});

// ------------------------------------------------------------------ scene setup (title/cue/host/char)

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
$("hostBox").addEventListener("blur", (e) => {
  const s = current();
  if (s && e.target.value.trim() !== (s.host || ""))
    saveSceneField("host", e.target.value.trim());
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
  const btn = e.target.closest(".char-action");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "upload") {
    pendingUploadCharId = id;
    $("charFileInput").click();
  } else if (btn.dataset.action === "puppet") {
    streamJob("/api/generate-puppets", { id }, `Generating puppet for ${id}`);
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
$("btnGenPuppets").addEventListener("click", () => {
  streamJob(
    "/api/generate-puppets",
    {},
    "Generating puppet references for every character",
  );
});

setConsole("idle", "Loading scenes...");
refresh().catch((e) => {
  setConsole("error", `Failed to load: ${e.message}`);
  toast(e.message, false);
});
