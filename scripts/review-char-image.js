// Scene Studio - character reference images drawn by AI.
//
// Opened from a character card's "Tạo ảnh" (and right after adding a character without an
// image). "Từ mô tả" draws the character from a description, pre-filled from its profile's
// `interpretation` (where the AI script writer puts an appearance description). "Từ ảnh" redraws an
// uploaded image, or the current reference, in the project's style, with an optional change
// request. Either way the server only draws a draft (/api/character-generate, SSE); the reference
// changes on "Dùng làm ảnh tham chiếu" (/api/character-apply), with the current one shown beside
// the draft for comparison. An uploaded source can also become the reference as it is, undrawn
// ("Dùng thẳng ảnh này làm tham chiếu", /api/character-apply with from: 'source').
//
// Uses the panel globals ($, api, toast, readSse, state, render, charById, fillImageModelSelect,
// openLightbox, CANCEL_PROVIDER_NOTE) from review-panel.js, which loads first.

const CI_MODE_COPY = {
  text: {
    label: "Mô tả ngoại hình",
    placeholder:
      "Tuổi, dáng người, khuôn mặt, tóc và râu, trang phục hoặc giáp đúng thời kỳ (màu, chất liệu), một vật dụng đặc trưng.",
    hint: "Viết bằng tiếng Anh cho kết quả ổn định nhất. Phong cách vẽ lấy theo style version của dự án.",
  },
  image: {
    label: "Yêu cầu chỉnh (tuỳ chọn)",
    placeholder:
      "vd. Giữ khuôn mặt, đổi sang giáp da sơn mài thời Lý, tóc búi gọn.",
    hint: "Giữ khuôn mặt người trong ảnh nguồn và vẽ lại theo style version của dự án.",
  },
};

const ci = {
  id: null, // character the dialog is open for; null once closed
  mode: "text",
  source: null, // what "Từ ảnh" redraws: 'upload' | 'current' | null
  sourceUrl: null, // preview of the uploaded source image
  descriptions: { text: "", image: "" }, // each mode keeps its own text
  controller: null, // the generate call in flight
  hasDraft: false,
};

function setCiNote(text, isError = false) {
  $("ciNote").textContent = text;
  $("ciNote").classList.toggle("is-error", isError);
}

const showImage = (img, empty, url) => {
  img.hidden = !url;
  if (url) img.src = url;
  else img.removeAttribute("src");
  empty.hidden = Boolean(url);
};

function showDraft(url) {
  ci.hasDraft = Boolean(url);
  showImage($("ciDraftImg"), $("ciDraftEmpty"), url);
}

function renderSource() {
  const refUrl = charById(ci.id)?.refUrl ?? null;
  const url =
    ci.source === "upload"
      ? ci.sourceUrl
      : ci.source === "current"
        ? refUrl
        : null;
  showImage($("ciSourceImg"), $("ciSourceEmpty"), url);
  $("ciUseCurrent").hidden = !refUrl || ci.source === "current";
  $("ciApplySource").hidden = ci.source !== "upload";
}

function setCiMode(mode) {
  ci.descriptions[ci.mode] = $("ciDesc").value;
  ci.mode = mode;
  for (const b of $("ciModes").querySelectorAll("button"))
    b.setAttribute("aria-pressed", String(b.dataset.ciMode === mode));
  const copy = CI_MODE_COPY[mode];
  $("ciDescLabel").textContent = copy.label;
  $("ciDesc").placeholder = copy.placeholder;
  $("ciDescHint").textContent = copy.hint;
  $("ciDesc").value = ci.descriptions[mode];
  $("ciSourceField").hidden = mode !== "image";
  renderSource();
}

// "Huỷ" while a draft is being drawn. Before a draft exists generating is the main action; once
// one exists, applying it is, and generating again becomes "Tạo lại".
function syncCiButtons() {
  const running = Boolean(ci.controller);
  const generate = $("ciGenerate");
  generate.textContent = running ? "Huỷ" : ci.hasDraft ? "Tạo lại" : "Tạo ảnh";
  generate.classList.toggle("is-cancel", running);
  generate.classList.toggle("primary", !ci.hasDraft);
  $("ciApply").classList.toggle("primary", ci.hasDraft);
  $("ciApply").disabled = running || !ci.hasDraft;
  for (const control of [
    ...$("ciModes").querySelectorAll("button"),
    $("ciDesc"),
    $("ciModel"),
    $("ciSource"),
    $("ciUseCurrent"),
    $("ciApplySource"),
  ])
    control.disabled = running;
}

function setCiWorking(text) {
  $("ciWorking").hidden = text === null;
  if (text !== null) $("ciWorkingText").textContent = text;
}

async function openCharImageDialog(id) {
  const c = charById(id);
  if (!c) return;
  Object.assign(ci, {
    id,
    mode: "text",
    source: c.refUrl ? "current" : null,
    sourceUrl: null,
    descriptions: { text: "", image: "" },
    controller: null,
  });
  $("ciDesc").value = "";
  $("ciWho").textContent = `${c.name} · ${c.id}`;
  showImage($("ciCurrentImg"), $("ciCurrentEmpty"), c.refUrl);
  showDraft(null);
  setCiWorking(null);
  fillImageModelSelect("ciModel");
  setCiMode("text");
  setCiNote(
    "Ảnh tham chiếu chỉ đổi khi bấm Dùng làm ảnh tham chiếu; ảnh cũ được giữ lại thành file .bak.",
  );
  syncCiButtons();
  $("ciOverlay").hidden = false;
  $("ciDesc").focus();
  try {
    const { profile } = await api(
      `/api/character-profile?id=${encodeURIComponent(id)}`,
    );
    // Only into an untouched box: never overwrite what the user started typing meanwhile.
    if (ci.id === id && ci.mode === "text" && !$("ciDesc").value) {
      $("ciDesc").value = profile.interpretation ?? "";
    }
  } catch {
    // no profile yet — start from a blank description
  }
}

// Called from the panel's Escape handler too. Closing stops a draft in progress.
function closeCharImageDialog() {
  if (ci.controller) {
    ci.controller.abort();
    ci.controller = null;
    toast(`Đã huỷ tạo ảnh. ${CANCEL_PROVIDER_NOTE}`, false);
  }
  ci.id = null;
  $("ciOverlay").hidden = true;
}

async function uploadCiSource(file) {
  if (!file) return;
  const id = ci.id;
  setCiNote("Đang tải ảnh nguồn…");
  try {
    const res = await fetch(
      `/api/character-source?id=${encodeURIComponent(id)}`,
      {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: await file.arrayBuffer(),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (ci.id !== id) return;
    ci.source = "upload";
    ci.sourceUrl = data.sourceUrl;
    // A draft from before this image was not drawn from it; leaving it up would let "Dùng làm
    // ảnh tham chiếu" apply that old draft while the new image looks chosen.
    showDraft(null);
    syncCiButtons();
    renderSource();
    setCiNote(
      "Đã chọn ảnh nguồn. Bấm Tạo ảnh để AI vẽ lại, hoặc dùng thẳng ảnh này làm tham chiếu.",
    );
  } catch (e) {
    setCiNote(e.message, true);
  }
}

async function generateCharacterDraft() {
  const description = $("ciDesc").value.trim();
  if (ci.mode === "text" && !description) {
    setCiNote("Nhập mô tả nhân vật.", true);
    $("ciDesc").focus();
    return;
  }
  if (ci.mode === "image" && !ci.source) {
    setCiNote("Chọn ảnh nguồn trước.", true);
    return;
  }
  const id = ci.id;
  const controller = new AbortController();
  ci.controller = controller;
  syncCiButtons();
  setCiWorking("Đang gửi yêu cầu…");
  setCiNote("");
  let draftUrl = null;
  let failure = null;
  try {
    await readSse(
      "/api/character-generate",
      {
        id,
        model: $("ciModel").value,
        description,
        source: ci.mode === "image" ? ci.source : undefined,
      },
      controller.signal,
      (type, data) => {
        if (type === "log") setCiWorking(data);
        else if (type === "done") draftUrl = data.draftUrl;
        else if (type === "error") failure = data;
      },
      { label: `Tạo ảnh nhân vật ${id}` },
    );
  } catch (e) {
    if (e.name !== "AbortError") failure = e.message;
  }
  // Closing the dialog cancelled this run and let go of it; a reopened dialog is not its business.
  if (ci.controller !== controller) return;
  ci.controller = null;
  setCiWorking(null);
  if (draftUrl) {
    showDraft(draftUrl);
    setCiNote("So với ảnh hiện tại rồi chọn: dùng bản nháp, hoặc tạo lại.");
  } else if (controller.signal.aborted) {
    setCiNote(`Đã huỷ. ${CANCEL_PROVIDER_NOTE}`);
  } else {
    setCiNote(failure ?? "Kết nối tới server bị ngắt giữa chừng.", true);
  }
  syncCiButtons();
}

// from: 'draft' (the drawn draft) or 'source' (the uploaded source image, as it is).
async function applyCharacterImage(from = "draft") {
  const id = ci.id;
  $("ciApply").disabled = true;
  $("ciApplySource").disabled = true;
  try {
    state = await api("/api/character-apply", { id, from });
    render();
    ci.id = null;
    $("ciOverlay").hidden = true;
    toast(`Đã cập nhật ảnh tham chiếu của "${charById(id)?.name ?? id}".`);
  } catch (e) {
    setCiNote(e.message, true);
    syncCiButtons();
  }
}

$("ciClose").addEventListener("click", closeCharImageDialog);
$("ciOverlay").addEventListener("click", (e) => {
  if (e.target === $("ciOverlay")) closeCharImageDialog();
});
$("ciModes").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-ci-mode]");
  if (button && !ci.controller) setCiMode(button.dataset.ciMode);
});
$("ciGenerate").addEventListener("click", () =>
  ci.controller ? ci.controller.abort() : generateCharacterDraft(),
);
$("ciApply").addEventListener("click", () => applyCharacterImage("draft"));
$("ciApplySource").addEventListener("click", () =>
  applyCharacterImage("source"),
);
$("ciUseCurrent").addEventListener("click", () => {
  ci.source = "current";
  renderSource();
});
$("ciSource").addEventListener("click", () => $("ciSourceFile").click());
$("ciSourceFile").addEventListener("change", (e) => {
  uploadCiSource(e.target.files[0]);
  e.target.value = "";
});
for (const type of ["dragenter", "dragover"])
  $("ciSource").addEventListener(type, (e) => {
    e.preventDefault();
    $("ciSource").classList.add("dragging");
  });
for (const type of ["dragleave", "drop"])
  $("ciSource").addEventListener(type, (e) => {
    e.preventDefault();
    if (type === "dragleave" && $("ciSource").contains(e.relatedTarget)) return;
    $("ciSource").classList.remove("dragging");
    if (type === "drop" && !ci.controller)
      uploadCiSource(e.dataTransfer.files[0]);
  });
// Either image opens full size, to judge the face before replacing the reference.
for (const img of [$("ciCurrentImg"), $("ciDraftImg")])
  img.addEventListener("click", () => openLightbox(img.src, img.alt));
