/* Alfred — o mordomo digital do PlanKnect (conceito "Jarvis"), na TV e no nest-hub.
 *  - Uma tela só: presença (orbe + ondas de voz), o que você disse, a resposta, resumo do dia e sugestões.
 *  - Fala com sotaque britânico, educado e simpático (voz en-GB do aparelho). Idioma em Ajustes › Alfred.
 *  - Ouvir: Web Speech (LG/Chrome) → microfone USB/câmera da TV (grava e manda o áudio ao PlanKnect)
 *    → celular pelo QR. Também aceita texto e os atalhos "Experimente dizer".
 *  - Conectado: GET /ai/briefing, GET /ai/suggestions, POST /assistant {text|audio, lang, persona:'alfred'}.
 *    Sem essas rotas (ou no demo), gera tudo localmente; o "Aceitar" local nunca faz mudanças em massa no modo real.
 * Uso: PK.jarvis.init({ host, getState, navigate, command(text)→Promise<{reply,en,actions}>, applyActions, compact, speak, refresh, focus, canInterrupt })
 *      PK.jarvis.open()            resumo + sugestões
 *      PK.jarvis.open('listen')    já abre ouvindo (botão do microfone do controle)
 *      PK.jarvis.open('silent')    sem falar o resumo */
var PK = window.PK || {};
window.PK = PK;

/* ---------- voz do Alfred ----------
 * 1º PlanKnect (POST /voice/tts — a mesma voz natural do KnectAI no site), frase por frase: a primeira frase
 *    já toca enquanto as próximas são geradas (como o jarvis do ethanplusai). O nível real do áudio move o orbe.
 * 2º Voz britânica do aparelho (speechSynthesis en-GB), se a rota não existir ou falhar.
 * stop() interrompe na hora (barge-in: apertar o microfone corta a fala). */
PK.voice = (function () {
  var U = PK.util, cached = null, gen = 0, hooks = {}, audio = null, actx = null, an = null, buf = null, raf = null, fake = null;
  var down = (U && U.store.get('ttsDown2', 0)) || 0, provider = 'device', DOWN_MS = 15 * 60000;
  var hasDeviceVoice = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  // Em TV (Tizen/webOS) o áudio não passa pelo analisador: se o AudioContext nascer suspenso, o som sairia mudo
  var useAnalyser = !(PK.tv && (PK.tv.isTizen || PK.tv.isWebOS));
  var PREF = /(Daniel|Arthur|Oliver|George|Malcolm|Google UK English Male|en-GB.*Male|Ryan|Thomas)/i;
  function voices() { try { return window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch (e) { return []; } }
  if (window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis) window.speechSynthesis.onvoiceschanged = function () { cached = null; };
  function pick(lang) {
    var all = voices(), base = lang.slice(0, 2);
    if (lang === 'en-GB') {
      if (cached) return cached;
      var gb = all.filter(function (v) { return /en[-_]GB/i.test(v.lang); });
      cached = gb.filter(function (v) { return PREF.test(v.name); })[0] || gb[0] || null;
      return cached;
    }
    return all.filter(function (v) { return v.lang.replace('_', '-') === lang; })[0] || all.filter(function (v) { return v.lang.slice(0, 2) === base; })[0] || null;
  }
  function can() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance) || cloudOn(); }
  function cloudOn() { return PK.data && PK.data.mode() === 'live' && (PK.settings.get('ai.planknectVoice') !== false || !hasDeviceVoice) && (!hasDeviceVoice || Date.now() - down > DOWN_MS); }
  function sentences(t) {
    var parts = String(t || '').replace(/[⭐★“”"]/g, '').match(/[^.!?…]+[.!?…]+["')]*\s*|[^.!?…]+$/g) || [];
    var out = []; parts.forEach(function (p) { p = p.trim(); if (!p) return; if (out.length && out[out.length - 1].length < 28) out[out.length - 1] += ' ' + p; else out.push(p); });
    return out;
  }
  function level(v) { if (hooks.level) hooks.level(v); }
  function meter() {
    cancelAnimationFrame(raf);
    var tick = function () {
      if (an) { an.getByteTimeDomainData(buf); var pk = 0; for (var i = 0; i < buf.length; i += 4) pk = Math.max(pk, Math.abs(buf[i] - 128)); level(Math.min(1, pk / 52)); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function el() {
    if (audio) return audio;
    audio = new Audio(); audio.preload = 'auto'; audio.volume = 1;
    if (!useAnalyser) return audio;
    try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) { actx = new AC(); an = actx.createAnalyser(); an.fftSize = 512; buf = new Uint8Array(an.fftSize); var src = actx.createMediaElementSource(audio); src.connect(an); an.connect(actx.destination); } } catch (e) { an = null; }
    return audio;
  }
  function playSrc(src, my, next, fail) {
    var a = el(); if (actx && actx.state === 'suspended') actx.resume();
    a.onended = function () { if (my === gen) next(); };
    a.onerror = function () { lastErr = 'player: ' + ((a.error && a.error.code) || '?'); if (my === gen) fail(new Error('audio')); };
    a.onplaying = function () { played++; };
    if (/^data:/.test(src)) src = blobUrl(src);
    a.src = src; var p = a.play(); if (p && p.catch) p.catch(function (e) { lastErr = 'play: ' + (e && (e.name || e.message)); if (my === gen) fail(e); });
    if (an) meter(); else fakeLevel(true);
  }
  var lastBlob = null, lastErr = '', played = 0;
  function blobUrl(dataUri) { // data:audio/wav;base64,… → blob: (o player da Tizen lida melhor)
    try {
      var i = dataUri.indexOf(','), mime = dataUri.slice(5, dataUri.indexOf(';')), bin = atob(dataUri.slice(i + 1)), arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      if (lastBlob) URL.revokeObjectURL(lastBlob);
      lastBlob = URL.createObjectURL(new Blob([arr], { type: mime || 'audio/wav' })); return lastBlob;
    } catch (e) { return dataUri; }
  }
  function cloud(parts, lang, my) {
    var reqs = [];
    var get = function (i) { if (i >= parts.length) return null; if (!reqs[i]) reqs[i] = PK.api.tts(parts[i], { lang: lang, voice: 'alfred' }); return reqs[i]; };
    var play = function (i) {
      if (my !== gen) return;
      if (i >= parts.length) return finish(my);
      var cur = get(i); get(i + 1); // já pede a próxima frase
      cur.then(function (r) {
        if (my !== gen) return;
        if (!r || (!r.audio && !r.url)) throw new Error('empty');
        provider = 'planknect';
        playSrc(r.url || ('data:' + (r.mime || 'audio/mpeg') + ';base64,' + r.audio), my, function () { play(i + 1); }, function () { device(parts.slice(i).join(' '), lang, my); });
      }).catch(function (e) {
        if (/404|not_found|405/.test(e && e.message)) { down = Date.now(); U.store.set('ttsDown2', down); }
        lastErr = 'tts: ' + (e && e.message); if (window.console) console.warn('[Alfred] voz do PlanKnect falhou:', e && e.message);
        if (my === gen) device(parts.slice(i).join(' '), lang, my);
      });
    };
    play(0);
  }
  function device(text, lang, my) {
    provider = 'device';
    if (!hasDeviceVoice) { if (hooks.silent) hooks.silent(); return finish(my); }
    try {
      var u = new SpeechSynthesisUtterance(text), v = pick(lang);
      u.lang = lang; if (v) u.voice = v;
      u.rate = lang === 'en-GB' ? 0.95 : 1.02; u.pitch = lang === 'en-GB' ? 0.92 : 1;
      u.onboundary = function () { level(0.95); };
      u.onend = u.onerror = function () { if (my === gen) finish(my); };
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); fakeLevel(true);
    } catch (e) { finish(my); }
  }
  function fakeLevel(on) { clearInterval(fake); if (on) { var t = 0; fake = setInterval(function () { t += 0.35; level(0.35 + 0.3 * Math.abs(Math.sin(t)) + Math.random() * 0.25); }, 70); } }
  function finish(my) { if (my !== gen) return; cancelAnimationFrame(raf); fakeLevel(false); level(0); var h = hooks; hooks = {}; if (h.end) h.end(); }
  function speak(text, lang, on) {
    stop(); hooks = on || {}; var my = gen;
    var parts = sentences(text); if (!parts.length) return finish(my);
    if (hooks.start) hooks.start();
    if (cloudOn()) cloud(parts, lang, my); else device(parts.join(' '), lang, my);
  }
  // Áudio já pronto vindo do PlanKnect (ex.: /assistant devolve "audio" junto com a resposta)
  function playAudio(b64, mime, on, text, lang) {
    stop(); hooks = on || {}; var my = gen; provider = 'planknect'; if (hooks.start) hooks.start();
    playSrc('data:' + (mime || 'audio/wav') + ';base64,' + b64, my, function () { finish(my); }, function () { if (my !== gen) return; if (text) { var parts = sentences(text); if (cloudOn()) cloud(parts, lang || 'en-GB', my); else device(parts.join(' '), lang || 'en-GB', my); } else finish(my); });
  }
  function stop() {
    gen++; cancelAnimationFrame(raf); fakeLevel(false);
    try { if (audio) { audio.onended = null; audio.pause(); } } catch (e) {}
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    var h = hooks; hooks = {}; if (h.level) h.level(0); if (h.end) h.end();
  }
  return { speak: speak, playAudio: playAudio, stop: stop, can: can, pick: pick, sentences: sentences, provider: function () { return cloudOn() ? (provider === 'device' && Date.now() - down < DOWN_MS ? 'device' : 'planknect') : 'device'; }, debug: function () { return { live: PK.data.mode(), down: down, hasDeviceVoice: hasDeviceVoice, analyser: useAnalyser, cloud: cloudOn(), played: played, lastErr: lastErr }; }, reset: function () { down = 0; U.store.set('ttsDown2', 0); lastErr = ''; } };
})();

/* ---------- orbe de partículas (inspirado no orb.ts do jarvis, em Canvas 2D para rodar em TV) ----------
 * Esfera oca de partículas (Fibonacci) ligadas às vizinhas, girando devagar; incha, brilha e se inclina com a voz. */
PK.orb = function (canvas, n) {
  var ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, pts = [], ang = 0, lvl = 0, target = 0, st = 'idle', run = false, last = 0;
  var GA = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < n; i++) { var y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = GA * i; pts.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
  var LINKS = [8, 13, 21, 34].filter(function (k) { return k < n; });
  var COL = { idle: [129, 140, 248], listen: [34, 211, 238], think: [192, 132, 252], talk: [165, 180, 252] };
  function frame(t) {
    if (!run) return;
    requestAnimationFrame(frame);
    if (t - last < 30) return; last = t; // ~30 fps
    lvl += (target - lvl) * 0.25;
    var spin = st === 'think' ? 0.035 : st === 'listen' ? 0.012 : 0.006;
    ang += spin + lvl * 0.01;
    var cx = W / 2, cy = H / 2, R = W * 0.36 * (1 + lvl * 0.22 + (st === 'idle' ? Math.sin(t / 900) * 0.02 : 0)), tilt = 0.35 + lvl * 0.25;
    var c = COL[st] || COL.idle, ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), stl = Math.sin(tilt);
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, W / 2);
    g.addColorStop(0, 'rgba(' + c.join(',') + ',' + (0.22 + lvl * 0.3) + ')'); g.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var P = new Array(n);
    for (var i = 0; i < n; i++) {
      var p = pts[i], x = p[0] * ca - p[2] * sa, z = p[0] * sa + p[2] * ca, y = p[1];
      var y2 = y * ct - z * stl, z2 = y * stl + z * ct, k = 2.4 / (2.4 - z2 * (0.6 + lvl * 0.4));
      P[i] = [cx + x * R * k, cy + y2 * R * k, z2, y2];
    }
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + c.join(',') + ',' + (0.18 + lvl * 0.22) + ')'; ctx.beginPath();
    for (i = 0; i < n; i++) for (var L = 0; L < LINKS.length; L++) { var j = i + LINKS[L]; if (j < n && P[i][2] > -0.2 && P[j][2] > -0.2) { ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); } }
    ctx.stroke();
    for (i = 0; i < n; i++) {
      var q = P[i], front = (q[2] + 1) / 2, rim = q[3] > 0.55 ? (q[3] - 0.55) * 2.2 : 0;
      var a = 0.3 + front * 0.7 + rim * 0.6 + lvl * 0.3, s = (1.4 + front * 2.6 + lvl * 1.6) * (W / 520);
      ctx.fillStyle = 'rgba(' + Math.min(255, c[0] + rim * 90 + lvl * 60 | 0) + ',' + Math.min(255, c[1] + rim * 90 + lvl * 60 | 0) + ',' + Math.min(255, c[2] + 20) + ',' + Math.min(1, a) + ')';
      ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s);
    }
  }
  return {
    start: function () { if (!run) { run = true; requestAnimationFrame(frame); } },
    stop: function () { run = false; },
    level: function (v) { target = Math.max(0, Math.min(1, v || 0)); },
    state: function (s) { st = s || 'idle'; }
  };
};

PK.jarvis = (function () {
  var U = PK.util, I = PK.icons, esc = U.esc;
  var opt = null, el = null, dismissed = U.store.get('aiDismissed', {}), shownDay = U.store.get('aiBriefDay', {});
  var mini = null, fullEl = null, fullOrb = null, docked = false;
  var current = [], busy = false, rec = null, recT = null, levelT = null, orb = null, log = [], memory = U.store.get('aiMemory', []);
  function name() { return (PK.config.ai && PK.config.ai.name) || 'Alfred'; }
  function lang() { return PK.settings.get('ai.lang') || 'en-GB'; }
  function EN() { return lang().indexOf('en') === 0; }
  function L(pt, en) { return EN() ? en : pt; }
  function live() { return PK.data.mode() === 'live'; }
  function S() { return opt.getState(); }
  function title(e) { return e.private ? L('Ocupado', 'Busy') : e.title; }
  function first(m) { return String((m && m.name) || '').split(' ')[0]; }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  var WX_EN = function (c) { return c === 0 ? 'clear skies' : c <= 2 ? 'mostly sunny' : c === 3 ? 'overcast' : c <= 48 ? 'foggy' : c <= 57 ? 'drizzle' : c <= 67 ? 'rain' : c <= 77 ? 'snow' : c <= 82 ? 'showers' : 'thunderstorms'; };
  var ACK = ['Very good.', 'Certainly.', 'Right away.', 'Consider it done.', 'Of course.'];

  /* ---------- briefing local ---------- */
  function greet(h) { return h < 12 ? L('Bom dia', 'Good morning') : h < 18 ? L('Boa tarde', 'Good afternoon') : L('Boa noite', 'Good evening'); }
  function briefingLocal() {
    var st = S(), now = new Date(), h = now.getHours(), evening = h >= 17;
    var day = evening ? U.addDays(now, 1) : now, when = evening ? L('Amanhã', 'Tomorrow') : L('Hoje', 'Today');
    var evs = st.events.filter(function (e) { return U.sameDay(e.start, day) && !e.allDay && (evening || e.end > now); });
    var lines = [], speech = [];
    var hh = (st.household && st.household.name || '').replace(/\s*(family|família)(\s+calendar)?$/i, '');
    speech.push(greet(h) + (hh ? L(', família ' + hh, ', ' + hh + ' family') : '') + '.');
    if (evs.length) {
      lines.push({ ic: 'calendar', t: when + ': ' + plural(evs.length, L('compromisso', 'engagement'), L('compromissos', 'engagements')), s: evs.slice(0, 3).map(function (e) { return U.hm(e.start) + ' ' + title(e); }).join(' · ') });
      speech.push(L(when + ' vocês têm ' + plural(evs.length, 'compromisso', 'compromissos') + ', o primeiro às ' + U.hm(evs[0].start) + ', ' + title(evs[0]) + '.',
        when + ' you have ' + plural(evs.length, 'engagement', 'engagements') + ', the first at ' + U.hm(evs[0].start) + ', ' + title(evs[0]) + '.'));
    } else { lines.push({ ic: 'calendar', t: L(when + ' a agenda está livre', when + ', the diary is clear'), s: '' }); speech.push(L('A agenda está livre.', 'The diary is entirely clear.')); }
    var w = st.weather;
    if (w) {
      var d = evening ? w.days[1] : w.days[0];
      if (d) {
        var wet = (d.rain || 0) >= 50;
        lines.push({ ic: I.weather(d.code, true), t: d.min + '° – ' + d.max + '° · ' + L(I.weatherText(d.code).toLowerCase(), WX_EN(d.code)), s: wet ? L(d.rain + '% de chuva — levem guarda-chuva', d.rain + '% chance of rain — an umbrella is advised') : '' });
        speech.push(L('Previsão de ' + d.min + ' a ' + d.max + ' graus' + (wet ? ', com ' + d.rain + ' por cento de chance de chuva' : '') + '.',
          'The forecast is ' + d.min + ' to ' + d.max + ' degrees' + (wet ? ', with a ' + d.rain + ' percent chance of rain, so I would take an umbrella' : ', ' + WX_EN(d.code)) + '.'));
      }
    }
    var sod = U.startOfDay(now), open = (st.tasks || []).filter(function (t) { return t.status !== 'done'; });
    var tToday = open.filter(function (t) { return t.due && U.sameDay(t.due, day); }), late = open.filter(function (t) { return t.due && t.due < sod; });
    if (tToday.length || late.length) {
      lines.push({ ic: 'task', t: (tToday.length ? plural(tToday.length, L('tarefa', 'task'), L('tarefas', 'tasks')) + ' ' + when.toLowerCase() : '') + (tToday.length && late.length ? ' · ' : '') + (late.length ? late.length + L(' atrasada' + (late.length > 1 ? 's' : ''), ' overdue') : ''), s: (tToday[0] || late[0]).title });
      speech.push(tToday.length ? L('Você tem ' + plural(tToday.length, 'tarefa', 'tarefas') + ' ' + when.toLowerCase() + '.', 'There ' + (tToday.length === 1 ? 'is one task' : 'are ' + tToday.length + ' tasks') + ' due ' + when.toLowerCase() + '.')
        : L('Há ' + late.length + ' tarefas atrasadas.', 'There are ' + late.length + ' overdue tasks, whenever you have a moment.'));
    }
    var meal = (st.meals || []).filter(function (m) { return U.sameDay(m.date, day); })[0];
    if (meal) { lines.push({ ic: 'chef', t: L('Jantar', 'Dinner') + ': ' + meal.title, s: '' }); speech.push(L('No jantar, ' + meal.title + '.', 'Dinner will be ' + meal.title + '.')); }
    var kids = (st.members || []).filter(function (m) { return m.kid; });
    if (kids.length && st.chores && st.chores.length) { var pend = st.chores.filter(function (c) { return !c.done; }).length; if (pend) lines.push({ ic: 'star', t: L(pend + ' missões das crianças pendentes', pend + ' children’s missions to go'), s: kids.map(first).join(', ') }); }
    speech.push(L('Se precisar de algo, é só chamar.', 'Do let me know if I can be of any help.'));
    return { title: greet(h) + (evening ? L(' · resumo de amanhã', ' · tomorrow at a glance') : L(' · seu dia', ' · your day')), lines: lines, speech: speech.join(' ') };
  }

  /* ---------- sugestões locais ---------- */
  function suggestionsLocal() {
    var st = S(), now = new Date(), out = [], sod = U.startOfDay(now);
    var timed = st.events.filter(function (e) { return !e.allDay && e.end > now && e.start - now < 2 * 864e5; });
    for (var i = 0; i < timed.length; i++) for (var j = i + 1; j < timed.length; j++) {
      var a = timed[i], b = timed[j];
      if (a.start < b.end && b.start < a.end) {
        var who = (a.members || []).filter(function (m) { return (b.members || []).indexOf(m) >= 0; });
        if (who.length) { var m = (st.members || []).filter(function (x) { return x.id === who[0]; })[0];
          out.push({ id: 'conflict-' + a.id + '-' + b.id, ic: 'calendar', tone: 'warn', title: L('Conflito na agenda' + (m ? ' de ' + first(m) : ''), 'A clash in ' + (m ? first(m) + '’s' : 'the') + ' diary'), body: title(a) + L(' e ', ' and ') + title(b) + L(' às ', ' at ') + U.hm(b.start) + '.', accept: L('Ver', 'Show me'), action: { open: { kind: 'event', id: b.id } } }); }
      }
    }
    var nm = timed.filter(function (e) { return e.type === 'meeting' && e.start > now && e.start - now < 30 * 60000; })[0];
    if (nm) { var mins = Math.round((nm.start - now) / 60000); out.push({ id: 'prep-' + nm.id, ic: 'video', title: L('Reunião em ' + mins + ' min', 'Meeting in ' + mins + ' minutes'), body: title(nm) + L('. Quer ver a pauta e os participantes?', '. Shall I bring up the agenda and attendees?'), accept: L('Abrir', 'Yes, please'), action: { open: { kind: 'event', id: nm.id } } }); }
    var w = st.weather;
    if (w && w.hours) timed.filter(function (e) { return e.start - now < 864e5 && ['family', 'event', 'church'].indexOf(e.type) >= 0; }).slice(0, 3).forEach(function (e) {
      var hr = w.hours.filter(function (x) { return Math.abs(x.time - e.start) < 1800001; })[0];
      if (hr && hr.rain >= 50) out.push({ id: 'rain-' + e.id, ic: 'rain', title: L('Chuva às ', 'Rain at ') + U.hm(e.start), body: L(hr.rain + '% de chance durante ' + title(e) + '. Lembrar a família de levar guarda-chuva?', hr.rain + '% chance during ' + title(e) + '. Shall I remind the family to take umbrellas?'), accept: L('Avisar a família', 'Remind them'), action: { broadcast: { kind: 'family', icon: 'rain', title: L('Levem guarda-chuva: ', 'Umbrellas, please: ') + title(e) + ' · ' + U.hm(e.start) } } });
    });
    var bl = (st.lists || []).filter(function (l) { return /payment|pagamento|conta/i.test(l.name); })[0];
    if (bl) { var due = bl.items.filter(function (it) { return !it.done && it.due && new Date(it.due) - sod < 3 * 864e5; });
      if (due.length) out.push({ id: 'bills-' + sod.toDateString(), ic: 'card', tone: 'warn', title: L(plural(due.length, 'conta vencendo', 'contas vencendo'), plural(due.length, 'bill falling due', 'bills falling due')), body: due.slice(0, 3).map(function (x) { return x.title; }).join(', ') + '.', accept: L('Ver contas', 'See bills'), action: { view: 'lists', list: bl.id } }); }
    var late = (st.tasks || []).filter(function (t) { return t.status !== 'done' && t.due && t.due < sod; });
    if (late.length >= 3) out.push({ id: 'late-' + sod.toDateString(), ic: 'task', title: L(late.length + ' tarefas atrasadas', late.length + ' overdue tasks'),
      body: live() ? L('Quer revisar e replanejar?', 'Would you care to review and replan them?') : L('Quer que eu adie as de prioridade baixa e média para a próxima semana?', 'Shall I move the low and medium priority ones to next week?'),
      accept: live() ? L('Revisar', 'Review') : L('Adiar', 'Move them'), action: live() ? { view: 'work' } : { snoozeLate: true } });
    var meal = (st.meals || []).filter(function (m) { return U.sameDay(m.date, now); })[0];
    if (meal && now.getHours() < 18) out.push({ id: 'meal-' + sod.toDateString(), ic: 'chef', title: L('Jantar: ', 'Dinner: ') + meal.title, body: L('Confiro os ingredientes que faltam?', 'Shall I check what ingredients we are missing?'), accept: L('Conferir', 'Check'), action: { open: { kind: 'meal', id: meal.title } } });
    if (now.getHours() >= 18 && st.chores && st.chores.some(function (c) { return !c.done; })) { var np = st.chores.filter(function (c) { return !c.done; }).length; out.push({ id: 'chores-' + sod.toDateString(), ic: 'star', title: L('Missões pendentes', 'Missions outstanding'), body: L(np + ' missões ainda não feitas hoje. Avisar as crianças?', np + ' missions still to do today. Shall I remind the children?'), accept: L('Avisar', 'Remind them'), action: { broadcast: { kind: 'family', icon: 'star', title: L('Hora de terminar as missões de hoje!', 'Time to finish today’s missions!') } } }); }
    return out.filter(function (s) { return !dismissed[s.id]; });
  }

  // conectado: o PlanKnect escreve o resumo falado (agenda, tarefas, deals, memória); os cartões continuam locais
  function getBriefing() {
    var b = briefingLocal(); if (!live()) return Promise.resolve(b);
    var from = U.startOfDay(new Date()), to = U.addDays(from, 7);
    return PK.api.aiBriefing({ lang: lang(), persona: 'alfred', from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) })
      .then(function (r) { if (r && r.reply) { b.server = r.reply; b.speech = greet(new Date().getHours()) + '. ' + r.reply; } return b; }).catch(function () { return b; });
  }
  function getSuggestions() {
    var loc = suggestionsLocal(); if (!live()) return Promise.resolve(loc);
    return PK.api.aiSuggestions({ lang: lang() }).then(function (r) {
      var srv = (r.suggestions || []).filter(function (s) { return !dismissed[s.id]; }).map(function (s) { s.server = true; s.ic = s.icon || s.ic; return s; });
      return srv.concat(loc);
    }).catch(function () { return loc; });
  }

  /* ---------- presença ---------- */
  function state(s, msg) {
    if (!el) return;
    el.setAttribute('data-st', s || 'idle'); if (orb) orb.state(s || 'idle');
    var st = el.querySelector('.al-status');
    if (st) st.textContent = msg || ({ idle: L('À sua disposição', 'At your service'), listen: L('Ouvindo…', 'Listening…'), think: L('Um momento…', 'One moment…'), talk: L('Falando', 'Speaking') }[s || 'idle']);
  }
  function speak(text) {
    if (!PK.settings.get('ai.voice')) return;
    PK.voice.speak(text, lang(), voiceHooks()); watch();
  }
  // se em 9 s nada tocou, mostra o motivo na tela (ex.: player da TV recusou)
  var watchT = null;
  function watch() {
    var p0 = PK.voice.debug().played; clearTimeout(watchT);
    watchT = setTimeout(function () { var d = PK.voice.debug(); if (d.played === p0 && el && el.getAttribute('data-st') !== 'talk') state('idle', L('Sem áudio: ', 'No audio: ') + (d.lastErr || L('sem resposta da voz', 'voice did not answer'))); }, 9000);
  }
  function voiceHooks() {
    return { start: function () { state('talk'); }, level: level, silent: function () { state('idle', L('Sem voz agora — confira a conexão com o PlanKnect', 'No voice just now — please check the PlanKnect connection')); }, end: function () { if (el && el.getAttribute('data-st') === 'talk') state('idle'); } };
  }
  function level(v) { // 0..1 → orbe e barras
    if (orb) orb.level(v);
    var bars = el && el.querySelectorAll('.al-wave i'); if (!bars) return;
    for (var i = 0; i < bars.length; i++) { var k = Math.abs(i - (bars.length - 1) / 2) / (bars.length / 2); bars[i].style.transform = 'scaleY(' + Math.max(0.12, v * (1.15 - k) * (0.7 + Math.random() * 0.6)) + ')'; }
  }

  /* ---------- tela ---------- */
  var TRY = [['Adiciona leite e pão na lista', 'Add milk and bread to the list'], ['O que tem hoje?', 'What’s on today?'], ['Sofia terminou de arrumar a cama', 'What’s for dinner?'],
    ['Nova tarefa ligar para o Paulo amanhã', 'New task call Paulo tomorrow'], ['Modo reunião', 'Meeting mode'], ['Mostrar o computador', 'Show my computer']];
  function build() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'kn' + (opt.compact ? ' compact' : ' overlay');
    el.setAttribute('data-st', 'idle');
    var wave = ''; for (var i = 0; i < (opt.compact ? 15 : 23); i++) wave += '<i></i>';
    el.innerHTML = '<div class="al-scene scene-host"></div><div class="al-shade"></div><div class="al-aura"></div>' +
      '<div class="al-wrap"><section class="al-left">' +
        '<div class="al-orb"><canvas class="al-cv" width="' + (opt.compact ? 300 : 520) + '" height="' + (opt.compact ? 300 : 520) + '"></canvas><span class="r1"></span><span class="r2"></span><span class="r3"></span><b></b></div>' +
        '<div class="al-wave">' + wave + '</div>' +
        '<div class="al-name"></div><div class="al-status"></div>' +
        '<div class="al-log"></div><div class="al-heard"></div><div class="al-reply"></div><div class="al-props"></div>' +
        (opt.compact ? '<div class="al-ask"><button class="al-mic focusable" data-al="listen">' + I.get('mic', 22) + '<span></span></button></div>' :
        '<div class="al-ask"><button class="al-mic focusable" data-al="listen">' + I.get('mic', 30) + '<span></span></button>' +
          '<input class="al-in focusable" type="text" autocomplete="off"><button class="al-send focusable" data-al="send">' + I.get('send', 26) + '</button></div>' +
        '<div class="al-phone"><div class="al-qr" id="al-qr"></div><div><b></b><span></span></div></div>') +
      '</section><section class="al-right"><div class="al-body"></div><div class="al-mem" id="al-mem"></div><div class="al-try"></div></section></div>' +
      '<button class="al-x focusable" data-al="close">' + I.get('x', opt.compact ? 22 : 30) + '</button>';
    opt.host.appendChild(el);
    var cv = el.querySelector('.al-cv');
    if (cv && cv.getContext && PK.settings.get('ai.particles') !== false) { orb = PK.orb(cv, opt.compact ? 220 : 440); el.classList.add('has-cv'); }
    el.addEventListener('click', onClick);
    var inp = el.querySelector('.al-in');
    if (inp) inp.addEventListener('keydown', function (e) { if (e.keyCode === 13) { command(inp.value); inp.value = ''; } });
  }
  function onClick(e) {
      var t = e.target.closest('button,[data-al-say]'); if (!t) { if (e.target === el && !docked) close(); return; }
      e.stopPropagation();
      var al = t.getAttribute('data-al'), say = t.getAttribute('data-al-say');
      if (al === 'close') return close();
      if (al === 'brief') return briefAloud();
      if (al === 'listen') return listen();
      if (al === 'send') { var inp = el.querySelector('.al-in'); command(inp.value); inp.value = ''; return; }
      if (say) return command(say);
      var go = t.getAttribute('data-al-go'); if (go) { var g = go.split('|'); close(); opt.navigate(g[0] === 'view' ? { view: g[1] } : { open: { kind: g[0], id: g[1] } }); return; }
      var fg = t.getAttribute('data-al-forget'); if (fg) { forget(fg); return; }
      var pp = t.getAttribute('data-al-prop'); if (pp) { var q = pp.split('|'); decide(q[0], q[1]); return; }
      var yes = t.getAttribute('data-kn-yes'), no = t.getAttribute('data-kn-no');
      if (no) { dismissed[no] = Date.now(); U.store.set('aiDismissed', dismissed); remove(no); if (live() && current.some(function (x) { return x.id === no && x.server; })) PK.api.aiAct(no, 'dismiss').catch(function () {}); }
      if (yes) act(current.filter(function (s) { return s.id === yes; })[0]);
  }

  /* ---------- Alfred acoplado (ex.: em volta do computador no modo Computador) ----------
   * Usa os mesmos nomes de classe da tela cheia, então ouvir/responder/propostas funcionam iguais. */
  function dock(host) {
    if (docked) undock();
    build();
    var wave = ''; for (var i = 0; i < 13; i++) wave += '<i></i>';
    mini = document.createElement('div'); mini.className = 'kn-dock'; mini.setAttribute('data-st', 'idle');
    mini.innerHTML = '<div class="kd-orb"><canvas class="al-cv" width="240" height="240"></canvas></div>' +
      '<div class="kd-main"><div class="kd-top"><b class="al-name"></b><span class="al-status"></span></div><div class="al-wave">' + wave + '</div>' +
      '<div class="al-log"></div><div class="al-heard"></div><div class="al-reply"></div><div class="al-props"></div></div>' +
      '<div class="kd-ctl"><button class="al-mic focusable" data-al="listen">' + I.get('mic', 24) + '<span></span></button><button class="kd-b focusable" data-al="brief">' + I.get('sparkle', 22) + '<span></span></button></div>';
    host.appendChild(mini); mini.addEventListener('click', onClick);
    fullEl = el; fullOrb = orb; el = mini; docked = true;
    var cv = mini.querySelector('.al-cv'); orb = cv.getContext && PK.settings.get('ai.particles') !== false ? PK.orb(cv, 160) : null; if (orb) orb.start();
    mini.querySelector('.al-name').textContent = name();
    mini.querySelector('.al-mic span').textContent = L('Falar', 'Speak'); mini.querySelector('.kd-b span').textContent = L('Resumo', 'Briefing');
    state('idle');
  }
  function undock() {
    if (!docked) return;
    stopListen(); PK.voice.stop(); if (orb) orb.stop();
    if (mini && mini.parentNode) mini.parentNode.removeChild(mini);
    el = fullEl; orb = fullOrb; mini = null; docked = false;
  }
  function briefAloud() {
    state('think');
    getBriefing().then(function (b) {
      var box = el.querySelector('.al-reply'); box.textContent = b.title || ''; box.className = 'al-reply show';
      if (el.getAttribute('data-st') === 'think') state('idle');
      speak(b.speech || b.title || '');
    });
  }
  function texts() {
    el.querySelector('.al-name').textContent = name();
    var mic = el.querySelector('.al-mic span'); if (mic) mic.textContent = L('Falar', 'Speak');
    var inp = el.querySelector('.al-in'); if (inp) inp.placeholder = L('Ou digite: “adiciona café na lista”', 'Or type: “add coffee to the list”');
    var ph = el.querySelector('.al-phone b'); if (ph) { ph.textContent = L('Fale pelo celular', 'Speak from your phone'); el.querySelector('.al-phone span').textContent = L('Aponte a câmera, segure e fale', 'Scan, hold and speak'); }
    el.querySelector('.al-try').innerHTML = '<div class="al-h2">' + L('Experimente dizer', 'Try saying') + '</div><div class="al-chips">' + TRY.slice(0, opt.compact ? 3 : 4).map(function (x) { var s = EN() ? x[1] : x[0]; return '<button class="al-chip focusable" data-al-say="' + esc(s) + '">“' + esc(s) + '”</button>'; }).join('') + '</div>';
    state('idle');
  }
  // mostra na hora o resumo local e as sugestões locais; o texto do PlanKnect (IA, alguns segundos) entra quando chegar
  function draw(b, sg) {
    var body = el.querySelector('.al-body'), need = attention(); current = sg;
    body.innerHTML = '<div class="al-h">' + esc(b.title || '') + '</div>' + needHtml(need) + (b.server ? '<p class="al-srv">' + I.get('sparkle', 22) + esc(b.server) + '</p>' : '<p class="al-srv wait" style="display:none"></p>') + '<div class="al-brief">' + (b.lines || []).slice(0, need.length || b.server ? 2 : (opt.compact ? 4 : 6)).map(function (l) {
        return '<div class="al-l">' + I.get(l.ic, opt.compact ? 22 : 32) + '<div><b>' + esc(l.t) + '</b>' + (l.s ? '<span>' + esc(l.s) + '</span>' : '') + '</div></div>'; }).join('') + '</div>' +
      '<div class="al-h2">' + (sg.length ? L('Sugestões do ' + name(), name() + ' suggests') : L('Nada pendente — tudo em ordem', 'Nothing pending — all in order')) + '</div>' +
      '<div class="al-sug">' + sg.slice(0, opt.compact ? 2 : 3).map(card).join('') + '</div>';
    drawMemory();
    if (opt.focus) opt.focus(el);
    return need;
  }
  function refresh(talk) {
    var b = briefingLocal(), sg = suggestionsLocal(), spoken = false, need = draw(b, sg);
    var say = function (text) { if (!talk || spoken) return; spoken = true; speak((need.length ? L('Antes de tudo: ', 'Before anything else: ') + need.map(function (n) { return n.say; }).join(' ') + ' ' : '') + text); };
    loadMemory();
    if (!live()) { say(b.speech || ''); return; }
    state('think', L('Consultando o PlanKnect…', 'Consulting PlanKnect…'));
    var fallback = setTimeout(function () { say(b.speech || ''); }, 4000); // IA demorando: fala o resumo local
    getBriefing().then(function (rb) {
      if (!el.classList.contains('on') && !docked) return;
      if (el.getAttribute('data-st') === 'think') state('idle');
      if (rb.server) { b = rb; need = draw(b, current); clearTimeout(fallback); say(rb.speech); }
    });
    getSuggestions().then(function (all) { if (all.some(function (x) { return x.server; })) draw(b, all); });
  }
  function card(s) {
    return '<div class="al-c' + (s.tone ? ' ' + s.tone : '') + '" data-kn="' + esc(s.id) + '"><div class="al-ct">' + I.get(s.ic || 'sparkle', opt.compact ? 20 : 28) + '<div><b>' + esc(s.title) + '</b><span>' + esc(s.body) + '</span></div></div>' +
      '<div class="al-cb"><button class="al-yes focusable" data-kn-yes="' + esc(s.id) + '">' + esc(s.accept || L('Aceitar', 'Accept')) + '</button><button class="al-no focusable" data-kn-no="' + esc(s.id) + '">' + L('Agora não', 'Not now') + '</button></div></div>';
  }
  function open(why) {
    build(); texts();
    el.querySelector('.al-heard').textContent = ''; var rp = el.querySelector('.al-reply'); rp.textContent = ''; rp.className = 'al-reply';
    el.classList.add('on'); el.classList.add('active'); document.body.classList.add('alfred-on'); if (orb) orb.start();
    var sc = PK.settings.get('ai.scene') || 'library-warm', sh = el.querySelector('.al-scene');
    if (sh && PK.scenes && sc !== 'none' && sh.getAttribute('data-s') !== sc) { sh.innerHTML = ''; PK.scenes.mount(sh, sc); sh.setAttribute('data-s', sc); }
    log = []; el.querySelector('.al-log').innerHTML = '';
    var phone = el.querySelector('.al-phone'); if (phone) phone.style.display = PK.config.remoteReady ? '' : 'none';
    if (!opt.compact && window.QRCode && PK.config.remoteUrl && PK.config.remoteReady) { var q = el.querySelector('#al-qr'); q.innerHTML = ''; try { new window.QRCode(q, { text: PK.config.remoteUrl, width: 112, height: 112, colorDark: '#0b1230', colorLight: '#ffffff' }); } catch (e) {} }
    refresh(why !== 'silent' && why !== 'listen');
    if (why === 'listen') setTimeout(listen, 350);
  }
  function close() {
    if (docked) { stopListen(); return; } // acoplado: não fecha, só para de ouvir
    stopListen(); PK.voice.stop();
    if (el) { el.classList.remove('on'); el.classList.remove('active'); } if (orb) orb.stop();
    document.body.classList.remove('alfred-on');
    if (opt.onClose) opt.onClose();
  }
  function remove(id) { var c = el.querySelector('[data-kn="' + id + '"]'); if (c) c.parentNode.removeChild(c); if (opt.focus) opt.focus(el); }
  function act(s) {
    if (!s) return;
    var a = s.action || {};
    dismissed[s.id] = Date.now(); U.store.set('aiDismissed', dismissed); remove(s.id);
    if (live() && s.server) {
      PK.api.aiAct(s.id, 'accept').then(function (r) {
        var acts = (r && r.actions) || [];
        if (acts.some(function (x) { return x.type === 'navigate'; })) close();
        if (opt.applyActions) opt.applyActions(acts); else if (s.action && s.action.view) opt.navigate({ view: s.action.view });
        if (r && r.reply) reply({ reply: r.reply });
      }).catch(function (e) { PK.toast(PK.writeErr(e)); });
      return;
    }
    if (a.broadcast) PK.data.broadcast(a.broadcast).then(function () { reply({ reply: L('Avisei a família.', 'I have let the family know.'), en: 'I have let the family know.' }); });
    if (a.snoozeLate && !live()) {
      var st = S(), sod = U.startOfDay(new Date()), next = U.addDays(sod, 7).toISOString().slice(0, 10);
      var list = (st.tasks || []).filter(function (t) { return t.status !== 'done' && t.due && t.due < sod && t.priority !== 'high'; });
      Promise.all(list.map(function (t) { return PK.data.updateTask(t.id, { due: next }); })).then(function () { reply({ reply: list.length + ' tarefas adiadas para a próxima semana.', en: 'I have moved ' + list.length + ' tasks to next week.' }); if (opt.refresh) opt.refresh(); });
    }
    if (a.open || a.view) { close(); opt.navigate(a); }
  }

  /* ---------- conversa ---------- */
  function looksEnglish(s) { return !/[ãõçáéíóúâêô]|\b(você|voces|não|na lista|tarefa|hoje|amanhã|está|para o|para a)\b/i.test(s); }
  function reply(r) {
    if (r.heard) el.querySelector('.al-heard').textContent = '“' + r.heard + '”';
    if (r.remembered && r.remembered.length) loadMemory();
    drawProposals(r.proposals || []);
    var txt = (EN() && r.en) ? r.en : (r.reply || L('Feito.', 'Done.'));
    var box = el.querySelector('.al-reply'); box.textContent = txt; box.className = 'al-reply show';
    var said = txt;
    if (EN() && !r.en && !looksEnglish(txt)) said = ACK[Math.floor(Math.random() * ACK.length)]; // resposta veio em PT: fala só uma confirmação britânica
    if (r.audio && PK.settings.get('ai.voice')) { PK.voice.playAudio(r.audio, r.audio_mime || r.mime, voiceHooks(), said, lang()); watch(); } else speak(said);
    if (el.getAttribute('data-st') === 'think') state('idle');
  }
  function command(text) {
    text = (text || '').trim(); if (!text || busy || !opt.command) return;
    stopListen(); PK.voice.stop(); pushLog();
    el.querySelector('.al-heard').textContent = '“' + text + '”';
    if (!live() && memoryIntent(text)) return;
    drawProposals([]);
    busy = true;
    var box = el.querySelector('.al-reply'); box.textContent = ''; box.className = 'al-reply';
    state('think');
    var pr; try { pr = opt.command(text, { lang: lang() }); } catch (err) { pr = Promise.reject(err); }
    pr.then(function (r) { busy = false; reply(r || {}); })
      .catch(function (e) { busy = false; state('idle'); box.textContent = L('Desculpe, não consegui: ', 'I do beg your pardon — ') + ((e && e.message) || ''); box.className = 'al-reply show err'; });
  }


  /* ---------- histórico da conversa (últimas trocas, apagadas) ---------- */
  function pushLog() {
    var h = el.querySelector('.al-heard').textContent, r = el.querySelector('.al-reply').textContent;
    if (h || r) log.push([h, r]); log = log.slice(-2);
    el.querySelector('.al-log').innerHTML = log.map(function (x) { return '<div><i>' + esc(x[0]) + '</i>' + (x[1] ? '<span>' + esc(x[1]) + '</span>' : '') + '</div>'; }).join('');
  }

  /* ---------- "Precisa de você" (como o painel Needs Attention do jarvis) ---------- */
  function ago(ms) { var m = Math.round(Math.abs(ms) / 60000); return m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + L(' dias', ' days'); }
  function attention() {
    var st = S(), now = new Date(), sod = U.startOfDay(now), out = [];
    var mt = st.events.filter(function (e) { return !e.allDay && (e.type === 'meeting' || e.video) && e.end > now && e.start - now < 15 * 60000; })[0];
    if (mt) { var on = mt.start <= now; out.push({ ic: 'video', t: title(mt), s: on ? L('acontecendo agora', 'happening now') : L('começa em ', 'starts in ') + ago(mt.start - now), go: 'event|' + mt.id,
      say: on ? L(title(mt) + ' já começou.', title(mt) + ' has already begun.') : L(title(mt) + ' começa em ' + ago(mt.start - now) + '.', title(mt) + ' begins in ' + ago(mt.start - now) + '.') }); }
    var hi = (st.tasks || []).filter(function (t) { return t.status !== 'done' && /high|urgent/.test(t.priority) && t.due && t.due < U.addDays(sod, 1); })[0];
    if (hi) out.push({ ic: 'task', t: hi.title, s: hi.due < sod ? L('atrasada há ', 'overdue by ') + ago(now - hi.due) : L('vence hoje', 'due today'), go: 'task|' + hi.id,
      say: L('A tarefa ' + hi.title + ' é urgente.', 'The task ' + hi.title + ' is urgent.') });
    var bl = (st.lists || []).filter(function (l) { return /payment|pagamento|conta/i.test(l.name); })[0];
    var bill = bl && bl.items.filter(function (it) { return !it.done && it.due && new Date(it.due) < U.addDays(sod, 1); })[0];
    if (bill) out.push({ ic: 'card', t: bill.title, s: new Date(bill.due) < sod ? L('conta vencida', 'bill overdue') : L('conta vence hoje', 'bill due today'), go: 'view|lists',
      say: L('A conta ' + bill.title + ' vence hoje.', bill.title + ' falls due today.') });
    return out.slice(0, opt.compact ? 1 : 2);
  }
  function needHtml(need) {
    if (!need.length) return '';
    return '<div class="al-need"><div class="al-need-h"><i></i>' + L('Precisa de você', 'Needs your attention') + '</div>' + need.map(function (n) {
      return '<div class="al-need-i">' + I.get(n.ic, opt.compact ? 18 : 26) + '<div><b>' + esc(n.t) + '</b><span>' + esc(n.s) + '</span></div><button class="al-go focusable" data-al-go="' + esc(n.go) + '">' + L('Abrir', 'Open') + '</button></div>'; }).join('') + '</div>';
  }

  /* ---------- memória ("lembra que…", como a memória em Markdown do jarvis) ---------- */
  function saveLocal() { U.store.set('aiMemory', memory.slice(-50)); }
  function loadMemory() {
    if (!live()) return;
    PK.api.aiMemory().then(function (r) { if (r && r.items) { memory = r.items.map(function (m) { return { id: m.id, text: m.text, at: m.created_at || m.at }; }); memory.server = true; saveLocal(); drawMemory(); } }).catch(function () {});
  }
  function drawMemory() {
    var box = el && el.querySelector('#al-mem'); if (!box) return;
    box.innerHTML = memory.length ? '<div class="al-h2">' + L(name() + ' lembra', name() + ' remembers') + ' · ' + memory.length + '</div><div class="al-chips">' +
      memory.slice(-3).reverse().map(function (m) { return '<span class="al-memo">' + I.get('note', 18) + esc(m.text) + '</span>'; }).join('') + '</div>' : '';
  }
  function memoryIntent(text) {
    var m;
    if ((m = text.match(/^(?:alfred[,\s]+)?(?:lembr[ae](?:-se)?|lembrar|anota(?:r)?|remember|note)\s+(?:que\s+|that\s+|de\s+)?(.+)/i))) {
      var t = m[1].replace(/[.!]+$/, '').trim(), item = { id: 'm' + Date.now(), text: t.charAt(0).toUpperCase() + t.slice(1), at: new Date().toISOString() };
      memory.push(item); saveLocal(); drawMemory();
      if (live()) PK.api.aiRemember(item.text).then(function (r) { if (r && r.id) item.id = r.id; saveLocal(); }).catch(function () {});
      reply({ reply: 'Pode deixar, vou lembrar: ' + item.text + '.', en: 'Very good. I shall remember that ' + t + '.' }); return true;
    }
    if (/(o que (voce|você) lembra|what do you remember|o que (voce|você) sabe)/i.test(text)) {
      reply(memory.length ? { reply: 'Eu lembro que: ' + memory.slice(-5).map(function (x) { return x.text; }).join('; ') + '.', en: 'I recall the following: ' + memory.slice(-5).map(function (x) { return x.text; }).join('; ') + '.' }
        : { reply: 'Ainda não guardei nada. Diga "lembra que…".', en: 'I have nothing noted as yet. Simply say: remember that…' }); return true;
    }
    if ((m = text.match(/^(?:esquec[ea]|esqueça|forget)\s+(?:que\s+|that\s+|about\s+|de\s+)?(.+)/i))) {
      var q = PK.assistant ? PK.assistant.norm(m[1]) : m[1].toLowerCase();
      var hit = memory.filter(function (x) { return (PK.assistant ? PK.assistant.norm(x.text) : x.text.toLowerCase()).indexOf(q.slice(0, 12)) >= 0; })[0];
      if (hit) { forget(hit.id, true); reply({ reply: 'Esqueci: ' + hit.text + '.', en: 'Consider it forgotten.' }); }
      else reply({ reply: 'Não encontrei isso na memória.', en: 'I am afraid I have nothing of the sort noted.' });
      return true;
    }
    return false;
  }
  function forget(id, quiet) {
    memory = memory.filter(function (x) { return x.id !== id; }); saveLocal(); drawMemory();
    if (live()) PK.api.aiForget(id).catch(function () {});
  }


  /* ---------- propostas: o Alfred sugere, você confirma (nada é gravado antes) ---------- */
  var KIND_IC = { create_task: 'task', complete_task: 'check', add_list_items: 'cart' };
  function drawProposals(list) {
    var box = el && el.querySelector('.al-props'); if (!box) return;
    box.innerHTML = list.map(function (p) {
      return '<div class="al-prop" data-prop="' + esc(p.id) + '">' + I.get(KIND_IC[p.kind] || 'sparkle', opt.compact ? 18 : 26) + '<span>' + esc(p.summary || p.kind) + '</span>' +
        '<button class="al-ok focusable" data-al-prop="' + esc(p.id) + '|confirm" data-autofocus>' + L('Confirmar', 'Confirm') + '</button>' +
        '<button class="al-cancel focusable" data-al-prop="' + esc(p.id) + '|dismiss">' + L('Cancelar', 'Cancel') + '</button></div>';
    }).join('');
    if (list.length && opt.focus) opt.focus(el);
  }
  function decide(id, action) {
    var row = el.querySelector('[data-prop="' + id + '"]'); if (row) row.classList.add('busy');
    state('think');
    PK.api.proposal(id, action).then(function (r) {
      if (row && row.parentNode) row.parentNode.removeChild(row);
      reply({ reply: r.reply || (action === 'confirm' ? L('Feito.', 'Done.') : L('Cancelado.', 'Very well, cancelled.')), audio: r.audio, audio_mime: r.audio_mime });
      if (opt.applyActions) opt.applyActions(r.actions || [{ type: 'refresh' }]);
      if (opt.focus) opt.focus(el);
    }).catch(function (e) {
      if (row) row.classList.remove('busy'); state('idle');
      var m = e && e.message || '', box = el.querySelector('.al-reply');
      box.textContent = /409|expir|handled/i.test(m) ? L('Essa sugestão expirou — peça de novo.', 'That suggestion has expired — do ask me again.') : PK.writeErr(e);
      box.className = 'al-reply show err';
      if (/409|expir|handled/i.test(m) && row && row.parentNode) row.parentNode.removeChild(row);
    });
  }

  /* ---------- ouvir ---------- */
  function listen() {
    if (el.getAttribute('data-st') === 'listen') { stopListen(); state('idle'); return; }
    PK.voice.stop();
    if (PK.assistant && PK.assistant.canListen()) {
      state('listen'); fakeLevel(true);
      PK.assistant.listen({
        lang: PK.settings.get('ai.listenLang') || 'pt-BR',
        onPartial: function (t) { el.querySelector('.al-heard').textContent = '“' + t + '”'; },
        onFinal: function (t) { fakeLevel(false); command(t); },
        onError: function (e) { fakeLevel(false); state('idle', e === 'not-allowed' ? L('Sem permissão para o microfone', 'I’m not permitted to use the microphone') : L('Não ouvi nada — tente de novo', 'I didn’t quite catch that — do try again')); },
        onEnd: function () { fakeLevel(false); if (el.getAttribute('data-st') === 'listen') state('idle'); }
      });
      return;
    }
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) { recordUsb(); return; }
    noMic();
  }
  function noMic() {
    state('idle', PK.tv && PK.tv.isTizen ? L('A Samsung não libera o microfone do controle — ligue uma webcam USB com microfone na TV', 'The Samsung remote mic isn’t available to apps — plug a USB webcam with a microphone into the TV')
      : L('Sem microfone aqui — digite o pedido', 'No microphone here — do type your request'));
    if (opt.compact && opt.speak) opt.speak();
    var inp = el.querySelector('.al-in'); if (inp && PK.nav) PK.nav.focus(inp);
  }
  /* Microfone USB / câmera da TV: grava em WAV (arquivo completo, como o PlanKnect pede) até 6 s ou 1,2 s de
   * silêncio depois da fala, e manda ao /assistant, que transcreve (detecta o idioma) e devolve heard + propostas. */
  function wav(chunks, rate) {
    var len = 0; chunks.forEach(function (c) { len += c.length; });
    var target = 16000, ratio = rate / target, n = Math.floor(len / ratio), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), all = new Float32Array(len), o = 0;
    chunks.forEach(function (c) { all.set(c, o); o += c.length; });
    var w = function (off, str) { for (var i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, target, true); v.setUint32(28, target * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, all[Math.floor(i * ratio)])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    var bin = '', bytes = new Uint8Array(buf); for (var k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return btoa(bin);
  }
  function recordUsb() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { noMic(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      state('listen');
      var ctx = new AC(), src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), chunks = [], quiet = 0, heard = false, t0 = Date.now();
      var stopIt = function () {
        if (!rec) return; rec = null; clearTimeout(recT);
        try { proc.disconnect(); src.disconnect(); } catch (e) {} stream.getTracks().forEach(function (t) { t.stop(); }); level(0);
        var rate = ctx.sampleRate; if (ctx.close) ctx.close();
        if (!heard || !chunks.length) { state('idle', L('Não ouvi nada — tente de novo', 'I didn’t quite catch that — do try again')); return; }
        if (!live()) { state('idle', L('Gravei! Transcrever a voz precisa do PlanKnect conectado', 'Recorded — transcription needs PlanKnect connected')); return; }
        state('think');
        PK.api.assistantAudio(wav(chunks, rate), 'audio/wav', { lang: lang(), listenLang: PK.settings.get('ai.listenLang') || 'pt-BR' }).then(function (res) {
          if (res.heard || res.text) el.querySelector('.al-heard').textContent = '“' + (res.heard || res.text) + '”';
          if (opt.applyActions && !(res.needs_confirmation || (res.proposals || []).length)) opt.applyActions(res.actions || []);
          reply(res);
        }).catch(function (e) { state('idle', PK.writeErr(e)); });
      };
      rec = { state: 'recording', stop: stopIt };
      proc.onaudioprocess = function (e) {
        var d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d));
        var pk = 0; for (var i = 0; i < d.length; i += 8) pk = Math.max(pk, Math.abs(d[i]));
        var v = Math.min(1, pk * 2.2); level(v);
        if (v > 0.12) { heard = true; quiet = 0; } else if (heard && (quiet += d.length / ctx.sampleRate * 1000) > 1200) stopIt();
        if (Date.now() - t0 > 6000) stopIt();
      };
      src.connect(proc); proc.connect(ctx.destination);
      recT = setTimeout(stopIt, 6500);
    }).catch(function () { noMic(); });
  }
  function fakeLevel(on) { clearInterval(levelT); if (on) levelT = setInterval(function () { level(0.35 + Math.random() * 0.5); }, 110); else level(0); }
  function stopListen() {
    clearTimeout(recT); clearInterval(levelT); if (el) level(0);
    try { if (PK.assistant) PK.assistant.stop(); } catch (e) {}
    if (rec && rec.state === 'recording') { try { rec.stop(); } catch (e) {} } rec = null;
  }

  /* ---------- proativo ---------- */
  function tick() {
    if (PK.noAuto) return;
    var h = new Date().getHours(), key = U.startOfDay(new Date()).toDateString();
    var moment = h >= 6 && h < 11 ? 'morning' : h >= 18 && h < 21 ? 'evening' : null;
    if (moment && shownDay[moment] !== key && opt.canInterrupt()) { shownDay[moment] = key; U.store.set('aiBriefDay', shownDay); open(); }
  }

  function init(o) { opt = o; build(); setInterval(tick, 60000); setTimeout(tick, 8000); }
  return { init: init, open: function (w) { open(w); }, close: close, name: name,
    listen: function () { if (docked || el.classList.contains('on')) listen(); else open('listen'); },
    dock: dock, undock: undock, docked: function () { return docked; },
    // resposta que chegou pelo celular: mostra (e fala) no Alfred, com Confirmar/Cancelar se houver proposta
    remote: function (r) { if (!docked && !el.classList.contains('on')) open('silent'); if (r.heard || r.text) el.querySelector('.al-heard').textContent = '📱 “' + (r.heard || r.text) + '”'; reply(r); },
    isOpen: function () { return !!(el && el.classList.contains('on')); } };
})();
