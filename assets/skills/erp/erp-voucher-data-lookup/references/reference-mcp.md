# MCP `4ai-fbo` — đọc trước, hỏi user sau

## Nguyên tắc

1. **Luôn gọi MCP** để lấy thông tin object liên quan **trước khi code** hoặc **trước khi hỏi user**.
2. **Chỉ hỏi user** khi MCP không trả được (chưa index, lỗi kết nối, file ngoài program) hoặc câu
   hỏi thuần nghiệp vụ chưa ghi trong hệ thống.
3. **Không đoán** tên bảng, cột, entity, tham số proc — xác nhận bằng MCP.

**Mọi tool đều nhận `program`**, không nhận `file_path`. `program` là đường dẫn program hoặc mã dự
án `nbdmda.ma_da` — tra bằng `list_programs`. Kết nối DB tự phân giải từ `Web.config` của chính
program đó; không phải khai gì trước. Kỷ luật chung: skill `erp-mcp-lookup`.

---

## `query_sql`

| Tham số | Dùng khi |
|---|---|
| `object` | Soi nhanh cấu trúc **table/view** hoặc định nghĩa **proc/function** — trả sẵn cột, kiểu, khóa |
| `sql` | Câu tự viết (cột lẻ, index, dữ liệu mẫu). Nhớ `TOP` |
| `db` | `app` (mặc định) hoặc `sys` |
| `entity` | Program nhiều entity — bắt buộc khi tool báo liệt kê mã rồi dừng |
| `maxRows` | Mặc định 50, trần 1000 |
| `allowWrite` | **Mặc định false.** Câu ghi (INSERT/UPDATE/DELETE/DDL/EXEC) bị chặn cho tới khi bật |

```
query_sql(program='{program}', object='ctbbkt')
query_sql(program='{program}', object='fsd_FastBusiness$Voucher$BeforeAfterUpdate$PQBTranFromDMSTran')
query_sql(program='{program}', sql='select top 20 * from fsdSttRecRef where ma_ct = ...')
```

`object` thay cho việc tự viết câu tra `sys.columns` — dùng nó trước, `sql` chỉ khi `object` không đủ.

**Không bao giờ** đọc, trích, log hay echo connection string. `query_sql` tự lo phần đó và redact
mọi shape connection string trước khi trả ra.

---

## `resolve_entities`

Liệt kê DTD entity của một controller: tên, đường dẫn SYSTEM, file thật đã phân giải, có được dùng
thật trong body không, và **số controller khác cùng dùng file đó**.

| Tham số | Mô tả |
|---|---|
| `program` | Bắt buộc |
| `path` | rel_path controller, ví dụ `Dir\PQBTran.xml` |
| `name` | Chỉ một entity; **bỏ trống để lấy tất cả** |
| `includeContent` | `true` — kèm nội dung file include (mặc định `false`) |

**Dùng khi:**

- Thắc mắc entity nào chứa SQL/JS gì (`BeforeVoucherEdit`, `UpdatefsdSttRecRef`,
  `CommandWhenVoucherBeforeEdit`…) — gọi kèm `includeContent: true`
- Cần copy/mở rộng block entity từ mẫu (`PQBTran.xml`, `PQBDMSFilter.xml`) mà không đọc cả file dài
- Kiểm event `Updating` / `Inserting` đã gọi entity nào

**Trước khi sửa một file trong `Include\`**: đọc cột số controller cùng dùng, hoặc gọi
`list_related(kind='used_by')`. Sửa include là thay đổi toàn hệ thống, không phải sửa một màn hình.

**Không** đoán nội dung entity mã hoá — SQL trong `.f` là `<Encrypted>`; MCP không giải mã được thì
hỏi user hoặc đọc bản customize `.xml` tương ứng.

---

## Tool còn lại hay dùng trong luồng này

| Tool | Việc |
|---|---|
| `find_controller` | Từ tên nghiệp vụ / mã ra rel_path. Tìm trên chỉ mục **không dấu** |
| `describe_controller` | Field kèm nhãn V/E, lookup, command, entity, trạng thái cặp `.f`/`.xml` |
| `list_related` | `companion` (cùng mã ở Dir/Grid/Filter), `lookup`, `include`, `used_by` |
| `search_content` | `in='sql'` / `'js'` / `'xml'` — "controller nào đụng bảng X", "chỗ nào gọi hàm Y" |
| `read_source` | Đọc file, **báo lại encoding/BOM/newline gốc** để lần ghi sau giữ nguyên |
| `resolve_vouchercode` | Mã chứng từ ↔ sysid controller, hai chiều |

Không có tool nào sinh field XML hay sinh DDL. Thêm cột đi đường đặc tả `ddl`
(`tools/lib/ddl.mjs`, `kind: "them-cot"`) hoặc proc `fsd_addFields` — xem skill `erp-table-propose`.

---

## Thứ tự MCP — luồng lấy dữ liệu CT→CT

```
1. find_controller        — chưa biết rel_path của mẫu / đích
2. resolve_entities       — mẫu *DMS* + *Tran* nguồn/đích (bỏ `name` để lấy tất cả)
3. query_sql object=…     — bảng ct**, ph**, d**$, m**$, c**$, fsdSttRecRef
4. query_sql object=…     — proc BeforeAfterUpdate mẫu (PQB…)
5. describe_controller    — field/nhãn của controller đích khi chưa rõ convention
6. Code XML/SQL
7. Hỏi user               — chỉ phần nghiệp vụ MCP/XML không trả lời được
```

---

## Thứ tự MCP — viết/sửa proc SQL

```
1. query_sql object=<bảng>  — bảng dùng trong proc
2. query_sql object=<proc>  — proc cùng loại đã deploy (nếu có)
3. resolve_entities         — *Tran.xml: tham số exec proc, tên @Dtable/@Mtable
4. Viết SQL theo rule `erp-sql-style`; tra hàm/proc có sẵn ở `erp-sql-reference` trước khi viết mới
5. Ghi .sql ra D:\Fast Script\{TenDuAn}\{App|Sys}, giao người duyệt — KHÔNG tự chạy
```

---

## Anti-pattern

```
❌  Hỏi user tên bảng/cột khi chưa query_sql
❌  Truyền file_path thay vì program (tham số đó không tồn tại)
❌  Dùng query_sql với type=0/1/2 (không có tham số `type`; dùng `object` hoặc `sql`)
❌  fsd_addFields khi query_sql đã thấy cột
❌  Đoán nội dung ENTITY thay vì resolve_entities
❌  Sửa file trong Include\ mà chưa đo used_by
❌  Copy proc từ file .sql cũ không kiểm tra lại định nghĩa trên DB đích
❌  Coi kết quả rỗng là bằng chứng không tồn tại — có thể chỉ là chưa index_program
```
