/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
// Frames are JPEG-encoded before H.264 sees them, so Remotion's default jpegQuality (80) is a
// hard ceiling on detail no downstream bitrate can recover. These are line-heavy illustrations
// (2848px source) delivered to a platform that re-encodes again, so pay the disk cost here.
Config.setJpegQuality(95);
// Master is an intermediate: it gets cropped/scaled to 1080x1920 and re-encoded by
// scripts/wrap-vertical.mjs, then re-encoded a third time by TikTok. Keep it near-transparent.
Config.setCrf(16);
Config.setOverwriteOutput(true);
Config.overrideBundlerConfig(enableTailwind);
