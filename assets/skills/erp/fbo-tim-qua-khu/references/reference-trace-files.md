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

1. Glob `**/*{keyword}*` dưới `Controllers` / `Main` (vd `taoPNA`, `AutoCreate`, từ khóa nghiệp vụ ASCII)
2. Grep `exec zc_` / `exec rs_` trong Filter/Grid vừa tìm
3. Đọc title XML khớp mô tả UR

---

## Pattern B — Proc DB

| Bước | Tool / hành động |
|------|------------------|
| 1 | Từ XML: lấy tên proc trong `Loading` / `Inserting` / `response` |
| 2 | MCP `query_sql { program, object }` → object definition |
| 3 | `query_type=1`: `sys.objects` / `definition LIKE '%{proc}%'` tìm proc phụ |

`file_path` **bắt buộc absolute** tới file trong đúng project (Web.config resolve connection).

Không Deploy / không ALTER proc trừ khi user yêu cầu rõ.

---

## Pattern C — FBOGraph / Radar (nếu cần)

Khi MCP `query_radar` báo Kuzu / FBOGraph chưa build:

1. Chạy `build_cmd` từ JSON — **dùng `cmd /c`**, `working_directory` local (`C:\Users\Windows 10`), không cwd UNC; build ~7–10 phút, poll đến `exit_code: 0`
2. Gọi lại `query_radar` với `reference_file` absolute trong project đó
3. Chỉ dùng 11 template Cypher chuẩn trong User Rule; query ASCII không dấu ưu tiên

Nếu build lâu / fail → fallback Glob + Grep + `query_sql` (Pattern A/B).

**Thuật ngữ:** FBOGraph = đồ thị XML FBO; Radar = MCP tool `query_radar`. Không dùng tên CodeGraph.

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
