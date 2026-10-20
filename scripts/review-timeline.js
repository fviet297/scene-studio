// Scene Studio - timeline preview.
//
// Plays the scenes back to back with the timing build-remotion.mjs gives the render: a scene
// lasts max(narration audio, motion clip) plus a short pause before the next one; a clip shorter
// than its scene is slowed (rate = clip / scene) to span it, then holds its last frame through the
// pause. A scene without audio holds for the render's placeholder. Clips play muted.
//
// Uses the panel globals ($, state, view, currentScene, selectScene, setView, toast) from
// review-panel.js, which loads first, and redraws on its "studio:render" / "studio:view" events.

// Must match PLACEHOLDER_SCENE_SECONDS and SCENE_GAP_SECONDS in scripts/build-remotion.mjs.
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
};

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

function timelineClips() {
  let start = 0;
  const last = state.scenes.length - 1;
  return state.scenes.map((scene, i) => {
    const audioSeconds = scene.hasAudio
      ? (tlMediaSeconds.get(scene.audioUrl) ?? null)
      : null;
    const videoSeconds = scene.hasMotionVideo
      ? (tlMediaSeconds.get(scene.motionVideoUrl) ?? 0)
      : 0;
    const content = Math.max(
      audioSeconds ?? TL_PLACEHOLDER_SECONDS,
      videoSeconds,
    );
    const rate =
      videoSeconds > 0 && videoSeconds < content ? videoSeconds / content : 1;
    const seconds = content + (i < last ? TL_SCENE_GAP_SECONDS : 0);
    const clip = { scene, start, seconds, content, audioSeconds, rate };
    start += seconds;
    return clip;
  });
}

const clipsTotal = (clips) => clips.reduce((sum, c) => sum + c.seconds, 0);

const clipKind = (s) =>
  s.hasMotionVideo ? "motion video" : s.hasImage ? "ảnh tĩnh" : "chưa có ảnh";

// ------------------------------------------------------------------ render

const TL_ICON_FILM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>';
const TL_ICON_STILL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';

function clipHtml(clip, i) {
  const s = clip.scene;
  const width = clip.seconds * tl.pxPerSec;
  // Narrow clips drop the duration, then the icon, rather than show cut-off text.
  const showDuration = width >= TL_CLIP_DURATION_MIN_PX;
  const showIcon = width >= TL_CLIP_ICON_MIN_PX;
  const duration = s.hasAudio
    ? `${clip.content.toFixed(1)}s`
    : `~${clip.content}s`;
  const icon = !showIcon
    ? ""
    : s.hasMotionVideo
      ? TL_ICON_FILM
      : s.hasImage
        ? TL_ICON_STILL
        : "";
  const audioNote = s.hasAudio ? "" : ", chưa có audio";
  const classes = [
    "tl-clip",
    s.hasAudio ? "" : "no-audio",
    s.hasImage ? "" : "no-image",
  ]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="${classes}" data-index="${i}" style="width:${width}px"
      aria-current="${i === tl.index}" aria-label="Scene ${s.scene}, ${clip.content.toFixed(1)} giây, ${clipKind(s)}${audioNote}"
      title="Scene ${s.scene} · ${duration} · ${clipKind(s)}${audioNote}">
    ${s.hasImage ? `<img src="${s.imageUrl}" alt="" loading="lazy" draggable="false" />` : ""}
    <span class="tl-clip-label">
      <span class="num">${s.scene}</span>${icon}
      ${showDuration ? `<span class="num tl-clip-dur">${duration}</span>` : ""}
    </span>
  </button>`;
}

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
    if (s.hasMotionVideo) measureMedia(s.motionVideoUrl, "video");
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
  for (const id of ["tlPlay", "tlPrev", "tlNext", "tlOpen"])
    $(id).disabled = !clips.length;
  // Mid-playback the media keeps running; a paused view reloads so a regenerated clip shows.
  if (clips.length && !tl.playing) loadClip(clips, tl.index, tl.offset);
  syncPlayhead(clips);
}

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
  $("tlKind").textContent = s.hasAudio
    ? clipKind(s)
    : `${clipKind(s)} · chưa có audio`;
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
  currentScene = s.scene;

  const still = $("tlStill");
  const video = $("tlVideo");
  if (s.hasImage && still.getAttribute("src") !== s.imageUrl)
    still.src = s.imageUrl;
  still.hidden = !s.hasImage || s.hasMotionVideo;
  video.hidden = !s.hasMotionVideo;
  video.poster = s.hasImage ? s.imageUrl : "";
  $("tlEmpty").hidden = s.hasImage || s.hasMotionVideo;

  setMediaSrc($("tlAudio"), s.hasAudio ? s.audioUrl : null);
  setMediaSrc(video, s.hasMotionVideo ? s.motionVideoUrl : null);
  if (s.hasAudio) $("tlAudio").currentTime = offset;
  if (s.hasMotionVideo) {
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
  if (s.hasMotionVideo)
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
  if (tl.playing) startMedia(clips[index]);
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
$("tlOpen").addEventListener("click", openInWorkbench);

$("tlZoom").addEventListener("input", (e) => {
  tl.userZoom = true;
  tl.pxPerSec = Number(e.target.value);
  renderTimeline();
});

// Press and drag anywhere on the ruler or the clips to scrub.
const tlTimeAtPointer = (e) =>
  (e.clientX - $("tlInner").getBoundingClientRect().left) / tl.pxPerSec;
$("tlInner").addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
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
$("tlInner").addEventListener("dblclick", openInWorkbench);
// Keyboard activation of a clip (Enter/Space on a focused clip) jumps to its start.
$("tlClips").addEventListener("click", (e) => {
  const btn = e.target.closest(".tl-clip");
  if (btn && e.detail === 0)
    seekTo(timelineClips()[Number(btn.dataset.index)].start);
});

window.addEventListener("keydown", (e) => {
  if (!tlVisible() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest?.("input, select, textarea, [contenteditable]")) return;
  if (e.key === " ") {
    // A focused button already toggles itself on Space.
    if (e.target.closest?.("button")) return;
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
  if (tlVisible() && !tl.userZoom) renderTimeline();
});

document.addEventListener("studio:render", () => {
  if (tlVisible()) renderTimeline();
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
