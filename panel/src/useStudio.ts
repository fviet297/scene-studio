import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ScenePatch, type StreamHandlers } from "./api.ts";
import { loadBundle, type Bundle } from "./bundle.ts";
import type { Job, ServiceInfo, StudioState } from "./types.ts";

const POLL_MS = 2500;
const MAX_LOG_LINES = 300;

export interface Notice {
  text: string;
  isError: boolean;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useStudio = () => {
  const [state, setState] = useState<StudioState | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [logs, setLogs] = useState<{ text: string; isError: boolean }[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(0);
  const jobsRef = useRef<Job[]>([]);

  const log = useCallback((text: string, isError = false) => {
    setLogs((lines) => [...lines, { text, isError }].slice(-MAX_LOG_LINES));
  }, []);

  /** The bundle is the render's own data; the timeline and the player both read it. */
  const bundleKey = useRef("");
  const refreshBundle = useCallback(async () => {
    const next = await loadBundle();
    if (!next) return null;
    // A fresh object every poll would remount the Remotion player and re-render 59 clips; only a
    // bundle that actually changed is worth pushing into React.
    const key = `${next.slug}:${next.durationInFrames}:${next.scenes.length}:${next.sceneDurations.join(",")}`;
    if (key !== bundleKey.current) {
      bundleKey.current = key;
      setBundle(next);
    }
    return next;
  }, []);

  const refresh = useCallback(async () => {
    const next = await api.state();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh()
      .then(refreshBundle)
      .catch((error: unknown) => setNotice({ text: errorText(error), isError: true }));
  }, [refresh, refreshBundle]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const [{ jobs: nextJobs }, { services: nextServices }] = await Promise.all([api.jobs(), api.services()]);
        if (stopped) return;
        // A job that vanished from the queue has finished: its media or plan edit is now on disk.
        const before = jobsRef.current;
        const finished = before.filter((old) => !nextJobs.some((job) => job.id === old.id));
        jobsRef.current = nextJobs;
        // Same jobs and services = same pixels: skip the setState so the panel does not re-render
        // 59 rail rows and 59 timeline clips every poll.
        setJobs((current) => (JSON.stringify(current) === JSON.stringify(nextJobs) ? current : nextJobs));
        setServices((current) => (JSON.stringify(current) === JSON.stringify(nextServices) ? current : nextServices));
        if (finished.length) {
          for (const job of finished) log(`✔ ${job.label}${job.lastLog ? ` — ${job.lastLog}` : ""}`);
          await refresh();
          await refreshBundle();
        }
      } catch {
        /* the review server restarts often; the next tick picks it up */
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [log, refresh, refreshBundle]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * Every action shares one error path. `refresh` says what to reload afterwards: actions whose
   * endpoint already returned the new state pass false, so a save never costs another /api/state.
   */
  const run = useCallback(
    async <T>(
      work: () => Promise<T>,
      options: { refreshState?: boolean; refreshBundle?: boolean } = {},
    ): Promise<T | undefined> => {
      const { refreshState = true, refreshBundle: reloadBundle = true } = options;
      setBusy((count) => count + 1);
      try {
        return await work();
      } catch (error) {
        const text = errorText(error);
        log(text, true);
        setNotice({ text, isError: true });
        void refresh().catch(() => undefined);
        return undefined;
      } finally {
        setBusy((count) => count - 1);
        if (refreshState) await refresh().catch(() => undefined);
        if (reloadBundle) await refreshBundle().catch(() => undefined);
      }
    },
    [log, refresh, refreshBundle],
  );

  /** Job streams log while they run; the poll picks up the finished job and refreshes the state. */
  const startStream = useCallback(
    async (label: string, start: (handlers: StreamHandlers) => Promise<unknown>) => {
      setBusy((count) => count + 1);
      log(`▶ ${label}`);
      try {
        await start({ onLog: (line) => log(line) });
      } catch (error) {
        const text = errorText(error);
        log(text, true);
        setNotice({ text, isError: true });
      } finally {
        setBusy((count) => count - 1);
        await refresh().catch(() => undefined);
        await refreshBundle().catch(() => undefined);
      }
    },
    [log, refresh, refreshBundle],
  );

  /** Patch one scene in the loaded state, so a save costs no second /api/state round trip. */
  const patchScene = useCallback((scene: number, patch: Partial<StudioState["scenes"][number]>) => {
    setState((current) =>
      current
        ? { ...current, scenes: current.scenes.map((item) => (item.scene === scene ? { ...item, ...patch } : item)) }
        : current,
    );
  }, []);

  const LOCAL_ONLY = { refreshState: false, refreshBundle: false };
  const BUNDLE_ONLY = { refreshState: false };

  const actions = {
    openProject: (slug: string) =>
      run(async () => {
        const next = await api.openProject(slug);
        setState(next);
        setLogs([]);
      }, BUNDLE_ONLY),
    setAspect: (aspect: string) =>
      run(async () => setState(await api.aspect(aspect)), BUNDLE_ONLY),
    setMotionDuration: (value: string) => run(async () => setState(await api.motionDuration(value)), BUNDLE_ONLY),
    saveField: (scene: number, field: string, value: string) =>
      run(
        async () => setState(await api.sceneField(scene, field, value)),
        // A minimum duration or a map spec redraws the scene; the other fields do not touch the render.
        field === "duration" || field === "map" ? BUNDLE_ONLY : LOCAL_ONLY,
      ),
    saveNarration: (scene: number, narration: string) =>
      run(async () => {
        const result = await api.narration(scene, narration);
        patchScene(scene, { narration: result.narration, audioStale: result.audioStale });
      }, LOCAL_ONLY),
    savePrompt: (scene: number, prompt: string) =>
      run(async () => {
        const result = await api.prompt(scene, prompt);
        patchScene(scene, { prompt: result.prompt });
      }, LOCAL_ONLY),
    insertScene: (at: number, narration: string, char?: string) =>
      run(async () => setState(await api.insertScene(at, narration, char)), BUNDLE_ONLY),
    deleteScene: (scene: number) => run(async () => setState(await api.deleteScene(scene)), BUNDLE_ONLY),
    undo: (scene: number, kind: string) => run(async () => setState(await api.undo(scene, kind)), BUNDLE_ONLY),
    redo: (scene: number, kind: string) => run(async () => setState(await api.redo(scene, kind)), BUNDLE_ONLY),
    removeMotion: (scene: number) => run(async () => setState(await api.removeMotion(scene)), BUNDLE_ONLY),
    uploadImage: (scene: number, file: File) => run(async () => setState(await api.uploadImage(scene, file)), BUNDLE_ONLY),
    uploadMotion: (scene: number, file: File) => run(async () => setState(await api.uploadMotion(scene, file)), BUNDLE_ONLY),
    generateImage: (scene: number, model?: string) =>
      startStream(`Sinh ảnh scene ${scene}`, (handlers) => api.generateImage(scene, model, handlers)),
    generateImagesBatch: (scenes: number[], model?: string) =>
      startStream(`Sinh ảnh ${scenes.length} scene`, (handlers) => api.generateImagesBatch(scenes, model, handlers)),
    generateMotion: (scene: number, model?: string) =>
      startStream(`Sinh motion scene ${scene}`, (handlers) => api.generateMotion(scene, model, handlers)),
    generateMotionsBatch: (scenes: number[], model?: string) =>
      startStream(`Sinh motion ${scenes.length} scene`, (handlers) => api.generateMotionsBatch(scenes, model, handlers)),
    generateAudio: (scene: number) =>
      startStream(`Sinh audio scene ${scene}`, (handlers) => api.generateAudio(scene, handlers)),
    generateAudioBatch: (scenes: number[]) =>
      startStream(`Sinh audio ${scenes.length} scene`, (handlers) => api.generateAudioBatch(scenes, handlers)),
    generatePromptsBatch: (scenes: number[]) =>
      startStream(`Viết prompt ảnh ${scenes.length} scene`, (handlers) => api.generatePromptsBatch(scenes, handlers)),
    generateMotionPromptsBatch: (scenes: number[]) =>
      startStream(`Viết prompt motion ${scenes.length} scene`, (handlers) =>
        api.generateMotionPromptsBatch(scenes, handlers),
      ),
    scenesUpdate: (rows: ScenePatch[]) =>
      run(async () => {
        const result = await api.scenesUpdate(rows);
        if (result.appended.length) log(`đã thêm scene ${result.appended.join(", ")}`);
      }),
    mergeScenes: (scenes: number[], keep: number) =>
      run(async () => setState(await api.mergeScenes(scenes, keep)), BUNDLE_ONLY),
    setVoice: (body: { voice?: string; source?: string }) =>
      run(async () => setState(await api.setVoice(body)), LOCAL_ONLY),
    createProject: (body: Record<string, unknown>) =>
      run(async () => {
        const next = await api.projectCreate(body);
        setState(next);
        setLogs([]);
      }, BUNDLE_ONLY),
    scriptGenerate: (body: Record<string, unknown>) =>
      startStream("Viết kịch bản AI", (handlers) => api.scriptGenerate(body, handlers)),
    createCharacter: (id: string, name: string) => run(async () => setState(await api.characterCreate(id, name)), BUNDLE_ONLY),
    importCharacter: (body: { project: string; sourceId: string; id: string; name: string; replace?: boolean }) =>
      run(async () => setState(await api.characterImport(body)), BUNDLE_ONLY),
    saveCharacterProfile: (id: string, patch: Record<string, unknown>) =>
      run(async () => setState(await api.characterSaveProfile(id, patch)), LOCAL_ONLY),
    generateCharacterImage: (id: string, model: string, description: string) =>
      startStream(`Tạo ảnh nhân vật ${id}`, (handlers) => api.characterGenerate(id, model, description, undefined, handlers)),
    uploadCharacterReference: (id: string, file: File) =>
      run(async () => setState(await api.characterUpload(id, file)), BUNDLE_ONLY),
    render: (format: "wide" | "vertical") =>
      startStream(`Render MP4 (${format === "wide" ? "ngang" : "dọc 9:16"})`, (handlers) => api.render(format, handlers)),
    cancelJob: (id: string) => run(async () => void (await api.cancel(id)), LOCAL_ONLY),
    service: (id: string, action: "start" | "stop" | "restart") =>
      run(async () => {
        await api.service(id, action);
        const { services: next } = await api.services();
        setServices(next);
      }, LOCAL_ONLY),
    dismissNotice: () => setNotice(null),
    clearLogs: () => setLogs([]),
  };

  return { state, bundle, jobs, services, logs, notice, busy, actions, refresh };
};

export type Studio = ReturnType<typeof useStudio>;
