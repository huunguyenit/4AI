# Ví dụ tham chiếu

Pattern nền: [erp-report-create](../erp-report-create/SKILL.md). Pattern pivot: [SKILL.md](SKILL.md).

## Báo cáo kế hoạch / thực tế theo kỳ

- Proc: `zc_rptPlanActualRevenue`
- Grid: `dataFields="ke_hoach, thuc_te, ty_le"`
- `#xPivot`: `GROUP BY xPivot` từ `#report$` — không WHILE 1..12
- `#nPivot`: 3 dòng = `ke_hoach$`, `thuc_te$`, `ty_le$`
- `@DetailBy` từ Filter `@ct_theo`: `'1'` NV, `'0'` kênh
