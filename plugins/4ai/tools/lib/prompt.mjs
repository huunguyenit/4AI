// prompt.mjs — Sinh prompt gợi ý cho agent (Claude Code) từ payload rà soát (`luongDuLieu`),
// để LT copy thẳng vào chat thay vì tự gõ lại ngữ cảnh.
//
// Hàm thuần: nhận UR + payload, trả chuỗi hoặc lỗi. Không đọc file, không gọi MCP, không tự
// suy đoán program path hay tên bảng/cột ngoài những gì `luongDuLieu` đã khai.
//
// Một UR có `luongDuLieu` rơi vào một trong hai dạng, xác định qua `nhanDienTinhNangMoi`:
//   - Dùng lại màn hình có sẵn — sửa tối thiểu vào controller đích đang tồn tại.
//   - Tạo tính năng mới — mặc định luôn là 01 menu/controller MỚI HOÀN TOÀN; `luongDuLieu.dich`
//     lúc này chỉ mô tả CHỨNG TỪ/BẢNG mà tính năng ghi dữ liệu vào (loại chứng từ vẫn chuẩn,
//     không tạo loại mới), KHÔNG phải màn hình sẽ sửa. Logic của tính năng mới luôn chia hai
//     nơi: XML lo GUI, SQL lo xử lý data — hai nhánh sinh nội dung ĐÍCH/VIỆC CẦN LÀM khác nhau.

import { boDau } from './assignee.mjs';

/** Từ khoá nhận diện UR là yêu cầu tạo tính năng mới khi payload không khai tường minh. */
const TINH_NANG_RE = /\btinh nang\b/;

/**
 * UR này có phải yêu cầu tạo tính năng (menu) mới không.
 * @returns {{laMoi: boolean, nguon: string}} nguon = 'payload' | 'noi_dung' | 'khong'
 */
export function nhanDienTinhNangMoi(u) {
  if (typeof u?.laTinhNangMoi === 'boolean') {
    return { laMoi: u.laTinhNangMoi, nguon: 'payload' };
  }
  if (TINH_NANG_RE.test(boDau(u?.noi_dung))) {
    return { laMoi: true, nguon: 'noi_dung' };
  }
  return { laMoi: false, nguon: 'khong' };
}

function renderNguon(nguon = []) {
  if (!nguon.length) return '(chưa khai nguồn — hỏi lại trước khi làm)';
  return nguon.map((n) => `- ${n}`).join('\n');
}

/**
 * @param {{fcode1?:string, stt_rec?:string|number, noi_dung?:string, luongDuLieu?:Object, laTinhNangMoi?:boolean}} u
 * @param {{ma_da?:string, ma_pbsp?:string}} payload
 * @returns {{prompt:string, err:null} | {prompt:null, err:string}}
 */
/**
 * Khối ĐÍCH và VIỆC CẦN LÀM — tách riêng vì hai prompt cùng cần và nội dung phân nhánh
 * "tính năng mới vs sửa màn hình có sẵn" chỉ được phép khai MỘT chỗ. Nhân đôi nó là cách chắc
 * chắn nhất để hai prompt dạy hai điều khác nhau về cùng một UR.
 */
function khoiDichVaViec(u, ld) {
  const d = ld.dich ?? {};
  const dichMo = [d.syscode && `mã ${d.syscode}`, d.sysid && `controller ${d.sysid}`, d.bang && `bảng ${d.bang}`]
    .filter(Boolean).join(' · ');
  const { laMoi } = nhanDienTinhNangMoi(u);

  const dich = laMoi
    ? `=== ĐÍCH ===
Chứng từ/bảng ghi dữ liệu vào: ${d.manHinh}${dichMo ? ` — ${dichMo}` : ''}.
Đây là loại chứng từ CHUẨN có sẵn trên FBO (không tạo loại chứng từ mới).
NHƯNG đây là YÊU CẦU TẠO TÍNH NĂNG MỚI — mặc định là 01 menu/controller MỚI HOÀN TOÀN, không sửa trực tiếp lên controller${d.sysid ? ` ${d.sysid}` : ' đích'} có sẵn.`
    : `=== ĐÍCH ===
Màn hình: ${d.manHinh}${dichMo ? ` — ${dichMo}` : ''}
KHÔNG tạo chứng từ mới — đây là màn hình chuẩn hoặc đã customize sẵn có trên FBO.`;

  const viecCanLam = laMoi
    ? `=== VIỆC CẦN LÀM ===
1. Xác định đúng program path của khách hàng trên trước khi sửa file đầu tiên (hỏi PM nếu chưa rõ).
2. Tính năng MỚI — tạo controller mới (mã, vị trí trong Controllers do PM/LT chốt trước khi sửa file đầu tiên), không sửa lên controller${d.sysid ? ` ${d.sysid}` : ' đích'} có sẵn.
3. Chia logic đúng 2 nơi:
   - XML — phục vụ GUI: form lọc/chọn nguồn dữ liệu trên, field cần điền, nút hành động, validate phía client.
   - SQL — xử lý data: procedure lọc nguồn, mapping, validate, ghi record vào ${d.bang ? `bảng ${d.bang}` : 'bảng đích'} đúng logic ở GHI CHÚ NGHIỆP VỤ.
4. Phân giải entity/Include dùng chung trước khi đọc/sửa (dùng tool tra cứu phù hợp có sẵn) — không đụng nếu chưa đo used_by.
5. Verify bằng dữ liệu mẫu, rồi ghi entry vào ledger theo pm-task-ledger.`
    : `=== VIỆC CẦN LÀM ===
1. Xác định đúng program path của khách hàng trên trước khi sửa (hỏi PM nếu chưa rõ).
2. Dùng describe_controller xác nhận controller đích, cặp .f/.xml, và field liên quan tới nguồn dữ liệu trên.
3. Phân giải entity/DTD dùng chung trước khi đọc/sửa (dùng tool tra cứu phù hợp có sẵn) — không suy đoán nội dung.
4. Sửa tối thiểu để nhận nguồn dữ liệu trên và ghi đúng field đích; không đụng Include dùng chung nếu chưa đo used_by.
5. Verify bằng dữ liệu mẫu, rồi ghi entry vào ledger theo pm-task-ledger.`;

  return { dich, viecCanLam };
}

export function promptCuaUr(u, payload = {}) {
  const ld = u?.luongDuLieu;
  if (!ld) return { prompt: null, err: 'không có `luongDuLieu`' };
  const d = ld.dich ?? {};
  if (!d.manHinh) return { prompt: null, err: '`luongDuLieu.dich.manHinh` trống — chưa biết đích để dựng prompt' };

  const ma = u.fcode1 || String(u.stt_rec ?? '').trim();
  const { dich, viecCanLam } = khoiDichVaViec(u, ld);

  const sections = [
    `=== BỐI CẢNH ===
Chương trình khách: ${payload.ma_da ?? '?'}${payload.ma_pbsp ? ` (${payload.ma_pbsp})` : ''}
Yêu cầu: ${ma} — ${u.noi_dung ?? ''}`,

    `=== NGUỒN DỮ LIỆU ===
${renderNguon(ld.nguon)}`,

    dich,

    ld.ghiChu ? `=== GHI CHÚ NGHIỆP VỤ ===\n${ld.ghiChu}` : null,

    viecCanLam,

    `=== LƯU Ý ===
Prompt này sinh tự động từ payload rà soát — PM/LT xác nhận lại nguồn/đích trước khi thi hành.
Không suy đoán tên bảng/cột ngoài những gì đã liệt kê ở trên.`,
  ].filter(Boolean);

  return { prompt: sections.join('\n\n'), err: null };
}

// ---------------------------------------------------------------- prompt cho cả tab kỹ thuật

/**
 * Vì sao SQL script KHÔNG đi vào prompt.
 *
 * Script tạo bảng/thêm cột do `tools/lib/ddl.mjs` sinh ra từ đặc tả `ddl` đã khai — đầu ra XÁC
 * ĐỊNH: cùng đặc tả, chạy lại ra đúng từng byte. Đó chính là giá trị của nó, và cũng là thứ
 * hỏng ngay khi cho một model đọc: model sẽ "cải thiện" tên cột, đổi kiểu, thêm index, gộp
 * lệnh — mỗi lần một khác, và không ai đối chiếu lại được với đặc tả nữa.
 *
 * Nên script nằm NGOÀI prompt và được nhắc tới như một hiện vật để CHẠY NGUYÊN VĂN. Prompt chỉ
 * mang phần cần suy nghĩ: bối cảnh, kinh nghiệm đã có, luồng dữ liệu, việc phải làm.
 */
const KHOI_LOAI_TRU = `=== NGOÀI PHẠM VI PROMPT NÀY ===
Script SQL tạo bảng / thêm cột: ĐÃ SINH SẴN ở mục "Gợi ý tạo bảng / thêm cột" của báo cáo,
sinh tự động từ đặc tả \`ddl\` đã khai. Chạy NGUYÊN VĂN.
KHÔNG nhờ AI viết lại, không "tối ưu", không đổi tên cột hay kiểu dữ liệu: đó là đầu ra xác
định (cùng đặc tả → cùng script từng byte), sửa lại là mất tính đối chiếu được với đặc tả.
Cần đổi thì sửa đặc tả \`ddl\` rồi sinh lại, đừng sửa script.`;

/** Một hướng dẫn thực chiến → khối văn bản trong prompt. */
function renderHuongDan(g, i) {
  const nhan = g._khop === 'chinh-ur' ? 'ghi cho CHÍNH yêu cầu này'
    : g._khop === 'menu_id' ? `khớp YẾU qua menu ${g.menu_id ?? ''} — menu_id là số hiệu ghi tay, đối chiếu code thật trước khi tin`
    : `khớp controller ${g.sysid ?? ''}`;
  const xuatXu = g._khop === 'chinh-ur' ? '' : ` · đã chạy thật ở dự án ${g.ma_da ?? '?'}`;
  return [
    `(${i + 1}) ${g.tieuDe ?? ''}  [${nhan}${xuatXu}${g.nguonLt ? ` · kinh nghiệm của ${g.nguonLt}` : ''}]`,
    g.boiCanh ? `    Khi nào áp dụng: ${g.boiCanh}` : null,
    `    Cách làm:\n${String(g.cachLam ?? '').split('\n').map((d) => `      ${d}`).join('\n')}`,
    g.canhBao ? `    Cẩn thận: ${g.canhBao}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * Toàn bộ gợi ý kỹ thuật của MỘT UR → một prompt dán thẳng vào Claude Code.
 *
 * Gộp ba nguồn vốn nằm rời ở ba mục của báo cáo — kinh nghiệm thực chiến, luồng dữ liệu, và
 * việc cần làm — vì người sắp code cần cả ba cùng lúc; bắt họ tự ghép lại từ ba chỗ là bắt họ
 * làm cái máy làm được. SQL script cố ý đứng ngoài, xem KHOI_LOAI_TRU.
 *
 * @param {object} u        UR đã enrich
 * @param {object} payload  payload dự án (ma_da, ma_pbsp)
 * @param {{huongDan?: Array, coDdl?: boolean}} them
 * @returns {{prompt: string|null, err: string|null}}
 */
export function promptKyThuat(u, payload = {}, them = {}) {
  const huongDan = them.huongDan ?? [];
  const ld = u?.luongDuLieu;
  if (!huongDan.length && !ld && !them.coDdl) {
    return { prompt: null, err: 'UR này không có gợi ý kỹ thuật nào để dựng prompt' };
  }

  const ma = u.fcode1 || String(u.stt_rec ?? '').trim();
  const han = u._phase?.ngay_ht ? String(u._phase.ngay_ht).slice(0, 10) : null;

  const sections = [
    `=== BỐI CẢNH ===
Chương trình khách: ${payload.ma_da ?? '?'}${payload.ma_pbsp ? ` (${payload.ma_pbsp})` : ''}
Yêu cầu: ${ma} — ${u.noi_dung ?? ''}
Trạng thái ${u.trang_thai ?? '?'}${u.giai_doan_da ? ` · giai đoạn ${u.giai_doan_da}` : ''}${han ? ` · hạn ${han}` : ''}${u.menu_id ? ` · menu ${u.menu_id}` : ''}${u.sysid ? ` · controller ${u.sysid}` : ''}`,

    huongDan.length
      ? `=== KINH NGHIỆM ĐÃ CÓ (${huongDan.length}) ===
${huongDan.map(renderHuongDan).join('\n\n')}

Đây là cách người thật đã làm, KHÔNG phải quy định. Đối chiếu với code thật của chương trình
này trước khi áp — mỗi khách một bản customize khác nhau.`
      : null,

    ld ? `=== NGUỒN DỮ LIỆU ===\n${renderNguon(ld.nguon)}` : null,
    ld ? khoiDichVaViec(u, ld).dich : null,
    ld?.ghiChu ? `=== GHI CHÚ NGHIỆP VỤ ===\n${ld.ghiChu}` : null,

    // Có `luongDuLieu` thì dùng ĐÚNG checklist phân nhánh của promptCuaUr — UR tạo tính năng
    // mới và UR sửa màn hình có sẵn cần hai lối làm khác hẳn nhau. Không có thì rơi về bộ
    // kỷ luật chung, đủ để không ai đụng Include mà chưa đo.
    ld ? khoiDichVaViec(u, ld).viecCanLam : `=== VIỆC CẦN LÀM ===
1. Xác định đúng program path của khách trước khi mở file đầu tiên (hỏi PM nếu chưa rõ).
2. Dùng describe_controller xác nhận controller đích và cặp .f/.xml trước khi sửa.
3. Phân giải entity/DTD dùng chung; đụng Include thì đo used_by trước — sửa Include là đổi
   toàn hệ thống, không phải đổi một màn hình.
4. Sửa tối thiểu. Không normalize encoding/newline như tác dụng phụ (nguồn FBO có thể là
   Windows-1258 + CRLF — giữ nguyên).
5. Verify bằng dữ liệu mẫu, rồi ghi entry vào ledger theo pm-task-ledger.`,

    them.coDdl ? KHOI_LOAI_TRU : null,

    `=== LƯU Ý ===
Prompt này sinh tự động từ báo cáo rà soát ngày ${String(payload.ngay_chay ?? '').slice(0, 10) || '?'}.
Không suy đoán tên bảng/cột/file ngoài những gì đã liệt kê ở trên — thiếu thì hỏi, đừng đoán.`,
  ].filter(Boolean);

  return { prompt: sections.join('\n\n'), err: null };
}
