/**
 * HistoryHost — the SVG puppet (presentational only).
 *
 * A hand-vectorised rig of the official character sheet: a cute Đông Sơn Lạc
 * bird in a nón lá. No raster, no external assets — only <path>/<ellipse>/<g>.
 * Every animatable part is a <g id> that receives an independent SVG transform
 * from the `pose`; the face is driven by `face`. This component holds NO
 * animation logic — it just draws whatever pose/face it is handed.
 *
 * Draw order (back → front): tail, legs, body, head (+ face + hat), wings.
 * Wings are drawn last so raised-arm poses (wave, point, celebrate) read in
 * front of the head instead of hiding behind it.
 */
import React from 'react';
import type { FaceState, HistoryHostPose, MouthShape } from './HistoryHost.types';
import { COLORS as C, FACE, PIVOTS, STROKE, VIEWBOX } from './rig';
import { buildTransform } from './HistoryHostPose';

interface PuppetProps {
  pose: HistoryHostPose;
  face: FaceState;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
}

const ASPECT = VIEWBOX.height / VIEWBOX.width;

// --- Sun emblem (Đông Sơn) rays, generated once ---------------------------
const SUN = { cx: 218, cy: 372 };
const SUN_RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return {
    x1: SUN.cx + Math.cos(a) * 17,
    y1: SUN.cy + Math.sin(a) * 17,
    x2: SUN.cx + Math.cos(a) * 33,
    y2: SUN.cy + Math.sin(a) * 33,
  };
});

// --- Belt motif: alternating triangles following the belt's downward bow ---
const BELT_MOTIF = Array.from({ length: 7 }, (_, i) => {
  const x = 172 + i * 16;
  const y = 424 + 8 * (1 - ((x - 220) / 70) ** 2);
  return { x, y, up: i % 2 === 0 };
});

export function HistoryHostPuppet({ pose, face, width = 480, height, style, className }: PuppetProps) {
  const w = width;
  const h = height ?? Math.round(width * ASPECT);
  const t = (p: keyof typeof PIVOTS) => buildTransform(pose[p], PIVOTS[p]);

  return (
    <svg
      className={className}
      style={style}
      width={w}
      height={h}
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="history-host" transform={t('root')}>
        <g id="tail" transform={t('tail')}>{renderTail()}</g>

        <g id="leg-left" transform={t('legLeft')}>{renderLeg('left')}</g>
        <g id="leg-right" transform={t('legRight')}>{renderLeg('right')}</g>

        <g id="body" transform={t('body')}>{renderBody()}</g>

        <g id="head" transform={t('head')}>
          {renderHead()}
          {renderFace(face)}
          <g id="hat" transform={t('hat')}>{renderHat()}</g>
        </g>

        <g id="wing-left" transform={t('wingLeft')}>{renderWing('left')}</g>
        <g id="wing-right" transform={t('wingRight')}>{renderWing('right')}</g>
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ parts ---

function renderTail() {
  const outline = { stroke: C.outline, strokeWidth: 5, strokeLinejoin: 'round' as const };
  return (
    <>
      <path
        d="M298,358 C356,340 432,348 452,398 C458,414 448,430 432,432 C412,434 396,420 392,404 C372,412 330,408 300,394 Z"
        fill={C.tailRed}
        {...outline}
      />
      <path
        d="M304,372 C356,360 418,368 440,406 C446,420 436,432 422,430 C404,428 392,416 388,404 C356,410 326,406 306,396 Z"
        fill={C.tailOrange}
        {...outline}
      />
      <path
        d="M312,388 C354,384 398,392 424,416 C412,410 400,414 398,424 C400,408 380,410 374,420 C378,404 348,404 340,412 C330,402 318,398 312,398 Z"
        fill={C.tailGreen}
        {...outline}
      />
      <path
        d="M316,362 C368,350 420,356 448,390"
        fill="none"
        stroke={C.tailYellow}
        strokeWidth={7}
        strokeLinecap="round"
      />
    </>
  );
}

function renderLeg(side: 'left' | 'right') {
  const flip = side === 'right';
  const paths = [
    'M191,452 L205,452 L204,500 L192,500 Z', // shank
    'M198,498 L172,512 L178,518 L200,506 Z', // toe outer
    'M198,500 L194,522 L206,522 L202,500 Z', // toe middle
    'M198,498 L224,512 L218,518 L200,506 Z', // toe inner
  ];
  return (
    <g transform={flip ? 'translate(436,0) scale(-1,1)' : undefined}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill={C.leg} stroke={C.outline} strokeWidth={4} strokeLinejoin="round" />
      ))}
    </g>
  );
}

function renderBody() {
  return (
    <>
      <ellipse cx={220} cy={362} rx={104} ry={112} fill={C.body} stroke={C.outline} strokeWidth={STROKE} />
      <ellipse cx={210} cy={378} rx={74} ry={82} fill={C.bodyLight} opacity={0.3} />

      {/* Đông Sơn sun emblem */}
      <g id="body-decoration">
        {SUN_RAYS.map((r, i) => (
          <line
            key={i}
            x1={r.x1}
            y1={r.y1}
            x2={r.x2}
            y2={r.y2}
            stroke={C.sun}
            strokeWidth={7}
            strokeLinecap="round"
          />
        ))}
        <circle cx={SUN.cx} cy={SUN.cy} r={18} fill={C.sun} stroke={C.beltDark} strokeWidth={2} />
        <circle cx={SUN.cx} cy={SUN.cy} r={8} fill={C.sunCore} />
      </g>

      {/* Decorative waist belt with triangle motif */}
      <g id="body-belt">
        <path
          d="M130,414 Q220,432 310,414 L305,438 Q220,458 135,438 Z"
          fill={C.belt}
          stroke={C.outline}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        {BELT_MOTIF.map((m, i) =>
          m.up ? (
            <path key={i} d={`M${m.x - 6},${m.y + 6} L${m.x},${m.y - 6} L${m.x + 6},${m.y + 6} Z`} fill={C.beltMotif} />
          ) : (
            <path key={i} d={`M${m.x - 6},${m.y - 6} L${m.x + 6},${m.y - 6} L${m.x},${m.y + 6} Z`} fill={C.beltMotif} />
          ),
        )}
      </g>
    </>
  );
}

function renderHead() {
  return <ellipse cx={218} cy={208} rx={126} ry={120} fill={C.body} stroke={C.outline} strokeWidth={STROKE} />;
}

function renderWing(side: 'left' | 'right') {
  const flip = side === 'right';
  return (
    <g transform={flip ? 'translate(436,0) scale(-1,1)' : undefined}>
      <path
        d="M140,318 C120,326 106,356 110,392 C112,412 132,414 140,398 C147,386 152,352 150,330 C149,321 145,317 140,318 Z"
        fill={C.body}
        stroke={C.outline}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* wristband */}
      <path d="M112,384 Q128,394 145,382" fill="none" stroke={C.hatLine} strokeWidth={8} strokeLinecap="round" />
      {/* feather fingers */}
      <path d="M116,402 L112,415" stroke={C.outline} strokeWidth={5} strokeLinecap="round" />
      <path d="M126,406 L124,420" stroke={C.outline} strokeWidth={5} strokeLinecap="round" />
      <path d="M136,404 L138,418" stroke={C.outline} strokeWidth={5} strokeLinecap="round" />
    </g>
  );
}

function renderHat() {
  return (
    <>
      <path
        d="M218,58 L86,150 Q86,164 106,164 Q218,170 330,164 Q350,164 350,150 Z"
        fill={C.hat}
        stroke={C.outline}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* under-brim shade */}
      <path d="M92,152 Q218,172 344,152 Q218,166 92,152 Z" fill={C.hatShade} opacity={0.7} />
      {/* woven bamboo rings */}
      <path d="M120,118 Q218,132 316,118" fill="none" stroke={C.hatLine} strokeWidth={3} />
      <path d="M104,136 Q218,152 332,136" fill="none" stroke={C.hatLine} strokeWidth={3} />
      {/* chin ties */}
      <path d="M104,162 Q96,190 100,206 L112,206 Q110,188 116,164 Z" fill={C.hatTie} stroke={C.outline} strokeWidth={3} strokeLinejoin="round" />
      <path d="M332,162 Q340,190 336,206 L324,206 Q326,188 320,164 Z" fill={C.hatTie} stroke={C.outline} strokeWidth={3} strokeLinejoin="round" />
    </>
  );
}

// ------------------------------------------------------------------- face ---

function renderFace(face: FaceState) {
  return (
    <g id="face">
      {renderBrow('left', face)}
      {renderBrow('right', face)}
      {renderEye('left', face)}
      {renderEye('right', face)}
      {renderBeak()}
      {renderMouth(face.mouth)}
    </g>
  );
}

function renderEye(side: 'left' | 'right', face: FaceState) {
  const c = side === 'left' ? FACE.eyeLeft : FACE.eyeRight;
  const open = side === 'left' ? face.eyeOpenL : face.eyeOpenR;
  const px = c.x + face.pupilDX;
  const py = c.y + 8 + face.pupilDY;
  return (
    <g id={`eye-${side}`} transform={`translate(${c.x} ${c.y}) scale(1 ${open}) translate(${-c.x} ${-c.y})`}>
      <ellipse cx={c.x} cy={c.y} rx={36} ry={42} fill={C.eyeWhite} stroke={C.outline} strokeWidth={5} />
      <ellipse cx={px} cy={py} rx={23} ry={28} fill={C.pupil} />
      <circle cx={px - 8} cy={py - 6} r={9} fill={C.highlight} />
      <circle cx={px + 9} cy={py + 11} r={4} fill={C.highlight} />
    </g>
  );
}

function renderBrow(side: 'left' | 'right', face: FaceState) {
  const p = side === 'left' ? FACE.browLeft : FACE.browRight;
  const rot = side === 'left' ? face.browRotL : face.browRotR;
  const d = side === 'left' ? 'M144,184 Q172,170 200,182' : 'M236,182 Q264,170 292,184';
  return (
    <path
      id={`eyebrow-${side}`}
      d={d}
      fill="none"
      stroke={C.outline}
      strokeWidth={9}
      strokeLinecap="round"
      transform={`translate(0 ${face.browY}) rotate(${rot} ${p.x} ${p.y})`}
    />
  );
}

function renderBeak() {
  return (
    <g id="beak">
      <path
        d="M198,242 Q218,236 238,242 Q230,262 218,266 Q206,262 198,242 Z"
        fill={C.beak}
        stroke={C.outline}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d="M218,244 L218,258" stroke={C.beakShade} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/** Optional mouth overlay just below the beak; expression swaps the variant. */
function renderMouth(mouth: MouthShape) {
  switch (mouth) {
    case 'smile':
      return <path id="mouth" d="M198,268 Q218,292 238,268 Q218,278 198,268 Z" fill={C.mouthDark} />;
    case 'open':
      return <ellipse id="mouth" cx={218} cy={280} rx={15} ry={19} fill={C.mouthDark} />;
    case 'frown':
      return (
        <path
          id="mouth"
          d="M200,288 Q218,270 236,288"
          fill="none"
          stroke={C.mouthDark}
          strokeWidth={5}
          strokeLinecap="round"
        />
      );
    case 'beak':
    default:
      return null;
  }
}
