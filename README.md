# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Dịch vụ phụ trợ (repo riêng, tuỳ chọn)

Scene Studio chạy được mà không cần các repo dưới đây. Mỗi repo chỉ cần khi dùng đúng tính năng tương ứng. Clone chúng ngang hàng với `scene-studio` (hoặc đặt biến `*_DIR` trong `.env`), mỗi repo tự tạo Python venv riêng trên hệ điều hành đang dùng. Panel có nút bật/tắt từng dịch vụ.

| Repo | Dùng cho | Biến `.env` | Mặc định |
| --- | --- | --- | --- |
| [omnivoice-tool](https://github.com/thanhng8/omnivoice-tool) | Giọng đọc narration (`audio: omnivoice`) | `OMNIVOICE_DIR` | `../omnivoice-tool` |
| [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) | Giọng đọc narration (`audio: vieneu`) | `VIENEU_DIR`, `VIENEU_URL` | `../VieNeu-TTS` |
| museapivn (`git@github.com:fviet297/museapivn.git`, cần quyền truy cập) | Ảnh/video qua muse.ai (`muse:muse-image`) | `MUSE2API_DIR`, `MUSE2API_BASE_URL`, `MUSE2API_KEY` | `../museapivn` |

Cài tự động, hỏi từng dịch vụ (trả lời `y` để cài, mặc định bỏ qua):

```console
npm run setup:services                          # hỏi từng dịch vụ
npm run setup:services -- --list                # xem trạng thái
npm run setup:services -- --only omnivoice      # chỉ cài một dịch vụ
npm run setup:services -- --yes                 # cài hết, không hỏi
```

Script clone repo vào thư mục `*_DIR` rồi tạo venv. VieNeu-TTS chỉ clone, runtime phải dựng tay theo README của nó.

**Không cài OmniVoice/VieNeu?** Dùng ElevenLabs: bấm nút **Model** trên panel → **ElevenLabs** → nhập API key (hoặc `ELEVENLABS_API_KEY` trong `.env`), rồi chọn nguồn audio **ElevenLabs** và một giọng trong dự án. Model mặc định `eleven_multilingual_v2` (có tiếng Việt), đổi được ở cùng form.

Không có các repo này, vẫn tạo ảnh bằng Replicate / Meta / OpenAI-compatible và tạo motion bằng Replicate / Plenx. Chỉ phần giọng đọc cần ít nhất một trong OmniVoice hoặc VieNeu.

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).


