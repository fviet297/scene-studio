# Handoff — Scene Studio IA (vòng 2)

Cập nhật: 2026-10-28. Đọc `README.md` + `requirements.md` trước; vòng 1 ở `../scene-studio-ux/`.

## Việc tiếp theo

1. **Review diff rồi commit** (chưa commit; theo quy ước repo phải hỏi trước). Gợi ý tách 3 commit: UI (D10–D13 + P4), độ dài
   tối thiểu (D14), gợi ý hồ sơ + sửa `## characters` (D15, D17). Trước khi commit: `node --test scripts/lib/*.test.mjs`.
2. **Dọn dữ liệu test** (chưa xoá — chờ user):
   - `projects/zz-ia-regression/`, `projects/zz-ia-script-ai/`
   - `public/projects/zz-ia-regression/`, `public/projects/zz-ia-script-ai/`
   - `tmp/ia-out/zz-ia-regression.mp4`, `tmp/` notification của 2 dự án test
   - bundle `src/projects-data` của 2 dự án (gitignored, tự build lại)
3. **D19 — `fetch failed` ~60 s** khi viết prompt cho scene nhiều nhân vật: chẩn đoán nơi cắt kết nối (proxy/VPN, keep-alive),
   hoặc cho `prompt-writer.mjs` stream / giảm reasoning effort. Đây là task riêng.
4. Chưa chạy: render 9:16 + "Mở 9:16"; 390 px; Safari / Firefox; audit `web-design-guidelines`.
5. Service đang bật sau test: **OmniVoice** và **muse2api** (bật từ panel). Tắt ở bảng service nếu không dùng.

## Chạy và kiểm

```bash
cd /Users/fviet/PET/compare-image
npm run review                      # cổng 9000
node --test scripts/lib/*.test.mjs  # 69 pass
```

Panel (HTML/CSS/JS) đọc từ đĩa mỗi request → sửa xong tải lại trang. Sửa `review-server.mjs` hoặc `scripts/lib/*` → **phải
khởi động lại server** (kiểm `curl /api/jobs` rỗng trước khi tắt).

## Điểm dễ vấp

- **Quy tắc độ dài scene ở 2 nơi**: `scripts/lib/scene-timing.mjs` (Node: render + server) và `timelineClips()` trong
  `review-timeline.js` (trình duyệt, không import được module Node). Đổi một chỗ phải đổi chỗ kia; `SCENE_GAP_SECONDS` vẫn ở
  `build-remotion.mjs`.
- `duration:` là **mức tối thiểu**, không phải độ dài cố định. Đừng dùng nó để cắt scene — audio sẽ bị cụt.
- Field mới trong scene-plan phải thêm vào **cả hai** regex `FIELD_RE` (`plan-writer.mjs`) và regex trong `parse-plan.mjs`,
  nếu không `writeSceneField` sẽ nuốt dòng khi dọn dòng tiếp nối.
- Dialog Style & template luôn lưu đủ 6 field; server giữ giá trị cũ cho field trống → không xoá trắng được một ô (hành vi cũ).
- Link từ dialog Ảnh / Motion **đóng dialog đó trước** rồi mới mở Style & template — `#tplOverlay` đứng trước trong DOM nên nếu
  mở chồng sẽ nằm dưới.
- `promptKind()` chỉ đọc `#batchPromptKind`. `#railPromptKind` chỉ là bản soi; thêm logic thì đọc qua `promptKind()`.
- Gợi ý hồ sơ không bao giờ ghi đè ô có chữ — muốn gợi ý lại một ô thì xoá ô đó trước.
- Dialog Thêm nhân vật nhớ tab lần trước (Tạo mới / Từ project khác) — script test phải bấm tab trước khi điền.
- Upload video thay thế yêu cầu cạnh dài ≥ 1280; clip Muse ra 1248×704 nên không upload lại trực tiếp được.
- Khi test: ảnh / motion chỉ dùng `muse:*` (D18).
