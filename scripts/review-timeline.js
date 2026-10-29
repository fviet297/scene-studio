// Scene Studio - timeline preview.
//
// Plays the scenes back to back with the timing build-remotion.mjs gives the render: a scene
// lasts max(narration audio, motion clip) plus a short pause before the next one; a clip shorter
// than its scene (narration plus the pause before the next scene) is slowed (rate = clip / scene)
// to span all of it, so it never holds a frozen frame. A scene without audio holds for the
// render's placeholder. Clips play muted.
//
// Two kinds of preview. "Nháp" (draft) is the quick one above: stills, clips and narration played
// by the panel itself. "Bản render" / "9:16" play the real Remotion composition through
// @remotion/player (/preview.js) on the data the render step builds (/api/preview-data), so what
// plays is what the MP4 will contain; "9:16" also crops it to the strip wrap-vertical.mjs keeps.
//
// It is also where scenes are picked for a batch run: double-clicking a clip toggles it in the
// panel's shared `selected` Set (the batch bar above the track acts on it); a single click only
// moves the playhead;
// each clip also carries status pips, and a lane under the clips shows which task is running on,
// or waiting for, each scene (see "job lane" below).
//
// Uses the panel globals ($, state, view, currentScene, current, selectScene, setView, toast,
// paintBrandLayer, selected, renderSelection, pips, playsMotion, syncTimelineHistory) from review-panel.js, which loads first, and redraws on its "studio:render" /
// "studio:view" events.

// Must match PLACEHOLDER_SCENE_SECONDS in scripts/lib/scene-timing.mjs and SCENE_GAP_SECONDS in
// scripts/build-remotion.mjs.
const TL_PLACEHOLDER_SECONDS = 4;
const TL_SCENE_GAP_SECONDS = 0.5;
const TL_ZOOM_MIN = 4;
const TL_ZOOM_MAX = 80;
// Narrowest gap between two ruler labels, so the m:ss text never overlaps.
const TL_RULER_MIN_GAP_PX = 56;
const TL_RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120];
// Clip widths below which the label drops its duration, then its icon.
const TL_CLIP_DURATION_MIN_PX = 76;
const TL_CLIP_ICON_MIN_PX = 40;
// Room one character dot takes in the label (6px dot + 2px gap); the duration needs that much more.
const TL_CLIP_DOT_PX = 8;
// Below this a clip with characters drops its still/film icon: the dots carry more information.
const TL_CLIP_ICON_WITH_CAST_MIN_PX = 64;
// The playhead is kept this far inside the visible track while playing.
const TL_FOLLOW_MARGIN_PX = 40;
// "Previous" past this point rewinds the current scene instead of jumping back one.
const TL_REWIND_THRESHOLD_SECONDS = 1;

// Media url → measured seconds. Urls carry ?v=<mtime>, so a regenerated file is re-measured.
const tlMediaSeconds = new Map();
const tl = {
  index: 0, // clip on screen
  offset: 0, // seconds into that clip
  playing: false,
  clockStart: 0, // performance.now() origin of the playback clock
  raf: 0,
  pxPerSec: 16,
  userZoom: false,
  scrubbing: false,
  sceneOnEnter: null,
  mode: "draft", // "draft" | "master" | "vertical"
};
// The "as rendered" player: built Remotion data for the active project, and the /preview.js load.
const tlRender = { project: null, slug: null, script: null, wired: false };
const isRenderMode = () => tl.mode !== "draft";

const tlVisible = () => view === "timeline";

function formatTimecode(sec) {
  const minutes = Math.floor(sec / 60);
  return `${minutes}:${(sec - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

function formatClock(sec) {
  const minutes = Math.floor(sec / 60);
  return `${minutes}:${String(Math.round(sec - minutes * 60)).padStart(2, "0")}`;
}

function measureMedia(url, tag) {
  if (tlMediaSeconds.has(url)) return;
  tlMediaSeconds.set(url, null);
  const probe = document.createElement(tag);
  probe.preload = "metadata";
  probe.addEventListener("loadedmetadata", () => {
    tlMediaSeconds.set(
      url,
      Number.isFinite(probe.duration) ? probe.duration : null,
    );
    if (tlVisible()) renderTimeline();
  });
  probe.addEventListener("error", () =>
    console.warn(`timeline: could not read the duration of ${url}`),
  );
  probe.src = url;
}

// In the render modes the clips come from the built data, frame-rounded the way ScenePlanVideo's
// sceneTimeline lays the scenes out, so the playhead and the player agree to the frame.
function renderClips(project) {
  let start = 0;
  return project.scenes.map((built, i) => {
    const frames = Math.round(project.sceneDurations[i] * project.fps);
    const seconds = frames / project.fps;
    const scene = state.scenes.find((s) => s.scene === built.scene) ?? built;
    // The builder bakes the pause before the next scene into the duration; labels show content.
    const gap = i < project.scenes.length - 1 ? TL_SCENE_GAP_SECONDS : 0;
    const content = seconds - gap;
    const clip = {
      scene,
      start,
      seconds,
      content,
      audioSeconds: content,
      rate: 1,
    };
    start += seconds;
    return clip;
  });
}

function timelineClips() {
  if (isRenderMode() && tlRender.project) return renderClips(tlRender.project);
  let start = 0;
  const last = state.scenes.length - 1;
  return state.scenes.map((scene, i) => {
    const audioSeconds = scene.hasAudio
      ? (tlMediaSeconds.get(scene.audioUrl) ?? null)
      : null;
    const videoSeconds = playsMotion(scene)
      ? (tlMediaSeconds.get(scene.motionVideoUrl) ?? 0)
      : 0;
    // Same rule as scene-timing.mjs: the scene's `duration` is a minimum, and stands in for the
    // placeholder while the scene has no audio.
    const minDuration = scene.duration ?? 0;
    const content = Math.max(
      audioSeconds ?? scene.duration ?? TL_PLACEHOLDER_SECONDS,
      videoSeconds,
      minDuration,
    );
    const seconds = content + (i < last ? TL_SCENE_GAP_SECONDS : 0);
    const rate =
      videoSeconds > 0 && videoSeconds < seconds ? videoSeconds / seconds : 1;
    const clip = { scene, start, seconds, content, audioSeconds, rate };
    start += seconds;
    return clip;
  });
}

const clipsTotal = (clips) => clips.reduce((sum, c) => sum + c.seconds, 0);

const clipKind = (s) =>
  playsMotion(s) ? "motion video" : s.hasImage ? "ảnh tĩnh" : "chưa có ảnh";

// ------------------------------------------------------------------ render

const TL_ICON_FILM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>';
const TL_ICON_STILL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';

function clipHtml(clip, i) {
  const s = clip.scene;
  const width = clip.seconds * tl.pxPerSec;
  // Narrow clips drop the duration, then the icon, rather than show cut-off text. Character dots
  // outrank the duration (it stays in the tooltip), so each dot raises the duration's threshold.
  const cast = s.characters || [];
  const showPips = width >= TL_CLIP_DURATION_MIN_PX;
  const showDuration =
    width >= TL_CLIP_DURATION_MIN_PX + cast.length * TL_CLIP_DOT_PX;
  const showCast = width >= TL_CLIP_ICON_MIN_PX;
  const showIcon =
    showCast && (!cast.length || width >= TL_CLIP_ICON_WITH_CAST_MIN_PX);
  const duration = s.hasAudio
    ? `${clip.content.toFixed(1)}s`
    : `~${clip.content}s`;
  const icon = !showIcon
    ? ""
    : playsMotion(s)
      ? TL_ICON_FILM
      : s.hasImage
        ? TL_ICON_STILL
        : "";
  const audioNote = !s.hasAudio
    ? ", chưa có audio"
    : s.audioStale
      ? ", audio cũ (narration đã sửa)"
      : "";
  const motionNote = s.motionStale ? ", motion cũ (ảnh đã đổi)" : "";
  const castNote = cast.length
    ? `, nhân vật: ${cast.map((id) => charById(id)?.name ?? id).join(", ")}`
    : "";
  const castDots =
    showCast && cast.length
      ? `<span class="tl-clip-chars">${cast.map(charDotHtml).join("")}</span>`
      : "";
  const classes = [
    "tl-clip",
    s.hasAudio ? "" : "no-audio",
    s.audioStale ? "stale-audio" : "",
    s.hasImage ? "" : "no-image",
  ]
    .filter(Boolean)
    .join(" ");
  const picked = selected.has(s.scene);
  return `<div class="tl-cell${picked ? " selected" : ""}" data-scene="${s.scene}" style="width:${width}px">
    <button type="button" class="${classes}" data-index="${i}"
        aria-current="${i === tl.index}" aria-pressed="${picked}" aria-label="Scene ${s.scene}, ${clip.content.toFixed(1)} giây, ${clipKind(s)}${audioNote}${motionNote}${castNote}"
        title="Scene ${s.scene} · ${duration} · ${clipKind(s)}${audioNote}${castNote}">
      ${s.hasImage ? `<img src="${s.imageUrl}" alt="" loading="lazy" draggable="false" />` : ""}
      <span class="tl-clip-label">
        <span class="num">${s.scene}</span>${icon}${castDots}
        ${showDuration ? `<span class="num tl-clip-dur">${duration}</span>` : ""}
      </span>
    </button>
    ${showIcon ? editButtonHtml(s) : ""}
    ${showPips ? pips(s) : ""}
  </div>`;
}

// Opens this scene in the workbench. A sibling of the clip button (buttons cannot nest), shown on
// the current clip and on hover/focus so twenty pencils never crowd the strip.
const TL_ICON_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const editButtonHtml = (s) =>
  `<button type="button" class="tl-edit" data-scene="${s.scene}" aria-label="Sửa scene ${s.scene}" title="Sửa scene ${s.scene} trong bàn làm việc">${TL_ICON_EDIT}</button>`;

function renderRuler(total) {
  const step =
    TL_RULER_STEPS.find((s) => s * tl.pxPerSec >= TL_RULER_MIN_GAP_PX) ??
    TL_RULER_STEPS.at(-1);
  const ticks = [];
  for (let t = 0; t <= total; t += step)
    ticks.push(
      `<span class="tl-tick" style="left:${t * tl.pxPerSec}px">${formatClock(t)}</span>`,
    );
  $("tlRuler").innerHTML = ticks.join("");
}

// Until the user drags the zoom slider, the whole cut fits the track width.
function fitZoom(total) {
  const width = $("tlTrack").clientWidth;
  if (tl.userZoom || !width || !total) return;
  const padding = 28; // .tl-track side padding
  const fitted = (width - padding) / total;
  tl.pxPerSec = Math.min(Math.max(fitted, TL_ZOOM_MIN), TL_ZOOM_MAX);
  $("tlZoom").value = String(Math.round(tl.pxPerSec));
}

function renderTimeline() {
  for (const s of state.scenes) {
    if (s.hasAudio) measureMedia(s.audioUrl, "audio");
    if (playsMotion(s)) measureMedia(s.motionVideoUrl, "video");
  }
  const clips = timelineClips();
  const total = clipsTotal(clips);
  fitZoom(total);

  const found = clips.findIndex((c) => c.scene.scene === currentScene);
  if (found < 0) tl.offset = 0;
  tl.index = Math.max(found, 0);

  $("tlInner").style.width = `${total * tl.pxPerSec}px`;
  $("tlTotal").textContent = formatTimecode(total);
  renderRuler(total);
  $("tlClips").innerHTML = clips.length
    ? clips.map(clipHtml).join("")
    : '<span class="tl-none">Chưa có scene nào.</span>';
  for (const id of ["tlPlay", "tlPrev", "tlNext"])
    $(id).disabled = !clips.length;
  // Mid-playback the media keeps running; a paused view reloads so a regenerated clip shows.
  if (clips.length && !tl.playing) loadClip(clips, tl.index, tl.offset);
  renderJobLane(clips);
  syncPlayhead(clips);
  if (isRenderMode()) remountPlayer();
  else paintBrandLayer($("tlScreen"), state.branding);
}

// ------------------------------------------------------------------ job lane
//
// Under the clips, one cell per scene as wide as its clip, holding a chip for each task pending on
// the scene (sceneJobList): filled and pulsing while the server works on it, dashed while it waits.
// A chip drops its label when the clip is too narrow for it, then chips beyond the first, then its
// icon; the cell's title always spells out every task and its state.
const TL_ICON_PROMPT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>';
const TL_ICON_AUDIO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></svg>';
const TL_JOB_ICON = {
  prompt: TL_ICON_PROMPT,
  motionPrompt: TL_ICON_PROMPT,
  image: TL_ICON_STILL,
  audio: TL_ICON_AUDIO,
  motion: TL_ICON_FILM,
  edit: TL_ICON_EDIT,
};
const TL_JOB_VERB = {
  prompt: "viết",
  motionPrompt: "viết",
  image: "sinh",
  audio: "sinh",
  motion: "sinh",
};
// A chip with just its icon, and one with icon + label, need this much room.
const TL_JOB_ICON_MIN_PX = 22;
const TL_JOB_LABEL_MIN_PX = 84;

const jobLabel = (task) => task.label ?? JOB_KIND_LABEL[task.kind];
function jobTitle(task) {
  if (task.kind === "edit") return task.label;
  const what = `${TL_JOB_VERB[task.kind]} ${JOB_KIND_LABEL[task.kind]}`;
  if (task.running) return `Đang ${what}`;
  return `Chờ ${what}${task.position ? ` · #${task.position}` : ""}`;
}

function jobChipHtml(task, { icon, label }) {
  const state = task.running ? "running" : "waiting";
  return `<span class="tl-job ${state}" data-kind="${task.kind}">${icon ? TL_JOB_ICON[task.kind] : ""}${label ? `<span class="tl-job-label">${escapeHtml(jobLabel(task))}</span>` : ""}</span>`;
}

function jobCellHtml(clip) {
  const width = clip.seconds * tl.pxPerSec;
  const tasks = sceneJobList(clip.scene.scene).sort(
    (a, b) => Number(b.running) - Number(a.running),
  );
  if (!tasks.length)
    return `<div class="tl-job-cell" style="width:${width}px"></div>`;
  const fits = Math.max(1, Math.floor(width / TL_JOB_ICON_MIN_PX));
  const shown = tasks.slice(0, fits);
  const look = {
    icon: width >= TL_JOB_ICON_MIN_PX,
    label: width / shown.length >= TL_JOB_LABEL_MIN_PX,
  };
  const title = `Scene ${clip.scene.scene}: ${tasks.map(jobTitle).join(" · ")}`;
  return `<div class="tl-job-cell" style="width:${width}px" role="img" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">${shown.map((t) => jobChipHtml(t, look)).join("")}</div>`;
}

function renderJobLane(clips = timelineClips()) {
  $("tlJobs").innerHTML = clips.map(jobCellHtml).join("");
}

// Jobs start, advance and end without a state refetch, so the lane redraws on its own signal.
// The undo/redo buttons lock while a job or direct edit holds the scene, so they follow too.
document.addEventListener("studio:jobs", () => {
  if (!tlVisible()) return;
  renderJobLane();
  const s = current();
  if (s) syncTimelineHistory(s);
});

function syncPlayhead(clips) {
  const clip = clips[tl.index];
  const now = clip ? clip.start + Math.min(tl.offset, clip.seconds) : 0;
  const x = now * tl.pxPerSec;
  $("tlNow").textContent = formatTimecode(now);
  $("tlPlayhead").style.transform = `translateX(${x}px)`;
  if (!tl.playing) return;
  const track = $("tlTrack");
  const left = track.scrollLeft + TL_FOLLOW_MARGIN_PX;
  const right = track.scrollLeft + track.clientWidth - TL_FOLLOW_MARGIN_PX;
  if (x < left || x > right) track.scrollLeft = x - track.clientWidth * 0.3;
}

function syncPlayButton() {
  const btn = $("tlPlay");
  btn.classList.toggle("playing", tl.playing);
  btn.setAttribute("aria-label", tl.playing ? "Tạm dừng" : "Phát");
}

// ------------------------------------------------------------------ playback

function setMediaSrc(el, url) {
  if (url) {
    if (el.getAttribute("src") !== url) el.src = url;
    return;
  }
  if (!el.hasAttribute("src")) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
}

function showSceneInfo(s) {
  $("tlScene").textContent = `Scene ${s.scene}`;
  const notes = [
    s.motionStale ? "motion cũ" : "",
    s.hasAudio ? "" : "chưa có audio",
  ].filter(Boolean);
  $("tlKind").textContent = [clipKind(s), ...notes].join(" · ");
  $("tlKind").classList.toggle("stale", Boolean(s.motionStale));
  syncTimelineHistory(s);
  $("tlCaption").textContent = s.narration || "";
  for (const btn of $("tlClips").querySelectorAll(".tl-clip"))
    btn.setAttribute(
      "aria-current",
      String(Number(btn.dataset.index) === tl.index),
    );
}

function loadClip(clips, index, offset) {
  const clip = clips[index];
  const s = clip.scene;
  tl.index = index;
  tl.offset = offset;
  if (currentScene !== s.scene) {
    currentScene = s.scene;
    renderSelection(); // the batch bar targets this scene while nothing is selected
  }
  if (isRenderMode()) {
    showSceneInfo(s);
    return;
  }

  const still = $("tlStill");
  const video = $("tlVideo");
  if (s.hasImage && still.getAttribute("src") !== s.imageUrl)
    still.src = s.imageUrl;
  const motion = playsMotion(s);
  still.hidden = !s.hasImage || motion;
  video.hidden = !motion;
  video.poster = s.hasImage ? s.imageUrl : "";
  $("tlEmpty").hidden = s.hasImage || motion;

  setMediaSrc($("tlAudio"), s.hasAudio ? s.audioUrl : null);
  setMediaSrc(video, motion ? s.motionVideoUrl : null);
  if (s.hasAudio) $("tlAudio").currentTime = offset;
  if (motion) {
    // A new src resets playbackRate to the default, so set both.
    video.defaultPlaybackRate = clip.rate;
    video.playbackRate = clip.rate;
    video.currentTime = offset * clip.rate;
  }
  showSceneInfo(s);
}

const isAbort = (error) => error?.name === "AbortError";

function startMedia(clip) {
  const s = clip.scene;
  tl.clockStart = performance.now() - tl.offset * 1000;
  if (playsMotion(s))
    $("tlVideo")
      .play()
      .catch((error) => {
        if (!isAbort(error))
          console.warn(`timeline: scene ${s.scene} video`, error);
      });
  // Seeking into the trailing pause or a padded clip tail starts past the narration's end.
  const narrationLeft =
    s.hasAudio && tl.offset < (clip.audioSeconds ?? clip.content);
  if (narrationLeft)
    $("tlAudio")
      .play()
      .catch((error) => {
        if (isAbort(error)) return;
        pause();
        toast(
          `Không phát được audio scene ${s.scene}: ${error.message}`,
          false,
        );
      });
}

// One wall clock drives every scene, because a scene runs past its narration (padded clip tail,
// pause before the next scene) and the audio element stops at its own end.
function tick() {
  if (!tl.playing) return;
  const clips = timelineClips();
  const clip = clips[tl.index];
  if (!clip) {
    pause();
    return;
  }
  tl.offset = (performance.now() - tl.clockStart) / 1000;

  if (tl.offset >= clip.seconds) {
    if (tl.index + 1 >= clips.length) {
      tl.offset = clip.seconds;
      pause();
      syncPlayhead(clips);
      return;
    }
    loadClip(clips, tl.index + 1, 0);
    startMedia(clips[tl.index]);
  }
  syncPlayhead(clips);
  tl.raf = requestAnimationFrame(tick);
}

function play() {
  if (isRenderMode()) {
    if (tlRender.project) window.scenePreview?.play();
    return;
  }
  const clips = timelineClips();
  if (!clips.length) return;
  const last = clips.at(-1);
  if (tl.index === clips.length - 1 && tl.offset >= last.seconds)
    loadClip(clips, 0, 0);
  tl.playing = true;
  startMedia(clips[tl.index]);
  cancelAnimationFrame(tl.raf);
  tl.raf = requestAnimationFrame(tick);
  syncPlayButton();
}

function pause() {
  window.scenePreview?.pause();
  tl.playing = false;
  cancelAnimationFrame(tl.raf);
  $("tlAudio").pause();
  $("tlVideo").pause();
  syncPlayButton();
}

function seekTo(seconds) {
  const clips = timelineClips();
  if (!clips.length) return;
  const t = Math.min(Math.max(seconds, 0), clipsTotal(clips));
  const found = clips.findIndex((c) => t < c.start + c.seconds);
  const index = found < 0 ? clips.length - 1 : found;
  loadClip(
    clips,
    index,
    Math.min(t - clips[index].start, clips[index].seconds),
  );
  if (isRenderMode()) {
    if (tlRender.project)
      window.scenePreview?.seekTo(Math.round(t * tlRender.project.fps));
  } else if (tl.playing) startMedia(clips[index]);
  syncPlayhead(clips);
}

function stepClip(delta) {
  const clips = timelineClips();
  if (!clips.length) return;
  const rewind = delta < 0 && tl.offset > TL_REWIND_THRESHOLD_SECONDS;
  const index = rewind
    ? tl.index
    : Math.min(Math.max(tl.index + delta, 0), clips.length - 1);
  seekTo(clips[index].start);
}

// Leaving the view pauses and syncs the workbench (see the "studio:view" listener).
const openInWorkbench = () => setView("stage");

// ------------------------------------------------------------------ wiring

$("tlPlay").addEventListener("click", () => (tl.playing ? pause() : play()));
$("tlPrev").addEventListener("click", () => stepClip(-1));
$("tlNext").addEventListener("click", () => stepClip(1));
$("tlClips").addEventListener("click", (e) => {
  const edit = e.target.closest(".tl-edit");
  if (!edit) return;
  const clip = timelineClips().find(
    (c) => c.scene.scene === Number(edit.dataset.scene),
  );
  if (clip) seekTo(clip.start);
  openInWorkbench();
});

$("tlZoom").addEventListener("input", (e) => {
  tl.userZoom = true;
  tl.pxPerSec = Number(e.target.value);
  renderTimeline();
});

// Press and drag anywhere on the ruler or the clips to scrub.
const tlTimeAtPointer = (e) =>
  (e.clientX - $("tlInner").getBoundingClientRect().left) / tl.pxPerSec;
// The scene under the pointer on the clip row, or null (ruler, past the end). Found by position,
// not e.target: pointer capture on #tlInner can retarget the dblclick that follows a press.
function tlSceneAtPointer(e) {
  // The job lane belongs to the clip above it, so a double-click there picks the scene too.
  const row = $("tlClips").getBoundingClientRect();
  const laneBottom = $("tlJobs").getBoundingClientRect().bottom;
  if (e.clientY < row.top || e.clientY > laneBottom) return null;
  const t = tlTimeAtPointer(e);
  const clip = timelineClips().find(
    (c) => t >= c.start && t < c.start + c.seconds,
  );
  return clip ? clip.scene.scene : null;
}
$("tlInner").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest(".tl-edit")) return;
  tl.scrubbing = true;
  $("tlInner").setPointerCapture(e.pointerId);
  seekTo(tlTimeAtPointer(e));
});
$("tlInner").addEventListener("pointermove", (e) => {
  if (tl.scrubbing) seekTo(tlTimeAtPointer(e));
});
for (const ev of ["pointerup", "pointercancel"])
  $("tlInner").addEventListener(ev, () => {
    tl.scrubbing = false;
  });
// Double-click on a clip toggles its selection; on the ruler it still opens the scene in the
// workbench.
$("tlInner").addEventListener("dblclick", (e) => {
  if (e.target.closest(".tl-edit")) return;
  const n = tlSceneAtPointer(e);
  if (n === null) {
    openInWorkbench();
    return;
  }
  if (selected.has(n)) selected.delete(n);
  else selected.add(n);
  renderSelection();
});
// Keyboard activation of a clip (Enter on a focused clip) jumps to its start and toggles its
// selection — the keyboard stand-in for double-click.
$("tlClips").addEventListener("click", (e) => {
  const btn = e.target.closest(".tl-clip");
  if (!btn || e.detail !== 0) return;
  const clip = timelineClips()[Number(btn.dataset.index)];
  seekTo(clip.start);
  const n = clip.scene.scene;
  if (selected.has(n)) selected.delete(n);
  else selected.add(n);
  renderSelection();
});

// The click a button fires on Space comes from keyup; cancel it for clips (see the keydown below).
$("tlClips").addEventListener("keyup", (e) => {
  if (e.key === " " && e.target.closest(".tl-clip")) e.preventDefault();
});

window.addEventListener("keydown", (e) => {
  if (!tlVisible() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest?.("input, select, textarea, [contenteditable]")) return;
  if (e.key === " ") {
    // A focused button already toggles itself on Space — except a clip, which a mouse click leaves
    // focused: there Space must play, not silently add the clip to the batch selection (Enter does that).
    if (e.target.closest?.("button:not(.tl-clip)")) return;
    e.preventDefault();
    if (tl.playing) pause();
    else play();
  } else if (["ArrowLeft", "ArrowUp", "k"].includes(e.key)) {
    e.preventDefault();
    stepClip(-1);
  } else if (["ArrowRight", "ArrowDown", "j"].includes(e.key)) {
    e.preventDefault();
    stepClip(1);
  }
});

window.addEventListener("resize", () => {
  if (!tlVisible()) return;
  if (tl.userZoom) paintBrandLayer($("tlScreen"), state.branding);
  else renderTimeline();
});

document.addEventListener("studio:render", () => {
  syncModeButtons();
  syncCaptionControls();
  if (!tlVisible()) return;
  // A project switch (or an aspect change that drops the 9:16 export) invalidates the built data.
  if (tl.mode === "vertical" && state.project?.aspect !== "16:9")
    setPreviewMode("master");
  else if (isRenderMode() && tlRender.slug !== state.project?.slug)
    loadRenderData(0);
  else renderTimeline();
});

document.addEventListener("studio:view", (e) => {
  if (e.detail === "timeline") {
    // Only one narration plays at a time.
    $("audioPlayer").pause();
    $("motionVideo").pause();
    tl.sceneOnEnter = currentScene;
    tl.offset = 0;
    renderTimeline();
    return;
  }
  pause();
  // The workbench was not redrawn while the timeline moved between scenes.
  if (currentScene !== tl.sceneOnEnter && currentScene != null)
    selectScene(currentScene);
});

// ------------------------------------------------------------------ "as rendered" modes

// Width of the strip wrap-vertical.mjs keeps from a 16:9 master (keep in sync with BAND_RATIO there).
const TL_VERTICAL_BAND_RATIO = 3 / 2;

function currentTime() {
  const clip = timelineClips()[tl.index];
  return clip ? clip.start + Math.min(tl.offset, clip.seconds) : 0;
}

function setPlayerStatus(message, isError = false) {
  const status = $("tlPlayerStatus");
  status.hidden = !message;
  status.textContent = message || "";
  status.classList.toggle("error", isError);
}

function loadPreviewScript() {
  tlRender.script ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/preview.js";
    script.onload = resolve;
    script.onerror = () => {
      tlRender.script = null;
      reject(new Error("Không tải được /preview.js"));
    };
    document.head.append(script);
  });
  return tlRender.script;
}

// The player owns the clock in the render modes; the timeline only follows its frame.
function onPlayerFrame(frame) {
  if (!isRenderMode() || !tlRender.project) return;
  const clips = timelineClips();
  const t = frame / tlRender.project.fps;
  const found = clips.findIndex((c) => t < c.start + c.seconds);
  const index = found < 0 ? clips.length - 1 : found;
  if (index !== tl.index) {
    tl.index = index;
    currentScene = clips[index].scene.scene;
    renderSelection();
    showSceneInfo(clips[index].scene);
  }
  tl.offset = t - clips[index].start;
  syncPlayhead(clips);
}

function wirePlayer() {
  if (tlRender.wired) return;
  tlRender.wired = true;
  const setPlaying = (playing) => () => {
    tl.playing = playing;
    syncPlayButton();
  };
  window.scenePreview.on("frameupdate", onPlayerFrame);
  window.scenePreview.on("play", setPlaying(true));
  window.scenePreview.on("pause", setPlaying(false));
  window.scenePreview.on("ended", setPlaying(false));
}

// 9:16 shows the master the way wrap-vertical.mjs exports it: the centred 3:2 strip, full width,
// on a black 1080x1920 canvas. The player is widened so the band shows exactly that strip.
function layoutBand() {
  const root = $("tlPlayerRoot");
  const { width = 1080, height = 1920 } = tlRender.project;
  const widthPct =
    tl.mode === "vertical"
      ? (width / height / TL_VERTICAL_BAND_RATIO) * 100
      : 100;
  root.style.width = `${widthPct}%`;
  root.style.left = `${-(widthPct - 100) / 2}%`;
}

// Branding saved in the dialog applies without a rebuild: the builder stamps the same object.
function remountPlayer() {
  if (!tlRender.project || !window.scenePreview) return;
  layoutBand();
  window.scenePreview.mount($("tlPlayerRoot"), {
    ...tlRender.project,
    branding: state.branding ?? tlRender.project.branding,
  });
}

// Rebuild the render data (same builder the Render MP4 step runs first) and resume at `seconds`.
async function loadRenderData(seconds) {
  tlRender.project = null;
  setPlayerStatus("Đang dựng dữ liệu render…");
  try {
    await loadPreviewScript();
    wirePlayer();
    const { project } = await api("/api/preview-data");
    if (!isRenderMode()) return;
    tlRender.project = project;
    tlRender.slug = state.project?.slug ?? null;
    setPlayerStatus("");
    renderTimeline();
    seekTo(seconds);
  } catch (e) {
    setPlayerStatus(`Không dựng được preview: ${e.message}`, true);
  }
}

function setPreviewMode(mode) {
  if (mode === tl.mode) return;
  const seconds = currentTime();
  pause();
  tl.mode = mode;
  for (const btn of $("tlModes").querySelectorAll("button"))
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
  const render = isRenderMode();
  $("tlScreen").classList.toggle("is-render", render);
  $("tlScreen").classList.toggle("is-vertical", mode === "vertical");
  $("tlPlayer").hidden = !render;
  $("tlPlayerRefresh").hidden = !render;
  if (render) {
    loadRenderData(seconds);
    return;
  }
  window.scenePreview?.unmount();
  tlRender.project = null;
  setPlayerStatus("");
  renderTimeline();
  seekTo(seconds);
}

// Only a 16:9 master has a separate 9:16 export to preview.
function syncModeButtons() {
  const wide = state.project?.aspect === "16:9";
  const master = $("tlModes").querySelector('[data-mode="master"]');
  master.textContent = wide ? "16:9" : "Bản render";
  $("tlModes").querySelector('[data-mode="vertical"]').hidden = !wide;
}

// Subtitles are a branding.json setting (captions.*), so the player, the bundle and the MP4 all
// read one object. Edits apply to the player at once and are saved after a short pause, so
// dragging the size slider does not write the file on every tick.
const CAPTION_DEFAULTS = {
  font: "be-vietnam",
  size: 48,
  strokeWidth: 7,
  backgroundOpacity: 0.42,
  uppercase: false,
  highlight: "karaoke",
  position: "bottom",
  anchor: "crop",
  spokenColor: "#f6c85f",
  unspokenColor: "#ffffff",
};
const CAPTION_SAVE_DELAY_MS = 400;
let captionSaveTimer = null;

function syncCaptionControls() {
  const captions = state.branding?.captions;
  if (!captions) return;
  $("tlCaptionsToggle").setAttribute("aria-pressed", String(captions.enabled));
  $("capFont").value = captions.font;
  $("capStroke").value = captions.strokeWidth;
  $("capStrokeVal").textContent = `${captions.strokeWidth}px`;
  $("capBg").value = Math.round(captions.backgroundOpacity * 100);
  $("capBgVal").textContent = `${Math.round(captions.backgroundOpacity * 100)}%`;
  $("capUppercase").checked = captions.uppercase;
  for (const btn of $("capHighlight").querySelectorAll("button"))
    btn.setAttribute(
      "aria-pressed",
      String(btn.dataset.highlight === captions.highlight),
    );
  $("capSize").value = captions.size;
  $("capSizeVal").textContent = `${captions.size}px`;
  for (const btn of $("capPosition").querySelectorAll("button"))
    btn.setAttribute(
      "aria-pressed",
      String(btn.dataset.position === captions.position),
    );
  $("capSpokenColor").value = captions.spokenColor;
  $("capUnspokenColor").value = captions.unspokenColor;
  $("capAnchor").value = captions.anchor;
  $("capAnchorField").hidden = state.project?.aspect !== "16:9";
}

async function saveCaptions() {
  try {
    await api("/api/branding", state.branding);
  } catch (err) {
    toast(`Không lưu được phụ đề: ${err.message}`, false);
  }
}

function updateCaptions(patch) {
  if (!state.branding) return;
  const captions = { ...state.branding.captions, ...patch };
  state = { ...state, branding: { ...state.branding, captions } };
  syncCaptionControls();
  if (isRenderMode()) remountPlayer();
  else if (patch.enabled)
    toast("Phụ đề bật. Xem ở Bản render / 9:16 hoặc trong MP4.");
  clearTimeout(captionSaveTimer);
  captionSaveTimer = setTimeout(saveCaptions, CAPTION_SAVE_DELAY_MS);
}

$("tlCaptionsToggle").addEventListener("click", () =>
  updateCaptions({ enabled: !state.branding?.captions?.enabled }),
);
$("capFont").addEventListener("change", (e) =>
  updateCaptions({ font: e.target.value }),
);
$("capStroke").addEventListener("input", (e) =>
  updateCaptions({ strokeWidth: Number(e.target.value) }),
);
$("capBg").addEventListener("input", (e) =>
  updateCaptions({ backgroundOpacity: Number(e.target.value) / 100 }),
);
$("capUppercase").addEventListener("change", (e) =>
  updateCaptions({ uppercase: e.target.checked }),
);
$("capHighlight").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-highlight]");
  if (btn) updateCaptions({ highlight: btn.dataset.highlight });
});
$("capSize").addEventListener("input", (e) =>
  updateCaptions({ size: Number(e.target.value) }),
);
$("capPosition").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-position]");
  if (btn) updateCaptions({ position: btn.dataset.position });
});
$("capSpokenColor").addEventListener("input", (e) =>
  updateCaptions({ spokenColor: e.target.value }),
);
$("capUnspokenColor").addEventListener("input", (e) =>
  updateCaptions({ unspokenColor: e.target.value }),
);
$("capAnchor").addEventListener("change", (e) =>
  updateCaptions({ anchor: e.target.value }),
);
$("capReset").addEventListener("click", () => updateCaptions(CAPTION_DEFAULTS));

function setCaptionPopOpen(open) {
  $("tlCaptionsPop").hidden = !open;
  $("tlCaptionsSettings").setAttribute("aria-expanded", String(open));
}
$("tlCaptionsSettings").addEventListener("click", () =>
  setCaptionPopOpen($("tlCaptionsPop").hidden),
);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".cap-ctl")) setCaptionPopOpen(false);
});
$("tlCaptionsPop").addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  setCaptionPopOpen(false);
  $("tlCaptionsSettings").focus();
});

$("tlModes").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (btn) setPreviewMode(btn.dataset.mode);
});
$("tlPlayerRefresh").addEventListener("click", () =>
  loadRenderData(currentTime()),
);
