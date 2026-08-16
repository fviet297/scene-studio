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

let state = { title: "Scene Studio", scenes: [], characters: {} };
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
  renderPipeline();
  renderRail();
  renderStage();
  renderSheet();
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
  $("stChars").textContent = (s.characters || []).join(" · ");

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
      const inner = s.hasImage
        ? `<img src="${s.imageUrl}" alt="Scene ${s.scene}" loading="lazy" />`
        : `<span class="empty">${s.kind === "search" ? "search scene" : "not generated"}</span>`;
      return `<div class="tile${selected.has(s.scene) ? " selected" : ""}" data-scene="${s.scene}">
      <button type="button" class="tile-btn" data-role="open" title="Open scene ${s.scene} in the workbench">
        ${inner}<span class="no">${s.scene}</span>${pips(s)}
      </button>
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
    tile.querySelector('[data-role="open"]').addEventListener("click", () => {
      selectScene(n);
      setView("stage");
    });
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
    "btnAudio",
    "btnUpload",
    "btnRenderScene",
    "btnRender",
    "btnApprove",
    "batchImg",
    "batchAud",
  ])
    $(id).disabled = on;
  if (!on) {
    renderPipeline();
    renderSelection();
    const s = current();
    if (s) syncInspector(s);
  }
}

async function refresh() {
  state = await api("/api/state");
  render();
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
      { scene: s.scene },
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
$("selNone").addEventListener("click", () => {
  selected.clear();
  renderSheet();
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

setConsole("idle", "Loading scenes...");
refresh().catch((e) => {
  setConsole("error", `Failed to load: ${e.message}`);
  toast(e.message, false);
});
