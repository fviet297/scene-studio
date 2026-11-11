import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { MediaSyncState } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

export const SyncDialog = ({ onClose }: { onClose: () => void }) => {
  const [sync, setSync] = useState<MediaSyncState | null>(null);
  const [source, setSource] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void api.mediaSync().then(setSync).catch((e: Error) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);

  const setSourceDir = () => {
    void api
      .setMediaSource(source.trim())
      .then((next) => {
        setSync(next);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  const toggle = (slug: string) =>
    setChecked((list) => (list.includes(slug) ? list.filter((item) => item !== slug) : [...list, slug]));

  const run = () => {
    setRunning(true);
    void api
      .runMediaSync(checked)
      .then(() => {
        setRunning(false);
        load();
      })
      .catch((e: Error) => {
        setRunning(false);
        setError(e.message);
      });
  };

  return (
    <Dialog title="Đồng bộ media" wide onClose={onClose}>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Nguồn media</span>
          <input type="text" value={source} placeholder={sync?.source ?? ""} onChange={(event) => setSource(event.target.value)} />
        </label>
        <button type="button" className="btn" onClick={setSourceDir}>
          Đổi nguồn
        </button>
      </div>
      <p className="hint">Hiện tại: {sync?.source}</p>
      {error ? <p className="tag-warn">{error}</p> : null}

      <div className="sync-list">
        {sync?.projects.map((project) => (
          <label key={project.slug} className="sync-row">
            <input type="checkbox" checked={checked.includes(project.slug)} onChange={() => toggle(project.slug)} />
            <b>{project.slug}</b>
            {project.local ? <span className="tag">đã có bản local</span> : null}
            {project.active ? <span className="tag">đang mở</span> : null}
          </label>
        ))}
        {sync && !sync.projects.length ? <p className="hint">Không tìm thấy project nào ở nguồn.</p> : null}
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Đóng
        </button>
        <button type="button" className="btn primary" disabled={!checked.length || running} onClick={run}>
          {running ? "Đang đồng bộ…" : `Đồng bộ ${checked.length || ""} project`}
        </button>
      </div>
    </Dialog>
  );
};
