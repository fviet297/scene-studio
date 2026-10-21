// Both aspects are delivered on the same 1080x1920 canvas the platform encodes. A 9:16 master
// fills it 1:1. A 16:9 master is centre-cropped to 3:2 and scaled into a 1080x720 band by
// scripts/wrap-vertical.mjs, so an overlay pixel drawn on that master lands at 0.667x on the
// phone. Multiplying every horizontal and typographic value by `unit` cancels that out, so
// overlays read at the same apparent size in both aspects.
const DELIVERY_WIDTH = 1080;
const VERTICAL_BAND_RATIO = 3 / 2; // keep in sync with BAND_RATIO in scripts/wrap-vertical.mjs

export interface DeliveryBand {
  // Horizontal inset of the strip that survives wrap-vertical.mjs; anything outside is cropped.
  cropInset: number;
  bandWidth: number;
  // Delivered-pixel → master-pixel scale.
  unit: number;
  isWide: boolean;
}

export function deliveryBand(width: number, height: number): DeliveryBand {
  const bandWidth = Math.min(width, height * VERTICAL_BAND_RATIO);
  return {
    cropInset: Math.round((width - bandWidth) / 2),
    bandWidth,
    unit: bandWidth / DELIVERY_WIDTH,
    isWide: width > height,
  };
}
