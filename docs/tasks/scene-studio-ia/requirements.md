# Requirements — Scene Studio IA (vòng 2)

## Ràng buộc (từ yêu cầu gốc)

- Giữ mọi tính năng, tích hợp, luồng làm việc. Không thêm tính năng ngoài inventory, không bỏ tính năng ít dùng.
- Không viết lại app, không đổi framework, không thêm dependency.
- Giữ dữ liệu dự án, hợp đồng API, hành vi sinh, provider. Đổi backend chỉ khi cần và có lý do.
- Không thao tác phá huỷ lên dữ liệu người dùng, media, hàng chờ, template đã lưu.
- "Kiểm tra JSON" chỉ áp cho JSON nhập vào dialog Kịch bản, không phải kiểm tra trước render.
- Nhập nhân vật từ project khác là cách **lấy nhân vật**, không phải cách tạo project.

## Chỗ lệch giữa inventory và code (đối chiếu 2026-10-28)

Bổ sung cho bảng ở `../scene-studio-ux/README.md`.

| #   | Inventory ghi                        | Code thực tế                                                                                                             | Xử lý vòng này                   |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| 1   | Sửa "duration" của scene             | Không có field. Độ dài = max(audio, clip) + 0,5 s nghỉ; ô "Độ dài" ở dialog Motion chỉ override từng lần sinh, không lưu | **Làm** — độ dài tối thiểu (D14) |
| 2   | Dịch prompt sang tiếng Việt          | Nút Dịch chỉ hiện bản `*_vi` đã lưu (LLM viết kèm); prompt tự sửa / template tự tạo → "Chưa có bản dịch"                 | **Bỏ qua** (user chốt)           |
| 3   | Gợi ý AI cho thông tin nhân vật      | Không có. Hồ sơ chỉ được LLM điền lúc tạo dự án bằng AI                                                                  | **Làm** (D15) — thay D9 vòng 1   |
| 4   | Hồ sơ có "ngoại hình"                | Nằm trong ô "Diễn giải" (`interpretation`), dialog Tạo ảnh nhân vật điền sẵn từ đó                                       | Giữ; gợi ý AI ghi vào ô này      |
| 5   | "Template version"                   | Là **style version**: gói Style DNA + 5 template + prompt hệ thống motion. "Tạo version" đọc cả ô của dialog đang ẩn     | Gộp dialog (D11)                 |
| 6   | Ảnh scene tải lên làm ảnh tham chiếu | Ảnh scene tải lên **thay** ảnh scene (manifest `user_upload`). Ảnh tham chiếu chỉ có ở nhân vật                          | Ghi nhận                         |
| 7   | Watermark có vị trí, cỡ, lề, cỡ chữ  | Watermark luôn ở giữa, chỉ có độ đậm. Vị trí / cỡ / lề / cỡ chữ là của **logo góc**; có thêm "Bám theo" (crop / khung)   | Ghi nhận                         |
| 8   | Xoá video và Dùng ảnh tĩnh là 2 việc | Cùng một nút "Dùng ảnh thay video" (`/api/remove-motion-video`)                                                          | Ghi nhận                         |
| 9   | Xoá thông báo                        | Chỉ có "Xoá hết", theo từng dự án                                                                                        | Ghi nhận                         |
| 10  | Gộp scene                            | Chỉ gộp được scene liền kề                                                                                               | Ghi nhận                         |
| 11  | Hàng chờ job                         | Nằm trong trình duyệt (`lanes`); tải lại trang mất hàng chờ, job đang chạy thành orphan chỉ huỷ được cả job              | Ghi nhận, không đụng             |
| 12  | —                                    | `/api/generate-puppets` không có UI nào gọi                                                                              | Ghi nhận, không xoá              |
| 13  | Phạm vi batch không rõ               | Timeline đã ghi "Chưa chọn · chạy cho scene N"; batch bar rail chỉ hiện khi có tick. Thiếu: số scene **đủ điều kiện**    | Thêm số trên nút (D12)           |

## Bản đồ vị trí — mọi tính năng trong inventory

Ký hiệu đích: **=** giữ nguyên chỗ · **→** đã chuyển ở vòng 2 · **+** thêm lối vào theo ngữ cảnh (cùng một code).
Phạm vi: App / Dự án / Scene / Batch.

### A. Hai chế độ xem

| Tính năng                | Code chính                                  | Phạm vi | Vị trí                                              |
| ------------------------ | ------------------------------------------- | ------- | --------------------------------------------------- |
| Timeline (xem cả video)  | `review-timeline.js`, `setView()`           | Dự án   | = hàng 2, segmented; phím 1                         |
| Chọn scene cho batch     | Set `selected` dùng chung, `batchTargets()` | Batch   | = clip / Chọn nhanh / rail; **+ số scene trên nút** |
| Preview Nháp             | `timelineClips()`                           | Dự án   | = `#tlModes`                                        |
| Preview Bản render, 9:16 | `/preview.js`, `/api/preview-data`          | Dự án   | = `#tlModes`                                        |
| Bàn làm việc             | rail + stage + inspector                    | Scene   | = hàng 2, segmented; phím 2                         |

### B. Dự án & cài đặt dự án

| Tính năng                 | Code chính                                 | Phạm vi | Vị trí                                           |
| ------------------------- | ------------------------------------------ | ------- | ------------------------------------------------ |
| Chuyển dự án              | `#projectSelect` → `/api/project`          | App     | = hàng 1                                         |
| Tạo dự án (AI / thủ công) | `#npOverlay`, `review-script-gen.js`       | App     | = hàng 1 "Dự án mới"                             |
| Tỉ lệ khung               | `#aspectSelect` → `/api/project-aspect`    | Dự án   | = hàng 1, nhóm cài đặt dự án                     |
| Style version             | `#styleSelect` → `/api/templates/activate` | Dự án   | = hàng 1; **+ hàng đầu dialog Style & template** |
| Logo & watermark          | `#brandOverlay` → `/api/branding`          | Dự án   | **→** hàng 1, Cài đặt dự án ▾                    |

### C. Kịch bản & scene

| Tính năng                                 | Code chính                                       | Phạm vi | Vị trí                          |
| ----------------------------------------- | ------------------------------------------------ | ------- | ------------------------------- |
| Viết kịch bản AI (+ yêu cầu cho AI)       | `/api/script-generate` (SSE)                     | App     | = dialog Dự án mới, mode AI     |
| Nhập JSON → Kiểm tra JSON → Áp dụng       | `#scriptImport*` → `/api/scenes-update`          | Dự án   | **→** nút Kịch bản (hàng 2)     |
| Copy JSON                                 | `#scriptCopy`                                    | Dự án   | **→** nút Kịch bản              |
| Chèn / xoá scene                          | `insertSceneBelow()`, `deleteScene()`            | Scene   | = rail + transport Timeline     |
| Gộp scene (chọn scene giữ, sửa narration) | `openMergeDialog()` → `/api/merge-scenes`        | Batch   | = rail, Timeline, Kịch bản      |
| Sửa narration                             | `#narrBox` → `/api/narration`                    | Scene   | = inspector, Kịch bản           |
| Sửa tiêu đề                               | `#titleBox` → `/api/scene-field`                 | Scene   | = inspector                     |
| **Độ dài tối thiểu**                      | `#durationBox` → `/api/scene-field` (`duration`) | Scene   | **mới**, inspector cạnh Tiêu đề |
| Gán nhân vật cho scene                    | `#charPicker` → `/api/scene-field` (`char`)      | Scene   | = inspector                     |

### D. Prompt ảnh & template

| Tính năng                                                       | Code chính                                   | Phạm vi | Vị trí                                              |
| --------------------------------------------------------------- | -------------------------------------------- | ------- | --------------------------------------------------- |
| Viết prompt từ narration                                        | `#btnGenPrompt` → `/api/generate-prompt`     | Scene   | = dialog Ảnh                                        |
| Viết lại prompt hàng loạt (ảnh/motion/cả hai)                   | `rewritePrompts()`                           | Batch   | = Timeline, Kịch bản; rail **+ ô chọn loại riêng**  |
| Viết prompt / motion còn thiếu                                  | `#scriptGenMissing*`                         | Batch   | **→** nút Kịch bản                                  |
| Sửa / lưu prompt                                                | `#promptBox` → `/api/prompt`                 | Scene   | = dialog Ảnh, Kịch bản                              |
| Xem bản dịch                                                    | `runTranslate()`                             | Scene   | = nút Dịch                                          |
| Style DNA                                                       | `#t_styleDna`                                | Dự án   | **→** dialog Style & template; + link từ dialog Ảnh |
| 5 template (1 người, khoá mặt, nhiều người, không người, guard) | `#t_*`                                       | Dự án   | **→** dialog Style & template                       |
| Tạo / chọn version                                              | `#t_version`, `#t_newVersion`, `#t_activate` | Dự án   | **→** hàng đầu dialog Style & template              |

### E. Sinh ảnh

| Tính năng               | Code chính                                       | Phạm vi   | Vị trí                                 |
| ----------------------- | ------------------------------------------------ | --------- | -------------------------------------- |
| Sinh ảnh 1 scene        | `generateImage()` → `/api/generate`              | Scene     | = dialog Ảnh, nút Sinh ở inspector     |
| Sinh ảnh hàng loạt      | `/api/generate-batch` + xác nhận chi phí         | Batch     | = Timeline, rail (+ số scene trên nút) |
| Tải ảnh scene           | `/api/upload`                                    | Scene     | = dialog Ảnh, thả file lên canvas      |
| Ảnh tham chiếu nhân vật | `/api/character-upload`, `/api/character-source` | Dự án     | = thẻ nhân vật                         |
| Chọn model              | `#imageModelSelect` ↔ `#batchImageModelSelect`   | App       | =                                      |
| Tiến độ, log            | console, lane job Timeline, meter, `stage-state` | App       | =                                      |
| Huỷ job                 | `#conCancel`, `cancelSceneJob()` → `/api/cancel` | App/Scene | =                                      |
| Xoá hàng chờ            | `clearQueues()`                                  | App       | =                                      |
| Chọn lại scene lỗi      | option "Scene lỗi gần nhất", nút trong thông báo | Batch     | =                                      |
| Hoàn tác / làm lại ảnh  | `/api/undo`, `/api/redo`                         | Scene     | =                                      |

### F. Motion prompt & video

| Tính năng                      | Code chính                                     | Phạm vi     | Vị trí                                                     |
| ------------------------------ | ---------------------------------------------- | ----------- | ---------------------------------------------------------- |
| Viết motion bằng AI            | `#motionWrite`                                 | Scene       | = dialog Motion                                            |
| Viết motion còn thiếu          | `#scriptGenMissingMotion`                      | Batch       | **→** nút Kịch bản                                         |
| Sửa / lưu motion               | `saveMotionParts()` → `/api/scenes-update`     | Scene       | = dialog Motion, Kịch bản                                  |
| Prompt hệ thống viết motion    | `#t_motionSystem`                              | Dự án       | **→** Style & template › Nâng cao; + link từ dialog Motion |
| Sinh video 1 scene / hàng loạt | `/api/generate-motion-video`, `…-videos-batch` | Scene/Batch | =                                                          |
| Tải video thay thế             | `/api/upload-motion-video`                     | Scene       | = dialog Motion                                            |
| Xoá video = dùng ảnh tĩnh      | `/api/remove-motion-video`                     | Scene       | = dialog Motion                                            |

### G–K

| Tính năng                                         | Code chính                                        | Phạm vi     | Vị trí                                                     |
| ------------------------------------------------- | ------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| Chọn giọng                                        | `#voiceSelect` → `/api/project-voice`             | Dự án       | = hàng 1; **+ `Giọng: …` chỉ đọc ở inspector**             |
| Sinh audio 1 scene / hàng loạt                    | `/api/audio`, `/api/audio-batch`                  | Scene/Batch | =                                                          |
| Thêm nhân vật, tạo ảnh từ mô tả / từ ảnh, tải ảnh | `#acOverlay`, `#ciOverlay`                        | Dự án       | = rail (mục **Nhân vật dự án** thu gọn được), dải Timeline |
| Nhập nhân vật từ dự án khác                       | `/api/character-library`, `/api/character-import` | Dự án       | = dialog Thêm nhân vật, tab "Từ project khác"              |
| Hồ sơ nhân vật                                    | `#profOverlay` → `/api/character-profile`         | Dự án       | = thẻ nhân vật › Hồ sơ                                     |
| **Gợi ý AI cho hồ sơ**                            | `#profSuggest` → `/api/character-suggest`         | Dự án       | **mới**, dialog Hồ sơ                                      |
| Render MP4, Mở MP4                                | `#btnRender` → `/api/finalize`; `/video`          | Dự án       | = hàng 2                                                   |
| Thư viện video, thư mục lưu                       | `#libOverlay` → `/api/outputs`, `/api/output-dir` | App         | = Ứng dụng ▾                                               |
| Bài đăng, Thumbnail                               | `review-social.js`, `review-thumbnail.js`         | Dự án       | = Đóng gói ▾                                               |
| Model & provider                                  | `review-models.js` → `/api/model-config/*`        | App         | = Ứng dụng ▾                                               |
| Thông báo, xoá thông báo                          | `/api/notifications`, `/api/notifications-clear`  | App         | = console bar + Ứng dụng ▾                                 |
| Copy log / Copy JSON                              | `#conCopy`, `#scriptCopy`                         | App/Dự án   | =                                                          |

## Nghiệm thu

| Tiêu chí                                                                    | Kiểm ở                   |
| --------------------------------------------------------------------------- | ------------------------ |
| Mọi tính năng trong inventory có vị trí ghi rõ                              | bảng trên                |
| Không tính năng nào bị bỏ, tắt, thay bằng placeholder                       | `progress.md` regression |
| Phân biệt được cấu hình dự án (hàng 1) với công việc (hàng 2)               | ảnh chụp 1440 / 1024 px  |
| Nút batch cho biết chạy cho bao nhiêu scene                                 | `progress.md`            |
| Timeline + Bàn làm việc giữ hành vi; chuyển view giữ lựa chọn               | `progress.md`            |
| Dự án, nhân vật, prompt, version template, media, job, video cũ tương thích | `progress.md`            |
| Độ dài tối thiểu không bao giờ cắt narration                                | test `scene-timing`      |
