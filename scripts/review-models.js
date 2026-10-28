// Scene Studio - model manager.
//
// Opened from the topbar "Model" button. Providers sit on the left, grouped as built-in and added;
// the right pane edits the selected provider's connection (endpoint, API key, …) and its image /
// motion models. The LLM provider (no kinds) has a connection only: its chat model is a field. Everything is stored server-side in data/models.json (/api/model-config/*), and
// the server never sends a key back in full — only a mask — so a key field starts empty and an
// empty submit keeps the stored key. Each change re-reads the panel state so the model pickers
// pick it up at once.
//
// Uses the panel globals ($, api, escapeHtml, toast, refresh, confirmRun) from review-panel.js,
// which loads first.

const mm = {
  data: null,
  selected: "replicate",
  mode: "view", // view | add-model | add-provider
  editing: null, // id of the model row being edited
  busy: false,
};

const MM_KIND_LABEL = { image: "Ảnh", motion: "Motion" };
const MM_FIELD_LABEL = {
  apiKey: "API key",
  baseUrl: "Endpoint",
  resolution: "Độ phân giải video",
  model: "Model",
  userAgent: "User-Agent",
};
const MM_SOURCE_NOTE = {
  panel: "Đang dùng giá trị lưu ở đây.",
  env: "Đang lấy từ .env — nhập giá trị mới để ghi đè.",
  default: "Đang dùng mặc định của provider — nhập giá trị mới để ghi đè.",
};
const MM_ID_PLACEHOLDER = {
  replicate: "owner/model",
  plenx: "tên model, vd kling-4.0",
  meta: "tên model",
  muse: "tên model",
};
const MM_CUSTOM_ID_PLACEHOLDER = "tên model gửi lên API, vd gpt-image-1";

const mmProvider = (id) => mm.data.providers.find((p) => p.id === id);
const mmModelsOf = (id) => mm.data.models.filter((m) => m.provider === id);
const mmKeyField = (provider) =>
  provider.fields.find((f) => f.name === "apiKey");
// A provider with no image / motion kinds is the LLM: what it writes, not what it draws.
const mmIsLlm = (provider) => !provider.kinds.length;
const mmLlmModel = (provider) =>
  provider.fields.find((f) => f.name === "model")?.value || "chưa chọn model";

const mmPrice = (price) =>
  price === null || price === undefined
    ? "—"
    : price === 0
      ? "Miễn phí"
      : `$${price}`;

// ------------------------------------------------------------------ rail

const mmRailItemHtml = (p) => {
  const key = mmKeyField(p);
  const models = mmModelsOf(p.id).filter((m) => !m.hidden).length;
  const meta = mmIsLlm(p) ? mmLlmModel(p) : `${models} model`;
  return `<button type="button" class="models-rail-item" data-provider="${escapeHtml(p.id)}" aria-current="${p.id === mm.selected && mm.mode !== "add-provider"}">
    <span class="models-rail-name">${escapeHtml(p.label)}</span>
    <span class="models-rail-meta">
      <span class="key-state${key?.set ? " on" : ""}">${key?.set ? "Có key" : "Thiếu key"}</span>
      <span class="num" title="${escapeHtml(meta)}">${escapeHtml(meta)}</span>
    </span>
  </button>`;
};

function mmRenderRail() {
  const group = (title, providers) =>
    providers.length
      ? `<div class="models-rail-group">${title}</div>${providers.map(mmRailItemHtml).join("")}`
      : "";
  const { providers } = mm.data;
  $("modelsRail").innerHTML =
    group(
      "Có sẵn",
      providers.filter((p) => p.builtin),
    ) +
    group(
      "Tự thêm",
      providers.filter((p) => !p.builtin),
    );
}

// ------------------------------------------------------------------ connection form

const mmFieldHtml = (provider, field) => {
  const id = `mmField-${field.name}`;
  const secret = field.secret;
  const placeholder = secret
    ? field.set
      ? `${field.masked} — để trống để giữ nguyên`
      : "Chưa có key"
    : (field.placeholder ?? (provider.builtin ? "để trống = mặc định" : ""));
  const missingKey = mmIsLlm(provider)
    ? "Chưa có key — không viết được kịch bản, motion và bài đăng bằng AI."
    : "Chưa có key — model của provider này bị khoá.";
  const hint = MM_SOURCE_NOTE[field.source] ?? (secret ? missingKey : "");
  return `<div class="field">
    <label for="${id}">${MM_FIELD_LABEL[field.name]}</label>
    <input class="text-input" id="${id}" name="${field.name}" type="${secret ? "password" : "text"}"
      autocomplete="off" spellcheck="false" placeholder="${escapeHtml(placeholder)}"
      value="${secret ? "" : escapeHtml(field.value)}" data-initial="${secret ? "" : escapeHtml(field.value)}" />
    <span class="field-hint">${escapeHtml(hint)}</span>
  </div>`;
};

const mmLabelFieldHtml = (provider) =>
  provider.builtin
    ? ""
    : `<div class="field">
        <label for="mmField-label">Tên hiển thị</label>
        <input class="text-input" id="mmField-label" name="label" type="text" autocomplete="off"
          value="${escapeHtml(provider.label)}" data-initial="${escapeHtml(provider.label)}" />
      </div>`;

const mmConnectionHtml = (provider) => {
  const key = mmKeyField(provider);
  const canClearKey = provider.builtin && key?.source === "panel";
  return `<form class="models-conn" data-form="connection" aria-label="Kết nối ${escapeHtml(provider.label)}">
    ${mmLabelFieldHtml(provider)}
    ${provider.fields.map((f) => mmFieldHtml(provider, f)).join("")}
    <div class="actions">
      <button class="btn primary sm" type="submit">Lưu kết nối</button>
      ${canClearKey ? '<button class="btn quiet sm" type="button" data-action="clear-key">Xoá key đã lưu</button>' : ""}
    </div>
  </form>`;
};

// ------------------------------------------------------------------ model rows and add form

const MM_ICON_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const MM_ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/></svg>';

const mmRowActionsHtml = (model) => {
  const id = escapeHtml(model.id);
  if (model.builtin) {
    return `<span class="model-tag">Có sẵn</span>
      <button class="btn quiet sm" type="button" data-action="toggle-hidden" data-model="${id}">${model.hidden ? "Hiện" : "Ẩn"}</button>`;
  }
  return `<button class="icon-btn" type="button" data-action="edit-model" data-model="${id}" aria-label="Sửa ${escapeHtml(model.label)}" title="Sửa">${MM_ICON_EDIT}</button>
    <button class="icon-btn" type="button" data-action="delete-model" data-model="${id}" aria-label="Xoá ${escapeHtml(model.label)}" title="Xoá">${MM_ICON_TRASH}</button>`;
};

const mmModelRowHtml = (
  model,
) => `<li class="model-row${model.hidden ? " is-hidden" : ""}">
  <span class="model-kind ${model.kind}">${MM_KIND_LABEL[model.kind]}</span>
  <span class="model-name">
    <span class="model-label" title="${escapeHtml(model.label)}">${escapeHtml(model.label)}</span>
    <span class="model-id num" title="${escapeHtml(model.id)}">${escapeHtml(model.id)}</span>
  </span>
  <span class="model-price num">${model.hidden ? "Đã ẩn" : mmPrice(model.price)}</span>
  <span class="model-actions">${mmRowActionsHtml(model)}</span>
</li>`;

const mmEditRowHtml = (model) => `<li class="model-row is-editing">
  <span class="model-kind ${model.kind}">${MM_KIND_LABEL[model.kind]}</span>
  <form class="model-name" data-form="model-edit" data-model="${escapeHtml(model.id)}" id="mmEditForm">
    <input class="text-input" name="label" type="text" value="${escapeHtml(model.label)}" aria-label="Nhãn" autocomplete="off" data-autofocus />
    <span class="model-id num">${escapeHtml(model.id)}</span>
  </form>
  <input class="text-input num" form="mmEditForm" name="price" type="number" min="0" step="0.001"
    value="${model.price ?? ""}" aria-label="Giá USD mỗi lượt" placeholder="USD" />
  <span class="model-actions">
    <button class="btn primary sm" form="mmEditForm" type="submit">Lưu</button>
    <button class="btn quiet sm" type="button" data-action="cancel">Huỷ</button>
  </span>
</li>`;

const mmKindChoiceHtml = (provider) => {
  if (provider.kinds.length === 1) {
    return `<input type="hidden" name="kind" value="${provider.kinds[0]}" />
      <span class="field-hint">Chỉ hỗ trợ model ${MM_KIND_LABEL[provider.kinds[0]].toLowerCase()}.</span>`;
  }
  const buttons = provider.kinds
    .map(
      (k, i) =>
        `<button type="button" data-action="pick-kind" data-kind="${k}" aria-pressed="${i === 0}">${MM_KIND_LABEL[k]}</button>`,
    )
    .join("");
  return `<input type="hidden" name="kind" value="${provider.kinds[0]}" />
    <div class="segmented" role="group" aria-label="Loại model">${buttons}</div>`;
};

const mmAddModelHtml = (
  provider,
) => `<form class="models-add" data-form="model-add" aria-label="Thêm model cho ${escapeHtml(provider.label)}">
  ${mmKindChoiceHtml(provider)}
  <div class="field">
    <label for="mmNewId">ID model</label>
    <input class="text-input num" id="mmNewId" name="id" type="text" autocomplete="off" spellcheck="false" required data-autofocus
      placeholder="${escapeHtml(provider.builtin ? MM_ID_PLACEHOLDER[provider.id] : MM_CUSTOM_ID_PLACEHOLDER)}" />
  </div>
  <div class="field-row">
    <div class="field">
      <label for="mmNewLabel">Nhãn <span class="note">để trống = dùng ID</span></label>
      <input class="text-input" id="mmNewLabel" name="label" type="text" autocomplete="off" />
    </div>
    <div class="field">
      <label for="mmNewPrice">Giá <span class="note">USD mỗi lượt, 0 = miễn phí</span></label>
      <input class="text-input num" id="mmNewPrice" name="price" type="number" min="0" step="0.001" />
    </div>
  </div>
  <div class="actions">
    <button class="btn primary sm" type="submit">Thêm model</button>
    <button class="btn quiet sm" type="button" data-action="cancel">Huỷ</button>
  </div>
</form>`;

const mmModelsSectionHtml = (provider) => {
  const models = mmModelsOf(provider.id);
  const rows = models
    .map((m) => (m.id === mm.editing ? mmEditRowHtml(m) : mmModelRowHtml(m)))
    .join("");
  const adding = mm.mode === "add-model";
  return `<div>
    <div class="models-section-head">
      <h4>Model</h4><span class="count num">${models.length}</span><span class="grow"></span>
      ${adding ? "" : '<button class="btn sm" type="button" data-action="show-add-model">Thêm model</button>'}
    </div>
    ${adding ? mmAddModelHtml(provider) : ""}
    ${models.length ? `<ul class="models-list">${rows}</ul>` : '<p class="models-empty">Provider này chưa có model. Thêm model để chọn nó khi sinh ảnh hoặc motion.</p>'}
  </div>`;
};

// ------------------------------------------------------------------ pane

const mmPaneHeadHtml = (provider) => `<div class="models-pane-head">
  <h3>${escapeHtml(provider.label)}</h3>
  <span class="tag">${mmIsLlm(provider) ? "Viết kịch bản, prompt ảnh, motion, bài đăng" : provider.builtin ? "Có sẵn" : "Tự thêm · chuẩn OpenAI Images"}</span>
  <span class="grow"></span>
  ${provider.builtin ? "" : '<button class="btn quiet danger sm" type="button" data-action="delete-provider">Xoá provider</button>'}
</div>`;

const mmAddProviderHtml =
  () => `<div class="models-pane-head"><h3>Thêm provider</h3></div>
<form class="models-conn" data-form="provider-add" aria-label="Thêm provider">
  <p class="field-hint">Dùng cho API tương thích OpenAI Images (<span class="num">POST /images/generations</span> và <span class="num">/images/edits</span>). Chỉ model ảnh; motion chưa hỗ trợ vì mỗi nhà cung cấp một kiểu API.</p>
  <div class="field-row">
    <div class="field">
      <label for="mmProvId">ID <span class="note">a-z, 0-9, gạch ngang</span></label>
      <input class="text-input num" id="mmProvId" name="id" type="text" autocomplete="off" spellcheck="false" required data-autofocus placeholder="vd. myhost" />
    </div>
    <div class="field">
      <label for="mmProvLabel">Tên hiển thị</label>
      <input class="text-input" id="mmProvLabel" name="label" type="text" autocomplete="off" required placeholder="vd. My host" />
    </div>
  </div>
  <div class="field">
    <label for="mmProvUrl">Endpoint <span class="note">gốc API, trước /images/…</span></label>
    <input class="text-input num" id="mmProvUrl" name="baseUrl" type="text" autocomplete="off" spellcheck="false" required placeholder="https://api.example.com/v1" />
  </div>
  <div class="field">
    <label for="mmProvKey">API key</label>
    <input class="text-input" id="mmProvKey" name="apiKey" type="password" autocomplete="off" required />
  </div>
  <div class="actions">
    <button class="btn primary sm" type="submit">Thêm provider</button>
    <button class="btn quiet sm" type="button" data-action="cancel">Huỷ</button>
  </div>
</form>`;

function mmRenderPane() {
  const pane = $("modelsPane");
  if (mm.mode === "add-provider") {
    pane.innerHTML = mmAddProviderHtml();
  } else {
    const provider = mmProvider(mm.selected);
    pane.innerHTML =
      mmPaneHeadHtml(provider) +
      mmConnectionHtml(provider) +
      (mmIsLlm(provider) ? "" : mmModelsSectionHtml(provider));
  }
  pane.querySelector("[data-autofocus]")?.focus();
}

function mmRender() {
  if (!mmProvider(mm.selected)) mm.selected = mm.data.providers[0].id; // the selected one was deleted
  mmRenderRail();
  mmRenderPane();
}

// ------------------------------------------------------------------ requests

// Posts one change; on success swaps in the refreshed description and re-reads the panel state so
// the pickers match. A failure leaves the form as typed, so the user can correct it. Returns
// whether it worked, so the caller decides what to show next.
async function mmMutate(action, body, doneMessage) {
  if (mm.busy) return false;
  mm.busy = true;
  const buttons = [
    ...$("modelsPane").querySelectorAll("button:not(:disabled)"),
  ];
  buttons.forEach((b) => (b.disabled = true));
  try {
    mm.data = await api(`/api/model-config/${action}`, body);
    mmRender();
    toast(doneMessage);
    refresh().catch(() => {});
    return true;
  } catch (error) {
    buttons.forEach((b) => (b.disabled = false));
    toast(error.message, false);
    return false;
  } finally {
    mm.busy = false;
  }
}

const mmFormValues = (form) => Object.fromEntries(new FormData(form).entries());

// Only the fields the user actually changed: sending an unchanged endpoint that came from .env
// would turn it into an override.
function mmChangedFields(form) {
  const changed = {};
  for (const input of form.elements) {
    if (!input.name || input.type === "hidden") continue;
    if (input.value !== (input.dataset.initial ?? ""))
      changed[input.name] = input.value;
  }
  return changed;
}

// ------------------------------------------------------------------ form handlers

async function mmSubmitConnection(form) {
  const changes = mmChangedFields(form);
  if (!Object.keys(changes).length) return toast("Chưa có thay đổi nào.");
  await mmMutate(
    "provider-update",
    { id: mm.selected, ...changes },
    "Đã lưu kết nối.",
  );
}

async function mmSubmitAddProvider(form) {
  const values = mmFormValues(form);
  const id = values.id.trim().toLowerCase();
  if (!(await mmMutate("provider-add", values, "Đã thêm provider."))) return;
  mm.selected = id;
  mm.mode = "add-model";
  mmRender();
}

async function mmSubmitAddModel(form) {
  const values = mmFormValues(form);
  const body = {
    provider: mm.selected,
    ...values,
    price: values.price === "" ? null : values.price,
  };
  if (!(await mmMutate("model-add", body, "Đã thêm model."))) return;
  mm.mode = "view";
  mmRender();
}

async function mmSubmitEditModel(form) {
  const { label, price } = mmFormValues(form);
  if (
    !(await mmMutate(
      "model-update",
      { id: form.dataset.model, label, price },
      "Đã lưu model.",
    ))
  )
    return;
  mm.editing = null;
  mmRender();
}

const MM_SUBMIT = {
  connection: mmSubmitConnection,
  "provider-add": mmSubmitAddProvider,
  "model-add": mmSubmitAddModel,
  "model-edit": mmSubmitEditModel,
};

$("modelsPane").addEventListener("submit", (event) => {
  event.preventDefault();
  MM_SUBMIT[event.target.dataset.form]?.(event.target);
});

// ------------------------------------------------------------------ click actions

async function mmDeleteProvider() {
  const provider = mmProvider(mm.selected);
  const count = mmModelsOf(provider.id).length;
  const ok = await confirmRun(
    `Xoá provider "${provider.label}" và ${count} model của nó?\nKey lưu ở đây cũng bị xoá.`,
    "Xoá",
    true,
  );
  if (!ok) return;
  await mmMutate("provider-delete", { id: provider.id }, "Đã xoá provider.");
}

async function mmDeleteModel(id) {
  const model = mm.data.models.find((m) => m.id === id);
  if (!(await confirmRun(`Xoá model "${model.label}"?`, "Xoá", true))) return;
  await mmMutate("model-delete", { id }, "Đã xoá model.");
}

function mmPickKind(button) {
  const form = button.closest("form");
  form.elements.kind.value = button.dataset.kind;
  form
    .querySelectorAll("[data-action='pick-kind']")
    .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
}

const MM_ACTIONS = {
  "show-add-model": () => {
    mm.mode = "add-model";
    mm.editing = null;
    mmRender();
  },
  cancel: () => {
    mm.mode = "view";
    mm.editing = null;
    mmRender();
  },
  "edit-model": (button) => {
    mm.editing = button.dataset.model;
    mm.mode = "view";
    mmRender();
  },
  "delete-model": (button) => mmDeleteModel(button.dataset.model),
  "toggle-hidden": (button) => {
    const model = mm.data.models.find((m) => m.id === button.dataset.model);
    return mmMutate(
      "model-hidden",
      { id: model.id, hidden: !model.hidden },
      model.hidden ? "Đã hiện model." : "Đã ẩn model.",
    );
  },
  "clear-key": () =>
    mmMutate(
      "provider-update",
      { id: mm.selected, apiKey: "" },
      "Đã xoá key đã lưu.",
    ),
  "delete-provider": mmDeleteProvider,
  "pick-kind": mmPickKind,
};

$("modelsPane").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) MM_ACTIONS[button.dataset.action]?.(button);
});

$("modelsRail").addEventListener("click", (event) => {
  const item = event.target.closest("[data-provider]");
  if (!item) return;
  mm.selected = item.dataset.provider;
  mm.mode = "view";
  mm.editing = null;
  mmRender();
});

$("modelsAddProvider").addEventListener("click", () => {
  mm.mode = "add-provider";
  mm.editing = null;
  mmRender();
});

// ------------------------------------------------------------------ open / close

function closeModels() {
  $("modelsOverlay").hidden = true;
}

$("btnModels").addEventListener("click", async () => {
  try {
    mm.data = await api("/api/model-config");
    mm.mode = "view";
    mm.editing = null;
    mmRender();
    $("modelsOverlay").hidden = false;
    $("modelsRail").querySelector("[aria-current='true']")?.focus();
  } catch (error) {
    toast(error.message, false);
  }
});
$("modelsClose").addEventListener("click", closeModels);
$("modelsOverlay").addEventListener("click", (event) => {
  if (event.target === $("modelsOverlay")) closeModels();
});
