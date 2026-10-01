/* Camada de dados do app: planilha do Google Sheets (produção) ou memória (prévia).
   Os dois objetos expõem os mesmos métodos, então a interface não sabe qual está usando. */
(function (global) {
  'use strict';

  const API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const SCHEMA = {
    lancamentos: ['id', 'fatura', 'data', 'titular', 'cartao', 'descricao', 'estabelecimento', 'chave', 'cidade', 'valor', 'tipo', 'parcela', 'categoria', 'conferir', 'detalhes'],
    categorias: ['id', 'nome', 'ativa', 'grupo'],
    faturas: ['id', 'rotulo', 'vencimento', 'fechamento', 'total', 'parcelas_a_vencer', 'pagamento_anterior_em', 'pagamento_anterior_valor'],
    cartoes: ['cartao', 'titular', 'nome'],
    regras: ['chave', 'categoria', 'origem'],
    analises: ['data', 'fatura', 'titulo', 'texto'],
  };
  const TABS = Object.keys(SCHEMA);
  const KEY = { lancamentos: 'id', categorias: 'id', faturas: 'id', cartoes: 'cartao', regras: 'chave', analises: null };
  const NUMERIC = new Set(['valor', 'total', 'parcelas_a_vencer', 'pagamento_anterior_valor']);
  const FORMAT = 'gastos-cartao/1';

  const col = (n) => { let s = ''; n += 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const LAST = Object.fromEntries(TABS.map((t) => [t, col(SCHEMA[t].length - 1)]));
  const COLOF = (tab, field) => col(SCHEMA[tab].indexOf(field));

  class ApiError extends Error {
    constructor(status, message, detail) { super(message); this.name = 'ApiError'; this.status = status; this.detail = detail; }
  }
  class AuthError extends Error { constructor() { super('Sessão expirada'); this.name = 'AuthError'; } }

  const parseBool = (v) => v === true || v === 1 || String(v).toUpperCase() === 'TRUE';
  function serialToIso(n) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function normalize(tab, o) {
    for (const k of SCHEMA[tab]) {
      let v = o[k];
      if (v === undefined || v === null) v = '';
      if (NUMERIC.has(k)) v = v === '' ? '' : Number(String(v).replace(',', '.'));
      else if (k === 'conferir') v = parseBool(v);
      else if (k === 'ativa') v = v === '' ? true : parseBool(v);
      else if ((k === 'data' || k === 'vencimento' || k === 'fechamento' || k === 'pagamento_anterior_em') && typeof v === 'number') v = serialToIso(v);
      else v = String(v);
      o[k] = v;
    }
    return o;
  }
  const toRow = (tab, o) => SCHEMA[tab].map((k) => (o[k] === undefined || o[k] === null ? '' : o[k]));
  function fromRows(tab, rows) {
    const out = [];
    rows.slice(1).forEach((arr, j) => {
      if (!arr || !arr.length || arr.every((v) => v === '' || v === null)) return;
      const o = {};
      SCHEMA[tab].forEach((k, i) => { o[k] = arr[i]; });
      normalize(tab, o);
      o._row = j + 2;
      if (KEY[tab] && !o[KEY[tab]]) return;
      out.push(o);
    });
    return out;
  }
  const rowOf = (a1) => { const m = /![A-Z]+(\d+)/.exec(a1 || ''); return m ? Number(m[1]) : null; };
  const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* Plano de importação: acrescenta só o que ainda não existe. As regras já salvas na planilha
     (decisões de vocês) têm prioridade sobre a categoria sugerida no arquivo. */
  function planImport(pkg, cur) {
    if (!pkg || pkg.formato !== FORMAT) throw new Error('Este arquivo não é um pacote de importação do app.');
    const ids = (arr, k) => new Set(arr.map((o) => String(o[k])));
    const catIds = ids(cur.categorias, 'id');
    const activeCats = new Set(cur.categorias.filter((c) => c.ativa !== false).map((c) => c.id));
    const add = { categorias: [], cartoes: [], faturas: [], lancamentos: [], regras: [], analises: [] };
    for (const c of pkg.categorias || []) {
      if (catIds.has(c.id)) continue;
      add.categorias.push(normalize('categorias', { id: c.id, nome: c.nome, ativa: c.ativa !== false, grupo: c.grupo || '' }));
      catIds.add(c.id); if (c.ativa !== false) activeCats.add(c.id);
    }
    if (!catIds.has('sem')) { add.categorias.unshift(normalize('categorias', { id: 'sem', nome: 'Sem categoria', ativa: true })); activeCats.add('sem'); }
    const cardIds = ids(cur.cartoes, 'cartao');
    for (const c of pkg.cartoes || []) if (!cardIds.has(String(c.cartao))) { add.cartoes.push(normalize('cartoes', { ...c })); cardIds.add(String(c.cartao)); }
    const fatIds = ids(cur.faturas, 'id');
    for (const f of pkg.faturas || []) if (!fatIds.has(String(f.id))) { add.faturas.push(normalize('faturas', { ...f })); fatIds.add(String(f.id)); }
    const userRules = new Map(cur.regras.map((r) => [r.chave, r.categoria]));
    const ruleKeys = new Set(userRules.keys());
    for (const r of pkg.regras || []) if (!ruleKeys.has(r.chave)) { add.regras.push(normalize('regras', { ...r })); ruleKeys.add(r.chave); }
    const txIds = ids(cur.lancamentos, 'id');
    let byRule = 0;
    for (const t of pkg.lancamentos || []) {
      if (txIds.has(String(t.id))) continue;
      const o = normalize('lancamentos', { ...t });
      const rc = userRules.get(o.chave);
      if (rc && activeCats.has(rc) && rc !== o.categoria) { o.categoria = rc; o.conferir = false; byRule++; }
      if (!activeCats.has(o.categoria)) { o.categoria = 'sem'; o.conferir = false; }
      add.lancamentos.push(o); txIds.add(o.id);
    }
    const anKeys = new Set(cur.analises.map((a) => a.fatura + '|' + a.titulo));
    for (const a of pkg.analises || []) {
      const k = a.fatura + '|' + a.titulo;
      if (!anKeys.has(k)) { add.analises.push(normalize('analises', { ...a })); anKeys.add(k); }
    }
    const skipped = (pkg.lancamentos || []).length - add.lancamentos.length;
    return { add, summary: { faturas: add.faturas.length, lancamentos: add.lancamentos.length, repetidos: skipped, categorias: add.categorias.length, regras: add.regras.length, analises: add.analises.length, porRegra: byRule } };
  }

  /* ---------------- Google Sheets ---------------- */
  class SheetsStore {
    constructor({ spreadsheetId, getToken, fetchImpl }) {
      this.id = spreadsheetId;
      this.getToken = getToken;
      this.fetch = fetchImpl || global.fetch.bind(global);
      this.kind = 'sheets';
    }
    get url() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }

    async req(method, path, body, query) {
      const token = await this.getToken();
      const qs = query ? '?' + new URLSearchParams(query).toString() : '';
      const url = (path.startsWith('https://') ? path : `${API}/${this.id}${path}`) + qs;
      let last = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        let r;
        try {
          r = await this.fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        } catch (e) { last = new ApiError(0, 'Sem conexão com o Google. Confira a internet.'); await sleep(700 * (attempt + 1)); continue; }
        if (r.status === 401) throw new AuthError();
        if (r.status === 429 || r.status >= 500) { last = new ApiError(r.status, 'O Google pediu para esperar um pouco.'); await sleep(900 * (attempt + 1) + Math.random() * 400); continue; }
        let data = null;
        try { data = await r.json(); } catch { data = null; }
        if (!r.ok) {
          const msg = r.status === 403 ? 'Esta conta não tem acesso à planilha. Peça para compartilhar com ela como Editor.'
            : r.status === 404 ? 'Planilha não encontrada. Confira o link.'
              : (data && data.error && data.error.message) || ('Erro ' + r.status);
          throw new ApiError(r.status, msg, data);
        }
        return data;
      }
      throw last || new ApiError(503, 'Serviço do Google indisponível.');
    }

    static async create(title, getToken, fetchImpl) {
      const probe = new SheetsStore({ spreadsheetId: '', getToken, fetchImpl });
      const body = {
        properties: { title, locale: 'pt_BR', timeZone: 'America/Sao_Paulo' },
        sheets: TABS.map((t, i) => ({ properties: { sheetId: i + 1, title: t, index: i, gridProperties: { frozenRowCount: 1 } } })),
      };
      const created = await probe.req('POST', API, body);
      const store = new SheetsStore({ spreadsheetId: created.spreadsheetId, getToken, fetchImpl });
      await store.writeHeaders(TABS);
      return store;
    }

    async writeHeaders(tabs) {
      await this.req('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data: tabs.map((t) => ({ range: `${t}!A1:${LAST[t]}1`, values: [SCHEMA[t]] })) });
    }

    /* cria abas que faltarem (planilha antiga ou editada à mão) */
    async ensureSchema() {
      const meta = await this.req('GET', '', null, [['fields', 'sheets.properties']]);
      const have = new Map((meta.sheets || []).map((s) => [s.properties.title, s.properties.sheetId]));
      const missing = TABS.filter((t) => !have.has(t));
      if (missing.length) {
        await this.req('POST', ':batchUpdate', { requests: missing.map((t) => ({ addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } } })) });
        await this.writeHeaders(missing);
      }
      return missing;
    }

    async load() {
      await this.ensureSchema();
      const q = TABS.map((t) => ['ranges', `${t}!A:${LAST[t]}`]).concat([['valueRenderOption', 'UNFORMATTED_VALUE']]);
      const data = await this.req('GET', '/values:batchGet', null, q);
      const stale = [];
      (data.valueRanges || []).forEach((vr, i) => { const h = (vr.values && vr.values[0]) || []; if (SCHEMA[TABS[i]].some((k, j) => String(h[j] ?? '') !== k)) stale.push(TABS[i]); });
      if (stale.length) { try { await this.writeHeaders(stale); } catch (e) { /* sem permissão de escrita: segue só lendo */ } }
      const out = {};
      (data.valueRanges || []).forEach((vr, i) => { out[TABS[i]] = fromRows(TABS[i], vr.values || []); });
      for (const t of TABS) out[t] = out[t] || [];
      return out;
    }

    async updateCells(updates) {
      if (!updates.length) return;
      for (let i = 0; i < updates.length; i += 400) {
        await this.req('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data: updates.slice(i, i + 400) });
      }
    }

    async append(tab, objs) {
      if (!objs.length) return;
      for (let i = 0; i < objs.length; i += 500) {
        const part = objs.slice(i, i + 500);
        const res = await this.req('POST', `/values/${encodeURIComponent(`${tab}!A:${LAST[tab]}`)}:append`,
          { values: part.map((o) => toRow(tab, o)) },
          [['valueInputOption', 'RAW'], ['insertDataOption', 'INSERT_ROWS']]);
        const start = rowOf(res && res.updates && res.updates.updatedRange);
        part.forEach((o, j) => { o._row = start ? start + j : null; });
      }
    }

    /* linha atual de cada chave, lida na hora (se alguém apagou linhas na planilha, os números mudam) */
    async rowsByKey(tab) {
      const res = await this.req('GET', `/values/${encodeURIComponent(`${tab}!A:A`)}`, null, [['valueRenderOption', 'UNFORMATTED_VALUE']]);
      const map = new Map();
      (res.values || []).forEach((r, i) => { if (i > 0 && r && r[0] !== undefined && r[0] !== '') map.set(String(r[0]), i + 1); });
      return map;
    }
    async locate(tab, items, key) {
      const map = await this.rowsByKey(tab);
      const found = [];
      for (const o of items) { const row = map.get(String(o[key])); if (row) { o._row = row; found.push(o); } }
      if (found.length < items.length) throw new ApiError(409, 'A planilha mudou (linhas apagadas ou movidas). Atualize os dados e tente de novo.');
      return found;
    }
    async setCategory(items, catId) {
      const c1 = COLOF('lancamentos', 'categoria'), c2 = COLOF('lancamentos', 'conferir');
      const rows = await this.locate('lancamentos', items, 'id');
      await this.updateCells(rows.map((t) => ({ range: `lancamentos!${c1}${t._row}:${c2}${t._row}`, values: [[catId, false]] })));
    }
    async confirm(items) {
      const c = COLOF('lancamentos', 'conferir');
      const rows = await this.locate('lancamentos', items, 'id');
      await this.updateCells(rows.map((t) => ({ range: `lancamentos!${c}${t._row}`, values: [[false]] })));
    }
    async addCategory(nome) {
      const cat = normalize('categorias', { id: newId('u'), nome, ativa: true });
      await this.append('categorias', [cat]);
      return cat;
    }
    async saveCategory(cat) {
      await this.locate('categorias', [cat], 'id');
      await this.updateCells([{ range: `categorias!A${cat._row}:${LAST.categorias}${cat._row}`, values: [toRow('categorias', cat)] }]);
    }
    async saveRule(rule, existing) {
      if (existing && existing._row) {
        existing.categoria = rule.categoria; existing.origem = rule.origem;
        await this.locate('regras', [existing], 'chave');
        await this.updateCells([{ range: `regras!A${existing._row}:${LAST.regras}${existing._row}`, values: [toRow('regras', existing)] }]);
        return existing;
      }
      const r = normalize('regras', { ...rule });
      await this.append('regras', [r]);
      return r;
    }
    async importPackage(pkg, cur) {
      const plan = planImport(pkg, cur);
      for (const t of ['categorias', 'cartoes', 'faturas', 'regras', 'lancamentos', 'analises']) await this.append(t, plan.add[t]);
      return plan.summary;
    }
  }

  /* ---------------- Prévia em memória ---------------- */
  class MemoryStore {
    constructor(pkg) {
      this.kind = 'memory';
      this.db = { lancamentos: [], categorias: [], faturas: [], cartoes: [], regras: [], analises: [] };
      if (pkg) { const plan = planImport(pkg, this.db); for (const t of TABS) this.pushRows(t, plan.add[t]); }
    }
    get url() { return ''; }
    pushRows(tab, objs) { for (const o of objs) { o._row = this.db[tab].length + 2; this.db[tab].push({ ...o }); } }
    async load() { return JSON.parse(JSON.stringify(this.db)); }
    find(tab, row) { return this.db[tab].find((o) => o._row === row); }
    async setCategory(items, catId) { for (const t of items) { const o = this.find('lancamentos', t._row); if (o) { o.categoria = catId; o.conferir = false; } } }
    async confirm(items) { for (const t of items) { const o = this.find('lancamentos', t._row); if (o) o.conferir = false; } }
    async addCategory(nome) { const cat = normalize('categorias', { id: newId('u'), nome, ativa: true }); this.pushRows('categorias', [cat]); return cat; }
    async saveCategory(cat) { const o = this.find('categorias', cat._row); if (o) Object.assign(o, { nome: cat.nome, ativa: cat.ativa, grupo: cat.grupo || '' }); }
    async saveRule(rule, existing) {
      if (existing && existing._row) { const o = this.find('regras', existing._row); if (o) Object.assign(o, { categoria: rule.categoria, origem: rule.origem }); existing.categoria = rule.categoria; return existing; }
      const r = normalize('regras', { ...rule }); this.pushRows('regras', [r]); return r;
    }
    async importPackage(pkg, cur) { const plan = planImport(pkg, cur); for (const t of TABS) this.pushRows(t, plan.add[t]); return plan.summary; }
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  global.GastosStore = { SheetsStore, MemoryStore, planImport, ApiError, AuthError, SCHEMA, FORMAT, VERSION: '7' };
})(typeof window !== 'undefined' ? window : globalThis);
