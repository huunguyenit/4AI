---
id: pm-adr
title: ADR — when and how
kind: skill
domain: project-mgmt
description: Khi nào một quyết định đáng viết ADR và template — theo convention ADR của DevWorkFlow để hai project đọc giống nhau.
version: 1
---

## Vì sao

Quyết định không ghi lại sẽ bị hỏi lại — và trả lời khác — sau ba tháng. ADR rẻ: một file,
một lần viết. Convention lấy theo `DevWorkFlow/docs/adr/` (ADR-0001…0009) để người đọc
hai repo không phải học hai format.

## Khi nào viết

Viết khi quyết định (1) khó đảo ngược, (2) ảnh hưởng nhiều hơn một task, hoặc (3) đã gây
tranh luận và sẽ bị hỏi lại. Ví dụ: "customize đặt ở controller riêng thay vì include chung",
"khách X không nâng SP trong năm nay". KHÔNG viết ADR cho lựa chọn hiển nhiên hoặc dễ đổi.

## Đặt ở đâu — phân biệt phạm vi TRƯỚC khi viết

`ledger/` của hub bị gitignore toàn bộ (dữ liệu rà soát khách — không bao giờ commit). Một ADR
về quyết định của chính hub 4AI (kiến trúc compiler, lược đồ đồ thị, quy ước code) mà đặt trong
`ledger/adr/` sẽ **không bao giờ được commit**, im lặng biến mất khỏi git — đã xảy ra thật với
ADR-0001, phải dọn lại sau khi phát hiện lúc chuẩn bị commit.

- **ADR về chính hub 4AI** (không nhắc tên khách nào) → `docs/adr/ADR-<số>-<slug>.md`. Thư mục
  `docs/` được commit bình thường — đúng ý "quyết định phải sống lâu hơn phiên làm việc".
- **ADR về MỘT khách cụ thể** (vd "ACME không nâng SP năm nay") → giữ nguyên
  `ledger/adr/ADR-<số>-<slug>.md`, CỐ Ý gitignore — tên khách và quyết định riêng của họ không
  được lên một repo public.

Hai dãy số ADR-000x là ĐỘC LẬP theo từng thư mục — không dùng chung một bộ đếm.

## Template

Nội dung giống nhau dù đặt ở đâu:

    # ADR-0001: <Tiêu đề quyết định>

    - Trạng thái: Đề xuất | Chấp nhận | Thay thế bởi ADR-XXXX
    - Ngày: YYYY-MM-DD
    - Khách/Phạm vi: <ACME | toàn bộ | hub 4AI>

    ## Bối cảnh
    <Vấn đề gì buộc phải quyết định. 3-6 câu.>

    ## Quyết định
    <Một đoạn, thì khẳng định: "Chúng tôi sẽ …">

    ## Hệ quả
    <Được gì, mất gì, ràng buộc gì phát sinh.>

Số ADR tăng dần, không tái sử dụng. Đổi ý → viết ADR mới thay thế, đánh dấu ADR cũ
`Thay thế bởi`, không sửa nội dung cũ.

## Bẫy

- ADR không phải tài liệu thiết kế — không dán spec dài vào. Một trang là đủ; chi tiết
  để link.
