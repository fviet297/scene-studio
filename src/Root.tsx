import React from "react";
import { Composition } from "remotion";
import {
  HistoryComparison,
  FPS,
  totalDurationInFrames,
} from "./HistoryComparison";
import {
  ScenePlanVideo,
  totalDurationInFrames as planFrames,
} from "./ScenePlanVideo";
import { SceneOneVideo } from "./SceneOneVideo";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="QuangTrungHanTin"
      component={HistoryComparison}
      durationInFrames={totalDurationInFrames}
      fps={FPS}
      width={1080}
      height={1920}
    />
    <Composition
      id="ScenePlanVideo"
      component={ScenePlanVideo}
      durationInFrames={planFrames}
      fps={FPS}
      width={1080}
      height={1920}
    />
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
  </>
);
