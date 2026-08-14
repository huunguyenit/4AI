// experience-build.mjs — nạp kinh nghiệm từ UR đã xong vào đồ thị.
//
// Tách khỏi đường báo cáo vì PHẠM VI DỮ LIỆU khác hẳn: báo cáo rà soát chỉ lấy UR ở DD/XN/TH
// (phạm vi cổng PM), còn kinh nghiệm chỉ tính từ UR đã xong HT/DT/OK/UP. Hai tập không giao
// nhau, nên không có cách nào ghép chung một lần đọc.
//
// Cũng khác về NHỊP: báo cáo chạy mỗi sáng; kho kinh nghiệm là lịch sử tích luỹ, chạy lại khi
// cần (sau một đợt UP, hoặc khi thêm dự án mới). Ép nó vào báo cáo là bắt PM trả giá quét lại
// hàng vạn UR mỗi lần chỉ để xem hạn.
//
// KHÔNG chạm LLM. Phần `hanhDong`/`viTri` ở đây là tầng regex mỏng — xem experience-extract.mjs.

import { runSql } from '../../mcp/fbo/lib/sql.mjs';
import { loadQldaConfig } from '../../src/database/qlda-metadata.mjs';
import { sqlTuDien, buildTuDien } from './experience-extract.mjs';
import { doThiKinhNghiem } from './graph-sync.mjs';
import { TRANG_THAI_DA_XONG } from './graph-sync.mjs';

const chuan = (v) => String(v ?? '').trim();
const lit = (s) => String(s).replace(/'/g, "''");

function qldaConnection(hub) {
  const qlda = loadQldaConfig(hub)?.databases?.qlda;
  if (!qlda?.path) throw new Error('Không đọc được cấu hình QLDA (data/qlda.json → databases.qlda).');
  return { programPath: qlda.path, database: qlda.databaseName };
}

/**
 * Dự án trong phạm vi + đường dẫn chương trình của chúng.
 *
 * Lọc theo `bp_lt` của UR chứ không của dự án: một dự án có thể do bộ phận khác quản nhưng UR
 * lại giao cho phòng mình làm — kinh nghiệm đó vẫn là của người phòng mình.
 */
export function sqlDuAnCoUrDaXong(boPhan, maDa = '') {
  const dk = [`RTRIM(yc.bp_lt) = '${lit(boPhan)}'`,
    `RTRIM(yc.trang_thai) IN (${TRANG_THAI_DA_XONG.map((s) => `'${s}'`).join(', ')})`];
  if (maDa) dk.push(`RTRIM(yc.ma_da) = '${lit(maDa)}'`);
  return `
SELECT RTRIM(dm.ma_da) AS ma_da, COUNT(*) AS so_ur,
       RTRIM(dm.dir_pro_web) AS dir_pro_web, RTRIM(dm.dir_pro_app) AS dir_pro_app
FROM nbphyc yc JOIN nbdmda dm ON RTRIM(yc.ma_da) = RTRIM(dm.ma_da)
WHERE ${dk.join(' AND ')}
GROUP BY RTRIM(dm.ma_da), RTRIM(dm.dir_pro_web), RTRIM(dm.dir_pro_app)
ORDER BY COUNT(*) DESC`.trim();
}

/** UR đã xong của MỘT dự án. CR/LF bị thay bằng khoảng trắng — xem chú thích dưới. */
export function sqlUrDaXong(maDa) {
  // Giữ nguyên độ dài khi thay CR/LF/TAB để `noi_dung_len` còn đối chiếu được. Không làm bước
  // này thì nội dung nhiều dòng phá vỡ TSV của sqlcmd và mỗi UR bị cắt thành nhiều "dòng" —
  // đo được: cùng một tập dữ liệu, tỉ lệ rút được hiện vật tụt từ 61,5% xuống 25,6%.
  const NL = "REPLACE(REPLACE(REPLACE(ISNULL(noi_dung,''),CHAR(13),' '),CHAR(10),' '),CHAR(9),' ')";
  return `
SELECT RTRIM(stt_rec) AS stt_rec, RTRIM(fcode1) AS fcode1, RTRIM(ma_lt1) AS ur_ma_lt1,
       RTRIM(trang_thai) AS trang_thai, RTRIM(menu_id) AS menu_id,
       ${NL} AS noi_dung, LEN(noi_dung) AS noi_dung_len
FROM nbphyc
WHERE RTRIM(ma_da) = '${lit(maDa)}'
  AND RTRIM(trang_thai) IN (${TRANG_THAI_DA_XONG.map((s) => `'${s}'`).join(', ')})`.trim();
}

/**
 * Dựng node/cạnh kinh nghiệm cho toàn bộ phạm vi. KHÔNG ghi đĩa, KHÔNG đẩy DB.
 *
 * @param {string} hub
 * @param {{boPhan: string, maDa?: string, boi?: string, maxRows?: number}} args
 * @param {{runSql?: Function}} [deps]
 * @returns {{nodes: Array, edges: Array, scopes: string[], thongKe: object, boQua: string[]}}
 */
export function buildKinhNghiem(hub, args = {}, deps = {}) {
  const sqlFn = deps.runSql ?? runSql;
  const { programPath, database } = qldaConnection(hub);
  const boPhan = chuan(args.boPhan);
  if (!boPhan) throw new Error('Thiếu bộ phận lập trình (--dept, hoặc pm.boPhanLt trong qlda.local.json).');

  // Trần đủ cao để không bao giờ cắt thật: đo trên FSD, một phòng đã có 780 dự án còn UR đã
  // xong. Cắt ở đây là cắt IM LẶNG — dự án rớt ra ngoài trần còn không được liệt vào `boQua`,
  // trông như phòng chỉ có bấy nhiêu dự án chứ không phải "bị bỏ sót".
  const duAnRes = sqlFn({ programPath, database, dbType: 'app', maxRows: 5000,
    sql: sqlDuAnCoUrDaXong(boPhan, chuan(args.maDa)) });
  const boQua0 = duAnRes.truncated
    ? [`DANH SÁCH DỰ ÁN BỊ CẮT ở maxRows=5000 — còn dự án chưa được thử, không phải "phòng chỉ có bấy nhiêu".`]
    : [];

  const nodes = [];
  const edges = [];
  const scopes = [];
  const boQua = [...boQua0];
  const thongKe = { duAn: 0, soUr: 0, soFact: 0, urKhongRaHienVat: 0, menuIdPhanGiaiDuoc: 0 };

  for (const d of duAnRes.rows ?? []) {
    const maDa = chuan(d.ma_da);
    const duongDan = (chuan(d.dir_pro_web) || chuan(d.dir_pro_app)).replace(/[\\/]+$/, '');
    if (!maDa) continue;
    if (!duongDan) { boQua.push(`${maDa}: nbdmda không có dir_pro_web/dir_pro_app`); continue; }

    let tuDien;
    try {
      const wc = sqlFn({ programPath: duongDan, dbType: 'sys', sql: sqlTuDien(), maxRows: 5000 });
      tuDien = buildTuDien(wc.rows ?? []);
    } catch (e) {
      // Cây menu của khách là thứ DUY NHẤT phân giải được tên hiện vật. Không đọc được thì
      // bỏ hẳn dự án đó — dùng từ điển của khách khác sẽ ra `sysid` không tồn tại bên này.
      boQua.push(`${maDa}: không đọc được wcommand — ${e.message.split('\n')[0]}`);
      continue;
    }
    if (!tuDien?.size) { boQua.push(`${maDa}: wcommand không có tên màn hình nào dùng được`); continue; }

    let urs;
    try {
      urs = sqlFn({ programPath, database, dbType: 'app', maxRows: args.maxRows ?? 10000,
        sql: sqlUrDaXong(maDa) }).rows ?? [];
    } catch (e) {
      boQua.push(`${maDa}: không đọc được UR — ${e.message.split('\n')[0]}`);
      continue;
    }

    const g = doThiKinhNghiem(urs, tuDien, { maDa, boi: args.boi });
    if (!g.nodes.length) { boQua.push(`${maDa}: ${urs.length} UR đã xong nhưng không rút được hiện vật nào`); continue; }

    nodes.push(...g.nodes);
    edges.push(...g.edges);
    scopes.push(maDa);
    thongKe.duAn += 1;
    thongKe.soUr += g.thongKe.soUr;
    thongKe.soFact += g.thongKe.soFact;
    thongKe.urKhongRaHienVat += g.thongKe.urKhongRaHienVat;
    thongKe.menuIdPhanGiaiDuoc += g.thongKe.menuIdPhanGiaiDuoc;
  }

  return { nodes, edges, scopes, thongKe, boQua, tongDuAnTimThay: duAnRes.rows?.length ?? 0 };
}
