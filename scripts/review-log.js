// Activity log: the drawer that slides up from the console bar ("Xem log").
//
// One log for the whole session, not one per job: every job start/end, every SSE line of a
// generation (prompt, image, audio, motion, render, character, thumbnail, script), every failed
// request, every toast and every uncaught JS error lands here with its time, source and level.
// The drawer floats over the working area (absolute, above the bar), so opening it never
// reflows the stage or the timeline.
//
// Loaded before review-panel.js, which calls logEvent / logSourceForPath / openLog. The entries
// are kept in localStorage so a reload keeps the trail that led to it; storage is optional.

const LOG_LIMIT = 2000;
const LOG_TEXT_LIMIT = 1500;
const LOG_STORE_KEY = "studioActivityLog";
const LOG_SAVE_DELAY_MS = 800;
// A toast or error repeating the line just logged (e.g. a job's "done" line, then its toast)
// is dropped when it arrives within this window.
const LOG_DEDUPE_MS = 3000;

const LOG_SOURCE_LABEL = {
  prompt: "prompt",
  motionPrompt: "motion prompt",
  image: "ảnh",
  audio: "audio",
  motion: "motion",
  render: "render",
  char: "nhân vật",
  thumb: "thumbnail",
  script: "kịch bản",
  project: "dự án",
  timeline: "timeline",
  queue: "hàng chờ",
  ui: "thông báo",
  api: "api",
  js: "lỗi JS",
};

// First match wins, so the more specific paths come first.
const LOG_PATH_SOURCES = [
  [/motion-prompt/, "motionPrompt"],
  [/prompt/, "prompt"],
  [/motion/, "motion"],
  [/audio|voice|narration|vieneu|omnivoice/, "audio"],
  [/finalize|render|preview-data|\/video/, "render"],
  [/character|puppet|profile|\/char/, "char"],
  [/thumbnail/, "thumb"],
  [/script|social/, "script"],
  [/generate|image|upload|crop|history|undo|redo/, "image"],
  [/project|aspect|template|style|brand|output-dir|media-sync/, "project"],
];

// A job kind (enqueueJob) names its source directly; otherwise the endpoint decides.
function logSourceForPath(path, kind) {
  if (kind && LOG_SOURCE_LABEL[kind]) return kind;
  const hit = LOG_PATH_SOURCES.find(([re]) => re.test(String(path)));
  return hit ? hit[1] : "api";
}

// Level from a server log line's leading mark (the same marks trackSceneProgress reads).
function logLevelForLine(line) {
  const text = String(line).trimStart();
  if (text.startsWith("✗") || /^error\b/i.test(text)) return "error";
  if (text.startsWith("•")) return "warn";
  if (text.startsWith("✓")) return "ok";
  return "info";
}

const logText = (value) => {
  const text =
    typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return text.length > LOG_TEXT_LIMIT
    ? `${text.slice(0, LOG_TEXT_LIMIT)}… (+${text.length - LOG_TEXT_LIMIT} ký tự)`
    : text;
};

const activityLog = [];
const logView = { level: "all", source: "all", unseenErrors: 0, saveTimer: null };

function logEvent(source, value, level = "info") {
  const text = logText(value).trim();
  if (!text) return;
  const last = activityLog.at(-1);
  const now = Date.now();
  if (
    last &&
    now - last.at < LOG_DEDUPE_MS &&
    (last.text === text || last.text.endsWith(text))
  )
    return;
  const entry = { at: now, level, source, text };
  activityLog.push(entry);
  // At the cap, drop the oldest line from the DOM too rather than redraw 2000 lines per new one
  // (which would also yank a reader scrolled up back to the bottom).
  const dropped =
    activityLog.length > LOG_LIMIT
      ? activityLog.splice(0, activityLog.length - LOG_LIMIT)
      : [];
  const box = document.getElementById("conLog");
  for (const old of dropped)
    if (logMatches(old)) box.querySelector(".log-line")?.remove();
  if (logMatches(entry)) appendLogLine(entry);
  if (level === "error" && !logIsOpen()) logView.unseenErrors++;
  syncLogMeta();
  scheduleLogSave();
}

const logMatches = ({ level, source }) =>
  (logView.source === "all" || logView.source === source) &&
  (logView.level === "all" ||
    level === "error" ||
    (logView.level === "warn" && level === "warn"));

const logTime = (at) =>
  new Date(at).toLocaleTimeString("vi-VN", { hour12: false });

function logLine({ at, level, source, text }) {
  const row = document.createElement("div");
  row.className = `log-line lv-${level}`;
  const time = document.createElement("time");
  time.textContent = logTime(at);
  const src = document.createElement("span");
  src.className = "log-src";
  src.textContent = LOG_SOURCE_LABEL[source] ?? source;
  const body = document.createElement("span");
  body.className = "log-text";
  body.textContent = text;
  row.append(time, src, body);
  return row;
}

// Follow new lines only while the reader is already at the bottom.
function appendLogLine(entry) {
  const box = document.getElementById("conLog");
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  box.querySelector(".log-empty")?.remove();
  box.append(logLine(entry));
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function renderLog() {
  const box = document.getElementById("conLog");
  const shown = activityLog.filter(logMatches);
  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "log-empty";
    empty.textContent = activityLog.length
      ? "Không có dòng nào khớp bộ lọc."
      : "Chưa có hoạt động nào.";
    box.replaceChildren(empty);
    return;
  }
  box.replaceChildren(...shown.map(logLine));
  box.scrollTop = box.scrollHeight;
}

function syncLogMeta() {
  const errors = activityLog.filter((e) => e.level === "error").length;
  document.getElementById("conLogCount").textContent =
    `${activityLog.length} dòng${errors ? ` · ${errors} lỗi` : ""}`;
  const badge = document.getElementById("conLogBadge");
  badge.hidden = logView.unseenErrors === 0;
  badge.textContent = logView.unseenErrors;
  document.getElementById("conLogClear").disabled = activityLog.length === 0;
}

// Plain text of the lines the filters show, for "Copy log".
const logPlainText = () =>
  activityLog
    .filter(logMatches)
    .map(
      (e) =>
        `${new Date(e.at).toISOString()} [${e.level}] [${LOG_SOURCE_LABEL[e.source] ?? e.source}] ${e.text}`,
    )
    .join("\n");

function scheduleLogSave() {
  clearTimeout(logView.saveTimer);
  logView.saveTimer = setTimeout(saveLog, LOG_SAVE_DELAY_MS);
}
function saveLog() {
  clearTimeout(logView.saveTimer);
  try {
    localStorage.setItem(LOG_STORE_KEY, JSON.stringify(activityLog));
  } catch {
    // Storage full or disabled: the log still works for this page.
  }
}
function restoreLog() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOG_STORE_KEY) ?? "[]");
    if (Array.isArray(saved))
      activityLog.push(
        ...saved
          .filter((e) => e && typeof e.text === "string")
          .slice(-LOG_LIMIT),
      );
  } catch {
    // Unreadable entry: start a fresh log.
  }
}

const logIsOpen = () =>
  document.getElementById("console").classList.contains("open");

function openLog(open) {
  document.getElementById("console").classList.toggle("open", open);
  document.getElementById("conDrawer").inert = !open;
  const toggle = document.getElementById("conToggle");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.firstChild.textContent = open ? "Ẩn log" : "Xem log";
  if (open) {
    logView.unseenErrors = 0;
    syncLogMeta();
    const box = document.getElementById("conLog");
    box.scrollTop = box.scrollHeight;
  }
}

function fillLogSourceFilter() {
  const select = document.getElementById("conLogSource");
  for (const [value, label] of Object.entries(LOG_SOURCE_LABEL)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

document.getElementById("conToggle").addEventListener("click", () =>
  openLog(!logIsOpen()),
);
document
  .getElementById("conLogClose")
  .addEventListener("click", () => openLog(false));
document.getElementById("conLogLevel").addEventListener("change", (e) => {
  logView.level = e.target.value;
  renderLog();
});
document.getElementById("conLogSource").addEventListener("change", (e) => {
  logView.source = e.target.value;
  renderLog();
});
document.getElementById("conLogClear").addEventListener("click", () => {
  activityLog.length = 0;
  logView.unseenErrors = 0;
  renderLog();
  syncLogMeta();
  saveLog();
});
document.getElementById("conCopy").addEventListener("click", async () => {
  const text = logPlainText();
  if (!text.trim()) {
    toast("Log trống.", false);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Đã copy log.");
  } catch {
    toast("Clipboard không dùng được.", false);
  }
});
window.addEventListener("pagehide", saveLog);

// Errors no handler caught: otherwise they only reach the devtools console.
window.addEventListener("error", (e) => {
  const where = e.filename
    ? ` (${e.filename.split("/").pop()}:${e.lineno}:${e.colno})`
    : "";
  logEvent("js", `${e.message}${where}`, "error");
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const text =
    reason instanceof Error
      ? `${reason.message}${reason.stack ? ` — ${reason.stack.split("\n")[1]?.trim() ?? ""}` : ""}`
      : String(reason);
  logEvent("js", `Promise bị từ chối không xử lý: ${text}`, "error");
});

fillLogSourceFilter();
restoreLog();
openLog(false);
renderLog();
logEvent("ui", `— Mở panel (${location.host}) —`);
