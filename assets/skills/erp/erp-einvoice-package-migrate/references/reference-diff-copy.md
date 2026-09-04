# Diff → phân loại → sao chép

## 0. Lấy `.xml` gốc từ SourceCollection — trước mọi chỉnh sửa

Kho `.xml` chuẩn theo phiên bản nằm ở `\\172.168.5.14\SourceCollection\FBO-FBI\<version>\App_Data\Controllers\{Dir,Grid,Filter,Report,Lookup,Query,Templates}`.
Toàn bộ file ở đó đuôi `.xml`, **không có `.f`**.

Thứ tự bắt buộc khi cần sửa một controller:

1. Copy `.xml` gốc từ SourceCollection **theo đúng phiên bản của program ĐÍCH** vào program đích
2. Rồi mới merge nội dung sửa vào bản `.xml` đó
3. Không bao giờ sửa `.f`, không bao giờ tự dựng `.xml` từ `.f`

Dự án tham khảo cũng vậy: **chưa có `.xml`** thì lấy `.xml` gốc từ SourceCollection **theo
phiên bản của chính dự án tham khảo**, không đọc `.f` của khách.

Lý do là kỹ thuật, không phải quy trình: `.f` trong program khách bị **mã hóa**. Ví dụ
`<program nguồn>\App_Data\Controllers\Grid\EIReleasedInvoice.f` (30.940 B) có `clientScript` và
ENTITY dạng `<Encrypted>…</Encrypted>`; bản `FBOR2SP24.2.2\…\Grid\EIReleasedInvoice.xml`
(50.139 B) là plaintext đọc được. Merge từ `.f` về mặt vật lý không làm được.

### Entity include — chép file controller chưa phải là xong

Case thật gặp khi chạy: đã gen đủ `Dir` / `Grid` / `Filter`, mở lên vẫn hỏng, vì trong DOCTYPE
của chúng có entity trỏ sang `..\Include\…` mà **dự án cũ chưa có file đó**. Include không
suy được từ tên controller — phải hỏi chính file.

Sau khi chép file controller vào program đích, với **từng file vừa chép**:

```
index_program    { program: "<program đích>" }          # một lần cho mỗi program
resolve_entities { program: "<program đích>", path: "Grid\\RITran.xml" }
```

Đọc kết quả theo đúng hai cột này:

| `systemPath` | `exists` | Nghĩa |
|---|---|---|
| có | `true` | include đã có ở đích — **không đè**, xem `sharedByControllers` trước khi nghĩ tới sửa |
| có | `false` | **thiếu thật** — mang file include từ nguồn sang, giữ nguyên đường dẫn tương đối |
| `null` | `false` | entity khai **inline** ngay trong DOCTYPE, không phải file. Bỏ qua |

Bẫy nằm ở dòng cuối: một controller bình thường có cả chục entity `exists: false` mà
`systemPath: null` — `Controller`, `CreateTicket`, `QueryID`, `FastBusiness.Encryption.Begin`…
Đuổi theo chúng là đuổi theo file không tồn tại. **Chỉ `systemPath` khác `null` mới tính.**

**Phải lặp cho tới khi đóng.** File `.ent` tự khai SYSTEM tiếp: `Unit.ent` có 48 dòng,
`Filter.ent` 2 dòng, `ResetCustInfo.ent` 1 dòng. Chép xong một `.ent` thì quét chính nó rồi
chép tiếp lớp sau, tới khi không còn `exists: false` nào có `systemPath`.

Số thật của một lần chạy: 6 file controller (`Dir\RITran`, `Grid\RITran`,
`Grid\rptEInvoiceUnPost`, `Grid\rptEInvoiceStatusCheckPacket`,
`Dir\BusinessUnitUsingCircular`, `Grid\rptEIInvoiceCancelReport`) tham chiếu **55**
include cấp 1, trong đó **3** thiếu ở program đích — và đệ quy một lớp nữa thành **4**:

```
Include\CheckTaxCode.ent
Include\Command\EIEditCheckTableRITran.txt
Include\ResetCustInfo.ent
Include\ResetCustInfo.txt      ← chỉ lộ ra sau khi quét ResetCustInfo.ent
```

Hai lưu ý khi chạy tool:

- `resolve_entities` trên file `.f` **mã hóa** trả `count: 0`. Đó không phải "không phụ thuộc"
  — chạy trên bản `.xml` gốc SourceCollection hoặc trên file đã chép vào đích.
- Include **thiếu hẳn** ở đích thì chép thẳng: không có customize nào để mất. Include **đã có**
  ở đích thì thuộc DO_NOT_TOUCH — nó có thể đã vá theo khách, và `sharedByControllers` cho
  biết đè lên sẽ kéo theo bao nhiêu controller khác.

---
### Tên thư mục version — chốt với user, không suy từ chuỗi

`ma_pbsp` và tên thư mục share **không cùng cách viết**:

| `ma_pbsp` | Thư mục SourceCollection |
|---|---|
| `FBISP2422` | `FBOR2SP24.2.2` |
| `FBOR2SP223` | `FBOR2SP22.3` (**không** phải `FBOR2SP23`) |

Chỗ này đã có người nhầm: trong `FBOR2SP23` có sẵn một file tên
`PHIEN BAN SP23 KHONG PHAI SP223.txt`. Nhắc lại đường dẫn thư mục cho user xác nhận trước
khi chép.

### Mỗi thư mục version là một pack rời, không phải bộ đủ

`FBOR2SP24.2.2` có `Dir` 159 file trong khi program thật có hơn 500. Các version khác cùng
cỡ: `FBOR2SP24.2` 116, `FBOR2SP24.1` 138, `FBOR2SP24.2.1` 176. Nên file cần lấy **thường
không nằm ở thư mục version đích**.

Khi thiếu, dò theo thứ tự:

1. Thư mục version đích
2. Dò ngang toàn share, **không phân biệt hoa thường** — cùng một controller đang là
   `Filter\rptEInvoiceUnpost.xml` và `Grid\rptEInvoiceUnPost.xml`
3. Chọn version **cao nhất còn ≤ mức tương thích của khách đích**; vượt mức thì hỏi user
4. Không có ở đâu trong share → **mang thẳng file `.f`** từ program nguồn sang đích, giữ
   nguyên tên `.f`, không đổi đuôi

Ví dụ thật khi soi 10 controller còn thiếu ở một khách FBO R2SP223: `RITran` chỉ có từ `FBOR2SP22.5.5`,
`rptEInvoiceUnPost` từ `FBOR2SP22.6.4`, `rptEInvoiceStatusCheckPacket` từ `FBOR2SP22.9`,
`BusinessUnitUsingCircular` từ `FBOR2SP24.1`; còn `EITranPacket` và `UseSpecificGoodType`
không có ở bất kỳ version nào.

Hai cái cuối rơi vào nhánh 4: chép `Dir\EITranPacket.f`, `Grid\EITranPacket.f`… thẳng
từ program nguồn. Chép `.f` là chép bản chuẩn, hợp lệ — nhưng `.f` mã hóa nên **không merge
sửa vào được**. UR có yêu cầu chỉnh chính controller đó thì dừng lại hỏi path gói, đừng chép
rồi mới phát hiện không sửa được.

---

## 1. Thu thập metadata

Với mỗi file khớp inventory, ghi:

| Cột | Nguồn | Đích |
|-----|-------|------|
| relative_path | có / không | có / không |
| length | bytes | bytes |
| last_write | time | time |
| note | — | customize? (đích có `.xml` cạnh `.f`, hoặc nội dung lệch stock) |

Cách lấy: liệt kê path (Glob) + so size/date.  
Với **MERGE_REVIEW** text (command, js, css, aspx): đọc hai phía và tóm tắt diff ý (không dump cả file vào chat).

## 2. Bảng báo cáo bắt buộc trước khi chép

```markdown
| relative_path | nguồn | đích | size/date | nhãn | đề xuất |
|---------------|-------|------|-----------|------|---------|
| AppHandler/EInvoiceXML.ashx | có | thiếu | … | SAFE_COPY | chép mới |
| AppService/….Service.asmx | có | có | nguồn mới hơn | SAFE_COPY | ghi đè (+bak) |
| Include/Command/….txt | có | có | khác nội dung | MERGE_REVIEW | chờ duyệt |
| Dir/SVTran.xml | — | có customize | — | DO_NOT_TOUCH | bỏ |
```

Tóm tắt đầu bảng: số SAFE_COPY / MERGE_REVIEW / DO_NOT_TOUCH / ASK_USER.

## 3. Quy tắc nhãn (nhắc lại)

- **Thiếu ở đích + thuộc Handler/Service/aspx HDDT** → SAFE_COPY  
- **Có ở cả hai + binary/runtime ashx/asmx** và nguồn mới hơn (date/size) → SAFE_COPY sau backup  
- **Command / WCommand / JS / CSS khác nội dung** → MERGE_REVIEW  
- **Controller XML / Include đã customize** → DO_NOT_TOUCH  
- **DLL / web.config / Options Service / path ngoài inventory** → ASK_USER  

## 4. Sao chép (chỉ sau duyệt)

1. Tạo backup đích nếu file đã tồn tại.  
2. Copy **từng file** (hoặc từng nhóm đã duyệt), giữ relative path trong program.  
3. Không xóa file chỉ có ở đích trừ khi user yêu cầu.  
4. Sau copy: xác nhận tồn tại + size khớp nguồn.

Ví dụ PowerShell (agent chạy sau khi user duyệt danh sách `$files`):

```powershell
# $src, $dst = program root nguồn / đích
# $rel = 'AppHandler\EInvoiceXML.ashx'
$from = Join-Path $src $rel
$to = Join-Path $dst $rel
$dir = Split-Path $to -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
if (Test-Path $to) {
  Copy-Item $to "$to.bak-$(Get-Date -Format 'yyyyMMdd')" -Force
}
Copy-Item $from $to -Force
```

**Cấm:** `Copy-Item $src\* $dst -Recurse` toàn program; cấm xóa `.bak` tự ý.

## 5. Verify tối thiểu

- [ ] Mọi path SAFE_COPY đã có trên đích  
- [ ] Không đụng file DO_NOT_TOUCH  
- [ ] MERGE_REVIEW: hoặc đã chép theo duyệt, hoặc ghi “giữ đích” + lý do vào ledger  
- [ ] Mọi controller đã sửa đều bắt đầu từ `.xml` gốc SourceCollection, không phải từ `.f`  
- [ ] `resolve_entities` trên từng file đã chép: không còn entity nào `systemPath` khác `null` mà `exists: false`  
- [ ] Dòng `wcommand` còn thiếu đã INSERT (trừ `EIRelease…`); mở menu HDDT thấy đủ chức năng  
- [ ] Bảng / proc / function / options thiếu đã mang qua, kể cả callee của proc  
- [ ] Controller lòi ra từ proc `rs_*` và từ options đã đưa vào lô chép  
- [ ] Ghi chú IIS / recycle app pool nếu đụng dll/ashx (nhắc user — agent không tự recycle production)

## 6. Menu `wcommand` — lô chép chưa xong nếu thiếu bước này

File chép xong mà không có dòng menu thì khách không thấy chức năng. Đối chiếu hai phía trên
db `sys` của từng program:

```sql
select wmenu_id, bar, link, status from wcommand
where wmenu_id >= '11.12.20' and wmenu_id <= '11.12.64'
order by wmenu_id
```

- Dòng chỉ có ở nguồn → INSERT vào đích, **trừ ba dòng `EIRelease…`** (11.12.49 / 11.12.51 /
  11.12.52 — xem `reference-inventory.md`)
- Giữ nguyên `wmenu_id`, `link`, `type`; `status` theo đúng nguồn
- Dòng phân cách (`bar = '-'`, `link = '.'`) cũng phải chép, không thì menu vỡ nhóm
- Chép dòng menu mà chưa chép aspx tương ứng là tạo link chết — chép file trước, menu sau
- SQL này là **khai báo menu của chính gói**, khác với deploy `dmhddtbs`/payload (thuộc
  `erp-einvoice-customize`). Vẫn phải trình câu lệnh cho user duyệt trước khi chạy.

Trạng thái khách FBO R2SP223 lúc khảo sát: `wcommand` 1.359 dòng, **0 dòng** trong khoảng trên và 0
dòng `link like '%hddt%'` — toàn bộ 28 dòng menu phải INSERT mới.

---

## 7. Bề mặt backend — bảng, proc, function, options

Gói HDDT không chỉ là file. Quét **db app của cả hai program** rồi so danh sách; phần thiếu ở
đích vừa là hiện vật phải mang qua, vừa là đầu mối lòi ra thêm controller phải chép.

### 7.1 Ba câu quét

```sql
-- bảng + view
select name, type_desc from sys.objects
where type in ('U','V') and name like '%hddt%' and name not like '%[$]%'

-- proc + function
select name, type_desc from sys.objects
where type in ('P','FN','TF','IF') and (name like '%EInvoice%' or name like '%hddt%')

-- tùy chọn nghiệp vụ
select name, val from options where name like '%hddt%'
```

**`name not like '%[$]%'` là bắt buộc.** Bảng phân mảnh theo kỳ (`hddt01$202603`,
`hddt02$000000`, `m81$000000`) sinh theo dữ liệu khách chứ không phải hiện vật gói — bỏ
chúng thì một chương trình đủ bộ rơi từ **192** dòng xuống **61**. Chép chúng là chép dữ liệu
của khách khác.

Số thật một lần đối chiếu: object nguồn 61 / đích 45 → **thiếu 20** (10 bảng-view: `hddt02`,
`hddt04`, `hddt05`, `hddt05ct`, `hddt01ct`, `dmhddtcontrollers`, `dmloaisdhddt`,
`hddtfieldsmap`, `kthddt`, `vhddt05` · 10 proc). Options nguồn 26 / đích 10 → **thiếu 16**.

### 7.2 Proc kéo theo proc và function

Mang một proc qua chưa đủ — phải mang cả thứ nó gọi:

```sql
select distinct referenced_entity_name
from sys.sql_expression_dependencies
where referencing_id = object_id('rs_rptEInvoiceUnPost')
```

Kết quả thật: 9 tham chiếu (`dmkh`, `hddtfields`, `reports`, `ff_PadL`,
`FastBusiness$Partition$Execute`, ba `FastBusiness$Function$System$Get*`, và một bảng phân
mảnh). Đối chiếu sang đích: có 8, **thiếu đúng một** —
`FastBusiness$Function$System$GetInvoiceFilter`. Không mang nó qua thì proc chạy là lỗi.

Lặp cho từng proc thiếu, và lặp tiếp nếu callee lại gọi callee khác.

### 7.3 Từ proc ra thêm controller

Proc `rs_<Stem>` là nguồn dữ liệu của controller cùng `<Stem>` — kiểm chứng bằng
`find_controller`, đừng suy suông. Danh sách proc thiếu vì thế lòi ra controller **ngoài**
diện menu 28 chức năng:

| Proc thiếu | Controller kéo theo |
|---|---|
| `rs_rptEInvoiceStatusCheckInventory` | `rptEInvoiceStatusCheckInventory` |
| `rs_rptEInvoiceStatusCheckPOS` | `rptEInvoiceStatusCheckPOS` |
| `rs_rptEInvoiceStatusReportInventory` | `rptEInvoiceStatusReportInventory` |
| `rs_rptServiceInvoiceList` | `rptServiceInvoiceList` |
| `rs_rptServicePurchaseInvoiceList` | `rptServicePurchaseInvoiceList` |
| `rs_LoadEInvoiceConversion` | đi cùng `InvoiceConversion` (11.12.27) |

Mỗi `<Stem>` kiểm cả `Grid\<Stem>` lẫn `Filter\<Stem>`, rồi quay lại mục 0 lấy `.xml` gốc.

### 7.4 Từ options ra thêm controller

Mỗi option thiếu là một nhánh code chưa có ai đọc. Tìm ai đọc nó:

```
search_content { program: "<program nguồn>", query: "m_hddt_valid_mode", in: "sql" }
```

**Cảnh báo:** trên program mà controller chuẩn là `.f` **mã hóa**, `search_content in=sql`
chỉ thấy file plaintext (`.xml` customize, `Include\XML\*`) nên trả `count: 0` cả với
option chắc chắn đang dùng. Lúc đó grep thẳng cây `.xml` gốc trong SourceCollection theo
version — `m_hddt_valid_mode` tìm kiểu này ra `Grid\SVDetail.xml` và
`Grid\SVComboDetailGrid.xml`, hai controller không hề có chữ "hddt" trong tên.

Option thiếu thì INSERT vào `options` cùng lô với `wcommand` (mục 6), giá trị lấy theo nguồn
trừ khi khách chốt khác — trình câu lệnh cho user duyệt.

---
## Ví dụ tham chiếu

UR lịch sử cùng loại (search_qlyc): `Update gói HDDT`, `Update HDDT cho FBO`, `Bổ sung gói HDDT` — dùng để tìm khách cùng SP đã làm gần đây làm nguồn bước 3 trong SKILL.md.
