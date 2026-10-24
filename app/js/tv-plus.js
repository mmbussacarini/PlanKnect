/* Recursos que nasceram no nest-hub, trazidos para a TV (controle remoto, 1920×1080):
 * Recados com "visto por", Timers + contagens, placar e nova missão, adicionar rápido na lista,
 * receita passo a passo com timers, concluir/adiar tarefas, contas do mês. */
var PK = window.PK || {};
window.PK = PK;

PK.plus = (function () {
  var U = PK.util, I = PK.icons, C = PK.config, esc = U.esc;
  var timers = U.store.get('tvTimers', []), recipe = null;
  var PRESETS = [['Ovo cozido', 9, 'tooth'], ['Chá', 4, 'plate'], ['Massa', 10, 'chef'], ['Arroz', 18, 'chef'], ['Pizza', 12, 'chef'], ['Bolo', 40, 'cake'],
    ['Pipoca', 3, 'sparkle'], ['Banho das crianças', 20, 'users'], ['Tela / TV', 30, 'tv'], ['Dever de casa', 45, 'book']];
  var NOTES = ['Jantar pronto!', 'Já volto', 'Chego em 10 min', 'Hora de dormir', 'Desçam para o café', 'Acabou o leite!', 'Alguém viu minha chave?', 'Reunião até as 18h'];
  var STAPLES = ['Leite', 'Pão', 'Ovos', 'Banana', 'Café', 'Arroz', 'Feijão', 'Tomate', 'Queijo', 'Manteiga', 'Papel higiênico', 'Detergente'];
  var MISSIONS = [['Arrumar a cama', 'bed', 'manhã', 5], ['Escovar os dentes', 'tooth', 'manhã', 2], ['Dever de casa', 'book', 'tarde', 10], ['Guardar os brinquedos', 'toy', 'tarde', 5],
    ['Colocar a mesa', 'plate', 'noite', 5], ['Separar a roupa', 'shirt', 'noite', 3], ['Ler 20 minutos', 'book', 'noite', 5], ['Dar comida ao pet', 'paw', 'manhã', 5],
    ['Levar o lixo', 'trash', 'tarde', 5], ['Arrumar o quarto', 'home', 'tarde', 10], ['Lavar a louça', 'plate', 'noite', 10], ['Praticar instrumento', 'star', 'tarde', 10]];
  var COLORS = { meeting: '#a78bfa', task: '#60a5fa', milestone: '#fb923c', event: '#34d399', family: '#ff7a9a', church: '#fbbf24', birthday: '#e879f9' };

  function member(st, id) { return st.members.filter(function (m) { return m.id === id; })[0]; }
  function first(m) { return m ? String(m.name).split(' ')[0] : ''; }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600); return (h ? h + ':' + U.pad(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + U.pad(s % 60); }
  function until(ms) {
    if (ms <= 0) return 'agora';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    if (d >= 2) return d + ' dias'; if (d === 1) return '1 dia ' + h + 'h';
    if (h) return h + 'h ' + U.pad(m % 60); return m + ' min ' + U.pad(Math.floor(ms / 1000) % 60) + 's';
  }
  function at(hhmm, base) { var p = hhmm.split(':'), d = new Date(base || Date.now()); d.setHours(+p[0], +p[1], 0, 0); return d; }
  function ago(d) { var m = Math.round((Date.now() - d) / 60000); return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : 'há ' + Math.round(m / 60) + ' h'; }

  /* ---------- contagens ---------- */
  function countdowns(st) {
    var now = new Date(), out = [], R = C.routines || {};
    if (R.morning && R.morning.days.indexOf(now.getDay()) >= 0) { var lv = at(R.morning.until); if (lv > now && lv - now < 3 * 3600000) out.push({ ic: 'sun2', label: R.morning.label, at: lv, c: '#fbbf24' }); }
    if (R.bedtime && R.bedtime.days.indexOf(now.getDay()) >= 0) { var bd = at(R.bedtime.until); if (bd > now && now.getHours() >= 15) out.push({ ic: 'moon', label: R.bedtime.label, at: bd, c: '#a78bfa' }); }
    st.events.filter(function (e) { return !e.allDay && e.start > now && e.start - now < 36 * 3600000 && e.type !== 'birthday'; }).slice(0, 4).forEach(function (e) {
      out.push({ ic: e.type === 'meeting' ? 'video' : e.type === 'church' ? 'church' : 'calendar', label: e.private ? 'Ocupado' : e.title, at: e.start, c: COLORS[e.type] || '#60a5fa' });
    });
    var mn = st.watch && st.watch.movieNight;
    if (mn) { var d = U.startOfDay(now); d.setDate(d.getDate() + ((mn.day - d.getDay() + 7) % 7)); var mt = at(mn.time, d); if (mt < now) mt.setDate(mt.getDate() + 7); out.push({ ic: 'tv', label: 'Filme da sexta', at: mt, c: '#f472b6' }); }
    var bday = st.events.filter(function (e) { return e.type === 'birthday' && e.start >= U.startOfDay(now); })[0];
    if (bday) out.push({ ic: 'cake', label: bday.title.replace(/^Aniversário\s*—\s*/, 'Aniversário: '), at: U.startOfDay(bday.start), c: '#e879f9', day: true });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function bills(st) {
    var l = st.lists.filter(function (x) { return /payment|pagamento|conta/i.test(x.name); })[0]; if (!l) return null;
    var open = l.items.filter(function (i) { return !i.done; }), sod = U.startOfDay(new Date());
    return { list: l, open: open, soon: open.filter(function (i) { return i.due && new Date(i.due) - sod < 7 * 864e5 && new Date(i.due) >= sod; }), late: open.filter(function (i) { return i.due && new Date(i.due) < sod; }) };
  }

  /* ---------- TIMERS (aba) ---------- */
  function ring(frac, size, color) {
    var r = size / 2 - 9, c = 2 * Math.PI * r;
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/>' +
      '<circle class="arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c * Math.max(0, Math.min(1, frac)) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  function left(t) { return t.paused ? t.remain : t.end - Date.now(); }
  function timersView(st) {
    var run = timers.map(function (t) {
      var l = left(t), ringing = l <= 0 && !t.paused;
      return '<div class="pt-tm' + (ringing ? ' ring-on' : '') + (t.paused ? ' paused' : '') + '" data-ptid="' + t.id + '"><div class="pt-r">' + ring(l / t.total, 150, ringing ? '#fbbf24' : t.paused ? '#64748b' : '#a78bfa') + '<b class="pt-t">' + mmss(l) + '</b></div>' +
        '<div class="pt-i"><span>' + esc(t.label) + '</span><div class="pt-b">' + (ringing ? '<button class="btn focusable" data-pt="stop:' + t.id + '">Parar</button>' :
        '<button class="btn ghost focusable" data-pt="pause:' + t.id + '">' + (t.paused ? 'Continuar' : 'Pausar') + '</button><button class="btn ghost focusable" data-pt="plus:' + t.id + '">+1 min</button><button class="btn ghost focusable" data-pt="stop:' + t.id + '">' + I.get('x', 20) + '</button>') + '</div></div></div>';
    }).join('');
    var cds = countdowns(st).slice(0, 6).map(function (c) { return '<div class="pt-cd" style="--c:' + c.c + '">' + I.get(c.ic, 28) + '<span>' + esc(c.label) + '</span><b data-ptcd="' + c.at.getTime() + '"' + (c.day ? ' data-day="1"' : '') + '>' + until(c.at - Date.now()) + '</b></div>'; }).join('');
    return '<div class="pt-wrap"><div class="pt-left"><h2><span class="chev">›</span>RECEITAS E ROTINAS</h2><div class="pt-grid">' + PRESETS.map(function (p, i) {
      return '<button class="pt-p focusable" data-pt="new:' + p[1] + ':' + esc(p[0]) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + I.get(p[2], 30) + '<b>' + esc(p[0]) + '</b><small>' + p[1] + ' min</small></button>';
    }).join('') + '</div><div class="pt-quick">' + [1, 5, 10, 15, 30, 60].map(function (m) { return '<button class="focusable" data-pt="new:' + m + ':">' + m + '′</button>'; }).join('') + '</div></div>' +
      '<div class="pt-right">' + (run ? '<div class="pt-run">' + run + '</div>' : '') + '<div class="card pt-cds' + (run ? '' : ' big') + '"><h2><span class="chev">›</span>CONTAGEM PARA O QUE VEM</h2>' + (cds || '<div class="empty">Nada marcado nas próximas horas.</div>') + '</div></div></div>';
  }
  function addTimer(min, label, extra) {
    var t = { id: U.uid(), end: Date.now() + min * 60000, total: min * 60000, orig: min * 60000, label: label || ('Timer de ' + min + ' min') };
    for (var k in extra || {}) t[k] = extra[k];
    timers.push(t); U.store.set('tvTimers', timers); return t;
  }
  function timerCmd(spec) {
    var p = spec.split(':'), id = p[1];
    if (p[0] === 'new') addTimer(+p[1], p.slice(2).join(':') ? p.slice(2).join(':') + ' · ' + p[1] + ' min' : null);
    timers.forEach(function (t) {
      if (t.id !== id) return;
      if (p[0] === 'pause') { if (t.paused) { t.end = Date.now() + t.remain; t.paused = false; } else { t.remain = t.end - Date.now(); t.paused = true; } }
      if (p[0] === 'plus') { if (t.paused) t.remain += 60000; else t.end = Math.max(t.end, Date.now()) + 60000; t.total += 60000; }
      if (p[0] === 'snooze') { t.paused = false; t.end = Date.now() + 5 * 60000; t.total = 5 * 60000; delete rang[t.id]; }
      if (p[0] === 'restart') { t.paused = false; t.total = t.orig || t.total; t.end = Date.now() + t.total; delete rang[t.id]; }
    });
    if (p[0] === 'stop') { timers = timers.filter(function (t) { return t.id !== id; }); delete rang[id]; }
    U.store.set('tvTimers', timers);
    popup(); chip();
  }

  /* ---------- timer tocando: janela por cima de qualquer tela + bipe que para de verdade ---------- */
  var actx = null, beepT = null, ringSince = 0;
  function ringing() { var now = Date.now(); return timers.filter(function (t) { return !t.paused && t.end <= now; }); }
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
      [0, 0.25].forEach(function (d) {
        var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + d;
        o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 0.2);
      });
    } catch (e) {}
  }
  function popup() {
    var r = ringing(), el = document.getElementById('tm-pop');
    if (!r.length) {
      clearInterval(beepT); beepT = null; ringSince = 0;
      if (el && el.classList.contains('active')) PK.app.hideOverlay('tm-pop');
      return;
    }
    if (!el) { el = document.createElement('div'); el.id = 'tm-pop'; el.className = 'overlay tm-pop'; document.getElementById('stage').appendChild(el); }
    var t = r[0], keep = el.querySelector('.focused'), keepAct = keep && keep.getAttribute('data-pt');
    el.innerHTML = '<div class="tm-box"><div class="tm-ic">' + I.get('bell', 64) + '</div><div class="tm-k">TIMER TERMINOU</div><div class="tm-l">' + esc(t.label) + '</div>' +
      '<div class="tm-ago" id="tm-ago"></div>' + (r.length > 1 ? '<div class="tm-more">+' + (r.length - 1) + ' timer' + (r.length > 2 ? 's' : '') + ' também terminou</div>' : '') +
      '<div class="tm-btns"><button class="btn focusable" data-pt="stop:' + t.id + '" data-autofocus>' + I.get('x', 24) + ' Parar</button>' +
      '<button class="btn ghost focusable" data-pt="snooze:' + t.id + '">' + I.get('clock', 24) + ' Soneca 5 min</button>' +
      '<button class="btn ghost focusable" data-pt="restart:' + t.id + '">' + I.get('refresh', 24) + ' Reiniciar ' + mmss(t.orig || t.total) + '</button></div></div>';
    if (!el.classList.contains('active')) PK.app.showOverlay('tm-pop');
    else { var nb = keepAct && el.querySelector('[data-pt="' + keepAct + '"]'); PK.nav.focus(nb || el.querySelector('[data-autofocus]'), true); }
    if (!beepT) { ringSince = Date.now(); beep(); beepT = setInterval(function () { if (Date.now() - ringSince > 3 * 60000) { clearInterval(beepT); return; } beep(); }, 2200); } // silencia sozinho em 3 min
  }
  // pílula com o timer mais próximo, em qualquer tela
  function chip() {
    var run = timers.filter(function (t) { return !t.paused && t.end > Date.now(); }).sort(function (a, b) { return a.end - b.end; }), el = document.getElementById('tm-chip');
    if (!run.length) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = document.createElement('div'); el.id = 'tm-chip'; document.getElementById('stage').appendChild(el); }
    el.style.display = ''; el.innerHTML = I.get('clock', 22) + '<b>' + mmss(run[0].end - Date.now()) + '</b><span>' + esc(run[0].label) + '</span>' + (run.length > 1 ? '<em>+' + (run.length - 1) + '</em>' : '');
  }
  // A cada segundo: atualiza anéis/contagens e dispara o alarme (cartão de aviso com som do navegador)
  var rang = {};
  function second() {
    var now = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('[data-ptid]'), function (el) {
      var t = timers.filter(function (x) { return x.id === el.getAttribute('data-ptid'); })[0]; if (!t) return;
      var l = left(t), r = 150 / 2 - 9, c = 2 * Math.PI * r, arc = el.querySelector('.arc');
      el.querySelector('.pt-t').textContent = mmss(l); if (arc) arc.setAttribute('stroke-dasharray', c * Math.max(0, l / t.total) + ' ' + c);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-ptcd]'), function (el) { var ms = +el.getAttribute('data-ptcd') - now; el.textContent = el.hasAttribute('data-day') ? until(ms).replace(/ \d+h$/, '') : until(ms); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-rccd]'), function (el) { el.textContent = mmss(+el.getAttribute('data-rccd') - now); });
    var newly = false;
    timers.forEach(function (t) { if (!t.paused && t.end <= now && !rang[t.id]) { rang[t.id] = 1; newly = true; } });
    if (newly) popup();
    var ag = document.getElementById('tm-ago'), r = ringing(); if (ag && r[0]) ag.textContent = 'há ' + mmss(now - r[0].end);
    chip();
  }

  /* ---------- RECADOS (aba) ---------- */
  function notesView(st) {
    var ns = st.notes || [];
    var c = (st.settings && st.settings.content) || {}, live = PK.data.mode() === 'live', canWrite = !live || c.noteWrite !== false;
    return '<div class="pn-head"><h1>Recados da família</h1>' + (canWrite ? '' : '<span class="pn-lock">' + I.get('bell', 20) + ' Escrever recados está desligado para esta TV</span>') + '<button class="btn focusable' + (canWrite ? '' : ' ghost') + '" data-pn="new" data-autofocus>' + I.get('plus', 24) + ' Novo recado</button></div><div class="pn-grid">' +
      (ns.length ? ns.slice(0, 8).map(function (n, i) {
        var by = member(st, n.by), seen = (n.seenBy || []).map(function (id) { return member(st, id); }).filter(Boolean);
        var missing = st.members.filter(function (m) { return (n.seenBy || []).indexOf(m.id) < 0 && m.id !== n.by; });
        return '<div class="pn-c c' + (i % 4) + ' focusable" data-pn="seen:' + esc(n.id) + '"><p>' + esc(n.text) + '</p><div class="pn-f">' + (by ? PK.views.av(by, 32) + ' <span>' + esc(first(by)) + '</span>' : '') + '<small>' + (n.at ? ago(n.at) : '') + '</small></div>' +
          '<div class="pn-s">' + (seen.length ? 'Visto por ' + seen.map(function (m) { return PK.views.av(m, 26); }).join('') : 'Ninguém viu ainda') + (missing.length ? '<em>OK = “Vi”</em>' : '') + '</div></div>';
      }).join('') : '<div class="empty">Nenhum recado chegou do PlanKnect.<br><small>Se já existem recados, ative “Recados” para esta TV em planknect.com › Configurações › Dispositivos › Conteúdo e conexões. ID desta TV: <b>' + esc(PK.api.deviceId()) + '</b></small></div>') + '</div>';
  }

  /* ---------- modais (usam PK.app.openModal) ---------- */
  function whoModal(st, title, attr, arg) {
    PK.app.openModal({ title: esc(title), body: '<div class="voters">' + st.members.map(function (m, i) {
      return '<button class="voter focusable" data-' + attr + '="' + esc(arg) + '" data-m="' + m.id + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + PK.views.av(m, 96) + '<span>' + esc(first(m)) + '</span></button>';
    }).join('') + '</div>', actions: [{ label: 'Cancelar', act: 'close', ghost: true }] }, 'settings');
  }
  function newNoteModal() {
    PK.app.openModal({ title: I.get('note', 40) + ' Novo recado', body: '<div class="pq-grid">' + NOTES.map(function (n, i) {
      return '<button class="pq focusable" data-pn="text:' + esc(n) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + esc(n) + '</button>'; }).join('') + '</div><p class="dt-hint">Outro texto? Diga “avisa que …” no microfone, ou escreva no celular.</p>',
      actions: [{ label: 'Cancelar', act: 'close', ghost: true }] }, 'settings');
  }
  function quickAddModal(st, listId) {
    var l = st.lists.filter(function (x) { return x.id === listId; })[0] || st.lists[0]; if (!l) return;
    var have = {}; l.items.forEach(function (i) { if (!i.done) have[i.title.toLowerCase()] = 1; });
    var sugg = l.items.filter(function (i) { return i.done; }).map(function (i) { return i.title; }).concat(STAPLES).filter(function (t, i, a) { return !have[t.toLowerCase()] && a.indexOf(t) === i; }).slice(0, 12);
    PK.app.openModal({ title: I.get('plus', 40) + ' Adicionar em ' + esc(l.name), body: '<div class="pq-grid">' + sugg.map(function (t, i) {
      return '<button class="pq focusable" data-pq="' + esc(l.id) + '|' + esc(t) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + I.get('plus', 24) + ' ' + esc(t) + '</button>'; }).join('') + '</div><p class="dt-hint">Outro item? Use “Adicionar por voz” ou o QR da lista.</p>',
      actions: [{ label: 'Pronto', act: 'close', ghost: true }] }, 'settings');
  }
  var nm = { kid: null, repeat: 'daily', points: null };
  function missionModal(st) {
    var kids = st.members.filter(function (m) { return m.kid; }); if (!kids.length) { PK.toast('Nenhum membro marcado como criança'); return; }
    if (!nm.kid) nm.kid = kids[0].id;
    var ov = document.querySelector('.overlay.dyn.nm-ov'); if (ov) ov.parentNode.removeChild(ov);
    var opt = function (k, v, lbl) { return '<button class="chip focusable' + (nm[k] === v ? ' on' : '') + '" data-nm="' + k + ':' + v + '">' + lbl + '</button>'; };
    var o = PK.app.openModal({ title: I.get('rocket', 40) + ' Nova missão', body:
      '<div class="pm-row">' + kids.map(function (k) { return '<button class="chip focusable' + (nm.kid === k.id ? ' on' : '') + '" data-nm="kid:' + k.id + '" style="--m:' + k.color + '">' + PK.views.av(k, 40) + esc(first(k)) + '</button>'; }).join('') + '</div>' +
      '<div class="pm-row">' + opt('repeat', 'daily', 'Todo dia') + opt('repeat', 'weekdays', 'Dias de semana') + opt('repeat', 'once', 'Só hoje') + '<span class="pm-gap"></span>' + opt('points', null, 'Padrão') + opt('points', 2, '2★') + opt('points', 5, '5★') + opt('points', 10, '10★') + '</div>' +
      '<div class="pq-grid four">' + MISSIONS.map(function (m, i) { return '<button class="pq focusable" data-pm="' + i + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + I.get(m[1], 26) + '<span>' + esc(m[0]) + '</span><small>' + m[2] + ' · ' + m[3] + '★</small></button>'; }).join('') + '</div>',
      actions: [{ label: 'Fechar', act: 'close', ghost: true }] }, 'detail');
    o.classList.add('nm-ov');
  }

  /* ---------- receita passo a passo ---------- */
  function openRecipe(title, steps) { recipe = { title: title, steps: steps, i: 0 }; drawRecipe(); }
  function drawRecipe() {
    var el = document.getElementById('recipe-layer');
    if (!el) { el = document.createElement('div'); el.id = 'recipe-layer'; el.className = 'overlay recipe'; document.getElementById('stage').appendChild(el); }
    if (!recipe) { if (el.classList.contains('active')) PK.app.hideOverlay('recipe-layer'); return; }
    var s = recipe.steps[recipe.i], n = recipe.steps.length, run = timers.filter(function (t) { return t.recipe === recipe.title + '#' + recipe.i; })[0];
    el.innerHTML = '<div class="rc-box"><div class="rc-top"><b>' + esc(recipe.title) + '</b><span>Passo ' + (recipe.i + 1) + ' de ' + n + '</span></div>' +
      '<div class="rc-dots">' + recipe.steps.map(function (x, i) { return '<i class="' + (i < recipe.i ? 'done' : i === recipe.i ? 'on' : '') + '"></i>'; }).join('') + '</div><div class="rc-step">' + esc(s.text) + '</div>' +
      (s.minutes ? (run ? '<div class="rc-run">' + I.get('refresh', 30) + ' <b data-rccd="' + run.end + '">' + mmss(run.end - Date.now()) + '</b> no timer</div>' : '<button class="btn focusable rc-timer" data-rc="timer">' + I.get('refresh', 28) + ' Iniciar timer de ' + s.minutes + ' min</button>') : '') +
      '<div class="rc-nav"><button class="btn ghost focusable" data-rc="prev"' + (recipe.i ? '' : ' disabled') + '>‹ Anterior</button><button class="btn focusable" data-rc="next" data-autofocus>' + (recipe.i < n - 1 ? 'Próximo ›' : 'Pronto!') + '</button><button class="btn ghost focusable" data-rc="close">Fechar</button></div></div>';
    if (!el.classList.contains('active')) PK.app.showOverlay('recipe-layer'); else setTimeout(PK.nav.reset, 30);
  }
  function recipeCmd(c) {
    if (!recipe) return;
    if (c === 'next') { if (recipe.i < recipe.steps.length - 1) recipe.i++; else { recipe = null; PK.toast('Bom apetite!'); } }
    if (c === 'prev' && recipe.i) recipe.i--;
    if (c === 'close') recipe = null;
    if (c === 'timer') { var s = recipe.steps[recipe.i]; addTimer(s.minutes, 'Passo ' + (recipe.i + 1) + ' · ' + s.text.slice(0, 30), { recipe: recipe.title + '#' + recipe.i }); }
    drawRecipe();
  }

  return {
    timersView: timersView, timerCmd: timerCmd, second: second, notesView: notesView, countdowns: countdowns, bills: bills,
    whoModal: whoModal, newNoteModal: newNoteModal, quickAddModal: quickAddModal, missionModal: missionModal, nm: nm, MISSIONS: MISSIONS,
    openRecipe: openRecipe, recipeCmd: recipeCmd, recipeOpen: function () { return !!recipe; }, closeRecipe: function () { recipe = null; }, timersCount: function () { return timers.length; },
    stopRinging: function () { ringing().forEach(function (t) { timers = timers.filter(function (x) { return x.id !== t.id; }); delete rang[t.id]; }); U.store.set('tvTimers', timers); clearInterval(beepT); beepT = null; chip(); }
  };
})();
