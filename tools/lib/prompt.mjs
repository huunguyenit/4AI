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
export function promptCuaUr(u, payload = {}) {
  const ld = u?.luongDuLieu;
  if (!ld) return { prompt: null, err: 'không có `luongDuLieu`' };
  const d = ld.dich ?? {};
  if (!d.manHinh) return { prompt: null, err: '`luongDuLieu.dich.manHinh` trống — chưa biết đích để dựng prompt' };

  const ma = u.fcode1 || String(u.stt_rec ?? '').trim();
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
1. Xác định đúng program path của khách hàng trên (data/customers.json; hỏi PM nếu chưa rõ).
2. Tính năng MỚI — tạo controller mới (mã, vị trí trong Controllers do PM/LT chốt trước khi sửa file đầu tiên), không sửa lên controller${d.sysid ? ` ${d.sysid}` : ' đích'} có sẵn.
3. Chia logic đúng 2 nơi:
   - XML — phục vụ GUI: form lọc/chọn nguồn dữ liệu trên, field cần điền, nút hành động, validate phía client.
   - SQL — xử lý data: procedure lọc nguồn, mapping, validate, ghi record vào ${d.bang ? `bảng ${d.bang}` : 'bảng đích'} đúng logic ở GHI CHÚ NGHIỆP VỤ.
4. resolve_entities trước khi đọc/sửa Include dùng chung — không đụng nếu chưa đo used_by.
5. Verify bằng dữ liệu mẫu, rồi ghi entry vào ledger theo pm-task-ledger.`
    : `=== VIỆC CẦN LÀM ===
1. Xác định đúng program path của khách hàng trên (data/customers.json; hỏi PM nếu chưa rõ).
2. Dùng describe_controller xác nhận controller đích, cặp .f/.xml, và field liên quan tới nguồn dữ liệu trên.
3. resolve_entities trước khi đọc/sửa — không suy đoán nội dung DTD entity.
4. Sửa tối thiểu để nhận nguồn dữ liệu trên và ghi đúng field đích; không đụng Include dùng chung nếu chưa đo used_by.
5. Verify bằng dữ liệu mẫu, rồi ghi entry vào ledger theo pm-task-ledger.`;

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
