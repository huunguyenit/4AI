// topics-backfill.mjs — gắn `chuDe` / `maDaumuc` cho các node `Request` ĐÃ NẰM trong đồ thị.
//
// VÌ SAO CẦN LỆNH RIÊNG. Hai đường ghi node Request (`4ai report` cho UR đang chạy,
// `4ai graph experience` cho UR đã xong) từ nay đều điền meta — nhưng chỉ cho những dòng chúng
// ghi. Kho hiện có 31.010 node Request đã tích luỹ từ trước, và ĐÓ MỚI LÀ kho kinh nghiệm:
// tiêu chí "ai đã làm nhiều UR cùng mảng này" đọc thẳng bảng đó. Không backfill thì tiêu chí 4
// trả về rỗng cho tới khi từng dự án lần lượt được chạy lại — tức là gần như không bao giờ đủ.
//
// `chuDe` rút từ `noi_dung` (đã có sẵn trên node) cộng `ma_daumuc` (phải hỏi QLDA, vì đầu mục
// là bảng `nbctdaumuc` không nằm trong đồ thị). Thiếu đầu mục thì nhãn `mau-in` và `danh-muc`
// gần như không bao giờ ra — hai nhãn đó chủ yếu đến từ mã đầu mục chứ không từ văn xuôi.
//
// Ranh giới quen thuộc của hub: file này ĐỌC (qua deps) và trả về SCRIPT SQL. Nó không tự ghi
// vào DB — caller quyết định chạy hay không, y hệt playbook.mjs và graph-sync.mjs.

import { rutChuDe } from './topics.mjs';

const chuan = (v) => String(v ?? '').trim();
const lit = (s) => String(s).replace(/'/g, "''");

/** Bao nhiêu node xử lý trong một lô. Giữ script mỗi lô ở mức sqlcmd nuốt trôi. */
export const CO_LO = 500;

/**
 * Node Request còn thiếu `chuDe`.
 *
 * Lọc `ma_lt1 IS NOT NULL` vì mục đích duy nhất của backfill này là chấm kinh nghiệm theo
 * người — UR chưa có người làm không đóng góp gì cho phép đếm đó, gắn nhãn cho chúng chỉ tốn
 * thời gian chạy. Chúng vẫn được điền bình thường khi đường ghi thường chạm tới.
 *
 * Dùng `chuDe IS NULL` làm mốc "chưa xử lý" nên lệnh này CHẠY LẠI ĐƯỢC: lô đã ghi không bị
 * đọc lại. Node thật sự không thuộc chủ đề nào được ghi chuỗi rỗng (xem sqlCapNhat) chứ không
 * để NULL — nếu không nó sẽ quay lại hàng chờ mãi mãi.
 */
export function sqlDocCanBackfill(soLuong = CO_LO) {
  return `
SELECT TOP ${Number(soLuong) || CO_LO}
  RTRIM(stt_rec)   AS stt_rec,
  noi_dung         AS noi_dung
FROM dbo.node_Request
WHERE chuDe IS NULL AND ma_lt1 IS NOT NULL
ORDER BY stt_rec`.trim();
}

/** Đầu mục công việc của một lô UR, hỏi trên QLDA (`nbctdaumuc`). */
export function sqlDaumucCuaLo(sttRecs = []) {
  const khoa = [...new Set(sttRecs.map(chuan).filter(Boolean))].map((s) => `'${lit(s)}'`).join(', ');
  return `
SELECT RTRIM(stt_rec) AS stt_rec, RTRIM(ma_daumuc) AS ma_daumuc
FROM nbctdaumuc
WHERE RTRIM(stt_rec) IN (${khoa}) AND RTRIM(ma_daumuc) <> ''`.trim();
}

/**
 * Lô đã tính nhãn → script UPDATE.
 *
 * Khoá là `stt_rec`, KHÔNG phải một cột tên `key`: emitSql lấy prop ĐẦU TIÊN của nodeKind làm
 * PRIMARY KEY (xem graph.mjs), và `Request` không khai `scoped: true` nên khoá không có tiền tố
 * scope. Viết `[key]` ở đây là Msg 207 — đã đâm phải một lần.
 *
 * Ghi chuỗi RỖNG cho node không ra nhãn nào — xem chú thích ở sqlDocCanBackfill về vì sao NULL
 * không dùng được làm giá trị "đã xử lý, không có nhãn".
 *
 * @param {Array<{stt_rec: string, chuDe: string[], maDaumuc: string[]}>} rows
 */
export function sqlCapNhat(rows = []) {
  const L = ['-- Sinh bởi `node tools/4ai.mjs graph topics` — KHÔNG sửa tay.',
    '-- Chỉ UPDATE cột chuDe/maDaumuc của node_Request. Không tạo, không xoá dòng nào.',
    'SET NOCOUNT ON;', 'SET XACT_ABORT ON;', 'GO', ''];
  for (const r of rows) {
    const key = chuan(r.stt_rec);
    if (!key) continue;
    const cd = (r.chuDe ?? []).join(',');
    const dm = (r.maDaumuc ?? []).join(',');
    L.push(`UPDATE dbo.node_Request SET chuDe = N'${lit(cd)}'`
      + `${dm ? `, maDaumuc = N'${lit(dm)}'` : ''} WHERE RTRIM(stt_rec) = N'${lit(key)}';`);
  }
  L.push('GO', '');
  return L.join('\n');
}

/**
 * Một lô: đọc node thiếu nhãn → hỏi đầu mục → tính nhãn → trả script.
 *
 * @param {{runGraphSql: Function, runSql: Function, qlda: {programPath: string, database: string}}} deps
 * @param {{soLuong?: number}} [opts]
 * @returns {{sql: string|null, soDong: number, thongKe: Record<string, number>}}
 *   `sql: null` nghĩa là hết việc — caller dừng vòng lặp.
 */
export function motLo(deps, opts = {}) {
  const soLuong = opts.soLuong ?? CO_LO;
  const res = deps.runGraphSql({ sql: sqlDocCanBackfill(soLuong), maxRows: soLuong });
  const nodes = (res.rows ?? []).filter((r) => chuan(r.stt_rec));
  if (!nodes.length) return { sql: null, soDong: 0, thongKe: {} };

  // Đầu mục là dữ liệu QLDA, không nằm trong đồ thị. Hỏng đường này thì vẫn gắn nhãn được từ
  // văn xuôi — kém hơn (mất `mau-in`/`danh-muc`) nhưng không đáng để bỏ cả lô.
  const theoUr = new Map();
  const sttRecs = nodes.map((n) => chuan(n.stt_rec)).filter(Boolean);
  if (sttRecs.length) {
    try {
      const dm = deps.runSql({
        programPath: deps.qlda.programPath, database: deps.qlda.database, dbType: 'app',
        sql: sqlDaumucCuaLo(sttRecs), maxRows: 5000,
      });
      for (const r of dm.rows ?? []) {
        const stt = chuan(r.stt_rec);
        if (!stt) continue;
        if (!theoUr.has(stt)) theoUr.set(stt, []);
        theoUr.get(stt).push(chuan(r.ma_daumuc));
      }
    } catch { /* mất đầu mục — gắn nhãn từ văn xuôi, xem chú thích trên */ }
  }

  const thongKe = {};
  const rows = nodes.map((n) => {
    const maDaumuc = [...new Set(theoUr.get(chuan(n.stt_rec)) ?? [])].sort();
    const chuDe = rutChuDe({ noi_dung: n.noi_dung, maDaumuc });
    for (const c of chuDe) thongKe[c] = (thongKe[c] ?? 0) + 1;
    return { stt_rec: chuan(n.stt_rec), chuDe, maDaumuc };
  });

  return { sql: sqlCapNhat(rows), soDong: rows.length, thongKe };
}
