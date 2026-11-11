import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { OutputLibrary } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

const mb = (size: number): string => `${(size / 1048576).toFixed(1)} MB`;
const when = (mtimeMs: number): string => new Date(mtimeMs).toLocaleString("vi-VN");

export const LibraryDialog = ({ onClose }: { onClose: () => void }) => {
  const [library, setLibrary] = useState<OutputLibrary | null>(null);
  const [dir, setDir] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void api.outputs().then(setLibrary).catch((e: Error) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);

  const saveDir = () => {
    void api
      .setOutputDir(dir.trim())
      .then((next) => {
        setLibrary(next);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <Dialog title="Thư viện video" wide onClose={onClose}>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Thư mục render</span>
          <input type="text" value={dir} placeholder={library?.defaultDir ?? ""} onChange={(event) => setDir(event.target.value)} />
        </label>
        <button type="button" className="btn" onClick={saveDir}>
          Đổi thư mục
        </button>
      </div>
      <p className="hint">Hiện tại: {library?.dir}</p>
      {error ? <p className="tag-warn">{error}</p> : null}

      {library ? (
        <div className="lib-grid">
          {library.videos.map((video) => (
            <a key={video.name} className="lib-card" href={video.url} target="_blank" rel="noopener" title={`${video.title} · ${mb(video.size)}`}>
              <span className="lib-thumb">
                <video src={video.url} muted preload="metadata" />
              </span>
              <span className="lib-meta">
                <b>{video.title}</b>
                <span className="hint">
                  {video.aspect} · {mb(video.size)} · {when(video.mtimeMs)}
                  {video.active ? " · dự án đang mở" : ""}
                </span>
              </span>
            </a>
          ))}
          {!library.videos.length ? <p className="hint">Chưa có video nào đã render.</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
};
