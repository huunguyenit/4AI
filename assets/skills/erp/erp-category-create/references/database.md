# Database — tạo bảng, PK, verify (MCP)

MCP `4ai-fbo` — `query_sql` tự phân giải Web.config của program, chỉ cần truyền `program`.

## Thêm cột — generate_sql_for_fields

```
generate_sql_for_fields(
  field_names=['col1', 'col2'],
  file_path='...\Dir\{controller}.xml'
)
```

Tool đoán kiểu theo tên field — **kiểm tra lại** (`*_yn` → `tinyint`, CSV list → `varchar(500)`, `ma_*` → `varchar(33)`...). Bảng partition: giữ `$` trong tên.

## Tạo bảng + PK

`generate_sql_for_fields` không tạo PK composite → `CREATE TABLE` qua `query_sql`:

```sql
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '{table}')
BEGIN
  CREATE TABLE {table} (
    {pk1} varchar(33) NOT NULL,
    {pk2} varchar(500) NOT NULL,   -- rộng nếu cột CSV
    -- các cột nghiệp vụ...
    status char(1) NULL DEFAULT '1',
    datetime0 datetime NULL, datetime2 datetime NULL,
    user_id0 int NULL, user_id2 int NULL,
    CONSTRAINT PK_{table} PRIMARY KEY ({pk1}, {pk2})
  )
END
```

PK đơn: một cột trong `PRIMARY KEY (...)`.

### Bảng đã có dữ liệu

```sql
ALTER TABLE {table} ALTER COLUMN {pk1} varchar(..) NOT NULL
ALTER TABLE {table} ADD CONSTRAINT PK_{table} PRIMARY KEY ({pk1}, {pk2})
```

## Structure file

`App_Data\Controllers\Structure\App\{table}.xml` — copy từ danh mục có sẵn, đổi `table` và `name` DB.

## Verify

```sql
-- cấu trúc + PK
SELECT c.name, CASE WHEN i.is_primary_key = 1 THEN 1 ELSE 0 END AS is_pk
FROM sys.columns c
LEFT JOIN sys.index_columns ic ON ...
WHERE c.object_id = OBJECT_ID('{table}')

SELECT TOP 1 * FROM {view}
```
