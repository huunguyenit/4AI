#!/usr/bin/env node
// test-forum.mjs — bóc link forum trong UR, cắt/ghép mảnh nội dung, linkify HTML.
// KHÔNG chạm DB: runSql được tiêm giả.

import {
  trichLinkForum, sqlBaiForum, urCanTraForum, fetchForum, CHUNK, SO_MANH_TOI_DA,
} from '../tools/lib/forum.mjs';
import { escLink, renderReport } from '../tools/lib/report.mjs';
import { loadHolidays } from '../tools/lib/workdays.mjs';

let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

process.stdout.write('=== bóc link forum ===\n');
// Đo trên 16 UR thật ở DD/XN/TH: 100% theo dạng showthread.php?t=<topic>[&p=][#post].
ok('Dạng chỉ có topic', trichLinkForum('theo link https://forum.fast.com.vn/showthread.php?t=35383')[0]?.topicId === 35383);
const full = trichLinkForum('link 4r: https://forum.fast.com.vn/showthread.php?t=35336&p=366179#post366179')[0];
ok('Dạng đủ t + p + #post', full?.topicId === 35336 && full?.postId === 366179, JSON.stringify(full));
ok('Dấu chấm cuối câu không bị nuốt vào URL',
  trichLinkForum('xem https://forum.fast.com.vn/showthread.php?t=35383.')[0]?.url.endsWith('35383'));
ok('Dấu đóng ngoặc không bị nuốt',
  trichLinkForum('(https://forum.fast.com.vn/showthread.php?t=1)')[0]?.url.endsWith('t=1'));
ok('Khử trùng topic khi một UR nhắc nhiều lần',
  trichLinkForum('a https://forum.fast.com.vn/showthread.php?t=7 b https://forum.fast.com.vn/showthread.php?t=7&p=9').length === 1);
ok('Nhiều topic khác nhau thì giữ đủ',
  trichLinkForum('https://forum.fast.com.vn/showthread.php?t=7 và https://forum.fast.com.vn/showthread.php?t=8').length === 2);
// oforum.fast.com.vn là DIỄN ĐÀN CŨ, không nằm trong bản sao frpost — khớp lỏng sẽ đi tra
// topic_id của hệ thống khác rồi trả về nội dung bài không liên quan.
ok('KHÔNG nhận nhầm oforum.fast.com.vn (diễn đàn cũ)',
  trichLinkForum('http://oforum.fast.com.vn/showthread.php?t=7').length === 0);
ok('Link không có ?t= thì bỏ qua, không đoán',
  trichLinkForum('https://forum.fast.com.vn/index.php').length === 0);
ok('Text rỗng / null không nổ', trichLinkForum(null).length === 0 && trichLinkForum('').length === 0);

process.stdout.write('\n=== chỉ UR ở DD mới tra forum ===\n');
const urs = [
  { stt_rec: 'A', trang_thai: 'DD', noi_dung: 'update theo https://forum.fast.com.vn/showthread.php?t=100' },
  { stt_rec: 'B', trang_thai: 'XN', noi_dung: 'https://forum.fast.com.vn/showthread.php?t=200' },
  { stt_rec: 'C', trang_thai: 'TH', noi_dung: 'https://forum.fast.com.vn/showthread.php?t=300' },
  { stt_rec: 'D', trang_thai: 'DD', noi_dung: 'không có link' },
];
const can = urCanTraForum(urs);
ok('Chỉ lấy UR ở DD có link', can.length === 1 && can[0].stt_rec === 'A', JSON.stringify(can.map((x) => x.stt_rec)));
ok('XN/TH không tra (việc đã giao, kéo forum vào chỉ làm nặng báo cáo)',
  !can.some((x) => ['B', 'C'].includes(x.stt_rec)));

process.stdout.write('\n=== SQL cắt mảnh ===\n');
const sql = sqlBaiForum([35383, 35336]);
ok('Đọc bảng frpost', sql.includes('FROM frpost'));
ok('Lọc đúng topic', sql.includes('IN (35383, 35336)'));
ok(`CAST về nvarchar(${CHUNK}) — cột MAX bị sqlcmd cắt ở 256`,
  sql.includes(`AS NVARCHAR(${CHUNK})`) && sql.includes('SUBSTRING'));
ok('Có LEN() thật để đối chiếu sau khi ghép', sql.includes('LEN(p.noi_dung)'));
ok(`Sinh tối đa ${SO_MANH_TOI_DA} mảnh`, sql.includes(`TOP (${SO_MANH_TOI_DA})`));
ok('topicIds không phải số bị loại sạch (chặn SQL injection tại gốc)',
  sqlBaiForum(["1; DROP TABLE frpost--", 'abc', -5, 7]).includes('IN (7)'));
ok('Không có topic hợp lệ -> trả chuỗi rỗng, không sinh câu hỏng', sqlBaiForum(['abc']) === '');

process.stdout.write('\n=== ghép mảnh (runSql tiêm giả) ===\n');
// Bài 1 dài 9000 ký tự = 3 mảnh; bài 2 ngắn = 1 mảnh. Trả về CỐ Ý đảo thứ tự mảnh để chắc
// chắn khâu ghép sắp lại theo `manh` chứ không tin thứ tự dòng SQL trả về.
const manh = (i, n) => String(i).repeat(n);
const rowsGia = [
  { topic_id: 9, thu_tu: 1, post_id: 91, nguoi_viet: 'khoand', ngay_viet: '2026-08-11', len_noi_dung: 9000, manh: 2, noi_dung: manh(2, 4000) },
  { topic_id: 9, thu_tu: 1, post_id: 91, nguoi_viet: 'khoand', ngay_viet: '2026-08-11', len_noi_dung: 9000, manh: 1, noi_dung: manh(1, 4000) },
  { topic_id: 9, thu_tu: 1, post_id: 91, nguoi_viet: 'khoand', ngay_viet: '2026-08-11', len_noi_dung: 9000, manh: 3, noi_dung: manh(3, 1000) },
  { topic_id: 9, thu_tu: 2, post_id: 92, nguoi_viet: 'luanvt', ngay_viet: '2026-08-12', len_noi_dung: 5, manh: 1, noi_dung: 'ngắn' + 'x' },
];
const rGhep = fetchForum(undefined,
  { yeuCau: [{ stt_rec: 'A', trang_thai: 'DD', noi_dung: 'https://forum.fast.com.vn/showthread.php?t=9' }] },
  { runSql: () => ({ rows: rowsGia }) });
const bai = rGhep.theoUr.A?.[0]?.baiViet ?? [];
ok('Hai bài, sắp theo thu_tu', bai.length === 2 && bai[0].thu_tu === 1 && bai[1].thu_tu === 2);
ok('Ghép đủ 9000 ký tự từ 3 mảnh', bai[0].noi_dung.length === 9000, String(bai[0].noi_dung.length));
ok('Ghép ĐÚNG THỨ TỰ mảnh dù SQL trả về đảo lộn',
  bai[0].noi_dung.startsWith('111') && bai[0].noi_dung.endsWith('333')
  && bai[0].noi_dung[4000] === '2', bai[0].noi_dung.slice(3998, 4002));
ok('Giữ metadata bài', bai[0].nguoi_viet === 'khoand' && bai[0].post_id === 91);
ok('Ghép đủ thì không báo thiếu', rGhep.thieuDuLieu.length === 0, rGhep.thieuDuLieu.join(' | '));

// Lưới an toàn: sqlcmd cắt lặng lẽ nên phải ĐO lại, không tin câu SQL trông đúng là đủ.
const rHut = fetchForum(undefined,
  { yeuCau: [{ stt_rec: 'A', trang_thai: 'DD', noi_dung: 'https://forum.fast.com.vn/showthread.php?t=9' }] },
  { runSql: () => ({ rows: [{ topic_id: 9, thu_tu: 1, len_noi_dung: 9000, manh: 1, noi_dung: 'ngắn hơn nhiều' }] }) });
ok('Nhận về ngắn hơn LEN thật -> BÁO RA, không im lặng',
  rHut.thieuDuLieu.some((m) => m.includes('ngắn hơn độ dài thật')), rHut.thieuDuLieu.join(' | '));

const rLoi = fetchForum(undefined,
  { yeuCau: [{ stt_rec: 'A', trang_thai: 'DD', noi_dung: 'https://forum.fast.com.vn/showthread.php?t=9' }] },
  { runSql: () => { throw new Error('sqlcmd không chạy'); } });
ok('Lỗi SQL -> ghi lý do, không đánh sập báo cáo',
  rLoi.thieuDuLieu.some((m) => m.includes('frpost')) && Object.keys(rLoi.theoUr).length === 0);

const rTrong = fetchForum(undefined, { yeuCau: [{ stt_rec: 'A', trang_thai: 'DD', noi_dung: 'không link' }] },
  { runSql: () => { throw new Error('không được gọi'); } });
ok('Không UR nào có link -> KHÔNG chạm DB', rTrong.soTopic === 0 && rTrong.thieuDuLieu.length === 0);

const rThieuTopic = fetchForum(undefined,
  { yeuCau: [{ stt_rec: 'A', trang_thai: 'DD', noi_dung: 'https://forum.fast.com.vn/showthread.php?t=999' }] },
  { runSql: () => ({ rows: [] }) });
ok('Topic không có trong bản sao frpost -> nói ra, không lặng lẽ bỏ',
  rThieuTopic.thieuDuLieu.some((m) => m.includes('999')), rThieuTopic.thieuDuLieu.join(' | '));

process.stdout.write('\n=== escLink: link bấm được, vẫn chặn XSS ===\n');
ok('URL thành thẻ a', escLink('xem https://forum.fast.com.vn/showthread.php?t=1 nhé')
  .includes('<a href="https://forum.fast.com.vn/showthread.php?t=1"'));
ok('Mở tab mới + rel an toàn (báo cáo là file tự chứa)',
  escLink('https://a.vn/x').includes('target="_blank"') && escLink('https://a.vn/x').includes('rel="noopener noreferrer"'));
ok('& trong query string giữ nguyên cả link, không cắt đôi',
  escLink('https://forum.fast.com.vn/showthread.php?t=1&p=2').includes('t=1&amp;p=2</a>'));
ok('Dấu chấm cuối câu nằm NGOÀI href', /t=1<\/a>\.$/.test(escLink('link https://forum.fast.com.vn/showthread.php?t=1.')));
ok('Thẻ script trong noi_dung bị escape, không chạy',
  escLink('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
ok('Không chèn được attribute qua dấu nháy trong URL',
  !escLink('https://a.vn/x" onmouseover="alert(1)').includes('onmouseover="alert'));
ok('Text không có link giữ nguyên', escLink('chỉ là chữ') === 'chỉ là chữ');

process.stdout.write('\n=== dựng HTML báo cáo ===\n');
const payload = {
  ma_da: 'ALPHAP', ten_ngan: 'Alpha', pm: 'PM01', ngay_chay: '2026-08-13',
  giaiDoan: [{ giai_doan_da: 'GD1', ngay_ht: '2026-08-20', xac_nhan_da_hen_yn: true }],
  yeuCau: [
    {
      stt_rec: 'R1', fcode1: '59', giai_doan_da: 'GD1', trang_thai: 'DD', tlks_yn: true,
      trang_tlks: 'tr.1', menu_id: 'M01', ma_lt1: '',
      noi_dung: 'Update TT80 theo link: https://forum.fast.com.vn/showthread.php?t=28934',
      forum: [{
        url: 'https://forum.fast.com.vn/showthread.php?t=28934', topicId: 28934, postId: null,
        baiViet: [{ thu_tu: 1, post_id: 9, nguoi_viet: 'khoand', ngay_viet: '2026-07-22', noi_dung: 'A. Nội dung đầy đủ liên quan TT80' }],
      }],
    },
    {
      stt_rec: 'R2', fcode1: '60', giai_doan_da: 'GD1', trang_thai: 'XN', tlks_yn: true,
      trang_tlks: 'tr.2', menu_id: 'M01', ma_lt1: 'HOATV', noi_dung: 'việc đã giao',
    },
  ],
};
const html = renderReport(payload, loadHolidays());
ok('Có mục nội dung forum', html.includes('Nội dung forum kèm theo'));
ok('Bài viết hiện ra', html.includes('A. Nội dung đầy đủ liên quan TT80'));
ok('Topic thu trong <details> (bài dài không đè cả báo cáo)', html.includes('<details class="fr-topic"'));
ok('Có link mở topic trên forum', html.includes('mở trên forum'));
ok('Link trong nội dung UR bấm được', html.includes('<a href="https://forum.fast.com.vn/showthread.php?t=28934"'));
ok('Ghi tên người viết + ngày', html.includes('khoand') && html.includes('22/07/2026'));

const { forum: _bo, ...khongForum } = payload.yeuCau[0];
const htmlTrong = renderReport({ ...payload, yeuCau: [khongForum, payload.yeuCau[1]] }, loadHolidays());
ok('Không UR nào có forum -> nói rõ, không bỏ trống mục',
  htmlTrong.includes('Không có yêu cầu nào ở DD kèm link'));

process.stdout.write(`\n=== TEST KẾT THÚC: ${failures ? `${failures} thất bại` : 'TẤT CẢ PASS (0 thất bại)'} ===\n`);
process.exit(failures ? 1 : 0);
