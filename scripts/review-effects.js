// Project-wide video effects (branding.json → effects), edited from the "Hiệu ứng" popover next to
// the subtitle toggle: scene transition, colour grade, the per-scene filmic base (vignette, grain)
// and overlay layers drawn above every scene. They show in the render modes (Bản render / 9:16)
// and in the MP4; the draft preview does not draw them. Needs timeline.js (remountPlayer,
// isRenderMode, fitPopHeight) and the shared `state`, `$`, `api`, `toast`.

const FX_LAYER_LABELS = {
  fog: "Sương mù",
  lightRays: "Tia sáng",
  dust: "Bụi lơ lửng",
  snow: "Tuyết rơi",
  embers: "Tàn lửa",
  rain: "Mưa",
  petals: "Cánh hoa rơi",
  bokeh: "Bokeh (đốm sáng mờ)",
  lightLeak: "Chói nắng (light leak)",
};
const FX_INTENSITY_RANGE = { min: 10, max: 100, step: 5 };
const FX_SAVE_DELAY_MS = 400;
// Mirrors DEFAULT_BRANDING.effects (scripts/lib/branding.mjs).
const FX_DEFAULTS = {
  vignette: true,
  grain: true,
  grade: "none",
  transition: { type: "crossfade", frames: 8 },
  layers: Object.fromEntries(
    Object.keys(FX_LAYER_LABELS).map((id) => [
      id,
      { enabled: false, intensity: 50 },
    ]),
  ),
};

let fxSaveTimer = null;
let fxDraftHintShown = false;

function renderEffectLayerRows() {
  $("fxLayers").innerHTML = Object.entries(FX_LAYER_LABELS)
    .map(
      ([id, label]) => `<div class="fx-layer">
        <div class="fx-layer-head">
          <label class="cap-check"><input type="checkbox" data-fx-layer="${id}" /> ${label}</label>
          <output class="num" data-fx-value="${id}"></output>
        </div>
        <input type="range" data-fx-intensity="${id}" aria-label="Cường độ: ${label}"
          min="${FX_INTENSITY_RANGE.min}" max="${FX_INTENSITY_RANGE.max}" step="${FX_INTENSITY_RANGE.step}" />
      </div>`,
    )
    .join("");
}

const hasActiveEffects = (fx) =>
  fx.grade !== "none" ||
  fx.transition.type !== FX_DEFAULTS.transition.type ||
  !fx.vignette ||
  !fx.grain ||
  Object.values(fx.layers).some((layer) => layer.enabled);

function syncEffectsControls() {
  const fx = state.branding?.effects;
  if (!fx) return;
  $("tlEffectsToggle").setAttribute("aria-pressed", String(hasActiveEffects(fx)));
  $("fxTransition").value = fx.transition.type;
  $("fxTransitionFrames").value = fx.transition.frames;
  $("fxTransitionFramesVal").textContent = `${fx.transition.frames} frame`;
  $("fxTransitionFramesField").hidden = fx.transition.type === "none";
  $("fxGrade").value = fx.grade;
  $("fxVignette").checked = fx.vignette;
  $("fxGrain").checked = fx.grain;
  for (const [id, layer] of Object.entries(fx.layers)) {
    const box = $("fxLayers").querySelector(`[data-fx-layer="${id}"]`);
    const slider = $("fxLayers").querySelector(`[data-fx-intensity="${id}"]`);
    box.checked = layer.enabled;
    slider.value = layer.intensity;
    slider.disabled = !layer.enabled;
    $("fxLayers").querySelector(`[data-fx-value="${id}"]`).textContent =
      layer.enabled ? `${layer.intensity}%` : "";
  }
}

async function saveEffects() {
  try {
    await api("/api/branding", state.branding);
  } catch (err) {
    toast(`Không lưu được hiệu ứng: ${err.message}`, false);
  }
}

function updateEffects(patch) {
  if (!state.branding?.effects) return;
  const current = state.branding.effects;
  const effects = {
    ...current,
    ...patch,
    transition: { ...current.transition, ...patch.transition },
    layers: { ...current.layers, ...patch.layers },
  };
  state = { ...state, branding: { ...state.branding, effects } };
  syncEffectsControls();
  if (isRenderMode()) remountPlayer();
  else announceEffectsInDraft();
  clearTimeout(fxSaveTimer);
  fxSaveTimer = setTimeout(saveEffects, FX_SAVE_DELAY_MS);
}

function announceEffectsInDraft() {
  if (fxDraftHintShown) return;
  fxDraftHintShown = true;
  toast("Hiệu ứng hiện ở Bản render / 9:16 và trong MP4; chế độ Nháp không vẽ hiệu ứng.");
}

const updateEffectLayer = (id, patch) =>
  updateEffects({
    layers: { [id]: { ...state.branding.effects.layers[id], ...patch } },
  });

function setEffectsPopOpen(open) {
  $("tlEffectsPop").hidden = !open;
  $("tlEffectsToggle").setAttribute("aria-expanded", String(open));
  if (open) fitPopHeight($("tlEffectsPop"), $("tlEffectsToggle"));
}

renderEffectLayerRows();

$("tlEffectsToggle").addEventListener("click", () =>
  setEffectsPopOpen($("tlEffectsPop").hidden),
);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".fx-ctl")) setEffectsPopOpen(false);
});
window.addEventListener("resize", () => {
  if (!$("tlEffectsPop").hidden)
    fitPopHeight($("tlEffectsPop"), $("tlEffectsToggle"));
});
$("tlEffectsPop").addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  setEffectsPopOpen(false);
  $("tlEffectsToggle").focus();
});

$("fxTransition").addEventListener("change", (e) =>
  updateEffects({ transition: { type: e.target.value } }),
);
$("fxTransitionFrames").addEventListener("input", (e) =>
  updateEffects({ transition: { frames: Number(e.target.value) } }),
);
$("fxGrade").addEventListener("change", (e) =>
  updateEffects({ grade: e.target.value }),
);
$("fxVignette").addEventListener("change", (e) =>
  updateEffects({ vignette: e.target.checked }),
);
$("fxGrain").addEventListener("change", (e) =>
  updateEffects({ grain: e.target.checked }),
);
$("fxLayers").addEventListener("change", (e) => {
  const id = e.target.dataset.fxLayer;
  if (id) updateEffectLayer(id, { enabled: e.target.checked });
});
$("fxLayers").addEventListener("input", (e) => {
  const id = e.target.dataset.fxIntensity;
  if (id) updateEffectLayer(id, { intensity: Number(e.target.value) });
});
$("fxReset").addEventListener("click", () => updateEffects(FX_DEFAULTS));

document.addEventListener("studio:render", syncEffectsControls);
