/* Rotinas da manhã e da noite.
 * Abrem sozinhas no horário (se a TV estiver no PlanKnect) ou quando o agente local liga a TV
 * e abre o app com { routine: 'morning' | 'bedtime' }. Voltar fecha. */
var PK = window.PK || {};
window.PK = PK;

PK.routine = (function () {
  var U = PK.util, I = PK.icons, S = PK.settings, esc = U.esc;
  var cur = null, doneToday = U.store.get('routineDone', {});

  function cfg(name) { return (PK.config.routines || {})[name]; }
  function at(hhmm) { var p = hhmm.split(':'), d = new Date(); d.setHours(+p[0], +p[1], 0, 0); return d; }
  function el() { return document.getElementById('routine'); }

  function open(name, state) {
    var c = cfg(name); if (!c) return;
    cur = name;
    var box = el();
    box.innerHTML = '<div id="rt-scene" class="scene-host"></div><div class="rt-shade"></div><div class="rt-body" id="rt-body"></div>';
    PK.scenes.mount(document.getElementById('rt-scene'), name === 'morning' ? 'living-nordic' : 'fireplace');
    box.classList.toggle('night', name === 'bedtime');
    PK.app.showOverlay('routine');
    render(state || PK.app.state());
  }
  function close() { cur = null; }

  function render(state) {
    if (!cur) return;
    var body = document.getElementById('rt-body'); if (!body) return;
    var c = cfg(cur), now = new Date(), until = at(c.until), left = until - now;
    var morning = cur === 'morning', period = morning ? 'manhã' : 'noite';
    var kids = state.members.filter(function (m) { return m.kid; });
    var w = state.weather, tip = '';
    if (w && morning) {
      var d0 = w.days[0], wet = (d0.rain || 0) >= 50;
      tip = I.get(I.weather(d0.code, true), 34) + ' ' + w.temp + '° agora, máxima de ' + d0.max + '°. ' + (wet ? d0.rain + '% de chuva — guarda-chuva na mochila.' : d0.max >= 26 ? 'Dia quente — garrafinha de água e protetor.' : d0.min <= 14 ? 'Manhã fria — leve um casaco.' : 'Tempo bom para sair.');
    }
    if (w && !morning) { var t1 = w.days[1]; tip = I.get(I.weather(t1.code, true), 34) + ' Amanhã: ' + t1.min + '° a ' + t1.max + '°' + ((t1.rain || 0) >= 50 ? ', ' + t1.rain + '% de chuva.' : '.'); }
    var day = morning ? now : U.addDays(now, 1);
    var agenda = state.events.filter(function (e) { return U.sameDay(e.start, day) && !e.allDay && (morning ? e.end > now : true) && !PK.views.TYPE[e.type].work; }).slice(0, 3);
    var mmss = function (ms) { var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600); return (h ? h + ':' + U.pad(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + U.pad(s % 60); };
    body.innerHTML =
      '<div class="rt-top"><div><div class="rt-hello">' + (morning ? 'Bom dia, turma!' : 'Boa noite, família!') + '</div><div class="rt-clock">' + U.hm(now) + '</div></div>' +
      '<div class="rt-count' + (left <= 0 ? ' go' : '') + '"><span>' + esc(c.label) + (left > 0 ? ' em' : '') + '</span><b id="rt-left" data-until="' + until.getTime() + '">' + (left > 0 ? mmss(left) : (morning ? 'Hora de sair!' : 'Hora de dormir!')) + '</b></div></div>' +
      (tip ? '<div class="rt-tip">' + tip + '</div>' : '') +
      '<div class="rt-kids" style="grid-template-columns:repeat(' + Math.max(1, kids.length) + ',1fr)">' + kids.map(function (k, ki) {
        var mine = state.chores.filter(function (x) { return x.member === k.id && x.period === period; });
        var dn = mine.filter(function (x) { return x.done; }).length;
        return '<div class="rt-kid" style="--k:' + k.color + '"><div class="rt-kid-h"><span class="kid-bubble">' + esc(k.initial) + '</span><b>' + esc(k.name) + '</b><span class="rt-n">' + dn + '/' + mine.length + '</span></div>' +
          mine.map(function (x, i) {
            return '<div class="rt-ch focusable' + (x.done ? ' done' : '') + '" data-chore="' + esc(x.id) + '"' + (ki === 0 && i === 0 ? ' data-autofocus' : '') + '><span class="ms-ic">' + I.get(x.icon, 30) + '</span>' + esc(x.title) + '<span class="ms-check">' + I.get('check', 26, ' stroke-width="3.2"') + '</span></div>';
          }).join('') + (dn === mine.length && mine.length ? '<div class="rt-ok">' + I.get('sparkle', 26) + ' Tudo pronto!</div>' : '') + '</div>';
      }).join('') + '</div>' +
      (agenda.length ? '<div class="rt-agenda"><span>' + (morning ? 'Hoje' : 'Amanhã') + ':</span>' + agenda.map(function (e) { return '<b>' + U.hm(e.start) + '</b> ' + esc(PK.views.title(e)); }).join('<i>·</i>') + '</div>' : '') +
      '<div class="rt-hint">Voltar fecha · OK marca a missão</div>';
  }
  function second() {
    var t = document.getElementById('rt-left'); if (!t || !cur) return;
    var left = +t.getAttribute('data-until') - Date.now(), s = Math.max(0, Math.round(left / 1000)), h = Math.floor(s / 3600);
    if (left > 0) t.textContent = (h ? h + ':' + U.pad(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + U.pad(s % 60);
  }
  // Chamado a cada minuto: abre no horário, fecha 15 min depois do "until"
  function tick(state) {
    if (PK.noAuto) return;
    var now = new Date(), key = U.startOfDay(now).toDateString();
    if (cur) {
      var c = cfg(cur);
      if (now - at(c.until) > 15 * 60000) { PK.app.hideOverlay('routine'); cur = null; }
      else render(state);
      return;
    }
    if (PK.modes.meeting.active()) return;
    ['morning', 'bedtime'].forEach(function (n) {
      var c = cfg(n); if (!c || c.days.indexOf(now.getDay()) < 0 || doneToday[n] === key) return;
      if (now >= at(c.start) && now < at(c.until)) { doneToday[n] = key; U.store.set('routineDone', doneToday); if (PK.modes.ambient.active()) PK.modes.ambient.exit(); open(n, state); }
    });
  }
  return { open: open, close: close, render: render, second: second, tick: tick, active: function () { return !!cur; } };
})();
