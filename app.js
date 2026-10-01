/* Gastos do Cartão: interface. Os dados vêm de window.GastosStore (planilha do Google ou prévia em memória). */
(function () {
  'use strict';
  const CFG = window.GASTOS_CONFIG || {};
  const DEMO = window.GASTOS_DEMO || null;
  const { SheetsStore, MemoryStore, planImport } = window.GastosStore;
  const SCOPE_SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
  const SCOPES = SCOPE_SHEETS + ' https://www.googleapis.com/auth/userinfo.email';
  const APP_V = '5'; // precisa bater com --app-v no styles.css

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
    dots: svg('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>', true),
    pie: svg('<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
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
  const ui = { tab: 'resumo', fat: 'all', tit: 'all', cat: 'all', tipo: 'all', q: '', qn: [], limit: 150, selMode: false, sel: new Set(), renaming: null, deleting: null, pendingImport: null, pieMode: 'juntos', pieSel: null, grouping: null, renamingGroup: null };

  const catOf = (t) => { const c = catById.get(t.categoria); return c && c.ativa !== false ? t.categoria : 'sem'; };
  const catName = (id) => (catById.get(id) || {}).nome || 'Sem categoria';
  // Grupo (categoria mãe). Vale o que estiver na coluna "grupo" da planilha; sem nada lá, usa este padrão.
  // Categoria sem grupo padrão (ex.: as criadas por vocês) vira um grupo sozinha, com o próprio nome.
  const GRUPO_PADRAO = {
    mercado: 'Alimentação', restaurantes: 'Alimentação', lanches: 'Alimentação', delivery: 'Alimentação',
    app: 'Transporte', combustivel: 'Transporte', estacionamento: 'Transporte', veiculo: 'Transporte',
    farmacia: 'Saúde e bem-estar', saude: 'Saúde e bem-estar', esporte: 'Saúde e bem-estar', cuidados: 'Saúde e bem-estar',
    online: 'Compras', vestuario: 'Compras', eletronicos: 'Compras', lojas: 'Compras', casa: 'Compras',
    viagem: 'Lazer e viagens', lazer: 'Lazer e viagens',
    assinaturas: 'Serviços e assinaturas', tecnologia: 'Serviços e assinaturas', seguros: 'Serviços e assinaturas',
    educacao: 'Serviços e assinaturas', pontos: 'Serviços e assinaturas', iof: 'Serviços e assinaturas',
    creditos: 'Créditos e estornos',
  };
  const grupoOf = (id) => {
    if (id === 'sem') return 'Sem categoria';
    const c = catById.get(id);
    if (c && String(c.grupo || '').trim()) return String(c.grupo).trim();
    return GRUPO_PADRAO[id] || (c ? c.nome : 'Sem categoria');
  };
  const soloGroup = (c) => grupoOf(c.id) === c.nome; // categoria que é grupo sozinha
  function groupedCats() {
    const a = activeCats();
    const sem = a.find((c) => c.id === 'sem');
    const m = new Map(), solo = [];
    for (const c of a) {
      if (c.id === 'sem') continue;
      if (soloGroup(c)) { solo.push(c); continue; }
      const g = grupoOf(c.id); if (!m.has(g)) m.set(g, []); m.get(g).push(c);
    }
    const byName = (x, y) => coll.compare(x.nome, y.nome);
    const out = [...m.entries()].sort((x, y) => coll.compare(x[0], y[0])).map(([g, cats]) => ({ g, cats: cats.sort(byName) }));
    if (solo.length) out.push({ g: '', cats: solo.sort(byName) });
    return (sem ? [{ g: null, cats: [sem] }] : []).concat(out);
  }
  const realGroups = () => [...new Set(activeCats().filter((c) => c.id !== 'sem' && !soloGroup(c)).map((c) => grupoOf(c.id)))].sort(coll.compare);
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
  function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; document.body.style.overflow = ''; pick = null; ui.renaming = ui.deleting = ui.grouping = ui.renamingGroup = null; }
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
    v.innerHTML = ui.tab === 'resumo' ? viewResumo() : ui.tab === 'graf' ? viewGraficos() : ui.tab === 'lanc' ? viewLanc() : ui.tab === 'parc' ? viewParcelas() : ui.tab === 'rec' ? viewRecorrentes() : viewAnalises();
    if (ui.tab === 'lanc') renderLancParts();
    renderActionbar();
  }
  function renderTop() {
    const nf = D.faturas.length;
    $('#brandSub').textContent = store.kind === 'memory' ? 'Prévia com seus dados' : (Auth.email || `${nf} faturas`);
    $('#btnFatura').innerHTML = `<span>${ui.fat === 'all' ? 'Todas as faturas' : 'Fatura ' + esc(fatLabel(ui.fat))}</span>${I.down}`;
    $('#segTit').innerHTML = [['all', 'Todos']].concat(titulares.map((h) => [h, h])).map(([v, l]) => `<button data-act="tit" data-tit="${esc(v)}" aria-pressed="${ui.tit === v}">${esc(l)}</button>`).join('');
  }
  // telas que ficam no botão "Mais" da barra de baixo
  const MAIS = [['rec', 'Fixos', 'rec', 'Cobranças que se repetem todo mês'], ['anal', 'Análises', 'anal', 'Os textos do Claude sobre cada fatura']];
  function sheetMais() {
    openSheet(`<h3>Mais</h3><ul class="optlist">${MAIS.map(([id, l, ic, d]) => `<li><button class="opt opt2" data-act="opt-tab" data-tab="${id}">${I[ic]}<span><strong>${l}</strong><small>${d}</small></span>${ui.tab === id ? `<span class="on">${svg('<path d="M20 6L9 17l-5-5"/>')}</span>` : ''}</button></li>`).join('')}</ul>`);
  }
  function renderTabbar() {
    const pend = T.filter((t) => catOf(t) === 'sem' || needsReview(t)).length;
    const tabs = [['resumo', 'Resumo', I.resumo], ['graf', 'Gráficos', I.pie], ['lanc', 'Extrato', I.lanc], ['parc', 'Parcelas', I.parc], ['mais', 'Mais', I.dots]];
    const on = (id) => (id === 'mais' ? MAIS.some((m) => m[0] === ui.tab) : ui.tab === id);
    $('#tabbar').innerHTML = tabs.map(([id, l, ic]) => `<button role="tab" data-act="${id === 'mais' ? 'mais' : 'tab'}" data-tab="${id}" aria-selected="${on(id)}">${ic}<span class="tl">${id === 'mais' && on(id) ? MAIS.find((m) => m[0] === ui.tab)[1] : l}</span>${id === 'lanc' && pend ? `<span class="badge">${pend}</span>` : ''}</button>`).join('');
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

  /* ---------- gráficos ---------- */
  // Cada fatia é um grupo (categoria mãe) ou uma categoria, conforme a escolha no alto do gráfico.
  // Cor fixa por fatia, calculada sobre o banco inteiro, para não mudar com os filtros de fatura e titular:
  // entram primeiro as 3 maiores de cada titular e depois as maiores do total. Se uma delas é desmarcada,
  // a cor livre passa para a próxima; as outras não mudam. Azul e laranja ficam reservados para os titulares.
  // O que fica de fora das 6 cores vira uma fatia cinza só ("Outras").
  const PIE_K = 6;
  const FORA_KEY = 'gastos.graf.fora', VIEW_KEY = 'gastos.graf.view';
  let fora = new Set(); // categorias desmarcadas (vale para as duas visões)
  try { fora = new Set(JSON.parse(LS.get(FORA_KEY) || '[]')); } catch { fora = new Set(); }
  const saveFora = () => LS.set(FORA_KEY, JSON.stringify([...fora]));
  ui.pieView = LS.get(VIEW_KEY) === 'cat' ? 'cat' : 'grupo';
  const BRLc = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  const CHECK = svg('<path d="M20 6L9 17l-5-5"/>');
  const DASH = svg('<path d="M6 12h12"/>');
  const entKey = (cid, view) => (view === 'grupo' ? 'g:' + grupoOf(cid) : cid);
  const entLabel = (k) => (k.startsWith('g:') ? k.slice(2) : catName(k));
  const isGroupKey = (k) => typeof k === 'string' && k.startsWith('g:');
  function membersOf(k) { if (!isGroupKey(k)) return [k]; const g = k.slice(2); return activeCats().filter((c) => grupoOf(c.id) === g).map((c) => c.id); }
  function catNet(list) { const m = new Map(); for (const t of list) { const c = catOf(t); m.set(c, (m.get(c) || 0) + t.cents); } return m; }
  function entRows(list, view) {
    const by = new Map();
    for (const [cid, v] of catNet(list)) {
      if (v <= 0) continue; // créditos e estornos ficam fora da pizza
      const k = entKey(cid, view);
      if (!by.has(k)) by.set(k, { id: k, label: entLabel(k), members: [], tot: 0, all: 0 });
      const e = by.get(k), on = !fora.has(cid);
      e.members.push({ id: cid, tot: v, on }); e.all += v; if (on) e.tot += v;
    }
    const out = [...by.values()];
    for (const e of out) { e.members.sort((x, y) => y.tot - x.tot); const n = e.members.filter((x) => x.on).length; e.on = n > 0; e.partial = n > 0 && n < e.members.length; }
    return out.sort((x, y) => y.all - x.all);
  }
  function entSlots(view) {
    const net = new Map(), netT = new Map();
    for (const t of T) {
      const c = catOf(t);
      net.set(c, (net.get(c) || 0) + t.cents);
      if (!netT.has(t.titular)) netT.set(t.titular, new Map());
      const m = netT.get(t.titular); m.set(c, (m.get(c) || 0) + t.cents);
    }
    const agg = (m) => { const e = new Map(); for (const [c, v] of m) if (v > 0) { const k = entKey(c, view); e.set(k, (e.get(k) || 0) + v); } return e; };
    const tot = agg(net);
    const byTot = (x, y) => tot.get(y) - tot.get(x);
    const ranked = [...tot.keys()].sort(byTot);
    const fav = new Set();
    for (const m of netT.values()) [...agg(m).entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).forEach(([k]) => fav.add(k));
    const order = ranked.filter((k) => fav.has(k)).concat(ranked.filter((k) => !fav.has(k)));
    const mem = new Map();
    for (const [c, v] of net) if (v > 0) { const k = entKey(c, view); if (!mem.has(k)) mem.set(k, []); mem.get(k).push(c); }
    const off = (k) => (mem.get(k) || []).every((c) => fora.has(c));
    const slots = new Map(), free = [];
    order.slice(0, PIE_K).sort(byTot).forEach((k, i) => { if (off(k)) free.push(i); else slots.set(k, i); });
    for (const k of order.slice(PIE_K)) { if (!free.length) break; if (!off(k)) slots.set(k, free.shift()); }
    return slots;
  }
  function pieModel(list, slots, view) {
    const rows = entRows(list, view);
    const inc = rows.filter((r) => r.on);
    const total = inc.reduce((x, r) => x + r.tot, 0);
    const slices = inc.filter((r) => slots.has(r.id)).sort((x, y) => slots.get(x.id) - slots.get(y.id))
      .map((r) => ({ id: r.id, v: r.tot, k: 'pk' + slots.get(r.id), label: r.label }));
    const rest = inc.filter((r) => !slots.has(r.id));
    const restV = rest.reduce((x, r) => x + r.tot, 0);
    if (restV > 0) slices.push({ id: '__outras', v: restV, k: 'pkx', members: rest.map((r) => r.id), label: rest.length === 1 ? rest[0].label : view === 'grupo' ? `Outros ${rest.length} grupos` : `Outras ${rest.length} categorias` });
    let credit = 0; for (const v of catNet(list).values()) if (v < 0) credit += v;
    return { rows, inc, total, slices, credit, view };
  }
  function selInfo(m) {
    const id = ui.pieSel;
    if (!id) return null;
    if (id === '__outras') { const sl = m.slices.find((x) => x.id === '__outras'); return { id, label: sl ? sl.label : 'Outras', v: sl ? sl.v : 0, slice: sl || null, group: true }; }
    const r = m.rows.find((x) => x.id === id);
    if (!r) return { id, label: entLabel(id), v: 0, slice: null, row: null };
    const slice = r.on ? m.slices.find((x) => x.id === id || (x.members && x.members.includes(id))) : null;
    return { id, label: r.label, v: r.tot, slice, off: !r.on, row: r };
  }
  // cor de cada fatia, com reserva no próprio app (se o styles.css estiver desatualizado, a pizza não fica preta)
  const PIE_HEX = { pk0: '#1baf7a', pk1: '#eda100', pk2: '#e87ba4', pk3: '#008300', pk4: '#4a3aa7', pk5: '#e34948', pkx: '#85928e' };
  function pieColor(k) {
    let v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue('--' + k.slice(1)).trim(); } catch { v = ''; }
    return /^#[0-9a-f]{6}$/i.test(v) ? v : PIE_HEX[k];
  }
  function inkOn(hex) { // texto escuro ou branco, o que tiver mais contraste com a cor da fatia
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const n = parseInt(hex.slice(1), 16);
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return 1.05 / (L + 0.05) >= (L + 0.05) / (0.0128 + 0.05) ? '#ffffff' : '#15201e';
  }
  function sectorPath(a0, a1) {
    const C = 60, R1 = 57, R0 = 37;
    const P = (r, a) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
    if (a1 - a0 >= 2 * Math.PI - 1e-6) return `M${C} ${C - R1}A${R1} ${R1} 0 1 1 ${C} ${C + R1}A${R1} ${R1} 0 1 1 ${C} ${C - R1}ZM${C} ${C - R0}A${R0} ${R0} 0 1 0 ${C} ${C + R0}A${R0} ${R0} 0 1 0 ${C} ${C - R0}Z`;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    return `M${P(R1, a0)}A${R1} ${R1} 0 ${big} 1 ${P(R1, a1)}L${P(R0, a1)}A${R0} ${R0} 0 ${big} 0 ${P(R0, a0)}Z`;
  }
  function donut(m, s, aria, small) {
    let a = 0, body = '', labels = '';
    const minFrac = small ? 0.09 : 0.045; // só escreve o percentual onde ele cabe
    if (!m.total) body = `<path class="pk-empty" fill-rule="evenodd" style="fill:var(--line,#d9e1de)" d="${sectorPath(0, 2 * Math.PI)}"/>`;
    else for (const x of m.slices) {
      const frac = x.v / m.total;
      const a1 = a + frac * 2 * Math.PI;
      const dim = s && s.slice && s.slice !== x;
      const hex = pieColor(x.k);
      body += `<path class="${x.k}${dim ? ' dim' : ''}" fill-rule="evenodd" style="fill:${hex}" d="${sectorPath(a, a1)}" data-act="pie-sel" data-cat="${esc(x.id)}"><title>${esc(x.label)}: ${money(x.v)} (${pct(x.v, m.total)})</title></path>`;
      if (frac >= minFrac) {
        const mid = (a + a1) / 2, r = 47;
        labels += `<text class="pl${dim ? ' dim' : ''}" text-anchor="middle" dominant-baseline="central" x="${(60 + r * Math.sin(mid)).toFixed(2)}" y="${(60 - r * Math.cos(mid)).toFixed(2)}" fill="${inkOn(hex)}">${Math.round(frac * 100)}%</text>`;
      }
      a = a1;
    }
    body += '<circle cx="60" cy="60" r="36" fill="transparent" data-act="pie-sel" data-cat=""/>';
    return `<svg class="donut${small ? ' small' : ''}" viewBox="0 0 120 120" role="img" aria-label="${esc(aria)}">${body}${labels}</svg>`;
  }
  function donutCenter(m, s, compact, title) {
    const f = compact ? (c) => BRLc.format(c / 100) : money;
    const head = title ? `<span class="dt">${title}</span>` : '';
    if (s) {
      const p = s.off ? 'fora do gráfico' : s.v && m.total ? pct(s.v, m.total) : 'sem gastos';
      return `<div class="dc">${head}<span class="dn">${esc(s.label)}</span><span class="dv">${f(s.v)}</span><span class="dp">${p}</span></div>`;
    }
    const n = m.inc.length, w = m.view === 'grupo' ? ['grupo', 'grupos'] : ['categoria', 'categorias'];
    return `<div class="dc">${head || '<span class="dn">No gráfico</span>'}<span class="dv">${f(m.total)}</span><span class="dp">${n} ${n === 1 ? w[0] : w[1]}</span></div>`;
  }
  function selCats(m, s) { // categorias que entram na divisão entre titulares
    const on = (r) => r.members.filter((x) => x.on).map((x) => x.id);
    if (!s) return m.inc.flatMap(on);
    if (s.id === '__outras') return (s.slice ? s.slice.members : []).flatMap((k) => { const r = m.rows.find((x) => x.id === k); return r ? on(r) : []; });
    if (s.row) return s.row.on ? on(s.row) : s.row.members.map((x) => x.id);
    return membersOf(s.id);
  }
  function splitHtml(LF, m) {
    const s = selInfo(m);
    const set = new Set(selCats(m, s));
    const by = {};
    for (const t of LF) if (set.has(catOf(t))) by[t.titular] = (by[t.titular] || 0) + t.cents;
    const pos = titulares.map((h) => [h, Math.max(0, by[h] || 0)]);
    const tot = pos.reduce((x, [, v]) => x + v, 0);
    const segs = pos.filter(([, v]) => v > 0);
    const bar = tot
      ? `<div class="split100">${segs.map(([h, v], i) => `<span class="bseg ${hClass(h)}${i === 0 ? ' first' : ''}${i === segs.length - 1 ? ' end' : ''}" style="width:${((v / tot) * 100).toFixed(2)}%" title="${esc(h)}: ${money(v)}"></span>`).join('')}</div>`
      : '<div class="split100"><span class="bseg empty" style="width:100%"></span></div>';
    const labels = titulares.map((h) => `<span class="sl"><i class="sw ${hClass(h)}"></i>${esc(h)} <strong class="num">${money(by[h] || 0)}</strong>${tot ? `<span class="num muted">${pct(Math.max(0, by[h] || 0), tot)}</span>` : ''}</span>`).join('');
    const what = s ? esc(s.label) : m.inc.length < m.rows.length || m.rows.some((r) => r.partial) ? 'o que está marcado no gráfico' : 'tudo';
    return `<div class="gsplit"><div class="gsh"><span class="eyebrow">Divisão entre titulares</span><span class="gsw">${what}</span></div>${bar}<div class="slabels">${labels}</div></div>`;
  }
  function drillHtml(s) { // o que tem dentro do grupo tocado
    if (!s || !s.row || !isGroupKey(s.id)) return '';
    const mem = s.row.members;
    const tot = mem.filter((x) => x.on).reduce((x, y) => x + y.tot, 0);
    const max = Math.max(1, ...mem.map((x) => x.tot));
    const hex = pieColor(s.slice ? s.slice.k : 'pkx');
    return `<div class="gsub"><div class="gsh"><span class="eyebrow">Dentro de ${esc(s.label)}</span><span class="gsw">toque numa categoria para ver os lançamentos</span></div>${mem.map((x) => `<button class="subrow${x.on ? '' : ' off'}" data-act="goto-cat" data-cat="${esc(x.id)}"><span class="sn">${esc(catName(x.id))}</span><span class="sv num">${money(x.tot)}</span><span class="sp num">${x.on && tot ? pct(x.tot, tot) : 'fora'}</span><span class="sbar"><i style="width:${((x.tot / max) * 100).toFixed(1)}%;background:${x.on ? hex : 'var(--line-strong,#bfcac7)'}"></i></span></button>`).join('')}</div>`;
  }
  function viewGraficos() {
    const LF = T.filter(inFat);
    const L = LF.filter(inTit);
    const view = ui.pieView;
    const slots = entSlots(view);
    const m = pieModel(L, slots, view);
    const multi = ui.tit === 'all' && titulares.length > 1;
    const sep = multi && ui.pieMode === 'sep';
    if (ui.pieSel === '__outras' && !m.slices.some((x) => x.id === '__outras')) ui.pieSel = null;
    const s = selInfo(m);
    const per = sep ? titulares.map((h) => ({ h, m: pieModel(LF.filter((t) => t.titular === h), slots, view) })) : [];
    const w = view === 'grupo' ? ['grupo', 'grupos', 'Os grupos'] : ['categoria', 'categorias', 'As categorias'];
    const charts = sep
      ? `<div class="donuts two">${per.map((p) => `<div class="dwrap small">${donut(p.m, selInfo(p.m), `Gastos de ${p.h} por ${w[0]}`, true)}${donutCenter(p.m, selInfo(p.m), true, `<span class="dot ${hClass(p.h)}"></span>${esc(p.h)}`)}</div>`).join('')}</div>`
      : `<div class="donuts"><div class="dwrap">${donut(m, s, `Gastos por ${w[0]}`)}${donutCenter(m, s, false)}</div></div>`;
    const ctrl = `<div class="gctrl"><div class="seg" role="group" aria-label="Fatias por"><button data-act="pie-view" data-view="grupo" aria-pressed="${view === 'grupo'}">Grupos</button><button data-act="pie-view" data-view="cat" aria-pressed="${view === 'cat'}">Categorias</button></div>${multi ? `<div class="seg" role="group" aria-label="Titulares"><button data-act="pie-mode" data-mode="juntos" aria-pressed="${!sep}">Juntos</button><button data-act="pie-mode" data-mode="sep" aria-pressed="${sep}">Por titular</button></div>` : ''}</div>`;
    let act;
    if (!s) act = `<p class="hint center">Toque numa fatia ou num nome da lista para ${view === 'grupo' ? 'ver o que tem dentro' : 'destacar'}.</p>`;
    else if (s.id === '__outras') act = `<p class="hint center">${w[2]} com o quadrado cinza, na lista, formam essa fatia.</p>`;
    else if (isGroupKey(s.id)) act = '';
    else act = `<button class="btn small block" data-act="goto-cat" data-cat="${esc(s.id)}">Ver os lançamentos dessa categoria</button>`;
    const nOn = m.inc.length;
    const offV = m.rows.reduce((x, r) => x + (r.all - r.tot), 0);
    const bar = `<div class="lgbar"><span>${nOn} de ${m.rows.length} ${w[1]} no gráfico${offV ? ` · fora: <span class="num">${money(offV)}</span>` : ''}</span><span class="lgbtns">${offV ? '<button class="linkbtn" data-act="pie-all">Marcar tudo</button>' : ''}${nOn ? '<button class="linkbtn" data-act="pie-none">Desmarcar tudo</button>' : ''}</span></div>`;
    const list = m.rows.map((r) => {
      const k = slots.has(r.id) ? 'pk' + slots.get(r.id) : 'pkx';
      const state = !r.on ? 'false' : r.partial ? 'mixed' : 'true';
      const sub = [];
      if (view === 'grupo') sub.push(`<span class="lmem">${r.members.map((x) => `<span${x.on ? '' : ' class="xoff"'}>${esc(catName(x.id))}</span>`).join(', ')}</span>`);
      if (sep) sub.push(`<span class="lsub num">${per.map((p) => { const x = p.m.rows.find((y) => y.id === r.id); const v = x ? x.tot : 0; return `${esc(p.h)} ${money(v)}${v && p.m.total ? ' · ' + pct(v, p.m.total) : ''}`; }).join('<br>')}</span>`);
      return `<div class="lg${r.on ? '' : ' off'}${ui.pieSel === r.id ? ' sel' : ''}"><button class="lgchk" data-act="pie-toggle" data-ent="${esc(r.id)}" aria-pressed="${state}" aria-label="${r.on ? 'Tirar do gráfico' : 'Pôr no gráfico'}: ${esc(r.label)}"><span class="box">${state === 'true' ? CHECK : state === 'mixed' ? DASH : ''}</span></button><button class="lgmain" data-act="pie-sel" data-cat="${esc(r.id)}"><i class="sw ${k}" style="background:${pieColor(k)}"></i><span class="ln">${esc(r.label)}</span><span class="lnum"><span class="lv num">${money(r.on ? r.tot : r.all)}</span><span class="lp num">${r.on && m.total ? pct(r.tot, m.total) : 'fora'}</span></span>${sub.join('')}</button></div>`;
    }).join('');
    const credit = m.credit < 0 ? `<p class="hint gnote">Créditos e estornos (<span class="num">${money(m.credit)}</span>) não entram no gráfico.</p>` : '';
    const scope = (ui.fat === 'all' ? `todas as ${D.faturas.length} faturas` : 'a fatura ' + esc(fatLabel(ui.fat))) + (ui.tit === 'all' ? '' : ', só ' + esc(ui.tit));
    return `<section class="card graf"><h2>Para onde vai o dinheiro</h2><p class="hint">Percentual sobre ${scope}. Desmarque na lista o que não quer ver no gráfico.</p>
      <div class="gbody"><div class="gleft">${ctrl}${charts}<div class="gact">${act}</div>${drillHtml(s)}${multi ? splitHtml(LF, m) : ''}</div>
      <div class="gright">${bar}<div class="lglist">${list || '<p class="empty">Nada neste filtro.</p>'}</div>${credit}</div></div></section>`;
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
    const match = (c) => !qn || norm(c.nome).includes(qn) || norm(grupoOf(c.id)).includes(qn);
    const groups = groupedCats().map((x) => ({ g: x.g, cats: x.cats.filter(match) })).filter((x) => x.cats.length);
    const exists = activeCats().some((c) => norm(c.nome) === qn);
    $('#pickList').innerHTML = (qn && !exists ? `<li><button class="opt" data-act="pick-new">${svg('<path d="M12 5v14M5 12h14"/>')} Criar “${esc(q.trim())}”</button></li>` : '') +
      groups.map((x) => (x.g === null ? '' : `<li class="pgh">${x.g ? esc(x.g) : 'Sem grupo'}</li>`) + x.cats.map((c) => `<li><button class="opt" data-act="opt-cat" data-cat="${esc(c.id)}">${esc(c.nome)}${cur === c.id ? `<span class="on">${svg('<path d="M20 6L9 17l-5-5"/>')}</span>` : ''}</button></li>`).join('')).join('');
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
    const groups = realGroups();
    const opts = (c) => {
      const cur = soloGroup(c) ? '__own' : grupoOf(c.id);
      return `<option value="__own"${cur === '__own' ? ' selected' : ''}>Sem grupo</option>` + groups.map((g) => `<option value="${esc(g)}"${cur === g ? ' selected' : ''}>${esc(g)}</option>`).join('') + '<option value="__new">Novo grupo…</option>';
    };
    const catRow = (c) => {
      if (ui.renaming === c.id) return `<li><form class="row" data-form="rename" data-cat="${esc(c.id)}" style="padding:8px 0"><label class="sr" for="rn">Novo nome</label><input class="input" id="rn" value="${esc(c.nome)}" maxlength="60" autocomplete="off"><button class="btn primary small">Salvar</button><button type="button" class="btn small" data-act="cat-cancel">Voltar</button></form></li>`;
      if (ui.grouping === c.id) return `<li><form class="catopt" data-form="newgroup" data-cat="${esc(c.id)}"><span class="cn">${esc(c.nome)}</span><div class="row"><label class="sr" for="ng">Nome do grupo</label><input class="input" id="ng" placeholder="Nome do novo grupo" maxlength="60" autocomplete="off"><button class="btn primary small">Salvar</button><button type="button" class="btn small" data-act="cat-cancel">Voltar</button></div></form></li>`;
      const n = count.get(c.id) || 0;
      let html = `<li><div class="catopt"><div class="cl1"><span class="cn">${esc(c.nome)}</span><small class="num">${n} ${n === 1 ? 'lançamento' : 'lançamentos'}</small></div>`;
      if (c.id !== 'sem') html += `<div class="cl2"><label class="grpsel"><span class="sr">Grupo de ${esc(c.nome)}</span><select class="input" data-grp="${esc(c.id)}">${opts(c)}</select></label><button class="btn small" data-act="cat-rename" data-cat="${esc(c.id)}">Renomear</button><button class="btn small" data-act="cat-delete" data-cat="${esc(c.id)}">Excluir</button></div>`;
      html += '</div>';
      if (ui.deleting === c.id) html += `<div class="confirmbox"><span>Excluir “${esc(c.nome)}”? ${n ? `${n === 1 ? 'O lançamento dela vai' : 'Os ' + n + ' lançamentos dela vão'} para Sem categoria.` : 'Ela não tem lançamentos.'}</span><div class="row"><button class="btn danger small" data-act="cat-dodelete" data-cat="${esc(c.id)}">Excluir</button><button class="btn small" data-act="cat-cancel">Cancelar</button></div></div>`;
      return html + '</li>';
    };
    const head = (g, n) => {
      if (g === null) return '';
      if (!g) return '<li class="pgh">Sem grupo</li>';
      if (ui.renamingGroup === g) return `<li class="pgh"><form class="row" data-form="rengroup" data-grp="${esc(g)}"><label class="sr" for="rg">Novo nome do grupo</label><input class="input" id="rg" value="${esc(g)}" maxlength="60" autocomplete="off"><button class="btn primary small">Salvar</button><button type="button" class="btn small" data-act="cat-cancel">Voltar</button></form></li>`;
      return `<li class="pgh"><span>${esc(g)} <small>${n} ${n === 1 ? 'categoria' : 'categorias'}</small></span><button class="linkbtn" data-act="grp-rename" data-grp="${esc(g)}">Renomear grupo</button></li>`;
    };
    const rows = groupedCats().map((x) => head(x.g, x.cats.length) + x.cats.map(catRow).join('')).join('');
    openSheet(`<h3>Categorias</h3><p class="sub">Valem para vocês dois. O grupo junta categorias parecidas nos gráficos (por exemplo, Alimentação reúne restaurantes, mercado e lanches).</p>
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
    const old = c.nome, oldG = c.grupo; c.nome = v.nome; if (c.grupo === old) c.grupo = v.nome; render();
    try { await store.saveCategory(c); setSync('ok', 'Salvo'); } catch (e) { c.nome = old; c.grupo = oldG; render(); handleError(e); }
  }
  const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  async function setCategoryGroup(id, g) {
    const c = catById.get(id); if (!c) return;
    const nome = cleanName(g);
    if (!nome) { toast('Dê um nome ao grupo.'); return; }
    const old = c.grupo; c.grupo = nome; render(); setSync('busy', 'Salvando…');
    try { await store.saveCategory(c); setSync('ok', 'Salvo'); } catch (e) { c.grupo = old; render(); handleError(e); }
  }
  async function renameGroup(oldG, g) {
    const nome = cleanName(g);
    if (!nome) { toast('Dê um nome ao grupo.'); return; }
    if (nome === oldG) return;
    const cats = activeCats().filter((c) => c.id !== 'sem' && grupoOf(c.id) === oldG);
    const prev = cats.map((c) => c.grupo);
    cats.forEach((c) => { c.grupo = nome; }); render(); setSync('busy', 'Salvando…');
    try { for (const c of cats) await store.saveCategory(c); setSync('ok', 'Salvo'); toast(`Grupo renomeado para “${nome}”.`); }
    catch (e) { cats.forEach((c, i) => { c.grupo = prev[i]; }); render(); handleError(e); }
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
    else if (a === 'mais') sheetMais();
    else if (a === 'opt-tab') { ui.tab = el.dataset.tab; closeSheet(); window.scrollTo(0, 0); render(); }
    else if (a === 'pie-mode') { ui.pieMode = el.dataset.mode; render(); }
    else if (a === 'pie-sel') { const c = el.dataset.cat || null; ui.pieSel = c && ui.pieSel !== c ? c : null; render(); }
    else if (a === 'pie-view') { ui.pieView = el.dataset.view === 'cat' ? 'cat' : 'grupo'; LS.set(VIEW_KEY, ui.pieView); ui.pieSel = null; render(); }
    else if (a === 'pie-toggle') { const mem = membersOf(el.dataset.ent); const allOn = mem.every((c) => !fora.has(c)); mem.forEach((c) => (allOn ? fora.add(c) : fora.delete(c))); saveFora(); render(); }
    else if (a === 'pie-all') { fora.clear(); saveFora(); render(); }
    else if (a === 'pie-none') { catAgg(T.filter((t) => inFat(t) && inTit(t))).filter((r) => r.tot > 0).forEach((r) => fora.add(r.id)); saveFora(); render(); }
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
    else if (a === 'menu-cats') { ui.renaming = ui.deleting = ui.grouping = ui.renamingGroup = null; sheetCats(); }
    else if (a === 'menu-refresh') { closeSheet(); reload(); }
    else if (a === 'menu-switch') { closeSheet(); LS.del('gastos.sheet'); showScreen(screenSetup()); }
    else if (a === 'menu-logout') { closeSheet(); Auth.logout(); location.reload(); }
    else if (a === 'cat-rename') { ui.renaming = el.dataset.cat; ui.deleting = null; sheetCats(); const i = $('#rn'); if (i) { i.focus(); i.select(); } }
    else if (a === 'cat-delete') { ui.deleting = el.dataset.cat; ui.renaming = null; sheetCats(); }
    else if (a === 'cat-cancel') { ui.renaming = ui.deleting = ui.grouping = ui.renamingGroup = null; sheetCats(); }
    else if (a === 'grp-rename') { ui.renamingGroup = el.dataset.grp; ui.renaming = ui.deleting = ui.grouping = null; sheetCats(); const i = $('#rg'); if (i) { i.focus(); i.select(); } }
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
    else if (t.matches('select[data-grp]')) {
      const id = t.dataset.grp, c = catById.get(id), v = t.value;
      if (!c) return;
      if (v === '__new') { ui.grouping = id; ui.renaming = ui.deleting = ui.renamingGroup = null; sheetCats(); const i = $('#ng'); if (i) i.focus(); }
      else setCategoryGroup(id, v === '__own' ? c.nome : v).then(() => sheetCats());
    }
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
    else if (kind === 'newgroup') { const id = f.dataset.cat; const v = $('#ng').value; if (!cleanName(v)) { toast('Dê um nome ao grupo.'); return; } ui.grouping = null; await setCategoryGroup(id, v); sheetCats(); }
    else if (kind === 'rengroup') { const g = f.dataset.grp; const v = $('#rg').value; ui.renamingGroup = null; await renameGroup(g, v); sheetCats(); }
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
  // Aceita o link inteiro da planilha ou só o ID (o trecho entre /d/ e /edit).
  function sheetIdFrom(v) {
    const t = String(v || '').trim();
    const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(t) || /^([a-zA-Z0-9_-]{20,})$/.exec(t);
    return m ? m[1] : '';
  }
  function useDb(link) {
    const id = sheetIdFrom(link);
    if (!id) { const er = $('#setupErr'); er.textContent = 'Cole o link completo da planilha (docs.google.com/spreadsheets/d/...).'; er.hidden = false; return; }
    LS.set('gastos.sheet', id);
    afterLogin();
  }
  async function afterLogin() {
    const id = sheetIdFrom(CFG.SPREADSHEET_ID) || LS.get('gastos.sheet');
    if (!id) { showScreen(screenSetup()); return; }
    store = new SheetsStore({ spreadsheetId: id, getToken: () => Auth.getToken() });
    await startApp();
  }
  async function startApp() {
    hideScreen();
    $('#btnMenu').innerHTML = I.more;
    await reload();
  }
  function checkVersion() {
    let v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue('--app-v').replace(/["'\s]/g, ''); } catch { v = ''; }
    if (v !== APP_V || (window.GastosStore || {}).VERSION !== APP_V) setTimeout(() => toast('Atualização incompleta: os arquivos do app no GitHub são de versões diferentes (app.js, store.js e styles.css precisam ser da mesma entrega). Suba os arquivos novos juntos. Se acabou de subir, espere alguns minutos e abra o app de novo.', [], 30000), 1500);
  }
  async function boot() {
    if (DEMO) { $('#demoBar').hidden = false; store = new MemoryStore(DEMO.pkg); await startApp(); return; }
    if (!CFG.CLIENT_ID || CFG.CLIENT_ID.startsWith('COLE_AQUI')) { showScreen(screenConfig()); return; }
    checkVersion();
    Auth.restore();
    if (!Auth.valid()) { showScreen(screenLogin(false)); const ok = await Auth.waitReady(); showScreen(screenLogin(ok)); return; }
    await Auth.waitReady();
    await afterLogin();
  }
  if (!DEMO && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
})();
