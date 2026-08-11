// prompt.mjs — Sinh prompt gợi ý cho agent (Claude Code) khi tính năng dùng lại màn hình FBO
// có sẵn (`luongDuLieu`), để LT copy thẳng vào chat thay vì tự gõ lại ngữ cảnh.
//
// Hàm thuần: nhận UR + payload, trả chuỗi hoặc lỗi. Không đọc file, không gọi MCP, không tự
// suy đoán program path hay tên bảng/cột ngoài những gì `luongDuLieu` đã khai.

function renderNguon(nguon = []) {
  if (!nguon.length) return '(chưa khai nguồn — hỏi lại trước khi làm)';
  return nguon.map((n) => `- ${n}`).join('\n');
}

/**
 * @param {{fcode1?:string, stt_rec?:string|number, noi_dung?:string, luongDuLieu?:Object}} u
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

  const sections = [
    `=== BỐI CẢNH ===
Chương trình khách: ${payload.ma_da ?? '?'}${payload.ma_pbsp ? ` (${payload.ma_pbsp})` : ''}
Yêu cầu: ${ma} — ${u.noi_dung ?? ''}`,

    `=== NGUỒN DỮ LIỆU ===
${renderNguon(ld.nguon)}`,

    `=== ĐÍCH ===
Màn hình: ${d.manHinh}${dichMo ? ` — ${dichMo}` : ''}
KHÔNG tạo chứng từ mới — đây là màn hình chuẩn hoặc đã customize sẵn có trên FBO.`,

    ld.ghiChu ? `=== GHI CHÚ NGHIỆP VỤ ===\n${ld.ghiChu}` : null,

    `=== VIỆC CẦN LÀM ===
1. Xác định đúng program path của khách hàng trên (data/customers.json; hỏi PM nếu chưa rõ).
2. Dùng describe_controller xác nhận controller đích, cặp .f/.xml, và field liên quan tới nguồn dữ liệu trên.
3. resolve_entities trước khi đọc/sửa — không suy đoán nội dung DTD entity.
4. Sửa tối thiểu để nhận nguồn dữ liệu trên và ghi đúng field đích; không đụng Include dùng chung nếu chưa đo used_by.
5. Verify bằng dữ liệu mẫu, rồi ghi entry vào ledger theo pm-task-ledger.`,

    `=== LƯU Ý ===
Prompt này sinh tự động từ payload rà soát — PM/LT xác nhận lại nguồn/đích trước khi thi hành.
Không suy đoán tên bảng/cột ngoài những gì đã liệt kê ở trên.`,
  ].filter(Boolean);

  return { prompt: sections.join('\n\n'), err: null };
}
