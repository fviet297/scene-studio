// Reusable cinematic animation engine for Remotion. Drop any static scene image (and, later,
// a transparent-PNG character layer) into CinematicScene and drive it entirely by config.
export * from "./types";
export * from "./motion";
export { CinematicScene } from "./CinematicScene";
export { CinematicCamera } from "./CinematicCamera";
export { ParallaxLayer } from "./ParallaxLayer";
export { AnimatedCharacter } from "./AnimatedCharacter";
export { Atmosphere } from "./atmosphere/Atmosphere";
export { FogOverlay } from "./atmosphere/FogOverlay";
export { LightRays } from "./atmosphere/LightRays";
export { ParticleLayer } from "./atmosphere/ParticleLayer";
export { Vignette } from "./atmosphere/Vignette";
export { FilmGrain } from "./atmosphere/FilmGrain";
