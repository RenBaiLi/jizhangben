'use strict';
/* ================= 数据层(存在本机浏览器 localStorage) ================= */
const LS_KEY = 'jzb_v1';
const fresh = () => ({ settings: { wifeName: '媳妇', meName: '我', initialBalance: 0, mode: 'couple' }, months: {} });
let DB = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY));
    if (d && d.settings && d.months) {
      if (!d.settings.mode) d.settings.mode = 'couple';
      return d;
    }
  } catch (e) {}
  return fresh();
})();
const save = () => localStorage.setItem(LS_KEY, JSON.stringify(DB));
const isSolo = () => DB.settings.mode === 'solo';
const r2 = n => Math.round((+n || 0) * 100) / 100;
const pad2 = n => (n < 10 ? '0' : '') + n;
const key = (y, m) => `${y}-${pad2(m)}`;
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
/* 某月每天的支出合计(日历热力图用) */
function dayExpMap(y, m) {
  const map = {};
  mData(y, m).expenses.forEach(e => {
    const day = +e.date.slice(8, 10);
    map[day] = r2((map[day] || 0) + e.amount);
  });
  return map;
}
/* 上月结转 = 初始资金 + 之前所有月份的(收入-支出) */
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
const pName = p => p === 'wife' ? DB.settings.wifeName : p === 'me' ? DB.settings.meName : '其他';

function findEntry(kind, id) {
  for (const k of Object.keys(DB.months)) {
    const arr = DB.months[k][kind];
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) return { k, arr, i, e: arr[i] };
  }
  return null;
}

/* ================= 工具 ================= */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => '¥' + r2(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mmdd = ds => `${+ds.slice(5, 7)}月${+ds.slice(8, 10)}日`;
function today() {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}
/* 导出文件名用的时间戳: 20261028_153045 */
function tsName() {
  const n = new Date();
  return `${n.getFullYear()}${pad2(n.getMonth() + 1)}${pad2(n.getDate())}_${pad2(n.getHours())}${pad2(n.getMinutes())}${pad2(n.getSeconds())}`;
}
/* 记一笔的默认日期:看的是本月就用今天,看其他月就用那个月的1号 */
function defDate() {
  if (curDay) return curDay;   // 在日详情页点记账, 默认就是正在看的那天
  const n = new Date();
  return (cur.y === n.getFullYear() && cur.m === n.getMonth() + 1)
    ? today() : `${cur.y}-${pad2(cur.m)}-01`;
}

/* ================= 界面状态 ================= */
const now = new Date();
let cur = { y: now.getFullYear(), m: now.getMonth() + 1 };  // 本月页当前看的月份
let curY = cur.y;                                           // 年度页当前看的年份
let curDay = null;                                          // 本月页点开的某一天(YYYY-MM-DD), null=月视图
let tab = 'month';
let modalCtx = null;

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
const fab = document.getElementById('fab');
const modalRoot = document.getElementById('modalRoot');

function setTab(t) { tab = t; if (t === 'year') curY = cur.y; curDay = null; render(); }

function render() {
  renderTop();
  view.innerHTML = tab === 'month' ? vMonth() : tab === 'year' ? vYear() : vMe();
  fab.style.display = (tab === 'month' && !curDay) ? 'flex' : 'none';
  document.querySelectorAll('#tabbar button').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === tab));
  view.scrollIntoView();
  window.scrollTo(0, 0);
}
function renderTop() {
  if (tab === 'month') {
    if (curDay) {
      const [yy, mm, dd] = curDay.split('-');
      topbar.innerHTML = `<button class="nav" data-t="backDay">‹</button><div class="t">${+mm}月${+dd}日 收支</div><button class="nav" data-t="addToday">＋</button>`;
    } else {
      topbar.innerHTML = `<button class="nav" data-t="prevM">‹</button><div class="t">${cur.y}年${cur.m}月</div><button class="nav" data-t="nextM">›</button>`;
    }
  }
  else if (tab === 'year')
    topbar.innerHTML = `<button class="nav" data-t="prevY">‹</button><div class="t">${curY}年</div><button class="nav" data-t="nextY">›</button>`;
  else
    topbar.innerHTML = `<div class="t">设置</div>`;
}

/* ================= 本月页 ================= */
const expRow = e => `<div class="row entry tap" data-act="editExp" data-id="${e.id}">
  <span class="d">${mmdd(e.date)}</span>
  <span class="chip ${e.person}">${esc(pName(e.person))}</span>
  <span class="note">${esc(e.note) || '—'}</span>
  <span class="amt">${fmt(e.amount)}</span></div>`;

const incRow = e => `<div class="row entry tap" data-act="editInc" data-id="${e.id}">
  <span class="d">${mmdd(e.date)}</span>
  <span class="chip inc">${esc(e.source) || '其他'}</span>
  <span class="note">${esc(e.note) || '—'}</span>
  <span class="amt">+${fmt(e.amount)}</span></div>`;

/* 日历热力图: 当月每天支出, 绿<100 黄<500 红>=500 */
function calHeat(y, m) {
  const dm = dayExpMap(y, m);
  const days = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1).getDay();   // 0=周日
  const off = (first + 6) % 7;                     // 转成周一开头
  const cls = v => v == null ? '' : v < 100 ? 'h1' : v < 500 ? 'h2' : 'h3';
  let cells = '';
  for (let i = 0; i < off; i++) cells += '<span class="cd"></span>';
  const todayStr = today();
  for (let d = 1; d <= days; d++) {
    const v = dm[d];
    const ds = `${y}-${pad2(m)}-${pad2(d)}`;
    const cls2 = v != null ? cls(v) : '';
    cells += `<span class="cd ${cls2} tap${ds === todayStr ? ' now' : ''}" data-act="day" data-date="${ds}" title="${d}日 ${v != null ? '支出 ' + fmt(v) : '无支出'} · 点击查看">${d}</span>`;
  }
  return `<div class="cal">
    <div class="cal-w"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
    <div class="cal-g">${cells}</div>
    <div class="cal-key"><i class="h1"></i>&lt;100 <i class="h2"></i>&lt;500 <i class="h3"></i>≥500</div>
  </div>`;
}

function vMonth() {
  if (curDay) return vDay(curDay);
  const { y, m } = cur;
  const t = totals(y, m), carry = carryover(y, m), bal = balance(y, m);
  const d = mData(y, m);
  const exps = [...d.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const incs = [...d.incomes].sort((a, b) => b.date.localeCompare(a.date));
  const wageRows = isSolo()
    ? `<div class="row tap" data-act="wage" data-p="me"><span>${esc(pName('me'))}工资</span><span class="val">${fmt(t.meSalary)} <i>›</i></span></div>`
    : `<div class="row tap" data-act="wage" data-p="wife"><span>${esc(pName('wife'))}工资</span><span class="val">${fmt(t.wifeSalary)} <i>›</i></span></div>
    <div class="row tap" data-act="wage" data-p="me"><span>${esc(pName('me'))}工资</span><span class="val">${fmt(t.meSalary)} <i>›</i></span></div>`;
  const expSub = isSolo()
    ? `${esc(pName('me'))} ${fmt(t.meExp)} · 其他 ${fmt(t.otherExp)}`
    : `${esc(pName('wife'))} ${fmt(t.wifeExp)} · ${esc(pName('me'))} ${fmt(t.meExp)} · 其他 ${fmt(t.otherExp)}`;
  return `
  <div class="card hero">
    <div class="hero-label">${y}年${m}月 结余(还剩多少钱)</div>
    <div class="hero-bal ${bal < 0 ? 'neg' : ''}">${fmt(bal)}</div>
    <div class="hero-stats">
      <div><span>上月结转</span><b>${fmt(carry)}</b></div>
      <div><span>本月收入</span><b>+${fmt(t.income)}</b></div>
      <div><span>本月支出</span><b>-${fmt(t.expense)}</b></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">收入</div>
    ${wageRows}
    <div class="row"><span>其他收入(下方明细自动汇总)</span><span class="val">${fmt(t.otherIncome)}</span></div>
    ${incs.map(incRow).join('')}
    <button class="btn ghost" data-act="addInc">＋ 添加收入</button>
    <div class="row total"><span>收入合计</span><span class="val">${fmt(t.income)}</span></div>
  </div>

  <div class="card">
    <div class="card-title">支出<small>${expSub}</small></div>
    ${exps.length ? calHeat(y, m) : ''}
    ${exps.length ? exps.map(expRow).join('') : '<div class="empty">还没有支出记录,点右下角 ＋ 记一笔</div>'}
    <div class="row total"><span>支出合计</span><span class="val">${fmt(t.expense)}</span></div>
  </div>`;
}

/* 当日收支详情页: 购物小票样式, 点日历格子跳转过来 */
function vDay(dateStr) {
  const yy = +dateStr.slice(0, 4), mm = +dateStr.slice(5, 7), dd = +dateStr.slice(8, 10);
  const d = mData(yy, mm);
  const exps = d.expenses.filter(e => e.date === dateStr).sort((a, b) => b.amount - a.amount);
  const incs = d.incomes.filter(e => e.date === dateStr);
  const expSum = r2(exps.reduce((s, e) => s + e.amount, 0));
  const incSum = r2(incs.reduce((s, e) => s + e.amount, 0));
  const net = r2(incSum - expSum);
  const wkday = ['日', '一', '二', '三', '四', '五', '六'][new Date(yy, mm - 1, dd).getDay()];

  // 收入也按金额倒序混入(让小票更像真实流水), 但用不同 chip 区分
  const expLines = exps.map(e =>
    `<div class="rct-line tap" data-act="editExp" data-id="${e.id}">
      <span class="nm">${esc(e.note) || '支出'}<i class="tag ${e.person}">${esc(pName(e.person))}</i></span>
      <span class="am">-${fmt(e.amount).slice(1)}</span>
    </div>`).join('');
  const incLines = incs.map(e =>
    `<div class="rct-line tap" data-act="editInc" data-id="${e.id}">
      <span class="nm">${esc(e.source) || '其他收入'}<i class="tag inc">${esc(e.note) || '收入'}</i></span>
      <span class="am">+${fmt(e.amount).slice(1)}</span>
    </div>`).join('');

  const body = !exps.length && !incs.length
    ? '<div class="empty">这天还没有收支记录</div>'
    : `${expLines
      }<div class="rct-dash"></div>
      <div class="rct-total"><span>支出小计</span><span class="am">${fmt(expSum).slice(1)}</span></div>`
      + (incLines
        ? `${incLines}<div class="rct-dash"></div>
          <div class="rct-total"><span>收入小计</span><span class="am">${fmt(incSum).slice(1)}</span></div>`
        : '');

  return `
  <div class="receipt">
    <div class="rct-head">
      <div class="store">记 账 日 报</div>
      <div class="date">${yy}-${pad2(mm)}-${pad2(dd)} 周${wkday}</div>
      <div class="sub">当日收支小票</div>
    </div>
    ${exps.length ? '<div class="rct-sec">- - - 支 出 - - -</div>' : ''}
    ${body}
    <div class="rct-dash"></div>
    <div class="rct-net ${net < 0 ? 'neg' : ''}">
      <span>当天净额</span><span class="am">${net < 0 ? '-' : '+'}${fmt(Math.abs(net)).slice(1)}</span>
    </div>
    <div class="rct-foot">谢谢惠顾 · 点行可编辑 · 点 ＋ 记今日<br>长按小票或点 ‹ 返回月视图</div>
  </div>`;
}

/* 年度页月度收支柱状图: 绿=收入 红=支出, 同月成对 */
function yearBars(Y) {
  let max = 0;
  const list = [];
  for (let m = 1; m <= 12; m++) {
    const t = totals(Y, m);
    list.push(t);
    if (t.income > max) max = t.income;
    if (t.expense > max) max = t.expense;
  }
  if (!max) return '<div class="empty">今年还没有记录</div>';
  let cols = '';
  list.forEach((t, i) => {
    const hi = Math.round(t.income / max * 100), ho = Math.round(t.expense / max * 100);
    cols += `<div class="yb-col" data-act="gotoM" data-m="${i + 1}" title="${i + 1}月 收入 ${fmt(t.income)} / 支出 ${fmt(t.expense)}">
      <div class="yb-bars"><i class="in" style="height:${hi}%"></i><i class="out" style="height:${ho}%"></i></div>
      <span>${i + 1}</span>
    </div>`;
  });
  return `<div class="ybars">${cols}</div>
  <div class="cal-key"><i class="yb-k-in"></i>收入 <i class="yb-k-out"></i>支出</div>`;
}

/* ================= 年度页 ================= */

/* 累计结余走势图: SVG 折线, 12 个月月末结余 */
function balTrend(Y) {
  const pts = [];
  let has = false;
  for (let m = 1; m <= 12; m++) {
    const b = balance(Y, m);
    pts.push(b);
    if (b !== 0 || mData(Y, m).expenses.length || mData(Y, m).incomes.length
        || mData(Y, m).wifeSalary || mData(Y, m).meSalary) has = true;
  }
  if (!has) return '';
  const W = 320, H = 120, PL = 8, PR = 8, PT = 10, PB = 18;
  const iw = W - PL - PR, ih = H - PT - PB;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = (max - min) || 1;
  const x = i => PL + iw * i / 11;
  const y = v => PT + ih * (1 - (v - min) / span);
  const path = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = pts.map((v, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="#2f9e44"><title>${i + 1}月 ${fmt(v)}</title></circle>`
  ).join('');
  const labs = pts.map((v, i) =>
    `<text x="${x(i).toFixed(1)}" y="${H - 4}" font-size="9" fill="#8e8e93" text-anchor="middle">${i + 1}</text>`
  ).join('');
  const minLab = `<text x="${PL}" y="${PT + 8}" font-size="9" fill="#8e8e93">${fmt(max)}</text>`;
  const maxLab = `<text x="${PL}" y="${PT + ih}" font-size="9" fill="#8e8e93">${fmt(min)}</text>`;
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${minLab}${maxLab}
    <path d="${path}" fill="none" stroke="#2f9e44" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${labs}
  </svg>`;
}

/* 年度大额支出 TOP10: 全年支出按金额倒序前 10 笔 */
function topExp(Y) {
  const all = [];
  for (let m = 1; m <= 12; m++) mData(Y, m).expenses.forEach(e => all.push(e));
  if (!all.length) return '<div class="empty">今年还没有支出记录</div>';
  all.sort((a, b) => b.amount - a.amount);
  const medal = ['🥇', '🥈', '🥉'];
  return all.slice(0, 10).map((e, i) => `<div class="row tentry">
    <span class="rank ${i < 3 ? 'r' + (i + 1) : ''} ${i < 3 ? 'medal' : ''}">${i < 3 ? medal[i] : (i + 1)}</span>
    <span class="d">${mmdd(e.date)}</span>
    <span class="chip ${e.person}">${esc(pName(e.person))}</span>
    <span class="note">${esc(e.note) || '—'}</span>
    <span class="amt">${fmt(e.amount)}</span></div>`).join('');
}

function vYear() {
  const Y = curY;
  let rows = '', sumIn = 0, sumOut = 0;
  rows += `<div class="row yrow yhead">
    <span class="d">月份</span>
    <span class="yc">收入</span>
    <span class="yc">支出</span>
    <span class="yc">当月结余</span>
    <span class="yc">累计结余</span></div>`;
  for (let m = 1; m <= 12; m++) {
    const t = totals(Y, m), b = balance(Y, m);
    const mSave = r2(t.income - t.expense);
    sumIn = r2(sumIn + t.income); sumOut = r2(sumOut + t.expense);
    rows += `<div class="row yrow tap" data-act="gotoM" data-m="${m}">
      <span class="d">${m}月</span>
      <span class="yc">${fmt(t.income)}</span>
      <span class="yc">${fmt(t.expense)}</span>
      <span class="yc bal ${mSave < 0 ? 'neg' : ''}">${fmt(mSave)}</span>
      <span class="yc cum ${b < 0 ? 'neg' : ''}">${fmt(b)}</span></div>`;
  }
  const yearEnd = balance(Y, 12);
  rows += `<div class="row yrow yfoot">
    <span class="d">合计</span>
    <span class="yc bal">${fmt(sumIn)}</span>
    <span class="yc bal">${fmt(sumOut)}</span>
    <span class="yc bal">${fmt(r2(sumIn - sumOut))}</span>
    <span class="yc cum ${yearEnd < 0 ? 'neg' : ''}">${fmt(yearEnd)}</span></div>`;
  return `
  <div class="card">
    <div class="row tap" data-act="init"><span>初始资金(开始记账时的积蓄)</span><span class="val">${fmt(DB.settings.initialBalance)} <i>›</i></span></div>
    <div class="row"><span>全年收入</span><span class="val">+${fmt(sumIn)}</span></div>
    <div class="row"><span>全年支出</span><span class="val">-${fmt(sumOut)}</span></div>
    <div class="row total"><span>年末结余(12月底)</span><span class="val ${yearEnd < 0 ? 'neg' : ''}">${fmt(yearEnd)}</span></div>
  </div>
  <div class="card">
    <div class="card-title">收支对比<small>点柱子看该月明细</small></div>
    ${yearBars(Y)}
  </div>
  <div class="card">
    <div class="card-title">累计结余走势<small>每月末钱包余额</small></div>
    ${balTrend(Y) || '<div class="empty">今年还没有记录</div>'}
  </div>
  <div class="card">
    <div class="card-title">大额支出 TOP10<small>全年最贵的 10 笔</small></div>
    ${topExp(Y)}
  </div>
  <div class="card">
    <div class="card-title">${Y}年 每月一览<small>点月份看明细</small></div>
    ${rows}
  </div>
    <button class="btn primary big" data-act="export">导出 Excel</button>
  </div>`;
}

/* ================= 我的页 ================= */
function vMe() {
  const solo = isSolo();
  return `
  <div class="card">
    <div class="card-title">称呼 <small>两人各用各的手机时改这里</small></div>
    ${solo ? '' : `<div class="row"><span>媳妇显示为</span><input class="mini" data-set="wifeName" value="${esc(DB.settings.wifeName)}" maxlength="6"></div>`}
    <div class="row"><span>我显示为</span><input class="mini" data-set="meName" value="${esc(DB.settings.meName)}" maxlength="6"></div>
  </div>
  <div class="card">
    <div class="card-title">数据 <small>本机存储 · 不上传服务器</small></div>
    <div class="row tap" data-act="init"><span>初始资金</span><span class="val">${fmt(DB.settings.initialBalance)} <i>›</i></span></div>
    <div class="row tap" data-act="mode"><span>记账模式</span><span class="val">${solo ? '🧍 一人' : '👫 两人'} <i>›</i></span></div>
  </div>
  <div class="card">
    <div class="card-title">备份与导出</div>
    <button class="btn ghost" data-act="backup">📤 备份数据 (导出JSON)</button>
    <label class="btn ghost">📥 恢复备份 (导入JSON)<input type="file" id="restoreFile" accept=".json,application/json" hidden></label>
    <button class="btn danger" data-act="wipe">🗑 清空全部数据</button>
    <button class="btn primary" data-act="export">📊 导出 Excel</button>
  </div>
  <div class="card about">
    <div class="card-title">关于 · 曾老师记账法</div>
    <div class="preface">
      <p>月初雄心壮志,月中开始摆烂,月末全靠回忆和猜。</p>
      <p>收入?记得。哪天进的?不知道。谁花的?可能是猫。</p>
      <p>鉴于本家庭财政已经混乱到需要考古学家介入,本人推出这款记账神器。曾老师记的账,我愿称之为《甲骨文复习资料》。</p>
      <p>为了让这个家还能算清谁欠谁一顿火锅,本人亲自下场开发了本软件。因为穷,服务器租不起,数据全靠手机本地硬存——摔一次手机,咱家直接财务清零,重新开始投胎(记过一次大账后,请记得及时导出备份数据)。</p>
      <p class="ver">v1.0 首发即绝版。<br>后续更新?理论上会。实际上不会。敬请别太期待 🙏</p>
    </div>
  </div>`;
}

/* ================= 弹层 ================= */
function openModal(html) {
  modalRoot.innerHTML = `<div class="mask"><div class="sheet">${html}</div></div>`;
}
function closeModal() { modalRoot.innerHTML = ''; modalCtx = null; }

function numModal(title, val, ctx) {
  modalCtx = ctx;
  openModal(`
    <div class="sheet-title">${esc(title)}</div>
    <input id="m-num" type="text" inputmode="decimal" value="${val || ''}" placeholder="0.00">
    <div class="sheet-btns">
      <button class="btn ghost" data-mclose>取消</button>
      <button class="btn primary" data-msave>保存</button>
    </div>`);
  setTimeout(() => { const i = document.getElementById('m-num'); if (i) i.focus(); }, 80);
}

function modeModal() {
  const solo = isSolo();
  openModal(`
    <div class="sheet-title">记账模式</div>
    <div class="seg">
      <button type="button" data-set-mode="couple" class="${!solo ? 'on wife' : ''}">👫 两人</button>
      <button type="button" data-set-mode="solo" class="${solo ? 'on me' : ''}">🧍 一人</button>
    </div>
    <p class="hint">一人模式下媳妇那一路不显示,数据仍保留,切回两人即可看到</p>
    <div class="sheet-btns">
      <button class="btn ghost" data-mclose>关闭</button>
    </div>`);
}

function expModal(e) {
  const solo = isSolo();
  let person = e ? e.person : (solo ? 'me' : 'wife');
  if (solo && person === 'wife') person = 'me';
  modalCtx = { kind: 'exp', id: e ? e.id : null, person };
  const segBtns = solo
    ? `<button type="button" data-mp="me" class="${person === 'me' ? 'on me' : ''}">${esc(pName('me'))}</button>
       <button type="button" data-mp="other" class="${person === 'other' ? 'on other' : ''}">其他</button>`
    : `<button type="button" data-mp="wife" class="${person === 'wife' ? 'on wife' : ''}">${esc(pName('wife'))}</button>
       <button type="button" data-mp="me" class="${person === 'me' ? 'on me' : ''}">${esc(pName('me'))}</button>
       <button type="button" data-mp="other" class="${person === 'other' ? 'on other' : ''}">其他</button>`;
  openModal(`
    <div class="sheet-title">${e ? '编辑支出' : '记一笔支出'}</div>
    <div class="seg">${segBtns}</div>
    <input id="m-amount" type="text" inputmode="decimal" placeholder="金额(元)" value="${e ? e.amount : ''}">
    <input id="m-date" type="date" value="${e ? e.date : defDate()}">
    <input id="m-note" type="text" maxlength="50" placeholder="备注:花在哪了(如 午饭 / 房贷)" value="${e ? esc(e.note) : ''}">
    <div class="sheet-btns">
      ${e ? '<button class="btn danger" data-mdel>删除</button>' : ''}
      <button class="btn ghost" data-mclose>取消</button>
      <button class="btn primary" data-msave>保存</button>
    </div>`);
  setTimeout(() => { const i = document.getElementById('m-amount'); if (i) i.focus(); }, 80);
}

function incModal(e) {
  modalCtx = { kind: 'inc', id: e ? e.id : null };
  openModal(`
    <div class="sheet-title">${e ? '编辑收入' : '记一笔收入'}</div>
    <input id="m-source" type="text" maxlength="20" placeholder="来源(如 年终奖 / 红包 / 利息)" value="${e ? esc(e.source) : ''}">
    <input id="m-amount" type="text" inputmode="decimal" placeholder="金额(元)" value="${e ? e.amount : ''}">
    <input id="m-date" type="date" value="${e ? e.date : defDate()}">
    <input id="m-note" type="text" maxlength="50" placeholder="备注(可空)" value="${e ? esc(e.note) : ''}">
    <div class="sheet-btns">
      ${e ? '<button class="btn danger" data-mdel>删除</button>' : ''}
      <button class="btn ghost" data-mclose>取消</button>
      <button class="btn primary" data-msave>保存</button>
    </div>`);
  setTimeout(() => { const i = document.getElementById('m-source'); if (i) i.focus(); }, 80);
}

/* 导出选年弹层: 列出所有有数据的年份 + 今年 */
function exportModal() {
  const yearsSet = new Set([cur.y]);
  for (const k of Object.keys(DB.months)) yearsSet.add(+k.slice(0, 4));
  const years = [...yearsSet].sort((a, b) => b - a);
  openModal(`
    <div class="sheet-title">导出 Excel</div>
    <p class="hint">选择要导出的年份</p>
    ${years.map(y => `<button class="btn ghost" data-mexport="${y}" style="margin-top:6px">📊 ${y} 年</button>`).join('')}
    <div class="sheet-btns" style="margin-top:10px">
      <button class="btn ghost" data-mclose>取消</button>
    </div>`);
}

/* 日详情页的记账入口: 先选记支出还是记收入 */
function addModal() {
  openModal(`
    <div class="sheet-title">记一笔 · ${curDay}</div>
    <button class="btn ghost" data-madd="exp">记一笔支出</button>
    <button class="btn ghost" data-madd="inc">记一笔收入</button>
    <div class="sheet-btns">
      <button class="btn ghost" data-mclose>取消</button>
    </div>`);
}

function saveModal() {
  const ctx = modalCtx;
  if (!ctx) return;
  if (ctx.kind === 'exp' || ctx.kind === 'inc') {
    const amt = parseFloat(document.getElementById('m-amount').value);
    if (!(amt > 0)) { alert('金额要大于0'); return; }
    const date = document.getElementById('m-date').value;
    if (!date) { alert('请选择日期'); return; }
    const note = document.getElementById('m-note').value.trim();
    const kind = ctx.kind === 'exp' ? 'expenses' : 'incomes';
    const yy = +date.slice(0, 4), mm = +date.slice(5, 7);
    const d = mData(yy, mm, true);
    if (ctx.id) {
      const f = findEntry(kind, ctx.id);
      if (f) {
        const rec = Object.assign({}, f.e, { date, amount: r2(amt), note });
        if (kind === 'expenses') rec.person = ctx.person;
        else rec.source = document.getElementById('m-source').value.trim();
        if (f.k === key(yy, mm)) f.arr[f.i] = rec;
        else { f.arr.splice(f.i, 1); d[kind].push(rec); }
      }
    } else {
      const rec = { id: uid(), date, amount: r2(amt), note };
      if (kind === 'expenses') rec.person = ctx.person;
      else rec.source = document.getElementById('m-source').value.trim();
      d[kind].push(rec);
    }
  } else if (ctx.kind === 'wage') {
    const v = parseFloat(document.getElementById('m-num').value) || 0;
    const d = mData(cur.y, cur.m, true);
    if (ctx.p === 'wife') d.wifeSalary = r2(v); else d.meSalary = r2(v);
  } else if (ctx.kind === 'init') {
    const v = parseFloat(document.getElementById('m-num').value) || 0;
    DB.settings.initialBalance = r2(v);
  }
  save(); closeModal(); render();
}

function delEntry() {
  if (!modalCtx || !modalCtx.id) return;
  const kind = modalCtx.kind === 'exp' ? 'expenses' : 'incomes';
  const f = findEntry(kind, modalCtx.id);
  if (f) { f.arr.splice(f.i, 1); save(); }
  closeModal(); render();
}

/* ================= 事件 ================= */
topbar.addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  const t = b.dataset.t;
  if (t === 'prevM') { cur.m--; if (cur.m < 1) { cur.m = 12; cur.y--; } }
  if (t === 'nextM') { cur.m++; if (cur.m > 12) { cur.m = 1; cur.y++; } }
  if (t === 'prevY') curY--;
  if (t === 'nextY') curY++;
  if (t === 'backDay') { curDay = null; }
  if (t === 'addToday') { addModal(); return; }  // 日详情页记账: 先选支出还是收入
  render();
});

document.getElementById('tabbar').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab);
});
fab.addEventListener('click', () => expModal(null));

view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'wage') {
    const t = totals(cur.y, cur.m);
    numModal(`${pName(el.dataset.p)}工资`, el.dataset.p === 'wife' ? t.wifeSalary : t.meSalary,
      { kind: 'wage', p: el.dataset.p });
  }
  else if (act === 'init') numModal('初始资金', DB.settings.initialBalance, { kind: 'init' });
  else if (act === 'mode') modeModal();
  else if (act === 'addInc') incModal(null);
  else if (act === 'editExp') { const f = findEntry('expenses', el.dataset.id); if (f) expModal(f.e); }
  else if (act === 'editInc') { const f = findEntry('incomes', el.dataset.id); if (f) incModal(f.e); }
  else if (act === 'day') { curDay = el.dataset.date; render(); }
  else if (act === 'gotoM') { cur = { y: curY, m: +el.dataset.m }; setTab('month'); }
  else if (act === 'export') exportModal();
  else if (act === 'backup') backup();
  else if (act === 'wipe') {
    if (confirm('确定清空全部数据?此操作不可恢复!') && confirm('再想一下,真的要清空吗?建议先备份。')) {
      DB = fresh(); save(); render();
    }
  }
});

view.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.set) {
    const k = el.dataset.set;
    const v = el.value.trim().replace(/"/g, '');
    DB.settings[k] = v || (k === 'wifeName' ? '媳妇' : '我');
    save(); render(); return;
  }
  if (el.id === 'restoreFile' && el.files && el.files[0]) { restore(el.files[0]); el.value = ''; }
});

modalRoot.addEventListener('click', e => {
  const t = e.target;
  if (t.classList && t.classList.contains('mask')) { closeModal(); return; }
  if (t.closest('[data-mclose]')) { closeModal(); return; }
  const sm = t.closest('[data-set-mode]');
  if (sm) { DB.settings.mode = sm.dataset.setMode; save(); closeModal(); render(); return; }
  const mp = t.closest('[data-mp]');
  if (mp && modalCtx) {
    modalCtx.person = mp.dataset.mp;
    mp.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('on', 'wife', 'me', 'other'));
    mp.classList.add('on', modalCtx.person);
    return;
  }
  if (t.closest('[data-msave]')) { saveModal(); return; }
  if (t.closest('[data-mdel]')) { if (confirm('删除这条记录?')) delEntry(); }
  const mx = t.closest('[data-mexport]');
  if (mx) { closeModal(); exportYear(+mx.dataset.mexport); return; }
  const madd = t.closest('[data-madd]');
  if (madd) { closeModal(); if (madd.dataset.madd === 'exp') expModal(null); else incModal(null); return; }
});

/* ================= 备份 / 恢复 ================= */
async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function backup() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  shareOrDownload(blob, `记账本备份_${tsName()}.json`);
}
function restore(file) {
  file.text().then(txt => {
    try {
      const d = JSON.parse(txt);
      if (!d || !d.settings || !d.months) throw 0;
      if (!d.settings.mode) d.settings.mode = 'couple';
      DB = d; save(); render(); alert('恢复成功');
    } catch (_) { alert('备份文件不对,恢复失败'); }
  });
}

/* ================= 导出 Excel(与电脑模板同结构,带公式) ================= */
function exportYear(Y) {
  if (typeof XLSX === 'undefined') { alert('表格组件还没加载好,请联网后再试一次'); return; }
  const MONEY = '¥#,##0.00', DFMT = 'm"月"d"日"';
  const wn = DB.settings.wifeName, mn = DB.settings.meName, solo = isSolo();
  const wb = XLSX.utils.book_new();
  const put = (ws, r1, c1, cell) => { ws[XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 })] = cell; };
  const S = v => ({ t: 's', v: String(v) });
  const N = (v, z) => ({ t: 'n', v: r2(v), z: z || MONEY });
  const F = (f, v) => ({ t: 'n', f: f.replace(/^=/, ''), v: r2(v || 0), z: MONEY });
  const DT = ds => { const [a, b, c] = ds.split('-').map(Number); return { t: 'd', v: new Date(a, b - 1, c), z: DFMT }; };

  /* 年度汇总 */
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
  if (!solo) put(sum, 3, 3, S('← 自动: 本年1月之前的累计结余'));
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
  put(sum, 18, 1, S('全年合计'));
  put(sum, 18, 2, S('—'));
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
  sum['!cols'] = (solo ? [10, 13, 12, 12, 13, 12, 12, 13, 12, 14, 24] : [10, 13, 12, 12, 12, 13, 12, 12, 12, 13, 12, 14, 24]).map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, sum, '年度汇总');

  /* 12个月 */
  for (let m = 1; m <= 12; m++) {
    const ws = {}, d = mData(Y, m);
    const exps = [...d.expenses].sort((a, b) => a.date.localeCompare(b.date));
    const incs = [...d.incomes].sort((a, b) => a.date.localeCompare(b.date));
    const expRows = Math.max(50, exps.length), incRows = Math.max(15, incs.length);
    // solo 比 couple 少两行(不显示媳妇工资行/媳妇支出行), 起始行号 -2
    const off = solo ? 2 : 0;
    const expS = 20 - off, expE = 19 + expRows - off;
    const secI = expE + 2, hdrI = secI + 1, incS = hdrI + 1, incE = incS + incRows - 1;

    put(ws, 1, 1, S(`${Y}年${m}月 家庭收支明细`));
    put(ws, 3, 1, S('一、收入情况'));
    const t = totals(Y, m);
    put(ws, 4, 1, S('上月结余结转')); put(ws, 4, 2, N(carryover(Y, m)));
    if (solo) {
      put(ws, 5, 1, S(`${mn}工资`)); if (d.meSalary) put(ws, 5, 2, N(d.meSalary));
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
      put(ws, 5, 1, S(`${wn}工资`)); if (d.wifeSalary) put(ws, 5, 2, N(d.wifeSalary));
      put(ws, 6, 1, S(`${mn}工资`)); if (d.meSalary) put(ws, 6, 2, N(d.meSalary));
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
      put(ws, r, 2, S(pName(e.person)));
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
    const eN = incE - 1;   // !ref 只算到实际内容行, 避免被识别为全表
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

  /* 使用说明 */
  const help = {};
  ['家庭记账本 使用说明', '',
   `1. 本表由「家庭记账本」App于 ${today()} 导出。`,
   '2. 上月结转、各项合计、结余都是公式,改明细会自动重算。',
   '3. 新增支出写在对应月份的「支出明细」区;行不够时在明细区中间插入行。',
   '4. 支出人一列必须和表头的名字一致,否则分人汇总会漏算。',
   '5. 年度汇总页只看别改,公式改坏了结余就不对了。'
  ].forEach((t, i) => put(help, i + 1, 1, S(t)));
  help['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, help, '使用说明');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  shareOrDownload(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `家庭记账本_${Y}年_${tsName()}.xlsx`);
}

/* ================= 启动 ================= */
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
render();
