import { useEffect, useState } from "react";
import { api, type VoiceChoice } from "../api.ts";
import type { StudioState } from "../types.ts";
import type { Studio } from "../useStudio.ts";

interface Props {
  studio: Studio;
  state: StudioState;
}

/**
 * Narration engine and voice are project settings (`audio:` / `voice:` in the plan header).
 * Changing the engine resets the voice to that engine's default, which is what the server does.
 */
export const VoiceControls = ({ studio, state }: Props) => {
  const [sources, setSources] = useState<{ id: string; label: string }[]>([]);
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const [source, setSource] = useState(state.project.audioSource);

  useEffect(() => {
    setSource(state.project.audioSource);
  }, [state.project.audioSource, state.project.slug]);

  useEffect(() => {
    void api
      .audioSources()
      .then((body) => setSources(body.sources))
      .catch(() => setSources([]));
  }, [state.project.slug]);

  useEffect(() => {
    let cancelled = false;
    void api
      .voices(source)
      .then((body) => {
        if (!cancelled) setVoices(body.voices);
      })
      .catch(() => {
        if (!cancelled) setVoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const changeSource = async (next: string) => {
    setSource(next);
    const list = await api.voices(next).catch(() => null);
    const voice = list?.defaultVoice ?? "";
    if (voice) void studio.actions.setVoice({ source: next, voice });
    else void studio.actions.setVoice({ source: next, voice: "" });
  };

  return (
    <>
      <select
        aria-label="Nguồn audio"
        title="Nguồn sinh giọng đọc cho dự án"
        value={source}
        onChange={(event) => void changeSource(event.target.value)}
      >
        {sources.length ? null : <option value={source}>{source}</option>}
        {sources.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Giọng đọc của dự án"
        title="Giọng đọc cho mọi audio sinh từ giờ; audio cũ giữ giọng cũ"
        value={state.project.voice}
        onChange={(event) => void studio.actions.setVoice({ voice: event.target.value })}
      >
        {state.project.voice && !voices.some((voice) => voice.name === state.project.voice) ? (
          <option value={state.project.voice}>{state.project.voice}</option>
        ) : null}
        {voices.map((voice) => (
          <option key={voice.name} value={voice.name}>
            {voice.label ?? voice.name}
          </option>
        ))}
      </select>
    </>
  );
};
