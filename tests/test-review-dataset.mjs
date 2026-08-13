#!/usr/bin/env node
// test-review-dataset.mjs — mapper + gộp 4 result set + SQL cố định, không chạm DB.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bit, todayIso, buildReviewSql, buildReviewWhere, mergeReviewRows, datasetToPayloads,
  STATUS_MAC_DINH,
} from '../tools/lib/review-dataset.mjs';
import { validatePayload, validatePortfolioPayload, buildReportArtifact } from '../tools/lib/report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function ok(label, cond, detail) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!cond) failures++;
}

process.stdout.write('=== bit / todayIso ===\n');
ok('bit 1 → true', bit(1) === true);
ok('bit "0" → false', bit('0') === false);
ok('todayIso local YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(todayIso()));

process.stdout.write('\n=== SQL cố định ===\n');
const filters = { project: 'DEMO1', pmName: '', pmDept: '', statusList: STATUS_MAC_DINH };
const sqls = buildReviewSql(filters);
ok('Có đủ 4 câu', sqls.yeuCau && sqls.daumuc && sqls.han && sqls.duAn);
ok('yeuCau đọc nbphyc', sqls.yeuCau.includes('FROM nbphyc yc'));
ok('daumuc đọc nbctdaumuc', sqls.daumuc.includes('FROM nbctdaumuc'));
ok('han đọc nbcnhanhtda + MAX(ngay_ht)', sqls.han.includes('nbcnhanhtda') && sqls.han.includes('MAX(ngay_ht)'));
ok('duAn đọc nbdmda', sqls.duAn.includes('nbdmda'));
ok('Không SELECT cột cấm', !/server|xuser|xpass|db_sys/i.test(Object.values(sqls).join('\n')));
ok('WHERE có ma_da DEMO1 và DD/XN/TH',
  buildReviewWhere(filters).includes("RTRIM(yc.ma_da) = 'DEMO1'")
  && buildReviewWhere(filters).includes("'DD'")
  && buildReviewWhere(filters).includes("'TH'"));

process.stdout.write('\n=== mergeReviewRows ===\n');
const merged = mergeReviewRows({
  yeuCauRows: [
    {
      stt_rec: 'A0001YC1', ma_da: 'DEMO1', fcode1: 'UR-01', noi_dung: 'Them cot ty_gia_hq',
      noi_dung_len: 20, giai_doan_da: 'DV', trang_thai: 'DD', menu_id: '04.01.01',
      sysid: 'SVTran', tlks_yn: '1', trang_tlks: 'tr.31', ur_ma_lt1: 'PM01',
      ur_bp_lt: 'FSD', tg_dk_th: 8,
    },
    {
      stt_rec: 'A0002YC1', ma_da: 'DEMO1', fcode1: 'UR-02', noi_dung: 'Dang lam',
      noi_dung_len: 8, giai_doan_da: 'DV', trang_thai: 'XN', menu_id: '',
      sysid: '', tlks_yn: '0', trang_tlks: '', ur_ma_lt1: 'CUONGTQ',
      ur_bp_lt: 'FSD', tg_dk_th: 4,
    },
    {
      stt_rec: 'A0003YC1', ma_da: 'DEMO4', fcode1: 'App007', noi_dung: 'Ton kho',
      noi_dung_len: 7, giai_doan_da: 'DR03', trang_thai: 'TH', menu_id: 'M20',
      sysid: '', tlks_yn: 1, trang_tlks: 'TLKS tr.7', ur_ma_lt1: 'HOATV',
      ur_bp_lt: 'FSD', tg_dk_th: 0,
    },
  ],
  daumucRows: [
    { stt_rec: 'A0001YC1', stt_rec0: 'D01', ma_daumuc: 'CT', ten_daumuc: 'Them/sua chung tu', so_luong: 2, stt: 1 },
    { stt_rec: 'A0001YC1', stt_rec0: 'D02', ma_daumuc: 'IM', ten_daumuc: 'Import', so_luong: 2, stt: 2 },
  ],
  hanRows: [
    { ma_da: 'DEMO1', giai_doan_da: 'DV', ngay_ht: '2026-08-14', xac_nhan_da_hen_yn: '1', noi_dung: 'Gap kip' },
    { ma_da: 'DEMO4', giai_doan_da: 'DR03', ngay_ht: '2026-08-07', xac_nhan_da_hen_yn: '0', noi_dung: 'App' },
  ],
  duAnRows: [
    { ma_da: 'DEMO1', ten_ngan: 'DEMO CO', ma_pbsp: 'FBISP2422', bp_lt: 'FSD', ma_lt1: 'PM01', ma_lt2: '', ma_lt3: '' },
    { ma_da: 'DEMO4', ten_ngan: 'Hoa TP', ma_pbsp: 'SP229', bp_lt: 'FSD', ma_lt1: 'PM01', ma_lt2: 'NV01', ma_lt3: '' },
  ],
});

ok('2 dự án', merged.projects.length === 2, `n=${merged.projects.length}`);
ok('3 UR không nhân đôi theo đầu mục', merged.yeuCau.length === 3);
const u1 = merged.yeuCau.find((u) => u.stt_rec === 'A0001YC1');
ok('UR DD có 2 đầu mục', u1?.daumuc.length === 2);
ok('Mỗi đầu mục giữ đúng ma_daumuc', u1?.daumuc.map((d) => d.ma_daumuc).sort().join() === 'CT,IM');
ok('Hạn gắn đúng giai đoạn', u1?.ngay_ht === '2026-08-14' && bit(u1.xac_nhan_da_hen_yn) === true);
ok('ltql dự án DEMO1', merged.projects.find((p) => p.ma_da === 'DEMO1')?.ltql.join() === 'PM01');

process.stdout.write('\n=== datasetToPayloads ===\n');
const { portfolio, byProject } = datasetToPayloads(
  { projects: merged.projects, yeuCau: merged.yeuCau },
  { ngay_chay: '2026-08-13', pm: 'PM01' },
);
ok('portfolio.kind', portfolio.kind === 'portfolio');
ok('2 payload dự án', Object.keys(byProject).length === 2);
ok('validatePortfolioPayload sạch', validatePortfolioPayload(portfolio).length === 0,
  validatePortfolioPayload(portfolio).join(' | '));

const cbvn = byProject.DEMO1;
const fatalCbvn = validatePayload(cbvn).filter((e) => !e.includes('nhanSu') && !e.includes('menu_id'));
ok('DEMO1 có 2 UR', cbvn.yeuCau.length === 2);
const ur01 = cbvn.yeuCau.find((u) => u.stt_rec === 'A0001YC1');
ok('maDaumuc mang mã đầu mục xuống payload báo cáo (cho nhanDienBaoCaoDauRa)',
  ur01?.maDaumuc?.sort().join() === 'CT,IM', JSON.stringify(ur01?.maDaumuc));
ok('UR không có đầu mục -> maDaumuc rỗng, không lỗi',
  Array.isArray(cbvn.yeuCau.find((u) => u.stt_rec !== 'A0001YC1')?.maDaumuc));
ok('DEMO1 có giai đoạn DV + hạn', cbvn.giaiDoan.length === 1 && cbvn.giaiDoan[0].ngay_ht === '2026-08-14');
ok('XN vẫn vào báo cáo (theo dõi hạn)', cbvn.yeuCau.some((u) => u.trang_thai === 'XN'));
ok('deXuat không tự sinh', cbvn.yeuCau.every((u) => !u.deXuat));

const { artifact, errors } = buildReportArtifact(cbvn, undefined, { ignoreQuality: true });
ok('buildReportArtifact ignoreQuality ra HTML', Boolean(artifact?.content) && errors.length === 0,
  errors.join(' | '));

process.stdout.write('\n=== CLI report không bắt buộc payload ===\n');
const cli = fs.readFileSync(path.join(ROOT, 'tools', '4ai.mjs'), 'utf8');
ok('Không còn fail bắt payload.json', !cli.includes("cách dùng: report <payload.json>"));
ok('USAGE có report không argument', cli.includes('node tools/4ai.mjs report             lấy dataset UR cố định'));
ok('Có --project', cli.includes('project: { type: \'string\' }'));
ok('Có --dept', cli.includes('dept: { type: \'string\' }'));

process.stdout.write('\n');
process.exit(failures ? 1 : 0);
