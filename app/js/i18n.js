/* Idioma do app (Português, English, Español).
 * O texto em português continua no código e é a chave; js/i18n-dict.js traz { 'texto pt': ['en', 'es'] }.
 *  - PK.t('Recado enviado') / PK.t('Faltam {n} missões', { n: 3 }) para texto que não vai para a tela (voz, título).
 *  - O que vai para a tela é traduzido sozinho: um MutationObserver troca textos e atributos (placeholder,
 *    title, aria-label, data-label) que estão no dicionário — inclusive modelos com {variáveis}.
 *    Dados do PlanKnect (nomes, títulos) não estão no dicionário e ficam como vieram.
 *  - Datas e dias da semana usam Intl no idioma escolhido (PK.util.DAYS/MONTHS mudam junto).
 * Escolha: TV → Ajustes (salvo em localStorage "pk.lang"); Nest Hub → ?lang=en|pt|es.
 * Sem escolha: idioma do aparelho se for um dos três, senão Português. */
var PK = window.PK || {};
window.PK = PK;

PK.i18n = (function () {
  var LANGS = ['pt', 'en', 'es'];
  var NAMES = { pt: 'Português', en: 'English', es: 'Español' };
  var DICT = {}, LOWER = {}, TPL = [], listeners = [];
  var KEY = 'pk.lang';
  var nest = /nest-hub/.test(location.pathname);
  var SEP = /(\s[·—›|–]\s)/; // separa por " · ", " — ", " › ", " | " e traduz cada pedaço

  function norm(l) { l = String(l || '').toLowerCase().slice(0, 2); return LANGS.indexOf(l) >= 0 ? l : ''; }
  function fromUrl() { var m = /[?&]lang=([a-zA-Z-]+)/.exec(location.search); return m ? norm(m[1]) : ''; }
  function fromDevice() {
    var list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || navigator.userLanguage || '']);
    for (var i = 0; i < list.length; i++) { var l = norm(list[i]); if (l) return l; }
    return '';
  }
  function saved() { if (nest) return ''; try { return norm(localStorage.getItem(KEY)); } catch (e) { return ''; } }
  var lang = fromUrl() || saved() || fromDevice() || 'pt';
  var idx = { pt: -1, en: 0, es: 1 };

  // pt-BR, en-xx do aparelho (en-AU, en-GB…) ou es-xx; senão um padrão
  function locale(l) {
    l = l || lang;
    var dev = navigator.language || '';
    if (dev.slice(0, 2).toLowerCase() === l && dev.length > 2) return dev;
    return { pt: 'pt-BR', en: 'en-GB', es: 'es-ES' }[l];
  }

  /* ---------- dicionário ---------- */
  // {n} {m} {a} {b} = número · {t} {h} = hora/temperatura · {v} = versão · outros = qualquer texto
  var VAR = { n: '(-?\\d+(?:[.,]\\d+)?)', m: '(-?\\d+(?:[.,]\\d+)?)', a: '(-?\\d+(?:[.,]\\d+)?)', b: '(-?\\d+(?:[.,]\\d+)?)', t: '(-?\\d[\\d:.,]*)', h: '(\\d[\\d:.,]*)', v: '([\\w.\\-]+)' };
  function rx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function add(map) {
    for (var k in map) {
      if (!map.hasOwnProperty(k)) continue;
      DICT[k] = map[k];
      LOWER[k.toLowerCase()] = map[k];
      if (k.indexOf('{') >= 0) {
        var names = [], src = '^' + k.split(/(\{\w+\})/).map(function (p) {
          var m = /^\{(\w+)\}$/.exec(p); if (m) { names.push(m[1]); return VAR[m[1]] || '(.+?)'; } return rx(p);
        }).join('') + '$';
        TPL.push({ re: new RegExp(src), names: names, val: map[k], key: k, lit: k.replace(/\{\w+\}/g, '').length, sep: SEP.test(k) });
      }
    }
    TPL.sort(function (a, b) { return b.lit - a.lit; }); // o modelo mais específico (mais texto fixo) primeiro
    if (document.body && lang !== 'pt') walk(document.body); // o dicionário chega depois do HTML fixo
  }
  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, n) { return vars[n] === undefined || vars[n] === null ? m : String(vars[n]); });
  }
  function word(k, l) { var v = DICT[k]; return v && v[idx[l]] != null ? v[idx[l]] : null; }
  // PK.t: texto pt → idioma atual (com {vars})
  function t(key, vars, l) {
    l = l || lang;
    var s = l === 'pt' ? key : (word(key, l) || key);
    return fill(s, vars);
  }

  // Tradução de um texto já montado (o que aparece na tela)
  function exact(s, l) {
    var v = word(s, l); if (v != null) return v;
    if (s.length > 1 && s === s.toUpperCase() && s !== s.toLowerCase()) { // "HOJE" → "TODAY"
      var lw = LOWER[s.toLowerCase()]; if (lw && lw[idx[l]] != null) return lw[idx[l]].toUpperCase();
    }
    return null;
  }
  function tpl(s, l) {
    var hasSep = SEP.test(s);
    for (var i = 0; i < TPL.length; i++) {
      var T = TPL[i]; if (hasSep && !T.sep) continue; // "em aberto · ponderado …": separa antes de casar "em {x}"
      var m = T.re.exec(s); if (!m) continue;
      var out = T.val[idx[l]]; if (out == null) continue;
      var vars = {};
      T.names.forEach(function (n, j) { var v = m[j + 1]; vars[n] = /^[qil]$/.test(n) ? v : (tr(v, l, true) || v); }); // {q} {i} {l} = títulos/itens: ficam como vieram
      return fill(out, vars);
    }
    return null;
  }
  function tr(s, l, inner) {
    l = l || lang;
    if (l === 'pt' || !s) return s;
    var r = exact(s, l); if (r != null) return r;
    var tail = /(\s*[:：·]\s*)$/.exec(s); // "Organização ·", "Prazo:"
    if (tail) { var c = s.slice(0, -tail[1].length); r = exact(c, l) || tpl(c, l); if (r != null) return r + tail[1]; }
    r = tpl(s, l); if (r != null) return r;
    if (SEP.test(s)) {
      var parts = s.split(SEP), changed = false;
      parts = parts.map(function (p, i) { if (i % 2) return p; var q = p.trim(); if (!q) return p; var x = tr(q, l, true); if (x !== q && x != null) { changed = true; return p.replace(q, x); } return p; });
      if (changed) return parts.join('');
    }
    return inner ? null : s;
  }

  /* ---------- tradução da tela ---------- */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'data-label', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.getAttribute('translate') === 'no') return true;
    }
    return false;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (n.__pkOut !== v) n.__pkIn = v; // texto novo vindo do app
    var src = n.__pkIn;
    if (!src || !/[A-Za-zÀ-ÿ]/.test(src)) return;
    var q = src.trim(), out = src;
    if (lang !== 'pt' && q) { var x = tr(q, lang); if (x !== q) out = src.replace(q, x); }
    n.__pkOut = out;
    if (v !== out) n.nodeValue = out;
  }
  function doAttrs(el) {
    var o = el.__pkA || (el.__pkA = {});
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a); if (v == null || v === '') continue;
      var rec = o[a];
      if (!rec || rec.out !== v) rec = o[a] = { src: v };
      var out = lang === 'pt' ? rec.src : tr(rec.src.trim(), lang);
      rec.out = out;
      if (out !== v) el.setAttribute(a, out);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipEl(root.parentNode)) doText(root); return; }
    if (root.nodeType !== 1 || skipEl(root)) return;
    doAttrs(root);
    var els = root.getElementsByTagName('*');
    for (var i = 0; i < els.length; i++) doAttrs(els[i]);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false), n;
    while ((n = w.nextNode())) { if (n.parentNode && SKIP[n.parentNode.tagName]) continue; if (n.parentNode && n.parentNode.closest && n.parentNode.closest('[translate="no"]')) continue; doText(n); }
  }
  var obs = null;
  function observe() {
    if (obs || !window.MutationObserver || !document.body) return;
    obs = new MutationObserver(function (list) {
      if (lang === 'pt') return; // em português nada muda
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]); }
        else if (m.type === 'characterData') { if (m.target.__pkOut !== m.target.nodeValue && !skipEl(m.target.parentNode)) doText(m.target); }
        else if (m.type === 'attributes') { var el = m.target, r = el.__pkA && el.__pkA[m.attributeName]; if (!r || r.out !== el.getAttribute(m.attributeName)) doAttrs(el); }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /* ---------- datas ---------- */
  function setDates() {
    var U = PK.util; if (!U || !U.DAYS) return;
    if (!U._ptDays) { U._ptDays = U.DAYS.slice(); U._ptDaysS = U.DAYS_S.slice(); U._ptMonths = U.MONTHS.slice(); }
    var days = U._ptDays, short = U._ptDaysS, months = U._ptMonths;
    if (lang !== 'pt' && window.Intl) {
      try {
        var loc = locale(), fl = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }), fs = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }), fm = new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' });
        var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
        days = []; short = []; months = [];
        for (var d = 0; d < 7; d++) { var x = new Date(Date.UTC(2023, 0, 1 + d, 12)); days.push(cap(fl.format(x))); short.push(fs.format(x).replace('.', '').toUpperCase()); } // 1/1/2023 = domingo
        for (var m = 0; m < 12; m++) months.push(fm.format(new Date(Date.UTC(2023, m, 15, 12))));
      } catch (e) {}
    }
    [[U.DAYS, days], [U.DAYS_S, short], [U.MONTHS, months]].forEach(function (p) { p[0].length = 0; Array.prototype.push.apply(p[0], p[1]); });
  }
  // "Quinta, 29 de outubro" · "Thursday 29 October" · "Jueves, 29 de octubre"
  function longDate(d) {
    var U = PK.util;
    if (lang === 'pt' || !window.Intl) return U.DAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + U.MONTHS[d.getMonth()];
    if (lang === 'es') return U.DAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + U.MONTHS[d.getMonth()];
    return U.DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + U.MONTHS[d.getMonth()];
  }
  function shortDate(d) {
    var U = PK.util, m = U.MONTHS[d.getMonth()];
    return d.getDate() + ' ' + (lang === 'pt' ? m.slice(0, 3) : m.slice(0, 3).replace(/\.$/, ''));
  }

  /* ---------- listas de sugestões (recados, itens, missões): o texto escolhido vira dado no idioma atual ---------- */
  var bound = [];
  // bind(['Leite', …]) ou bind([['Arrumar a cama', 'bed', …]], [0]): troca o texto no lugar, guardando o original pt
  function bind(arr, fields) {
    var orig = arr.map(function (x) { return Array.isArray(x) ? x.slice() : x; });
    var b = { arr: arr, orig: orig, fields: fields };
    bound.push(b); relist(b); return arr;
  }
  function relist(b) {
    b.orig.forEach(function (o, i) {
      if (!b.fields) b.arr[i] = t(o);
      else b.fields.forEach(function (f) { b.arr[i][f] = t(o[f]); });
    });
  }

  /* ---------- troca de idioma ---------- */
  function apply() {
    document.documentElement.lang = locale();
    setDates();
    bound.forEach(relist);
    if (document.body) walk(document.body);
  }
  function set(l) {
    l = norm(l) || 'pt';
    if (!nest) { try { localStorage.setItem(KEY, l); } catch (e) {} }
    if (l === lang) return;
    lang = l;
    apply();
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
  }
  function start() { apply(); observe(); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  return {
    LANGS: LANGS, NAMES: NAMES, add: add, t: t, tr: tr, set: set, bind: bind, apply: apply, walk: walk,
    lang: function () { return lang; }, locale: locale, longDate: longDate, shortDate: shortDate, setDates: setDates,
    onChange: function (fn) { listeners.push(fn); },
    // voz: idioma BCP-47 da fala/escuta para o idioma do app
    speech: function (l) { return { pt: 'pt-BR', en: 'en-GB', es: 'es-ES' }[l || lang]; },
    // contexto de quem chama ao Knect: escolhe entre pt / en (frases britânicas prontas) / es (dicionário)
    pick: function (pt, en, l) { l = l || lang; return l === 'en' ? (en != null ? en : t(pt, null, 'en')) : l === 'es' ? t(pt, null, 'es') : pt; }
  };
})();
PK.t = PK.i18n.t;
