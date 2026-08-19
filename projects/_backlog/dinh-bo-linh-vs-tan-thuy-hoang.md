# Video: Đinh Bộ Lĩnh vs Tần Thủy Hoàng

## Goal

Dựng video Remotion dọc 1080x1920 theo narration, so sánh hai nhân vật bằng hình tư liệu đa dạng, host chỉ đúng phía và subtitle chạy theo lời.

## Tasks

- [x] Tạo narration qua `ws://127.0.0.1:8765/ws` với voice `remotion` -> Verify: MP3 ghép hoàn chỉnh, `ffprobe` đọc được.
- [x] Tải asset lịch sử và lưu manifest nguồn/license -> Verify: mọi file ảnh mở được và có metadata nguồn.
- [x] Chia video thành visual beat có timestamp, ảnh trái/phải và hướng host -> Verify: mỗi đoạn narration có visual phù hợp.
- [x] Tạo subtitle word-reveal theo cụm ngắn -> Verify: không hiển thị nguyên câu dài cùng lúc.
- [x] Render still các mốc đại diện, chạy lint/typecheck -> Verify: không lỗi và bố cục 9:16 không chồng lấn.
- [x] Render MP4 cuối -> Verify: video 1080x1920 phát đủ audio/hình.

## Done When

- [x] Hai chủ thể luôn ở hai bên; host chỉ đúng bên đang được nhắc.
- [x] Hình ảnh đa dạng, không lặp một chân dung xuyên suốt.
- [x] Subtitle bám narration và dễ đọc trên màn hình dọc.
