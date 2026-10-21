// @types/react-dom is not installed (the render pipeline never imports react-dom directly); this
// covers the two calls preview-entry.tsx makes.
declare module "react-dom/client" {
  import type { ReactNode } from "react";

  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element): Root;
}
