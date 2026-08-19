import React from "react";
import { Composition } from "remotion";
import { ScenePlanVideo, FPS } from "./ScenePlanVideo";
import { PROJECTS } from "./projects-data";
import { SceneOneVideo } from "./SceneOneVideo";
import {
  CharacterPuppetPreview,
  CHARACTER_PREVIEW_DURATION,
  CHARACTER_PREVIEW_FPS,
} from "./CharacterPuppetPreview";

// One composition per project (id = slug), built by scripts/build-remotion.mjs into
// src/projects-data. Switching or adding a project no longer overwrites a single shared
// composition — every comparison shows up in the studio under its own name. Re-run the builder
// after changing any project's scenes/audio: node scripts/build-remotion.mjs
export const RemotionRoot: React.FC = () => (
  <>
    {PROJECTS.map((project) => (
      <Composition
        key={project.slug}
        id={project.slug}
        component={ScenePlanVideo}
        defaultProps={{ project }}
        durationInFrames={Math.max(1, project.durationInFrames)}
        fps={project.fps}
        width={1080}
        height={1920}
      />
    ))}
    {/* Single-scene preview. Duration is set per render from the scene's audio (props). */}
    <Composition
      id="SceneOne"
      component={SceneOneVideo}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ scene: 1, durationInFrames: 300 }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInFrames)),
      })}
    />
    <Composition
      id="CharacterPuppetPreview"
      component={CharacterPuppetPreview}
      durationInFrames={CHARACTER_PREVIEW_DURATION}
      fps={CHARACTER_PREVIEW_FPS}
      width={1080}
      height={1920}
    />
  </>
);
