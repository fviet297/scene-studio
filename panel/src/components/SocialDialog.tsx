import { useState } from "react";
import { api } from "../api.ts";
import type { SocialPost } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

const PLATFORMS: { key: "youtube" | "tiktok" | "facebook"; label: string }[] = [
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
];

export const SocialDialog = ({ onClose }: { onClose: () => void }) => {
  const [posts, setPosts] = useState<Record<string, SocialPost> | null>(null);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"youtube" | "tiktok" | "facebook">("youtube");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = () => {
    setRunning(true);
    void api
      .socialGenerate(note)
      .then((body) => {
        setPosts(body.posts);
        setRunning(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setRunning(false);
      });
  };

  const post = posts?.[tab];

  return (
    <Dialog
      title="Bài đăng"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn primary" disabled={running} onClick={generate}>
            {running ? "Đang viết…" : "Viết bằng AI"}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Ghi chú (tuỳ chọn — thêm chi tiết, góc nhìn, CTA)</span>
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error ? <p className="tag-warn">{error}</p> : null}

      {posts ? (
        <>
          <div className="segmented">
            {PLATFORMS.map((platform) => (
              <button key={platform.key} type="button" aria-pressed={tab === platform.key} onClick={() => setTab(platform.key)}>
                {platform.label}
              </button>
            ))}
          </div>
          {post ? (
            <div className="social-post">
              <label className="field">
                <span className="field-label">Tiêu đề ({post.title.length}/{post.titleLimit})</span>
                <textarea rows={2} value={post.title} onChange={(event) => setPosts({ ...posts, [tab]: { ...post, title: event.target.value } })} />
              </label>
              <label className="field">
                <span className="field-label">Mô tả</span>
                <textarea rows={6} value={post.description} onChange={(event) => setPosts({ ...posts, [tab]: { ...post, description: event.target.value } })} />
              </label>
              <label className="field">
                <span className="field-label">Hashtags</span>
                <textarea rows={2} value={post.hashtags.join(" ")} onChange={(event) => setPosts({ ...posts, [tab]: { ...post, hashtags: event.target.value.split(/\s+/).filter(Boolean) } })} />
              </label>
              {tab === "youtube" && post.titleOptions?.length ? (
                <details>
                  <summary>Tiêu đề khác ({post.titleOptions.length})</summary>
                  <ul className="social-options">
                    {post.titleOptions.map((option) => (
                      <li key={option.title}>
                        <b>{option.score}</b> {option.title}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="social-copy">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => void navigator.clipboard.writeText([post.title, post.description, post.hashtags.join(" ")].filter(Boolean).join("\n\n"))}
                >
                  Copy toàn bộ
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="hint">Bấm "Viết bằng AI" để tạo bài đăng cho ba nền tảng từ lời dẫn của dự án.</p>
      )}
    </Dialog>
  );
};
