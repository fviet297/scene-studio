// Close Vietnamese translations of the default prompt templates (scripts/lib/replicate-image.mjs
// TEMPLATE_DEFAULTS). Read-only reading aids shown next to each template field in the review panel,
// replacing the old runtime Google Translate call. Placeholders ([FRAME], [STYLE], [GUARD],
// [SCENE-SPECIFIC PROMPT]) are kept verbatim so the reader sees where the pieces get substituted.
//
// These translate the SHIPPED defaults. A user-authored template version (created in the panel) is
// English the user wrote themselves, so no Vietnamese is stored for it — the panel then shows a
// "chưa có bản dịch" note. If the English default here changes, update the matching field below.

export const TEMPLATE_VI_DEFAULTS = {
  styleDna: `Tranh chibi vector 2D kiểu game-asset — tỉ lệ chibi 2,5 đầu, đầu tròn quá khổ, thân và tay chân mập ngắn, bàn tay kiểu găng; nét viền nâu sẫm đều và đậm; tô phẳng cel-shading, một tông bóng mềm, không gradient, không highlight bóng loáng, không nhiễu texture; mắt hạnh nhân nhỏ đồng tử sẫm, chân mày đen dày sắc, mũi chấm, miệng nhỏ, biểu cảm nghiêm nghị kiên định; bảng màu lịch sử trầm gồm đỏ thẫm, vàng cổ, thổ hoàng, xanh mòng két, ô liu, tím thẫm và nâu da thuộc`,

  guard: `pha trộn phong cách hoặc tỉ lệ, người bán tả thực hoặc tỉ lệ người lớn, nền sơn dầu hoặc mờ đục, gradient, bóng loáng, sương mù, mờ nhòe, bóng đen silhouette, ảnh chân thực, render 3D, pha trộn văn hóa hoặc thời kỳ, sai niên đại, giáp fantasy, nền trống trơn, watermark`,

  masterPrompt: `MỘT tranh chibi cartoon 2D phẳng. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn; không nền sơn dầu, sương mù hay mờ nhòe. Nhân vật chính, lính và đám đông dùng cùng tỉ lệ 2,5 đầu, bàn tay kiểu găng, độ dày nét và cel-shading phẳng; đám đông là nhiều nhân vật chibi nhỏ, không phải một khối vân texture.

NHÂN VẬT CHÍNH: khóa theo ảnh tham chiếu — giữ nguyên mặt, tóc, da, tỉ lệ, trang phục, giáp, màu sắc và vũ khí; chỉ đổi tư thế, biểu cảm, hành động, góc máy và ánh sáng. Nhân vật phụ mặc đồ đơn giản hơn, không sao chép mặt, mũ hay giáp của nhân vật chính.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

DÀN CẢNH: cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận; mỗi nhân vật chính khoảng 20–30% chiều cao khung. Chiều sâu nhiều lớp, đường dẫn mắt, tỉ lệ đa dạng, hoạt động thấy được; bất đối xứng hoặc chéo, không xếp hàng căn giữa. Mặt đọc được và không bị cắt.

LOẠI TRỪ: [GUARD], mặt hoặc trang phục nhân vật chính bị vẽ lại, nhân vật chính chiếm hết khung.`,

  faceLockPrompt: `CÙNG MỘT NGƯỜI, CẢNH KHÁC — MỘT tranh chibi cartoon 2D phẳng. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn; không nền sơn dầu, sương mù hay mờ nhòe. Nhân vật chính, lính và đám đông dùng cùng tỉ lệ 2,5 đầu, bàn tay kiểu găng, độ dày nét và cel-shading phẳng; đám đông là nhiều nhân vật chibi nhỏ, không phải một khối vân texture.

KHÓA KHUÔN MẶT: ảnh tham chiếu chỉ cố định mặt, mắt, mũi, miệng, kiểu tóc, màu tóc, tông da, độ tuổi biểu kiến và tỉ lệ chibi. Trang phục và tư thế theo CẢNH, kể cả khi ảnh tham chiếu đang mặc giáp.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

DÀN CẢNH: cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận; mỗi nhân vật chính khoảng 20–30% chiều cao khung. Chiều sâu nhiều lớp, đường dẫn mắt, tỉ lệ đa dạng, hoạt động thấy được; bất đối xứng hoặc chéo, không xếp hàng căn giữa. Mặt đọc được và không bị cắt.

LOẠI TRỪ: [GUARD], khác mặt, kiểu tóc, độ tuổi hoặc khác người.`,

  multiCharPrompt: `NHIỀU NGƯỜI KHÁC NHAU — MỘT tranh chibi cartoon 2D phẳng. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn; không nền sơn dầu, sương mù hay mờ nhòe. Nhân vật chính, lính và đám đông dùng cùng tỉ lệ 2,5 đầu, bàn tay kiểu găng, độ dày nét và cel-shading phẳng; đám đông là nhiều nhân vật chibi nhỏ, không phải một khối vân texture.

THAM CHIẾU: ảnh 1 = nhân vật được nêu tên đầu tiên, ảnh 2 = nhân vật thứ hai, các ảnh sau theo đúng thứ tự nêu tên. Giữ nguyên mặt, tóc, da, trang phục, giáp, màu sắc và vũ khí của từng người; mỗi nhân vật chính xuất hiện đúng một lần và luôn phân biệt được. Nhân vật phụ dùng trang bị đơn giản, không sao chép nhân vật chính nào.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

DÀN CẢNH: cảnh kể chuyện rộng có môi trường, không bao giờ là chân dung cận; mỗi nhân vật chính khoảng 20–30% chiều cao khung. Chiều sâu nhiều lớp, đường dẫn mắt, tỉ lệ đa dạng, hoạt động thấy được; bất đối xứng hoặc chéo, không xếp hàng căn giữa. Mặt đọc được và không bị cắt. Theo đúng vị trí đặt trong CẢNH và giữ các nhân vật chính tách bạch rõ.

LOẠI TRỪ: [GUARD], nhân vật chính bị nhân bản, soi gương hoặc dính nhau, dùng chung khuôn mặt.`,

  text2img: `MỘT tranh chibi cartoon 2D phẳng về MÔI TRƯỜNG — bối cảnh là chủ thể. [FRAME]

PHONG CÁCH: [STYLE]. Cảnh vật ở xa = các mảng phẳng có viền, tông lạnh hơn.

NHÂN VẬT: chỉ vẽ người, con vật và đồ vật mà CẢNH nêu. Không nêu người → không có bóng người nào. Nhóm được nêu thì giữ nhỏ, làm nền cho môi trường; không bịa ra nhân vật chính.

THẾ GIỚI: quốc gia và thế kỷ mà CẢNH nêu quyết định kiến trúc, trang phục, giáp, vũ khí và đồ vật; hai phe được nêu thì mỗi phe giữ văn hóa riêng; không lấy gì từ nền văn hóa hay thời đại mà CẢNH không nêu.

CẢNH: [SCENE-SPECIFIC PROMPT]

LOẠI TRỪ: [GUARD], chân dung nhân vật, nhân vật khổng lồ ở tiền cảnh.`,

  motionSystem: `Bạn chỉ đạo cách ảnh tĩnh của từng scene trong video lịch sử có thuyết minh chuyển động khi model image-to-video làm nó sống lại. Ảnh tĩnh đã có sẵn; bạn chỉ viết phần chuyển động. Với mỗi scene, viết ba field tiếng Anh ngắn, mỗi field một dòng:

CAMERA — MỘT cú máy có động cơ với đường đi rõ ràng: bắt đầu ở đâu, kết thúc ở đâu, nhịp ra sao. Chọn trong: push-in, pull-back và rise, crane up, tracking alongside, sideways truck, slow orbit, handheld follow. Ví dụ: "Slow push-in from the elephant's tusks up to the howdah." Chỉ dùng máy khoá cố định cho một nhịp tĩnh thân mật (ẩn nấp, nín thở), và khi đó phải nói rõ.

ACTION — nhân vật chính nào đang có trong khung thì làm gì một cách thấy được: mỗi người một hoặc hai hành động rõ ràng, theo thứ tự, động từ mạnh, biên độ thật, gọi tên bộ phận cơ thể ("quay đầu về phía khúc sông, rồi nâng tay phải chỉ về trước"). Một người trong khung thì gọi là "the character"; hai người thì gọi "the character on the left" / "the character on the right" — không bao giờ gọi tên. Chỉ thêm chuyển động tập thể của quần chúng khi nhịp đó có họ. Hành động phải diễn đúng sự kiện của chính nhịp đó (cuộc đổ bộ tràn lên bờ, đám cháy quay ngược về hạm đội, mồi nhử bị vây) — không bao giờ là hành động lấp chỗ như nhìn quanh, gật đầu hay đưa mắt cho nhau khi nhịp có sự kiện thật. Không bao giờ yêu cầu ai đứng yên hoặc giữ nguyên tư thế.

ENV — hai hoặc ba chuyển động môi trường mạnh, lấy từ chính bối cảnh của nhịp đó (nước, sương, bụi, gió lay vải và cờ, ánh sáng, khói bếp, đám đông), ít thứ hơn nhưng chuyển động lớn hơn, nối bằng "then" khi thứ tự quan trọng.

MOTION RULES
- ONE MOVE PER FIELD: một cú máy, đơn hướng — không bao giờ đảo chiều, rung lắc, cắt cảnh, hay bay xuyên/vòng qua/sau một vật; pull-back hay orbit dừng lại trong đúng khung hình mà ảnh tĩnh đã có.
- ONE TAKE: không cắt, không nháy sáng, không đổi cảnh, không đổi thời tiết hay chuyển ngày sang đêm, và không có sự kiện thứ hai sau sự kiện của chính nhịp đó. Clip dài khoảng năm đến tám giây.
- STAGING LOCK: làm chuyển động đúng ảnh tĩnh đó — không ai đổi tư thế, hướng mặt hay vị trí, không ai quay lưng, và vị trí trái/phải của scene hai nhân vật không bao giờ hoán đổi.
- SIMPLE CONTACT: không cử động ngón tay chi tiết, không chuyền đồ giữa người với người, không ôm, không vật lộn, không tiếp xúc vũ khí — model image-to-video biến dạng tay chân đúng ở những chỗ đó.
- FEW BIG MOVES: ưu tiên ít chuyển động lớn hơn nhiều chuyển động nhỏ; đám đông di chuyển như một khối, không bao giờ như từng người được animate riêng.
- FRAME TRUTH: chỉ làm chuyển động những gì nhịp đó đưa vào khung — không thêm người, con vật, vũ khí, đồ vật hay sự kiện mới — và không để xuất hiện thứ mà ảnh tĩnh không có: không chữ, biển hiệu, logo, phụ đề hay bong bóng thoại, và không bao giờ miêu tả âm thanh, giọng nói hay nhạc.
- ENERGY: cảm xúc quyết định năng lượng — tense hoặc dramatic → chuyển động nhanh, mạnh; neutral, hopeful hoặc curious → đều đặn; somber → chậm và nhẹ nhưng vẫn thấy được.
- WORDING: không viết cụm về phong cách, danh tính, chất lượng hay phủ định (không "keep the face", "no text", "high quality") — phần đó được thêm tự động. Không máu me, bạo lực hay thương tích.

NEGATIVE — field mà đọc lên giống bất kỳ điều nào sau đây sẽ animate hỏng: camera đảo chiều hoặc trôi không có đường đi, cắt cảnh hay nháy sáng giữa clip, mặt bị morph, tay chân thừa hoặc dính, người bị nhân bản, hai nhân vật chính đổi bên, đồ vật đổi tay, thời tiết hoặc hướng sáng lật ngược, phụ đề hay chú thích xuất hiện, miêu tả âm thanh bằng lời.

FINAL CHECK: một cú máy không bao giờ đảo chiều; một take liên tục không cắt và không thêm sự kiện; vị trí, hướng mặt và trang phục giữ nguyên; tay không làm việc chi tiết; không có gì thêm trên khung; không miêu tả âm thanh; mỗi field một câu, và camera_vi, action_vi, env_vi là bản dịch tiếng Việt sát nghĩa, tự nhiên của field tương ứng.

OUTPUT — một object JSON duy nhất và không gì khác. Trong giá trị chuỗi, dùng ngoặc kép kiểu typographic (“ ”), không bao giờ dùng dấu ngoặc kép thẳng:
{"scenes": [{"scene": 1, "camera": "...", "action": "...", "env": "...", "camera_vi": "...", "action_vi": "...", "env_vi": "..."}]}
Mỗi scene được yêu cầu một entry, đúng thứ tự đưa vào.`,
};
