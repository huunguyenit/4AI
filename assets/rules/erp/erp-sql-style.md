---
id: erp-sql-style
title: SQL conventions for FBO/FBI code
kind: rule
domain: erp
description: Quy ước BẮT BUỘC khi viết proc hoặc query FBO/FBI — param tiếng Anh, sign dưới AS, keyword hoa, alias a→z, #temp, không RTRIM cột khi so sánh, Partition$Execute.
severity: hard
globs: ["**/*.sql", "**/App_Data/Controllers/**"]
see-also: [fbo-sql-reference, fbo-report, erp-sql-access]
version: 3
---
AI Agent **BẮT BUỘC** áp dụng khi viết proc/query mới hoặc sửa SQL hiện có.

---

## 1. Proc / Function — tên, Sign, tham số
- Tên proc/function: zc_Xxx (zc_AutoClosingQuantityWIP). z ở cuối, c là Customize

- Comment và **tên tham số / biến local bằng ENGLISH** (`@Period`, `@Year`, `@Rate01`, `@DateFrom`…).
- Ngay sau `AS` luôn có Sign:

```sql
AS
--C--NGUYENTDH
BEGIN
```

- Proc **luôn** có ba tham số chuẩn (cuối chữ ký, có default):

```sql
@UserID INT = 0,
@Admin BIT = 0,
@Language CHAR(1) = 'v'
```

- Định nghĩa kiểu dữ liệu của các tham số / biến local thường dùng:
```sql
@String VARCHAR(32)
@Rate NUMERIC(5, 2)
@Date SMALLDATETIME
@Int INT
@Bit BIT
@Amount NUMERIC(19, 2) (tien_nt from r70$000000)
@Price NUMERIC(19, 2) (gia_nt from r70$000000)
```

- Gọi từ Filter: map field VN → param EN nếu cần  
`EXEC zc_Xxx @Period = @ky, @Year = @nam, @UserID = @@userID, @Admin = @@admin, @Language = @@language`

---



## 2. Format câu lệnh



### 2.1. Keyword viết HOA

`SELECT` `FROM` `JOIN` `WHERE` `INTO` `INSERT` `UPDATE` `DELETE` `DECLARE` `IF` `ELSE` `BEGIN` `END` `SET` `EXEC` `DROP` `CREATE` `RETURNS` `AND` `OR` `NOT` `EXISTS` `GROUP BY` `HAVING` `ORDER BY`…

### 2.2. Alias bảng `a` → `z`

Trong **một** câu query, alias theo thứ tự alphabet: bảng chính `a`, join tiếp `b`, `c`…

### 2.3. Thụt tab theo level

Xuống dòng trong 1 query: **bắt buộc dùng Tab** (không dùng space thay tab). Level con thụt **sâu hơn 1 tab** so với cha.

**Cấp thụt (tính từ dòng `SELECT` / `INSERT`):**

| Dòng | Tab so với `SELECT`/`INSERT` |
|---|---|
| `SELECT` / `INSERT … SELECT` (dòng đầu) | 0 (bằng mức lệnh trong `BEGIN`) |
| Tiếp cột ` , col9` | +1 |
| `INTO` / `FROM` / `WHERE` / `GROUP BY` / `HAVING` / `ORDER BY` | +1 |
| Mỗi `JOIN` | +2 (sâu hơn `FROM` 1 tab) |
| `AND` / `OR` tiếp `WHERE` | +2 (sâu hơn `WHERE` 1 tab) |

**Mẫu chuẩn (← = Tab):**

```sql
SELECT a.ma_kh, MAX(b.ten_kh) AS ten_kh, MAX(b.han_tt) AS han_tt, a.col4, a.col5, a.col6, a.col7, a.col8
	 , a.col9, a.col10
	INTO #temp
	FROM dmkh a
		LEFT JOIN dmtt b ON a.ma_tt = b.ma_tt
	WHERE a.status = '1' AND b.status = '1'
		AND EXISTS(SELECT 1 FROM cttt20 c WHERE a.ma_kh = c.ma_kh)
	GROUP BY a.ma_kh
	HAVING MAX(b.han_tt) > 10
	ORDER BY a.ma_kh DESC
```

```sql
-- Trong BEGIN: SELECT đã có 1 tab so với BEGIN; INTO/FROM/GROUP BY thêm 1 tab nữa
	SELECT a.so_lsx, a.ma_sp, a.ma_bp, SUM(a.so_luong) AS so_luong
		INTO #agg
		FROM #mo a
		GROUP BY a.so_lsx, a.ma_sp, a.ma_bp
```

**Cấm** căn `INTO`/`FROM`/`GROUP BY` cùng cột với `SELECT` (thiếu tab):

```sql
-- SAI
	SELECT a.so_lsx, a.ma_sp, a.ma_bp, SUM(a.so_luong) AS so_luong
	INTO #agg
	FROM #mo a
	GROUP BY a.so_lsx, a.ma_sp, a.ma_bp
```

- `SELECT` chỉ xuống dòng khi **> 8 cột**; dòng tiếp dạng ` , col9, col10` (space trước dấu phẩy, đã thụt +1 tab).
- `EXISTS(...)` ưu tiên **cùng dòng** với `AND` khi ngắn.
- `INSERT #t SELECT …` nhiều cột: dòng tiếp cột và `FROM`/`WHERE` thụt giống `SELECT` query (+1 so với `INSERT`).

---

**Chỉ** các lệnh “đơn giản” được kề nhau (0 dòng trống):

- `SELECT @x = …` (gán biến)
- `IF @x IS NULL SELECT …` / `IF @x = '' SELECT …` (một dòng, không `BEGIN`)

Mọi câu query khác — gồm **`SELECT … INTO`**, **`SELECT` từ bảng**, **`INSERT`**, `UPDATE`, `DELETE`, `IF BEGIN` — **luôn cách 1 dòng trống** với lệnh trước/sau.

Thứ tự mẫu:

```text
SELECT @…          } 0 dòng giữa các SELECT @
SELECT @…
<blank>
IF @… IS NULL …    } 0 dòng giữa các IF đơn giản
IF @… IS NULL …
<blank>
SELECT … INTO #a   } 1 dòng trước/sau mỗi SELECT INTO / SELECT bảng / INSERT
<blank>
SELECT … INTO #b
<blank>
INSERT #t SELECT …
<blank>
INSERT #t SELECT …
```

| Tình huống | Dòng trống |
|---|---|
| Nhiều `SELECT @x = …` liên tiếp | **0** |
| Nhiều `IF` một dòng liên tiếp | **0** |
| `SELECT INTO` / `SELECT` bảng / `INSERT` (mỗi câu) | **1** với câu trước và sau |
| `IF BEGIN` … `END` | **1** trước khối |

```sql
SELECT @DateTime0 = GETDATE(), @Inserted = 0
SELECT @DateFrom = dbo.ff_GetStartDateOfCycle(@Period, @Year), @DateTo = dbo.ff_GetEndDateOfCycle(@Period, @Year)
SELECT @RoundQty = val FROM options WHERE name = 'm_round_sl'
SELECT @RoundRate = val FROM options WHERE name = 'm_round_tl'

IF @RoundQty IS NULL SELECT @RoundQty = 3
IF @RoundRate IS NULL SELECT @RoundRate = 2

SELECT a.ma_kh, a.ma_vt
	INTO #mo
	FROM phsx a

SELECT a.ma_kh, SUM(a.so_luong) AS so_luong
	INTO #agg
	FROM #mo a
	GROUP BY a.ma_kh

INSERT #temp1 SELECT col0, col1, col2

INSERT #temp2 SELECT col0, col1, col2

IF @true = 1 BEGIN
	SELECT 'true'
END
ELSE BEGIN
	SELECT 'false'
END
```

---

- Một hàng; xuống dòng khi **> 12** biến.
- Nhiều biến: gộp theo **DATATYPE / mục đích / nguồn** (mỗi nhóm 1 `DECLARE`):

```sql
DECLARE @DateTime0 DATETIME, @DateFrom SMALLDATETIME, @DateTo SMALLDATETIME
DECLARE @Inserted INT, @RoundQty SMALLINT, @RoundRate SMALLINT
DECLARE @Message NVARCHAR(512), @q NVARCHAR(MAX)
```

---



## 3. `CAST` — chỉ khi đổi kiểu

**Dùng** `CAST` **khi:** string → number, int → float, date → string (và ngược lại cần thiết).

**Không** `CAST` **khi:** gán literal/`varchar` vào `CHAR(n)` cùng họ chuỗi.


| Ví dụ                           | Đúng?                                              |
| ------------------------------- | -------------------------------------------------- |
| `'02'` insert vào cột `CHAR(8)` | Không CAST — ghi `'02'`                            |
| `'02'` insert vào cột `INT`     | `CAST('02' AS INT)`                                |
| `ngay_ct` → cột string          | `CAST(ngay_ct AS VARCHAR(8))` (hoặc style project) |


---



### 3.1. Đệm chuỗi — dùng `ff_PadL` / `ff_PadR`, không ghép `SPACE`

ERP đã có hàm. Tự ghép `RIGHT(SPACE(n) + RTRIM(x), n)` là viết lại thứ có sẵn, dài hơn và dễ
sai `n` ở một trong ba chỗ.

```sql
-- SAI
RIGHT(SPACE(16) + RTRIM(so_lsx), 16)
-- ĐÚNG
dbo.ff_PadL(so_lsx, 16)
```

| Hàm | Chữ ký | Việc |
|---|---|---|
| `ff_PadL` | `@cpItem varchar, @nLen tinyint` → `varchar` | đệm **trái** cho đủ `@nLen` |
| `ff_PadR` | `@cpItem varchar, @nLen tinyint` → `varchar` | đệm **phải** cho đủ `@nLen` |

### 3.2. Đã chuẩn hoá một lần thì KHÔNG chuẩn hoá lại

Giá trị đã được đệm/cắt đúng định dạng lúc `INSERT` vào `#temp` thì mọi chỗ đọc lại **KHÔNG
ĐƯỢC** format thêm lần nữa. Lặp lại vừa vô nghĩa vừa giết index trên `#temp`.

```sql
-- SAI: #recv đã lưu so_lsx dạng PadL(16) và ma_vt đã LEFT(...,30)
WHERE r.so_lsx = RIGHT(SPACE(16) + RTRIM(a.so_ct), 16)
	AND RTRIM(r.ma_vt) = RTRIM(b.ma_vt)

-- ĐÚNG: chỉ chuẩn hoá phía CHƯA chuẩn, để vế #temp trần
WHERE r.so_lsx = dbo.ff_PadL(a.so_ct, 16)
	AND r.ma_vt = b.ma_vt
```

Quy tắc: **chuẩn hoá ở biên** (lúc nạp vào `#temp`), **so sánh ở trong** (trần).

## 4. So sánh — không `RTRIM` / `LOWER` / `UPPER` cột

Trailing space trên `CHAR` **không ảnh hưởng** `=` / `<>` / `IN` / `JOIN` (`'02' = '02      '` → true).  
Chỉ sai khi **leading** space: `' 01' = '01'` → false.

**Cấm** bọc `RTRIM` / `LOWER` / `UPPER` quanh **cột bảng** trong `WHERE` / `JOIN` (mất index).

```sql
-- Đúng
WHERE a.loai_yt = '01' AND a.ma_gd = '4' AND @Language = 'v'
-- Sai
WHERE RTRIM(a.loai_yt) = '01' OR LOWER(@Language) = 'v'
```

### 4.1. `ISNULL` chỉ khi cột THẬT SỰ có thể NULL

Cột đọc thẳng từ một bảng nghiệp vụ `NOT NULL` thì không bao giờ NULL. `ISNULL` ở đó là bọc
thừa, và bọc quanh cột trong `WHERE` thì mất index y như `RTRIM`.

`ISNULL` **đúng chỗ** là khi giá trị đến từ vế phải của một `LEFT JOIN` — chỉ ở đó mới có
NULL do không khớp.

```sql
-- SAI: so_lsx đọc thẳng từ r70, vừa ISNULL vừa RTRIM, hỏng index
WHERE ISNULL(RTRIM(so_lsx), '') <> ''
-- ĐÚNG
WHERE so_lsx <> ''
```

### 4.2. `GROUP BY` thay `DISTINCT` khi khử trùng

Cùng kết quả, `GROUP BY` cho optimizer nhiều đường hơn (hash/stream aggregate) và đọc rõ ý
định hơn — nhất là khi sau đó còn cần `SUM`/`MAX`.

```sql
-- SAI
SELECT DISTINCT dbo.ff_PadL(so_lsx, 16), LEFT(ma_vt, 30) FROM r70$...
-- ĐÚNG
SELECT dbo.ff_PadL(so_lsx, 16), LEFT(ma_vt, 30) FROM r70$...
	GROUP BY dbo.ff_PadL(so_lsx, 16), LEFT(ma_vt, 30)
```

`RTRIM` **chỉ** khi `LIKE` prefix và pad bên phải làm hỏng pattern — `RTRIM` trên **biến/literal**, không trên cột:

```sql
WHERE a.ma_kh LIKE RTRIM(@ma_kh) + '%'
```

> **Không mâu thuẫn với `fbo-program-config`.** Khuôn tra bảng `options` là
> `select @x = rtrim(val) from options where name = '...'` — `rtrim` nằm ở **SELECT list**,
> không phải `WHERE`, nên không đụng index. Luật cấm ở đây chỉ áp cho cột nằm trong
> `WHERE`/`JOIN`. Code chuẩn của FBO có chỗ viết `where rtrim(name) = '...'` — đó là chỗ
> **vi phạm chính luật này**, đừng chép lại khi viết mới.

---



## 5. Round — luôn từ `options` (`m_round%`)

Không hardcode số lẻ cho tỷ lệ / số lượng / giá / tiền.

```sql
SELECT @RoundQty = val FROM options WHERE name = 'm_round_sl'
SELECT @RoundRate = val FROM options WHERE name = 'm_round_tl'

IF @RoundQty IS NULL SELECT @RoundQty = 3
IF @RoundRate IS NULL SELECT @RoundRate = 2

ROUND(a.so_luong * @Rate01 / 100.0, @RoundQty)
ROUND(@Rate01, @RoundRate)
```

Tham chiếu thường dùng: `m_round_sl`, `m_round_tl`, `m_round_gia`, `m_round_tien`, `m_round_tien_nt`, …

---



## 6. DateFrom / DateTo — hàm ERP

Không hardcode chuỗi ngày. Dùng:

```sql
SELECT @DateFrom = dbo.ff_GetStartDateOfCycle(@Period, @Year), @DateTo = dbo.ff_GetEndDateOfCycle(@Period, @Year)
-- Cả năm:
SELECT @DateFrom = dbo.ff_GetStartDateOfCycle(1, @Year), @DateTo = dbo.ff_GetEndDateOfCycle(12, @Year)
```

Cycle 1–12 = tháng; **không dùng cycle 0**.

---



## 7. Bảng tạm `#temp`



### 7.1. View / bảng không PK NOT NULL — `SELECT TOP 0 … FROM source`

```sql
SELECT TOP 0 stt_rec, ma_ct, ngay_ct, ma_dvcs, ma_nvbh, ma_kh, tien2, ck
	 , CAST('' AS CHAR(2)) AS loai_hd
	INTO #in
	FROM wrkin
```

- Liệt kê cột — **cấm** `SELECT TOP 0 `*.
- Cột thêm ngoài source → `CAST(... AS type) AS ten_cot`.
- Không `CAST` lại kiểu cột đã có trong source.



### 7.2. Bảng có PK / NOT NULL — `RIGHT JOIN` drop struct

```sql
SELECT TOP 0 a.stt_rec, a.ma_ct, a.ngay_ct, a.ma_dvcs, a.ma_nvbh, a.tien2, a.ck
	 , CAST('' AS CHAR(2)) AS loai_hd
	INTO #in
	FROM r70$000000 a
		RIGHT JOIN (SELECT TOP 0 NULL AS i) b ON 1 = 0
```

- **`SELECT TOP 0` là BẮT BUỘC**, kể cả khi đã có `RIGHT JOIN … ON 1 = 0`. Hai thứ làm hai
  việc khác nhau: `RIGHT JOIN` bỏ ràng buộc `NOT NULL`/`IDENTITY` của cột, `TOP 0` bảo đảm
  không đọc dòng nào của bảng nguồn. Thiếu `TOP 0` là để engine tự quyết có quét bảng thật hay
  không — trên bảng phân kỳ nhiều triệu dòng thì đó là rủi ro không cần có.
- Dùng partition mẫu cụ thể (`r70$000000`), không view tổng.

### 7.2a. Struct luôn dựng TỪ BẢNG THẬT, không gõ `CAST` tay

Cột nào **đã có** ở bảng nghiệp vụ thì lấy kiểu từ đó. Gõ tay `CAST('' AS CHAR(n))` là tự chép
lại độ dài và kiểu — sai một ký tự là cắt cụt dữ liệu, và bảng đổi kiểu thì `#temp` không đổi
theo.

```sql
-- SAI: tự khai kiểu, trong khi r70 đã có sẵn hai cột này
SELECT CAST('' AS CHAR(16)) AS so_lsx, CAST('' AS CHAR(30)) AS ma_vt INTO #recv WHERE 1 = 0

-- ĐÚNG: mượn kiểu từ chính bảng sẽ đọc
SELECT TOP 0 a.so_lsx, a.ma_vt
	INTO #recv
	FROM r70$000000 a
		RIGHT JOIN (SELECT TOP 0 NULL AS i) b ON 1 = 0
```

Chỉ `CAST` cho cột **không tồn tại** ở nguồn (xem 7.1).

### 7.2b. Hai bảng cùng nghĩa — BẮT BUỘC chọn bản tách kỳ

Gặp hai bảng cùng định nghĩa một sổ thì bản có hậu tố **`$yyyyMM`** là bản chính thức; bản
không hậu tố là di sản, **KHÔNG ĐƯỢC** dùng trong code mới.

| Sổ | Dùng | KHÔNG dùng |
|---|---|---|
| Sổ cái | `r00$yyyyMM` | `ct00` |
| Kho hoá đơn | `r70$yyyyMM` | `ct70` |
| Kho thực tế | `r90$yyyyMM` | `ct90` |

Trên chương trình đã đo, `ct70` và `ct90` **rỗng hoàn toàn** — viết `FROM ct70` thì câu lệnh
chạy được nhưng luôn trả 0 dòng, không báo lỗi. Đây là kiểu sai im lặng, tốn nhiều giờ nhất.

Trả lời câu hỏi "sổ kho là bảng nào" cũng theo luật này: **`r70$yyyyMM`** (hoá đơn) và
**`r90$yyyyMM`** (thực tế), kèm kỳ cụ thể.

### 7.2c. Đọc sổ kho — BẮT BUỘC xét `m_instock_split`

`r90` **chỉ có dữ liệu khi** `options.m_instock_split = '1'`. Khách tắt tùy chọn đó thì cả
hoá đơn lẫn thực tế dồn vào `r70`, `r90` rỗng.

Nhánh thực tế **KHÔNG ĐƯỢC** chỉ đọc `r90` — phải theo đúng khuôn của proc chuẩn:

```sql
IF @DataType = 1 BEGIN                                  -- 1 = thực tế, 2 = hoá đơn
    SET @q = ' ... from r90$%Partition a with(nolock)' + @Join
    EXEC FastBusiness$Partition$Execute @q, NULL, 'ngay_ct', @DateFrom, @DateTo, @UserID, @Admin
END
IF @DataType <> 1
   OR NOT EXISTS(SELECT 1 FROM options WHERE name = 'm_instock_split' AND val = '1') BEGIN
    SET @q = ' ... from r70$%Partition a with(nolock)' + @Join
    EXEC FastBusiness$Partition$Execute @q, NULL, 'ngay_ct', @DateFrom, @DateTo, @UserID, @Admin
END
```

Bỏ vế `OR NOT EXISTS(...)` thì báo cáo tồn thực tế trả **0 dòng** ở mọi khách không tách sổ,
và không có lỗi nào báo ra.

Nhánh `r90` còn cần ghép khoá lọc riêng: `FastBusiness$Report$GetPhysicsKey` trả `@xKey`, nối
vào `@Key` rồi bọc `FastBusiness$Function$System$GetCheckKey`.

### 7.3. Insert vào `#temp`

```sql
INSERT #a SELECT col0, col1, col2
```

Không cần liệt kê cột đích khi `#a` đã đúng struct.

---



## 8. Insert bảng thật — `fsd_GetSQLInsert`

Khi bảng insert **nhiều cột hơn** bảng/data nguồn: dựng `#data` (đủ cột cần gán), rồi:

```sql
SELECT @q = dbo.fsd_GetSQLInsert('xcdloaiytdd', '#wip', '')
EXEC sp_executesql @q
```

- `@cKey`: thêm `WHERE` trên `#data` nếu cần; `''` = insert hết.
- Cột thiếu trên `#data` được hàm fill default (`''` / `0` / `NULL` theo kiểu).

Khi insert **cột explicit ít** và đã liệt kê đủ — có thể `INSERT INTO real (cols) SELECT …` trực tiếp; ưu tiên `fsd_GetSQLInsert` khi đích rộng hơn nguồn.

Danh mục đầy đủ 29 đối tượng `fsd_*` (sinh câu lệnh, tách chuỗi, sinh mã, thêm cột,
gộp nhóm, lọc quyền đơn vị): `fbo-sql-reference` → `fsd-objects.md`.

Insert `#plan_raw` từ bảng nhiều cột — **không** `SELECT *`; build danh sách cột (dynamic nếu cần):

```sql
SELECT @q = 'INSERT #plan_raw SELECT a.ma_dvcs, a.ma_nvbh, a.nh_vt1, a.lan'
	+ ', a.tien01, a.tien02, a.tien03, a.tien04, a.tien05, a.tien06'
	+ ' FROM zckhdtnvbh a WHERE ' + @PlanKey
EXEC sp_executesql @q
```

### 8.1. Dynamic SQL — luôn `sp_executesql`

Thực thi chuỗi động: **`EXEC sp_executesql @q`** — **cấm** `EXEC (@q)`.

- Biến lệnh: `@q NVARCHAR(MAX)` (khớp tham số `sp_executesql`).
- Có tham số bind: dùng overload `EXEC sp_executesql @q, N'@p INT', @p = @p`.

---



## 9. `DROP TABLE`

Cùng một hàng, nhiều bảng:

```sql
DROP TABLE #mo, #agg, #wip
```

---



## 10. Bảng partition `$` — `FastBusiness$Partition$Execute`



### 10.1. Nhận diện

Đồng thời có `{prefix}$000000` **và** ít nhất một `{prefix}$YYYYMM` → partition.  
Kỳ theo cột ngày chứng từ (thường `ngay_ct`).

### 10.2. Thao tác

**Cấm** cursor/`WHILE` `sys.tables LIKE 'mXX$%'` để ALTER từng kỳ.

**Bắt buộc** `FastBusiness$Partition$Execute`:

```text
@statement nvarchar  -- token %Partition và %[điều kiện]%
@unit varchar
@dateField varchar
@dateFrom / @dateTo smalldatetime
@userID int, @admin bit
```

Pattern DDL: ALTER `$000000` một lần → `Partition$Execute` propagate; khoảng ngày từ `dmstt.ngay_gh1/gh2`.

Chi tiết chữ ký / cờ mã hoá: `fbo-sql-reference` → `references/procedures.md`.

---



## 11. Checklist nhanh trước khi giao SQL

- [ ] Param / biến ENGLISH; Sign `--C--NGUYENTDH`; có `@UserID` `@Admin` `@Language`
- [ ] Keyword HOA; alias `a`→`z`; tab đúng level; `SELECT` wrap khi > 8 cột
- [ ] Tab: `INTO`/`FROM`/`WHERE`/`GROUP BY` +1 so với `SELECT`; `JOIN`/`AND` +1 so với `FROM`/`WHERE` (không căn cùng cột `SELECT`)
- [ ] Dòng trống: chỉ `SELECT @` / `IF` một dòng = 0; `SELECT INTO` / `SELECT` bảng / `INSERT` / `IF BEGIN` luôn cách 1
- [ ] `INSERT`↔`INSERT` luôn 1 dòng trống
- [ ] Không `CAST` thừa; không `RTRIM`/`LOWER`/`UPPER` cột khi `=`
- [ ] `ISNULL` chỉ ở vế phải `LEFT JOIN`, không bọc cột `NOT NULL` trong `WHERE`
- [ ] Khử trùng bằng `GROUP BY`, không `DISTINCT`
- [ ] Đệm chuỗi bằng `ff_PadL`/`ff_PadR`, không ghép `RIGHT(SPACE(n) + RTRIM(x), n)`
- [ ] Giá trị đã chuẩn hoá lúc nạp `#temp` thì lúc so sánh để **trần**, không format lại
- [ ] Round từ `options` (`m_round%`); ngày qua `ff_GetStart/EndDateOfCycle`
- [ ] `#temp`: **luôn** `SELECT TOP 0`, kèm `RIGHT JOIN … ON 1 = 0` khi nguồn có PK/NOT NULL
- [ ] Struct `#temp` dựng **từ bảng thật**; `CAST` chỉ cho cột nguồn không có
- [ ] Bảng thật nhiều cột: `fsd_GetSQLInsert`; dynamic → `EXEC sp_executesql @q` (không `EXEC (@q)`)
- [ ] `DROP TABLE #a, #b`; Partition: chỉ qua `FastBusiness$Partition$Execute`
- [ ] File UTF-8 BOM + CRLF; **không deploy** proc khi chưa hỏi NSD
