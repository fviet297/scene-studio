import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import type { BrandAssets, Branding } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];

export const BrandingDialog = ({ onClose }: { onClose: () => void }) => {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [assets, setAssets] = useState<BrandAssets | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.branding().then((body) => {
      setBranding(body.branding);
      setAssets(body.assets);
    });
  }, []);

  const patch = (value: Record<string, unknown>) => {
    void api
      .saveBranding(value)
      .then((body) => setBranding(body.branding))
      .catch((e: Error) => setError(e.message));
  };

  const upload = (kind: "logo" | "intro", file: File) => {
    void (kind === "logo" ? api.uploadBrandLogo(file) : api.uploadBrandIntro(file))
      .then((body) => {
        setBranding(body.branding);
        setAssets(body.assets);
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <Dialog title="Logo & watermark" wide onClose={onClose}>
      {error ? <p className="tag-warn">{error}</p> : null}
      {!branding ? (
        <p className="hint">Đang tải…</p>
      ) : (
        <>
          <section className="brand-section">
            <h3>Thương hiệu</h3>
            <label className="field">
              <span className="field-label">Tên thương hiệu</span>
              <input
                type="text"
                value={branding.name}
                onChange={(event) => setBranding({ ...branding, name: event.target.value })}
                onBlur={(event) => patch({ name: event.target.value })}
              />
            </label>
          </section>

          <section className="brand-section">
            <h3>Logo góc</h3>
            <label className="brand-check">
              <input type="checkbox" checked={branding.logo.enabled} onChange={(event) => patch({ logo: { ...branding.logo, enabled: event.target.checked } })} />
              Bật logo
            </label>
            {assets?.logo.custom ? (
              <img className="brand-logo-preview" src="/brand-logo.svg" alt="Logo hiện tại" />
            ) : (
              <p className="hint">Đang dùng logo mặc định của repo.</p>
            )}
            <div className="brand-tools">
              <FileButton label="Tải logo lên" onPick={(file) => upload("logo", file)} />
              <button type="button" className="btn sm" onClick={() => void api.resetBrandLogo().then((body) => { setBranding(body.branding); setAssets(body.assets); })}>
                Khôi phục mặc định
              </button>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Vị trí</span>
                <select value={branding.logo.position} onChange={(event) => patch({ logo: { ...branding.logo, position: event.target.value } })}>
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Độ đậm</span>
                <input type="range" min={0} max={1} step={0.05} value={branding.logo.opacity} onChange={(event) => patch({ logo: { ...branding.logo, opacity: Number(event.target.value) } })} />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Cỡ logo</span>
                <input type="range" min={10} max={200} step={1} value={branding.logo.size} onChange={(event) => patch({ logo: { ...branding.logo, size: Number(event.target.value) } })} />
              </label>
              <label className="field">
                <span className="field-label">Lề</span>
                <input type="range" min={0} max={200} step={1} value={branding.logo.margin} onChange={(event) => patch({ logo: { ...branding.logo, margin: Number(event.target.value) } })} />
              </label>
            </div>
          </section>

          <section className="brand-section">
            <h3>Intro video</h3>
            <label className="brand-check">
              <input type="checkbox" checked={branding.intro.enabled} onChange={(event) => patch({ intro: { ...branding.intro, enabled: event.target.checked } })} />
              Bật intro
            </label>
            {assets?.intro ? (
              <>
                <video className="brand-intro-preview" src={assets.intro.url} controls muted preload="metadata" />
                <p className="hint">
                  {assets.intro.seconds.toFixed(1)} giây
                  {assets.intro.orientationMismatch ? " · khác hướng khung, sẽ crop" : ""}
                </p>
              </>
            ) : (
              <p className="hint">Chưa có intro.</p>
            )}
            <div className="brand-tools">
              <FileButton label="Tải intro lên" onPick={(file) => upload("intro", file)} />
              <button type="button" className="btn sm" onClick={() => void api.resetBrandIntro().then((body) => { setBranding(body.branding); setAssets(body.assets); })}>
                Xoá intro
              </button>
            </div>
            <label className="field">
              <span className="field-label">Nghỉ sau intro (giây)</span>
              <input type="number" step={0.1} min={0} value={branding.intro.padSeconds} onChange={(event) => patch({ intro: { ...branding.intro, padSeconds: Number(event.target.value) } })} />
            </label>
          </section>

          <section className="brand-section">
            <h3>Watermark</h3>
            <label className="brand-check">
              <input type="checkbox" checked={branding.watermark.enabled} onChange={(event) => patch({ watermark: { ...branding.watermark, enabled: event.target.checked } })} />
              Bật watermark giữa khung
            </label>
            <label className="field">
              <span className="field-label">Độ đậm watermark</span>
              <input type="range" min={0} max={1} step={0.05} value={branding.watermark.opacity} onChange={(event) => patch({ watermark: { ...branding.watermark, opacity: Number(event.target.value) } })} />
            </label>
          </section>

          <div className="dialog-actions">
            <button type="button" className="btn primary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
};

const FileButton = ({ label, onPick }: { label: string; onPick: (file: File) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = "";
        }}
      />
    </>
  );
};
