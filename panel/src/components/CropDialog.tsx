import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

export interface CropOptions {
  aspect?: number;
  title?: string;
  hint?: string;
  padColor?: string;
  originalHint?: string;
}

interface Props {
  file: File;
  options: CropOptions;
  onResolve: (file: File | null) => void;
}

const MAX_OUTPUT_PX = 2048;
const MAX_ZOOM_OVER_COVER = 4;
const JPEG_QUALITY = 0.95;
const WHEEL_STEP = 1.1;
const SLIDER_MAX = 100;

/**
 * Crop dialog for images the person brings in: drag to pan, wheel/slider to zoom, Apply renders a
 * JPEG of exactly the frame. "Dùng ảnh gốc" returns the file untouched so the server decides.
 */
export const CropDialog = ({ file, options, onResolve }: Props) => {
  const stage = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [zoom, setZoom] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const objectUrl = useRef<string | null>(null);

  const aspect = options.aspect ?? 1;

  const frameW = () => stage.current?.clientWidth ?? 1;
  const frameH = () => stage.current?.clientHeight ?? 1;
  const contain = () => Math.min(frameW() / natural.w, frameH() / natural.h);
  const cover = () => Math.max(frameW() / natural.w, frameH() / natural.h);
  const maxScale = () => cover() * MAX_ZOOM_OVER_COVER;

  const clampAxis = (offset: number, imageSize: number, frameSize: number) => {
    const room = frameSize - imageSize;
    return room <= 0 ? Math.min(0, Math.max(room, offset)) : Math.min(room, Math.max(0, offset));
  };

  const paint = (nextX: number, nextY: number, nextScale: number) => {
    const cx = clampAxis(nextX, natural.w * nextScale, frameW());
    const cy = clampAxis(nextY, natural.h * nextScale, frameH());
    setX(cx);
    setY(cy);
    setScale(nextScale);
    const min = contain();
    const max = maxScale();
    const t = Math.log(nextScale / min) / Math.log(max / min);
    setZoom(Math.round(Math.min(1, Math.max(0, t)) * SLIDER_MAX));
  };

  const fit = (target: number) => {
    paint((frameW() - natural.w * target) / 2, (frameH() - natural.h * target) / 2, target);
  };

  const zoomAt = (target: number, px: number, py: number) => {
    const next = Math.min(maxScale(), Math.max(contain(), target));
    const ratio = next / scale;
    paint(px - (px - x) * ratio, py - (py - y) * ratio, next);
  };

  useEffect(() => {
    objectUrl.current = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setImage(img);
    };
    img.onerror = () => onResolve(file);
    img.src = objectUrl.current;
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    if (!image || !natural.w) return;
    fit(cover());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  const onPointerDown = (event: ReactPointerEvent) => {
    stage.current?.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX - x, y: event.clientY - y };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    paint(event.clientX - drag.current.x, event.clientY - drag.current.y, scale);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (event: ReactWheelEvent) => {
    event.preventDefault();
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
    zoomAt(scale * factor, event.clientX - rect.left, event.clientY - rect.top);
  };

  const renderBlob = (): Promise<Blob | null> => {
    if (!image) return Promise.resolve(null);
    const srcW = frameW() / scale;
    const srcH = frameH() / scale;
    const sx = -x / scale;
    const sy = -y / scale;
    const shrink = Math.min(1, MAX_OUTPUT_PX / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * shrink));
    const outH = Math.max(1, Math.round(srcH * shrink));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.fillStyle = options.padColor ?? "#D8D8D8";
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingQuality = "high";
    const left = Math.max(0, sx);
    const top = Math.max(0, sy);
    const right = Math.min(natural.w, sx + srcW);
    const bottom = Math.min(natural.h, sy + srcH);
    const toOut = outW / srcW;
    ctx.drawImage(image, left, top, right - left, bottom - top, (left - sx) * toOut, (top - sy) * toOut, (right - left) * toOut, (bottom - top) * toOut);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  };

  const apply = async () => {
    const blob = await renderBlob();
    if (!blob) {
      onResolve(null);
      return;
    }
    const name = file.name.replace(/\.[^.]+$/, "") || "reference";
    onResolve(new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
  };

  return (
    <div className="crop-overlay" onKeyDown={(event) => {
      if (event.key === "Escape") onResolve(null);
    }}>
      <div className="crop-dialog" role="dialog" aria-label={options.title ?? "Cắt ảnh"}>
        <header className="dialog-head">
          <h2>{options.title ?? "Cắt ảnh"}</h2>
          <button type="button" className="btn sm quiet" onClick={() => onResolve(null)} aria-label="Đóng">✕</button>
        </header>
        <p className="hint">{options.hint}</p>
        <div
          ref={stage}
          className="crop-stage"
          style={{ aspectRatio: `${aspect}`, background: options.padColor ?? "#D8D8D8" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {image ? (
            <img
              src={objectUrl.current ?? ""}
              alt=""
              draggable={false}
              style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}
            />
          ) : null}
        </div>
        <div className="crop-tools">
          <button type="button" className="btn sm" onClick={() => fit(contain())}>Vừa khung</button>
          <button type="button" className="btn sm" onClick={() => fit(cover())}>Phủ kín</button>
          <input
            type="range"
            min={0}
            max={SLIDER_MAX}
            value={zoom}
            aria-label="Độ phóng"
            onChange={(event) => {
              const min = contain();
              const t = Number(event.target.value) / SLIDER_MAX;
              zoomAt(min * Math.pow(maxScale() / min, t), frameW() / 2, frameH() / 2);
            }}
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" title={options.originalHint} onClick={() => onResolve(file)}>
            Dùng ảnh gốc
          </button>
          <button type="button" className="btn" onClick={() => onResolve(null)}>
            Huỷ
          </button>
          <button type="button" className="btn primary" onClick={() => void apply()}>
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
};
