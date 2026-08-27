# Lần file / proc từ UR quá khứ

Dùng **sau** khi đã có UR hit (Pattern Tra cứu QLYC) và user hỏi nguồn triển khai.

## Chọn điểm vào

| Có trong UR | Bắt đầu từ |
|-------------|------------|
| `dir_src_web` | Root project đó |
| Chỉ `ma_da` | Suy path CustomerPro quen thuộc; xác nhận bằng Glob/list folder |
| Không có path | Hỏi user hoặc search theo tên chức năng trong workspace liên quan |

Placeholder: `{project_root}` = `dir_src_web` (thường kết thúc bằng `\` app FBO).

---

## Pattern A — Controller chức năng Report / tạo tự động

Chức năng kiểu “menu tạo tự động / batch từ danh sách” thường là **ReportExtender**:

| Thành phần | Vị trí gợi ý |
|------------|--------------|
| Trang | `{project_root}/Main/{controller}.aspx` |
| Filter lọc | `App_Data/Controllers/Filter/{controller}.xml` (+ `.f`) |
| Grid chọn + toolbar | `App_Data/Controllers/Grid/{controller}.xml` (+ `.f`) |
| Form xác nhận | `Filter/{controller}Confirm.xml` hoặc `showForm('…')` trong Grid |

Cách tìm tên `{controller}`:

1. `find_controller(program, query='{keyword}')` — chỉ mục **không dấu**, gõ `taoPNA`, `AutoCreate`
   hay từ khoá nghiệp vụ đều ra. Chưa index thì `index_program` một lần trước.
2. `search_content(program, query='exec zc_', in='sql')` — tìm chỗ gọi proc customize
3. `describe_controller` — đọc title / field khớp mô tả UR

Trang `.aspx` nằm ngoài chỉ mục controller → phần đó mới dùng Glob dưới `{project_root}/Main`.

---

## Pattern B — Proc DB

| Bước | Tool / hành động |
|------|------------------|
| 1 | Từ XML: lấy tên proc trong `Loading` / `Inserting` / `response` |
| 2 | `query_sql(program, object='{proc}')` → định nghĩa proc |
| 3 | `query_sql(program, sql=...)` trên `sys.objects` / `definition LIKE '%{proc}%'` → tìm proc phụ |

Tham số định danh là **`program`** (đường dẫn program hoặc mã dự án `nbdmda.ma_da`), không phải
`file_path`. Kết nối tự phân giải từ `Web.config` của chính program đó.

Không Deploy / không ALTER proc trừ khi user yêu cầu rõ — `query_sql` chặn câu ghi trừ khi truyền
`allowWrite: true`, và hàng rào đó có chủ đích.

---

## Pattern C — Đồ thị năng lực (khi cần nhìn rộng hơn một program)

Không có MCP tool đồ thị. Đồ thị của hub là **đồ thị năng lực FBO + mạng rà soát Request**:
nguồn thật là các file JSONL, chỉ mục là SQL Server graph, dựng bằng

```bash
node tools/4ai.mjs graph build
```

Cách đọc và bảo trì nó: skill `pm-graph-maintain`. Nó trả lời câu hỏi kiểu "năng lực này đã làm ở
những dự án nào", **không** thay `find_controller` / `search_content` cho câu hỏi trong một program.

Chưa dựng hoặc dựng lỗi → quay về Pattern A/B, đó vẫn là đường chính.

---

## Output lần nguồn

Liệt kê ngắn:

1. **Files** — path UNC hoặc relative từ `{project_root}`
2. **Procs** — tên + DB app (nếu biết)
3. **Luồng** — 1–3 bullet: Filter → Grid → Confirm → proc tạo
4. **Bảng nguồn/đích** (nếu đọc được từ proc: `m**` / `d**`, `ma_ct`) — không đoán cột; MCP check khi cần sửa

---

## Ví dụ tham chiếu

- UR LIMEXCO PTR-02 → `zc_taoPNA` (aspx + Filter/Grid/Confirm) + proc `zc_AutoCreatePNALoading` / `zc_AutoCreatePNAProcess`; nguồn `m96`, đích PNA `m71`/`d71`.
- Chỉ để minh họa mapping UR → file; skill không gắn riêng LIMEXCO.
