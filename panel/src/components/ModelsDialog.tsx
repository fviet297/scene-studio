import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { ModelConfig, ProviderInfo } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

export const ModelsDialog = ({ onClose }: { onClose: () => void }) => {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [providerId, setProviderId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void api.modelConfig().then(setConfig).catch((e: Error) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);

  const run = (action: string, body: Record<string, unknown>) => {
    void api
      .modelAction(action, body)
      .then(setConfig)
      .catch((e: Error) => setError(e.message));
  };

  const provider = config?.providers.find((item) => item.id === providerId) ?? config?.providers[0];

  return (
    <Dialog title="Model & provider" wide onClose={onClose}>
      {error ? <p className="tag-warn">{error}</p> : null}
      <div className="models-layout">
        <aside className="models-rail">
          {config?.providers.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`models-provider${item.id === provider?.id ? " is-active" : ""}`}
              onClick={() => setProviderId(item.id)}
            >
              <b>{item.label}</b>
              <span className="hint">{item.builtin ? "có sẵn" : "tùy chỉnh"}</span>
            </button>
          ))}
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const id = window.prompt("Id provider mới (chữ thường, số, gạch ngang):");
              if (id) run("provider-add", { id, label: id, baseUrl: "", apiKey: "" });
            }}
          >
            Thêm provider
          </button>
        </aside>

        <section className="models-pane">
          {provider ? (
            <>
              <h3>
                {provider.label}
                {!provider.builtin ? (
                  <button type="button" className="btn sm danger" onClick={() => run("provider-delete", { id: provider.id })}>
                    Xoá
                  </button>
                ) : null}
              </h3>
              {provider.fields.map((field) => (
                <ProviderField key={field.name} providerId={provider.id} field={field} onSave={run} />
              ))}

              <h4>Models của provider</h4>
              <div className="models-table">
                {config?.models
                  .filter((model) => model.provider === provider.id)
                  .map((model) => (
                    <ModelRow key={model.id} model={model} onSave={run} />
                  ))}
                {!config?.models.some((model) => model.provider === provider.id) ? (
                  <p className="hint">Không có model nào của provider này.</p>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
};

const ProviderField = ({
  providerId,
  field,
  onSave,
}: {
  providerId: string;
  field: ProviderInfo["fields"][number];
  onSave: (action: string, body: Record<string, unknown>) => void;
}) => {
  const [value, setValue] = useState("");
  return (
    <label className="field">
      <span className="field-label">
        {field.name}
        {field.secret ? <span className="hint"> bí mật</span> : null}
        {field.source ? <span className="hint"> nguồn: {field.source}</span> : null}
      </span>
      <div className="field-row">
        <input
          type={field.secret ? "password" : "text"}
          value={value}
          placeholder={field.secret ? (field.masked ?? "để trống giữ nguyên") : (field.value ?? field.placeholder ?? "")}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          type="button"
          className="btn sm"
          disabled={!value}
          onClick={() => {
            onSave("provider-update", { id: providerId, [field.name]: value });
            setValue("");
          }}
        >
          Lưu
        </button>
      </div>
    </label>
  );
};

const ModelRow = ({
  model,
  onSave,
}: {
  model: ModelConfig["models"][number];
  onSave: (action: string, body: Record<string, unknown>) => void;
}) => (
  <div className="model-row">
    <b>{model.label}</b>
    <span className="hint">
      {model.kind} · {model.price ?? "?"}
    </span>
    {model.builtin ? (
      <button
        type="button"
        className="btn sm quiet"
        onClick={() => onSave("model-hidden", { id: model.id, hidden: !model.hidden })}
      >
        {model.hidden ? "Hiện" : "Ẩn"}
      </button>
    ) : (
      <button type="button" className="btn sm danger" onClick={() => onSave("model-delete", { id: model.id })}>
        Xoá
      </button>
    )}
  </div>
);
