import { useEffect, useState } from "react";
import { useStudio } from "./useStudio.ts";
import { BatchBar } from "./components/BatchBar.tsx";
import { BrandingDialog } from "./components/BrandingDialog.tsx";
import { CharactersDialog } from "./components/CharactersDialog.tsx";
import { Console } from "./components/Console.tsx";
import { EffectsDialog } from "./components/EffectsDialog.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { JobBar } from "./components/JobBar.tsx";
import { LibraryDialog } from "./components/LibraryDialog.tsx";
import { ModelsDialog } from "./components/ModelsDialog.tsx";
import { NewProjectDialog } from "./components/NewProjectDialog.tsx";
import { NotificationsDialog } from "./components/NotificationsDialog.tsx";
import { SceneRail } from "./components/SceneRail.tsx";
import { ScriptEditor } from "./components/ScriptEditor.tsx";
import { SocialDialog } from "./components/SocialDialog.tsx";
import { Stage } from "./components/Stage.tsx";
import { SyncDialog } from "./components/SyncDialog.tsx";
import { TemplatesDialog } from "./components/TemplatesDialog.tsx";
import { TextStyleDialog } from "./components/TextStyleDialog.tsx";
import { ThumbnailDialog } from "./components/ThumbnailDialog.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { TopBar } from "./components/TopBar.tsx";

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
};

type DialogId =
  | "script"
  | "newProject"
  | "characters"
  | "templates"
  | "branding"
  | "textstyle"
  | "effects"
  | "thumbnail"
  | "social"
  | "models"
  | "library"
  | "sync"
  | "notifications";

export const App = () => {
  const studio = useStudio();
  const { state } = studio;
  const [selected, setSelected] = useState(1);
  const [checked, setChecked] = useState<number[]>([]);
  const [dialog, setDialog] = useState<DialogId | null>(null);

  const scenes = state?.scenes ?? [];
  const scene = scenes.find((item) => item.scene === selected) ?? scenes[0];

  const toggle = (number: number) =>
    setChecked((list) => (list.includes(number) ? list.filter((item) => item !== number) : [...list, number]));

  useEffect(() => {
    if (scenes.length && !scenes.some((item) => item.scene === selected)) setSelected(scenes[0].scene);
  }, [scenes, selected]);

  // j / k (and the arrows) walk the scene list, matching the legacy panel.
  useEffect(() => {
    if (!scenes.length) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const index = scenes.findIndex((item) => item.scene === selected);
      if (event.key === "j" || event.key === "ArrowDown") setSelected(scenes[Math.min(scenes.length - 1, index + 1)].scene);
      else if (event.key === "k" || event.key === "ArrowUp") setSelected(scenes[Math.max(0, index - 1)].scene);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes, selected]);

  return (
    <div className="studio">
      <TopBar
        studio={studio}
        onOpenScript={() => setDialog("script")}
        onNewProject={() => setDialog("newProject")}
        onCharacters={() => setDialog("characters")}
        onTemplates={() => setDialog("templates")}
        onBranding={() => setDialog("branding")}
        onTextStyle={() => setDialog("textstyle")}
        onEffects={() => setDialog("effects")}
        onThumbnail={() => setDialog("thumbnail")}
        onSocial={() => setDialog("social")}
        onModels={() => setDialog("models")}
        onLibrary={() => setDialog("library")}
        onSync={() => setDialog("sync")}
        onNotifications={() => setDialog("notifications")}
      />
      {state && scene ? (
        <>
          <main className="workspace">
            <SceneRail
              studio={studio}
              state={state}
              selected={scene.scene}
              onSelect={setSelected}
              checked={checked}
              onToggle={toggle}
            />
            <Stage scene={scene} aspect={state.project.aspect} bundle={studio.bundle} />
            <Inspector key={`${state.project.slug}:${scene.scene}`} studio={studio} state={state} scene={scene} />
          </main>
          <BatchBar
            studio={studio}
            state={state}
            checked={checked}
            onClear={() => setChecked([])}
            onSelect={setChecked}
          />
          {studio.bundle ? (
            <Timeline bundle={studio.bundle} state={state} selected={scene.scene} onSelect={setSelected} />
          ) : null}
        </>
      ) : (
        <main className="empty-studio">
          <p>{state ? "Dự án chưa có scene nào." : "Đang mở dự án…"}</p>
        </main>
      )}
      <Console lines={studio.logs} onClear={studio.actions.clearLogs} />
      <JobBar studio={studio} />
      {dialog === "script" && state ? (
        <ScriptEditor studio={studio} state={state} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "newProject" ? <NewProjectDialog studio={studio} onClose={() => setDialog(null)} /> : null}
      {dialog === "characters" && state ? (
        <CharactersDialog studio={studio} state={state} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "templates" ? <TemplatesDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "branding" ? <BrandingDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "textstyle" ? <TextStyleDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "effects" ? <EffectsDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "thumbnail" && state ? (
        <ThumbnailDialog onClose={() => setDialog(null)} imageModels={state.imageModels} characterList={state.characterList} />
      ) : null}
      {dialog === "social" ? <SocialDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "models" ? <ModelsDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "library" ? <LibraryDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "sync" ? <SyncDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "notifications" ? <NotificationsDialog onClose={() => setDialog(null)} /> : null}
      {studio.notice ? (
        <button
          type="button"
          className={`notice${studio.notice.isError ? " is-error" : ""}`}
          role="alert"
          onClick={studio.actions.dismissNotice}
        >
          {studio.notice.text}
        </button>
      ) : null}
    </div>
  );
};
