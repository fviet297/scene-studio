// Scene Studio - review workbench behaviour.
//
// Shape of this file:
//   state + helpers → render (rail, stage, inspector) → actions → wiring. The timeline (default
//   view, with the batch bar) lives in review-timeline.js.
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

// Style DNA lives in the Style dialog, the rest in the Template prompt dialog; each saves only its
// own fields (the server keeps every blank/missing field at its current value).
const STYLE_FIELDS = ["styleDna"];
const PROMPT_FIELDS = [
  "masterPrompt",
  "faceLockPrompt",
  "multiCharPrompt",
  "text2img",
  "guard",
];
const TEMPLATE_FIELDS = [...STYLE_FIELDS, ...PROMPT_FIELDS];
const STATE_LABEL = {
  "need-image": "thiếu ảnh",
  "need-audio": "thiếu audio",
  "stale-audio": "audio cũ",
  "need-render": "thiếu motion",
  done: "xong",
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
let view = "timeline";
// Label of a whole-panel operation (a project switch) that locks every control, or null.
let globalOp = null;
let templateVersions = [];
// Latest effective templates (incl. the *_vi reading aids) from /api/templates, kept so the
// "Dịch" buttons on template fields can show the stored Vietnamese without any translation call.
let currentTemplates = {};
const selected = new Set();
const drafts = { prompt: new Map(), narr: new Map(), motion: new Map() };

const sceneStatus = (s) =>
  !s.hasImage
    ? "need-image"
    : !s.hasAudio
      ? "need-audio"
      : s.audioStale
        ? "stale-audio"
        : !s.hasMotionVideo
        ? "need-render"
        : "done";
// ------------------------------------------------------------------ job lanes
//
// Two FIFO lanes, each running one job at a time:
//   media — image, prompt, motion and the final render. Paid Replicate/OpenAI calls therefore
//           still run one after another, never in parallel. Its running job owns the console
//           log and the Cancel button.
//   audio — narration TTS (one OmniVoice backend). Writes only .mp3 files, so it runs alongside
//           the media lane.
// A click while a lane is busy queues the job instead of being refused, so work on one scene
// never locks the others; gates below block only the actions that conflict with a pending job.
const lanes = {
  media: { running: null, queue: [] },
  audio: { running: null, queue: [] },
};
// Direct, unqueued actions in progress (upload, undo, remove motion): scene → label.
const sceneOps = new Map();
const JOB_KIND_LABEL = {
  image: "ảnh",
  prompt: "prompt",
  motionPrompt: "motion prompt",
  motion: "motion",
  audio: "audio",
  render: "render",
};

// Jobs an earlier load of this page started: a reload leaves them running on the server (see
// readSse). watchOrphanJobs keeps them here, in the shape of a lane job, until they end, so they
// gate and mark their unfinished scenes like this page's own running jobs.
let orphanJobs = [];
const ORPHAN_POLL_MS = 3000;
const orphanLane = (kind) => (kind === "audio" ? "audio" : "media");

const laneJobs = (name) => [
  ...[lanes[name].running, ...lanes[name].queue].filter(Boolean),
  ...orphanJobs.filter((j) => j.lane === name),
];
const allJobs = () => [...laneJobs("media"), ...laneJobs("audio")];
const anyJobActive = () => allJobs().length > 0;
const renderActive = () => laneJobs("media").some((j) => j.kind === "render");
// Scene n is still ahead in job j: neither finished by the server nor cancelled out of it.
const jobCovers = (j, n) =>
  j.scenes.includes(n) && !j.done.has(n) && !j.skip.has(n);
// A running or queued job of `kind` already covers scene n — a second one would pay twice.
const hasPending = (kind, n) =>
  allJobs().some((j) => j.kind === kind && jobCovers(j, n));
// Scene n's image/motion files are being written or read (or are about to be) — direct edits
// wait. Prompt jobs only touch the plan text, so they do not count.
const FILE_JOB_KINDS = ["image", "motion", "render"];
const sceneMediaBusy = (n) =>
  sceneOps.has(n) ||
  laneJobs("media").some(
    (j) => FILE_JOB_KINDS.includes(j.kind) && jobCovers(j, n),
  );
// Any pending work on scene n; plan rewrites (merge, script save) of that scene wait.
const sceneInAnyLane = (n) =>
  sceneOps.has(n) || allJobs().some((j) => jobCovers(j, n));

// A job for `scenes` built from a spec or from an earlier job (whose `labelFor` carries over).
// current/done/skip track the server's progress through the scenes (trackSceneProgress).
function newJob(spec, scenes) {
  const labelFor = spec.labelFor ?? spec.label;
  return {
    ...spec,
    scenes,
    labelFor,
    label: labelFor(scenes),
    current: null,
    done: new Set(),
    skip: new Set(),
    controller: null,
    cancelNote: null,
  };
}

// spec: { lane, kind, scenes, label(scenes) → string, run(job) → Promise, cancellable? }.
// `cancellable: false` hides Cancel for a runner that ignores job.controller. Scenes that already
// have a pending job of the same kind are dropped, so a double click or an overlapping batch
// never queues the same paid generation twice.
function enqueueJob(spec) {
  const fresh = spec.scenes.filter((n) => !hasPending(spec.kind, n));
  if (!fresh.length) {
    toast(
      `Scene ${spec.scenes.join(", ")} đã có ${JOB_KIND_LABEL[spec.kind]} trong hàng chờ.`,
      false,
    );
    return;
  }
  const skipped = spec.scenes.length - fresh.length;
  const job = newJob(spec, fresh);
  const lane = lanes[spec.lane];
  lane.queue.push(job);
  if (lane.running)
    toast(
      `Đã xếp hàng: ${job.label}${skipped ? ` (bỏ qua ${skipped} scene đã chờ)` : ""}.`,
    );
  syncJobUi();
  pumpLane(spec.lane);
}

async function pumpLane(name) {
  const lane = lanes[name];
  if (lane.running || !lane.queue.length) return;
  const job = lane.queue.shift();
  job.controller = new AbortController();
  lane.running = job;
  syncJobUi();
  try {
    await job.run(job);
  } catch (e) {
    toast(e.message, false);
  } finally {
    lane.running = null;
    await refresh().catch(() => {});
    syncJobUi();
    pumpLane(name);
  }
}

// Drop every queued (not yet started) job in both lanes; running jobs carry on.
function clearQueues() {
  const n = lanes.media.queue.length + lanes.audio.queue.length;
  lanes.media.queue.length = 0;
  lanes.audio.queue.length = 0;
  syncJobUi();
  if (n) toast(`Đã xoá ${n} job khỏi hàng chờ.`);
}

// Cancel scene n's pending `kind` job, and nothing else. A queued job just drops the scene (and
// goes once empty). A running job is aborted only when no other scene of it is still unfinished;
// in a batch the scene is marked skipped instead, and trackSceneProgress aborts the batch the
// moment the server starts that scene, re-queueing the rest — so cancelling one scene never
// kills a paid call already running for another.
function cancelSceneJob(kind, n) {
  // A job from before a reload can only be stopped whole: the server has no per-scene skip.
  const orphan = orphanJobs.find((j) => j.kind === kind && jobCovers(j, n));
  if (orphan) {
    api("/api/cancel", { id: orphan.id }).catch((e) => toast(e.message, false));
    toast(`Đã huỷ cả job: ${orphan.label}. ${CANCEL_PROVIDER_NOTE}`, false);
    return;
  }
  for (const lane of Object.values(lanes)) {
    for (const job of [...lane.queue]) {
      if (job.kind !== kind || !jobCovers(job, n)) continue;
      job.scenes = job.scenes.filter((x) => x !== n);
      if (job.scenes.length) job.label = job.labelFor(job.scenes);
      else lane.queue.splice(lane.queue.indexOf(job), 1);
    }
    const job = lane.running;
    if (job?.kind !== kind || !jobCovers(job, n)) continue;
    job.skip.add(n);
    if (job.current === n || !unfinishedScenes(job).length) abortForSkip(job);
  }
  toast(`Đã huỷ ${JOB_KIND_LABEL[kind]} scene ${n}.`);
  syncJobUi();
}

// Scenes of a running job the server has yet to finish, cancelled ones left out.
const unfinishedScenes = (job) =>
  job.scenes.filter((x) => !job.done.has(x) && !job.skip.has(x));

// Abort a running job for its skipped scene(s); the scenes it had not reached go back to the
// front of its lane, so the rest of the batch still runs.
function abortForSkip(job) {
  const rest = unfinishedScenes(job).filter((x) => x !== job.current);
  if (rest.length) lanes[job.lane].queue.unshift(newJob(job, rest));
  job.cancelNote =
    `Đã huỷ scene ${[...job.skip].join(", ")}` +
    (rest.length ? ` — scene ${rest.join(", ")} xếp lại đầu hàng chờ` : "");
  job.controller.abort();
}

// Follow the server's per-scene log lines ("▶ … scene N" when one starts; "✓/✗/• scene N" or
// "✓ scene-NN.mp3" when it ends), shared by the image, motion and audio endpoints.
const SCENE_START = /^▶ .*?\bscene (\d+)/;
const SCENE_END = /^[✓✗•] scene[- ](\d+)/;
function trackSceneProgress(job, line) {
  if (job.controller.signal.aborted) return;
  const start = SCENE_START.exec(line);
  if (start) {
    job.current = Number(start[1]);
    if (job.skip.has(job.current)) abortForSkip(job);
    else syncJobUi();
    return;
  }
  const end = SCENE_END.exec(line);
  if (!end) return;
  job.done.add(Number(end[1]));
  job.current = null;
  if (job.skip.size && !unfinishedScenes(job).length) abortForSkip(job);
  syncJobUi();
  refreshSoon();
}

// Run a direct (unqueued) action on one scene, refused while that scene has media work pending.
async function withSceneOp(n, label, work) {
  if (sceneMediaBusy(n)) {
    toast(`Scene ${n} đang có job ảnh/motion — chờ xong rồi thử lại.`, false);
    return;
  }
  sceneOps.set(n, label);
  syncJobUi();
  try {
    await work();
  } finally {
    sceneOps.delete(n);
    syncJobUi();
  }
}

// What scene n is waiting on, for the stage and the rail:
//   work  — label of a running media job or direct op on this scene (covers the stage);
//   notes — running audio and queued jobs with their lane position (a chip, never a cover);
//   mark  — "running" | "queued" | null for the rail row.
function sceneJobStatus(n) {
  const running = (name) =>
    [lanes[name].running, ...orphanJobs.filter((j) => j.lane === name)].find(
      (j) => j && jobCovers(j, n),
    );
  const work = sceneOps.get(n) ?? running("media")?.label ?? null;
  const audioRunning = Boolean(running("audio"));
  const notes = audioRunning ? ["đang sinh audio"] : [];
  for (const name of ["media", "audio"])
    lanes[name].queue.forEach((j, i) => {
      if (jobCovers(j, n))
        notes.push(`chờ ${JOB_KIND_LABEL[j.kind]} · #${i + 1}`);
    });
  const mark =
    work || audioRunning ? "running" : notes.length ? "queued" : null;
  return { work, notes, mark };
}

// Tasks pending on scene n, in pipeline order, for the timeline's job lane. `running`: the server is
// on this scene right now; otherwise it waits — `position` is its place in the lane's queue, null
// when it is later in a batch that is already running. A direct edit (upload, undo…) comes first.
const JOB_LANE_ORDER = ["prompt", "motionPrompt", "image", "audio", "motion"];
function sceneJobList(n) {
  const active = [
    ...Object.values(lanes).map((lane) => lane.running),
    ...orphanJobs,
  ].filter(Boolean);
  const isRunning = (kind) =>
    active.some(
      (j) =>
        j.kind === kind &&
        jobCovers(j, n) &&
        (j.current === n || j.scenes.length === 1),
    );
  const queuePosition = (kind) => {
    for (const { queue } of Object.values(lanes)) {
      const index = queue.findIndex((j) => j.kind === kind && jobCovers(j, n));
      if (index >= 0) return index + 1;
    }
    return null;
  };
  const tasks = JOB_LANE_ORDER.filter((kind) => hasPending(kind, n)).map(
    (kind) => ({ kind, running: isRunning(kind), position: queuePosition(kind) }),
  );
  return sceneOps.has(n)
    ? [{ kind: "edit", running: true, label: sceneOps.get(n) }, ...tasks]
    : tasks;
}

// Re-run every job-dependent gate and marker without refetching state.
function syncJobUi() {
  renderPipeline();
  renderRail();
  renderStage();
  syncScriptGenButtons();
  updateScriptFoot();
  syncGlobalButtons();
  syncConsoleQueue();
  document.dispatchEvent(new CustomEvent("studio:jobs"));
}

// Project switch/create rewrite the server's active paths, so they wait for every lane to drain.
function syncGlobalButtons() {
  const locked = Boolean(globalOp) || anyJobActive();
  $("projectSelect").disabled = locked;
  $("aspectSelect").disabled = locked;
  // A style switch changes what queued image jobs are built from, so it waits like a project switch.
  $("styleSelect").disabled = locked;
  $("t_version").disabled = locked;
  $("btnNewProject").disabled = locked;
  $("voiceSelect").disabled = Boolean(globalOp);
  $("btnAddChar").disabled = Boolean(globalOp);
  $("tlAddChar").disabled = Boolean(globalOp);
}

function syncConsoleQueue() {
  const queued = lanes.media.queue.length + lanes.audio.queue.length;
  $("conQueue").hidden = queued === 0;
  $("conQueue").textContent = `+${queued} chờ`;
  $("conClearQueue").hidden = queued === 0;
  const media = lanes.media.running;
  $("conCancel").hidden = media
    ? media.cancellable === false
    : orphanJobs.length === 0;
  if (media) $("conCancel").disabled = media.controller.signal.aborted;
}

const findScene = (n) => state.scenes.find((s) => s.scene === n) ?? null;
const current = () => findScene(currentScene);
const shownScenes = () =>
  state.scenes.filter((s) => filter === "all" || sceneStatus(s) === filter);

// Filled pip = stage finished. Shape, not colour, carries the meaning.
const pips = (s) => {
  const on = [s.hasImage, s.hasAudio, s.hasMotionVideo];
  const mark = (ok) => (ok ? "xong" : "thiếu");
  const audioMark = s.audioStale ? "cũ (narration đã sửa)" : mark(s.hasAudio);
  const label = `ảnh ${mark(s.hasImage)}, audio ${audioMark}, motion ${mark(s.hasMotionVideo)}`;
  const pip = (v, i) => `<span class="pip${v ? " on" : ""}${i === 1 && s.audioStale ? " stale" : ""}"></span>`;
  return `<span class="pips" role="img" aria-label="${label}" title="${label}">${on.map(pip).join("")}</span>`;
};

// ------------------------------------------------------------------ render

function render() {
  // The project name already shows in the project select; the tab title carries it too.
  document.title = `${state.title} — Scene Studio`;
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
  renderSelection();
  syncScriptGenButtons();
  // The timeline lives in its own script (review-timeline.js) and redraws on this signal.
  document.dispatchEvent(new CustomEvent("studio:render"));
}

function renderProjectSwitch() {
  const options = (state.projects || [])
    .map(
      (p) =>
        `<option value="${escapeHtml(p.slug)}"${p.slug === state.project?.slug ? " selected" : ""}>${escapeHtml(p.title)}</option>`,
    )
    .join("");
  $("projectSelect").innerHTML = options;
  $("aspectSelect").value = state.project?.aspect || "9:16";
  syncStyleSelects(state.project?.templateVersions, state.project?.template);
}

// The style version picker exists twice — the top bar (quick switch) and the Style dialog — and both
// always show the same list and active version. The closed top-bar select reads "Style · name" so
// it is not mistaken for the voice select beside it.
function syncStyleSelects(versions = [], active = "default") {
  templateVersions = versions;
  const options = (label) =>
    versions
      .map(
        (v) =>
          `<option value="${escapeHtml(v)}">${label}${escapeHtml(v)}</option>`,
      )
      .join("");
  $("styleSelect").innerHTML = options("Style · ");
  $("t_version").innerHTML = options("");
  $("styleSelect").value = active;
  $("t_version").value = active;
}

// Model options grouped by provider. A model whose provider key is missing from .env stays
// listed (so the user sees it exists) but disabled, instead of failing only after the click.
function modelOptionsHtml(models) {
  const groups = new Map();
  for (const m of models) {
    const label = m.providerLabel || m.provider || "";
    groups.set(label, [...(groups.get(label) ?? []), m]);
  }
  return [...groups]
    .map(([provider, list]) => {
      const options = list
        .map((m) => {
          const text =
            m.available === false ? `${m.label} — thiếu ${m.keyEnv}` : m.label;
          return `<option value="${escapeHtml(m.id)}"${m.available === false ? " disabled" : ""}>${escapeHtml(text)}</option>`;
        })
        .join("");
      return `<optgroup label="${escapeHtml(provider)}">${options}</optgroup>`;
    })
    .join("");
}

// Rebuilt only when the list changed (a model added, hidden or newly keyed in the model manager):
// rebuilding on every refresh() would reset whatever model the user picked mid-workflow, so the
// pick survives a rebuild while it is still listed and usable. Two selects share each list: the
// per-scene one drives single-scene generate, the contact-sheet one drives the batch run. When the
// selected option is disabled (its provider has no key), the first usable model is selected.
function fillModelSelects(models, ids) {
  const options = modelOptionsHtml(models || []);
  for (const id of ids) {
    const select = $(id);
    if (select.dataset.options === options) continue;
    const previous = select.value;
    select.innerHTML = options;
    select.dataset.options = options;
    const kept = [...select.options].find(
      (o) => o.value === previous && !o.disabled,
    );
    if (kept) select.value = previous;
    else if (select.selectedOptions[0]?.disabled) {
      const usable = [...select.options].find((o) => !o.disabled);
      if (usable) select.value = usable.value;
    }
  }
}
const renderImageModelSelect = () =>
  fillModelSelects(state.imageModels, [
    "imageModelSelect",
    "batchImageModelSelect",
  ]);
const renderMotionModelSelect = () =>
  fillModelSelects(state.motionVideoModels, [
    "motionModelSelect",
    "batchMotionModelSelect",
  ]);

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

// Set a select's value only when that option exists and is usable, so a remembered model that has
// left the list (e.g. a model hidden in the model manager) or lost its key leaves the dropdown on its
// default instead of blanking.
const setModelSelect = (id, value) => {
  const select = $(id);
  if (
    value != null &&
    [...select.options].some((o) => o.value === value && !o.disabled)
  )
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
  // A remembered custom model overrides the dropdown, so its "Nâng cao" section opens to show it.
  const imageCustom = lsGet(MODEL_STORE.imageCustom);
  if (imageCustom) $("imageModelCustom").value = imageCustom;
  $("imageAdvanced").open = Boolean(imageCustom);
  const motionCustom = lsGet(MODEL_STORE.motionCustom);
  if (motionCustom) $("motionModelCustom").value = motionCustom;
  $("motionAdvanced").open = Boolean(motionCustom);
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
    ? `${m.label}: ${m.durations}`
    : id
      ? `${id}: model tuỳ chỉnh, server tự làm tròn độ dài`
      : "";
}

// Live full-prompt length: fixed template overhead (from the server) + the scene prompt being
// typed. Only Replicate Seedream enforces a limit, so only then is the budget shown — with the
// share the template already uses, since that is what leaves little room for the scene prompt.
// The count turns red when it would fail.
function updatePromptCount() {
  const el = $("promptCount");
  const s = current();
  if (!s || s.kind !== "ai") {
    el.textContent = "";
    el.classList.remove("over");
    return;
  }
  const overhead = s.promptOverhead ?? 0;
  const total = overhead + $("promptBox").value.length;
  const seedream = effectiveImageModel().startsWith("bytedance/seedream");
  const limit = state.seedreamPromptLimit ?? 4000;
  el.textContent = seedream
    ? `${total} / ${limit} ký tự (template ${overhead})`
    : `${total} ký tự`;
  el.classList.toggle("over", seedream && total > limit);
}

function charById(id) {
  return (state.characterList || []).find((c) => c.id === id) ?? null;
}

// One colour per character, by its order in the plan's ## characters block (a project has at most
// five). Chosen to stay apart from the accent teal, the image blue, the motion amber and the
// danger red, so a character dot never reads as a status. The name always travels with the dot
// (label in the strip, title/aria-label on clips): colour is never the only cue.
const CHAR_COLORS = ["#a78bfa", "#f472b6", "#a3c45a", "#f08c4a", "#d8dde3"];
function charColor(id) {
  const i = (state.characterList || []).findIndex((c) => c.id === id);
  return CHAR_COLORS[Math.max(i, 0) % CHAR_COLORS.length];
}
const charDotHtml = (id) =>
  `<span class="char-dot" style="--char-color:${charColor(id)}" aria-hidden="true"></span>`;

// The workbench rail and the timeline cast strip show the same cards; CSS lays them out.
const CHAR_GALLERY_IDS = ["charGallery", "tlCharGallery"];
// The strip shows the actions as icons only; the rail shows their labels.
const CHAR_ICON_PROFILE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const CHAR_ICON_UPLOAD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>';
const CHAR_ICON_REPLACE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>';
const CHAR_ICON_GENERATE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 15v4M17 17h4"/></svg>';

function renderCharGallery() {
  const list = state.characterList || [];
  const html = list
    .map((c) => {
      const thumbs = c.refUrl
        ? `<img class="char-thumb" src="${c.refUrl}" alt="Ảnh tham chiếu của ${escapeHtml(c.name)}" loading="lazy" title="Ảnh tham chiếu" />`
        : '<span class="char-thumb blank">?</span>';
      return `<div class="char-card">
        <div class="char-thumbs">${thumbs}</div>
        <div class="char-meta">
          <span class="char-name">${charDotHtml(c.id)}${escapeHtml(c.name)}</span>
          <span class="char-id num">${escapeHtml(c.id)}</span>
          <div class="char-actions">
            <button type="button" class="char-action" data-action="profile" data-id="${escapeHtml(c.id)}" title="Hồ sơ" aria-label="Hồ sơ ${escapeHtml(c.name)}">${CHAR_ICON_PROFILE}<span class="char-action-label">Hồ sơ</span></button>
            <button type="button" class="char-action" data-action="upload" data-id="${escapeHtml(c.id)}" title="Tải ảnh ref" aria-label="Tải ảnh ref ${escapeHtml(c.name)}">${CHAR_ICON_UPLOAD}<span class="char-action-label">Tải ảnh ref</span></button>
            <button type="button" class="char-action" data-action="generate" data-id="${escapeHtml(c.id)}" title="Tạo ảnh ref bằng AI, từ mô tả hoặc từ ảnh" aria-label="Tạo ảnh ref cho ${escapeHtml(c.name)}">${CHAR_ICON_GENERATE}<span class="char-action-label">Tạo ảnh</span></button>
            <button type="button" class="char-action" data-action="replace" data-id="${escapeHtml(c.id)}" title="Thay bằng nhân vật từ project khác (giữ id và các scene)" aria-label="Thay ${escapeHtml(c.name)} bằng nhân vật từ project khác">${CHAR_ICON_REPLACE}<span class="char-action-label">Thay</span></button>
          </div>
        </div>
      </div>`;
    })
    .join("");
  for (const id of CHAR_GALLERY_IDS) $(id).innerHTML = html;
}

function syncSetupBlock(s) {
  if (document.activeElement !== $("titleBox"))
    $("titleBox").value = s.title || "";
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
  // Render reads every image and audio file, so it waits for both lanes (and blocks new audio
  // while it runs).
  $("btnRender").disabled =
    Boolean(globalOp) ||
    anyJobActive() ||
    !(total > 0 && done.img === total && done.aud === total);

  if (!lanes.media.running && !orphanJobs.length && !globalOp) {
    if (aiDone < ai.length)
      setConsole("idle", `Còn ${ai.length - aiDone} ảnh cần sinh`);
    else if (done.aud < total)
      setConsole("idle", `Còn ${total - done.aud} scene cần audio`);
    else if (done.img === total)
      setConsole("idle", "Ảnh và audio đã đủ. Có thể render.");
  }
}

function renderRail() {
  const list = shownScenes();
  $("railList").innerHTML = list
    .map((s) => {
      const thumb = s.hasImage
        ? `<img class="thumb" src="${s.imageUrl}" alt="" loading="lazy" />`
        : '<span class="thumb blank">?</span>';
      const { mark } = sceneJobStatus(s.scene);
      const jobMark = mark
        ? `<span class="job-mark ${mark}">${mark === "running" ? "đang chạy" : "chờ"}</span>`
        : "";
      return `<li class="rail-row${selected.has(s.scene) ? " selected" : ""}" data-scene="${s.scene}">
      <input type="checkbox" class="rail-check" data-role="pick" ${selected.has(s.scene) ? "checked" : ""} title="Chọn scene ${s.scene}" aria-label="Chọn scene ${s.scene}" />
      <button type="button" class="rail-item" data-scene="${s.scene}" aria-current="${s.scene === currentScene}">
        ${thumb}
        <span class="meta">
          <span class="no num">Scene ${s.scene}${jobMark}</span>
          ${pips(s)}
          <span class="line">${escapeHtml((s.narration || "").slice(0, 70)) || "chưa có narration"}</span>
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
      '<li class="line" style="padding:14px;color:var(--faint)">Không có scene nào khớp bộ lọc.</li>';
  renderSelection();
}

function renderStage() {
  const s = current();
  const canvas = $("canvas");
  canvas.querySelector(".frame")?.remove();
  syncStageJob(s);

  if (!s) {
    $("canvasEmpty").hidden = false;
    $("canvasEmptyText").textContent = "Chưa có scene nào trong scene-plan.md.";
    $("stScene").textContent = "Scene";
    for (const id of ["stKind", "stSource", "stState"]) $(id).hidden = true;
    $("inspector").style.opacity = ".4";
    return;
  }
  $("inspector").style.opacity = "1";

  const status = sceneStatus(s);
  $("stScene").textContent = `Scene ${s.scene}`;
  $("stKind").hidden = false;
  $("stKind").textContent = s.kind === "ai" ? "AI" : "TÌM ẢNH";
  $("stSource").hidden = s.source !== "upload";
  $("stSource").textContent = "ảnh của bạn";
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
        ? "Scene tìm ảnh. Tìm nguồn ảnh, hoặc thả ảnh của bạn vào đây."
        : "Chưa sinh ảnh. Sinh từ prompt, hoặc thả ảnh vào đây.";
  }

  const audio = $("audioPlayer");
  audio.hidden = !s.hasAudio;
  $("audioMissing").hidden = s.hasAudio;
  $("audioStale").hidden = !s.audioStale;
  if (s.hasAudio && audio.getAttribute("src") !== s.audioUrl)
    audio.src = s.audioUrl;
  // Scene-scoped locks: a pending job turns only this scene's button of its kind into Cancel,
  // and direct file edits (upload/undo/remove) wait only while this scene's media is written.
  const mediaLocked = Boolean(globalOp) || sceneMediaBusy(s.scene);
  const canMotion = !globalOp && s.hasImage && s.hasAudio;
  syncGenButton(
    $("btnMotionVideo"),
    "motion",
    s.scene,
    s.hasMotionVideo ? "Sinh lại motion video" : "Sinh motion video",
    canMotion,
  );
  syncGenButton(
    $("btnRowGenMotion"),
    "motion",
    s.scene,
    s.hasMotionVideo ? "Sinh lại" : "Sinh",
    canMotion,
    true,
  );
  const motionNeeds =
    s.hasImage && s.hasAudio
      ? ""
      : "Cần có ảnh và audio trước (độ dài video khớp theo audio)";
  $("btnMotionVideo").title = motionNeeds;
  $("btnRowGenMotion").title =
    motionNeeds ||
    "Sinh motion video cho scene này (model, độ dài ở popup Sửa)";
  $("btnUploadMotionVideo").textContent = s.hasMotionVideo
    ? "Thay motion video"
    : "Tải video thay thế";
  $("btnUploadMotionVideo").disabled = mediaLocked;
  renderMotionParts(s);
  $("motionVideoWrap").hidden = !s.hasMotionVideo;
  if (s.hasMotionVideo) {
    const v = $("motionVideo");
    // Poster = the scene still, so the player takes the clip's 9:16 aspect and fills the pane
    // like the image on the left, instead of collapsing to the browser's default 300x150 box.
    if (s.hasImage) v.poster = s.imageUrl;
    if (v.getAttribute("src") !== s.motionVideoUrl) v.src = s.motionVideoUrl;
  }
  $("btnRemoveMotionVideo").hidden = !s.hasMotionVideo;
  $("btnRemoveMotionVideo").disabled = mediaLocked;
  syncHistoryButtons(s, mediaLocked);

  setStageState("stageImgState", s.hasImage);
  setStageState("stageAudState", s.hasAudio);
  if (s.audioStale) {
    $("stageAudState").textContent = "audio cũ";
    $("stageAudState").classList.remove("on");
  }
  $("stageAudState").classList.toggle("stale", Boolean(s.audioStale));
  setStageState("stageMotState", s.hasMotionVideo);

  syncSetupBlock(s);
  syncInspector(s);
}

// The canvas veil covers the stage only while *this* scene's media is being written; queued
// jobs and running audio show as a chip that leaves the image visible and droppable.
function syncStageJob(s) {
  const canvas = $("canvas");
  canvas.querySelector(".working")?.remove();
  canvas.querySelector(".job-chip")?.remove();
  const { work, notes } = s
    ? sceneJobStatus(s.scene)
    : { work: null, notes: [] };
  const cover = work ?? globalOp;
  if (cover) {
    const veil = document.createElement("div");
    veil.className = "working";
    veil.innerHTML = `<span class="spinner"></span><span>${escapeHtml(cover)}</span>`;
    canvas.appendChild(veil);
  }
  if (notes.length) {
    const chip = document.createElement("span");
    chip.className = "job-chip";
    chip.textContent = notes.join(" · ");
    canvas.appendChild(chip);
  }
}

// The `kind` job covering scene n is running for it right now, not just waiting its turn
// (queued, or later in a running batch).
const sceneJobRunning = (kind, n) =>
  Object.values(lanes).some(
    ({ running: j }) =>
      j?.kind === kind &&
      jobCovers(j, n) &&
      (j.current === n || j.scenes.length === 1),
  );

// A generate button doubles as its scene's Cancel while that job is pending, so a scene is
// stopped from where it was started. `idle` is the start label and `canStart` its usual gate;
// `short` keeps the label to one word for the compact row and script buttons.
function syncGenButton(btn, kind, n, idle, canStart, short = false) {
  const pending = hasPending(kind, n);
  btn.classList.toggle("is-cancel", pending);
  btn.textContent = !pending
    ? idle
    : short
      ? "Huỷ"
      : sceneJobRunning(kind, n)
        ? "Huỷ · đang chạy"
        : "Huỷ · đang chờ";
  btn.disabled = pending ? false : !canStart;
}

// Click handler for a generate button synced by syncGenButton: cancel when pending, else start.
const genOrCancel = (kind, start) => () => {
  const s = current();
  if (!s) return;
  if (hasPending(kind, s.scene)) cancelSceneJob(kind, s.scene);
  else start(s);
};

// Stage-header done pill: shape (filled dot via .on) + word, matching the rail pips.
function setStageState(id, done) {
  const el = $(id);
  el.textContent = done ? "xong" : "chưa có";
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
    syncGenButton(
      $("btnGen"),
      "image",
      s.scene,
      s.hasImage ? "Sinh lại ảnh" : "Sinh ảnh",
      !globalOp,
    );
    $("btnGenPrompt").disabled =
      Boolean(globalOp) ||
      hasPending("prompt", s.scene) ||
      !(s.narration || "").trim();
  } else {
    $("searchQuery").textContent = s.query || "chưa có từ khoá";
  }

  $("btnUpload").textContent = s.hasImage
    ? "Thay bằng ảnh của bạn"
    : "Tải ảnh của bạn lên";
  $("btnUpload").disabled = Boolean(globalOp) || sceneMediaBusy(s.scene);
  // The row button reads the saved prompt (generateImage saves a draft first), so it needs one.
  const hasPrompt = Boolean(
    (drafts.prompt.get(s.scene) ?? s.prompt ?? "").trim(),
  );
  syncGenButton(
    $("btnRowGenImage"),
    "image",
    s.scene,
    s.hasImage ? "Sinh lại" : "Sinh",
    !globalOp && isAi && hasPrompt,
    true,
  );
  $("btnRowGenImage").title = !isAi
    ? "Scene tìm ảnh — không sinh bằng AI; tải ảnh lên trong popup Sửa"
    : hasPrompt
      ? "Sinh ảnh cho scene này từ prompt (model ở popup Sửa)"
      : "Chưa có prompt — viết prompt trong popup Sửa";
  syncGenButton(
    $("btnAudio"),
    "audio",
    s.scene,
    s.hasAudio ? "Sinh lại audio" : "Sinh audio",
    !globalOp && !renderActive() && Boolean((s.narration || "").trim()),
  );
  updatePromptCount();
  showError("");
}

function markDirty(field, saveBtn, hint, dirty) {
  field.classList.toggle("dirty", dirty);
  saveBtn.disabled = !dirty;
  hint.textContent = dirty ? "chưa lưu" : "";
  hint.classList.toggle("dirty", dirty);
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

// Selection is shared by the rail (workbench) and the timeline clips. This keeps every
// selection-driven control in both places in sync from the one `selected` Set, so a scene
// ticked in the rail also reads as ticked on the timeline, and vice versa.
// Motion length follows the scene's audio, so a scene needs both image and audio. When none of the
// target scenes qualifies the button is off — say which scene lacks what, instead of a bare grey.
const MOTION_BATCH_TITLE =
  "Sinh motion video cho các scene đã chọn (cần có ảnh + audio)";
function motionBatchTitle(targets, eligibleCount) {
  if (eligibleCount > 0 || !targets.length) return MOTION_BATCH_TITLE;
  const noImage = targets.filter((s) => !s.hasImage).map((s) => s.scene);
  const noAudio = targets
    .filter((s) => s.hasImage && !s.hasAudio)
    .map((s) => s.scene);
  const reasons = [];
  if (noImage.length) reasons.push(`scene ${sceneList(noImage)} chưa có ảnh`);
  if (noAudio.length)
    reasons.push(
      `scene ${sceneList(noAudio)} chưa có audio — sinh audio trước, vì độ dài motion video khớp audio`,
    );
  return `Chưa chạy được: ${reasons.join("; ")}.`;
}

function renderSelection() {
  for (const n of [...selected]) if (!findScene(n)) selected.delete(n);
  const chosen = state.scenes.filter((s) => selected.has(s.scene));
  const targetNums = batchTargets();
  const targets = state.scenes.filter((s) => targetNums.includes(s.scene));
  const hasNarr = (s) => (s.narration || "").trim().length > 0;
  const aiCount = targets.filter((s) => s.kind === "ai").length;
  // Prompt- and audio-generation both read a scene's narration, so a scene without one
  // isn't actionable — mirror the single-scene btnGenPrompt/btnAudio gates instead of
  // gating on a bare selection count that would enable a no-op batch run.
  const promptEligible = targets.filter(
    (s) => s.kind === "ai" && hasNarr(s),
  ).length;
  const audioEligible = targets.filter(hasNarr).length;
  const motionEligibleCount = targets.filter(
    (s) => s.hasImage && s.hasAudio,
  ).length;

  const nums = chosen.map((s) => s.scene);
  const info = chosen.length
    ? `Đã chọn <b>${chosen.length}</b>/${state.scenes.length} · ${sceneList(nums)}`
    : targets.length
      ? `Chưa chọn · chạy cho scene <b>${targets[0].scene}</b>`
      : "Chưa chọn scene nào";
  const fullList = chosen.length ? `Scene ${nums.join(", ")}` : "";
  for (const id of ["tlSelInfo", "railSelInfo"]) {
    $(id).innerHTML = info;
    $(id).title = fullList;
  }

  // Batches queue behind running jobs (enqueueJob drops scenes already pending), so only a
  // project switch blocks them — plus a render for audio, which must not rewrite files it reads.
  // Merge rewrites the plan blocks of every selected scene, so it waits while any of them has
  // work pending.
  const locked = Boolean(globalOp);
  const disPrompt = locked || promptEligible === 0;
  const disImg = locked || aiCount === 0;
  const disAud = locked || renderActive() || audioEligible === 0;
  const disMotion = locked || motionEligibleCount === 0;
  const disMerge =
    locked ||
    chosen.some((s) => sceneInAnyLane(s.scene)) ||
    !isContiguousSelection(chosen.map((s) => s.scene));
  $("batchImg").disabled = disImg;
  $("batchAud").disabled = disAud;
  $("batchMotion").disabled = disMotion;
  $("batchMotion").title = $("railBatchMotion").title = motionBatchTitle(
    targets,
    motionEligibleCount,
  );
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

  for (const cell of $("tlClips").querySelectorAll(".tl-cell")) {
    const on = selected.has(Number(cell.dataset.scene));
    cell.classList.toggle("selected", on);
    cell.querySelector(".tl-clip")?.setAttribute("aria-pressed", String(on));
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
  renderSelection(); // the batch bars target this scene while nothing is selected
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
  $("viewTimeline").setAttribute("aria-pressed", String(next === "timeline"));
  document.dispatchEvent(new CustomEvent("studio:view", { detail: next }));
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

async function refresh() {
  state = await api("/api/state");
  render();
}

// Re-read the state when a scene of a running batch finishes, so its new image/audio/clip shows
// at once instead of after the whole job. Calls landing during a refresh collapse into one more.
let refreshInFlight = false;
let refreshQueued = false;
async function refreshSoon() {
  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }
  refreshInFlight = true;
  try {
    await refresh();
  } catch {
    // the next scene or the job's final refresh retries
  } finally {
    refreshInFlight = false;
    if (refreshQueued) {
      refreshQueued = false;
      refreshSoon();
    }
  }
}

// Unsaved edits and selection are per-project; carrying them across a switch would silently
// apply scene N's draft narration/prompt to a different project's scene N.
function clearProjectLocalState() {
  drafts.prompt.clear();
  drafts.narr.clear();
  drafts.motion.clear();
  selected.clear();
  currentScene = null;
}

async function switchProject(slug) {
  // Blocked while any job is running or queued: switching changes the server's active-project
  // paths, which an in-flight job would otherwise write into (the server also refuses with 409).
  if (globalOp || anyJobActive() || !slug || slug === state.project?.slug) {
    renderProjectSwitch();
    return;
  }
  globalOp = `đang chuyển sang ${slug}`;
  syncJobUi();
  try {
    clearProjectLocalState();
    state = await api("/api/project", { slug });
    render();
    toast(
      `Đã chuyển sang "${state.project.title}" (style: ${state.project.template}).`,
    );
  } catch (e) {
    toast(e.message, false);
    renderProjectSwitch();
  } finally {
    globalOp = null;
    syncJobUi();
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
      camera: s.camera ?? "",
      action: s.action ?? "",
      env: s.env ?? "",
      camera_vi: s.cameraVi ?? "",
      action_vi: s.actionVi ?? "",
      env_vi: s.envVi ?? "",
    })),
    null,
    2,
  );
}

// POST an SSE endpoint and hand each event to onEvent(type, line). A request refused before the
// stream opens (validation error) comes back as JSON, and is thrown as an Error.
// The server cancels a job only on POST /api/cancel, never when its stream drops, so a page
// reload leaves the job running (the reloaded panel finds it via /api/jobs). Aborting `signal`
// is the panel's Cancel: it closes the stream and sends that cancel. `job` ({ label, kind,
// scenes }) describes it in /api/jobs, so a reloaded panel can show it and lock its scenes.
async function readSse(path, body, signal, onEvent, job = {}) {
  const jobId = crypto.randomUUID();
  const cancel = () =>
    fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: jobId }),
    }).catch(() => {});
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const headers = {
      "X-Job-Id": jobId,
      "X-Job-Label": encodeURIComponent(job.label ?? ""),
      "X-Job-Kind": job.kind ?? "",
      "X-Job-Scenes": (job.scenes ?? []).join(","),
    };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(path, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText);
    }
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
        if (raw) onEvent(type, JSON.parse(raw));
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

// Which providers stop a generation when it is cancelled (scripts/lib/*-image|video.mjs).
const CANCEL_PROVIDER_NOTE =
  "Replicate huỷ luôn prediction; muse2api/Plenx không có API huỷ nên job vẫn chạy xong bên đó (có thể vẫn tính phí), kết quả bị bỏ.";

// Media-lane runner: streams the job's SSE endpoint into the console. Opens the log on failure
// only, so a successful run never covers the scene you were looking at. Cancel aborts the
// job's controller, which closes the fetch and tells the server to stop the scene in flight too (see CANCEL_PROVIDER_NOTE for what that means at the provider).
const consoleJob = (path, bodyFor, onDone) => async (job) => {
  const log = $("conLog");
  log.textContent = "";
  setConsole("running", job.label);
  let failed = false;
  try {
    await readSse(
      path,
      bodyFor(job.scenes),
      job.controller.signal,
      (type, line) => {
        log.textContent +=
          (type === "done" ? "✓ " : type === "error" ? "✗ " : "") + line + "\n";
        log.scrollTop = log.scrollHeight;
        if (type === "log") {
          setConsole("running", job.label, line);
          trackSceneProgress(job, line);
        } else if (type === "done") {
          setConsole("idle", line);
          toast(line);
          onDone?.();
        } else if (type === "error") {
          failed = true;
          setConsole("error", line);
          toast(line, false);
        }
      },
      job,
    );
  } catch (e) {
    if (e.name === "AbortError") {
      log.textContent += `• ${job.cancelNote ?? "Đã huỷ"}. ${CANCEL_PROVIDER_NOTE}\n`;
      setConsole("idle", job.cancelNote ?? "Đã huỷ");
      // A per-scene cancel already toasted from cancelSceneJob.
      if (!job.cancelNote) toast(`Đã huỷ. ${CANCEL_PROVIDER_NOTE}`, false);
    } else {
      failed = true;
      log.textContent += `✗ ${e.message}\n`;
      setConsole("error", e.message);
      toast(e.message, false);
    }
  } finally {
    if (failed) openLog(true);
  }
};

// Audio-lane runner. It never touches the shared console or Cancel button, so an audio run and
// a media run proceed at once without their logs colliding; progress shows on the scene's audio
// button and rail mark, the result comes via toast. An error toast carries the last log line,
// since the exit code alone does not say what OmniVoice complained about.
// A cancel (cancelSceneJob, which toasts itself) ends the run quietly; the server kills the
// TTS child process on the cancel readSse sends.
const quietJob = (path, bodyFor) => async (job) => {
  let lastLog = "";
  try {
    await readSse(
      path,
      bodyFor(job.scenes),
      job.controller.signal,
      (type, line) => {
        if (type === "log") {
          lastLog = line;
          trackSceneProgress(job, line);
        } else if (type === "done") toast(line);
        else if (type === "error")
          toast(lastLog ? `${line} — ${lastLog}` : line, false);
      },
      job,
    );
  } catch (e) {
    if (e.name !== "AbortError") throw e;
  }
};

// Scene numbers as compact runs, e.g. [1,2,3,5,7,8] → "1–3, 5, 7–8"; keeps labels one line long
// even when every scene of a long plan is selected.
const sceneList = (scenes) => {
  const sorted = [...scenes].sort((a, b) => a - b);
  const runs = [];
  for (const n of sorted) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
};
const enqueueImages = (scenes, model) =>
  enqueueJob({
    lane: "media",
    kind: "image",
    scenes,
    label: (ns) => `Đang sinh ảnh cho scene ${sceneList(ns)}`,
    run: consoleJob("/api/generate-batch", (ns) => ({ scenes: ns, model })),
  });
const enqueueMotions = (scenes, model) =>
  enqueueJob({
    lane: "media",
    kind: "motion",
    scenes,
    label: (ns) =>
      `Đang sinh motion video cho scene ${sceneList(ns)} (${model})`,
    run: consoleJob("/api/generate-motion-videos-batch", (ns) => ({
      scenes: ns,
      model,
    })),
  });
const enqueueAudio = (scenes) =>
  enqueueJob({
    lane: "audio",
    kind: "audio",
    scenes,
    label: (ns) => `Sinh audio cho scene ${sceneList(ns)}`,
    run: quietJob("/api/audio-batch", (ns) => ({ scenes: ns })),
  });

function openLog(open) {
  $("console").classList.toggle("open", open);
  $("conToggle").setAttribute("aria-expanded", String(open));
  $("conToggle").textContent = open ? "Ẩn log" : "Xem log";
}

async function saveField(kind, value) {
  const s = current();
  if (!s) return;
  const isPrompt = kind === "prompt";
  const btn = isPrompt ? $("promptSave") : $("narrSave");
  btn.disabled = true;
  btn.textContent = "Đang lưu...";
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
      s.audioStale = res.audioStale;
      drafts.narr.delete(s.scene);
    }
    showError("");
    renderRail();
    renderStage();
    toast(`Scene ${s.scene}: đã lưu ${kind}.`);
  } catch (e) {
    showError(e.message);
  } finally {
    btn.textContent = isPrompt ? "Lưu prompt" : "Lưu narration";
  }
}

// ------------------------------------------------------------------ motion (camera / action / env)
//
// The motion popup edits the scene's three motion fields; the server wraps them into the full
// prompt (see the preview). Unsaved edits live in drafts.motion as { camera, action, env }.
const MOTION_PART_BOXES = {
  camera: "motionCameraBox",
  action: "motionActionBox",
  env: "motionEnvBox",
};
const motionPartsOf = (s) => ({
  camera: s.camera ?? "",
  action: s.action ?? "",
  env: s.env ?? "",
});
const motionBoxValues = () =>
  Object.fromEntries(
    Object.entries(MOTION_PART_BOXES).map(([part, id]) => [
      part,
      $(id).value.trim(),
    ]),
  );
const motionPartsDirty = (s) => {
  const saved = motionPartsOf(s);
  const now = motionBoxValues();
  return Object.keys(saved).some((k) => now[k] !== saved[k].trim());
};
// Mark each edited box, and the shared save button + hint once for all three.
function syncMotionDirty(s) {
  const saved = motionPartsOf(s);
  for (const [part, id] of Object.entries(MOTION_PART_BOXES))
    $(id).classList.toggle("dirty", $(id).value.trim() !== saved[part].trim());
  const dirty = motionPartsDirty(s);
  $("motionSave").disabled = !dirty;
  $("motionHint").textContent = dirty ? "chưa lưu" : "";
  $("motionHint").classList.toggle("dirty", dirty);
}

function renderMotionParts(s) {
  const draft = drafts.motion.get(s.scene);
  const saved = motionPartsOf(s);
  for (const [part, id] of Object.entries(MOTION_PART_BOXES)) {
    if (document.activeElement !== $(id))
      $(id).value = draft ? draft[part] : saved[part];
  }
  const hasParts = Object.values(saved).some((v) => v.trim());
  $("motionLegacyNote").hidden = hasParts || !(s.motion || "").trim();
  $("motionPreview").textContent = s.motionPrompt ?? "";
  $("motionWrite").disabled =
    Boolean(globalOp) || s.kind !== "ai" || hasPending("motionPrompt", s.scene);
  syncMotionDirty(s);
}

// Saved through the bulk scene patch, the same writer the script editor uses.
async function saveMotionParts() {
  const s = current();
  if (!s) return;
  const btn = $("motionSave");
  btn.disabled = true;
  btn.textContent = "Đang lưu...";
  try {
    await api("/api/scenes-update", {
      scenes: [{ scene: s.scene, ...motionBoxValues() }],
    });
    drafts.motion.delete(s.scene);
    await refresh();
    toast(`Scene ${s.scene}: đã lưu motion.`);
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.textContent = "Lưu motion";
  }
}

// LLM motion writing reads the plan, not the popup, so it overwrites the three saved fields.
const enqueueMotionPrompts = (scenes) =>
  enqueueJob({
    lane: "media",
    kind: "motionPrompt",
    scenes,
    label: (ns) => `Đang viết motion cho scene ${sceneList(ns)}`,
    run: consoleJob("/api/generate-motion-prompts-batch", (ns) => ({
      scenes: ns,
    })),
  });

async function generateImage() {
  const s = current();
  if (!s) return;
  const prompt = $("promptBox").value;
  if (!prompt.trim()) {
    showError("Prompt đang trống.");
    return;
  }
  if (prompt.trim() !== (s.prompt ?? "").trim())
    await saveField("prompt", prompt);

  const model = effectiveImageModel();
  // Streamed so the Replicate call is logged in the panel console (Show log).
  enqueueJob({
    lane: "media",
    kind: "image",
    scenes: [s.scene],
    label: () => `Đang sinh ảnh cho scene ${s.scene}`,
    run: consoleJob("/api/generate", () => ({ scene: s.scene, model })),
  });
}

// Queued like an image so "write prompt, then generate" can be lined up back to back; the
// image job reads the plan when it starts, so it picks up the freshly written prompt.
function generatePromptFromNarration() {
  const s = current();
  if (!s) return;
  if (!(s.narration || "").trim()) {
    showError("Narration đang trống — viết narration trước.");
    return;
  }
  enqueueScenePrompt(s.scene);
}

function enqueueScenePrompt(n) {
  enqueueJob({
    lane: "media",
    kind: "prompt",
    scenes: [n],
    label: () => `Đang viết prompt cho scene ${n} từ narration`,
    cancellable: false,
    run: async (job) => {
      setConsole("running", job.label);
      try {
        await api("/api/generate-prompt", { scene: n });
        setConsole("idle", `Scene ${n}: đã viết prompt.`);
        toast(`Scene ${n}: đã viết prompt từ narration.`);
      } catch (e) {
        setConsole("error", e.message);
        toast(e.message, false);
      }
    },
  });
}

async function uploadImage(file) {
  const s = current();
  if (!s || !file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    showError("Dùng ảnh PNG, JPEG hoặc WebP.");
    return;
  }
  await withSceneOp(s.scene, "đang tải lên", async () => {
    try {
      const res = await fetch(`/api/upload?scene=${s.scene}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: await file.arrayBuffer(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      toast(`Scene ${s.scene}: đã thay bằng ảnh của bạn.`);
      await refresh();
    } catch (e) {
      showError(e.message);
      toast(e.message, false);
    }
  });
}

async function uploadMotionVideo(file) {
  const s = current();
  if (!s || !file) return;
  const isSupportedVideo =
    /^(video\/mp4|video\/quicktime)$/.test(file.type) ||
    /\.(mp4|mov)$/i.test(file.name);
  if (!isSupportedVideo) {
    showError("Dùng video MP4 hoặc MOV.");
    return;
  }
  await withSceneOp(s.scene, "đang tải video thay thế", async () => {
    try {
      const res = await fetch(`/api/upload-motion-video?scene=${s.scene}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: await file.arrayBuffer(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      toast(`Scene ${s.scene}: đã tải video thay thế.`);
      await refresh();
    } catch (e) {
      showError(e.message);
      toast(e.message, false);
    }
  });
}

// Undo / redo of a scene's image, audio or motion video (server keeps the last steps of each).
const HISTORY_KINDS = [
  { kind: "image", id: "Image", label: "ảnh" },
  { kind: "audio", id: "Audio", label: "audio" },
  { kind: "motion", id: "Motion", label: "motion video" },
];
const HISTORY_DIRECTIONS = [
  { direction: "undo", id: "Undo", verb: "hoàn tác" },
  { direction: "redo", id: "Redo", verb: "làm lại" },
];

// A button shows only while its direction has steps; its count is how many. Audio is not covered
// by sceneMediaBusy, but a step rewrites the file a pending audio job would write, so it waits too.
function syncHistoryButtons(s, mediaLocked) {
  for (const { kind, id } of HISTORY_KINDS) {
    const steps = s.history?.[kind] ?? { undo: 0, redo: 0 };
    const locked =
      kind === "audio"
        ? Boolean(globalOp) || sceneInAnyLane(s.scene)
        : mediaLocked;
    for (const { direction, id: directionId } of HISTORY_DIRECTIONS) {
      const btn = $(`btn${directionId}${id}`);
      btn.hidden = steps[direction] === 0;
      btn.disabled = locked;
      btn.querySelector(".count").textContent = `(${steps[direction]})`;
    }
  }
}

async function stepHistory(direction, kind) {
  const s = current();
  if (!s) return;
  const { label } = HISTORY_KINDS.find((k) => k.kind === kind);
  const { verb } = HISTORY_DIRECTIONS.find((d) => d.direction === direction);
  if (kind === "audio" && sceneInAnyLane(s.scene)) {
    toast(`Scene ${s.scene} đang có job — chờ xong rồi ${verb} audio.`, false);
    return;
  }
  await withSceneOp(
    s.scene,
    `đang ${verb} ${label} của scene ${s.scene}`,
    async () => {
      try {
        state = await api(`/api/${direction}`, { scene: s.scene, kind });
        render();
        toast(`Scene ${s.scene}: đã ${verb} ${label}.`);
      } catch (e) {
        toast(e.message, false);
      }
    },
  );
}

async function removeMotionVideo() {
  const s = current();
  if (!s?.hasMotionVideo) return;
  await withSceneOp(
    s.scene,
    `đang bỏ motion video của scene ${s.scene}`,
    async () => {
      try {
        state = await api("/api/remove-motion-video", { scene: s.scene });
        render();
        toast(`Scene ${s.scene}: dùng ảnh gốc thay video.`);
      } catch (e) {
        toast(e.message, false);
      }
    },
  );
}

// Where a "Dịch" button's stored Vietnamese lives: the current scene's promptVi/motionVi, or a
// template field's `<key>_vi`. Authored up front (skills / OpenAI prompt writer) and served in
// state, so no translation service is ever called.
function resolveVi(key) {
  if (key === "scenePrompt") return current()?.promptVi || "";
  if (key === "sceneMotion") {
    const s = current();
    if (!s) return "";
    const parts = [
      ["Camera", s.cameraVi],
      ["Nhân vật", s.actionVi],
      ["Môi trường", s.envVi],
    ].filter(([, vi]) => (vi || "").trim());
    return parts.length
      ? parts.map(([label, vi]) => `${label}: ${vi}`).join("\n")
      : s.motionVi || "";
  }
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
  syncStyleSelects(
    response.versions || ["default"],
    response.activeVersion || t.activeVersion || "default",
  );
  currentTemplates = t;
  for (const key of TEMPLATE_FIELDS) $(`t_${key}`).value = t[key] || "";
}

// ------------------------------------------------------------------ wiring

$("railFilter").addEventListener("change", (e) => {
  filter = e.target.value;
  renderRail();
});

for (const btn of [$("viewStage"), $("viewTimeline")])
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
for (const id of Object.values(MOTION_PART_BOXES)) {
  $(id).addEventListener("input", () => {
    const s = current();
    if (!s) return;
    drafts.motion.set(s.scene, motionBoxValues());
    syncMotionDirty(s);
  });
}
$("motionSave").addEventListener("click", saveMotionParts);
$("motionWrite").addEventListener("click", () => {
  const s = current();
  if (!s) return;
  if (motionPartsDirty(s)) {
    toast("Lưu hoặc huỷ sửa motion trước khi viết bằng AI.", false);
    return;
  }
  enqueueMotionPrompts([s.scene]);
});
$("promptSave").addEventListener("click", () =>
  saveField("prompt", $("promptBox").value),
);
$("btnGen").addEventListener("click", genOrCancel("image", generateImage));
$("btnRowGenImage").addEventListener(
  "click",
  genOrCancel("image", generateImage),
);
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

$("btnAudio").addEventListener(
  "click",
  genOrCancel("audio", (s) => enqueueAudio([s.scene])),
);
$("btnMotionVideo").addEventListener(
  "click",
  genOrCancel("motion", generateMotionVideo),
);
$("btnRowGenMotion").addEventListener(
  "click",
  genOrCancel("motion", generateMotionVideo),
);
// Reads the motion popup's fields even when it is closed — they always mirror the scene.
function generateMotionVideo(s) {
  const model = effectiveMotionModel();
  // Empty duration box = auto (server matches the narration audio); a number overrides it.
  const durVal = Number($("motionDurationBox").value);
  // Send the popup's camera / action / env (saved or not); all empty falls back to the scene's
  // older single-line motion, then to the server's auto-built prompt.
  const body = { scene: s.scene, model, ...motionBoxValues() };
  if (Number.isFinite(durVal) && durVal > 0) body.duration = durVal;
  enqueueJob({
    lane: "media",
    kind: "motion",
    scenes: [s.scene],
    label: () => `Đang sinh motion video cho scene ${s.scene} (${model})`,
    run: consoleJob("/api/generate-motion-video", () => body),
  });
}
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
for (const { kind, id } of HISTORY_KINDS)
  for (const { direction, id: directionId } of HISTORY_DIRECTIONS)
    $(`btn${directionId}${id}`).addEventListener("click", () =>
      stepHistory(direction, kind),
    );
$("btnRemoveMotionVideo").addEventListener("click", removeMotionVideo);
const ASPECT_SIZES = {
  "16:9": "1920×1080",
  "9:16": "1080×1920",
  "1:1": "1080×1080",
};

// What Render MP4 produces follows the timeline preview: the 9:16 mode of a 16:9 project renders
// the master and wraps it to 1080x1920 (both files); every other mode renders the master.
function renderPlan() {
  const aspect = state.project?.aspect || "9:16";
  if (aspect === "16:9" && tl.mode === "vertical")
    return {
      format: "vertical",
      message:
        "Render bản 9:16 · 1080×1920 (Shorts / TikTok) như preview 9:16? Bản 16:9 · 1920×1080 được render trước rồi cắt dải giữa, nên có cả hai file.",
    };
  const hint =
    aspect === "16:9"
      ? " Muốn bản 9:16 cho Shorts / TikTok thì chọn 9:16 trong Timeline trước."
      : "";
  return {
    format: "wide",
    message: `Render bản ${aspect} · ${ASPECT_SIZES[aspect] ?? ""}?${hint}`,
  };
}

// Render reads every scene's files, so it covers every scene: direct edits wait until it ends.
$("btnRender").addEventListener("click", async () => {
  const { format, message } = renderPlan();
  if (!(await confirmRun(message, "Render"))) return;
  enqueueJob({
    lane: "media",
    kind: "render",
    scenes: state.scenes.map((s) => s.scene),
    label: () => "Đang đo audio, căn phụ đề, render MP4",
    run: consoleJob(
      "/api/finalize",
      () => ({ format }),
      () => {
        const stamp = Date.now();
        $("linkMp4").hidden = false;
        $("linkMp4").href = `/video?v=${stamp}`;
        $("linkMp4Vertical").hidden = format === "wide";
        $("linkMp4Vertical").href = `/video?f=9x16&v=${stamp}`;
      },
    ),
  });
});

// Changing a project's aspect re-frames the render and every new generation; media already
// generated keeps its old shape and gets cover-cropped, so ask first.
$("aspectSelect").addEventListener("change", async () => {
  const aspect = $("aspectSelect").value;
  const ok = await confirmRun(
    `Đổi tỉ lệ dự án sang ${aspect}? Không sinh lại gì. Ảnh và motion đã có giữ tỉ lệ cũ và bị crop khi render; ảnh sinh mới sẽ theo ${aspect}. Chỉ muốn xem bản 9:16 thì dùng chế độ 9:16 trong Timeline.`,
    "Đổi tỉ lệ",
  );
  if (!ok) {
    $("aspectSelect").value = state.project?.aspect || "9:16";
    return;
  }
  try {
    state = await api("/api/project-aspect", { aspect });
    render();
    toast(`Đã đổi tỉ lệ dự án sang ${aspect}.`);
  } catch (e) {
    $("aspectSelect").value = state.project?.aspect || "9:16";
    toast(e.message, false);
  }
});

// Each quick filter replaces the selection (not adds to it), so "Thiếu ảnh" after "Tất cả"
// leaves only the scenes missing an image.
const pickWhere = (test) => {
  selected.clear();
  for (const s of state.scenes) if (test(s)) selected.add(s.scene);
  renderSelection();
};
$("selAll").addEventListener("click", () => pickWhere(() => true));
$("selNeedImg").addEventListener("click", () =>
  pickWhere((s) => !s.hasImage && s.kind === "ai"),
);
$("selNeedAud").addEventListener("click", () => pickWhere((s) => !s.hasAudio));
$("selStaleAud").addEventListener("click", () => pickWhere((s) => s.audioStale));
$("selNeedPrompt").addEventListener("click", () =>
  pickWhere((s) => s.kind === "ai" && !(s.prompt || "").trim()),
);
// Same meaning as the rail's "Thiếu motion" filter: ready for a motion video, none yet.
$("selNeedMotion").addEventListener("click", () =>
  pickWhere((s) => sceneStatus(s) === "need-render"),
);
$("selNone").addEventListener("click", clearSelection);

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

// Promise-based confirm on the panel's own dialog (a native confirm() would look foreign here).
// Resolves true on the OK button ("Chạy" unless `okLabel` names the action), false on "Huỷ",
// Escape or a backdrop click.
let confirmResolve = null;
function confirmRun(message, okLabel = "Chạy", danger = false) {
  $("confirmBody").textContent = message;
  $("confirmOk").textContent = okLabel;
  $("confirmOk").classList.toggle("is-cancel", danger);
  $("confirmOverlay").hidden = false;
  $("confirmOk").focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}
function closeConfirm(answer) {
  $("confirmOverlay").hidden = true;
  confirmResolve?.(answer);
  confirmResolve = null;
}
$("confirmOk").addEventListener("click", () => closeConfirm(true));
$("confirmCancel").addEventListener("click", () => closeConfirm(false));
$("confirmOverlay").addEventListener("click", (e) => {
  if (e.target === $("confirmOverlay")) closeConfirm(false);
});

// Cost line for a batch run. `price` is USD per output (0 = free quota, null/absent = unknown).
const formatUsd = (n) => `$${n.toFixed(n < 1 ? 2 : 1)}`;
function costLine(model, count) {
  if (!model) return "Model tuỳ chỉnh — chưa rõ giá.";
  if (model.price === 0) return "Miễn phí (quota).";
  if (typeof model.price !== "number")
    return `Chưa rõ giá — kiểm tra bảng giá ${model.providerLabel || ""}.`.trim();
  return `Ước tính: ${count} × ~${formatUsd(model.price)} ≈ ${formatUsd(count * model.price)}.`;
}

// Asks before a paid batch run; a free model (price 0) runs straight away.
async function confirmBatch(kind, models, modelId, count) {
  const model = models.find((m) => m.id === modelId);
  if (model?.price === 0) return true;
  const label = model?.label ?? modelId;
  return confirmRun(
    `Sinh ${kind} cho ${count} scene bằng ${label}.\n${costLine(model, count)}`,
  );
}

// One batch action per stage, shared by the rail bar and the timeline batch bar. Both read the
// same `selected` Set and the same sticky model selects, so either entry point behaves identically.
// Prompt writing lives in the script modal instead of the timeline bar (see scriptGenHtml).
const enqueuePrompts = (scenes) =>
  enqueueJob({
    lane: "media",
    kind: "prompt",
    scenes,
    label: (ns) => `Đang viết prompt cho scene ${sceneList(ns)}`,
    run: consoleJob("/api/generate-prompts-batch", (ns) => ({ scenes: ns })),
  });
// Scenes a batch action runs on: the selection, or — with nothing selected — the scene the
// timeline playhead (or the workbench) is on, so a single click is enough to target one scene.
function batchTargets() {
  if (selected.size) return [...selected].sort((a, b) => a - b);
  return currentScene != null ? [currentScene] : [];
}
// A batch run uses up the selection: once its scenes are queued, the next pick starts empty.
// A cancelled cost confirm keeps it.
function clearSelection() {
  selected.clear();
  renderSelection();
}
const runBatchPrompts = () => {
  enqueuePrompts(batchTargets());
  clearSelection();
};
// The cost confirm counts only scenes that will actually run: enqueueJob drops the ones that
// already have the same job pending.
const runBatchImages = async () => {
  const scenes = batchTargets();
  const model = $("batchImageModelSelect").value;
  const count = state.scenes.filter(
    (s) =>
      scenes.includes(s.scene) &&
      s.kind === "ai" &&
      !hasPending("image", s.scene),
  ).length;
  if (!(await confirmBatch("ảnh", state.imageModels || [], model, count)))
    return;
  enqueueImages(scenes, model);
  clearSelection();
};
const runBatchAudio = () => {
  enqueueAudio(batchTargets());
  clearSelection();
};
const runBatchMotion = async () => {
  const scenes = batchTargets();
  const model = $("batchMotionModelSelect").value;
  const count = state.scenes.filter(
    (s) =>
      scenes.includes(s.scene) &&
      s.hasImage &&
      s.hasAudio &&
      !hasPending("motion", s.scene),
  ).length;
  if (
    !(await confirmBatch(
      "motion video",
      state.motionVideoModels || [],
      model,
      count,
    ))
  )
    return;
  enqueueMotions(scenes, model);
  clearSelection();
};
$("batchImg").addEventListener("click", runBatchImages);
$("batchAud").addEventListener("click", runBatchAudio);
$("batchMotion").addEventListener("click", runBatchMotion);
$("railBatchPrompt").addEventListener("click", runBatchPrompts);
$("railBatchImg").addEventListener("click", runBatchImages);
$("railBatchAud").addEventListener("click", runBatchAudio);
$("railBatchMotion").addEventListener("click", runBatchMotion);

// ---- Merge scenes: combine the given adjacent scenes' narration into one, dropping the
// rest of the selection's fields entirely. The dialog shows each scene's image and lets one be
// picked: that scene's image/prompt/motion/char survive, the others are removed. Its narration
// textarea previews the auto-join and can be hand-edited before confirming (a further pass stays
// open in the inspector's narration box after merging).
// Two entry points: the sheet/rail batch bar (the shared `selected` set) and the Full script
// modal's "Gộp đã chọn" button (the modal's own ticked rows, passed in).
let pendingMergeScenes = [];
function openMergeDialog(scenesArg) {
  const nums = Array.isArray(scenesArg) ? scenesArg : [...selected];
  const chosen = state.scenes
    .filter((s) => nums.includes(s.scene))
    .sort((a, b) => a.scene - b.scene);
  if (chosen.length < 2) return;
  pendingMergeScenes = chosen.map((s) => s.scene);
  $("mergeDlgInfo").textContent =
    `Gộp ${chosen.length} scene: ${chosen.map((s) => s.scene).join(", ")}`;
  // Default to the first scene that already has an image, so a merge does not drop a real one.
  const keepDefault = (chosen.find((s) => s.hasImage) ?? chosen[0]).scene;
  const aspect = (state.project?.aspect || "16:9").replace(":", " / ");
  $("mergeKeepPicker").style.setProperty("--merge-aspect", aspect);
  $("mergeKeepPicker").innerHTML = chosen
    .map((s) => {
      const on = s.scene === keepDefault;
      const thumb = s.imageUrl
        ? `<img src="${s.imageUrl}" alt="Ảnh scene ${s.scene}" loading="lazy" />`
        : `<span class="merge-keep-empty">Chưa có ảnh</span>`;
      return `<label class="merge-keep-card${on ? " checked" : ""}">
        <input type="radio" name="mergeKeep" value="${s.scene}" ${on ? "checked" : ""} />
        <span class="merge-keep-thumb">${thumb}</span>
        <span class="merge-keep-no num">Scene ${s.scene}</span>
      </label>`;
    })
    .join("");
  $("mergePreviewNarr").value = chosen
    .map((s) => (s.narration || "").trim())
    .filter(Boolean)
    .join(" ");
  $("mergeOverlay").hidden = false;
}
$("mergeKeepPicker").addEventListener("change", () => {
  for (const card of $("mergeKeepPicker").querySelectorAll(".merge-keep-card"))
    card.classList.toggle("checked", card.querySelector("input").checked);
});
$("batchMerge").addEventListener("click", () => openMergeDialog());
$("railBatchMerge").addEventListener("click", () => openMergeDialog());
// ---- insert scene: one blank scene below another; later scenes (and their media) renumber.
const hasUnsavedDrafts = () =>
  Object.values(drafts).some((pending) => pending.size > 0);
const lastSceneNumber = () =>
  Math.max(0, ...state.scenes.map((s) => s.scene));

// Why scenes cannot be renumbered right now (insert and delete both shift every later scene), or null.
function renumberBlocker(action) {
  if (anyJobActive())
    return `Đang có job chạy hoặc chờ — chờ xong rồi ${action}.`;
  if (hasUnsavedDrafts())
    return `Còn chỉnh sửa chưa lưu — lưu hoặc bỏ chúng trước khi ${action}.`;
  if (
    !$("scriptOverlay").hidden &&
    $("scriptList").querySelector(".script-row.dirty")
  )
    return `Kịch bản còn chỉnh sửa chưa lưu — lưu hoặc tải lại trước khi ${action}.`;
  return null;
}

// True while an insert/delete request is in flight; a second click then would act on scene
// numbers that are about to change.
let sceneRenumberBusy = false;

// Insert a blank scene directly below `anchor` (the selected scene by default) and leave the
// cursor in its narration, which the prompt/motion writers then work from.
async function insertSceneBelow(anchor = currentScene) {
  if (sceneRenumberBusy) return;
  const blocker = renumberBlocker("chèn scene");
  if (blocker) {
    toast(blocker, false);
    return;
  }
  const at = anchor === null ? lastSceneNumber() + 1 : anchor + 1;
  sceneRenumberBusy = true;
  try {
    state = await api("/api/insert-scene", { at, narration: "" });
    // Scene numbers just moved: picks keyed by the old numbers would point at other scenes.
    selected.clear();
    scriptPicked.clear();
    render();
    selectScene(at);
    if ($("scriptOverlay").hidden) {
      $("narrBox").focus();
    } else {
      renderScriptList();
      const row = $("scriptList").querySelector(`.script-row[data-scene="${at}"]`);
      row?.scrollIntoView({ block: "center" });
      row?.querySelector('textarea[data-field="narration"]')?.focus();
    }
    toast(
      document.body.classList.contains("view-timeline") && $("scriptOverlay").hidden
        ? `Đã chèn scene ${at} — bấm ✎ trên scene để nhập narration.`
        : `Đã chèn scene ${at} — nhập narration.`,
    );
  } catch (e) {
    toast(e.message, false);
  } finally {
    sceneRenumberBusy = false;
  }
}
$("btnInsertScene").addEventListener("click", () => insertSceneBelow());
$("batchInsert").addEventListener("click", () => insertSceneBelow());
// ---- delete scene: confirm, then the server removes it, closes the numbering gap and keeps its
// media in tmp/deleted-scenes.
const NARRATION_EXCERPT_CHARS = 80;

async function deleteScene(n = currentScene) {
  if (sceneRenumberBusy) return;
  const scene = n === null ? null : findScene(n);
  if (!scene) {
    toast("Chọn một scene để xoá.", false);
    return;
  }
  const blocker = renumberBlocker("xoá scene");
  if (blocker) {
    toast(blocker, false);
    return;
  }
  if (state.scenes.length < 2) {
    toast("Kịch bản phải còn ít nhất 1 scene.", false);
    return;
  }
  const narration = (scene.narration || "").trim();
  const excerpt = narration
    ? `\n"${narration.slice(0, NARRATION_EXCERPT_CHARS)}${narration.length > NARRATION_EXCERPT_CHARS ? "…" : ""}"`
    : "";
  const confirmed = await confirmRun(
    `Xoá scene ${n}?${excerpt}\n\nCác scene sau đổi số lùi 1. Ảnh, audio và motion của scene này được chuyển vào tmp/deleted-scenes (khôi phục thủ công).`,
    "Xoá scene",
    true,
  );
  if (!confirmed) return;
  sceneRenumberBusy = true;
  try {
    state = await api("/api/delete-scene", { scene: n });
    // Scene numbers just moved: picks keyed by the old numbers would point at other scenes.
    selected.clear();
    scriptPicked.clear();
    render();
    selectScene(findScene(n) ? n : lastSceneNumber());
    if (!$("scriptOverlay").hidden) renderScriptList();
    toast(`Đã xoá scene ${n}.`);
  } catch (e) {
    toast(e.message, false);
  } finally {
    sceneRenumberBusy = false;
  }
}
$("btnDeleteScene").addEventListener("click", () => deleteScene());
$("batchDelete").addEventListener("click", () => deleteScene());

$("mergeClose").addEventListener("click", () => {
  $("mergeOverlay").hidden = true;
});
$("mergeOverlay").addEventListener("click", (e) => {
  if (e.target === $("mergeOverlay")) $("mergeOverlay").hidden = true;
});
$("btnMergeConfirm").addEventListener("click", async () => {
  const scenes = pendingMergeScenes;
  if (scenes.length < 2) return;
  // Merging closes the numbering gap, so every later scene moves: nothing may be running or unsaved.
  const blocker = renumberBlocker("gộp scene");
  if (blocker) {
    toast(blocker, false);
    return;
  }
  const keepInput = $("mergeKeepPicker").querySelector("input:checked");
  const keep = keepInput ? Number(keepInput.value) : scenes[0];
  const narration = $("mergePreviewNarr").value;
  const btn = $("btnMergeConfirm");
  btn.disabled = true;
  btn.textContent = "Đang gộp...";
  try {
    const merged = await api("/api/merge-scenes", { scenes, keep, narration });
    state = merged;
    // Scene numbers moved: picks keyed by the old numbers would point at other scenes.
    selected.clear();
    scriptPicked.clear();
    $("mergeOverlay").hidden = true;
    render();
    selectScene(merged.mergedScene);
    // Full script modal renders its own snapshot on open — refresh it in place too, so a merge
    // triggered from a script row (or from the sheet/rail while it happens to be open) shows up
    // without the user having to close and reopen it.
    if (!$("scriptOverlay").hidden) renderScriptList();
    toast(`Đã gộp scene ${scenes.join(", ")} — còn lại scene ${merged.mergedScene}.`);
    // Leave the merged narration selected in the inspector for one more hand pass — unless the
    // script modal is open, where focus stays on the list the user is working in.
    if ($("scriptOverlay").hidden) {
      $("narrBox").focus();
      $("narrBox").select();
    }
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Gộp scene";
  }
});

$("conToggle").addEventListener("click", () =>
  openLog(!$("console").classList.contains("open")),
);
$("conCancel").addEventListener("click", () => {
  $("conCancel").disabled = true;
  if (lanes.media.running) lanes.media.running.controller.abort();
  else
    for (const job of orphanJobs)
      api("/api/cancel", { id: job.id }).catch((e) => toast(e.message, false));
});
$("conClearQueue").addEventListener("click", clearQueues);
$("conCopy").addEventListener("click", async () => {
  const log = $("conLog").textContent;
  if (!log.trim()) {
    toast("Log trống.", false);
    return;
  }
  try {
    await navigator.clipboard.writeText(log);
    toast("Đã copy log.");
  } catch {
    toast("Clipboard không dùng được.", false);
  }
});

async function openTemplateDialog(overlayId, firstFieldId) {
  $(overlayId).hidden = false;
  try {
    await loadTemplates();
  } catch (e) {
    toast(e.message, false);
  }
  const first = $(firstFieldId);
  first.focus();
  first.setSelectionRange(0, 0);
  first.scrollTop = 0;
}
$("btnTemplates").addEventListener("click", () =>
  openTemplateDialog("tplOverlay", "t_masterPrompt"),
);
$("btnStyle").addEventListener("click", () =>
  openTemplateDialog("styleOverlay", "t_styleDna"),
);
$("styleClose").addEventListener("click", () => {
  $("styleOverlay").hidden = true;
});
$("styleOverlay").addEventListener("click", (e) => {
  if (e.target === $("styleOverlay")) $("styleOverlay").hidden = true;
});
$("styleReload").addEventListener("click", () =>
  loadTemplates().catch((e) => toast(e.message, false)),
);
$("tplClose").addEventListener("click", () => {
  $("tplOverlay").hidden = true;
});
$("tplOverlay").addEventListener("click", (e) => {
  if (e.target === $("tplOverlay")) $("tplOverlay").hidden = true;
});
$("tplReload").addEventListener("click", () =>
  loadTemplates().catch((e) => toast(e.message, false)),
);
async function activateStyle(version) {
  try {
    const response = await api("/api/templates/activate", { version });
    currentTemplates = response.templates;
    for (const key of TEMPLATE_FIELDS)
      $(`t_${key}`).value = currentTemplates[key] || "";
    state.project = { ...state.project, template: version };
    syncStyleSelects(response.versions, version);
    toast(`Đã chuyển style sang ${version} — lưu vào dự án này.`);
  } catch (err) {
    syncStyleSelects(templateVersions, state.project?.template);
    toast(err.message, false);
  }
}
$("t_version").addEventListener("change", (e) => activateStyle(e.target.value));
$("styleSelect").addEventListener("change", (e) =>
  activateStyle(e.target.value),
);
$("t_activate").addEventListener("click", async () => {
  const version = $("t_newVersion").value.trim();
  if (!version) return toast("Nhập tên version.", false);
  try {
    const body = { version };
    for (const key of TEMPLATE_FIELDS) body[key] = $(`t_${key}`).value;
    const response = await api("/api/templates", body);
    state.project = { ...state.project, template: response.activeVersion };
    await loadTemplates();
    $("t_newVersion").value = "";
    toast(`Đã tạo version ${version} và dùng cho dự án này.`);
  } catch (err) {
    toast(err.message, false);
  }
});
async function saveTemplateFields(fields, button, doneMessage) {
  const body = Object.fromEntries(
    fields.map((key) => [key, $(`t_${key}`).value]),
  );
  body.version = $("t_version").value || "default";
  button.disabled = true;
  try {
    await api("/api/templates", body);
    toast(doneMessage);
  } catch (e) {
    toast(e.message, false);
  } finally {
    button.disabled = false;
  }
}
$("tplSave").addEventListener("click", () =>
  saveTemplateFields(PROMPT_FIELDS, $("tplSave"), "Đã lưu template."),
);
$("styleSave").addEventListener("click", () =>
  saveTemplateFields(STYLE_FIELDS, $("styleSave"), "Đã lưu style."),
);

// Keyboard: scene paging and view switching, ignored while typing.
$("lightbox").addEventListener("click", closeLightbox);

// One handler for every "Dịch" button (image prompt, motion prompt, template fields).
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-translate");
  if (btn) runTranslate(btn);
});

// ---- video library: every rendered MP4 of every project, newest first.
const closeLibrary = () => {
  $("libOverlay").hidden = true;
  $("libGrid").innerHTML = ""; // drops the <video> elements so nothing keeps playing or buffering
};

const formatFileSize = (bytes) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

const libraryCard = (v) => `<li class="lib-card${v.active ? " active" : ""}">
  <div class="lib-player">
    <video controls preload="metadata" playsinline src="${escapeHtml(v.url)}#t=0.1" aria-label="${escapeHtml(v.title)}"></video>
  </div>
  <h3 class="lib-title" title="${escapeHtml(v.name)}">${escapeHtml(v.title)}</h3>
  <div class="lib-meta">
    <span class="tag">${v.vertical ? "Bản dọc" : "Bản gốc"} ${escapeHtml(v.aspect)}</span>
    ${v.active ? '<span class="tag on">Đang mở</span>' : ""}
    <span class="num">${formatFileSize(v.size)}</span>
    <span class="num">${new Date(v.mtimeMs).toLocaleString("vi-VN")}</span>
  </div>
  <div class="lib-actions">
    <a class="btn sm" href="${escapeHtml(v.url)}" target="_blank" rel="noopener">Mở tab mới</a>
    <a class="btn sm" href="${escapeHtml(v.url)}" download="${escapeHtml(v.name)}">Tải về</a>
    <button class="btn sm" type="button" data-reveal="${escapeHtml(v.name)}" title="Hiện file trong Finder">Mở trong thư mục</button>
  </div>
</li>`;

const showLibraryEmpty = (message) => {
  $("libEmpty").textContent = message;
  $("libEmpty").hidden = !message;
};

const renderLibrary = ({ dir, videos }) => {
  $("libDirInput").value = dir;
  $("libGrid").innerHTML = videos.map(libraryCard).join("");
  $("libInfo").textContent = videos.length ? `${videos.length} video` : "";
  showLibraryEmpty(
    videos.length ? "" : "Chưa có video nào trong thư mục này. Bấm Render MP4 để tạo video đầu tiên.",
  );
};

$("btnLibrary").addEventListener("click", async () => {
  $("libOverlay").hidden = false;
  $("libGrid").innerHTML = "";
  $("libInfo").textContent = "";
  showLibraryEmpty("Đang tải…");
  try {
    renderLibrary(await api("/api/outputs"));
  } catch (e) {
    showLibraryEmpty(`Không đọc được thư viện: ${e.message}`);
  }
});

// `dir` null restores the default folder.
const saveOutputDir = async (dir) => {
  try {
    renderLibrary(await api("/api/output-dir", { dir }));
    toast("Đã đổi thư mục lưu video");
  } catch (e) {
    toast(e.message, false);
  }
};
$("libDirForm").addEventListener("submit", (e) => {
  e.preventDefault();
  saveOutputDir($("libDirInput").value);
});
$("libDirReset").addEventListener("click", () => saveOutputDir(null));
$("libGrid").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-reveal]");
  if (!btn) return;
  try {
    await api("/api/output-reveal", { name: btn.dataset.reveal });
  } catch (err) {
    toast(err.message, false);
  }
});
$("libClose").addEventListener("click", closeLibrary);
$("libOverlay").addEventListener("click", (e) => {
  if (e.target === $("libOverlay")) closeLibrary();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!$("libOverlay").hidden) {
      closeLibrary();
      return;
    }
    if (!$("confirmOverlay").hidden) {
      closeConfirm(false);
      return;
    }
    if (!$("mergeOverlay").hidden) {
      $("mergeOverlay").hidden = true;
      return;
    }
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
    if (!$("styleOverlay").hidden) {
      $("styleOverlay").hidden = true;
      return;
    }
    if (!$("scriptOverlay").hidden) {
      $("scriptOverlay").hidden = true;
      return;
    }
    if (!$("npOverlay").hidden) {
      closeNewProjectDialog();
      return;
    }
    if (!$("ciOverlay").hidden) {
      closeCharImageDialog();
      return;
    }
    if (!$("modelsOverlay").hidden) {
      closeModels();
      return;
    }
    if (!$("brandOverlay").hidden) {
      $("brandOverlay").hidden = true;
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
  // The timeline pages its own clips (review-timeline.js).
  if (view === "timeline" && ["ArrowDown", "ArrowUp", "j", "k"].includes(e.key))
    return;
  if (e.key === "ArrowDown" || e.key === "j") {
    e.preventDefault();
    stepScene(1);
  } else if (e.key === "ArrowUp" || e.key === "k") {
    e.preventDefault();
    stepScene(-1);
  } else if (e.key === "1") setView("timeline");
  else if (e.key === "2") setView("stage");
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

// The new-project dialog (AI script writer + manual) and the voice select live in
// review-script-gen.js.
$("projectSelect").addEventListener("change", (e) =>
  switchProject(e.target.value),
);

// ------------------------------------------------------------------ branding
//
// Corner logo + brand name and the centre watermark drawn over the final render (src/BrandOverlay.tsx),
// saved per project to branding.json. paintBrandLayer places them with the same delivered-pixel
// numbers as BrandOverlay.tsx (keep BRAND_GEOMETRY in sync) over a preview frame: the dialog's
// preview and the timeline screen (review-timeline.js).

const BRAND_GEOMETRY = {
  deliveryWidth: 1080,
  bandRatio: 3 / 2,
  badgeGap: 4,
  topLeftTagClearance: 60,
  safeEdges: {
    vertical: { top: 200 / 1920, bottom: 400 / 1920 },
    wide: { top: 0, bottom: 0 },
  },
  watermark: { logoShare: 0.46, text: 110 },
};

const readBrandForm = () => ({
  name: $("brandName").value.trim(),
  logo: {
    enabled: $("brandLogoOn").checked,
    position: $("brandLogoPos").value,
    anchor: $("brandLogoAnchor").value,
    opacity: Number($("brandLogoOpacity").value) / 100,
    margin: Number($("brandLogoMargin").value),
    size: Number($("brandLogoSize").value),
    textSize: Number($("brandLogoText").value),
  },
  watermark: {
    enabled: $("brandWmOn").checked,
    opacity: Number($("brandWmOpacity").value) / 100,
  },
});

const fillBrandForm = ({ name, logo, watermark }) => {
  $("brandName").value = name;
  $("brandLogoOn").checked = logo.enabled;
  $("brandLogoPos").value = logo.position;
  $("brandLogoAnchor").value = logo.anchor;
  $("brandLogoOpacity").value = Math.round(logo.opacity * 100);
  $("brandLogoMargin").value = logo.margin;
  $("brandLogoSize").value = logo.size;
  $("brandLogoText").value = logo.textSize;
  $("brandWmOn").checked = watermark.enabled;
  $("brandWmOpacity").value = Math.round(watermark.opacity * 100);
};

const placeBrandBadge = (badge, logo, frame) => {
  const { badgeGap, safeEdges, topLeftTagClearance } = BRAND_GEOMETRY;
  const [vertical, horizontal] = logo.position.split("-");
  const safe = frame.isWide ? safeEdges.wide : safeEdges.vertical;
  const margin = logo.margin * frame.unit;
  const clearance =
    !frame.isWide && logo.position === "top-left" ? topLeftTagClearance : 0;
  const inset = logo.anchor === "frame" ? 0 : frame.cropInset;
  const side = `${inset + margin}px`;
  Object.assign(badge.style, {
    top:
      vertical === "top"
        ? `${frame.height * safe.top + margin + clearance * frame.unit}px`
        : "",
    bottom:
      vertical === "bottom" ? `${frame.height * safe.bottom + margin}px` : "",
    left: horizontal === "left" ? side : "",
    right: horizontal === "right" ? side : "",
    gap: `${badgeGap * frame.unit}px`,
    opacity: logo.opacity,
  });
  badge.querySelector("img").style.height = `${logo.size * frame.unit}px`;
  badge.querySelector("span").style.fontSize =
    `${logo.textSize * frame.unit}px`;
};

const placeBrandWatermark = (wm, watermark, frame) => {
  const { logoShare, text } = BRAND_GEOMETRY.watermark;
  wm.style.opacity = watermark.opacity;
  wm.querySelector("img").style.width = `${frame.bandWidth * logoShare}px`;
  wm.querySelector("span").style.fontSize = `${text * frame.unit}px`;
};

// `root` holds one .brand-badge and one .brand-wm; a null branding hides both.
const paintBrandLayer = (root, branding) => {
  const badge = root.querySelector(".brand-badge");
  const wm = root.querySelector(".brand-wm");
  badge.hidden = !branding?.logo.enabled;
  wm.hidden = !branding?.watermark.enabled;
  if (!branding) return;
  for (const span of root.querySelectorAll(
    ".brand-badge span, .brand-wm span",
  )) {
    span.textContent = branding.name;
    span.hidden = !branding.name;
  }
  const { clientWidth: width, clientHeight: height } = root;
  const bandWidth = Math.min(width, height * BRAND_GEOMETRY.bandRatio);
  const frame = {
    height,
    bandWidth,
    cropInset: (width - bandWidth) / 2,
    unit: bandWidth / BRAND_GEOMETRY.deliveryWidth,
    isWide: width > height,
  };
  placeBrandBadge(badge, branding.logo, frame);
  placeBrandWatermark(wm, branding.watermark, frame);
};

const renderBrandPreview = () => {
  $("brandLogoOpacityVal").textContent = `${$("brandLogoOpacity").value}%`;
  $("brandWmOpacityVal").textContent = `${$("brandWmOpacity").value}%`;
  $("brandLogoMarginVal").textContent = `${$("brandLogoMargin").value}px`;
  $("brandLogoSizeVal").textContent = `${$("brandLogoSize").value}px`;
  $("brandLogoTextVal").textContent = `${$("brandLogoText").value}px`;
  paintBrandLayer($("brandFrame"), readBrandForm());
};

const BRAND_NOTE = "Áp dụng ở lần Render MP4 tiếp theo.";

$("btnBrand").addEventListener("click", async () => {
  const scene = findScene(currentScene);
  $("brandScene").hidden = !scene?.hasImage;
  if (scene?.hasImage) $("brandScene").src = scene.imageUrl;
  $("brandFrame").classList.toggle("wide", state.project?.aspect !== "9:16");
  $("brandAnchorField").hidden = state.project?.aspect !== "16:9";
  $("brandNote").textContent = BRAND_NOTE;
  try {
    const { branding } = await api("/api/branding");
    fillBrandForm(branding);
    $("brandOverlay").hidden = false;
    renderBrandPreview();
  } catch (e) {
    toast(e.message, false);
  }
});
for (const id of [
  "brandName",
  "brandLogoOn",
  "brandLogoPos",
  "brandLogoAnchor",
  "brandLogoOpacity",
  "brandLogoMargin",
  "brandLogoSize",
  "brandLogoText",
  "brandWmOn",
  "brandWmOpacity",
])
  $(id).addEventListener("input", renderBrandPreview);
$("brandClose").addEventListener("click", () => {
  $("brandOverlay").hidden = true;
});
$("brandOverlay").addEventListener("click", (e) => {
  if (e.target === $("brandOverlay")) $("brandOverlay").hidden = true;
});
$("brandSave").addEventListener("click", async () => {
  $("brandSave").disabled = true;
  try {
    const { branding } = await api("/api/branding", readBrandForm());
    state = { ...state, branding };
    render();
    $("brandOverlay").hidden = true;
    toast("Đã lưu logo & watermark. Áp dụng ở lần Render MP4 tiếp theo.");
  } catch (e) {
    $("brandNote").textContent = e.message;
  } finally {
    $("brandSave").disabled = false;
  }
});

// ------------------------------------------------------------------ full-script editor
//
// The whole scene plan in one editable column: per scene the narration, image prompt + its
// Vietnamese translation, and the motion prompt + its translation, plus char. Saving
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
    title: "Prompt ảnh",
    tone: "image",
    fields: [
      {
        key: "prompt",
        sub: "EN",
        rows: 4,
        ph: "Hành động + cử chỉ; trống → Viết từ narration",
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
    title: "Motion",
    tone: "motion",
    fields: [
      {
        key: "camera",
        sub: "Camera",
        rows: 2,
        ph: "Một chuyển động máy; trống cả 3 ô = dùng motion cũ / tự sinh",
        get: (s) => s.camera ?? "",
      },
      {
        key: "camera_vi",
        sub: "Camera · Dịch",
        rows: 2,
        ph: "Bản dịch camera",
        get: (s) => s.cameraVi ?? "",
      },
      {
        key: "action",
        sub: "Nhân vật",
        rows: 2,
        ph: "Hành động rõ của từng nhân vật",
        get: (s) => s.action ?? "",
      },
      {
        key: "action_vi",
        sub: "Nhân vật · Dịch",
        rows: 2,
        ph: "Bản dịch hành động",
        get: (s) => s.actionVi ?? "",
      },
      {
        key: "env",
        sub: "Môi trường",
        rows: 2,
        ph: "2–3 chuyển động lớn của cảnh",
        get: (s) => s.env ?? "",
      },
      {
        key: "env_vi",
        sub: "Môi trường · Dịch",
        rows: 2,
        ph: "Bản dịch môi trường",
        get: (s) => s.envVi ?? "",
      },
    ],
  },
];
const SCRIPT_FIELDS = SCRIPT_GROUPS.flatMap((g) => g.fields);
// Cast ids in the gallery's order, so the saved plan order and the chip order never read as an edit.
const charRank = (id) => {
  const i = (state.characterList ?? []).findIndex((c) => c.id === id);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};
const scriptChar = (s) =>
  [...(s.characters ?? [])]
    .sort((a, b) => charRank(a) - charRank(b))
    .join(", ");

const scriptControls = (row) => [...row.querySelectorAll("[data-field]")];

function scriptCommitted(scene, field) {
  const s = findScene(scene);
  if (!s) return "";
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
    : "Chưa có scene.";
  $("scriptSave").disabled =
    Boolean(globalOp) || dirty === 0 || dirtyScriptScenesBusy().length > 0;
}

// Edited script rows whose scene has a job running or queued: saving would rewrite the plan
// under that job, so Save waits for them (rows of idle scenes are never held back).
function dirtyScriptScenesBusy() {
  return [...$("scriptList").querySelectorAll(".script-row.dirty")]
    .map((row) => Number(row.dataset.scene))
    .filter(sceneInAnyLane);
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
// single scene, so they behave exactly like the timeline/rail batch runs (same models,
// same queue and dedupe) — no dependency on the stage's currently-selected scene.
const scriptGenHtml = (s) =>
  `<div class="script-gen">
    <button type="button" class="btn sm script-gen-btn gen-prompt" data-gen="prompt" data-label="Prompt" data-scene="${s.scene}" title="Viết prompt ảnh cho scene này từ narration đã lưu (OpenAI)">Prompt</button>
    <button type="button" class="btn sm script-gen-btn gen-image" data-gen="image" data-label="Ảnh" data-scene="${s.scene}" title="Sinh ảnh cho scene này (dùng model ảnh ở thanh Chạy của Timeline)">Ảnh</button>
    <button type="button" class="btn sm script-gen-btn gen-audio" data-gen="audio" data-label="Audio" data-scene="${s.scene}" title="Sinh audio narration cho scene này">Audio</button>
    <button type="button" class="btn sm script-gen-btn gen-motion" data-gen="motion" data-label="Motion" data-scene="${s.scene}" title="Sinh motion video cho scene này (cần có ảnh + audio, model ở thanh Chạy của Timeline)">Motion</button>
  </div>`;

// Cast chips for one scene. The hidden `char` input carries the comma id string the dirty/patch
// helpers already read; the chips only edit it. Search-image scenes have no cast: the plan parser
// ignores `char` on them, so a chip there would save and silently do nothing.
const scriptCharHtml = (s) => {
  const cast = state.characterList ?? [];
  if (s.kind !== "ai")
    return `<span class="script-char-off" title="Scene ảnh tìm kiếm không dùng nhân vật">Ảnh search · không nhân vật</span>`;
  if (!cast.length) return "";
  const chips = cast
    .map((c) => {
      const on = (s.characters ?? []).includes(c.id);
      return `<label class="char-check sm${on ? " checked" : ""}">
        <input type="checkbox" data-char-id="${escapeHtml(c.id)}" ${on ? "checked" : ""} />
        ${escapeHtml(c.name)}
      </label>`;
    })
    .join("");
  return `<div class="script-chars" role="group" aria-label="Nhân vật scene ${s.scene}">${chips}<input type="hidden" data-scene="${s.scene}" data-field="char" value="${escapeHtml(scriptChar(s))}" /></div>`;
};

function renderScriptList() {
  // Narration shows first; the image + motion prompts stay collapsed so the list reads as a pure
  // script until a scene's toggle opens them.
  $("scriptList").innerHTML = state.scenes
    .map((s) => {
      const narration = scriptGroupHtml(s, SCRIPT_GROUPS[0]);
      const details = SCRIPT_GROUPS.slice(1)
        .map((g) => scriptGroupHtml(s, g))
        .join("");
      return `<div class="script-row" data-scene="${s.scene}">
        <div class="script-row-head">
          <input type="checkbox" class="rail-check" data-pick="${s.scene}" ${scriptPicked.has(s.scene) ? "checked" : ""} title="Chọn scene ${s.scene} để gộp" aria-label="Chọn scene ${s.scene} để gộp" />
          <span class="script-no num">#${s.scene}</span>
          <span class="script-edited">đã sửa</span>
          <button type="button" class="script-toggle" aria-expanded="false" title="Hiện / ẩn image prompt và motion prompt">
            <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
            Prompt &amp; motion
          </button>
          <button type="button" class="btn quiet sm" data-insert-after="${s.scene}" title="Chèn một scene trống ngay dưới scene ${s.scene}">Chèn</button>
          <button type="button" class="btn quiet danger sm" data-delete-scene="${s.scene}" title="Xoá scene ${s.scene}">Xoá</button>
          <span class="grow"></span>
          ${scriptCharHtml(s)}
          ${scriptGenHtml(s)}
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
// the same job is pending for that scene, when the button becomes its Cancel instead. A row with
// unsaved edits cannot start a job, since generation reads the saved server state, not the
// edited textarea — but it can still cancel one.
function syncScriptGenButtons() {
  const byScene = new Map(state.scenes.map((s) => [s.scene, s]));
  for (const btn of $("scriptList").querySelectorAll("[data-gen]")) {
    const kind = btn.dataset.gen;
    const n = Number(btn.dataset.scene);
    const s = byScene.get(n);
    const dirty = btn.closest(".script-row")?.classList.contains("dirty");
    let ok = false;
    if (s && !dirty && !globalOp) {
      if (kind === "prompt")
        ok = s.kind === "ai" && (s.narration || "").trim().length > 0;
      else if (kind === "image") ok = s.kind === "ai";
      else if (kind === "audio")
        ok = !renderActive() && (s.narration || "").trim().length > 0;
      else if (kind === "motion") ok = s.hasImage && s.hasAudio;
    }
    syncGenButton(btn, kind, n, btn.dataset.label, ok, true);
  }
  syncScriptSelection();
  syncScriptMissingPrompts();
  syncScriptMissingMotion();
}

// Row ticks are the modal's own picks for the header Merge button, kept apart from the timeline /
// rail `selected` set: that one decides what a batch run (Sinh ảnh…) acts on, so a tick left behind
// here must never turn into a queued job. Like the batch bar's merge, it needs an unbroken run with
// no job pending, and waits for unsaved edits in a picked row, because merge joins the saved
// narration, not the textarea.
const scriptPicked = new Set();
function syncScriptSelection() {
  const picked = state.scenes
    .filter((s) => scriptPicked.has(s.scene))
    .map((s) => s.scene);
  for (const box of $("scriptList").querySelectorAll("[data-pick]"))
    box.checked = scriptPicked.has(Number(box.dataset.pick));
  const dirty = picked.some((n) =>
    $("scriptList").querySelector(`.script-row.dirty[data-scene="${n}"]`),
  );
  $("scriptMerge").textContent = picked.length
    ? `Gộp đã chọn (${picked.length})`
    : "Gộp đã chọn";
  $("scriptMerge").disabled =
    Boolean(globalOp) ||
    dirty ||
    picked.some(sceneInAnyLane) ||
    !isContiguousSelection(picked);
  $("scriptMerge").title = dirty
    ? "Lưu thay đổi của scene đã chọn trước khi gộp"
    : "Tick các scene liền kề ở đầu mỗi scene rồi gộp thành một";
}
$("scriptMerge").addEventListener("click", () =>
  openMergeDialog([...scriptPicked]),
);

// AI scenes that have narration but no image prompt yet, and no prompt job pending.
const scenesMissingPrompt = () =>
  state.scenes
    .filter(
      (s) =>
        s.kind === "ai" &&
        (s.narration || "").trim() &&
        !(s.prompt || "").trim() &&
        !hasPending("prompt", s.scene),
    )
    .map((s) => s.scene);

// Header batch: write every missing prompt in one job. Unsaved rows block it, since prompts are
// written from the saved narration and would land under the edits.
function syncScriptMissingPrompts() {
  const count = scenesMissingPrompt().length;
  const dirty = $("scriptList").querySelector(".script-row.dirty");
  $("scriptGenMissing").textContent = `Viết prompt thiếu (${count})`;
  $("scriptGenMissing").disabled =
    Boolean(globalOp) || count === 0 || Boolean(dirty);
}
$("scriptGenMissing").addEventListener("click", () =>
  enqueuePrompts(scenesMissingPrompt()),
);

// AI scenes with something to direct from (beat or image prompt) but no camera / action / env,
// and no motion-writing job pending. An older single-line `motion:` counts as missing.
const scenesMissingMotion = () =>
  state.scenes
    .filter(
      (s) =>
        s.kind === "ai" &&
        ((s.beat || "").trim() || (s.prompt || "").trim()) &&
        ![s.camera, s.action, s.env].some((v) => (v || "").trim()) &&
        !hasPending("motionPrompt", s.scene),
    )
    .map((s) => s.scene);
function syncScriptMissingMotion() {
  const count = scenesMissingMotion().length;
  const dirty = $("scriptList").querySelector(".script-row.dirty");
  $("scriptGenMissingMotion").textContent = `Viết motion thiếu (${count})`;
  $("scriptGenMissingMotion").disabled =
    Boolean(globalOp) || count === 0 || Boolean(dirty);
}
$("scriptGenMissingMotion").addEventListener("click", () =>
  enqueueMotionPrompts(scenesMissingMotion()),
);

function runScriptGen(kind, sceneNo) {
  const row = $("scriptList").querySelector(
    `.script-row[data-scene="${sceneNo}"]`,
  );
  if (row?.classList.contains("dirty")) {
    toast("Lưu scene này trước khi generate.", false);
    return;
  }
  const scenes = [sceneNo];
  if (kind === "prompt") enqueuePrompts(scenes);
  else if (kind === "image")
    enqueueImages(scenes, $("batchImageModelSelect").value);
  else if (kind === "audio") enqueueAudio(scenes);
  else if (kind === "motion")
    enqueueMotions(scenes, $("batchMotionModelSelect").value);
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
  scriptPicked.clear();
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
$("scriptList").addEventListener("change", (e) => {
  const pick = e.target.closest("[data-pick]");
  if (pick) {
    const n = Number(pick.dataset.pick);
    if (pick.checked) scriptPicked.add(n);
    else scriptPicked.delete(n);
    syncScriptSelection();
    return;
  }
  const chip = e.target.closest("[data-char-id]");
  if (!chip) return;
  chip.closest(".char-check").classList.toggle("checked", chip.checked);
  const group = chip.closest(".script-chars");
  const ids = [...group.querySelectorAll("[data-char-id]:checked")].map(
    (c) => c.dataset.charId,
  );
  const hidden = group.querySelector('[data-field="char"]');
  hidden.value = ids.join(", ");
  hidden.dispatchEvent(new Event("input", { bubbles: true }));
});
// Reveal a scene's image + motion prompts on demand. Auto-grow runs on expand — a hidden
// textarea measures 0 tall, so its height must be recomputed once it is visible.
$("scriptList").addEventListener("click", (e) => {
  const del = e.target.closest("[data-delete-scene]");
  if (del) {
    deleteScene(Number(del.dataset.deleteScene));
    return;
  }
  const insert = e.target.closest("[data-insert-after]");
  if (insert) {
    insertSceneBelow(Number(insert.dataset.insertAfter));
    return;
  }
  const gen = e.target.closest("[data-gen]");
  if (gen) {
    const n = Number(gen.dataset.scene);
    if (hasPending(gen.dataset.gen, n)) cancelSceneJob(gen.dataset.gen, n);
    else runScriptGen(gen.dataset.gen, n);
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
  const held = dirtyScriptScenesBusy();
  if (globalOp || held.length) {
    toast(
      `Scene ${held.join(", ")} đang có job chạy/chờ — chờ xong rồi lưu.`,
      false,
    );
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
  btn.textContent = "Đang lưu...";
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
    btn.textContent = "Lưu thay đổi";
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
    toast("Clipboard không dùng được — đã dán vào ô Nhập JSON.", false);
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
      !row.narration.trim() &&
      (findScene(row.scene)?.narration ?? "").trim()
    )
      // A scene that is already blank (just inserted) may stay blank, e.g. on re-import.
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
  btn.textContent = "Đang áp dụng...";
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
    btn.textContent = "Áp dụng";
    btn.disabled = !scriptImportRows;
  }
});

// ------------------------------------------------------------------ scene setup (title/char)

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

// Add-character dialog. "Tạo mới" creates an empty character; "Từ project khác" copies one that
// already exists in another project (reference image + profile.json) under a new id.
const AC_NOTE_NEW =
  "Thêm vào khối ## characters và tạo profile.json. Không chọn ảnh thì mở tiếp bước tạo ảnh từ mô tả.";
const AC_NOTE_LIB =
  "Chép ảnh tham chiếu và profile.json sang project này. Đổi id nếu muốn.";
let acMode = "new";
// Set while the dialog replaces an existing character (library only, id locked).
let acReplaceId = null;
// null while loading; { error } when the request failed; otherwise the newest-first list.
let acLibrary = null;
let acPicked = null;

const toSlug = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// First free id in the active project: `base`, then base-2, base-3, …
function freeCharacterId(base) {
  const taken = new Set((state.characterList || []).map((c) => c.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const relativeTime = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
const TIME_UNITS = [
  ["year", 365 * 864e5],
  ["month", 30 * 864e5],
  ["day", 864e5],
  ["hour", 36e5],
  ["minute", 6e4],
];
function timeAgo(ms) {
  const diff = ms - Date.now();
  const [unit, size] =
    TIME_UNITS.find(([, size]) => Math.abs(diff) >= size) ?? TIME_UNITS.at(-1);
  return relativeTime.format(Math.round(diff / size), unit);
}

function setAcMode(mode) {
  acMode = mode;
  const lib = mode === "lib";
  $("acModeNew").setAttribute("aria-pressed", String(!lib));
  $("acModeLib").setAttribute("aria-pressed", String(lib));
  $("acLibrary").hidden = !lib;
  $("acFileField").hidden = lib;
  $("acCreate").textContent = acReplaceId
    ? "Thay bằng nhân vật này"
    : lib
      ? "Dùng nhân vật này"
      : "Thêm";
  $("acNote").textContent = acReplaceId
    ? `Thay ảnh tham chiếu và profile.json của "${charById(acReplaceId)?.name ?? acReplaceId}". Id ${acReplaceId} và các scene đang dùng giữ nguyên.`
    : lib
      ? AC_NOTE_LIB
      : AC_NOTE_NEW;
  if (lib) $("acLibSearch").focus();
  else $("acId").focus();
}

function renderCharacterLibrary() {
  const list = $("acLibList");
  const count = Array.isArray(acLibrary) ? acLibrary.length : 0;
  $("acLibCount").textContent = count ? String(count) : "";
  if (acLibrary === null) {
    list.innerHTML = `<p class="ac-lib-state">Đang tải nhân vật…</p>`;
    return;
  }
  if (acLibrary.error) {
    list.innerHTML = `<p class="ac-lib-state">Không tải được: ${escapeHtml(acLibrary.error)}</p>`;
    return;
  }
  const query = toSlug($("acLibSearch").value);
  const shown = acLibrary.filter(
    (c) =>
      !query ||
      toSlug(
        `${c.name} ${c.aliases.join(" ")} ${c.projectTitle} ${c.project}`,
      ).includes(query),
  );
  if (!shown.length) {
    list.innerHTML = `<p class="ac-lib-state">${
      count
        ? "Không có nhân vật nào khớp."
        : "Chưa có nhân vật nào ở project khác."
    }</p>`;
    return;
  }
  list.innerHTML = shown
    .map((c) => {
      const key = `${c.project}/${c.id}`;
      const on = acPicked && `${acPicked.project}/${acPicked.id}` === key;
      return `<label class="ac-lib-item${on ? " checked" : ""}">
        <input type="radio" name="acLibPick" value="${escapeHtml(key)}" ${on ? "checked" : ""} />
        <img class="ac-lib-thumb" src="${escapeHtml(c.imageUrl)}" alt="" loading="lazy" width="44" height="44" />
        <span class="ac-lib-text">
          <span class="ac-lib-name">${escapeHtml(c.name)}</span>
          <span class="ac-lib-meta">${escapeHtml(c.id)} · ${escapeHtml(c.projectTitle)}</span>
        </span>
        <span class="ac-lib-time">${escapeHtml(timeAgo(c.updatedAt))}</span>
      </label>`;
    })
    .join("");
}

async function loadCharacterLibrary() {
  acLibrary = null;
  renderCharacterLibrary();
  try {
    acLibrary = (await api("/api/character-library")).characters;
  } catch (e) {
    acLibrary = { error: e.message };
  }
  renderCharacterLibrary();
}

// `replaceId` opens the dialog to swap that existing character for one from another project.
function openAddCharDialog(replaceId = null) {
  acReplaceId = typeof replaceId === "string" ? replaceId : null;
  const replaced = acReplaceId ? charById(acReplaceId) : null;
  $("acTitle").textContent = replaced
    ? `Thay nhân vật "${replaced.name}"`
    : "Thêm nhân vật";
  $("acModeLib").parentElement.hidden = Boolean(acReplaceId);
  $("acIdField").hidden = Boolean(acReplaceId);
  $("acId").value = acReplaceId ?? "";
  $("acName").value = "";
  $("acFile").value = "";
  $("acLibSearch").value = "";
  acPicked = null;
  $("acOverlay").hidden = false;
  setAcMode(acReplaceId ? "lib" : "new");
  loadCharacterLibrary();
}
$("acModeNew").addEventListener("click", () => setAcMode("new"));
$("acModeLib").addEventListener("click", () => setAcMode("lib"));
$("acLibSearch").addEventListener("input", renderCharacterLibrary);
$("acLibList").addEventListener("change", (e) => {
  const [project, id] = e.target.value.split("/");
  acPicked =
    acLibrary.find((c) => c.project === project && c.id === id) ?? null;
  for (const item of $("acLibList").querySelectorAll(".ac-lib-item"))
    item.classList.toggle("checked", item.querySelector("input").checked);
  if (!acPicked) return;
  $("acName").value = acPicked.name;
  if (acReplaceId) return;
  $("acId").value = freeCharacterId(toSlug(acPicked.name) || acPicked.id);
  $("acNote").textContent =
    `Chép "${acPicked.name}" từ project "${acPicked.projectTitle}"`;
});
$("btnAddChar").addEventListener("click", openAddCharDialog);
$("tlAddChar").addEventListener("click", openAddCharDialog);
$("acClose").addEventListener("click", () => {
  $("acOverlay").hidden = true;
});
$("acOverlay").addEventListener("click", (e) => {
  if (e.target === $("acOverlay")) $("acOverlay").hidden = true;
});
// Library mode of the add-character dialog: copy the picked character in as `id`, or — replacing —
// overwrite character `id` after a confirm, since its old reference and profile are lost.
async function importPickedCharacter(id, name) {
  const from = `"${acPicked.name}" từ project "${acPicked.projectTitle}"`;
  if (acReplaceId) {
    const ok = await confirmRun(
      `Thay "${charById(id)?.name ?? id}" bằng ${from}? Ảnh tham chiếu và hồ sơ hiện tại bị ghi đè; id ${id} và các scene đang dùng giữ nguyên.`,
      "Thay",
    );
    if (!ok) return;
  }
  $("acCreate").disabled = true;
  try {
    state = await api("/api/character-import", {
      project: acPicked.project,
      sourceId: acPicked.id,
      id,
      name,
      replace: Boolean(acReplaceId),
    });
    render();
    $("acOverlay").hidden = true;
    toast(acReplaceId ? `Đã thay bằng ${from}` : `Đã thêm ${from}`);
  } catch (e) {
    $("acNote").textContent = e.message;
  } finally {
    $("acCreate").disabled = false;
  }
}

$("acCreate").addEventListener("click", async () => {
  const id = $("acId").value.trim();
  const name = $("acName").value.trim();
  const file = $("acFile").files[0];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    $("acNote").textContent = "Id chỉ gồm chữ thường, số và dấu gạch ngang.";
    return;
  }
  if (!name) {
    $("acNote").textContent = "Cần nhập tên hiển thị.";
    return;
  }
  if (acMode === "lib" && !acPicked) {
    $("acNote").textContent = "Chọn một nhân vật trong danh sách.";
    return;
  }
  if (acMode === "lib") {
    await importPickedCharacter(id, name);
    return;
  }
  $("acCreate").disabled = true;
  try {
    state = await api("/api/character-create", { id, name });
    if (file) await uploadCharacterFile(id, file);
    else render();
    $("acOverlay").hidden = true;
    toast(`Đã thêm nhân vật "${name}".`);
    // No image chosen: go straight on to drawing one from a description.
    if (!file) openCharImageDialog(id);
  } catch (e) {
    $("acNote").textContent = e.message;
  } finally {
    $("acCreate").disabled = false;
  }
});

function onCharGalleryClick(e) {
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
  } else if (btn.dataset.action === "generate") {
    openCharImageDialog(id);
  } else if (btn.dataset.action === "replace") {
    openAddCharDialog(id);
  }
}
for (const id of CHAR_GALLERY_IDS)
  $(id).addEventListener("click", onCharGalleryClick);
$("charFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !pendingUploadCharId) return;
  const id = pendingUploadCharId;
  pendingUploadCharId = null;
  // No lock: a new reference only affects image jobs that start after it lands.
  toast(`Đang tải ảnh tham chiếu của "${id}"…`);
  try {
    await uploadCharacterFile(id, file);
    toast(`Đã cập nhật ảnh tham chiếu của "${id}".`);
  } catch (err) {
    toast(err.message, false);
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
    $("profTitle").textContent = `Hồ sơ — ${id}`;
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
      "Quốc gia / thời kỳ / triều đại / vai trò được dùng khi OpenAI viết prompt.";
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
  $("profNote").textContent = "Đã nhập vào form. Kiểm tra rồi bấm Lưu hồ sơ.";
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
    toast(`Đã lưu hồ sơ "${profileCharId}".`);
  } catch (e) {
    $("profNote").textContent = e.message;
  } finally {
    $("profSave").disabled = false;
  }
});

// ---------------------------------------------------------------- local services

const SERVICE_STATE_WORD = {
  stopped: "tắt",
  starting: "đang bật",
  running: "bật",
  stopping: "đang tắt",
  failed: "lỗi",
};
const SERVICE_POLL_BOOTING_MS = 2000;
// Slow idle poll so a server stopped from its own terminal is noticed without hammering it.
const SERVICE_POLL_IDLE_MS = 15000;
let serviceTimer = null;
let serviceStates = {};

function serviceTitle(s) {
  if (s.state === "failed")
    return `${s.label} khởi động lỗi — bấm để thử lại.\n\n${s.log ?? ""}`;
  if (s.state === "stopped") return `Bật ${s.label} (${s.url})`;
  const origin = s.managed ? "bật từ panel" : "bật từ terminal";
  return `${s.label} ${SERVICE_STATE_WORD[s.state]} — ${origin} (${s.url})`;
}

// A chip per service; a server this panel started also gets "Khởi động lại" and "Dừng" beside it.
function renderServices(services) {
  $("services").innerHTML = services
    .map((s) => {
      const startable = s.state === "stopped" || s.state === "failed";
      const chip = `<button class="btn sm svc" type="button" data-service="${escapeHtml(s.id)}" data-state="${escapeHtml(s.state)}" title="${escapeHtml(serviceTitle(s))}"${startable ? "" : " disabled"}><span class="svc-dot"></span>${escapeHtml(s.label)}<span class="svc-state">${SERVICE_STATE_WORD[s.state]}</span></button>`;
      const controls =
        s.managed && s.state === "running"
          ? `<button class="btn sm quiet svc-restart" type="button" data-restart-service="${escapeHtml(s.id)}" data-label="${escapeHtml(s.label)}" title="Khởi động lại ${escapeHtml(s.label)} (tác vụ đang chạy sẽ bị huỷ)">Khởi động lại</button>` +
            `<button class="btn sm quiet svc-stop" type="button" data-stop-service="${escapeHtml(s.id)}" title="Dừng ${escapeHtml(s.label)}">Dừng</button>`
          : "";
      return `<span class="svc-item">${chip}${controls}</span>`;
    })
    .join("");
}

// Toast only the outcome of a start/stop this panel asked for, not every poll.
function announceServiceChanges(services) {
  for (const s of services) {
    const asked = serviceStates[s.id];
    if (asked === "starting" && s.state === "running")
      toast(`${s.label} đã bật.`);
    if (asked === "starting" && s.state === "failed")
      toast(`${s.label} khởi động lỗi — rê chuột vào chip để xem log.`, false);
    if (asked === "stopping" && s.state === "stopped")
      toast(`${s.label} đã tắt.`);
  }
  serviceStates = Object.fromEntries(services.map((s) => [s.id, s.state]));
}

async function refreshServices() {
  clearTimeout(serviceTimer);
  let services = [];
  try {
    ({ services } = await api("/api/services"));
    announceServiceChanges(services);
    renderServices(services);
  } catch {
    // Review server unreachable: the scene refresh already reports that; keep the last chips
    // and retry on the idle cadence.
  }
  const changing = services.some(
    (s) => s.state === "starting" || s.state === "stopping",
  );
  serviceTimer = setTimeout(
    refreshServices,
    changing ? SERVICE_POLL_BOOTING_MS : SERVICE_POLL_IDLE_MS,
  );
}

async function requestService(action, id, button) {
  button.disabled = true;
  try {
    const s = await api(`/api/services/${action}`, { id });
    serviceStates[s.id] = action === "stop" ? "stopping" : "starting";
    if (action !== "restart")
      toast(
        action === "start" ? `Đang bật ${s.label}…` : `Đang tắt ${s.label}…`,
      );
  } catch (e) {
    toast(e.message, false);
  }
  refreshServices();
}

$("services").addEventListener("click", (event) => {
  const restart = event.target.closest("[data-restart-service]");
  if (restart) {
    // The request only returns once the old process has exited, so announce it up front.
    toast(`Đang khởi động lại ${restart.dataset.label}…`);
    requestService("restart", restart.dataset.restartService, restart);
    return;
  }
  const stop = event.target.closest("[data-stop-service]");
  if (stop) {
    requestService("stop", stop.dataset.stopService, stop);
    return;
  }
  const chip = event.target.closest(".svc");
  if (chip && !chip.disabled)
    requestService("start", chip.dataset.service, chip);
});

refreshServices();

// Polls the jobs that were already running when the page loaded until they end, then refetches
// the state so the images/audio/clips they wrote show up.
async function watchOrphanJobs() {
  const ids = new Set((await api("/api/jobs")).jobs.map((j) => j.id));
  if (!ids.size) return;
  let lastDoneCount;
  try {
    for (;;) {
      const { jobs } = await api("/api/jobs");
      orphanJobs = jobs
        .filter((j) => ids.has(j.id))
        .map((j) => ({
          ...j,
          lane: orphanLane(j.kind),
          done: new Set(j.done),
          skip: new Set(),
        }));
      if (!orphanJobs.length) break;
      const doneCount = orphanJobs.reduce((n, j) => n + j.done.size, 0);
      if (lastDoneCount !== undefined && doneCount > lastDoneCount)
        refreshSoon();
      lastDoneCount = doneCount;
      syncJobUi();
      if (!lanes.media.running)
        setConsole(
          "running",
          `Job còn chạy trên server: ${orphanJobs.map((j) => j.label).join(" · ")}`,
          orphanJobs.at(-1).lastLog,
        );
      await new Promise((r) => setTimeout(r, ORPHAN_POLL_MS));
    }
  } finally {
    orphanJobs = [];
  }
  await refresh();
  if (!lanes.media.running) setConsole("idle", "Job trên server đã xong.");
  syncJobUi();
}

setConsole("idle", "Đang tải scene...");
refresh()
  .then(watchOrphanJobs)
  .catch((e) => {
    setConsole("error", `Tải thất bại: ${e.message}`);
    toast(e.message, false);
  });
