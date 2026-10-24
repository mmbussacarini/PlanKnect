/* Deal Room — negócios do PlanKnect na TV (aba "Deals", detalhe e lista no modo Computador).
 * Conectado: GET /deals → { deals:[…] } e GET /deals/:id (documentos, contatos, atividade).
 * Enquanto o PlanKnect não liberar as rotas, a aba explica isso; no demo mostra um funil de exemplo.
 * Deal: { id, title, company, value, currency, stage, stages[], probability, expected_close, owner,
 *         next_step:{ text, due }, last_activity_at, risk, project_id, project, documents[], contacts[], activity[] } */
var PK = window.PK || {};
window.PK = PK;

PK.deals = (function () {
  var U = PK.util, I = PK.icons, esc = U.esc;
  var STAGES = ['Prospecção', 'Proposta', 'Negociação', 'Due diligence', 'Fechamento'];
  var cache = null, unavailable = false, loading = null;

  function d(days, h) { var x = U.addDays(U.startOfDay(new Date()), days); x.setHours(h || 10, 0, 0, 0); return x.toISOString(); }
  var DEMO = [
    { id: 'dl1', title: 'Exportação de soja — lote dezembro', company: 'Kestrel Commodities', value: 2400000, currency: 'USD', stage: 'Negociação', probability: .6, expected_close: d(18), owner: 'Marcelo',
      next_step: { text: 'Assinar NCNDA e enviar LOI', due: d(1, 15) }, last_activity_at: d(-1), risk: 'NCNDA pendente', project: 'InnovaTradeCapital - Trade/Commodities',
      documents: [{ name: 'NCNDA v3.pdf', kind: 'pdf' }, { name: 'LOI - rascunho.docx', kind: 'doc' }, { name: 'Cotações comparadas.xlsx', kind: 'sheet' }],
      contacts: [{ name: 'Ana Ribeiro', role: 'Trader', company: 'Kestrel' }, { name: 'Kenji Watanabe', role: 'Jurídico', company: 'InnovaTrade' }],
      activity: [{ at: d(-1, 16), text: 'Reunião de cotações — Kestrel 12% abaixo', by: 'Marcelo' }, { at: d(-3, 11), text: 'Proposta revisada enviada', by: 'Ana' }] },
    { id: 'dl2', title: 'Plataforma de eventos — Conferência 2027', company: 'Greater Sydney Conference', value: 180000, currency: 'AUD', stage: 'Proposta', probability: .35, expected_close: d(32), owner: 'Marcelo',
      next_step: { text: 'Apresentar demo do SiteKnect', due: d(3, 11) }, last_activity_at: d(-4), project: 'SiteKnect',
      documents: [{ name: 'Proposta comercial.pdf', kind: 'pdf' }], contacts: [{ name: 'Paulo Lima', role: 'Diretor', company: 'GSC' }], activity: [{ at: d(-4, 10), text: 'Proposta enviada', by: 'Marcelo' }] },
    { id: 'dl3', title: 'Licenças DataVIP — renovação anual', company: 'DataVIP', value: 96000, currency: 'AUD', stage: 'Fechamento', probability: .9, expected_close: d(5), owner: 'Marcelo',
      next_step: { text: 'Contrato para assinatura', due: d(0, 17) }, last_activity_at: d(0), project: 'Data VIP',
      documents: [{ name: 'Contrato 2027.pdf', kind: 'pdf' }], contacts: [{ name: 'Rafael Costa', role: 'CFO', company: 'DataVIP' }], activity: [{ at: d(0, 9), text: 'Aprovado pelo financeiro', by: 'Rafael' }] },
    { id: 'dl4', title: 'Consultoria PulseIQ — fase 2', company: 'PulseIQ', value: 64000, currency: 'AUD', stage: 'Prospecção', probability: .15, expected_close: d(60), owner: 'Marcelo',
      next_step: { text: 'Call de descoberta', due: d(6, 14) }, last_activity_at: d(-9), risk: 'Sem contato há 9 dias', project: '', documents: [], contacts: [], activity: [] },
    { id: 'dl5', title: 'Internacionalização Portugal', company: 'Saint Luiger', value: 350000, currency: 'EUR', stage: 'Due diligence', probability: .5, expected_close: d(40), owner: 'Marcelo',
      next_step: { text: 'Reunião de internacionalização', due: d(2, 8) }, last_activity_at: d(-2), project: 'Aventus',
      documents: [{ name: 'Data room índice.pdf', kind: 'pdf' }, { name: 'Projeções 5 anos.xlsx', kind: 'sheet' }], contacts: [{ name: 'Luís Martins', role: 'Sócio', company: 'Saint Luiger' }], activity: [{ at: d(-2, 18), text: 'Data room aberto para auditoria', by: 'Marcelo' }] }
  ];

  function norm(x) {
    x.value = +x.value || 0; x.probability = x.probability > 1 ? x.probability / 100 : (+x.probability || 0);
    x.stages = x.stages && x.stages.length ? x.stages : STAGES;
    x.next = x.next_step || x.nextStep || null; if (x.next && x.next.due) x.next.due = U.toDate(x.next.due);
    x.close = U.toDate(x.expected_close || x.expectedClose); x.last = U.toDate(x.last_activity_at || x.lastActivityAt);
    return x;
  }
  function load(force) {
    if (cache && !force) return Promise.resolve(cache);
    if (PK.data.mode() !== 'live') { cache = DEMO.map(function (x) { return norm(JSON.parse(JSON.stringify(x))); }); return Promise.resolve(cache); }
    if (loading) return loading;
    loading = PK.api.deals().then(function (r) { loading = null; unavailable = false; cache = (r.deals || r.items || []).map(norm); return cache; })
      .catch(function (e) { loading = null; unavailable = /404|405|not_found|method/.test(e.message); cache = []; return cache; });
    return loading;
  }
  function money(v, cur) {
    var s = v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',') + ' mi' : v >= 1e3 ? Math.round(v / 1e3) + ' mil' : String(Math.round(v));
    return ({ USD: 'US$ ', AUD: 'A$ ', EUR: '€ ', BRL: 'R$ ', GBP: '£ ' }[cur] || (cur ? cur + ' ' : '')) + s;
  }
  function totals(list) {
    var by = {}; list.forEach(function (x) { var c = x.currency || '—'; by[c] = by[c] || { v: 0, w: 0 }; by[c].v += x.value; by[c].w += x.value * x.probability; });
    return by;
  }
  function soonest(list) { return list.filter(function (x) { return x.next && x.next.due; }).sort(function (a, b) { return a.next.due - b.next.due; }); }

  /* ---------- aba Deals: funil por estágio ---------- */
  function view(state) {
    var list = cache || [];
    if (!cache) { load().then(function () { if (PK.app.refreshView) PK.app.refreshView('deals'); }); return '<div class="dl-empty"><span class="spin"></span> Abrindo o Deal Room…</div>'; }
    if (!list.length) return '<div class="dl-empty">' + I.get('briefcase', 64) + '<b>Deal Room</b><span>' + (unavailable ? 'O PlanKnect ainda não envia os deals para a TV. Assim que a rota /deals existir, o funil aparece aqui.' : 'Nenhum deal aberto.') + '</span></div>';
    var now = new Date(), stages = list[0].stages, tot = totals(list), next = soonest(list);
    var head = '<div class="dl-head"><h2>' + I.get('briefcase', 30) + ' DEAL ROOM</h2><div class="dl-kpis">' +
      Object.keys(tot).map(function (c) { return '<div><b>' + money(tot[c].v, c) + '</b><span>em aberto · ponderado ' + money(tot[c].w, c) + '</span></div>'; }).join('') +
      '<div><b>' + list.length + '</b><span>deals</span></div>' + (next[0] ? '<div class="nx"><b>' + esc(next[0].next.text) + '</b><span>' + esc(next[0].company) + ' · ' + U.dueLabel(next[0].next.due, now) + '</span></div>' : '') + '</div></div>';
    var cols = stages.map(function (stg, si) {
      var items = list.filter(function (x) { return x.stage === stg; });
      var sum = totals(items);
      return '<div class="dl-col"><div class="dl-col-h"><b>' + esc(stg) + '</b><span>' + items.length + (items.length ? ' · ' + Object.keys(sum).map(function (c) { return money(sum[c].v, c); }).join(' + ') : '') + '</span><i style="width:' + Math.round((si + 1) / stages.length * 100) + '%"></i></div>' +
        items.map(function (x, i) { return card(x, now, si === 0 && i === 0); }).join('') + (items.length ? '' : '<div class="dl-none">—</div>') + '</div>';
    }).join('');
    return '<div class="dl">' + head + '<div class="dl-cols">' + cols + '</div></div>';
  }
  function card(x, now, af) {
    var late = x.next && x.next.due && x.next.due < U.startOfDay(now), stale = x.last && now - x.last > 7 * 864e5;
    return '<div class="dl-card focusable' + (x.risk || stale ? ' risk' : '') + '" data-open="deal:' + esc(x.id) + '"' + (af ? ' data-autofocus' : '') + '>' +
      '<div class="dl-co">' + esc(x.company) + '</div><div class="dl-t">' + esc(x.title) + '</div>' +
      '<div class="dl-v"><b>' + money(x.value, x.currency) + '</b><span>' + Math.round(x.probability * 100) + '%</span></div><div class="dl-p"><i style="width:' + Math.round(x.probability * 100) + '%"></i></div>' +
      (x.next ? '<div class="dl-n' + (late ? ' late' : '') + '">' + I.get('flag', 16) + '<span>' + esc(x.next.text) + '</span>' + (x.next.due ? '<em>' + U.dueLabel(x.next.due, now) + '</em>' : '') + '</div>' : '') +
      (x.risk || stale ? '<div class="dl-r">' + I.get('bell', 15) + esc(x.risk || 'Sem atividade há ' + Math.round((now - x.last) / 864e5) + ' dias') + '</div>' : '') + '</div>';
  }

  /* ---------- detalhe ---------- */
  function detail(x, full) {
    var D = full || x, now = new Date(), si = x.stages.indexOf(x.stage);
    var rel = PK.app.state().tasks.filter(function (t) { return x.project && t.project === x.project && t.status !== 'done'; }).slice(0, 4);
    var KIND = { pdf: 'note', doc: 'note', sheet: 'chart', image: 'camera' };
    var main = '<div class="dt-chips"><span class="dt-type" style="--c:#fbbf24">' + I.get('briefcase', 24) + ' ' + esc(x.company) + '</span><span class="pill">' + esc(x.stage) + '</span>' + (x.risk ? '<span class="pill late">' + esc(x.risk) + '</span>' : '') + '</div>' +
      '<h1 class="dt-title">' + esc(x.title) + '</h1>' +
      '<div class="dl-steps">' + x.stages.map(function (s, i) { return '<div class="' + (i < si ? 'done' : i === si ? 'on' : '') + '"><i>' + (i < si ? I.get('check', 16, ' stroke-width="3"') : i + 1) + '</i><span>' + esc(s) + '</span></div>'; }).join('') + '</div>' +
      (x.next ? '<div class="dl-next">' + I.get('flag', 26) + '<div><b>Próximo passo</b><span>' + esc(x.next.text) + (x.next.due ? ' · ' + U.dueLabel(x.next.due, now) + ' ' + U.hm(x.next.due) : '') + '</span></div></div>' : '') +
      ((D.documents || []).length ? '<div class=\"dt-sec\">Documentos do Deal Room<span>' + D.documents.length + '</span></div><div class="dt-files">' + D.documents.map(function (f) { return '<span class="dt-file focusable">' + I.get(KIND[f.kind] || 'note', 24) + esc(f.name) + '</span>'; }).join('') + '</div>' : '') +
      ((D.activity || []).length ? '<div class=\"dt-sec\">Atividade</div>' + D.activity.slice(0, 4).map(function (a) { var at = U.toDate(a.at); return '<div class="dl-act"><b>' + (at ? U.dueLabel(at, now).replace('atrasada ', 'há ') : '') + '</b>' + esc(a.text) + (a.by ? '<em>' + esc(a.by) + '</em>' : '') + '</div>'; }).join('') : '') +
      (rel.length ? '<div class=\"dt-sec\">Tarefas ligadas<span>' + rel.length + '</span></div>' + rel.map(function (t) { return '<div class="dt-link focusable" data-open="task:' + esc(t.id) + '"><div class="dt-link-main"><b>' + esc(t.title) + '</b><span>' + (t.due ? U.dueLabel(t.due, now) : 'sem prazo') + '</span></div><span class="dt-go">›</span></div>'; }).join('') : '');
    var side = '<div class="dl-big"><span>Valor</span><b>' + money(x.value, x.currency) + '</b><em>ponderado ' + money(x.value * x.probability, x.currency) + '</em></div>' +
      '<div class="dl-prob"><span>Probabilidade</span><b>' + Math.round(x.probability * 100) + '%</b><div class="dl-p"><i style="width:' + Math.round(x.probability * 100) + '%"></i></div></div>' +
      (x.close ? '<div class=\"dt-sec\">Fechamento previsto</div><div class="dt-big">' + U.longDate(x.close) + '<small> · ' + U.dueLabel(x.close, now).replace('atrasada ', 'atrasado ') + '</small></div>' : '') +
      ((D.contacts || []).length ? '<div class=\"dt-sec\">Contatos</div><div class="dt-people">' + D.contacts.map(function (c) { return '<div class="dt-person"><span class="av" style="background:#6366f1;width:44px;height:44px;font-size:18px">' + esc(String(c.name).charAt(0)) + '</span><div class="dt-person-main"><b>' + esc(c.name) + '</b><span>' + esc([c.role, c.company].filter(Boolean).join(' · ')) + '</span></div></div>'; }).join('') + '</div>' : '') +
      (x.project ? '<div class=\"dt-sec\">Projeto</div><div class="dt-big" style="font-size:22px">' + esc(x.project) + '</div>' : '') +
      (D.url ? '<div class="dt-join"><div class="qr-box small"><div id="dt-qr"></div></div><div><b>Abrir o Deal Room</b><span>Aponte o celular</span></div></div>' : '');
    return { body: '<div class="dt"><div class="dt-main">' + main + '</div><div class="dt-side">' + side + '</div></div>', actions: [{ label: 'Fechar', act: 'close', ghost: true }],
      after: function () { if (D.url) PK.app.qr('dt-qr', D.url, 170); } };
  }
  function open(id) {
    var x = (cache || []).filter(function (y) { return y.id === id; })[0]; if (!x) return;
    var ov = PK.app.openModal(detail(x), 'detail wide');
    if (PK.data.mode() === 'live') PK.api.deal(id).then(function (full) { PK.app.fillModal(ov, detail(x, norm(full))); }).catch(function () {});
  }

  /* ---------- lista curta (modo Computador) ---------- */
  function compact(max) {
    var list = cache || [], now = new Date();
    if (!cache) { load(); return '<div class="wm-t done"><i></i><span>Carregando deals…</span></div>'; }
    if (!list.length) return '<div class="wm-t done"><i></i><span>' + (unavailable ? 'Deals ainda não liberados para a TV' : 'Nenhum deal aberto') + '</span></div>';
    return soonest(list).concat(list.filter(function (x) { return !x.next || !x.next.due; })).slice(0, max || 5).map(function (x) {
      var late = x.next && x.next.due && x.next.due < U.startOfDay(now);
      return '<div class="wm-t wm-deal focusable" data-wm-deal="' + esc(x.id) + '"><i style="background:#fbbf24"></i><span><b>' + esc(x.company) + '</b> · ' + esc(x.next ? x.next.text : x.title) + '</span><em class="' + (late ? 'r' : '') + '">' + money(x.value, x.currency) + '</em></div>';
    }).join('');
  }
  function get(id) { return (cache || []).filter(function (y) { return y.id === id; })[0]; }

  return { load: load, view: view, open: open, compact: compact, get: get, money: money, reset: function () { cache = null; } };
})();
