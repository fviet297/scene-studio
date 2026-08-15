import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { captionGroups } from "./caption-data";
import { sceneDurations } from "./audio-durations";
import { HistoryHost } from "./characters/HistoryHost";

export const FPS = 30;
const COLORS = {
  paper: "#f2eadb",
  ink: "#191716",
  red: "#a82f26",
  gold: "#bb8a31",
  jade: "#526f5c",
  line: "#29221d",
};

type Animation =
  | "point-left"
  | "point-right"
  | "explain"
  | "think"
  | "celebrate"
  | "happy";
type Beat = {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  title: string;
  cue: string;
  animation: Animation;
  focus: "left" | "right" | "both";
  aiLeft?: boolean;
  aiRight?: boolean;
};

// Left = Quang Trung (Tây Sơn / Đại Việt). Right = Hàn Tín (nhà Hán / Trung Hoa).
// Panel labels describe the actual image (a place, a related figure, a battle), never a
// portrait mislabelled as someone else; the title + cue carry the comparison.
const beats: Beat[] = [
  {
    left: "scene-01-left-quang-trung.jpg",
    right: "scene-01-right-han-tin.jpg",
    leftLabel: "QUANG TRUNG",
    rightLabel: "HÀN TÍN",
    title: "HAI DANH TƯỚNG LỪNG DANH",
    cue: "TÂY SƠN  •  NHÀ HÁN",
    animation: "explain",
    focus: "both",
  },
  {
    left: "scene-02-left-thang-long-citadel.jpg",
    right: "scene-02-right-han-xin-painting.jpg",
    leftLabel: "HOÀNG THÀNH THĂNG LONG",
    rightLabel: "HÀN TÍN",
    title: "ĐẠI VIỆT ĐẦY BIẾN ĐỘNG",
    cue: "TÂY SƠN NỔI DẬY  •  NĂM 1788 QUÂN THANH SANG",
    animation: "point-left",
    focus: "left",
  },
  {
    left: "scene-03-left-nguyen-hue-portrait.jpg",
    right: "scene-03-right-chu-han-map.png",
    leftLabel: "NGUYỄN HUỆ",
    rightLabel: "CHIẾN TRANH HÁN – SỞ",
    title: "TRUNG HOA NỘI CHIẾN",
    cue: "NHÀ TẦN SỤP ĐỔ  •  HÀN TÍN THEO LƯU BANG",
    animation: "point-right",
    focus: "right",
  },
  {
    left: "scene-04-left-tay-son-museum.jpg",
    right: "scene-04-right-liu-bang.jpg",
    leftLabel: "PHONG TRÀO TÂY SƠN",
    rightLabel: "LƯU BANG",
    title: "HAI CON ĐƯỜNG XUẤT THÂN",
    cue: "ANH EM TÂY SƠN DỰNG NGHIỆP",
    animation: "point-left",
    focus: "left",
  },
  {
    left: "scene-05-left-tay-son-van-hue.jpg",
    right: "scene-05-right-han-xin-matakuguri.jpg",
    leftLabel: "TÂY SƠN",
    rightLabel: "HÀN TÍN LUỒN TRÔN",
    title: "TỪ GIAN KHÓ ĐI LÊN",
    cue: "KHÔNG CẦN XUẤT PHÁT TỪ ĐỈNH CAO",
    animation: "point-right",
    focus: "right",
  },
  {
    left: "scene-06-left-tho-xuong-battle.jpg",
    right: "scene-06-right-han-xin-art.jpg",
    leftLabel: "NGỌC HỒI – ĐỐNG ĐA",
    rightLabel: "HÀN TÍN",
    title: "HÀNH QUÂN THẦN TỐC",
    cue: "TẾT KỶ DẬU 1789  •  ĐẠI PHÁ QUÂN THANH",
    animation: "point-left",
    focus: "left",
  },
  {
    left: "scene-07-left-den-quang-trung.jpg",
    right: "scene-07-right-han-xin-ming.png",
    leftLabel: "ĐỀN THỜ QUANG TRUNG",
    rightLabel: "HÀN TÍN CẦM QUÂN",
    title: "MƯU LƯỢC ĐIỀU BINH",
    cue: "TRẬN TỈNH HÌNH  •  ĐẶT VÀO THẾ KHÔNG THỂ LUI",
    animation: "point-right",
    focus: "right",
  },
  {
    left: "scene-08-left-tay-son-temple.jpg",
    right: "scene-08-right-xiang-yu.jpg",
    leftLabel: "ĐỀN TÂY SƠN",
    rightLabel: "HẠNG VŨ",
    title: "SAU CHIẾN THẮNG",
    cue: "QUANG TRUNG LÊN NGÔI  •  QUA ĐỜI NĂM 1792",
    animation: "point-left",
    focus: "left",
  },
  {
    left: "scene-09-left-go-dong-da.jpg",
    right: "scene-09-right-han-xin-death.jpg",
    leftLabel: "GÒ ĐỐNG ĐA",
    rightLabel: "CUNG VỊ ƯƠNG",
    title: "HAI KẾT CỤC KHÁC NHAU",
    cue: "HÀN TÍN BỊ GIẾT  •  NĂM 196 TRƯỚC CÔNG NGUYÊN",
    animation: "point-right",
    focus: "right",
  },
  {
    left: "scene-10-left-quang-trung-museum.jpg",
    right: "scene-10-right-han-xin-mural.jpg",
    leftLabel: "BẢO TÀNG QUANG TRUNG",
    rightLabel: "BÍCH HỌA HÀN TÍN",
    title: "KHÔNG CÙNG SỐ PHẬN",
    cue: "NHƯNG ĐỀU THAY ĐỔI CỤC DIỆN LỊCH SỬ",
    animation: "think",
    focus: "both",
  },
  {
    left: "scene-11-left-nguyen-hue-monument.jpg",
    right: "scene-11-right-han-xin-xiaohe.jpg",
    leftLabel: "TƯỢNG ĐÀI QUANG TRUNG",
    rightLabel: "TÍCH TIÊU HÀ – HÀN TÍN",
    title: "HAI DANH TƯỚNG • HAI DI SẢN",
    cue: "VIỆT NAM  •  TRUNG HOA",
    animation: "celebrate",
    focus: "both",
  },
];

const sceneFrames = sceneDurations.map((seconds) => Math.round(seconds * FPS));
const sceneStarts = sceneFrames.reduce(
  (acc, frames) => [...acc, acc[acc.length - 1] + frames],
  [0],
);
export const totalDurationInFrames = sceneStarts[sceneStarts.length - 1];

function CaptionTrack() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const group = captionGroups.find(
    (words) =>
      seconds >= words[0].start && seconds < words[words.length - 1].end,
  );
  if (!group) return null;
  const visibleWords = group.filter((word) => seconds >= word.start);
  return (
    <div
      style={{
        position: "absolute",
        left: 42,
        right: 194,
        bottom: 248,
        minHeight: 124,
        padding: "20px 26px",
        background: COLORS.paper,
        border: `4px solid ${COLORS.ink}`,
        borderRadius: 18,
        boxShadow: `8px 8px 0 ${COLORS.ink}`,
        fontFamily: "Arial, sans-serif",
        fontSize: 38,
        lineHeight: 1.12,
        fontWeight: 800,
        color: COLORS.ink,
      }}
    >
      {visibleWords.map((word) => word.text).join(" ")}
      <span style={{ color: COLORS.red }}>▌</span>
    </div>
  );
}

function Photo({
  src,
  label,
  tone,
  muted,
  ai,
}: {
  src: string;
  label: string;
  tone: string;
  muted: boolean;
  ai?: boolean;
}) {
  const isMap = src.includes("map");
  return (
    <div
      style={{
        width: "50%",
        position: "relative",
        overflow: "hidden",
        borderRadius: 18,
        border: `6px solid ${muted ? "#b8aea1" : tone}`,
        background: isMap ? "#e8dfcc" : "#d5ccbe",
        opacity: muted ? 0.55 : 1,
        transform: muted ? "scale(.97)" : "scale(1)",
      }}
    >
      <Img
        src={staticFile(`images/${src}`)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: isMap ? "contain" : "cover",
          filter: "saturate(.82) contrast(1.06)",
        }}
      />
      {ai && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            padding: "4px 9px",
            background: "rgba(25,23,22,.82)",
            color: "#f2eadb",
            fontFamily: "Arial, sans-serif",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: 0.4,
            borderRadius: 6,
          }}
        >
          AI PHỤC DỰNG
        </div>
      )}
      <div
        style={{
          position: "absolute",
          inset: "auto 0 0",
          padding: "48px 12px 14px",
          background: "linear-gradient(transparent, rgba(0,0,0,.86))",
          color: "white",
          fontFamily: "Arial, sans-serif",
          fontWeight: 900,
          fontSize: 23,
          lineHeight: 1.1,
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ComparisonBeat({ beat }: { beat: Beat }) {
  const local = useCurrentFrame();
  const opacity = interpolate(local, [0, 10], [0.65, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hostLeft =
    beat.focus === "right" ? 456 : beat.focus === "left" ? 18 : 245;
  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          top: 92,
          left: 28,
          right: 184,
          height: 680,
          display: "flex",
          gap: 14,
        }}
      >
        <Photo
          src={beat.left}
          label={beat.leftLabel}
          tone={COLORS.red}
          muted={beat.focus === "right"}
          ai={beat.aiLeft}
        />
        <Photo
          src={beat.right}
          label={beat.rightLabel}
          tone={COLORS.gold}
          muted={beat.focus === "left"}
          ai={beat.aiRight}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 812,
          left: 42,
          right: 194,
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
          fontWeight: 1000,
          fontSize: 48,
          lineHeight: 1.04,
          color: COLORS.ink,
        }}
      >
        {beat.title}
      </div>
      <div
        style={{
          position: "absolute",
          top: 950,
          left: 58,
          right: 210,
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
          fontSize: 27,
          fontWeight: 800,
          color: COLORS.red,
        }}
      >
        {beat.cue}
      </div>
      <HistoryHost
        animation={beat.animation}
        expression="confident"
        width={405}
        style={{ position: "absolute", left: hostLeft, top: 1060 }}
      />
    </AbsoluteFill>
  );
}

export const HistoryComparison: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.paper, color: COLORS.ink }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(41,34,29,.03) 1px, transparent 1px)",
        backgroundSize: "100% 8px",
      }}
    />
    {beats.map((beat, index) => (
      <Sequence
        key={index}
        from={sceneStarts[index]}
        durationInFrames={sceneFrames[index]}
      >
        <ComparisonBeat beat={beat} />
        <Audio
          src={staticFile(
            `audio/scene-${String(index + 1).padStart(2, "0")}.mp3`,
          )}
        />
      </Sequence>
    ))}
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 18,
        background: COLORS.jade,
      }}
    />
    <CaptionTrack />
  </AbsoluteFill>
);
