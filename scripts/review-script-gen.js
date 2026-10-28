// Scene Studio - new project dialog and the project's narration voice.
//
// "Dự án mới" has two modes. "Từ yêu cầu (AI)" posts the video request to /api/script-generate:
// the server's LLM writes the story (narration, cast, cues), then the image prompts, then the motion, and
// streams its progress over SSE; the finished script becomes the new active project and opens in
// the script editor for review. Nothing is written before the last step, so Huỷ leaves nothing
// behind. "Thủ công" creates a project from a pasted scene-plan.md or the blank template.
//
// The voice selects (topbar, and the dialog) list OmniVoice's voice profiles. The choice is the
// project's `voice:` header, which generate-narration.mjs reads.
//
// Uses the panel globals ($, api, escapeHtml, toast, readSse, state, render, refresh, lsGet,
// lsSet, sceneList, clearProjectLocalState) from review-panel.js, which loads first, and re-syncs
// the topbar voice on its "studio:render" event.

const NP_MODE_STORE = "reviewNewProjectMode";
const NP_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const NP_SCENES_MIN = 3;
const NP_SCENES_MAX = 40;
// A scene's narration read aloud, roughly — for the "≈ video length" hint under the scene count.
const NP_SECONDS_PER_SCENE = 6.5;
const NP_NOTE = {
  ai: "LLM viết narration, nhân vật, prompt ảnh và motion — khoảng vài phút cho 20 scene. Xong sẽ mở Kịch bản để duyệt.",
  manual: "Tạo projects/<slug>/scene-plan.md rồi chuyển sang dự án đó.",
};
const NP_PHASES = ["story", "visuals", "motion", "create"];
const NP_PHASE_LABEL = {
  story: "Bước 1/4 · Viết câu chuyện và narration",
  visuals: "Bước 2/4 · Viết prompt ảnh",
  motion: "Bước 3/4 · Viết motion (camera, nhân vật, môi trường)",
  create: "Bước 4/4 · Tạo dự án",
};
// Narration is Vietnamese, so Vietnamese voices lead the list.
const VOICE_LANGUAGE_ORDER = ["Vietnamese", "English", "Chinese"];
const VOICE_LANGUAGE_LABEL = {
  Vietnamese: "Tiếng Việt",
  English: "Tiếng Anh",
  Chinese: "Tiếng Trung",
};
const VOICE_NOTE_MAX = 36;

let voiceList = null; // /api/voices → { voices: [{ name, language, note }], defaultVoice, source }
let voiceListVersion = 0;
let voiceSelectKey = "";
let npMode = "ai";
let npRun = null; // the AI run in flight: { controller, startedAt, timer }

// ------------------------------------------------------------------ voices

async function loadVoices() {
  try {
    voiceList = await api("/api/voices");
  } catch (e) {
    voiceList = { voices: [], defaultVoice: null };
    toast(`Không đọc được danh sách giọng OmniVoice: ${e.message}`, false);
  }
  voiceListVersion++;
}

const voiceLabel = (v) => {
  const note =
    v.note.length > VOICE_NOTE_MAX
      ? `${v.note.slice(0, VOICE_NOTE_MAX - 1)}…`
      : v.note;
  return note ? `${v.name} — ${note}` : v.name;
};

// Options grouped by language. A voice the plan names that OmniVoice no longer lists stays as the
// first option, flagged, so the select never shows a voice the project does not use.
function voiceOptionsHtml(selected) {
  const voices = voiceList?.voices ?? [];
  const groups = new Map();
  for (const v of voices) {
    const language = v.language || "Khác";
    groups.set(language, [...(groups.get(language) ?? []), v]);
  }
  const rank = (language) => {
    const i = VOICE_LANGUAGE_ORDER.indexOf(language);
    return i < 0 ? VOICE_LANGUAGE_ORDER.length : i;
  };
  const ordered = [...groups].sort(
    ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b),
  );
  const option = (v) =>
    `<option value="${escapeHtml(v.name)}"${v.name === selected ? " selected" : ""}>${escapeHtml(voiceLabel(v))}</option>`;
  const unknown =
    selected && !voices.some((v) => v.name === selected)
      ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} (không có trong OmniVoice)</option>`
      : "";
  return (
    unknown +
    ordered
      .map(
        ([language, list]) =>
          `<optgroup label="${escapeHtml(VOICE_LANGUAGE_LABEL[language] ?? language)}">${list.map(option).join("")}</optgroup>`,
      )
      .join("")
  );
}

// Rebuilt only when the project's voice or the list changes, so a refresh in the middle of
// picking never closes the open dropdown.
function renderVoiceSelect() {
  if (!voiceList || !state.project) return;
  const key = `${state.project.voice}|${voiceListVersion}`;
  if (key === voiceSelectKey) return;
  voiceSelectKey = key;
  $("voiceSelect").innerHTML = voiceOptionsHtml(state.project.voice);
  // The workbench's narration block names the voice "Sinh audio" will use (read-only there).
  const voice = $("voiceSelect").value;
  $("narrVoice").textContent = voice ? `Giọng: ${voice}` : "";
}

$("voiceSelect").addEventListener("change", async (e) => {
  const voice = e.target.value;
  try {
    state = await api("/api/project-voice", { voice });
    render();
    toast(`Giọng đọc: ${voice} — dùng cho audio sinh từ giờ.`);
  } catch (err) {
    toast(err.message, false);
    voiceSelectKey = "";
    renderVoiceSelect();
  }
});

document.addEventListener("studio:render", renderVoiceSelect);
loadVoices().then(renderVoiceSelect);

// ------------------------------------------------------------------ new project dialog

function setNpNote(text, isError = false) {
  $("npNote").textContent = text;
  $("npNote").classList.toggle("is-error", isError);
}

function setNpMode(mode) {
  npMode = mode;
  lsSet(NP_MODE_STORE, mode);
  for (const b of $("npModes").querySelectorAll("button"))
    b.setAttribute("aria-pressed", String(b.dataset.npMode === mode));
  $("npAiFields").hidden = mode !== "ai";
  $("npPlanField").hidden = mode !== "manual";
  $("npSlugHint").textContent =
    mode === "ai" ? "tuỳ chọn — AI tự đặt" : "bắt buộc";
  $("npCreate").textContent = mode === "ai" ? "Viết kịch bản" : "Tạo";
  setNpNote(NP_NOTE[mode]);
}

function updateLengthHint() {
  const n = Number($("npSceneCount").value);
  if (!Number.isInteger(n) || n < NP_SCENES_MIN || n > NP_SCENES_MAX) {
    $("npLengthHint").textContent =
      `từ ${NP_SCENES_MIN} đến ${NP_SCENES_MAX} scene`;
    return;
  }
  const seconds = Math.round(n * NP_SECONDS_PER_SCENE);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const length = minutes
    ? `${minutes} phút${rest ? ` ${rest} giây` : ""}`
    : `${rest} giây`;
  $("npLengthHint").textContent = `≈ ${length} video`;
}

async function openNewProjectDialog() {
  // The request is kept between openings, so a closed dialog never loses a long brief.
  for (const id of ["npSlug", "npTitleInput", "npPlan"]) $(id).value = "";
  $("npAspect").value = "16:9";
  $("npRun").hidden = true;
  setNpMode(lsGet(NP_MODE_STORE) === "manual" ? "manual" : "ai");
  updateLengthHint();
  $("npOverlay").hidden = false;
  (npMode === "ai" ? $("npRequest") : $("npSlug")).focus();

  const [templates] = await Promise.allSettled([
    api("/api/templates"),
    loadVoices(),
  ]);
  if (templates.status === "fulfilled") {
    const { versions = ["default"], activeVersion } = templates.value;
    $("npTemplate").innerHTML = versions
      .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
      .join("");
    $("npTemplate").value = activeVersion || "default";
  } else {
    setNpNote(templates.reason.message, true);
  }
  $("npVoice").innerHTML = voiceOptionsHtml(
    state.project?.voice ?? voiceList?.defaultVoice,
  );
  renderVoiceSelect();
}

// Called from the panel's Escape handler too. A running AI write is stopped only by Huỷ.
function closeNewProjectDialog() {
  if (npRun) {
    toast("Đang viết kịch bản — bấm Huỷ để dừng.", false);
    return;
  }
  $("npOverlay").hidden = true;
}

const NP_FIELD_IDS = [
  "npRequest",
  "npSceneCount",
  "npSlug",
  "npTitleInput",
  "npAspect",
  "npTemplate",
  "npVoice",
  "npPlan",
];

function setNpFormDisabled(disabled) {
  for (const id of NP_FIELD_IDS) $(id).disabled = disabled;
  for (const b of $("npModes").querySelectorAll("button"))
    b.disabled = disabled;
}

// Every project field, as both create endpoints take them (blank optional fields omitted).
const npProjectFields = () => ({
  slug: $("npSlug").value.trim() || undefined,
  title: $("npTitleInput").value.trim() || undefined,
  aspect: $("npAspect").value,
  template: $("npTemplate").value || undefined,
  voice: $("npVoice").value || undefined,
});

async function createManualProject() {
  const fields = npProjectFields();
  if (!NP_SLUG_RE.test(fields.slug ?? "")) {
    setNpNote(
      "Slug chỉ gồm chữ thường, số và dấu gạch ngang, bắt đầu bằng chữ hoặc số.",
      true,
    );
    $("npSlug").focus();
    return;
  }
  $("npCreate").disabled = true;
  try {
    clearProjectLocalState();
    state = await api("/api/project-create", {
      ...fields,
      plan: $("npPlan").value,
    });
    render();
    $("npOverlay").hidden = true;
    toast(`Đã tạo dự án "${state.project.title}".`);
  } catch (e) {
    setNpNote(e.message, true);
  } finally {
    $("npCreate").disabled = false;
  }
}

// ---- AI run

function showNpPhase({ phase, done, total }) {
  const label = NP_PHASE_LABEL[phase] ?? "";
  $("npRunStep").textContent =
    (phase === "visuals" || phase === "motion") && total
      ? `${label} · ${done}/${total} scene`
      : label;
  const at = NP_PHASES.indexOf(phase);
  for (const step of $("npSteps").children) {
    const i = NP_PHASES.indexOf(step.dataset.phase);
    step.dataset.state = i < at ? "done" : i === at ? "active" : "todo";
  }
  // Writing the project takes a moment and the server finishes it regardless, so Huỷ goes away
  // rather than promise a cancel it cannot keep.
  if (phase === "create") $("npCancelRun").hidden = true;
}

function appendNpLog(line) {
  const log = $("npLog");
  log.textContent += `${line}\n`;
  log.scrollTop = log.scrollHeight;
}

function tickNpTime() {
  const s = Math.floor((Date.now() - npRun.startedAt) / 1000);
  $("npRunTime").textContent =
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function startNpRun() {
  npRun = {
    controller: new AbortController(),
    startedAt: Date.now(),
    timer: null,
  };
  setNpFormDisabled(true);
  $("npLog").textContent = "";
  $("npRun").hidden = false;
  $("npRunSpin").hidden = false;
  showNpPhase({ phase: "story" });
  tickNpTime();
  npRun.timer = setInterval(tickNpTime, 1000);
  $("npCancelRun").hidden = false;
  $("npCreate").disabled = true;
  setNpNote(
    "Giữ dialog mở trong lúc viết. Huỷ ở bước 1–2 thì chưa có gì được tạo.",
  );
}

function stopNpRun() {
  clearInterval(npRun.timer);
  npRun = null;
  setNpFormDisabled(false);
  $("npRunSpin").hidden = true;
  $("npCancelRun").hidden = true;
  $("npCreate").disabled = false;
}

// A run that did not end with "done" may still have created and opened the project (the server
// does not cancel its last step), so the panel reloads from the server rather than trust its own
// side of the story. Per-project drafts are dropped only when the open project changed under it.
// Returns the newly opened project, or null.
async function resyncAfterRun() {
  const before = state.project?.slug;
  const next = await api("/api/state");
  const switched = next.project?.slug !== before;
  if (switched) clearProjectLocalState();
  state = next;
  render();
  return switched ? next.project : null;
}

// The server has made the new project active (unless another client had a job running): load it,
// close, and open the script editor so the narration is read before anything is generated from it.
async function finishGeneratedProject({
  slug,
  activated,
  scenes,
  characters,
  missingPrompts,
}) {
  if (!activated) {
    await refresh(); // lists the new project; the open one stays
    $("npOverlay").hidden = true;
    toast(
      `Đã tạo dự án "${slug}" nhưng chưa mở vì đang có job chạy — chọn nó khi job xong.`,
      false,
    );
    return;
  }
  clearProjectLocalState();
  await refresh();
  $("npOverlay").hidden = true;
  const cast = characters
    ? ` — bấm "Tạo ảnh" trên thẻ ${characters} nhân vật để có ảnh tham chiếu`
    : "";
  toast(`Đã tạo "${state.project.title}": ${scenes} scene${cast}.`);
  if (missingPrompts.length)
    toast(
      `Scene ${sceneList(missingPrompts)} chưa có prompt — dùng "Viết prompt còn thiếu" trong Kịch bản.`,
      false,
    );
  $("btnScript").click();
}

async function generateProject() {
  const request = $("npRequest").value.trim();
  const sceneCount = Number($("npSceneCount").value);
  const fields = npProjectFields();
  if (!request) {
    setNpNote("Nhập yêu cầu video.", true);
    $("npRequest").focus();
    return;
  }
  if (
    !Number.isInteger(sceneCount) ||
    sceneCount < NP_SCENES_MIN ||
    sceneCount > NP_SCENES_MAX
  ) {
    setNpNote(`Số scene phải từ ${NP_SCENES_MIN} đến ${NP_SCENES_MAX}.`, true);
    $("npSceneCount").focus();
    return;
  }
  if (fields.slug && !NP_SLUG_RE.test(fields.slug)) {
    setNpNote(
      "Slug chỉ gồm chữ thường, số và dấu gạch ngang — hoặc để trống cho AI đặt.",
      true,
    );
    $("npSlug").focus();
    return;
  }

  startNpRun();
  const { signal } = npRun.controller;
  let result = null;
  let failure = null;
  try {
    await readSse(
      "/api/script-generate",
      { ...fields, request, sceneCount },
      signal,
      (type, data) => {
        if (type === "log") appendNpLog(data);
        else if (type === "progress") showNpPhase(data);
        else if (type === "done") result = data;
        else if (type === "error") failure = data;
      },
      { label: "Viết kịch bản bằng AI" },
    );
  } catch (e) {
    if (e.name !== "AbortError") failure = e.message;
  }
  stopNpRun();
  if (result) {
    await finishGeneratedProject(result);
    return;
  }
  const opened = await resyncAfterRun().catch(() => null);
  if (opened) {
    $("npOverlay").hidden = true;
    toast(
      `Dự án "${opened.title}" đã được tạo và mở dù tiến trình không báo xong — kiểm tra lại trong Kịch bản.`,
      false,
    );
  } else if (signal.aborted) setNpNote("Đã huỷ — chưa tạo dự án nào.");
  else {
    const message = failure ?? "Kết nối tới server bị ngắt giữa chừng.";
    appendNpLog(`✗ ${message}`);
    setNpNote(message, true);
  }
}

$("btnNewProject").addEventListener("click", openNewProjectDialog);
$("npClose").addEventListener("click", closeNewProjectDialog);
$("npOverlay").addEventListener("click", (e) => {
  if (e.target === $("npOverlay")) closeNewProjectDialog();
});
$("npModes").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-np-mode]");
  if (button && !npRun) setNpMode(button.dataset.npMode);
});
$("npSceneCount").addEventListener("input", updateLengthHint);
$("npCreate").addEventListener("click", () =>
  npMode === "ai" ? generateProject() : createManualProject(),
);
$("npCancelRun").addEventListener("click", () => npRun?.controller.abort());
// Cmd/Ctrl+Enter in the brief starts the write, like saving a field elsewhere in the panel.
$("npRequest").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !npRun) {
    e.preventDefault();
    generateProject();
  }
});
// A pasted plan that declares its own `aspect:` sets the select, so the two never disagree.
$("npPlan").addEventListener("input", () => {
  const header = $("npPlan").value.split(/^##\s+/m)[0];
  const aspect = header.match(/^\s*aspect\s*:\s*(\S+)\s*$/im)?.[1];
  if (aspect && [...$("npAspect").options].some((o) => o.value === aspect))
    $("npAspect").value = aspect;
});
