// Square crop dialog for character reference images.
//
// Every reference is stored as a 1024×1024 square (review-server optimizeCharacterImage), and the
// server's own fallback is a centre crop, which beheads a tall full-body picture. So the panel lets
// the person choose the square first: drag to move, zoom to size it, or zoom out to keep the whole
// picture on a light-grey margin (the same grey the server pads AI drafts with).
//
//   cropImage(file) → Promise<File | null>
//     the cropped JPEG, the untouched file when the person chooses "Dùng ảnh gốc" (or the browser
//     cannot decode it, so the server decides), or null when the dialog is cancelled.

const CROP_PAD_COLOR = "#D8D8D8";
const CROP_MAX_OUTPUT_PX = 2048;
const CROP_MAX_ZOOM_OVER_COVER = 4;
const CROP_JPEG_QUALITY = 0.95;
const CROP_KEY_PAN_PX = 12;
const CROP_WHEEL_ZOOM_STEP = 1.1;
const CROP_KEY_ZOOM_STEP = 1.1;
const CROP_SLIDER_MAX = 100;

const crop = {
  file: null,
  img: null,
  objectUrl: null,
  resolve: null,
  opener: null,
  natural: { w: 0, h: 0 },
  scale: 1, // stage pixels per source pixel
  x: 0, // stage position of the image's top-left corner
  y: 0,
  drag: null,
};

const cropStageSize = () => $("cropStage").clientWidth;
const cropContainScale = () =>
  cropStageSize() / Math.max(crop.natural.w, crop.natural.h);
const cropCoverScale = () =>
  cropStageSize() / Math.min(crop.natural.w, crop.natural.h);
const cropMaxScale = () => cropCoverScale() * CROP_MAX_ZOOM_OVER_COVER;

// The picture never leaves a gap bigger than it must: on an axis where it is larger than the
// frame it keeps covering it; where it is smaller it stays fully inside.
function clampAxis(offset, imageSize) {
  const room = cropStageSize() - imageSize;
  return room <= 0
    ? Math.min(0, Math.max(room, offset))
    : Math.min(room, Math.max(0, offset));
}

function paintCrop() {
  const { w, h } = crop.natural;
  crop.x = clampAxis(crop.x, w * crop.scale);
  crop.y = clampAxis(crop.y, h * crop.scale);
  crop.img.style.transform = `translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`;
  const min = cropContainScale();
  const t = Math.log(crop.scale / min) / Math.log(cropMaxScale() / min);
  $("cropZoom").value = String(Math.round(t * CROP_SLIDER_MAX));
}

// Zoom keeping the picture point under (px, py) — stage coordinates — where it is.
function zoomCropTo(scale, px, py) {
  const next = Math.min(cropMaxScale(), Math.max(cropContainScale(), scale));
  const ratio = next / crop.scale;
  crop.x = px - (px - crop.x) * ratio;
  crop.y = py - (py - crop.y) * ratio;
  crop.scale = next;
  paintCrop();
}

function zoomCropBy(factor) {
  const center = cropStageSize() / 2;
  zoomCropTo(crop.scale * factor, center, center);
}

function fitCrop(scale) {
  const size = cropStageSize();
  const { w, h } = crop.natural;
  crop.scale = scale;
  crop.x = (size - w * scale) / 2;
  crop.y = (size - h * scale) / 2;
  paintCrop();
}

function closeCrop(result) {
  $("cropOverlay").hidden = true;
  $("cropStage").classList.remove("dragging");
  URL.revokeObjectURL(crop.objectUrl);
  crop.img.removeAttribute("src");
  crop.objectUrl = null;
  crop.drag = null;
  crop.resolve?.(result);
  crop.resolve = null;
  crop.opener?.focus?.();
}

function renderCropBlob() {
  const side = cropStageSize() / crop.scale; // source pixels the frame shows
  const sx = -crop.x / crop.scale;
  const sy = -crop.y / crop.scale;
  const out = Math.min(Math.round(side), CROP_MAX_OUTPUT_PX);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = CROP_PAD_COLOR;
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = "high";
  const { w, h } = crop.natural;
  const left = Math.max(0, sx);
  const top = Math.max(0, sy);
  const right = Math.min(w, sx + side);
  const bottom = Math.min(h, sy + side);
  const toOut = out / side;
  ctx.drawImage(
    crop.img,
    left,
    top,
    right - left,
    bottom - top,
    (left - sx) * toOut,
    (top - sy) * toOut,
    (right - left) * toOut,
    (bottom - top) * toOut,
  );
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CROP_JPEG_QUALITY),
  );
}

async function applyCrop() {
  $("cropApply").disabled = true;
  try {
    const blob = await renderCropBlob();
    if (!blob) throw new Error("Không cắt được ảnh này.");
    const name = crop.file.name.replace(/\.[^.]+$/, "") || "reference";
    closeCrop(new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
  } catch (err) {
    toast(err.message, false);
  } finally {
    $("cropApply").disabled = false;
  }
}

function loadCropImage(url) {
  return new Promise((resolve, reject) => {
    crop.img.onload = resolve;
    crop.img.onerror = () => reject(new Error("Không đọc được ảnh này."));
    crop.img.src = url;
  });
}

function cropImage(file) {
  crop.resolve?.(null); // a second call replaces the first
  crop.file = file;
  crop.opener = document.activeElement;
  crop.objectUrl = URL.createObjectURL(file);
  return new Promise((resolve) => {
    crop.resolve = resolve;
    loadCropImage(crop.objectUrl)
      .then(() => {
        crop.natural = {
          w: crop.img.naturalWidth,
          h: crop.img.naturalHeight,
        };
        $("cropOverlay").hidden = false;
        fitCrop(cropCoverScale());
        $("cropStage").focus();
      })
      .catch((err) => {
        toast(`${err.message} Tải lên ảnh gốc.`, false);
        closeCrop(file);
      });
  });
}

crop.img = $("cropImg");

$("cropStage").addEventListener("pointerdown", (e) => {
  $("cropStage").setPointerCapture(e.pointerId);
  $("cropStage").classList.add("dragging");
  crop.drag = { x: e.clientX - crop.x, y: e.clientY - crop.y };
});
$("cropStage").addEventListener("pointermove", (e) => {
  if (!crop.drag) return;
  crop.x = e.clientX - crop.drag.x;
  crop.y = e.clientY - crop.drag.y;
  paintCrop();
});
for (const type of ["pointerup", "pointercancel"])
  $("cropStage").addEventListener(type, () => {
    crop.drag = null;
    $("cropStage").classList.remove("dragging");
  });
$("cropStage").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = $("cropStage").getBoundingClientRect();
    const factor =
      e.deltaY < 0 ? CROP_WHEEL_ZOOM_STEP : 1 / CROP_WHEEL_ZOOM_STEP;
    zoomCropTo(
      crop.scale * factor,
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
  },
  { passive: false },
);
$("cropZoom").addEventListener("input", (e) => {
  const min = cropContainScale();
  const t = Number(e.target.value) / CROP_SLIDER_MAX;
  const center = cropStageSize() / 2;
  zoomCropTo(min * Math.pow(cropMaxScale() / min, t), center, center);
});
$("cropFit").addEventListener("click", () => fitCrop(cropContainScale()));
$("cropFill").addEventListener("click", () => fitCrop(cropCoverScale()));

const CROP_PAN_KEYS = {
  ArrowLeft: [CROP_KEY_PAN_PX, 0],
  ArrowRight: [-CROP_KEY_PAN_PX, 0],
  ArrowUp: [0, CROP_KEY_PAN_PX],
  ArrowDown: [0, -CROP_KEY_PAN_PX],
};
$("cropOverlay").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.stopPropagation(); // the dialog underneath (add character, redraw) stays open
    closeCrop(null);
  } else if (e.target === $("cropStage") && CROP_PAN_KEYS[e.key]) {
    e.preventDefault();
    [crop.x, crop.y] = [
      crop.x + CROP_PAN_KEYS[e.key][0],
      crop.y + CROP_PAN_KEYS[e.key][1],
    ];
    paintCrop();
  } else if (e.key === "+" || e.key === "=") zoomCropBy(CROP_KEY_ZOOM_STEP);
  else if (e.key === "-") zoomCropBy(1 / CROP_KEY_ZOOM_STEP);
});
$("cropOverlay").addEventListener("click", (e) => {
  if (e.target === $("cropOverlay")) closeCrop(null);
});
$("cropClose").addEventListener("click", () => closeCrop(null));
$("cropCancel").addEventListener("click", () => closeCrop(null));
$("cropOriginal").addEventListener("click", () => closeCrop(crop.file));
$("cropApply").addEventListener("click", applyCrop);
