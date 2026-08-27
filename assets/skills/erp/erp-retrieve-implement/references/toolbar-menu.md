# Tầng 1 — khai nút Retrieve trên toolbar

Ba khai báo mẫu (một nguồn, hai nguồn, ba nguồn) nằm ở mục *Vùng đối chiếu* trong SKILL —
chép từ đó. File này là phần luật và bẫy.

Nút nằm trong `toolbar` của `Grid\{SysID}Detail.xml`, hoặc trong một file
`Include\XML\*Retrieve*.txt` mà `Detail` nhúng vào. `{SysID}` là định danh controller trong
`wcommand`, không phải mã chứng từ trong `dmct.ma_ct` — `Grid\SVDetail` là màn hình của
`SVTran` (mã ct `HDA`).

## Hai dạng

| | `<title>` | Nhãn nguồn ở đâu | `e.type.Value` khi bấm |
|---|---|---|---|
| **Một nguồn** | Nhãn thật + `$$<px>` | Không có `menuItems` | **Rỗng** |
| **Nhiều nguồn** | Token `Toolbar.Retrieve` | `menuItem/header` | `commandArgument` được bấm |

`$$90` là **độ rộng nút tính bằng pixel**, không phải một phần của nhãn. Bản tiếng Anh
thường rộng hơn bản tiếng Việt (`$$120` vs `$$90`) vì chuỗi dài hơn. Đổi nhãn mà quên nới
số này thì chữ bị cắt.

## Quy ước `commandArgument`

- Bước nhảy **10**, bắt đầu từ `10`. Không dùng `1, 2, 3`.
- **Separator ăn một số.** `header` bằng `-` là gạch phân cách; nó vẫn là một `menuItem` và
  vẫn chiếm `commandArgument` của nó. Trong mẫu hai nguồn, `20` là gạch — nguồn thứ hai là
  `30`, không phải `20`. Mẫu ba nguồn: `10`, `30`, `50`, gạch ở `20` và `40`.
- Số là **string** trong XML và cũng là string khi so trong JS: `case '30'`, không `case 30`.
- Thêm nguồn mới thì **nối vào cuối**, đừng chèn giữa. Chèn giữa nghĩa là đánh số lại, và
  mọi bản customize của khách đang bám vào số cũ sẽ lệch.

## `urlImage`

Đường dẫn tương đối tới `../images/Menu/`. Không bắt buộc — `menuItem` không có ảnh vẫn chạy,
chỉ là menu trông không đều. Ảnh phải **đã tồn tại** trong thư mục đó; khai một tên ảnh chưa
có thì menu vẫn mở nhưng ô ảnh trống, không có lỗi nào báo ra.

## Thêm nguồn cho riêng một khách

Mẫu chuẩn là `SeparateInvoice.SVDetailRetrieveToolbar.txt`: **một file Include mới**, khai lại
cả nút với đủ số nguồn, thay vì sửa file Include gốc. Cách này giữ file chuẩn nguyên vẹn và
để diff của khách gọn trong một file.

## Trước khi sửa một file Include có sẵn

`Include\XML\*Retrieve*.txt` có thể đang được nhiều controller dùng chung. **Bắt buộc** đo
trước, nêu `usedBy.total`, và xin duyệt riêng:

```
list_related { program, path: "Include\\XML\\SVDetailRetrieve.txt", kind: "used_by" }
```

Chỉ một controller dùng thì sửa thẳng. Nhiều hơn một thì tách file Include riêng theo mẫu
`SeparateInvoice.*` ở trên, đừng sửa file dùng chung.

## Encoding

Các file `Include\XML\*.txt` này thường là **UTF-8 có BOM + CRLF**. `read_source` báo lại
charset/BOM/newline gốc — ghi lại phải giữ y hệt. Không bao giờ normalize sang UTF-8 LF.

## Khi chương trình chưa có bản customize

`Grid\{SysID}Detail.f` mã hoá, không đọc được, và bản `.xml` cạnh nó có thể chưa tồn tại.
Đừng suy đoán nội dung `.f`, cũng đừng tạo `.xml` rỗng để "xem thử" — dựng bản customize đầu
tiên thì chép khai báo từ *Vùng đối chiếu* rồi đối chiếu với hành vi thật trên màn hình.
