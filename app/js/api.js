/* Camada de dados.
 *  PK.api     -> cliente real do PlanKnect (contrato em docs/PLANKNECT_TV_API.md)
 *  PK.mock    -> dados de demonstração (mesma interface, com escrita local)
 *  PK.data    -> o que o app usa (api ou mock, conforme o modo)
 *  PK.weather -> Open-Meteo (sem chave)
 */
var PK = window.PK || {};
window.PK = PK;

/* ---------------- normalização ---------------- */
PK.normalize = (function () {
  var U = PK.util;
  function event(e) {
    return {
      id: e.id, title: e.title, type: e.type || 'event',
      start: U.toDate(e.start), end: U.toDate(e.end || e.start), allDay: !!e.allDay,
      members: e.members || [], location: e.location || '', video: e.video || null,
      color: e.color || null, private: !!e.private, boardId: e.boardId || null, projectId: e.projectId || null, organizationId: e.organizationId || null
    };
  }
  function task(t) {
    return {
      id: t.id, title: t.title, project: t.project || '', projectId: t.projectId || null,
      priority: t.priority || 'medium', due: U.toDate(t.due), assignee: t.assignee || null,
      status: t.status || 'open', boardId: t.boardId || null, assigneeFamilyMemberId: t.assigneeFamilyMemberId || null, assignees: t.assignees || null, url: t.url || null, org: t.org || null, projectId: t.projectId || null, project: t.project || '', description: t.description || ''
    };
  }
  // Um membro por pessoa: se o PlanKnect mandar duplicados (mesmo nome), junta os ids
  function dedupe(b) {
    var seen = {}, alias = {}, out = [];
    (b.members || []).forEach(function (m) {
      var k = String(m.name || '').trim().toLowerCase();
      if (seen[k]) { alias[m.id] = seen[k].id; return; }
      seen[k] = m; out.push(m);
    });
    var fix = function (id) { return alias[id] || id; };
    (b.events || []).forEach(function (e) { if (e.members) e.members = e.members.map(fix).filter(function (x, i, a) { return a.indexOf(x) === i; }); });
    (b.chores || []).forEach(function (c) { c.member = fix(c.member); });
    (b.tasks || []).forEach(function (t) { if (t.assignee) t.assignee = fix(t.assignee); });
    b.members = out;
    return b;
  }
  /* Calendário da família: o que o PlanKnect definiu (family_calendar), senão a organização onde estão os
   * membros da família — nunca simplesmente a primeira organização da lista. */
  function familyCalendar(b) {
    var orgs = b.organizations || [], byId = function (id) { return orgs.filter(function (o) { return o.id === id; })[0]; };
    var fc = b.family_calendar || b.familyCalendar || (b.settings && (b.settings.family_calendar_id || b.settings.familyCalendarId));
    if (fc) { var f = typeof fc === 'object' ? fc : byId(fc); if (f) return { id: f.id, name: f.name, timezone: f.timezone || (b.household && b.household.timezone), location: b.household && b.household.location }; }
    var count = {}; (b.members || []).forEach(function (m) { if (m.organizationId) count[m.organizationId] = (count[m.organizationId] || 0) + 1; });
    var top = Object.keys(count).sort(function (x, y) { return count[y] - count[x]; })[0];
    var hh = b.household;
    if (top && (!hh || hh.id !== top) && byId(top)) { var o = byId(top); return { id: o.id, name: o.name, timezone: o.timezone || (hh && hh.timezone), location: hh && hh.location }; }
    return hh || { name: 'Família' };
  }
  // período da missão: horário, se vier; senão pelo nome (inglês ou português)
  function choreperiod(c) {
    if (c.due && /T(\d\d)/.test(c.due)) { var h = +RegExp.$1; return h < 12 ? 'manhã' : h < 18 ? 'tarde' : 'noite'; }
    var t = String(c.title || '').toLowerCase();
    if (/morning|breakfast|uniform(?! off)|get changed|hair|car at|school|manh|caf[eé] da manh|escova.*manh|cama|bed/.test(t)) return 'manhã';
    if (/evening|night|dinner|shower|bath|pajama|bedtime|noite|jantar|banho|pijama/.test(t)) return 'noite';
    return 'tarde';
  }
  function localKey(d) { var x = d instanceof Date ? d : new Date(d); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); }
  // cor fixa por projeto (o PlanKnect não manda cor): mesma cor em todas as telas
  var PCOL = ['#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#22d3ee', '#fb923c', '#a3e635', '#e879f9', '#f87171', '#2dd4bf', '#818cf8'];
  function projColors(list) {
    list.forEach(function (p) { if (!p.color) { var h = 0; String(p.id || p.name).split('').forEach(function (c) { h = (h * 33 + c.charCodeAt(0)) >>> 0; }); p.color = PCOL[h % PCOL.length]; } });
    return list;
  }
  /* Quadro pessoal de cada pessoa (memberDestinations): tarefas e eventos desse quadro são dela */
  function personal(b, out) {
    var dests = b.memberDestinations || [], byBoard = {};
    out.members.forEach(function (m) {
      var d = dests.filter(function (x) { return (x.familyMemberId && x.familyMemberId === m.familyMemberId) || (x.userId && x.userId === m.id); })[0];
      if (d) { m.dest = { boardId: d.boardId, projectId: d.projectId, organizationId: d.organizationId, userId: d.userId || null }; (byBoard[d.boardId] = byBoard[d.boardId] || []).push(m.id); }
    });
    out.tasks.forEach(function (t) {
      if (!t.assignee && t.assigneeFamilyMemberId) { var fm = out.members.filter(function (m) { return m.familyMemberId === t.assigneeFamilyMemberId; })[0]; if (fm) t.assignee = fm.id; }
    });
    out.tasks.forEach(function (t) { var who = byBoard[t.boardId]; if (who) { t.personal = who; if (!t.assignee && who.length === 1) t.assignee = who[0]; } });
    out.events.forEach(function (e) { var who = byBoard[e.boardId]; if (who) { e.personal = who; who.forEach(function (id) { if (e.members.indexOf(id) < 0) e.members.push(id); }); } });
    return out;
  }
  function bundle(b) {
    b = dedupe(b);
    var out = personal(b, bundle0(b)), today = localKey(new Date());
    // mesmo compromisso para várias pessoas (ex.: "Swimming class" do Wesley e da Lara) → um só, com todos
    var seenEv = {}; out.events = out.events.filter(function (e) {
      if (!e.members.length) return true;
      var k = (e.title || '').toLowerCase() + '|' + (e.start && e.start.getTime()) + '|' + (e.end && e.end.getTime());
      var f = seenEv[k]; if (!f) { seenEv[k] = e; return true; }
      e.members.forEach(function (id) { if (f.members.indexOf(id) < 0) f.members.push(id); }); (f.sameAs = f.sameAs || []).push(e.id); return false;
    });
    out.choresAll = out.chores; // todas (próximos dias também) — a agenda usa
    out.chores = out.chores.filter(function (c) { return !c.due || String(c.due).slice(0, 10) === today; }); // missões de hoje
    return out;
  }
  function bundle0(b) {
    return {
      household: familyCalendar(b),
      members: (b.members || []).map(function (m) { if (!m.initial) m.initial = String(m.name || '?').trim().charAt(0).toUpperCase(); m.photo = m.photo || m.photoUrl || m.avatar || null; if (!m.color) m.color = '#7c5cff'; return m; }),
      events: (b.events || []).map(event).sort(function (a, c) { return a.start - c.start; }),
      projects: projColors(b.projects || []),
      tasks: (b.tasks || []).map(task).map(function (t) { var p = (b.projects || []).filter(function (x) { return x.id === t.projectId; })[0]; if (p) { t.projectColor = p.color; t.org = t.org || p.org; t.projectStatus = p.status; } return t; }),
      settings: b.settings || {}, capabilities: b.capabilities || {},
      chores: (b.chores || []).map(function (c) {
        var m = (b.members || []).filter(function (x) { return x.familyMemberId && x.familyMemberId === c.member; })[0];
        var st = String(c.status || '').toLowerCase();
        c.familyMemberId = c.member; if (m) c.member = m.id;
        c.pending = !!(c.pendingApproval || c.pending_approval || /submit|pending|await|review/.test(st));
        if (!c.period) c.period = choreperiod(c);
        return c;
      }),
      lists: b.lists || [],
      meals: (b.meals || []).map(function (m) { var c = {}; for (var k in m) c[k] = m[k]; c.date = U.toDate(m.date); return c; }),
      notes: (b.notes || []).map(function (n) { var c = {}; for (var k in n) c[k] = n[k]; c.at = U.toDate(n.at); return c; }),
      photos: (b.photos || []).map(function (p) { var c = {}; for (var k in p) c[k] = p[k]; c.takenAt = U.toDate(p.takenAt); return c; }),
      watch: b.watch || { items: [], movieNight: null },
      devices: b.devices || [],
      fetchedAt: new Date()
    };
  }
  return { bundle: bundle };
})();

/* ---------------- cliente real ---------------- */
PK.api = (function () {
  var U = PK.util, C = PK.config;

  function deviceId() {
    var id = U.store.get('deviceId');
    if (!id) { id = 'tv-' + U.uid() + U.uid(); U.store.set('deviceId', id); }
    return id;
  }
  function tokens() { return U.store.get('tokens', null); }
  function saveTokens(t) {
    U.store.set('tokens', {
      access: t.access_token, refresh: t.refresh_token,
      exp: Date.now() + (t.expires_in || 3600) * 1000, household: t.household || null
    });
  }
  function raw(method, path, body, auth) {
    var h = { 'Content-Type': 'application/json', 'X-Device-Id': deviceId() };
    var t = tokens();
    if (auth !== false && t) h.Authorization = 'Bearer ' + t.access;
    return fetch(C.apiBase + path.replace(/^\/api\/tv/, ''), { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (txt) {
          var json = null; try { json = txt ? JSON.parse(txt) : null; } catch (e) {}
          return { status: r.status, ok: r.ok, json: json };
        });
      });
  }
  var refreshing = null;
  function refresh() {
    var t = tokens();
    if (!t || !t.refresh) return Promise.reject(new Error('unauthorized'));
    if (!refreshing) {
      refreshing = raw('POST', '/api/tv/token/refresh', { refresh_token: t.refresh }, false).then(function (r) {
        refreshing = null;
        if (!r.ok) { U.store.del('tokens'); throw new Error('unauthorized'); }
        saveTokens(r.json);
      }, function (e) { refreshing = null; throw e; });
    }
    return refreshing;
  }
  function req(method, path, body) {
    var t = tokens();
    var pre = t && t.exp - Date.now() < 60000 ? refresh() : Promise.resolve();
    return pre.then(function () { return raw(method, path, body); }).then(function (r) {
      if (r.status === 401) return refresh().then(function () { return raw(method, path, body); });
      return r;
    }).then(function (r) {
      if (r.status === 401) throw new Error('unauthorized');
      if (!r.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      return r.json;
    });
  }

  /* --- Login por QR (RFC 8628) --- */
  function startDeviceAuth(info) {
    return raw('POST', '/api/tv/device/code', { device_id: deviceId(), device_name: info.name, model: info.model }, false)
      .then(function (r) {
        if (!r.ok || !r.json) throw new Error('Não consegui falar com o PlanKnect (HTTP ' + r.status + ')');
        return r.json;
      });
  }
  function pollDeviceAuth(deviceCode) {
    return raw('POST', '/api/tv/device/token', { device_code: deviceCode, device_id: deviceId() }, false).then(function (r) {
      if (r.ok && r.json && r.json.access_token) { saveTokens(r.json); return { status: 'approved' }; }
      var err = r.json && r.json.error;
      if (err === 'authorization_pending' || err === 'slow_down') return { status: err };
      if (err === 'expired_token') return { status: 'expired' };
      if (err === 'access_denied') return { status: 'denied' };
      return { status: 'error', error: err || ('HTTP ' + r.status) };
    });
  }
  function loginPassword(email, password) {
    return raw('POST', '/api/tv/login', { email: email, password: password, device_id: deviceId() }, false).then(function (r) {
      if (r.ok && r.json && r.json.access_token) { saveTokens(r.json); return true; }
      throw new Error((r.json && r.json.error_description) || 'Email ou senha inválidos');
    });
  }
  function logout() { var p = raw('POST', '/api/tv/logout', {}).catch(function () {}); U.store.del('tokens'); return p; }

  /* --- Dados --- */
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } }
  function wantAudio() { return false; } // contrato: speak:false + /voice/tts separado = resposta na tela mais rápida
  function qs(q) { if (!q) return ""; var p = []; for (var k in q) if (q[k] != null) p.push(k + "=" + encodeURIComponent(q[k])); return p.length ? "?" + p.join("&") : ""; }
  function load() {
    var from = U.weekStart(new Date()), to = U.addDays(from, 15); // esta semana + a próxima
    return req('GET', '/api/tv/dashboard?from=' + encodeURIComponent(from.toISOString()) +
      '&to=' + encodeURIComponent(to.toISOString()) + '&tz=' + encodeURIComponent(tz())).then(PK.normalize.bundle);
  }
  var enc = encodeURIComponent;
  return {
    deviceId: deviceId, isLinked: function () { return !!tokens(); },
    startDeviceAuth: startDeviceAuth, pollDeviceAuth: pollDeviceAuth, loginPassword: loginPassword, logout: logout,
    load: load,
    // TV só envia para aprovação: um adulto aprova no PlanKnect (é aí que os pontos entram)
    setChore: function (id, done) { if (!done) return Promise.reject(new Error('Só um adulto desfaz no PlanKnect')); return req('POST', '/api/tv/chores/' + enc(id), { action: 'submit' }); },
    setListItem: function (listId, itemId, done) { return req('POST', '/api/tv/lists/' + enc(listId) + '/items/' + enc(itemId), { done: done }); },
    addListItems: function (listId, titles) { return req('POST', '/api/tv/lists/' + enc(listId) + '/items', { items: titles.slice(0, 20).map(function (t) { return typeof t === 'string' ? { title: t } : t; }) }); },
    updateListItem: function (listId, itemId, patch) { return req('POST', '/api/tv/lists/' + enc(listId) + '/items/' + enc(itemId), patch); },
    list: function (listId) { return req('GET', '/api/tv/lists/' + enc(listId)); },
    clearDone: function (listId) { return req('POST', '/api/tv/lists/' + enc(listId) + '/clear-done', {}); },
    // Rota leve "algo mudou?" (opcional no backend): { version } — troca quando qualquer dado da família muda
    version: function () { return req('GET', '/api/tv/version'); },
    // Link público da lista (abre sem login): { url, expires_at, can_edit }
    shareList: function (listId) { return req('POST', '/api/tv/lists/' + enc(listId) + '/share', {}); },
    // ids do Knect Meeting vêm como "meeting:<uuid>" — o ':' vai sem codificar
    detail: function (kind, id) { return req('GET', '/api/tv/' + kind + 's/' + enc(id).replace(/%3A/gi, ':')); },
    // Gravação da reunião: URL assinada temporária { url, kind: 'video'|'audio', expires_at }
    recording: function (eventId) { return req('GET', '/api/tv/events/' + enc(eventId).replace(/%3A/gi, ':') + '/recording'); },
    watch: function () { return req('GET', '/api/tv/watch'); },
    follow: function (q, on) { return req('POST', '/api/tv/watch/follow', { query: q, follow: on !== false }); },
    vote: function (member, itemId) { return req('POST', '/api/tv/movie-night/vote', { member: member, item: itemId }); },
    deviceControl: function (id, cmd) { return req('POST', '/api/tv/devices/' + enc(id) + '/control', cmd); },
    addChore: function (c) {
      var today = new Date(), d = today.toISOString().slice(0, 10), freq = c.repeat === 'once' ? 'once' : c.repeat === 'weekdays' ? 'weekdays' : 'daily';
      if (freq === 'weekdays' && (today.getDay() === 0 || today.getDay() === 6)) { var n = new Date(today); n.setDate(n.getDate() + (today.getDay() === 6 ? 2 : 1)); d = n.toISOString().slice(0, 10); }
      var body = { title: c.title, points: c.points || 5, due: d, frequency: freq, assignees: c.familyMemberId ? [c.familyMemberId] : [] };
      if (c.organizationId) body.organizationId = c.organizationId;
      if (freq !== 'once') body.scheduleStart = d;
      if (freq === 'weekdays') body.weekdays = [1, 2, 3, 4, 5];
      return req('POST', '/api/tv/chores', body);
    },
    // pontos da semana das missões: { week_start, members: [{ member, points, goal, reward, days:[7] }] }
    // Deal Room
    deals: function () { return req('GET', '/api/tv/deals'); },
    deal: function (id) { return req('GET', '/api/tv/deals/' + enc(id)); },
    choreScores: function () { return req('GET', '/api/tv/chores/scores'); },
    // Knect Meeting: transcrição ao vivo, insights e tarefas sugeridas por projeto
    meetingLive: function (id, since) { return req('GET', '/api/tv/events/' + enc(id).replace(/%3A/gi, ':') + '/live?since=' + (since || 0)); },
    meetingInsights: function (id) { return req('GET', '/api/tv/events/' + enc(id).replace(/%3A/gi, ':') + '/insights'); },
    meetingSuggestion: function (id, sid, action) { return req('POST', '/api/tv/events/' + enc(id).replace(/%3A/gi, ':') + '/suggestions/' + enc(sid), { action: action }); },
    // tarefa nova: no quadro pessoal da pessoa (memberDestinations) ou no projeto/quadro escolhido
    addTask: function (t) {
      var m = t.member && (PK.app.state().members || []).filter(function (x) { return x.id === t.member || x.id === t.assignee; })[0], d = m && m.dest;
      var body = { title: t.title, projectId: t.projectId || (d && d.projectId), boardId: t.boardId || (d && d.boardId), due: t.due ? (t.due.toISOString ? t.due.toISOString().slice(0, 10) : t.due) : undefined, priority: t.priority };
      var who = t.assignee || (d && d.userId); if (who && (!d || d.userId)) body.assignee = d && d.userId ? d.userId : who;
      return req('POST', '/api/tv/tasks', body);
    },
    // Alfred (Jarvis): briefing e sugestões proativas geradas no PlanKnect
    aiBriefing: function (q) { return req('GET', '/api/tv/ai/briefing' + qs(q)); },
    aiSuggestions: function (q) { return req('GET', '/api/tv/ai/suggestions' + qs(q)); },
    assistantAudio: function (b64, mime, o) { return req('POST', '/api/tv/assistant', { audio: b64, mime: mime, lang: o.lang, listen_lang: o.listenLang, meeting_id: o.meetingId || undefined, persona: 'alfred', speak: wantAudio(), tz: tz() }); },
    // Alfred propõe, a pessoa confirma: nada é gravado antes disso (expira em 15 min → 409)
    proposal: function (id, action) { return req('POST', '/api/tv/assistant/proposals/' + enc(id), { action: action }); },
    // Voz do PlanKnect (mesma do KnectAI no site): texto → áudio. Resposta { audio: <base64>, mime } ou { url }
    music: function (m, p, b) { return req(m, '/api/tv/music' + p, b); }, // Spotify via PlanKnect (Round 4)
    tts: function (text, o) { return req('POST', '/api/tv/voice/tts', { text: text, voice: (o && o.voice) || 'alfred', lang: (o && o.lang) || 'en-GB', format: 'mp3' }); },
    // Memória do Alfred ("lembra que…"), guardada no PlanKnect
    aiMemory: function () { return req('GET', '/api/tv/ai/memory'); },
    aiRemember: function (text) { return req('POST', '/api/tv/ai/memory', { text: text }); },
    aiForget: function (id) { return req('POST', '/api/tv/ai/memory/' + enc(id), { action: 'delete' }); },
    aiAct: function (id, action) { return req('POST', '/api/tv/ai/suggestions/' + enc(id), { action: action }); },
    updateTask: function (id, patch) { return req('POST', '/api/tv/tasks/' + enc(id), patch); },
    // Ao vivo da campainha (WebRTC via Google Device Access): manda a oferta SDP, recebe a resposta
    doorLive: function (offerSdp, deviceId) { return req('POST', '/api/tv/door/live', { offerSdp: offerSdp, deviceId: deviceId }); },
    setNoteSeen: function (id, member) { var m = (PK.app.state().members || []).filter(function (x) { return x.id === member; })[0]; return req('POST', '/api/tv/notes/' + enc(id) + '/seen', { member: (m && m.familyMemberId) || member }); },
    // respostas enviadas pelo celular (planknect.com/tv/remote) para esta TV
    assistantPending: function (since) { return req('GET', '/api/tv/assistant/pending?since=' + encodeURIComponent(since)); },
    // recado: { text, by, to:[familyMemberId], expires_at, device_ids } (to/expires_at/device_ids: pedidos ao PlanKnect)
    addNote: function (text, by) { var b = typeof text === 'object' ? text : { text: text, by: by }; return req('POST', '/api/tv/notes', b); },
    alerts: function (since) { return req('GET', '/api/tv/alerts?since=' + (since || 0)); },
    broadcast: function (alert) { return req('POST', '/api/tv/alerts', alert); },
    setSubtask: function (tid, sid, done) { return req('POST', '/api/tv/tasks/' + enc(tid) + '/subtasks/' + enc(sid), { done: done }); },
    // A IA do PlanKnect interpreta e executa; a TV aplica as ações de interface que voltarem
    assistant: function (text, ctx) { return req('POST', '/api/tv/assistant', { text: text, view: ctx && ctx.view, lang: ctx && ctx.lang, meeting_id: (ctx && ctx.meeting_id) || undefined, persona: 'alfred', speak: wantAudio(), tz: tz() }); }
  };
})();

/* ---------------- dados de demonstração ---------------- */
PK.mock = (function () {
  var U = PK.util;
  var members = [
    { id: 'm', name: 'Marcelo', initial: 'M', color: '#7c5cff' },
    { id: 'e', name: 'Elisa', initial: 'E', color: '#ff7a9a' },
    { id: 's', name: 'Sofia', initial: 'S', color: '#38bdf8', kid: true, stars: 42, streak: 5, reward: { title: 'Cinema no sábado', goal: 60 } },
    { id: 'w', name: 'Wesley', initial: 'W', color: '#34d399', kid: true, stars: 27, streak: 2, reward: { title: 'Lego novo', goal: 80 } },
    { id: 'l', name: 'Lara', initial: 'L', color: '#fbbf24', kid: true, stars: 18, streak: 3, reward: { title: 'Sorvete no parque', goal: 30 } }
  ];
  var FAM = ['m', 'e', 's', 'w', 'l'];

  function at(day, h, m) { var d = U.addDays(U.weekStart(new Date()), day); d.setHours(h, m || 0, 0, 0); return d; }
  function inMin(min, dur) {
    var s = new Date(); s.setSeconds(0, 0); s.setMinutes(Math.ceil((s.getMinutes() + min) / 15) * 15);
    return [s, new Date(s.getTime() + dur * 60000)];
  }
  function ev(id, title, type, s, e, extra) {
    var o = { id: id, title: title, type: type, start: s, end: e };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }
  function allDay(id, title, type, day, mem) { return ev(id, title, type, at(day, 0), at(day, 23, 59), { allDay: true, members: mem || [] }); }

  // Persistência das alterações feitas no demo (lista, tasks e eventos adicionados, chores)
  var saved = U.store.get('mockDb.v2', null) || {};
  function persist() { U.store.set('mockDb.v2', saved); }

  function events() {
    var a = inMin(35, 45), b = inMin(200, 60), c = inMin(390, 60), d = inMin(560, 60);
    var base = [
      ev('n1', 'Product strategy sync', 'meeting', a[0], a[1], { members: ['m'], video: 'meet' }),
      ev('n2', 'Deep work — NCNDA & propostas', 'task', b[0], b[1], { members: ['m'] }),
      ev('n3', 'Natação das crianças', 'family', c[0], c[1], { members: ['e', 's', 'w'], location: 'PCYC Northern Beaches' }),
      ev('n4', 'Jantar em família', 'family', d[0], d[1], { members: FAM }),
      ev('w1', 'INVCTUS integração', 'meeting', at(0, 10), at(0, 11), { members: ['m'], video: 'meet' }),
      ev('w2', 'Comercial — Offers & Sales Pipeline', 'meeting', at(0, 10, 30), at(0, 11, 30), { members: ['m'], video: 'meet' }),
      allDay('w3', 'Define Supplier Selection Criteria', 'task', 0, ['m']),
      allDay('w4', 'Contract Review and Signature', 'task', 1, ['m']),
      ev('w5', 'Futebol do Wesley', 'family', at(1, 16), at(1, 17), { members: ['w', 'm'] }),
      ev('w6', 'Seaside Bible Study — Português', 'church', at(1, 19, 30), at(1, 21), { members: ['m', 'e'] }),
      allDay('w7', 'Milestone: Receive Supplier Quotes', 'milestone', 2, ['m']),
      ev('w8', 'Balé da Lara', 'family', at(2, 16, 30), at(2, 17, 30), { members: ['l', 'e'] }),
      allDay('w9', 'Quote Submission Deadline', 'milestone', 2, ['m']),
      ev('w10', 'Internal Kick-off Meeting', 'meeting', at(3, 9), at(3, 10), { members: ['m'], video: 'meet' }),
      ev('w11', 'Dentista — Sofia', 'event', at(3, 15), at(3, 16), { members: ['s', 'e'] }),
      allDay('w12', 'Aniversário — Fernanda Bala', 'birthday', 3),
      allDay('w13', 'Clarify Open Questions with Client', 'task', 4, ['m']),
      allDay('w14', 'NCNDA Execution & Filing', 'milestone', 4, ['m']),
      ev('w15', 'Escola Sabatina', 'church', at(5, 10), at(5, 10, 45), { members: FAM }),
      ev('w16', 'Rose — Psicóloga', 'event', at(5, 11), at(5, 12), { members: ['e'], private: true }),
      ev('w17', 'Sermonette: Pr Deijan', 'church', at(5, 13), at(5, 14), { members: FAM }),
      allDay('w19', 'Adventurer & Children’s Ministry Weekend', 'church', 5, ['s', 'w', 'l']),
      ev('w20', 'Culto de Adoração', 'church', at(6, 11), at(6, 12, 30), { members: FAM }),
      ev('w22', 'Seaside Kids Gathering', 'family', at(6, 15), at(6, 17), { members: ['s', 'w', 'l'] })
    ];
    return base.concat((saved.events || []).map(function (e) {
      return ev(e.id, e.title, e.type, new Date(e.start), new Date(e.end), { members: e.members || [] });
    }));
  }

  function tasks() {
    var t = new Date();
    function due(n) { return U.addDays(U.startOfDay(t), n); }
    var base = [
      { id: 't1', title: 'Clarify Open Questions with Client', project: 'InnovaTradeCapital', projectId: 'p1', priority: 'high', due: due(0), assignee: 'm' },
      { id: 't2', title: 'NCNDA Execution & Filing', project: 'InnovaTradeCapital', projectId: 'p1', priority: 'high', due: due(-1), assignee: 'm' },
      { id: 't3', title: 'Create Quote Comparison Sheet', project: 'InnovaTradeCapital', projectId: 'p1', priority: 'high', due: due(1), assignee: 'm' },
      { id: 't4', title: 'Pre-Screening Questionnaire', project: 'Pakistan Project', projectId: 'p2', priority: 'high', due: due(-3), assignee: 'm' },
      { id: 't5', title: 'Mandar material para o Paulo rever', project: 'Pakistan Project', projectId: 'p2', priority: 'medium', due: due(2), assignee: 'm' },
      { id: 't6', title: 'Distribute RFQ Package', project: 'InnovaTradeCapital', projectId: 'p1', priority: 'medium', due: due(1) },
      { id: 't7', title: 'Gravar vídeo da semana', project: 'Marcelo Personal Brand', projectId: 'p3', priority: 'medium', due: due(3), assignee: 'm' },
      { id: 't8', title: 'Modo TV + login por QR', project: 'PlanKnect', projectId: 'p4', priority: 'high', due: due(4), assignee: 'm' },
      { id: 't9', title: 'Pagar Banya Council', project: 'Casa & Família', projectId: 'p5', priority: 'high', due: due(0), assignee: 'e' },
      { id: 't10', title: 'Marcar dentista das crianças', project: 'Casa & Família', projectId: 'p5', priority: 'low', due: due(6), assignee: 'e' },
      { id: 't11', title: 'Define ideal supplier profile', project: 'InnovaTradeCapital', projectId: 'p1', priority: 'medium', due: due(-2), assignee: 'm' }
    ];
    var patch = saved.taskPatch || {};
    return base.concat((saved.tasks || []).map(function (x) { var c = {}; for (var k in x) c[k] = x[k]; c.due = x.due ? new Date(x.due) : null; return c; })).map(function (t) {
      var p = patch[t.id]; if (!p) return t; var c = {}; for (var k in t) c[k] = t[k]; if (p.status) c.status = p.status; if (p.due) c.due = new Date(p.due); return c;
    });
  }

  var projects = [
    { id: 'p1', name: 'InnovaTradeCapital', org: 'Trade / Commodities', progress: 0.42, color: '#7c5cff', milestone: { title: 'NCNDA Execution & Filing', due: 4 } },
    { id: 'p2', name: 'Pakistan Project', org: 'Consultoria', progress: 0.25, color: '#f97316', milestone: { title: 'Pre-Screening concluído', due: 6 } },
    { id: 'p4', name: 'PlanKnect', org: 'Produto', progress: 0.71, color: '#3b82f6', milestone: { title: 'Lançar modo TV', due: 9 } },
    { id: 'p3', name: 'Marcelo Personal Brand', org: 'Pessoal', progress: 0.58, color: '#22c55e', milestone: { title: 'Série de vídeos #4', due: 5 } },
    { id: 'p5', name: 'Casa & Família', org: 'Família', progress: 0.5, color: '#ff7a9a', milestone: null }
  ];

  var choreDefs = [
    ['Arrumar a cama', 'bed', 'manhã', 5], ['Escovar os dentes', 'tooth', 'manhã', 2],
    ['Dever de casa', 'book', 'tarde', 10], ['Guardar os brinquedos', 'toy', 'tarde', 5],
    ['Colocar a mesa', 'plate', 'noite', 5], ['Separar a roupa de amanhã', 'shirt', 'noite', 3]
  ];
  var extra = { s: [['Ler 20 minutos', 'book', 'noite', 5]], w: [['Dar comida ao cachorro', 'paw', 'manhã', 5]], l: [['Levar o lixo', 'trash', 'tarde', 5]] };
  function todayKey() { return U.startOfDay(new Date()).toDateString(); }
  function updateTask(id, patch) {
    saved.taskPatch = saved.taskPatch || {}; var o = saved.taskPatch[id] = saved.taskPatch[id] || {};
    for (var k in patch) o[k] = patch[k];
    persist(); return Promise.resolve({ ok: true });
  }
  function addChore(c) {
    saved.extraChores = (saved.extraChores || []).concat([{ id: 'xc' + U.uid(), member: c.member, title: c.title, icon: c.icon || 'star', period: c.period || 'tarde', points: c.points || 5, repeat: c.repeat || 'daily', createdDay: todayKey() }]);
    persist(); return Promise.resolve({ ok: true });
  }
  function chores() {
    var done = (saved.choresDay === todayKey() && saved.chores) || null;
    var list = [];
    var dow = new Date().getDay();
    (saved.extraChores || []).forEach(function (c) {
      if (c.repeat === 'once' && c.createdDay !== todayKey()) return;
      if (c.repeat === 'weekdays' && (dow === 0 || dow === 6)) return;
      list.push({ id: c.id, member: c.member, title: c.title, icon: c.icon, period: c.period, points: c.points, done: !!(done && done[c.id]) });
    });
    members.filter(function (m) { return m.kid; }).forEach(function (m, mi) {
      choreDefs.concat(extra[m.id] || []).forEach(function (c, i) {
        var id = m.id + i;
        list.push({ id: id, member: m.id, title: c[0], icon: c[1], period: c[2], points: c[3],
          done: done ? !!done[id] : (i + mi) % 3 === 0 });
      });
    });
    return list;
  }

  var defaultLists = [
    { id: 'l1', name: 'Mercado', icon: 'cart', color: '#34d399', items: [
      ['Leite', 'Laticínios', 'e'], ['Ovos', 'Laticínios', 'e'], ['Queijo minas', 'Laticínios', 'm'],
      ['Bananas', 'Hortifruti', 's'], ['Tomates', 'Hortifruti', 'e'], ['Abacate', 'Hortifruti', 'm'],
      ['Pão de forma', 'Padaria', 'w'], ['Arroz 5kg', 'Mercearia', 'e'], ['Feijão preto', 'Mercearia', 'e', true],
      ['Detergente', 'Limpeza', 'e'], ['Papel toalha', 'Limpeza', 'm', true]
    ] },
    { id: 'l2', name: 'Farmácia', icon: 'pill', color: '#f472b6', items: [['Protetor solar kids', 'Saúde', 'e'], ['Vitamina D', 'Saúde', 'm']] },
    { id: 'l3', name: 'Casa', icon: 'home', color: '#60a5fa', items: [['Lâmpada da garagem', 'Manutenção', 'm'], ['Pilhas AA', 'Manutenção', 'w']] },
    { id: 'l4', name: 'Pagamentos do mês', icon: 'card', color: '#fbbf24', items: [
      ['Banya Council', 'Contas', 'e', false, 2], ['Toll fine', 'Contas', 'm', false, -1], ['Banya Water', 'Contas', 'e', true],
      ['Marina', 'Contas', 'm', false, 6], ['Toll', 'Contas', 'm', false, 12], ['Cartão de Crédito', 'Contas', 'e', false, 4]
    ] }
  ];
  function lists() {
    if (!saved.lists) {
      saved.lists = defaultLists.map(function (l) {
        return { id: l.id, name: l.name, icon: l.icon, color: l.color, items: l.items.map(function (it, i) {
          return { id: l.id + '-' + i, title: it[0], category: it[1], by: it[2], done: !!it[3], due: it[4] !== undefined ? U.addDays(U.startOfDay(new Date()), it[4]).toISOString() : undefined };
        }) };
      });
      persist();
    }
    return saved.lists;
  }

  function meals() {
    var names = [['Churrasco', 'm'], ['Strogonoff de frango', 'e'], ['Tacos mexicanos', 'm'], ['Salmão com legumes', 'e'],
      ['Lasanha da vovó', 'e'], ['Sopa de abóbora', 'm'], ['Pizza caseira', 'm']];
    var ws = U.weekStart(new Date());
    return names.map(function (n, i) { return { date: U.addDays(ws, i), meal: 'jantar', title: n[0], cook: n[1] }; });
  }
  var notes = [
    { id: 'n1', by: 'e', text: 'Natação hoje! Toalhas e óculos na porta.', at: new Date(Date.now() - 2 * 3600000), seenBy: ['m', 's'] },
    { id: 'n2', by: 'm', text: 'Chego às 19h, guardem um prato para mim', at: new Date(Date.now() - 40 * 60000), seenBy: ['e'] },
    { id: 'n3', by: 's', text: 'Acabou o leite!', at: new Date(Date.now() - 15 * 60000), seenBy: [] }
  ];
  function setNoteSeen(id, member) {
    saved.seen = saved.seen || {}; var arr = saved.seen[id] = saved.seen[id] || [];
    if (arr.indexOf(member) < 0) arr.push(member); persist(); return Promise.resolve({ ok: true });
  }
  function addNote(text, by) { var o = typeof text === 'object' ? text : { text: text, by: by }; saved.extraNotes = (saved.extraNotes || []).concat([{ id: 'x' + U.uid(), by: o.by || 'm', text: o.text, to: o.to || [], expires_at: o.expires_at || null, device_ids: o.device_ids || null, at: new Date().toISOString(), seenBy: [] }]); persist(); return Promise.resolve({ ok: true }); }
  function notesNow() {
    var seen = saved.seen || {};
    return (saved.extraNotes || []).map(function (n) { var c = {}; for (var k in n) c[k] = n[k]; c.at = new Date(n.at); return c; }).reverse().concat(notes).map(function (n) {
      var c = {}; for (var k in n) c[k] = n[k]; c.seenBy = (n.seenBy || []).concat((seen[n.id] || []).filter(function (x) { return (n.seenBy || []).indexOf(x) < 0; })); return c;
    });
  }

  function load() {
    return Promise.resolve(PK.normalize.bundle({
      household: { name: 'Silva Family', location: null },
      members: members, events: events(), tasks: tasks(),
      projects: projects.map(function (p) {
        var c = {}; for (var k in p) c[k] = p[k];
        if (p.milestone) c.milestone = { title: p.milestone.title, due: U.addDays(U.startOfDay(new Date()), p.milestone.due) };
        return c;
      }),
      chores: chores(), lists: JSON.parse(JSON.stringify(lists())), meals: meals(), notes: notesNow(), photos: photos(),
      watch: watch(), devices: devices()
    }));
  }

  /* --- escrita --- */
  function setChore(id, done) {
    if (saved.choresDay !== todayKey()) {
      var cur = {};
      chores().forEach(function (c) { if (c.done) cur[c.id] = true; });
      saved.choresDay = todayKey(); saved.chores = cur;
    }
    if (done) saved.chores[id] = true; else delete saved.chores[id];
    var kid = members.filter(function (m) { return id.indexOf(m.id) === 0; })[0];
    var def = chores().filter(function (c) { return c.id === id; })[0];
    if (kid && def) kid.stars += done ? def.points : -def.points;
    persist();
    return Promise.resolve({ ok: true });
  }
  function findList(id) { return lists().filter(function (l) { return l.id === id; })[0]; }
  function setListItem(listId, itemId, done) {
    var l = findList(listId); if (!l) return Promise.reject(new Error('lista'));
    l.items.forEach(function (it) { if (it.id === itemId) it.done = done; });
    persist(); return Promise.resolve({ ok: true });
  }
  function addListItems(listId, titles, by) {
    var l = findList(listId) || lists()[0];
    titles.forEach(function (t) {
      l.items.unshift({ id: l.id + '-' + U.uid(), title: t, category: 'Adicionado por voz', by: by || 'm', done: false, fresh: true });
    });
    persist(); return Promise.resolve({ ok: true, list: l.name });
  }
  function clearDone(listId) {
    var l = findList(listId); if (l) l.items = l.items.filter(function (it) { return !it.done; });
    persist(); return Promise.resolve({ ok: true });
  }
  function addTask(t) {
    saved.tasks = saved.tasks || [];
    saved.tasks.push({ id: 'x' + U.uid(), title: t.title, project: t.project || 'Casa & Família', projectId: t.projectId || 'p5',
      priority: t.priority || 'medium', due: t.due ? t.due.toISOString() : null, assignee: t.assignee || 'm' });
    persist(); return Promise.resolve({ ok: true });
  }
  function addEvent(e) {
    saved.events = saved.events || [];
    saved.events.push({ id: 'x' + U.uid(), title: e.title, type: e.type || 'family', start: e.start.toISOString(), end: e.end.toISOString(), members: e.members || [] });
    persist(); return Promise.resolve({ ok: true });
  }


  /* --- Assistir: seguidos, lançamentos, Filme da sexta (no real: TMDB via PlanKnect) --- */
  var WATCH = [
    { id: 'tv-diplomat', title: 'The Diplomat', kind: 'tv', service: 'netflix', followed: true, badge: 'Nova temporada', ep: 'T3 · E1', when: 0, colors: ['#1e3a8a', '#0f172a'] },
    { id: 'tv-bluey', title: 'Bluey', kind: 'tv', service: 'disney', followed: true, badge: 'Episódios novos', ep: 'T3 · E50', when: -1, colors: ['#38bdf8', '#1d4ed8'], kids: true },
    { id: 'tv-reacher', title: 'Reacher', kind: 'tv', service: 'prime', followed: true, badge: 'Novo episódio', ep: 'T3 · E6', when: 2, colors: ['#78350f', '#1c1917'] },
    { id: 'tv-omitb', title: 'Only Murders in the Building', kind: 'tv', service: 'disney', followed: true, badge: 'Novo episódio', ep: 'T5 · E8', when: -2, colors: ['#be123c', '#1e1b4b'] },
    { id: 'tv-wednesday', title: 'Wednesday', kind: 'tv', service: 'netflix', followed: false, badge: 'Em alta', colors: ['#111827', '#4c1d95'] },
    { id: 'mv-insideout2', title: 'Divertida Mente 2', kind: 'movie', service: 'disney', badge: 'Família', colors: ['#f59e0b', '#7c3aed'], kids: true },
    { id: 'mv-wonka', title: 'Wonka', kind: 'movie', service: 'netflix', badge: 'Família', colors: ['#7c2d12', '#581c87'], kids: true },
    { id: 'mv-paddington', title: 'Paddington: Uma Aventura na Floresta', kind: 'movie', service: 'netflix', badge: 'Família', colors: ['#1e40af', '#b91c1c'], kids: true },
    { id: 'tv-newrel1', title: 'The Night Agent', kind: 'tv', service: 'netflix', badge: 'Lançamento', ep: 'T3', when: -3, colors: ['#0c4a6e', '#020617'] },
    { id: 'tv-newrel2', title: 'The Lord of the Rings: The Rings of Power', kind: 'tv', service: 'prime', badge: 'Lançamento', ep: 'T3', when: -5, colors: ['#713f12', '#0f172a'] }
  ];
  function watch() {
    var followed = saved.follow || {}, votes = saved.votes || { m: 'mv-insideout2', e: 'mv-paddington', s: 'mv-insideout2', w: 'mv-wonka', l: 'mv-insideout2' };
    var today = U.startOfDay(new Date());
    var items = WATCH.map(function (w) {
      var c = {}; for (var k in w) c[k] = w[k];
      if (followed[w.id] !== undefined) c.followed = followed[w.id];
      if (w.when !== undefined) c.date = U.addDays(today, w.when);
      return c;
    }).concat((saved.extraFollow || []).map(function (t) {
      return { id: 'x-' + t, title: t, kind: 'tv', service: 'netflix', followed: true, badge: 'Seguindo', colors: ['#334155', '#0f172a'] };
    }));
    var candidates = items.filter(function (i) { return i.kind === 'movie'; });
    return { items: items, movieNight: { day: 5, time: '19:30', candidates: candidates.map(function (c) { return c.id; }), votes: votes } };
  }
  function follow(q, on) {
    var n = U.store ? q : q, hit = WATCH.filter(function (w) { return w.title.toLowerCase().indexOf(String(q).toLowerCase()) >= 0; })[0];
    if (hit) { saved.follow = saved.follow || {}; saved.follow[hit.id] = on !== false; }
    else { saved.extraFollow = (saved.extraFollow || []).concat([q]); }
    persist(); return Promise.resolve({ ok: true, title: hit ? hit.title : q });
  }
  function vote(member, itemId) { saved.votes = watch().movieNight.votes; saved.votes[member] = itemId; persist(); return Promise.resolve({ ok: true }); }

  /* --- Casa (LG ThinQ) --- */
  var DEVICES = [
    { id: 'wm', type: 'washer', name: 'Lava e seca', room: 'Lavanderia', state: 'running', detail: 'Algodão · 40°', endsIn: 23 },
    { id: 'dw', type: 'dishwasher', name: 'Lava-louças', room: 'Cozinha', state: 'done', detail: 'Ciclo Eco concluído' },
    { id: 'rf', type: 'fridge', name: 'Geladeira', room: 'Cozinha', state: 'ok', fridge: 3, freezer: -18, door: false },
    { id: 'ac1', type: 'ac', name: 'Ar da sala', room: 'Sala', power: true, mode: 'Resfriar', target: 23, current: 25 },
    { id: 'ac2', type: 'ac', name: 'Ar do quarto', room: 'Quarto', power: false, mode: 'Resfriar', target: 21, current: 22 },
    { id: 'rb', type: 'robot', name: 'Robô aspirador', room: 'Casa', state: 'charging', battery: 86 }
  ];
  var devStart = Date.now();
  function devices() {
    var st = saved.devices || {};
    return DEVICES.map(function (d) {
      var c = {}; for (var k in d) c[k] = d[k];
      var o = st[d.id] || {}; for (var k2 in o) c[k2] = o[k2];
      if (c.type === 'washer' && c.state === 'running') {
        c.endsIn = Math.max(0, d.endsIn - Math.floor((Date.now() - devStart) / 60000));
        if (!c.endsIn) { c.state = 'done'; c.detail = 'Terminou — hora de estender a roupa'; }
      }
      return c;
    });
  }
  function deviceControl(id, cmd) {
    saved.devices = saved.devices || {}; var o = saved.devices[id] = saved.devices[id] || {};
    var d = devices().filter(function (x) { return x.id === id; })[0];
    if (cmd.power !== undefined) o.power = cmd.power;
    if (cmd.target !== undefined) o.target = cmd.target;
    if (cmd.start) { o.state = 'cleaning'; }
    if (cmd.dock) { o.state = 'charging'; }
    persist(); return Promise.resolve({ ok: true, device: d });
  }

  /* --- Fotos da família (demo: fotos do Unsplash no lugar das da família) --- */
  function photos() {
    var y = new Date().getFullYear();
    return [
      ['1568392862895-f949b6a93d60', 'Praia em Manly', 3], ['1503431153573-96e959f4d9b7', 'Trilha no fim de semana', 1],
      ['1597151120500-28bc862d3d5f', 'Acampamento no lago', 2], ['1593103916129-87e179a70c1f', 'Parquinho', 4], ['1559054109-82d938dac629', 'Blue Mountains', 5]
    ].map(function (p) {
      var d = new Date(); d.setFullYear(y - p[2]);
      return { url: 'https://images.unsplash.com/photo-' + p[0] + '?w=1920&h=1080&q=80&fit=crop&auto=format', caption: p[1], takenAt: d, demo: true };
    });
  }

  /* --- detalhes (GET /events/:id, /tasks/:id, /projects/:id) --- */
  var PEOPLE = {
    ana: { name: 'Ana Souza', org: 'InnovaTradeCapital', color: '#f472b6' },
    rafael: { name: 'Rafael Lima', org: 'PlanKnect', color: '#60a5fa' },
    paulo: { name: 'Paulo Mendes', org: 'Consultor', color: '#fbbf24' },
    kenji: { name: 'Kenji Watanabe', org: 'Fornecedor · Japão', color: '#34d399' },
    sofia: { name: 'Sofia Rahman', org: 'Pakistan Project', color: '#a78bfa' },
    coach: { name: 'Coach Mike', org: 'PCYC Northern Beaches', color: '#38bdf8' }
  };
  var EV = {
    n1: { conf: 'https://meet.google.com/pkx-ncda-q4r', people: [['ana', 'accepted'], ['rafael', 'accepted'], ['paulo', 'tentative'], ['kenji', 'needsAction']],
      description: 'Alinhar o pipeline do Q4 e fechar os próximos passos do NCNDA com o fornecedor japonês.',
      agenda: ['Status das cotações (15 min)', 'Comparativo de fornecedores', 'Próximos passos NCNDA', 'Riscos e prazos'],
      attachments: [['Quote comparison.xlsx', 'sheet'], ['RFQ package v3.pdf', 'pdf'], ['Notas da última reunião', 'doc']], project: 'p1', tasks: ['t1', 't3', 't2'] },
    n2: { description: 'Bloco de foco sem notificações. Fechar a minuta do NCNDA e revisar as duas propostas pendentes.', tasks: ['t2', 't5'], project: 'p1' },
    n3: { people: [['coach', 'accepted']], description: 'Aula semanal de natação no PCYC.', agenda: ['Levar toalhas e óculos', 'Lanche para depois', 'Sofia: teste de nível às 18:40'] },
    n4: { description: 'Jantar todo mundo junto. Cada um conta a melhor parte do dia.' },
    w1: { conf: 'https://meet.google.com/inv-ctus-int', people: [['rafael', 'accepted'], ['ana', 'declined']], description: 'Integração INVCTUS com o pipeline comercial.', project: 'p1' },
    w2: { conf: 'https://meet.google.com/com-offr-sls', people: [['paulo', 'accepted']], description: 'Revisão das ofertas e do funil de vendas.' },
    w10: { conf: 'https://meet.google.com/kik-off-int', people: [['sofia', 'accepted'], ['rafael', 'tentative']], description: 'Kick-off interno do Pakistan Project.', project: 'p2', tasks: ['t4', 't5'] }
  };
  var TK = {
    t1: { description: 'Responder as 6 perguntas abertas do cliente antes da reunião de sexta.', subtasks: [['Juntar dúvidas do e-mail', true], ['Validar prazos com fornecedor', false], ['Enviar respostas consolidadas', false]], comment: ['e', 'Ana pediu resposta até sexta 10h.'] },
    t2: { description: 'Assinar e arquivar o NCNDA com o fornecedor.', subtasks: [['Revisão jurídica', true], ['Assinatura das partes', false], ['Arquivar no Drive', false]], comment: ['m', 'Falta só a assinatura do Kenji.'] },
    t3: { description: 'Planilha comparando preço, prazo e condições das 4 cotações.', subtasks: [['Importar cotações', true], ['Normalizar moedas', true], ['Gráfico comparativo', false]] },
    t4: { description: 'Questionário de pré-seleção para os parceiros locais.', subtasks: [['Rascunho', true], ['Revisão do Paulo', false]] },
    t9: { description: 'Taxa do council do trimestre.', subtasks: [['Conferir valor', true], ['Pagar no app do banco', false]] }
  };
  var PJ = {
    p1: { team: ['m', 'ana', 'rafael', 'kenji'], milestones: [['Receive Supplier Quotes', -2, true], ['NCNDA Execution & Filing', 4, false], ['Contrato assinado', 18, false]] },
    p2: { team: ['m', 'sofia', 'paulo'], milestones: [['Pre-Screening concluído', 6, false], ['Visita técnica', 25, false]] },
    p3: { team: ['m'], milestones: [['Série de vídeos #4', 5, false], ['Landing page nova', 20, false]] },
    p4: { team: ['m', 'rafael'], milestones: [['Lançar modo TV', 9, false], ['Alexa Skill', 40, false]] },
    p5: { team: ['m', 'e'], milestones: [] }
  };
  var STEPS = {
    'Lasanha da vovó': [['Pré-aqueça o forno a 200°', 10], ['Doure a carne moída com cebola e alho', 12], ['Junte o molho de tomate e cozinhe', 15],
      ['Monte as camadas: massa, molho, presunto e queijo', 0], ['Leve ao forno coberto com papel-alumínio', 25], ['Tire o alumínio e gratine', 10], ['Descanse antes de servir', 5]],
    'Strogonoff de frango': [['Corte o frango em cubos e tempere', 0], ['Doure o frango na manteiga', 10], ['Junte champignon e molho', 8], ['Desligue e misture o creme de leite', 0], ['Cozinhe o arroz', 18]],
    'Pizza caseira': [['Misture farinha, fermento e água; sove', 10], ['Deixe a massa crescer', 45], ['Abra a massa e cubra', 0], ['Asse a 250°', 12]]
  };
  var RECIPES = {
    'Lasanha da vovó': ['Massa de lasanha', 'Carne moída', 'Molho de tomate', 'Queijo mussarela', 'Presunto', 'Leite'],
    'Strogonoff de frango': ['Peito de frango', 'Creme de leite', 'Champignon', 'Arroz', 'Batata palha'],
    'Tacos mexicanos': ['Tortilhas', 'Carne moída', 'Abacate', 'Tomates', 'Queijo cheddar'],
    'Salmão com legumes': ['Salmão', 'Brócolis', 'Cenoura', 'Limão'],
    'Churrasco': ['Picanha', 'Linguiça', 'Pão de alho', 'Carvão'],
    'Sopa de abóbora': ['Abóbora', 'Gengibre', 'Creme de leite'],
    'Pizza caseira': ['Farinha', 'Fermento', 'Molho de tomate', 'Queijo mussarela', 'Manjericão']
  };
  function person(key, resp) {
    var m = members.filter(function (x) { return x.id === key; })[0];
    if (m) return { name: m.name, member: m.id, color: m.color, response: resp || 'accepted', org: 'Família' };
    var p = PEOPLE[key]; return { name: p.name, org: p.org, color: p.color, response: resp || 'accepted' };
  }
  /* Knect Meeting (demo): fala ao vivo que avança com o relógio + insights e sugestões por projeto */
  var LIVE = [['Marcelo', 'Bom dia a todos, vamos começar pela revisão das cotações.'], ['Ana', 'Recebemos três propostas; a da Kestrel ficou 12% abaixo.'],
    ['Rafael', 'Mas o prazo de entrega deles é de seis semanas.'], ['Marcelo', 'Precisamos de um plano B para o lote de dezembro.'],
    ['Paulo', 'Posso falar com o fornecedor atual sobre um pedido parcial.'], ['Kenji', 'Do lado jurídico, o NCNDA precisa estar assinado antes.'],
    ['Ana', 'Eu preparo a comparação final até quarta.'], ['Marcelo', 'Fechado. Paulo cuida do pedido parcial, Kenji do NCNDA.']];
  var sugDone = {};
  function meetingLive(id, since) {
    var n = Math.min(LIVE.length, 2 + Math.floor((Date.now() / 6000) % (LIVE.length + 4)));
    return Promise.resolve({ live: true, lines: LIVE.slice(0, n).map(function (l, i) { return { seq: i + 1, speaker: l[0], text: l[1], at: new Date(Date.now() - (n - i) * 40000).toISOString() }; }).filter(function (l) { return l.seq > (since || 0); }) });
  }
  function meetingInsights(id) {
    return Promise.resolve({ summary: 'Revisão das cotações do lote de dezembro. A Kestrel é 12% mais barata, mas leva 6 semanas; o time vai negociar um pedido parcial com o fornecedor atual.',
      key_decisions: ['Manter o fornecedor atual para um pedido parcial', 'NCNDA assinado antes de qualquer pedido novo'],
      action_items: [{ text: 'Comparação final das cotações', owner: 'Ana', due: 'quarta' }],
      risks: ['Prazo de 6 semanas da Kestrel pode atrasar o lote de dezembro'], questions: ['Quem aprova o pedido parcial acima de US$ 500 mil?'], conflicts: [{ text: 'Paulo propôs pedido novo antes do NCNDA — contraria a decisão de 14/10' }],
      suggested_tasks: [
        { id: 'sg1', title: 'Negociar pedido parcial com o fornecedor atual', project: 'InnovaTradeCapital - Trade/Commodities', owner: 'Paulo', due: 'sexta' },
        { id: 'sg2', title: 'Enviar NCNDA para assinatura', project: 'InnovaTradeCapital - Trade/Commodities', owner: 'Kenji', due: 'amanhã' },
        { id: 'sg3', title: 'Atualizar planilha de comparação de cotações', project: 'Knect System', owner: 'Ana', due: 'quarta' }
      ].filter(function (x) { return !sugDone[x.id]; }) });
  }
  function meetingSuggestion(id, sid, action) { sugDone[sid] = action; return Promise.resolve({ ok: true, reply: action === 'accept' ? 'Tarefa criada no projeto.' : 'Sugestão ignorada.' }); }

  function detail(kind, id) {
    var today = U.startOfDay(new Date());
    if (kind === 'event') {
      var e = events().filter(function (x) { return x.id === id; })[0];
      if (!e) return Promise.reject(new Error('Evento não encontrado'));
      var x = EV[id] || {}, d = {}; for (var k in e) d[k] = e[k];
      var mem = (e.members || []).map(function (mid) { return person(mid, 'accepted'); });
      d.organizer = e.type === 'meeting' ? person('m') : (mem[0] || null);
      d.attendees = mem.concat((x.people || []).map(function (p) { return person(p[0], p[1]); }));
      d.conference = x.conf ? { provider: 'meet', url: x.conf } : (e.video ? { provider: 'meet', url: 'https://meet.google.com/new' } : null);
      d.description = x.description || ''; d.agenda = x.agenda || [];
      d.attachments = (x.attachments || []).map(function (a) { return { name: a[0], kind: a[1] }; });
      d.related = { projectId: x.project || null, taskIds: x.tasks || [] };
      return Promise.resolve(d);
    }
    if (kind === 'task') {
      var t = tasks().filter(function (x) { return x.id === id; })[0];
      if (!t) return Promise.reject(new Error('Task não encontrada'));
      var tx = TK[id] || {}, td = {}; for (var k2 in t) td[k2] = t[k2];
      var subDone = (saved.subtasks || {})[id] || {};
      td.description = tx.description || '';
      td.subtasks = (tx.subtasks || []).map(function (s2, i) { var sid = id + '-' + i; return { id: sid, title: s2[0], done: subDone[sid] !== undefined ? subDone[sid] : s2[1] }; });
      td.lastComment = tx.comment ? { by: tx.comment[0], text: tx.comment[1] } : null;
      return Promise.resolve(td);
    }
    if (kind === 'project') {
      var p = projects.filter(function (x) { return x.id === id; })[0];
      if (!p) return Promise.reject(new Error('Projeto não encontrado'));
      var px = PJ[id] || {}, pd = {}; for (var k3 in p) pd[k3] = p[k3];
      pd.team = (px.team || []).map(function (k4) { return person(k4); });
      pd.milestones = (px.milestones || []).map(function (m2) { return { title: m2[0], due: U.addDays(today, m2[1]), done: m2[2] }; });
      pd.openTasks = tasks().filter(function (x) { return x.projectId === id; });
      return Promise.resolve(pd);
    }
    if (kind === 'meal') return Promise.resolve({ ingredients: RECIPES[id] || [], steps: (STEPS[id] || []).map(function (x) { return { text: x[0], minutes: x[1] }; }) });
    return Promise.reject(new Error('tipo'));
  }
  function setSubtask(tid, sid, done) {
    saved.subtasks = saved.subtasks || {}; saved.subtasks[tid] = saved.subtasks[tid] || {};
    saved.subtasks[tid][sid] = done; persist(); return Promise.resolve({ ok: true });
  }
  return { load: load, setChore: setChore, setListItem: setListItem, addListItems: addListItems, clearDone: clearDone,
    addTask: addTask, addEvent: addEvent, detail: detail, setSubtask: setSubtask, meetingLive: meetingLive, meetingInsights: meetingInsights, meetingSuggestion: meetingSuggestion,
    watch: function () { return Promise.resolve(watch()); }, setNoteSeen: setNoteSeen, addNote: addNote, addChore: addChore, updateTask: updateTask, follow: follow, vote: vote, deviceControl: deviceControl, devices: devices,
    broadcast: function (a) { PK.alerts && PK.alerts.push(a); return Promise.resolve({ ok: true }); }, reset: function () { saved = {}; persist(); } };
})();

PK.data = {
  mode: function () { return PK.util.store.get('mode', 'unlinked'); }, // 'live' | 'demo' | 'unlinked'
  setMode: function (m) { PK.util.store.set('mode', m); },
  src: function () { return this.mode() === 'live' ? PK.api : PK.mock; },
  load: function () { return this.src().load(); },
  version: function () { return this.mode() === 'live' ? PK.api.version() : Promise.reject(new Error('demo')); },
  // Devolve sempre um endereço para o QR: o link público (se o backend tiver) ou o link normal da lista
  shareUrl: function (listId) {
    var U = PK.util, key = 'share.' + listId, c = U.store.get(key, null);
    var fallback = { url: PK.config.listUrl + '/' + listId, public: false };
    if (c && c.expires > Date.now() + 3600000) return Promise.resolve(c);
    if (this.mode() !== 'live') return Promise.resolve(fallback);
    return PK.api.shareList(listId).then(function (r) {
      var v = { url: r.url, public: true, expires: Date.parse(r.expires_at) || Date.now() + 7 * 864e5, canEdit: r.can_edit !== false };
      U.store.set(key, v); return v;
    }).catch(function () { return fallback; });
  },
  setChore: function (id, done) { return this.src().setChore(id, done); },
  setListItem: function (l, i, d) { return this.src().setListItem(l, i, d); },
  addListItems: function (l, t) { return this.src().addListItems(l, t); },
  clearDone: function (l) { return this.src().clearDone(l); },
  meetingLive: function (id, since) { return this.src().meetingLive(id, since); },
  meetingInsights: function (id) { return this.src().meetingInsights(id); },
  meetingSuggestion: function (id, sid, a) { return this.src().meetingSuggestion(id, sid, a); },
  detail: function (kind, id) {
    return this.src().detail(kind, id).then(function (d) {
      // O PlanKnect às vezes manda conference sem url (ex.: evento sem Meet) — acha o link onde estiver ou descarta
      if (d && kind === 'event') {
        var c = d.conference || null, url = (c && (c.url || c.uri || c.link || c.joinUrl)) || d.hangoutLink || d.meet_url || d.meetUrl || d.conference_url ||
          (c && c.entryPoints && c.entryPoints[0] && c.entryPoints[0].uri) || null;
        d.conference = url ? { provider: (c && c.provider) || 'meet', url: String(url) } : null;
      }
      return d;
    });
  },
  setSubtask: function (t, sub, d) { return this.src().setSubtask(t, sub, d); },
  follow: function (q, on) { return this.src().follow(q, on); },
  vote: function (m, i) { return this.src().vote(m, i); },
  deviceControl: function (id, c) { return this.src().deviceControl(id, c); },
  broadcast: function (a) { return this.src().broadcast(a); },
  setNoteSeen: function (id, m) { return this.src().setNoteSeen(id, m); },
  addNote: function (t, by) { return this.src().addNote(t, by); },
  addChore: function (c) { return this.src().addChore(c); },
  updateTask: function (id, p) { return this.src().updateTask(id, p); },
  assistant: function (text, ctx) {
    return this.mode() === 'live' ? PK.api.assistant(text, ctx) : PK.assistant.local(text, ctx);
  }
};

/* ---------------- clima ---------------- */
PK.weather = (function () {
  function load(loc) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&current=temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m' +
      '&hourly=temperature_2m,precipitation_probability,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max' +
      '&timezone=auto&forecast_days=8';
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('weather'); return r.json(); }).then(function (j) {
      var now = Date.now();
      var hours = j.hourly.time.map(function (t, i) {
        return { time: new Date(t), temp: Math.round(j.hourly.temperature_2m[i]), rain: j.hourly.precipitation_probability[i],
          code: j.hourly.weather_code[i], isDay: !!j.hourly.is_day[i] };
      }).filter(function (h) { return h.time.getTime() > now - 3600000; }).slice(0, 25);
      return {
        name: loc.name, temp: Math.round(j.current.temperature_2m), feels: Math.round(j.current.apparent_temperature),
        humidity: j.current.relative_humidity_2m, wind: Math.round(j.current.wind_speed_10m), code: j.current.weather_code, isDay: !!j.current.is_day,
        hours: hours,
        days: j.daily.time.map(function (t, i) {
          var p = t.split('-');
          return { date: new Date(+p[0], +p[1] - 1, +p[2]), code: j.daily.weather_code[i],
            max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]),
            rain: j.daily.precipitation_probability_max[i], uv: Math.round(j.daily.uv_index_max[i]),
            wind: Math.round(j.daily.wind_speed_10m_max[i]),
            sunrise: new Date(j.daily.sunrise[i]), sunset: new Date(j.daily.sunset[i]) };
        })
      };
    }).catch(function () { return fallback(loc); });
  }
  function fallback(loc) {
    var U = PK.util, codes = [61, 3, 2, 1, 80, 2, 0, 3], t0 = new Date(); t0.setMinutes(0, 0, 0);
    var hours = [];
    for (var i = 0; i < 25; i++) { var h = new Date(t0.getTime() + i * 3600000), hh = h.getHours();
      hours.push({ time: h, temp: Math.round(17 + 5 * Math.sin((hh - 9) / 24 * 2 * Math.PI)), rain: hh > 15 && hh < 21 ? 70 : 15, code: hh > 15 && hh < 21 ? 61 : 2, isDay: hh > 6 && hh < 19 }); }
    return { name: loc.name, temp: 20, feels: 19, humidity: 70, wind: 14, code: 53, isDay: true, offline: true, hours: hours,
      days: codes.map(function (c, i) {
        var d = U.addDays(U.startOfDay(new Date()), i), sr = new Date(d), ss = new Date(d); sr.setHours(6, 12); ss.setHours(19, 31);
        return { date: d, code: c, max: 22 + (i % 3), min: 15 + (i % 2), rain: c >= 51 ? 70 : 10, uv: 6, wind: 18, sunrise: sr, sunset: ss };
      }) };
  }
  return { load: load };
})();
