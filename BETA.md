# Beta Testing — 4AI v0.1.0-beta

Cảm ơn bạn đã thử bản beta đầu tiên. Tài liệu này là hướng dẫn cài đặt nhanh + nơi gửi feedback,
dành cho đồng nghiệp nội bộ (dev/PM dùng FBO). Tổng quan tính năng xem [README.md](README.md);
danh sách thay đổi xem [CHANGELOG.md](CHANGELOG.md).

## Yêu cầu

- **Node.js 22+** (dự án dùng `node:fs.globSync` — bản Node cũ hơn sẽ lỗi ngay khi chạy).
- **Git**.
- Không cần cài `npm install` gì cả — hub này cố tình **zero dependency**, chạy thẳng bằng Node.

## Cài đặt — cách nhanh (Claude Code)

Không cần clone gì:

```bash
/plugin marketplace add huunguyenit/4AI
```

```bash
/plugin install 4ai@fast-source-4ai
```

Gói đã gồm sẵn skill, agent, command, MCP `4ai-fbo` và CLI. Cập nhật về sau bằng
`/plugin marketplace update`.

## Cài đặt — cách clone (nếu bạn định sửa asset, hoặc dùng Cursor/Antigravity)

```bash
git clone https://github.com/huunguyenit/4AI.git
cd 4AI

node tools/4ai.mjs check   # phải ra "0 errors · 0 warnings"
node tools/4ai.mjs sync    # ghi config vào .claude/, .cursor/, .agents/, .github/
```

Sau `sync`, mở lại Claude Code / Cursor / Antigravity trong thư mục này để nhận skill, rule,
command mới.

## Muốn cập nhật bản mới hơn (rời khỏi beta, quay về nhánh chính)

```bash
git checkout main
git pull
node tools/4ai.mjs sync
```

## Test gì trong đợt beta này

- **Cài bằng plugin** — đây là đường phân phối mới, cần feedback nhất: cài có trôi không, skill
  và command có hiện đủ không, MCP `4ai-fbo` có kết nối được không.

- **Claude Code**: `/fbo-find`, `/pm-status`, `/sync`, và các slash command khác — gõ `/` để xem
  danh sách đầy đủ.
- **Cursor**: rule tự động chạy nền (không lộ connection string, dùng `query_sql` thay vì viết
  SQL tay, `resolve_entities` trước khi sửa Include dùng chung).
- **Report**: thử `node tools/4ai.mjs report <payload>.json` với dữ liệu thật (xem hướng dẫn
  trong README mục "Báo cáo & Template").
- **Antigravity**: mapping ra `.agents/` **chưa verify trên workspace thật** — nếu bạn dùng
  Antigravity, đây là phần cần feedback nhất.

## Biết trước — đừng báo lại các mục này

- Antigravity chưa verify thật (xem trên).
- Chưa có CI tự động chạy `check`/test — nếu bạn sửa asset, tự chạy
  `node tools/4ai.mjs check` trước khi commit.
- Chưa có `package.json`/npm publish — cài bằng git clone là cách chính thức cho bản beta này.

## Gửi feedback

- **Bug hoặc gợi ý nhỏ**: mở issue trên GitHub repo, gắn nhãn `beta`.
- **Vướng khi cài đặt / sync lỗi**: kèm output đầy đủ của `node tools/4ai.mjs check` và
  `node tools/4ai.mjs sync --dry-run` khi báo.
- **Gợi ý skill/rule mới**: mô tả tình huống thực tế gặp phải trước, đừng gửi thẳng asset đã viết
  sẵn — thảo luận qua issue trước khi code (xem mục "Cộng tác" trong README).
