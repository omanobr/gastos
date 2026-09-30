/* Gastos do Cartão: interface. Os dados vêm de window.GastosStore (planilha do Google ou prévia em memória). */
(function () {
  'use strict';
  const CFG = window.GASTOS_CONFIG || {};
  const DEMO = window.GASTOS_DEMO || null;
  const { SheetsStore, MemoryStore, planImport } = window.GastosStore;
  const SCOPE_SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
  const SCOPES = SCOPE_SHEETS + ' https://www.googleapis.com/auth/userinfo.email';

  /* ---------- utilidades ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const coll = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const money = (c) => BRL.format(c / 100);
  const pct = (a, b) => (b ? PCT.format(a / b) : '0,0%');
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const ymLabel = (ym) => MESES[+ym.slice(5, 7) - 1] + '/' + ym.slice(2, 4);
  const addMonths = (ym, k) => { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  const ddmm = (iso) => (iso && iso.length >= 10 ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
  const thisYear = String(new Date().getFullYear());
  const ddmmaa = (iso) => ddmm(iso) + (iso && iso.slice(0, 4) !== thisYear ? '/' + iso.slice(2, 4) : '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sumC = (arr) => arr.reduce((s, t) => s + t.cents, 0);
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
  };
  const svg = (p, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = {
    resumo: svg('<path d="M4 20V11M10 20V4M16 20v-8M21 20H3"/>'),
    lanc: svg('<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
    parc: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
    rec: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
    anal: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    more: svg('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>', true),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    tag: svg('<path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
    table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>'),
    swap: svg('<path d="M7 7h13l-4-4M17 17H4l4 4"/>'),
    out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  };

  /* ---------- estado ---------- */
  let store = null;
  let D = null;
  let T = [];
  let byId = new Map();
  let catById = new Map();
  let titulares = [];
  let lastLoad = 0;
  let pick = null; // gaveta de categoria aberta: { ids }
  const ui = { tab: 'resumo', fat: 'all', tit: 'all', cat: 'all', tipo: 'all', q: '', qn: [], limit: 150, selMode: false, sel: new Set(), renaming: null, deleting: null, pendingImport: null };

  const catOf = (t) => { const c = catById.get(t.categoria); return c && c.ativa !== false ? t.categoria : 'sem'; };
  const catName = (id) => (catById.get(id) || {}).nome || 'Sem categoria';
  const needsReview = (t) => t.conferir && catOf(t) !== 'sem';
  const inFat = (t) => ui.fat === 'all' || t.fatura === ui.fat;
  const inTit = (t) => ui.tit === 'all' || t.titular === ui.tit;
  const matchQ = (t) => !ui.qn.length || ui.qn.every((w) => (t.hay + ' ' + norm(catName(catOf(t)))).includes(w));
  const activeCats = () => D.categorias.filter((c) => c.ativa !== false);
  const sortedCats = () => { const a = activeCats(); const sem = a.find((c) => c.id === 'sem'); return [sem, ...a.filter((c) => c.id !== 'sem').sort((x, y) => coll.compare(x.nome, y.nome))].filter(Boolean); };
  const hClass = (t) => 'h' + Math.min(2, Math.max(0, titulares.indexOf(t.titular || t)));
  const latestFatura = () => (D.faturas.length ? D.faturas[D.faturas.length - 1] : null);
  const fatLabel = (id) => { const f = D.faturas.find((x) => x.id === id); return f ? f.rotulo : ymLabel(id); };

  function enrich() {
    if (!D.categorias.some((c) => c.id === 'sem')) D.categorias.unshift({ id: 'sem', nome: 'Sem categoria', ativa: true });
    catById = new Map(D.categorias.map((c) => [c.id, c]));
    titulares = [...new Set(D.cartoes.map((c) => c.titular).concat(D.lancamentos.map((t) => t.titular)))].filter(Boolean);
    D.faturas.sort((a, b) => a.id.localeCompare(b.id));
    T = D.lancamentos;
    for (const t of T) {
      t.cents = Math.round(Number(t.valor) * 100) || 0;
      const m = /^(\d{1,2})\s*(\/|de)\s*(\d{1,2})$/.exec(String(t.parcela || '').trim());
      if (m) { t.pn = +m[1]; t.pN = +m[3]; t.pk = m[2] === 'de' ? 'estab' : 'banco'; } else { t.pn = 0; t.pN = 0; t.pk = ''; }
      t.hay = norm([t.descricao, t.cidade, t.titular, 'final ' + t.cartao, NUM.format(Math.abs(t.cents / 100)), t.parcela, t.detalhes, fatLabel(t.fatura)].join(' '));
    }
    byId = new Map(T.map((t) => [t.id, t]));
    if (ui.fat !== 'all' && !D.faturas.some((f) => f.id === ui.fat)) ui.fat = 'all';
    if (ui.tit !== 'all' && !titulares.includes(ui.tit)) ui.tit = 'all';
    if (!['all', 'sem', 'conferir'].includes(ui.cat) && !(catById.get(ui.cat) || {}).ativa) ui.cat = 'all';
  }

  /* ---------- login do Google ---------- */
  class AuthError extends Error { constructor() { super('Sessão expirada'); this.name = 'AuthError'; } }
  const Auth = {
    token: '', exp: 0, email: LS.get('gastos.email') || '',
    restore() { const t = LS.get('gastos.token'), e = +(LS.get('gastos.exp') || 0); if (t && e > Date.now() + 60000) { this.token = t; this.exp = e; } },
    valid() { return !!this.token && this.exp > Date.now() + 30000; },
    ready() { return !!(window.google && google.accounts && google.accounts.oauth2); },
    async waitReady(ms = 10000) { const t0 = Date.now(); while (!this.ready()) { if (Date.now() - t0 > ms) return false; await sleep(100); } return true; },
    login(prompt) {
      return new Promise((resolve, reject) => {
        if (!this.ready()) { reject(new Error('Não foi possível carregar o login do Google. Confira a internet.')); return; }
        const client = google.accounts.oauth2.initTokenClient({
          client_id: CFG.CLIENT_ID,
          scope: SCOPES,
          callback: async (resp) => {
            if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
            if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_SHEETS)) { reject(new Error('Sem a permissão de planilhas o app não consegue ler nem gravar os dados. Entre de novo e marque essa permissão.')); return; }
            this.token = resp.access_token;
            this.exp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            LS.set('gastos.token', this.token); LS.set('gastos.exp', String(this.exp));
            try {
              const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + this.token } });
              if (r.ok) { const u = await r.json(); this.email = u.email || ''; LS.set('gastos.email', this.email); }
            } catch { /* segue sem o e-mail */ }
            resolve();
          },
          error_callback: (err) => reject(new Error(err && err.type === 'popup_closed' ? 'Login cancelado.' : 'Não foi possível abrir o login do Google. Se o navegador bloqueou a janela, permita e tente de novo.')),
        });
        const opts = { prompt: prompt !== undefined ? prompt : (this.email ? '' : 'select_account') };
        if (this.email) opts.login_hint = this.email;
        client.requestAccessToken(opts);
      });
    },
    logout() {
      try { if (this.token && this.ready()) google.accounts.oauth2.revoke(this.token, () => {}); } catch { /* ignora */ }
      this.token = ''; this.exp = 0; this.email = '';
      LS.del('gastos.token'); LS.del('gastos.exp'); LS.del('gastos.email');
    },
    async getToken() { if (this.valid()) return this.token; throw new AuthError(); },
  };

  /* ---------- status, aviso e gaveta ---------- */
  function setSync(kind, text) { const el = $('#sync'); if (!el) return; el.dataset.s = kind; $('#syncTxt').textContent = text; }
  let toastTimer = null;
  function toast(msg, actions = [], ms = 6000) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>` + actions.map((a, i) => `<button class="tb${a.primary ? ' primary' : ''}" data-ti="${i}">${esc(a.label)}</button>`).join('');
    el.hidden = false;
    el.onclick = (e) => { const b = e.target.closest('[data-ti]'); if (!b) return; el.hidden = true; clearTimeout(toastTimer); actions[+b.dataset.ti].fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  function openSheet(html, focusSel) {
    const s = $('#sheet');
    s.innerHTML = `<div class="bd" data-act="close"></div><div class="panel" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    s.hidden = false;
    document.body.style.overflow = 'hidden';
    if (focusSel) { const f = $(focusSel, s); if (f && matchMedia('(pointer: fine)').matches) f.focus(); }
  }
  function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; document.body.style.overflow = ''; pick = null; ui.renaming = ui.deleting = null; }
  function handleError(e) {
    console.error(e);
    if (e && e.name === 'AuthError') {
      setSync('err', 'Sessão expirada');
      toast('Sua sessão do Google expirou.', [{ label: 'Entrar de novo', primary: true, fn: async () => { try { await Auth.login(''); await reload(); } catch (x) { toast(x.message); } } }], 20000);
      return;
    }
    setSync('err', 'Não salvou');
    toast((e && e.message) || 'Algo deu errado. Tente de novo.', [], 9000);
  }

  /* ---------- carga ---------- */
  async function reload() {
    setSync('busy', 'Atualizando…');
    try {
      D = await store.load();
      enrich();
      lastLoad = Date.now();
      setSync('ok', 'Atualizado');
      render();
    } catch (e) { handleError(e); }
  }

  /* ---------- cálculos ---------- */
  function catAgg(list) {
    const m = new Map();
    for (const t of list) {
      const c = catOf(t);
      if (!m.has(c)) m.set(c, { id: c, n: 0, tot: 0, by: {} });
      const g = m.get(c); g.n++; g.tot += t.cents; g.by[t.titular] = (g.by[t.titular] || 0) + t.cents;
    }
    return [...m.values()];
  }
  function stack(by, maxC) {
    const tot = Object.values(by).reduce((s, v) => s + Math.max(0, v), 0);
    if (!maxC || tot <= 0) return '<div class="track"></div>';
    const segs = titulares.filter((h) => (by[h] || 0) > 0).map((h) => `<span class="bseg ${hClass(h)}" style="width:${((by[h] / maxC) * 100).toFixed(2)}%" title="${esc(h)}: ${money(by[h])}"></span>`);
    segs[segs.length - 1] = segs[segs.length - 1].replace('class="bseg', 'class="bseg end');
    return `<div class="track">${segs.join('')}</div>`;
  }
  function plans() {
    const g = new Map();
    for (const t of T) {
      if (!t.pn) continue;
      const k = [t.cartao, t.estabelecimento, t.pN, t.pk, t.pk === 'banco' ? t.data : '', t.cents > 0].join('|');
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(t);
    }
    return [...g.values()].map((ts) => {
      ts.sort((a, b) => a.fatura.localeCompare(b.fatura) || a.pn - b.pn);
      const last = ts[ts.length - 1];
      return { cartao: last.cartao, titular: last.titular, nome: last.estabelecimento, N: last.pN, pk: last.pk, compra: ts[0].data, ultF: last.fatura, ultN: last.pn, valorC: last.cents, rest: last.pN - last.pn, last };
    });
  }
  function futureBank() {
    const lf = latestFatura();
    if (!lf) return [];
    return plans().filter((p) => p.pk === 'banco' && p.rest > 0 && p.ultF === lf.id && p.valorC > 0).map((p) => ({ ...p, restC: p.valorC * p.rest }));
  }
  function recurring() {
    const g = new Map();
    for (const t of T) {
      if (t.tipo !== 'avista' || t.cents <= 0) continue;
      const k = t.cartao + '|' + t.chave;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(t);
    }
    const out = [];
    for (const ts of g.values()) {
      const vals = ts.map((t) => t.cents).sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)];
      const near = ts.filter((t) => Math.abs(t.cents - med) <= 0.01 * med);
      const months = [...new Set(near.map((t) => t.data.slice(0, 7)))].sort();
      let ok = months.length >= 3 && near.length <= 2 * months.length;
      if (!ok && near.length === 2 && months.length === 2) {
        const dd = Math.abs((Date.parse(near[0].data) - Date.parse(near[1].data)) / 86400000);
        ok = dd >= 25 && dd <= 35;
      }
      if (ok) out.push({ nome: ts[0].estabelecimento, titular: ts[0].titular, cartao: ts[0].cartao, valorC: med, months, n: near.length, mensalC: Math.round((med * near.length) / months.length), cat: catOf(near[near.length - 1]) });
    }
    return out.sort((a, b) => b.mensalC - a.mensalC);
  }

  /* ---------- telas ---------- */
  function render() {
    if (!D) return;
    renderTop();
    renderTabbar();
    const v = $('#view');
    v.classList.toggle('has-action', ui.selMode && ui.sel.size > 0);
    if (!T.length) { v.innerHTML = viewEmpty(); renderActionbar(); return; }
    v.innerHTML = ui.tab === 'resumo' ? viewResumo() : ui.tab === 'lanc' ? viewLanc() : ui.tab === 'parc' ? viewParcelas() : ui.tab === 'rec' ? viewRecorrentes() : viewAnalises();
    if (ui.tab === 'lanc') renderLancParts();
    renderActionbar();
  }
  function renderTop() {
    const nf = D.faturas.length;
    $('#brandSub').textContent = store.kind === 'memory' ? 'Prévia com seus dados' : (Auth.email || `${nf} faturas`);
    $('#btnFatura').innerHTML = `<span>${ui.fat === 'all' ? 'Todas as faturas' : 'Fatura ' + esc(fatLabel(ui.fat))}</span>${I.down}`;
    $('#segTit').innerHTML = [['all', 'Todos']].concat(titulares.map((h) => [h, h])).map(([v, l]) => `<button data-act="tit" data-tit="${esc(v)}" aria-pressed="${ui.tit === v}">${esc(l)}</button>`).join('');
  }
  function renderTabbar() {
    const pend = T.filter((t) => catOf(t) === 'sem' || needsReview(t)).length;
    const tabs = [['resumo', 'Resumo', I.resumo], ['lanc', 'Lançamentos', I.lanc], ['parc', 'Parcelas', I.parc], ['rec', 'Recorrentes', I.rec], ['anal', 'Análises', I.anal]];
    $('#tabbar').innerHTML = tabs.map(([id, l, ic]) => `<button role="tab" data-act="tab" data-tab="${id}" aria-selected="${ui.tab === id}">${ic}<span>${l}</span>${id === 'lanc' && pend ? `<span class="badge">${pend}</span>` : ''}</button>`).join('');
  }
  function viewEmpty() {
    return `<section class="card"><h2>O banco está vazio</h2><p class="hint">Importe o arquivo de dados que o Claude gerou (termina em .json). Depois disso, os lançamentos aparecem aqui para os dois.</p><button class="btn primary block" data-act="menu-import">${'Importar arquivo'}</button></section>`;
  }

  function viewResumo() {
    const LF = T.filter(inFat);
    const L = LF.filter(inTit);
    const tot = sumC(L), totF = sumC(LF);
    const sem = L.filter((t) => catOf(t) === 'sem');
    const rev = L.filter(needsReview);
    const fb = futureBank();
    const futC = fb.reduce((s, p) => s + p.restC, 0);
    const lf = latestFatura();
    const byTit = titulares.slice(0, 3).map((h) => { const c = sumC(LF.filter((t) => t.titular === h)); return `<button class="kpi" data-act="tit" data-tit="${esc(h)}" aria-pressed="${ui.tit === h}"><span class="eyebrow"><span class="dot ${hClass(h)}"></span> ${esc(h)}</span><span class="kv">${money(c)}</span><span class="ks">${pct(c, totF)} do total</span></button>`; }).join('');
    const kpis = `<section class="kpis">
      <div class="kpi wide"><span class="eyebrow">${ui.fat === 'all' ? `Total de ${D.faturas.length} faturas` : 'Total da fatura ' + esc(fatLabel(ui.fat))}${ui.tit === 'all' ? '' : ' · ' + esc(ui.tit)}</span><span class="kv">${money(tot)}</span><span class="ks">${L.length} lançamentos</span></div>
      ${byTit}
      <button class="kpi${sem.length ? ' alert' : ''}" data-act="goto-cat" data-cat="sem"><span class="eyebrow">Sem categoria</span><span class="kv">${sem.length}</span><span class="ks">${money(sumC(sem))}${rev.length ? ` · ${rev.length} a conferir` : ''}</span></button>
      <button class="kpi" data-act="goto-tab" data-tab="parc"><span class="eyebrow">Parcelas a vencer</span><span class="kv">${money(futC)}</span><span class="ks">depois da fatura ${lf ? esc(lf.rotulo) : ''}</span></button>
    </section>`;
    const rows = catAgg(L).sort((a, b) => b.tot - a.tot);
    const maxC = Math.max(1, ...rows.map((r) => Object.values(r.by).reduce((s, v) => s + Math.max(0, v), 0)));
    const multi = ui.tit === 'all' && titulares.length > 1;
    const catHtml = rows.map((r) => `<button class="catrow" data-act="goto-cat" data-cat="${esc(r.id)}">
        <span class="cn">${esc(catName(r.id))}<small>${r.n}</small></span><span class="cv num${r.tot < 0 ? ' neg' : ''}">${money(r.tot)}</span>
        ${stack(r.by, maxC)}
        ${multi ? `<span class="split num">${titulares.map((h) => `${esc(h)} ${money(r.by[h] || 0)}`).join(' · ')}</span>` : ''}
      </button>`).join('');
    const fats = D.faturas.filter((f) => ui.fat === 'all' || f.id === ui.fat).slice().reverse();
    const maxF = Math.max(1, ...fats.map((f) => sumC(T.filter((t) => t.fatura === f.id))));
    const fatHtml = fats.map((f) => {
      const Lf = T.filter((t) => t.fatura === f.id);
      const by = {}; for (const t of Lf) by[t.titular] = (by[t.titular] || 0) + t.cents;
      const next = D.faturas[D.faturas.indexOf(f) + 1];
      const pago = next && next.pagamento_anterior_em ? `paga em ${ddmm(next.pagamento_anterior_em)}` : `vence em ${ddmm(f.vencimento)}`;
      const s = sumC(Lf);
      const confere = f.total !== '' && Math.round(Number(f.total) * 100) === s;
      return `<div class="plan"><span class="pn">${esc(f.rotulo)}</span><span class="pv num"><strong>${money(s)}</strong></span>
        <span class="pm">${pago}${confere ? ' · confere com a fatura' : ''}</span><span class="pm num" style="text-align:right">${titulares.map((h) => `${esc(h)} ${money(by[h] || 0)}`).join(' · ')}</span>
        <span style="grid-column:1/-1">${stack(by, maxF)}</span></div>`;
    }).join('');
    const top = L.filter((t) => t.cents > 0 && t.tipo !== 'iof').sort((a, b) => b.cents - a.cents).slice(0, 6);
    return kpis + `
      <section class="card"><h2>Por categoria</h2><p class="hint">Toque numa categoria para ver e mover os lançamentos.</p>
        ${multi ? `<div class="legend">${titulares.slice(0, 3).map((h) => `<span><i class="sw ${hClass(h)}"></i>${esc(h)}</span>`).join('')}</div>` : ''}
        <div class="catlist">${catHtml || '<p class="empty">Nada neste filtro.</p>'}</div></section>
      <section class="card"><h2>Por fatura</h2>${fatHtml}</section>
      <section class="card"><h2>Maiores lançamentos</h2>${top.map((t) => txLine(t)).join('')}</section>`;
  }
  function txLine(t) {
    return `<div class="plan"><span class="pn">${esc(t.estabelecimento || t.descricao)}${t.pn ? ` <span class="tag parc">${esc(t.parcela)}</span>` : ''}</span><span class="pv num">${money(t.cents)}</span>
      <span class="pm" style="grid-column:1/-1"><span class="dot ${hClass(t)}"></span> ${esc(t.titular)} · ${ddmmaa(t.data)} · ${esc(catName(catOf(t)))} · fatura ${esc(fatLabel(t.fatura))}</span></div>`;
  }

  function lancBase() { return T.filter((t) => inFat(t) && inTit(t) && (ui.tipo === 'all' || t.tipo === ui.tipo) && matchQ(t)); }
  function lancRows(base) {
    const rows = base.filter((t) => ui.cat === 'all' || (ui.cat === 'conferir' ? needsReview(t) : catOf(t) === ui.cat));
    return rows.sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
  }
  function viewLanc() {
    return `<div class="tools"><label class="sr" for="q">Buscar</label><input class="search" id="q" type="search" placeholder="Buscar loja, cidade ou valor" value="${esc(ui.q)}" autocomplete="off">
        <button class="btn${ui.selMode ? ' on' : ''}" data-act="sel-toggle">${ui.selMode ? 'Concluir' : 'Selecionar'}</button></div>
      <div class="chips" id="lancChips"></div>
      <div class="ctx" id="lancCtx"></div>
      <ul class="txlist" id="lancList"></ul>`;
  }
  function renderLancParts() {
    const base = lancBase();
    const rows = lancRows(base);
    const agg = new Map(catAgg(base).map((r) => [r.id, r]));
    const conf = base.filter(needsReview).length;
    const chip = (id, label, n, warn) => `<button class="chip${warn ? ' warn' : ''}" data-act="chip" data-cat="${esc(id)}" aria-pressed="${ui.cat === id}">${esc(label)} <b>${n}</b></button>`;
    const cats = [...agg.values()].filter((r) => r.id !== 'sem').sort((a, b) => b.n - a.n);
    $('#lancChips').innerHTML = chip('all', 'Todos', base.length) + chip('sem', 'Sem categoria', (agg.get('sem') || { n: 0 }).n, (agg.get('sem') || { n: 0 }).n > 0) + (conf ? chip('conferir', 'A conferir', conf, true) : '') +
      cats.map((r) => chip(r.id, catName(r.id), r.n)).join('') + `<button class="chip" data-act="menu-cats">${I.tag} Categorias</button>`;
    const allSel = rows.length && rows.every((t) => ui.sel.has(t.id));
    $('#lancCtx').innerHTML = `<strong class="num">${rows.length} · ${money(sumC(rows))}</strong>
      <label class="sr" for="fTipo">Tipo</label><select id="fTipo">${[['all', 'Todos os tipos'], ['avista', 'À vista'], ['parcela', 'Parcelas'], ['credito', 'Créditos'], ['iof', 'IOF']].map(([v, l]) => `<option value="${v}"${ui.tipo === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${ui.selMode && rows.length ? `<button class="linkbtn" data-act="sel-all">${allSel ? 'Desmarcar todos' : 'Marcar os ' + rows.length}</button>` : ''}
      ${ui.cat === 'conferir' && rows.length ? '<button class="linkbtn" data-act="confirm-all">Confirmar todos</button>' : ''}`;
    const shown = rows.slice(0, ui.limit);
    $('#lancList').innerHTML = shown.length ? shown.map((t) => {
      const c = catOf(t);
      const tags = [];
      if (t.pn) tags.push(`<span class="tag parc">${esc(t.parcela)}</span>`);
      if (t.cents < 0) tags.push('<span class="tag cred">crédito</span>');
      if (needsReview(t)) tags.push(`<span class="tag rev">conferir</span> <button class="linkbtn" data-act="confirm-one" data-id="${esc(t.id)}">ok</button>`);
      const sel = ui.sel.has(t.id);
      return `<li class="tx${ui.selMode ? ' selmode' : ''}${sel ? ' sel' : ''}">
        ${ui.selMode ? `<label class="ck"><span class="sr">Selecionar ${esc(t.descricao)}</span><input type="checkbox" data-id="${esc(t.id)}"${sel ? ' checked' : ''}></label>` : ''}
        <span class="d">${esc(t.descricao)}</span><span class="v num${t.cents < 0 ? ' neg' : ''}">${money(t.cents)}</span>
        <span class="meta">${ddmmaa(t.data)} · <span class="dot ${hClass(t)}"></span> ${esc(t.titular)} ${esc(t.cartao)}${ui.fat === 'all' ? ' · ' + esc(fatLabel(t.fatura)) : ''} ${tags.join(' ')}</span>
        <button class="catbtn${c === 'sem' ? ' sem' : ''}" data-act="catbtn" data-id="${esc(t.id)}"><span>${esc(catName(c))}</span>${I.down.replace('<svg', '<svg width="12" height="12"')}</button>
      </li>`;
    }).join('') + (rows.length > shown.length ? `<li class="more"><button class="btn" data-act="more">Mostrar mais ${Math.min(150, rows.length - shown.length)}</button></li>` : '')
      : `<li class="empty">${ui.cat === 'sem' ? 'Tudo classificado neste filtro.' : ui.cat === 'conferir' ? 'Nada a conferir.' : 'Nenhum lançamento neste filtro.'}</li>`;
  }
  function renderActionbar() {
    const el = $('#actionbar');
    if (!(ui.tab === 'lanc' && ui.selMode && ui.sel.size)) { el.hidden = true; $('#view').classList.remove('has-action'); return; }
    const ids = [...ui.sel].filter((id) => byId.has(id));
    const rev = ids.filter((id) => needsReview(byId.get(id))).length;
    el.hidden = false;
    $('#view').classList.add('has-action');
    el.innerHTML = `<span class="al num">${ids.length} · ${money(ids.reduce((s, id) => s + byId.get(id).cents, 0))}</span>
      <button class="btn primary" data-act="bulk-move">Mover para…</button>${rev ? `<button class="btn" data-act="bulk-confirm">Confirmar (${rev})</button>` : ''}<button class="btn" data-act="bulk-clear">Limpar</button>`;
  }

  function viewParcelas() {
    const lf = latestFatura();
    if (!lf) return '<section class="card"><h2>Parcelas</h2><p class="hint">Nenhuma fatura no banco ainda.</p></section>';
    const act = futureBank().sort((a, b) => b.restC - a.restC);
    const totC = act.reduce((s, p) => s + p.restC, 0);
    const imp = lf && lf.parcelas_a_vencer !== '' ? Math.round(Number(lf.parcelas_a_vencer) * 100) : null;
    const by = {}; for (const p of act) by[p.titular] = (by[p.titular] || 0) + p.restC;
    const maxK = Math.max(0, ...act.map((p) => p.rest));
    const months = [];
    for (let k = 1; k <= maxK; k++) { const on = act.filter((p) => p.rest >= k); const b = {}; for (const p of on) b[p.titular] = (b[p.titular] || 0) + p.valorC; months.push({ ym: addMonths(lf.id, k), by: b, tot: on.reduce((s, p) => s + p.valorC, 0) }); }
    const maxM = Math.max(1, ...months.map((m) => m.tot));
    const all = plans();
    const estab = all.filter((p) => p.pk === 'estab');
    const credits = all.filter((p) => p.pk === 'banco' && p.valorC < 0 && p.rest > 0);
    const done = all.filter((p) => p.pk === 'banco' && p.rest === 0).sort((a, b) => b.ultF.localeCompare(a.ultF));
    const planCard = (p) => `<div class="plan"><span class="pn">${esc(p.nome)}</span><span class="pv num"><strong>${money(p.restC)}</strong></span>
      <span class="pm"><span class="dot ${hClass(p.titular)}"></span> ${esc(p.titular)} ${esc(p.cartao)} · parcela ${String(p.ultN).padStart(2, '0')}/${String(p.N).padStart(2, '0')} de ${money(p.valorC)} · compra ${ddmmaa(p.compra)}</span>
      <span class="pm" style="text-align:right">faltam ${p.rest} · até ${ymLabel(addMonths(lf.id, p.rest))}</span></div>`;
    return `<section class="card"><h2>A vencer depois da fatura ${lf ? esc(lf.rotulo) : ''}</h2>
        <p class="hint">Parcelamentos feitos no cartão que continuam nas próximas faturas. A conta é a mesma do banco: valor da parcela atual vezes as que faltam.</p>
        <div class="kpirow"><div><div class="kl">Total</div><div class="kv num">${money(totC)}</div>${imp !== null ? (imp === totC ? '<div class="ok">confere com o valor impresso na fatura</div>' : `<div class="err">a fatura mostra ${money(imp)}</div>`) : ''}</div>
          ${titulares.map((h) => `<div><div class="kl"><span class="dot ${hClass(h)}"></span> ${esc(h)}</div><div class="kv num">${money(by[h] || 0)}</div></div>`).join('')}</div>
        ${titulares.length > 1 ? `<div class="legend">${titulares.slice(0, 3).map((h) => `<span><i class="sw ${hClass(h)}"></i>${esc(h)}</span>`).join('')}</div>` : ''}
        <div class="sched">${months.map((m) => `<div class="srow"><span>${ymLabel(m.ym)}</span>${stack(m.by, maxM)}<span class="num">${money(m.tot)}</span></div>`).join('') || '<p class="empty">Nenhuma parcela a vencer.</p>'}</div></section>
      <section class="card"><h2>Em andamento</h2>${act.map(planCard).join('') || '<p class="empty">Nenhum parcelamento em andamento.</p>'}
        ${estab.length || credits.length ? `<div class="note" style="margin-top:12px">${estab.map((p) => `<p style="margin:0 0 6px"><strong>${esc(p.nome)}</strong>: parcela cobrada pela própria empresa (${String(p.ultN).padStart(2, '0')} de ${p.N}), ${money(p.valorC)} por mês; faltam ${p.rest} (${money(p.valorC * p.rest)}). Não entra no total do banco.</p>`).join('')}${credits.map((p) => `<p style="margin:0"><strong>${esc(p.nome)}</strong>: estorno parcelado de ${money(-p.valorC)}; falta${p.rest > 1 ? 'm' : ''} ${p.rest} parcela${p.rest > 1 ? 's' : ''} de crédito.</p>`).join('')}</div>` : ''}
        ${done.length ? `<details class="fold"><summary>Terminaram nestas faturas (${done.length})</summary>${done.map((p) => `<div class="plan"><span class="pn">${esc(p.nome)}</span><span class="pv num">${money(p.valorC)}</span><span class="pm" style="grid-column:1/-1">${esc(p.titular)} · ${p.ultN}/${p.N} na fatura ${esc(fatLabel(p.ultF))}</span></div>`).join('')}</details>` : ''}
      </section>`;
  }
  function viewRecorrentes() {
    const rec = recurring();
    const tot = rec.reduce((s, r) => s + r.mensalC, 0);
    const by = {}; for (const r of rec) by[r.titular] = (by[r.titular] || 0) + r.mensalC;
    return `<section class="card"><h2>Cobranças que se repetem</h2>
      <p class="hint">Mesmo estabelecimento e mesmo valor (até 1% de diferença) em três meses ou mais, ou duas vezes com intervalo de um mês.</p>
      <div class="kpirow"><div><div class="kl">Média por mês</div><div class="kv num">${money(tot)}</div></div>${titulares.map((h) => `<div><div class="kl"><span class="dot ${hClass(h)}"></span> ${esc(h)}</div><div class="kv num">${money(by[h] || 0)}</div></div>`).join('')}</div>
      ${rec.map((r) => `<div class="plan"><span class="pn">${esc(r.nome)}</span><span class="pv num">${money(r.mensalC)}<span class="muted">/mês</span></span>
        <span class="pm"><span class="dot ${hClass(r.titular)}"></span> ${esc(r.titular)} ${esc(r.cartao)} · ${r.n}× de ${money(r.valorC)} em ${r.months.map((m) => MESES[+m.slice(5, 7) - 1].toLowerCase()).join(', ')}</span><span class="pm" style="text-align:right">${esc(catName(r.cat))}</span></div>`).join('') || '<p class="empty">Nada se repete ainda.</p>'}</section>`;
  }
  function renderText(txt) {
    const blocks = String(txt || '').replace(/\r/g, '').split(/\n{2,}/);
    return blocks.map((b) => {
      const lines = b.split('\n').filter((l) => l.trim());
      if (lines.length && lines.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
      const head = lines.length > 1 && /:$/.test(lines[0]) && lines.slice(1).every((l) => /^\s*[-•]\s+/.test(l));
      if (head) return `<p>${esc(lines[0])}</p><ul>${lines.slice(1).map((l) => `<li>${esc(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
      return `<p>${lines.map(esc).join('<br>')}</p>`;
    }).join('');
  }
  function viewAnalises() {
    const list = D.analises.filter((a) => ui.fat === 'all' || a.fatura === ui.fat || a.fatura === 'todas').sort((a, b) => String(b.data).localeCompare(String(a.data)));
    if (!list.length) return '<section class="card"><h2>Análises</h2><p class="hint">Quando o Claude analisar uma fatura, o texto aparece aqui. Ele chega junto com o arquivo de importação.</p></section>';
    return list.map((a) => `<article class="card analise"><h2 class="at">${esc(a.titulo)}</h2><p class="ad">${a.fatura === 'todas' ? 'Todas as faturas' : 'Fatura ' + esc(fatLabel(a.fatura))} · ${ddmmaa(String(a.data))}</p>${renderText(a.texto)}</article>`).join('');
  }

  /* ---------- gavetas ---------- */
  function sheetFatura() {
    const opts = [['all', 'Todas as faturas', sumC(T)]].concat(D.faturas.slice().reverse().map((f) => [f.id, `Fatura ${f.rotulo} · vence ${ddmm(f.vencimento)}`, sumC(T.filter((t) => t.fatura === f.id))]));
    openSheet(`<h3>Qual fatura?</h3><ul class="optlist">${opts.map(([id, l, c]) => `<li><button class="opt" data-act="opt-fatura" data-f="${esc(id)}">${esc(l)}<small class="num">${money(c)}</small>${ui.fat === id ? `<span class="on">${svg('<path d="M20 6L9 17l-5-5"/>')}</span>` : ''}</button></li>`).join('')}</ul>`);
  }
  function sheetCategory(ids) {
    pick = { ids };
    const one = ids.length === 1 ? byId.get(ids[0]) : null;
    const cur = one ? catOf(one) : null;
    openSheet(`<h3>${one ? 'Categoria' : `Mover ${ids.length} lançamentos`}</h3>
      <p class="sub">${one ? `${esc(one.descricao)} · ${money(one.cents)} · ${ddmmaa(one.data)}` : money(ids.reduce((s, id) => s + (byId.get(id) || { cents: 0 }).cents, 0))}</p>
      <label class="sr" for="pickq">Procurar categoria</label><input class="input" id="pickq" placeholder="Procurar ou criar categoria" autocomplete="off">
      <ul class="optlist" id="pickList"></ul>`, '#pickq');
    renderPickList('', cur);
  }
  function renderPickList(q, cur) {
    const qn = norm(q.trim());
    const list = sortedCats().filter((c) => !qn || norm(c.nome).includes(qn));
    const exists = activeCats().some((c) => norm(c.nome) === qn);
    $('#pickList').innerHTML = (qn && !exists ? `<li><button class="opt" data-act="pick-new">${svg('<path d="M12 5v14M5 12h14"/>')} Criar “${esc(q.trim())}”</button></li>` : '') +
      list.map((c) => `<li><button class="opt" data-act="opt-cat" data-cat="${esc(c.id)}">${esc(c.nome)}${cur === c.id ? `<span class="on">${svg('<path d="M20 6L9 17l-5-5"/>')}</span>` : ''}</button></li>`).join('');
  }
  function sheetMenu() {
    const sheets = store.kind === 'sheets';
    openSheet(`<h3>Menu</h3><p class="sub">${store.kind === 'memory' ? 'Prévia: as mudanças somem ao recarregar a página.' : esc(Auth.email || '')}</p><ul class="optlist">
      <li><button class="opt" data-act="menu-import">${I.upload} Importar arquivo do Claude</button></li>
      <li><button class="opt" data-act="menu-cats">${I.tag} Categorias</button></li>
      ${sheets ? `<li><button class="opt" data-act="menu-refresh">${I.refresh} Atualizar agora</button></li>
      <li><a class="opt" href="${esc(store.url)}" target="_blank" rel="noopener">${I.table} Abrir a planilha</a></li>
      <li><button class="opt" data-act="menu-switch">${I.swap} Trocar de banco</button></li>
      <li><button class="opt danger" data-act="menu-logout">${I.out} Sair da conta</button></li>` : ''}
    </ul>`);
  }
  function sheetCats() {
    const count = new Map(); for (const t of T) { const c = catOf(t); count.set(c, (count.get(c) || 0) + 1); }
    const rows = sortedCats().map((c) => {
      if (ui.renaming === c.id) return `<li><form class="row" data-form="rename" data-cat="${esc(c.id)}" style="padding:8px 0"><label class="sr" for="rn">Novo nome</label><input class="input" id="rn" value="${esc(c.nome)}" maxlength="60" autocomplete="off"><button class="btn primary small">Salvar</button><button type="button" class="btn small" data-act="cat-cancel">Voltar</button></form></li>`;
      const n = count.get(c.id) || 0;
      let html = `<li><div class="opt" style="cursor:default"><span>${esc(c.nome)}</span><small class="num">${n}</small>${c.id !== 'sem' ? `<button class="btn small" data-act="cat-rename" data-cat="${esc(c.id)}">Renomear</button><button class="btn small" data-act="cat-delete" data-cat="${esc(c.id)}">Excluir</button>` : ''}</div>`;
      if (ui.deleting === c.id) html += `<div class="confirmbox"><span>Excluir “${esc(c.nome)}”? ${n ? `${n === 1 ? 'O lançamento dela vai' : 'Os ' + n + ' lançamentos dela vão'} para Sem categoria.` : 'Ela não tem lançamentos.'}</span><div class="row"><button class="btn danger small" data-act="cat-dodelete" data-cat="${esc(c.id)}">Excluir</button><button class="btn small" data-act="cat-cancel">Cancelar</button></div></div>`;
      return html + '</li>';
    }).join('');
    openSheet(`<h3>Categorias</h3><p class="sub">Valem para vocês dois.</p>
      <form class="row" data-form="newcat"><label class="sr" for="nc">Nova categoria</label><input class="input" id="nc" placeholder="Nova categoria" maxlength="60" autocomplete="off"><button class="btn primary">Criar</button></form>
      <ul class="optlist">${rows}</ul>`);
  }
  function sheetImport(pkg, summary) {
    ui.pendingImport = pkg;
    const s = summary;
    openSheet(`<h3>Importar arquivo</h3><p class="sub">${esc(pkg.descricao || 'Pacote gerado pelo Claude')}</p>
      <ul class="optlist">
        <li class="opt">Faturas novas<small class="num">${s.faturas}</small></li>
        <li class="opt">Lançamentos novos<small class="num">${s.lancamentos}</small></li>
        ${s.repetidos ? `<li class="opt">Já estavam no banco (ignorados)<small class="num">${s.repetidos}</small></li>` : ''}
        ${s.porRegra ? `<li class="opt">Classificados pelas regras de vocês<small class="num">${s.porRegra}</small></li>` : ''}
        <li class="opt">Categorias novas<small class="num">${s.categorias}</small></li>
        <li class="opt">Análises<small class="num">${s.analises}</small></li>
      </ul>
      <button class="btn primary block" data-act="do-import" ${s.lancamentos + s.faturas + s.categorias + s.analises + s.regras === 0 ? 'disabled' : ''}>${s.lancamentos + s.faturas + s.categorias + s.analises + s.regras === 0 ? 'Nada novo para importar' : 'Importar'}</button>`);
  }

  /* ---------- ações ---------- */
  async function moveTo(ids, catId, opts = {}) {
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!items.length) return;
    const prev = items.map((t) => [t, t.categoria, t.conferir]);
    items.forEach((t) => { t.categoria = catId; t.conferir = false; });
    ui.sel.clear();
    render();
    setSync('busy', 'Salvando…');
    try { await store.setCategory(items, catId); setSync('ok', 'Salvo'); }
    catch (e) { prev.forEach(([t, c, r]) => { t.categoria = c; t.conferir = r; }); render(); handleError(e); return; }
    const undo = { label: 'Desfazer', fn: () => restore(prev) };
    if (items.length === 1 && !opts.quiet) {
      const t = items[0];
      const others = T.filter((o) => o.id !== t.id && o.chave === t.chave && catOf(o) !== catId);
      toast(`Movido para ${catName(catId)}.` + (others.length ? ` Há mais ${others.length} de ${t.estabelecimento}.` : ''),
        [{ label: others.length ? `Mover os ${others.length} e os próximos` : 'Sempre assim', primary: true, fn: () => applyAll(t.chave, t.estabelecimento, catId) }, undo], 10000);
    } else if (!opts.quiet) toast(`${items.length} lançamentos em ${catName(catId)}.`, [undo]);
  }
  async function restore(prev) {
    const groups = new Map();
    for (const [t, c] of prev) { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(t); }
    for (const [c, ts] of groups) {
      ts.forEach((t) => { t.categoria = c; });
      render();
      try { await store.setCategory(ts, c); } catch (e) { handleError(e); return; }
    }
    setSync('ok', 'Salvo');
    toast('Mudança desfeita.');
  }
  async function applyAll(chave, nome, catId) {
    const others = T.filter((o) => o.chave === chave && catOf(o) !== catId).map((o) => o.id);
    if (others.length) await moveTo(others, catId, { quiet: true });
    try {
      const existing = D.regras.find((r) => r.chave === chave);
      const r = await store.saveRule({ chave, categoria: catId, origem: 'usuario' }, existing);
      if (!existing) D.regras.push(r);
      toast(`${nome}: ${others.length ? others.length + ' movidos e ' : ''}os próximos vão direto para ${catName(catId)}.`);
    } catch (e) { handleError(e); }
  }
  async function confirmIds(ids) {
    const items = ids.map((id) => byId.get(id)).filter((t) => t && t.conferir);
    if (!items.length) return;
    items.forEach((t) => { t.conferir = false; });
    ui.sel.clear();
    render();
    setSync('busy', 'Salvando…');
    try { await store.confirm(items); setSync('ok', 'Salvo'); toast(`${items.length} confirmado${items.length > 1 ? 's' : ''}.`); }
    catch (e) { items.forEach((t) => { t.conferir = true; }); render(); handleError(e); }
  }
  function validName(nome, exceptId) {
    const n = nome.trim().replace(/\s+/g, ' ');
    if (!n) return { err: 'Dê um nome à categoria.' };
    if (activeCats().some((c) => c.id !== exceptId && coll.compare(c.nome, n) === 0)) return { err: 'Já existe uma categoria com esse nome.' };
    return { nome: n.slice(0, 60) };
  }
  async function createCategory(nome) {
    const v = validName(nome);
    if (v.err) { toast(v.err); return null; }
    setSync('busy', 'Salvando…');
    try { const c = await store.addCategory(v.nome); D.categorias.push(c); catById.set(c.id, c); setSync('ok', 'Salvo'); return c; }
    catch (e) { handleError(e); return null; }
  }
  async function renameCategory(id, nome) {
    const c = catById.get(id); const v = validName(nome, id);
    if (!c) return;
    if (v.err) { toast(v.err); return; }
    const old = c.nome; c.nome = v.nome; render();
    try { await store.saveCategory(c); setSync('ok', 'Salvo'); } catch (e) { c.nome = old; render(); handleError(e); }
  }
  async function deleteCategory(id) {
    const c = catById.get(id); if (!c || id === 'sem') return;
    const items = T.filter((t) => catOf(t) === id);
    try {
      setSync('busy', 'Salvando…');
      if (items.length) { items.forEach((t) => { t.categoria = 'sem'; }); await store.setCategory(items, 'sem'); }
      c.ativa = false; await store.saveCategory(c);
      if (ui.cat === id) ui.cat = 'sem';
      setSync('ok', 'Salvo'); render();
      toast(`“${c.nome}” excluída${items.length ? `; ${items.length} lançamentos em Sem categoria` : ''}.`);
    } catch (e) { handleError(e); reload(); }
  }
  async function chooseImportFile() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files && input.files[0]; if (!f) return;
      try {
        const pkg = JSON.parse(await f.text());
        const plan = planImport(pkg, D);
        sheetImport(pkg, plan.summary);
      } catch (e) { toast(e.message.includes('JSON') ? 'Esse arquivo não abriu. Use o .json que o Claude gerou.' : e.message, [], 9000); }
    };
    input.click();
  }
  async function doImport() {
    const pkg = ui.pendingImport; if (!pkg) return;
    const btn = $('[data-act="do-import"]'); if (btn) { btn.disabled = true; btn.textContent = 'Importando…'; }
    setSync('busy', 'Importando…');
    try { const s = await store.importPackage(pkg, D); closeSheet(); ui.pendingImport = null; await reload(); toast(`Importado: ${s.lancamentos} lançamentos${s.faturas ? ` de ${s.faturas} fatura${s.faturas > 1 ? 's' : ''}` : ''}.`); }
    catch (e) { handleError(e); if (btn) { btn.disabled = false; btn.textContent = 'Tentar de novo'; } }
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    if (a === 'tab') { ui.tab = el.dataset.tab; window.scrollTo(0, 0); render(); }
    else if (a === 'goto-tab') { ui.tab = el.dataset.tab; window.scrollTo(0, 0); render(); }
    else if (a === 'goto-cat') { ui.tab = 'lanc'; ui.cat = el.dataset.cat; ui.limit = 150; window.scrollTo(0, 0); render(); }
    else if (a === 'tit') { ui.tit = ui.tit === el.dataset.tit && el.classList.contains('kpi') ? 'all' : el.dataset.tit; ui.limit = 150; render(); }
    else if (a === 'pick-fatura') sheetFatura();
    else if (a === 'opt-fatura') { ui.fat = el.dataset.f; ui.limit = 150; closeSheet(); render(); }
    else if (a === 'menu') sheetMenu();
    else if (a === 'close') closeSheet();
    else if (a === 'chip') { ui.cat = el.dataset.cat; ui.limit = 150; renderLancParts(); }
    else if (a === 'sel-toggle') { ui.selMode = !ui.selMode; ui.sel.clear(); render(); }
    else if (a === 'sel-all') { const rows = lancRows(lancBase()); const all = rows.every((t) => ui.sel.has(t.id)); rows.forEach((t) => (all ? ui.sel.delete(t.id) : ui.sel.add(t.id))); renderLancParts(); renderActionbar(); }
    else if (a === 'catbtn') sheetCategory([el.dataset.id]);
    else if (a === 'more') { ui.limit += 150; renderLancParts(); }
    else if (a === 'confirm-one') confirmIds([el.dataset.id]);
    else if (a === 'confirm-all') confirmIds(lancRows(lancBase()).map((t) => t.id));
    else if (a === 'bulk-move') sheetCategory([...ui.sel]);
    else if (a === 'bulk-confirm') confirmIds([...ui.sel]);
    else if (a === 'bulk-clear') { ui.sel.clear(); renderLancParts(); renderActionbar(); }
    else if (a === 'opt-cat') { const ids = pick ? pick.ids : []; const cat = el.dataset.cat; closeSheet(); moveTo(ids, cat); }
    else if (a === 'pick-new') { const ids = pick ? pick.ids : []; const nome = $('#pickq').value; closeSheet(); const c = await createCategory(nome); if (c) moveTo(ids, c.id); }
    else if (a === 'menu-import') { closeSheet(); chooseImportFile(); }
    else if (a === 'menu-cats') { ui.renaming = ui.deleting = null; sheetCats(); }
    else if (a === 'menu-refresh') { closeSheet(); reload(); }
    else if (a === 'menu-switch') { closeSheet(); LS.del('gastos.sheet'); showScreen(screenSetup()); }
    else if (a === 'menu-logout') { closeSheet(); Auth.logout(); location.reload(); }
    else if (a === 'cat-rename') { ui.renaming = el.dataset.cat; ui.deleting = null; sheetCats(); const i = $('#rn'); if (i) { i.focus(); i.select(); } }
    else if (a === 'cat-delete') { ui.deleting = el.dataset.cat; ui.renaming = null; sheetCats(); }
    else if (a === 'cat-cancel') { ui.renaming = ui.deleting = null; sheetCats(); }
    else if (a === 'cat-dodelete') { const id = el.dataset.cat; ui.deleting = null; await deleteCategory(id); sheetCats(); }
    else if (a === 'do-import') doImport();
    else if (a === 'login') doLogin(el);
    else if (a === 'create-db') createDb(el);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('#lancList input[type="checkbox"]')) {
      if (t.checked) ui.sel.add(t.dataset.id); else ui.sel.delete(t.dataset.id);
      t.closest('.tx').classList.toggle('sel', t.checked);
      renderActionbar();
    } else if (t.id === 'fTipo') { ui.tipo = t.value; ui.limit = 150; renderLancParts(); }
  });
  let qTimer = null;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') { clearTimeout(qTimer); const v = e.target.value; qTimer = setTimeout(() => { ui.q = v; ui.qn = norm(v).split(/\s+/).filter(Boolean); ui.limit = 150; renderLancParts(); }, 150); }
    else if (e.target.id === 'pickq') { const one = pick && pick.ids.length === 1 ? byId.get(pick.ids[0]) : null; renderPickList(e.target.value, one ? catOf(one) : null); }
  });
  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const kind = f.dataset.form;
    if (kind === 'newcat') { const c = await createCategory($('#nc').value); if (c) { render(); sheetCats(); toast(`Categoria “${c.nome}” criada.`); } }
    else if (kind === 'rename') { const id = f.dataset.cat; ui.renaming = null; await renameCategory(id, $('#rn').value); sheetCats(); }
    else if (kind === 'usedb') useDb($('#dblink').value);
    else if (f.id === 'pickForm') { /* sem uso */ }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
    if (e.key === 'Enter' && e.target.id === 'pickq') { e.preventDefault(); const first = $('#pickList button'); if (first) first.click(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store && store.kind === 'sheets' && Date.now() - lastLoad > 60000 && Auth.valid()) reload();
  });

  /* ---------- telas de entrada ---------- */
  const LOGO = 'icons/icon-192.png';
  function showScreen(html) { $('#app').hidden = true; const s = $('#screen'); s.innerHTML = `<div class="box">${html}</div>`; s.hidden = false; }
  function hideScreen() { $('#screen').hidden = true; $('#app').hidden = false; }
  function screenConfig() {
    return `<img class="logo" src="${LOGO}" alt=""><h1>Falta um passo</h1><p>O app ainda não sabe qual credencial do Google usar. Coloque o ID do cliente OAuth no arquivo <strong>config.js</strong> e publique de novo. O passo a passo está no LEIAME.</p>`;
  }
  function screenLogin(ready) {
    return `<img class="logo" src="${LOGO}" alt=""><h1>Gastos do Cartão</h1><p>Entre com a sua conta Google. O app lê e grava só na planilha-banco de vocês, no seu Drive.</p>
      <button class="btn primary block" data-act="login"${ready ? '' : ' disabled'}>${ready ? 'Entrar com Google' : 'Carregando o login do Google…'}</button>
      <p class="note">Nada fica guardado em servidor do app. Os dados ficam na planilha, e só entra quem tiver acesso a ela.</p><p class="err" id="loginErr" hidden></p>`;
  }
  function screenSetup() {
    return `<img class="logo" src="${LOGO}" alt=""><h1>Onde ficam os dados?</h1><p>Na primeira vez, um de vocês cria o banco. O outro usa o mesmo, depois que ele for compartilhado.</p>
      <button class="btn primary block" data-act="create-db">Criar o banco no meu Google Drive</button>
      <form data-form="usedb" class="row"><label class="sr" for="dblink">Link da planilha</label><input class="input" id="dblink" placeholder="Colar o link da planilha já criada" autocomplete="off"><button class="btn">Usar</button></form>
      <p class="err" id="setupErr" hidden></p>`;
  }
  async function doLogin(btn) {
    btn.disabled = true; btn.textContent = 'Abrindo o Google…';
    try { await Auth.login(); await afterLogin(); }
    catch (e) { const er = $('#loginErr'); if (er) { er.textContent = e.message; er.hidden = false; } btn.disabled = false; btn.textContent = 'Entrar com Google'; }
  }
  async function createDb(btn) {
    btn.disabled = true; btn.textContent = 'Criando a planilha…';
    try {
      store = await SheetsStore.create('Gastos do Cartão (banco do app)', () => Auth.getToken());
      LS.set('gastos.sheet', store.id);
      await startApp();
      toast('Banco criado no seu Drive. Agora importe o arquivo do Claude.', [{ label: 'Importar', primary: true, fn: chooseImportFile }], 15000);
    } catch (e) {
      if (e.name === 'AuthError') { showScreen(screenLogin(true)); return; }
      const er = $('#setupErr'); if (er) { er.textContent = e.message; er.hidden = false; } btn.disabled = false; btn.textContent = 'Criar o banco no meu Google Drive';
    }
  }
  function useDb(link) {
    const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(link) || /^([a-zA-Z0-9_-]{20,})$/.exec(link.trim());
    if (!m) { const er = $('#setupErr'); er.textContent = 'Cole o link completo da planilha (docs.google.com/spreadsheets/d/...).'; er.hidden = false; return; }
    LS.set('gastos.sheet', m[1]);
    afterLogin();
  }
  async function afterLogin() {
    const id = CFG.SPREADSHEET_ID || LS.get('gastos.sheet');
    if (!id) { showScreen(screenSetup()); return; }
    store = new SheetsStore({ spreadsheetId: id, getToken: () => Auth.getToken() });
    await startApp();
  }
  async function startApp() {
    hideScreen();
    $('#btnMenu').innerHTML = I.more;
    await reload();
  }
  async function boot() {
    if (DEMO) { $('#demoBar').hidden = false; store = new MemoryStore(DEMO.pkg); await startApp(); return; }
    if (!CFG.CLIENT_ID || CFG.CLIENT_ID.startsWith('COLE_AQUI')) { showScreen(screenConfig()); return; }
    Auth.restore();
    if (!Auth.valid()) { showScreen(screenLogin(false)); const ok = await Auth.waitReady(); showScreen(screenLogin(ok)); return; }
    await Auth.waitReady();
    await afterLogin();
  }
  if (!DEMO && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
})();
