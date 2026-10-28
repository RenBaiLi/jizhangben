// 逻辑自测:模拟 app.js 的核心计算与导出结构(不依赖浏览器)
'use strict';

// --- 数据层(拷贝自 app.js,localStorage 换成内存) ---
const fresh = () => ({ settings: { wifeName: '媳妇', meName: '我', initialBalance: 0, mode: 'couple' }, months: {} });
let DB = fresh();
const isSolo = () => DB.settings.mode === 'solo';
const r2 = n => Math.round((+n || 0) * 100) / 100;
const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function mData(y, m, create) {
  const k = key(y, m);
  let d = DB.months[k];
  if (!d && create) { d = { wifeSalary: 0, meSalary: 0, expenses: [], incomes: [] }; DB.months[k] = d; }
  return d || { wifeSalary: 0, meSalary: 0, expenses: [], incomes: [] };
}
function totals(y, m) {
  const d = mData(y, m);
  const wExp = d.expenses.filter(e => e.person === 'wife').reduce((s, e) => s + e.amount, 0);
  const mExp = d.expenses.filter(e => e.person === 'me').reduce((s, e) => s + e.amount, 0);
  const oExp = d.expenses.filter(e => e.person === 'other').reduce((s, e) => s + e.amount, 0);
  const oi = d.incomes.reduce((s, e) => s + e.amount, 0);
  return {
    wifeSalary: r2(d.wifeSalary), meSalary: r2(d.meSalary), otherIncome: r2(oi),
    income: r2(d.wifeSalary + d.meSalary + oi),
    wifeExp: r2(wExp), meExp: r2(mExp), otherExp: r2(oExp), expense: r2(wExp + mExp + oExp)
  };
}
function carryover(y, m) {
  let bal = r2(DB.settings.initialBalance);
  const target = key(y, m);
  for (const k of Object.keys(DB.months).sort()) {
    if (k >= target) continue;
    const t = totals(+k.slice(0, 4), +k.slice(5, 7));
    bal = r2(bal + t.income - t.expense);
  }
  return bal;
}
const balance = (y, m) => { const t = totals(y, m); return r2(carryover(y, m) + t.income - t.expense); };

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const ok = Math.abs(actual - expected) < 0.001;
  if (ok) { pass++; } else { fail++; console.log(`FAIL ${name}: got ${actual}, want ${expected}`); }
}

// --- 场景 ---
DB.settings.initialBalance = 10000;
// 1月: 媳妇8000 我12000 其他500; 支出 媳妇3000 我4000
let d = mData(2026, 1, true);
d.wifeSalary = 8000; d.meSalary = 12000;
d.incomes.push({ id: uid(), date: '2026-01-20', source: '红包', amount: 500, note: '' });
d.expenses.push({ id: uid(), date: '2026-01-10', person: 'wife', amount: 3000, note: '买菜' });
d.expenses.push({ id: uid(), date: '2026-01-15', person: 'me', amount: 4000, note: '房贷' });
d.expenses.push({ id: uid(), date: '2026-01-18', person: 'other', amount: 600, note: '随礼' });

eq(carryover(2026, 1), 10000, '1月结转=初始');
let t1 = totals(2026, 1);
eq(t1.income, 20500, '1月收入合计');
eq(t1.wifeExp, 3000, '媳妇支出');
eq(t1.meExp, 4000, '我的支出');
eq(t1.otherExp, 600, '1月其他支出');
eq(t1.expense, 7600, '1月支出合计');
eq(balance(2026, 1), 10000 + 20500 - 7600, '1月结余=22900');

// 2月只发工资
d = mData(2026, 2, true);
d.wifeSalary = 8000; d.meSalary = 12000;
eq(carryover(2026, 2), 22900, '2月结转=1月结余');
eq(balance(2026, 2), 22900 + 20000, '2月结余=42900');

// 跨年: 2027年1月结转=2026年12月结余(12月空账)
eq(carryover(2027, 1), 42900, '跨年结转');

// 支出记录在别的年份不影响
d = mData(2026, 6, true);
d.expenses.push({ id: uid(), date: '2026-06-01', person: 'wife', amount: 1000, note: '618' });
eq(balance(2026, 6), 42900 - 1000, '6月结余扣掉618');
eq(balance(2026, 5), 42900, '5月不受6月影响');

// 精确到分
d.expenses.push({ id: uid(), date: '2026-06-02', person: 'me', amount: 33.33, note: '午饭' });
eq(totals(2026, 6).meExp, 33.33, '小数金额');
eq(balance(2026, 6), 41900 - 33.33, '小数结余');

// 其他支出
d.expenses.push({ id: uid(), date: '2026-06-03', person: 'other', amount: 200, note: '随礼' });
eq(totals(2026, 6).otherExp, 200, '其他支出单列');
eq(totals(2026, 6).expense, 1000 + 33.33 + 200, '其他支出计入合计');
eq(balance(2026, 6), 41900 - 33.33 - 200, '其他支出影响结余');

// --- 导出结构测试(用真实 xlsx 库) ---
const XLSX = require('xlsx');
const wn = '媳妇', mn = '我';
const put = (ws, r1, c1, cell) => { ws[XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 })] = cell; };
function buildExport(Y) {
  const MONEY = '¥#,##0.00', DFMT = 'm"月"d"日"';
  const wb = XLSX.utils.book_new();
  const S = v => ({ t: 's', v: String(v) });
  const N = v => ({ t: 'n', v: r2(v), z: MONEY });
  const F = (f, v) => ({ t: 'n', f: f.replace(/^=/, ''), v: r2(v || 0), z: MONEY });
  const DT = ds => { const [a, b, c] = ds.split('-').map(Number); return { t: 'd', v: new Date(a, b - 1, c), z: DFMT }; };
  const solo = isSolo();

  const sum = {};
  put(sum, 1, 1, S(`${Y}年 家庭收支年度汇总`));
  put(sum, 3, 1, S('年初初始结余:'));
  put(sum, 3, 2, N(carryover(Y, 1)));
  const headRow = solo
    ? ['月份', '上月结转', `${mn}工资`, '其他收入', '收入合计',
       `${mn}支出`, '其他支出', '支出合计', '当月存下', '本月结余', '备注']
    : ['月份', '上月结转', `${wn}工资`, `${mn}工资`, '其他收入', '收入合计',
       `${wn}支出`, `${mn}支出`, '其他支出', '支出合计', '当月存下', '本月结余', '备注'];
  headRow.forEach((h, i) => put(sum, 5, 1 + i, S(h)));
  for (let m = 1; m <= 12; m++) {
    const r = 5 + m, t = totals(Y, m);
    put(sum, r, 1, S(`${m}月`));
    put(sum, r, 2, N(carryover(Y, m)));
    if (solo) {
      put(sum, r, 3, N(t.meSalary));
      put(sum, r, 4, N(t.otherIncome));
      put(sum, r, 5, N(t.income));
      put(sum, r, 6, N(t.meExp));
      put(sum, r, 7, N(t.otherExp));
      put(sum, r, 8, N(t.expense));
      put(sum, r, 9, N(t.income - t.expense));
      put(sum, r, 10, N(balance(Y, m)));
    } else {
      put(sum, r, 3, N(t.wifeSalary));
      put(sum, r, 4, N(t.meSalary));
      put(sum, r, 5, N(t.otherIncome));
      put(sum, r, 6, N(t.income));
      put(sum, r, 7, N(t.wifeExp));
      put(sum, r, 8, N(t.meExp));
      put(sum, r, 9, N(t.otherExp));
      put(sum, r, 10, N(t.expense));
      put(sum, r, 11, N(t.income - t.expense));
      put(sum, r, 12, N(balance(Y, m)));
    }
  }
  put(sum, 18, 1, S('全年合计')); put(sum, 18, 2, S('—'));
  const yr = { in: 0, out: 0 };
  for (let m = 1; m <= 12; m++) { const tt = totals(Y, m); yr.in = r2(yr.in + tt.income); yr.out = r2(yr.out + tt.expense); }
  const bal12 = balance(Y, 12);
  if (solo) {
    put(sum, 18, 3, N(yr.in)); put(sum, 18, 4, N(yr.in)); put(sum, 18, 5, N(yr.in));
    put(sum, 18, 6, N(yr.out)); put(sum, 18, 7, N(yr.out)); put(sum, 18, 8, N(yr.out));
    put(sum, 18, 9, N(yr.in - yr.out));
    put(sum, 18, 10, N(bal12));
    put(sum, 18, 11, S('← 存下=全年收入-支出'));
  } else {
    put(sum, 18, 3, N(yr.in)); put(sum, 18, 4, N(yr.in)); put(sum, 18, 5, N(yr.in)); put(sum, 18, 6, N(yr.in));
    put(sum, 18, 7, N(yr.out)); put(sum, 18, 8, N(yr.out)); put(sum, 18, 9, N(yr.out)); put(sum, 18, 10, N(yr.out));
    put(sum, 18, 11, N(yr.in - yr.out));
    put(sum, 18, 12, N(bal12));
    put(sum, 18, 13, S('← 存下=全年收入-支出'));
  }
  const lastC = solo ? 10 : 12;
  sum['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 17, c: lastC } });
  sum['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastC } }, { s: { r: 2, c: 2 }, e: { r: 2, c: lastC } }];
  XLSX.utils.book_append_sheet(wb, sum, '年度汇总');

  for (let m = 1; m <= 12; m++) {
    const ws = {}, dd = mData(Y, m);
    const exps = [...dd.expenses].sort((a, b) => a.date.localeCompare(b.date));
    const incs = [...dd.incomes].sort((a, b) => a.date.localeCompare(b.date));
    const expRows = Math.max(50, exps.length), incRows = Math.max(15, incs.length);
    const off = solo ? 2 : 0;
    const expS = 20 - off, expE = 19 + expRows - off;
    const secI = expE + 2, hdrI = secI + 1, incS = hdrI + 1, incE = incS + incRows - 1;
    put(ws, 1, 1, S(`${Y}年${m}月 家庭收支明细`));
    put(ws, 3, 1, S('一、收入情况'));
    const t = totals(Y, m);
    put(ws, 4, 1, S('上月结余结转')); put(ws, 4, 2, N(carryover(Y, m)));
    if (solo) {
      put(ws, 5, 1, S(`${mn}工资`)); if (dd.meSalary) put(ws, 5, 2, N(dd.meSalary));
      put(ws, 6, 1, S('其他收入')); put(ws, 6, 2, N(t.otherIncome));
      put(ws, 7, 1, S('本月收入合计')); put(ws, 7, 2, N(t.income));
      put(ws, 9, 1, S('二、支出情况'));
      put(ws, 10, 1, S(`${mn}支出`)); put(ws, 10, 2, N(t.meExp));
      put(ws, 11, 1, S('其他支出')); put(ws, 11, 2, N(t.otherExp));
      put(ws, 12, 1, S('本月支出合计')); put(ws, 12, 2, N(t.expense));
      put(ws, 14, 1, S('本月结余(还剩多少钱)')); put(ws, 14, 2, N(balance(Y, m)));
      put(ws, 16, 1, S('三、支出明细(每笔支出一行,备注写花在哪了)'));
      ['日期', '支出人', '金额(元)', '备注(花在哪了)'].forEach((h, i) => put(ws, 17, 1 + i, S(h)));
    } else {
      put(ws, 5, 1, S(`${wn}工资`)); if (dd.wifeSalary) put(ws, 5, 2, N(dd.wifeSalary));
      put(ws, 6, 1, S(`${mn}工资`)); if (dd.meSalary) put(ws, 6, 2, N(dd.meSalary));
      put(ws, 7, 1, S('其他收入')); put(ws, 7, 2, N(t.otherIncome));
      put(ws, 8, 1, S('本月收入合计')); put(ws, 8, 2, N(t.income));
      put(ws, 10, 1, S('二、支出情况'));
      put(ws, 11, 1, S(`${wn}支出`)); put(ws, 11, 2, N(t.wifeExp));
      put(ws, 12, 1, S(`${mn}支出`)); put(ws, 12, 2, N(t.meExp));
      put(ws, 13, 1, S('其他支出')); put(ws, 13, 2, N(t.otherExp));
      put(ws, 14, 1, S('本月支出合计')); put(ws, 14, 2, N(t.expense));
      put(ws, 16, 1, S('本月结余(还剩多少钱)')); put(ws, 16, 2, N(balance(Y, m)));
      put(ws, 18, 1, S('三、支出明细(每笔支出一行,备注写花在哪了)'));
      ['日期', '支出人', '金额(元)', '备注(花在哪了)'].forEach((h, i) => put(ws, 19, 1 + i, S(h)));
    }
    exps.forEach((e, i) => {
      const r = expS + i;
      put(ws, r, 1, DT(e.date));
      put(ws, r, 2, S(e.person === 'wife' ? wn : e.person === 'me' ? mn : '其他'));
      put(ws, r, 3, N(e.amount));
      put(ws, r, 4, S(e.note || ''));
    });
    put(ws, secI, 1, S('四、其他收入明细(工资以外的收入)'));
    ['日期', '来源(谁/什么收入)', '金额(元)', '备注'].forEach((h, i) => put(ws, hdrI, 1 + i, S(h)));
    incs.forEach((e, i) => {
      const r = incS + i;
      put(ws, r, 1, DT(e.date));
      put(ws, r, 2, S(e.source || ''));
      put(ws, r, 3, N(e.amount));
      put(ws, r, 4, S(e.note || ''));
    });
    const eN = incE - 1;
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: eN, c: 3 } });
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 9 - off, c: 0 }, e: { r: 9 - off, c: 3 } },
      { s: { r: 17 - off, c: 0 }, e: { r: 17 - off, c: 3 } },
      { s: { r: secI - 1, c: 0 }, e: { r: secI - 1, c: 3 } }
    ];
    ws['!cols'] = [14, 16, 14, 42].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, `${m}月`);
  }
  return wb;
}

const wb = buildExport(2026);
if (wb.SheetNames.length === 13 && wb.SheetNames[0] === '年度汇总' && wb.SheetNames[12] === '12月') {
  pass++; console.log('导出: 13个工作表,顺序正确');
} else { fail++; console.log('FAIL 导出表结构', wb.SheetNames); }

const jan = wb.Sheets['1月'];
const checks = {
  'B4(1月结转数值)': jan['B4'] && jan['B4'].v === 10000,
  'B5(媳妇工资)': jan['B5'] && jan['B5'].v === 8000,
  'B6(我的工资)': jan['B6'] && jan['B6'].v === 12000,
  'B7(其他收入数值)': jan['B7'] && jan['B7'].v === 500,
  'B8(收入合计数值)': jan['B8'] && jan['B8'].v === 20500,
  'B11(媳妇支出数值)': jan['B11'] && jan['B11'].v === 3000,
  'B12(我的支出数值)': jan['B12'] && jan['B12'].v === 4000,
  'B13(其他支出数值)': jan['B13'] && jan['B13'].v === 600,
  'B14(支出合计数值)': jan['B14'] && jan['B14'].v === 7600,
  'B16(结余数值)': jan['B16'] && jan['B16'].v === 22900,
  '明细B20=媳妇': jan['B20'].v === '媳妇',
  '明细C20=3000': jan['C20'].v === 3000,
  '明细A20是日期': jan['A20'].t === 'd',
  '明细B22=其他': jan['B22'].v === '其他',
  '明细C22=600': jan['C22'].v === 600
};
for (const [name, ok] of Object.entries(checks)) {
  if (ok) pass++; else { fail++; console.log('FAIL', name, JSON.stringify(jan[name.split('(')[0]])); }
}
const feb = wb.Sheets['2月'];
if (feb['B4'].v === 22900) pass++; else { fail++; console.log('FAIL 2月结转数值', feb['B4']); }
function yrSaved(Y) { let s = 0; for (let m = 1; m <= 12; m++) { const t = totals(Y, m); s = r2(s + t.income - t.expense); } return s; }
const sm = wb.Sheets['年度汇总'];
if (sm['B3'].v === 10000 && sm['L18'].v === balance(2026, 12) && sm['B6'].v === 10000 && sm['K6'].v === 12900 && sm['K18'].v === yrSaved(2026)) pass++;
else { fail++; console.log('FAIL 汇总表', JSON.stringify(sm['B3']), JSON.stringify(sm['L18']), JSON.stringify(sm['B6']), JSON.stringify(sm['K6']), JSON.stringify(sm['K18'])); }

XLSX.writeFile(wb, __dirname + '/_test_export.xlsx');
console.log('已写出 _test_export.xlsx 供人工核对');

// --- 单人模式 ---
DB.settings.mode = 'solo';
eq(totals(2026, 1).income, 20500, 'solo: 1月收入不变(媳妇工资仍计入)');
eq(totals(2026, 1).expense, 7600, 'solo: 1月支出不变(媳妇支出仍计入)');
eq(balance(2026, 1), 22900, 'solo: 结余不变');

const wbS = buildExport(2026);
const smS = wbS.Sheets['年度汇总'];
const sc = {  // solo 汇总表头应有 11 列(A..K), 没有 L
  '表头C=我工资': smS['C5'].v === '我工资',
  '表头I=当月存下': smS['I5'].v === '当月存下',
  '表头J=本月结余': smS['J5'].v === '本月结余',
  '表头K=备注': smS['K5'].v === '备注',
  '没有L列表头': !smS['L5'],
  '1月C=我工资数值': smS['C6'].v === 12000,
  '1月E=收入合计': smS['E6'].v === 20500,
  '1月I=当月存下': smS['I6'].v === 12900,
  '1月J=本月结余': smS['J6'].v === 22900,
  '合计行I=全年存下': smS['I18'].v === yrSaved(2026),
  '合计行J=年末结余': smS['J18'].v === balance(2026, 12),
  'ref只到K列': smS['!ref'].endsWith('K18')
};
for (const [name, ok] of Object.entries(sc)) {
  if (ok) pass++; else { fail++; console.log('FAIL solo汇总', name); }
}
const janS = wbS.Sheets['1月'];
const scj = {
  'B4=结转': janS['B4'] && janS['B4'].v === 10000,
  'B5=我工资': janS['B5'] && janS['B5'].v === 12000,
  'A6=其他收入': janS['A6'] && janS['A6'].v === '其他收入',
  'B7=收入合计': janS['B7'] && janS['B7'].v === 20500,
  'A9=二支出节': janS['A9'] && String(janS['A9'].v).indexOf('支出情况') >= 0,
  'B10=我支出': janS['B10'] && janS['B10'].v === 4000,
  'B11=其他支出': janS['B11'] && janS['B11'].v === 600,
  'B12=支出合计': janS['B12'] && janS['B12'].v === 7600,
  'B14=结余': janS['B14'] && janS['B14'].v === 22900,
  'A16=三明细节': janS['A16'] && String(janS['A16'].v).indexOf('支出明细') >= 0,
  'A17=日期表头': janS['A17'] && janS['A17'].v === '日期',
  'B18=首笔支出人': janS['B18'] && janS['B18'].v === '媳妇',
  'C18=首笔金额': janS['C18'] && janS['C18'].v === 3000,
  'B20=其他': janS['B20'] && janS['B20'].v === '其他'
};
for (const [name, ok] of Object.entries(scj)) {
  if (ok) pass++; else { fail++; console.log('FAIL solo月度', name, JSON.stringify(janS[name.split('=')[0]])); }
}
DB.settings.mode = 'couple';
eq(balance(2026, 1), 22900, '切回两人: 结余仍不变');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
