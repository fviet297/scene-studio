# Trần Hưng Đạo — Nhạc Phi

1. Tạo narration mới từ transcript bằng OmniVoice `remotion`; giữ tốc độ tự nhiên.
2. Căn caption theo vùng speech/silence của audio thật.
3. Chia 11 visual beats; trái Trần Hưng Đạo, phải Nhạc Phi.
4. Dùng tranh lịch sử, bản đồ, tượng/di tích; ghi nguồn và giấy phép.
5. Cập nhật Remotion duration theo audio; kiểm tra asset, lint và TypeScript.
6. Render still các mốc chính, sửa crop/overlap, sau đó xuất MP4 và kiểm tra `ffprobe`.

## Tiêu chí hoàn tất

- Narration đúng transcript mới, không ép về đúng 120 giây.
- Caption ngắn, hiện tăng dần và bám audio.
- Host chỉ đúng nhân vật đang được nhắc.
- Không có tên nhân vật trùng trong cùng panel.
- MP4 1080×1920, H.264 + audio AAC, duration khớp narration.
