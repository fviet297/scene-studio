import type { StudioState } from "../types.ts";
import type { Studio } from "../useStudio.ts";
import { Menu } from "./Menu.tsx";
import { VoiceControls } from "./VoiceControls.tsx";

const Meter = ({ label, tone, done, total }: { label: string; tone: string; done: number; total: number }) => (
  <div className="meter" data-tone={tone} title={`${label}: ${done}/${total} scene`}>
    <span>{label}</span>
    <span className="meter-track">
      <span className="meter-fill" style={{ transform: `scaleX(${total ? done / total : 0})` }} />
    </span>
    <span className="meter-value">
      {done}/{total}
    </span>
  </div>
);

const progressOf = (state: StudioState) => {
  const narrated = state.scenes.filter((scene) => !scene.shotOf && scene.narration.trim());
  return {
    total: state.scenes.length,
    images: state.scenes.filter((scene) => scene.hasImage).length,
    audio: narrated.filter((scene) => scene.hasAudio).length,
    motion: state.scenes.filter((scene) => scene.hasMotionVideo).length,
    narrated: narrated.length,
  };
};

const ServiceChip = ({ studio, id, label, state }: { studio: Studio; id: string; label: string; state: string }) => {
  const next = state === "running" ? "stop" : state === "stopped" || state === "failed" ? "start" : null;
  return (
    <button
      type="button"
      className="svc"
      data-state={state}
      title={next ? `${next === "start" ? "Bật" : "Tắt"} ${label}` : `${label}: ${state}`}
      disabled={!next}
      onClick={() => next && void studio.actions.service(id, next)}
    >
      <span className="dot" />
      <b>{label}</b>
    </button>
  );
};

export const TopBar = ({
  studio,
  onOpenScript,
  onNewProject,
  onCharacters,
  onTemplates,
  onBranding,
  onTextStyle,
  onEffects,
  onThumbnail,
  onSocial,
  onModels,
  onLibrary,
  onSync,
  onNotifications,
}: {
  studio: Studio;
  onOpenScript: () => void;
  onNewProject: () => void;
  onCharacters: () => void;
  onTemplates: () => void;
  onBranding: () => void;
  onTextStyle: () => void;
  onEffects: () => void;
  onThumbnail: () => void;
  onSocial: () => void;
  onModels: () => void;
  onLibrary: () => void;
  onSync: () => void;
  onNotifications: () => void;
}) => {
  const { state, services, jobs } = studio;
  const progress = state ? progressOf(state) : null;
  const rendering = jobs.some((job) => job.kind === "render" || job.label.startsWith("Render"));
  const aspect = state?.project.aspect ?? "9:16";

  return (
    <header className="topbar">
      <div className="topbar-row">
        <h1 className="wordmark">Scene Studio</h1>
        <select
          className="project-select"
          aria-label="Dự án đang mở"
          value={state?.project.slug ?? ""}
          onChange={(event) => void studio.actions.openProject(event.target.value)}
        >
          {(state?.projects ?? []).map((project) => (
            <option key={project.slug} value={project.slug}>
              {project.title}
            </option>
          ))}
        </select>

        <button type="button" className="btn" onClick={onNewProject}>
          Dự án mới
        </button>
        <button type="button" className="btn" disabled={!state} onClick={onOpenScript}>
          Kịch bản
        </button>
        <button type="button" className="btn" disabled={!state} onClick={onCharacters}>
          Nhân vật
        </button>
        <Menu
          label="Cài đặt dự án"
          items={[
            { key: "templates", label: "Style & template", hint: "Style version, Style DNA, template sinh ảnh, prompt motion", onSelect: onTemplates },
            { key: "branding", label: "Logo & watermark", hint: "Logo góc, watermark, intro video", onSelect: onBranding },
            { key: "textstyle", label: "Kiểu chữ", hint: "Caption và tiêu đề trên hình", onSelect: onTextStyle },
            { key: "effects", label: "Hiệu ứng", hint: "Grade, chuyển cảnh, vignette, grain, lớp", onSelect: onEffects },
          ]}
        />
        <Menu
          label="Đóng gói"
          items={[
            { key: "thumbnail", label: "Thumbnail", hint: "Thumbnail YouTube 1280×720", onSelect: onThumbnail },
            { key: "social", label: "Bài đăng", hint: "Tiêu đề, mô tả, hashtag cho YouTube/TikTok/Facebook", onSelect: onSocial },
          ]}
        />
        <Menu
          label="Ứng dụng"
          items={[
            { key: "models", label: "Model & provider", hint: "Provider, API key, model ảnh / motion / LLM", onSelect: onModels },
            { key: "library", label: "Thư viện video", hint: "Video đã render, thư mục lưu", onSelect: onLibrary },
            { key: "sync", label: "Đồng bộ media", hint: "Lấy media project từ máy khác", onSelect: onSync },
            { key: "notifications", label: "Thông báo", hint: "Lịch sử job xong hoặc lỗi", onSelect: onNotifications },
          ]}
        />

        {state ? (
          <div className="settings">
            <select
              aria-label="Tỉ lệ khung của dự án"
              title="Tỉ lệ khung: ảnh, motion và video render"
              value={aspect}
              onChange={(event) => void studio.actions.setAspect(event.target.value)}
            >
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
            <select
              aria-label="Độ dài motion"
              title="Độ dài mỗi motion clip. Trống = clip khớp audio của shot."
              value={state.project.motionDuration ?? ""}
              onChange={(event) => void studio.actions.setMotionDuration(event.target.value)}
            >
              <option value="">Motion · theo audio</option>
              <option value="5">Motion · 5s</option>
              <option value="8">Motion · 8s</option>
              <option value="10">Motion · 10s</option>
            </select>
            <VoiceControls studio={studio} state={state} />
          </div>
        ) : null}

        <span className="bar-sep" />
        <div className="services" role="group" aria-label="Service cục bộ">
          {services.map((service) => (
            <ServiceChip key={service.id} studio={studio} id={service.id} label={service.label} state={service.state} />
          ))}
        </div>
      </div>

      <div className="topbar-row">
        <span className="grow" />
        {progress ? (
          <div className="meters" aria-label="Tiến độ sản xuất">
            <Meter label="Ảnh" tone="image" done={progress.images} total={progress.total} />
            <Meter label="Audio" tone="audio" done={progress.audio} total={progress.narrated || progress.total} />
            <Meter label="Motion" tone="motion" done={progress.motion} total={progress.total} />
          </div>
        ) : null}
        <a className="btn" href="/video" target="_blank" rel="noopener">
          Mở MP4
        </a>
        {aspect === "16:9" ? (
          <a className="btn" href="/video?f=9x16" target="_blank" rel="noopener">
            Mở 9:16
          </a>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={!state || aspect !== "16:9" || rendering || studio.busy > 0}
          onClick={() => void studio.actions.render("vertical")}
        >
          Render dọc 9:16
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!state || rendering || studio.busy > 0}
          onClick={() => void studio.actions.render("wide")}
        >
          {rendering ? "Đang render…" : "Render MP4"}
        </button>
      </div>
    </header>
  );
};
