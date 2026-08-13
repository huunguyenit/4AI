// forum.mjs — phân giải link forum.fast.com.vn đính trong nội dung UR thành nội dung bài viết.
//
// Rất nhiều UR chỉ ghi "update theo link forum: <url>" — bản thân UR KHÔNG chứa yêu cầu, nội
// dung thật nằm ở topic trên forum. Đọc mỗi UR thì không đủ để phân tích; phải mở link ra mới
// biết phải làm gì.
//
// Diễn đàn đã có bản sao trong DB nghiệp vụ: bảng `frpost` (76.151 bài / 17.533 topic, mỗi
// dòng một bài, `url_goc` giữ link gốc). Nên KHÔNG gọi HTTP ra ngoài — vừa không cần mạng,
// vừa không phụ thuộc phiên đăng nhập forum. Proc `dbo.fr_postsearch` là công cụ TÌM KIẾM
// theo từ khoá; ở đây đã có sẵn topic_id lấy từ chính link nên tra thẳng `frpost` là đường
// ngắn và chắc chắn hơn (khớp đúng topic, không phụ thuộc thuật toán xếp hạng từ khoá).
//
// CHỈ ÁP CHO UR Ở TRẠNG THÁI DD. Đó là cổng PM — chỗ duy nhất báo cáo cần đủ dữ kiện để phân
// tích. UR đã sang XN/TH thì việc đã giao, kéo thêm vài nghìn ký tự forum vào chỉ làm nặng
// báo cáo mà không đổi quyết định nào.

import { runSql } from '../../mcp/fbo/lib/sql.mjs';
import { loadQldaConfig } from '../../src/database/qlda-metadata.mjs';

const chuan = (v) => String(v ?? '').trim();

/**
 * Nhận diện host forum. Ranh giới `//` hoặc `.` ở đầu là CỐ Ý: `oforum.fast.com.vn` (diễn đàn
 * cũ) có chứa chuỗi "forum.fast.com.vn" nhưng là host khác và KHÔNG nằm trong bảng `frpost` —
 * khớp lỏng sẽ đi tra một topic_id của hệ thống khác rồi trả về nội dung của bài không liên quan.
 */
const LINK_FORUM_RE = /https?:\/\/forum\.fast\.com\.vn\/[^\s<>"']*/gi;
const TOPIC_RE = /[?&]t=(\d+)/;
const POST_RE = /[?&]p=(\d+)|#post(\d+)/;

/**
 * Bóc mọi link forum trong một đoạn text.
 *
 * Đo trên dữ liệu thật (16 UR ở DD/XN/TH có link forum): 100% theo đúng một dạng
 * `showthread.php?t=<topic>[&p=<post>][#post<post>]`. `topicId` là thứ bắt buộc phải có —
 * không có nó thì không biết tra bài nào, bỏ qua link đó chứ không đoán.
 *
 * @returns {Array<{url: string, topicId: number, postId: number|null}>} đã khử trùng topic
 */
export function trichLinkForum(text) {
  const out = new Map();
  for (const raw of String(text ?? '').match(LINK_FORUM_RE) ?? []) {
    // Dấu câu cuối câu tiếng Việt hay dính vào link ("...?t=35383."), cắt trước khi parse.
    const url = raw.replace(/[.,;:!?)\]}]+$/, '');
    const topic = TOPIC_RE.exec(url);
    if (!topic) continue;
    const topicId = Number(topic[1]);
    if (!Number.isSafeInteger(topicId) || topicId <= 0) continue;
    const post = POST_RE.exec(url);
    const postId = post ? Number(post[1] ?? post[2]) : null;
    if (!out.has(topicId)) out.set(topicId, { url, topicId, postId: postId || null });
  }
  return [...out.values()];
}

/**
 * Kích thước một mảnh nội dung, và số mảnh tối đa mỗi bài.
 *
 * `frpost.noi_dung` là `nvarchar(MAX)`, mà sqlcmd CẮT ÂM THẦM cột kiểu độ dài thay đổi ở 256
 * ký tự (mặc định của `-y`, không tắt được vì `-y` xung khắc với `-W` — xem mcp/fbo/lib/sql.mjs).
 * Đo trên bảng thật: 33.622/76.151 bài dài quá 256, tức 44% sẽ về dạng cụt giữa câu.
 *
 * Cột khai độ dài rõ thì KHÔNG dính, nên cắt thành mảnh `nvarchar(4000)` rồi ghép lại ở JS.
 * 4000 là trần của `nvarchar` khai tường minh; 32 mảnh = 128.000 ký tự, phủ được bài dài nhất
 * đang có (124.769). Vượt cả mức đó thì `noiDungLenGoc` sẽ tố cáo — xem fetchForum().
 */
export const CHUNK = 4000;
export const SO_MANH_TOI_DA = 32;

/**
 * Bài viết của các topic, mỗi bài trả về thành nhiều dòng-mảnh.
 *
 * `topicIds` PHẢI là số nguyên — ép kiểu ở đây thay vì escape chuỗi: giá trị đến từ regex
 * `\d+` nên ép số là phép kiểm chặt hơn quote, và không còn đường nào để chuỗi lạ lọt vào SQL.
 *
 * Dọn CR/LF/TAB TRƯỚC khi cắt mảnh: ba phép REPLACE đó giữ nguyên độ dài (một ký tự đổi thành
 * một ký tự) nên `LEN(noi_dung)` gốc vẫn là mốc đối chiếu đúng sau khi ghép lại.
 */
export function sqlBaiForum(topicIds) {
  const ids = [...new Set(topicIds.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!ids.length) return '';
  const NL = "REPLACE(REPLACE(REPLACE(ISNULL(p.noi_dung,''),CHAR(13),' '),CHAR(10),' '),CHAR(9),' ')";
  return `
WITH manh AS (
  SELECT TOP (${SO_MANH_TOI_DA}) ROW_NUMBER() OVER (ORDER BY (SELECT 1)) AS i
  FROM sys.all_objects
)
SELECT
  p.topic_id                             AS topic_id,
  p.thu_tu                               AS thu_tu,
  p.post_id                              AS post_id,
  RTRIM(p.nguoi_viet)                    AS nguoi_viet,
  CONVERT(VARCHAR(10), p.ngay_viet, 120) AS ngay_viet,
  LEN(p.noi_dung)                        AS len_noi_dung,
  manh.i                                 AS manh,
  CAST(SUBSTRING(${NL}, (manh.i - 1) * ${CHUNK} + 1, ${CHUNK}) AS NVARCHAR(${CHUNK})) AS noi_dung
FROM frpost p
JOIN manh ON (manh.i - 1) * ${CHUNK} < LEN(p.noi_dung)
WHERE p.topic_id IN (${ids.join(', ')})
ORDER BY p.topic_id, p.thu_tu, manh.i`.trim();
}

/** UR nào cần mở link forum — chỉ DD, và chỉ khi nội dung thật sự có link. */
export function urCanTraForum(yeuCau = []) {
  const out = [];
  for (const u of yeuCau) {
    if (chuan(u.trang_thai) !== 'DD') continue;
    const links = trichLinkForum(u.noi_dung);
    if (links.length) out.push({ stt_rec: chuan(u.stt_rec), links });
  }
  return out;
}

function qldaConnection(hub) {
  const cfg = loadQldaConfig(hub);
  const qlda = cfg?.databases?.qlda;
  if (!qlda?.path || !qlda?.databaseName) {
    throw new Error(
      'Không đọc được cấu hình kết nối QLDA (data/qlda.json → databases.qlda.path/databaseName).');
  }
  return { programPath: qlda.path, database: qlda.databaseName };
}

/**
 * Nạp nội dung forum cho các UR ở DD có link.
 *
 * Trả về map `stt_rec` → mảng topic, mỗi topic kèm `baiViet[]` ĐẦY ĐỦ (không cắt): payload là
 * thứ agent đọc để phân tích, cắt ở đây là cắt mất chính cái cần phân tích. Việc trình bày gọn
 * là chuyện của report.mjs (thu vào thẻ `<details>`), không phải chuyện của tầng dữ liệu.
 *
 * Lỗi SQL KHÔNG đánh sập báo cáo — ghi lý do vào `thieuDuLieu`, giống cách staffing.mjs làm.
 *
 * @param {string} hub
 * @param {{yeuCau: Array, maxTopic?: number}} args
 * @param {{runSql?: Function}} [deps] - để test không chạm DB
 * @returns {{theoUr: Object, soTopic: number, thieuDuLieu: string[]}}
 */
export function fetchForum(hub, args = {}, deps = {}) {
  const sqlFn = deps.runSql ?? runSql;
  const canTra = urCanTraForum(args.yeuCau ?? []);
  const thieuDuLieu = [];
  if (!canTra.length) return { theoUr: {}, soTopic: 0, thieuDuLieu };

  // Trần số topic: một lượt rà soát toàn danh mục có thể đụng rất nhiều link. Chạm trần thì
  // NÓI RA chứ không lặng lẽ cắt — báo cáo thiếu bài mà không ai biết là kiểu hỏng khó thấy nhất.
  const maxTopic = args.maxTopic ?? 40;
  const tatCaTopic = [...new Set(canTra.flatMap((u) => u.links.map((l) => l.topicId)))];
  const topicIds = tatCaTopic.slice(0, maxTopic);
  if (tatCaTopic.length > topicIds.length) {
    thieuDuLieu.push(
      `Có ${tatCaTopic.length} topic forum được nhắc tới, chỉ nạp ${topicIds.length} (trần maxTopic).`);
  }

  const byTopic = new Map();
  try {
    const { programPath, database } = qldaConnection(hub);
    const res = sqlFn({
      programPath, database, dbType: 'app', sql: sqlBaiForum(topicIds), maxRows: 8000,
    });

    // Ghép mảnh: mỗi bài là nhiều dòng cùng (topic_id, thu_tu), nối theo `manh` tăng dần.
    const byBai = new Map();
    for (const r of res.rows ?? []) {
      const khoa = `${Number(r.topic_id)}\t${Number(r.thu_tu)}`;
      const cu = byBai.get(khoa);
      if (cu) { cu.phan.push([Number(r.manh) || 0, r.noi_dung ?? '']); continue; }
      byBai.set(khoa, {
        topic_id: Number(r.topic_id),
        thu_tu: Number(r.thu_tu) || 0,
        post_id: Number(r.post_id) || undefined,
        nguoi_viet: chuan(r.nguoi_viet) || undefined,
        ngay_viet: chuan(r.ngay_viet) || undefined,
        noiDungLenGoc: Number(r.len_noi_dung) || undefined,
        phan: [[Number(r.manh) || 0, r.noi_dung ?? '']],
      });
    }

    const hutBai = [];
    for (const b of byBai.values()) {
      const noiDung = b.phan.sort((x, y) => x[0] - y[0]).map(([, t]) => t).join('');
      // Đối chiếu với LEN() thật của DB. Đây là lưới an toàn cuối: sqlcmd cắt lặng lẽ nên
      // KHÔNG được tin là đã lấy đủ chỉ vì câu SQL trông đúng — phải đo.
      if (b.noiDungLenGoc && noiDung.length < b.noiDungLenGoc) {
        hutBai.push(`${b.topic_id}#${b.thu_tu} (${noiDung.length}/${b.noiDungLenGoc})`);
      }
      if (!byTopic.has(b.topic_id)) byTopic.set(b.topic_id, []);
      byTopic.get(b.topic_id).push({
        thu_tu: b.thu_tu,
        post_id: b.post_id,
        nguoi_viet: b.nguoi_viet,
        ngay_viet: b.ngay_viet,
        noi_dung: noiDung,
        noiDungLenGoc: b.noiDungLenGoc,
      });
    }
    for (const posts of byTopic.values()) posts.sort((a, b) => a.thu_tu - b.thu_tu);

    if (hutBai.length) {
      thieuDuLieu.push(`Bài forum lấy về ngắn hơn độ dài thật: ${hutBai.slice(0, 5).join(', ')}`
        + `${hutBai.length > 5 ? ` và ${hutBai.length - 5} bài nữa` : ''}.`);
    }
    if (res.truncated) {
      thieuDuLieu.push('Truy vấn frpost bị cắt ở maxRows — một số bài trong topic dài có thể thiếu.');
    }
  } catch (e) {
    thieuDuLieu.push(`Không đọc được nội dung forum từ frpost: ${e.message}`);
    return { theoUr: {}, soTopic: 0, thieuDuLieu };
  }

  const theoUr = {};
  for (const u of canTra) {
    const topics = u.links
      .filter((l) => byTopic.has(l.topicId))
      .map((l) => ({ ...l, baiViet: byTopic.get(l.topicId) }));
    // Link trỏ tới topic không có trong bản sao `frpost` cũng phải nói ra — im lặng bỏ qua sẽ
    // khiến người đọc tưởng UR đó không có link nào.
    const thieu = u.links.filter((l) => !byTopic.has(l.topicId)).map((l) => l.topicId);
    if (thieu.length) {
      thieuDuLieu.push(`UR ${u.stt_rec}: topic ${thieu.join(', ')} không có trong bản sao frpost.`);
    }
    if (topics.length) theoUr[u.stt_rec] = topics;
  }
  return { theoUr, soTopic: byTopic.size, thieuDuLieu };
}
