---
id: pm-status
title: /pm-status
kind: command
domain: project-mgmt
description: Tóm tắt ledger — việc gì đang ở trạng thái nào, theo khách; nêu entry ứ đọng và entry Xong còn thiếu changelog.
argument-hint: "[mã khách — bỏ trống để xem tất cả]"
mode: ask
version: 1
---

## Việc cần làm

Tóm tắt tình hình: **$ARGUMENTS**

1. Đọc `ledger/tasks.md` (và `ledger/CHANGELOG.md` để đối chiếu). Có mã khách trong tham
   số thì lọc theo khách đó.
2. Trình bày:

       ### Đang chạy
       | Khách | Việc | Trạng thái | Ngày mở |

       ### Cần chú ý
       - entry `Chờ xác nhận` quá 7 ngày
       - entry `Xong` nhưng CHƯA có dòng CHANGELOG (vi phạm pm-ledger-discipline)
       - entry `Đang làm` quá 14 ngày

       ### Đã xong gần đây
       <5 dòng changelog mới nhất>

3. Không có gì ở mục nào thì ghi "Không có" — ngắn gọn, đây là lệnh đọc nhanh.
