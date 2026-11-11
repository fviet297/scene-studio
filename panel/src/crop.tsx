import { createRoot } from "react-dom/client";
import { CropDialog, type CropOptions } from "./components/CropDialog.tsx";

/**
 * Open the crop dialog for an upload and resolve with the cropped JPEG, the untouched file
 * ("Dùng ảnh gốc"), or null (cancelled). Mounts its own root, so it works from any component.
 */
export const cropImage = (file: File, options: CropOptions = {}): Promise<File | null> =>
  new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const done = (result: File | null) => {
      root.unmount();
      host.remove();
      resolve(result);
    };
    root.render(<CropDialog file={file} options={options} onResolve={done} />);
  });
