/* Telas de detalhe. Qualquer elemento com data-open="tipo:id" abre aqui
 * (event, task, project, meal, note, list). Busca o detalhe na API (ou no demo) e monta o modal. */
var PK = window.PK || {};
window.PK = PK;

PK.details = (function () {
  var U = PK.util, I = PK.icons, esc = U.esc;
  var RSVP = { accepted: ['Confirmado', 'ok'], tentative: ['Talvez', 'maybe'], needsAction: ['Pendente', 'pending'], declined: ['Recusou', 'no'] };
  var PRIO = { high: ['Alta', 'high'], medium: ['Média', 'med'], low: ['Baixa', 'low'] };
  var FILE_IC = { sheet: 'list', pdf: 'note', doc: 'note' };

  function st() { return PK.app.state(); }
  function member(id) { return st().members.filter(function (m) { return m.id === id; })[0]; }
  function bubble(name, color, size) {
    var ini = String(name || '?').split(' ').map(function (w) { return w.charAt(0); }).slice(0, 2).join('');
    return '<span class="av" style="background:' + (color || '#64748b') + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.4) + 'px">' + esc(ini) + '</span>';
  }
  function when(e) {
    var now = new Date(), day = U.sameDay(e.start, now) ? 'Hoje' : (U.sameDay(e.start, U.addDays(now, 1)) ? 'Amanhã' : U.longDate(e.start));
    if (e.allDay) return day + ' · dia todo';
    var dur = Math.round((e.end - e.start) / 60000);
    return day + ' · ' + U.hm(e.start) + ' – ' + U.hm(e.end) + ' · ' + (dur >= 60 ? Math.floor(dur / 60) + 'h' + (dur % 60 ? ' ' + dur % 60 : '') : dur + ' min');
  }
  function countdown(e) {
    var now = new Date();
    if (e.allDay) return '';
    if (e.start <= now && e.end > now) return '<span class="pill now">AGORA · termina ' + U.relMinutes((e.end - now) / 60000) + '</span>';
    if (e.start > now) return '<span class="pill soon">' + U.relMinutes((e.start - now) / 60000) + '</span>';
    return '<span class="pill past">já aconteceu</span>';
  }
  function sec(t, extra) { return '<div class="dt-sec">' + t + (extra ? '<span>' + extra + '</span>' : '') + '</div>'; }
  function taskLine(t) {
    var p = PRIO[t.priority] || PRIO.medium, late = t.due && t.due < U.startOfDay(new Date());
    return '<div class="dt-link focusable" data-open="task:' + esc(t.id) + '"><span class="prio ' + p[1] + '">' + p[0] + '</span><div class="dt-link-main"><b>' + esc(t.title) + '</b>' +
      '<span' + (late ? ' class="red"' : '') + '>' + (t.project ? '<i class="tl-dot" style="background:' + (t.projectColor || '#94a3b8') + '"></i>' + esc(t.project) : '') + (t.due ? ' · ' + U.dueLabel(t.due, new Date()) : ' · sem prazo') + (t.status === 'in_progress' ? ' · em andamento' : '') + '</span></div><span class="dt-go">›</span></div>';
  }

  /* ---------- Knect Meeting: resumo, decisões, ações, transcrição ---------- */
  function str(x) { return typeof x === 'string' ? x : (x && (x.text || x.title || x.decision || x.description)) || ''; }
  function meetingAI(d) {
    var out = '';
    if (d.summary) out += sec('Resumo da reunião') + '<p class="dt-desc">' + esc(str(d.summary)) + '</p>';
    if (d.key_decisions && d.key_decisions.length) out += sec('Decisões', d.key_decisions.length) + '<ul class="dt-dec">' + d.key_decisions.map(function (x) { return '<li>' + I.get('check', 22, ' stroke-width="2.6"') + esc(str(x)) + '</li>'; }).join('') + '</ul>';
    if (d.action_items && d.action_items.length) out += sec('Ações', d.action_items.length) + d.action_items.map(function (x) {
      var who = x.owner || x.assignee_name || x.assignee || '', due = x.due || x.due_date;
      return '<div class="dt-link"><span class="dt-dot" style="--c:#60a5fa"></span><div class="dt-link-main"><b>' + esc(str(x)) + '</b><span>' + esc([who, due ? U.dueLabel(new Date(due), new Date()) : ''].filter(Boolean).join(' · ')) + '</span></div></div>';
    }).join('');
    if (d.transcript && d.transcript.length) out += sec('Transcrição', d.transcript.length + ' falas') + '<div class="dt-tr">' + d.transcript.slice(0, 10).map(function (l) {
      return '<p><b>' + esc(l.speaker || l.name || '') + '</b>' + (l.at || l.time ? '<small>' + esc(l.at || l.time) + '</small>' : '') + esc(l.text || l.content || '') + '</p>';
    }).join('') + (d.transcript.length > 10 ? '<p class="dt-more">+ ' + (d.transcript.length - 10) + ' falas no PlanKnect</p>' : '') + '</div>';
    return out;
  }
  function recordingOf(d) { var r = d.recording || {}; return d.recording_url || d.recordingUrl || r.url || r.signed_url || (d.has_recording || r.available ? 'api' : null); }

  /* ---------- evento / reunião / milestone ---------- */
  function event(d) {
    var T = PK.views.TYPE[d.type] || PK.views.TYPE.event, s = st();
    var proj = d.related && d.related.projectId && s.projects.filter(function (p) { return p.id === d.related.projectId; })[0];
    var rel = ((d.related && d.related.taskIds) || []).map(function (id) { return s.tasks.filter(function (t) { return t.id === id; })[0]; }).filter(Boolean);
    var att = d.attendees || [];
    var confirmed = att.filter(function (a) { return a.response === 'accepted'; }).length;
    var main = '<div class="dt-chips"><span class="dt-type" style="--c:' + T.color + '">' + I.get(T.icon, 24) + ' ' + T.label + '</span>' + countdown(d) + '</div>' +
      '<h1 class="dt-title">' + esc(PK.views.title(d)) + '</h1>' +
      '<div class="dt-meta">' + I.get('calendar', 26) + ' ' + when(d) + '</div>' +
      (d.location ? '<div class="dt-meta">' + I.get('pin', 26) + ' ' + esc(d.location) + '</div>' : '') +
      (d.conference ? '<div class="dt-meta">' + I.get('video', 26) + ' Google Meet · <span class="mono-s">' + esc(String(d.conference.url || '').replace(/^https?:\/\//, '')) + '</span></div>' : '') +
      (d.description ? '<p class="dt-desc">' + esc(d.description) + '</p>' : '') +
      meetingAI(d) +
      (d.agenda && d.agenda.length ? sec('Pauta', d.agenda.length + ' itens') + '<ol class="dt-agenda">' + d.agenda.map(function (a, i) {
        return '<li class="focusable"><span>' + (i + 1) + '</span>' + esc(a) + '</li>'; }).join('') + '</ol>' : '') +
      (d.attachments && d.attachments.length ? sec('Anexos') + '<div class="dt-files">' + d.attachments.map(function (f) {
        return '<span class="dt-file focusable">' + I.get(FILE_IC[f.kind] || 'note', 24) + esc(f.name) + '</span>'; }).join('') + '</div>' : '') +
      (proj || rel.length ? sec('Relacionados') + (proj ? '<div class="dt-link focusable" data-open="project:' + proj.id + '" style="--c:' + proj.color + '"><span class="dt-dot"></span><div class="dt-link-main"><b>' +
        esc(proj.name) + '</b><span>Projeto' + (proj.progress != null && !isNaN(proj.progress) ? ' · ' + Math.round(proj.progress * 100) + '% concluído' : (proj.org ? ' · ' + esc(proj.org) : '')) + '</span></div><span class="dt-go">›</span></div>' : '') + rel.map(taskLine).join('') : '');
    var side = (d.conference ? '<div class="dt-join"><div class="qr-box small"><div id="dt-qr"></div></div><div><b>Entrar pelo celular</b><span>Aponte a câmera para abrir o Meet</span></div></div>' : '') +
      (att.length ? sec('Participantes', att.length + (confirmed ? ' · ' + confirmed + ' confirmados' : '')) + '<div class="dt-people">' + att.map(function (a) {
        var r = RSVP[a.response] || RSVP.needsAction, org = d.organizer && d.organizer.name === a.name;
        return '<div class="dt-person focusable">' + bubble(a.name, a.color, 52) + '<div class="dt-person-main"><b>' + esc(a.name) + (org ? ' <em>organizador</em>' : '') + '</b><span>' + esc(a.org || '') + '</span></div>' +
          '<span class="rsvp ' + r[1] + '">' + r[0] + '</span></div>'; }).join('') + '</div>' : '<div class="dt-empty">Sem participantes listados.</div>');
    return {
      body: '<div class="dt"><div class="dt-main">' + main + '</div><div class="dt-side">' + side + '</div></div>',
      actions: (recordingOf(d) ? [{ label: I.get('play', 22) + ' Assistir gravação', act: 'recording', data: d.id }] : [])
        .concat(d.type === 'meeting' && d.end > new Date() ? [{ label: I.get('camera', 24) + ' Modo reunião', act: 'meeting-now' }] : []).concat([{ label: 'Fechar', act: 'close', ghost: true }]),
      after: function () { if (d.conference) PK.app.qr('dt-qr', d.conference.url, 190); }
    };
  }

  /* ---------- task ---------- */
  function cleanDesc(t) { return String(t || '').replace(/\n{3,}/g, '\n\n').replace(/^\s*(notes?|notas?)\s*:\s*$/gim, '').trim(); }
  var TSTAT = { todo: 'A fazer', open: 'A fazer', in_progress: 'Em andamento', review: 'Em revisão', done: 'Concluída' };
  function projOf(id) { return st().projects.filter(function (x) { return x.id === id; })[0]; }
  function deps(d) { // dependências, se o PlanKnect mandar (blocked_by / depends_on / blocks)
    var ids = [].concat(d.blocked_by || d.blockedBy || d.depends_on || d.dependsOn || []), blocks = [].concat(d.blocks || []);
    var find = function (x) { return typeof x === 'object' ? x : st().tasks.filter(function (t) { return t.id === x; })[0] || { id: x, title: 'Tarefa ' + String(x).slice(0, 6) }; };
    return { on: ids.map(find), blocks: blocks.map(find) };
  }
  function task(d) {
    var p = PRIO[d.priority] || PRIO.medium, now = new Date(), late = d.due && d.due < U.startOfDay(now);
    var who = member(d.assignee), subs = d.subtasks || [], done = subs.filter(function (x) { return x.done; }).length;
    var proj = projOf(d.projectId), base = st().tasks.filter(function (x) { return x.id === d.id; })[0] || {};
    var url = d.url || base.url, desc = cleanDesc(d.description), dp = deps(d);
    var siblings = st().tasks.filter(function (x) { return x.projectId === d.projectId && x.id !== d.id && x.status !== 'done'; }).sort(function (a, b) { return (a.due || Infinity) - (b.due || Infinity); });
    var main = '<div class="dt-chips"><span class="prio big ' + p[1] + '">Prioridade ' + p[0].toLowerCase() + '</span>' +
      '<span class="pill stat-' + (d.status || 'todo') + '">' + (TSTAT[d.status] || 'A fazer') + '</span>' +
      (d.due ? '<span class="pill ' + (late ? 'late' : 'soon') + '">' + (late ? 'Atrasada · ' : 'Prazo: ') + U.dueLabel(d.due, now) + '</span>' : '') + '</div>' +
      '<h1 class="dt-title">' + esc(d.title) + '</h1>' +
      (proj || d.project ? '<div class="dt-meta">' + PK.views.projChip({ project: d.project || (proj && proj.name), projectColor: proj && proj.color, org: (proj && proj.org) || base.org }) + '</div>' : '') +
      (desc ? '<p class="dt-desc">' + esc(desc).replace(/\n/g, '<br>') + '</p>' : '') +
      (subs.length ? sec('Subtarefas', done + ' de ' + subs.length) + '<div class="bar sub"><i style="width:' + Math.round(done / subs.length * 100) + '%"></i></div>' +
        subs.map(function (x, i) {
          return '<div class="dt-check focusable' + (x.done ? ' done' : '') + '" data-subtask="' + esc(d.id) + '|' + esc(x.id) + '"' + (i === 0 ? ' data-autofocus' : '') + '><span class="li-box">' + I.get('check', 24, ' stroke-width="3"') + '</span>' + esc(x.title) + '</div>';
        }).join('') : '') +
      (dp.on.length ? sec('Depende de', dp.on.length) + dp.on.map(taskLine).join('') : '') +
      (dp.blocks.length ? sec('Bloqueia', dp.blocks.length) + dp.blocks.map(taskLine).join('') : '') +
      (d.lastComment ? sec('Último comentário') + '<div class="dt-comment">' + (member(d.lastComment.by) ? PK.views.av(member(d.lastComment.by), 40) : '') + '<p>' + esc(d.lastComment.text) + '</p></div>' : '') +
      (siblings.length ? sec('Outras tarefas deste projeto', siblings.length) + siblings.slice(0, 4).map(taskLine).join('') : '');
    var side = sec('Responsável') + (who ? '<div class="dt-person">' + PK.views.av(who, 52) + '<div class="dt-person-main"><b>' + esc(who.name) + '</b><span>' + esc((proj && proj.org) || '') + '</span></div></div>' : '<div class="dt-empty">Sem responsável</div>') +
      sec('Prazo') + '<div class="dt-big' + (late ? ' red' : '') + '">' + (d.due ? U.longDate(d.due) + (d.due.getHours() || d.due.getMinutes() ? '<small> · ' + U.hm(d.due) + '</small>' : '') : 'Sem data') + '</div>' +
      (proj ? sec('Projeto') + '<div class="dt-link focusable" data-open="project:' + proj.id + '" style="--c:' + proj.color + '"><span class="dt-dot"></span><div class="dt-link-main"><b>' + esc(proj.name) + '</b><span>' + esc(proj.org || '') + (proj.status ? ' · ' + esc(PK.views.statusLabel(proj.status)) : '') + ' · ' + (siblings.length + 1) + ' abertas</span></div><span class="dt-go">›</span></div>' : '') +
      (url ? '<div class="dt-join"><div class="qr-box small"><div id="dt-qr"></div></div><div><b>Abrir no celular</b><span>Aponte a câmera para editar no PlanKnect</span></div></div>' : '');
    return { body: '<div class="dt"><div class="dt-main">' + main + '</div><div class="dt-side">' + side + '</div></div>' +
      (d.status !== 'done' ? '<div class="dt-tact"><button class="btn focusable" data-tdo="' + esc(d.id) + ':done">' + I.get('check', 24, ' stroke-width="3"') + ' Concluir</button>' + (d.status !== 'in_progress' ? '<button class="btn ghost focusable" data-tdo="' + esc(d.id) + ':progress">Em andamento</button>' : '') + '<button class="btn ghost focusable" data-tdo="' + esc(d.id) + ':tomorrow">Adiar para amanhã</button><button class="btn ghost focusable" data-tdo="' + esc(d.id) + ':week">Adiar 1 semana</button></div>' : ''),
      actions: [{ label: 'Fechar', act: 'close', ghost: true }],
      after: function () { if (url) PK.app.qr('dt-qr', url, 170); } };
  }

  /* ---------- projeto ---------- */
  function project(d) {
    var now = new Date(), sod = U.startOfDay(now), eow = U.addDays(sod, 7), R = 70, C = 2 * Math.PI * R;
    var all = st().tasks.filter(function (t) { return t.projectId === d.id && t.status !== 'done'; });
    (d.openTasks || []).forEach(function (t) { if (!all.some(function (x) { return x.id === t.id; })) all.push(t); });
    all.sort(function (a, b) { return (a.due || Infinity) - (b.due || Infinity); });
    var late = all.filter(function (t) { return t.due && t.due < sod; }), week = all.filter(function (t) { return t.due && t.due >= sod && t.due < eow; }), nodate = all.filter(function (t) { return !t.due; });
    var byPrio = { high: 0, medium: 0, low: 0 }; all.forEach(function (t) { byPrio[t.priority in byPrio ? t.priority : 'medium']++; });
    var byStat = {}; all.forEach(function (t) { var k = t.status === 'in_progress' || t.status === 'review' ? t.status : 'todo'; (byStat[k] = byStat[k] || []).push(t); });
    var people = {}; all.forEach(function (t) { if (t.assignee) people[t.assignee] = (people[t.assignee] || 0) + 1; });
    var pct = d.progress != null ? Math.round(d.progress * 100) : null, health = late.length >= 3 ? ['Em risco', 'late'] : late.length ? ['Atenção', 'soon'] : ['No prazo', 'ok'];
    var depList = []; all.forEach(function (t) { var x = deps(t); x.on.forEach(function (o) { depList.push([t, o]); }); });
    var main = '<div class="dt-chips"><span class="dt-type" style="--c:' + d.color + '">' + I.get('briefcase', 24) + ' ' + esc(d.org) + '</span>' + (d.status ? '<span class="pill">' + esc(PK.views.statusLabel(d.status)) + '</span>' : '') + '<span class="pill ' + health[1] + '">' + health[0] + '</span></div>' +
      '<h1 class="dt-title">' + esc(d.name) + '</h1>' + (cleanDesc(d.description) ? '<p class="dt-desc">' + esc(cleanDesc(d.description)) + '</p>' : '') +
      '<div class="pj-stats"><div><b>' + all.length + '</b><span>abertas</span></div><div class="' + (late.length ? 'red' : '') + '"><b>' + late.length + '</b><span>atrasadas</span></div><div><b>' + week.length + '</b><span>nesta semana</span></div><div><b>' + nodate.length + '</b><span>sem prazo</span></div>' +
        '<div class="pj-prio"><i class="h" style="flex:' + byPrio.high + '"></i><i class="m" style="flex:' + byPrio.medium + '"></i><i class="l" style="flex:' + byPrio.low + '"></i><span>' + byPrio.high + ' alta · ' + byPrio.medium + ' média · ' + byPrio.low + ' baixa</span></div></div>' +
      ((d.milestones || []).length ? sec('Marcos') + '<div class="dt-ms">' + d.milestones.map(function (m) {
        return '<div class="ms-row' + (m.done ? ' done' : '') + '"><span class="ms-dot">' + (m.done ? I.get('check', 18, ' stroke-width="3"') : '') + '</span><b>' + esc(m.title) + '</b><span>' + (m.done ? 'concluído' : U.dueLabel(m.due, now)) + '</span></div>'; }).join('') + '</div>' : '') +
      (byStat.in_progress ? sec('Em andamento', byStat.in_progress.length) + byStat.in_progress.slice(0, 3).map(taskLine).join('') : '') +
      (byStat.review ? sec('Em revisão', byStat.review.length) + byStat.review.slice(0, 3).map(taskLine).join('') : '') +
      (late.length ? sec('Atrasadas', late.length) + late.slice(0, 4).map(taskLine).join('') : '') +
      sec('Próximas', all.length - late.length) + all.filter(function (t) { return late.indexOf(t) < 0; }).slice(0, 5).map(taskLine).join('') +
      (depList.length ? sec('Dependências', depList.length) + depList.slice(0, 4).map(function (x) { return '<div class="pj-dep"><b>' + esc(x[0].title) + '</b><span>depende de</span><b>' + esc(x[1].title) + '</b></div>'; }).join('') : '');
    var side = (pct != null ? '<div class="dt-ring"><svg viewBox="0 0 180 180" width="180" height="180"><circle cx="90" cy="90" r="' + R + '" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="14"/>' +
      '<circle cx="90" cy="90" r="' + R + '" fill="none" stroke="' + d.color + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + C * pct / 100 + ' ' + C + '" transform="rotate(-90 90 90)"/></svg><div><b>' + pct + '%</b><span>concluído</span></div></div>' : '') +
      sec('Próximo prazo') + '<div class="dt-big">' + (week[0] || all.filter(function (t) { return t.due && t.due >= sod; })[0] ? (function (t) { return esc(t.title) + '<small> · ' + U.dueLabel(t.due, now) + '</small>'; })(week[0] || all.filter(function (t) { return t.due && t.due >= sod; })[0]) : 'Nada agendado') + '</div>' +
      sec('Quem está envolvido', Object.keys(people).length || (d.team || []).length) + '<div class="dt-people">' + ((d.team || []).length ? d.team.map(function (a) {
        return '<div class="dt-person">' + bubble(a.name, a.color, 46) + '<div class="dt-person-main"><b>' + esc(a.name) + '</b><span>' + esc(a.role || a.org || '') + '</span></div></div>'; }).join('') :
        Object.keys(people).map(function (id) { var m = member(id); return m ? '<div class="dt-person">' + PK.views.av(m, 46) + '<div class="dt-person-main"><b>' + esc(m.name) + '</b><span>' + people[id] + ' tarefa' + (people[id] > 1 ? 's' : '') + '</span></div></div>' : ''; }).join('') || '<div class="dt-empty">Ninguém atribuído</div>') + '</div>' +
      (!depList.length ? '<p class="dt-hint">Dependências entre tarefas aparecem aqui quando o PlanKnect enviar.</p>' : '');
    return { body: '<div class="dt"><div class="dt-main">' + main + '</div><div class="dt-side">' + side + '</div></div>', actions: [{ label: 'Fechar', act: 'close', ghost: true }] };
  }

  /* ---------- jantar ---------- */
  function meal(m, d) {
    var cook = member(m.cook), list = st().lists[0];
    var have = function (ing) { return list && list.items.some(function (i) { return PK.assistant.norm(i.title) === PK.assistant.norm(ing) && !i.done; }); };
    var missing = (d.ingredients || []).filter(function (x) { return !have(x); });
    var body = '<div class="dt"><div class="dt-main"><div class="dt-chips"><span class="dt-type" style="--c:#fb923c">' + I.get('chef', 24) + ' Jantar · ' + U.DAYS[m.date.getDay()] + '</span></div>' +
      '<h1 class="dt-title">' + esc(m.title) + '</h1>' + (cook ? '<div class="dt-meta">' + PK.views.av(cook, 34) + ' ' + esc(cook.name) + ' cozinha</div>' : '') +
      sec('Ingredientes', (d.ingredients || []).length) + '<div class="dt-ings">' + (d.ingredients || []).map(function (x) {
        return '<span class="dt-ing' + (have(x) ? ' in' : '') + '">' + (have(x) ? I.get('cart', 20) + ' ' : '') + esc(x) + '</span>'; }).join('') + '</div>' +
      '<p class="dt-hint">Os itens com carrinho já estão na lista ' + esc(list ? list.name : '') + '.</p></div></div>';
    return { body: body, actions: ((d.steps || []).length ? [{ label: I.get('play', 22) + ' Cozinhar passo a passo', act: 'cook', data: m.title }] : []).concat(missing.length ? [{ label: I.get('plus', 24) + ' Adicionar ' + missing.length + ' na lista', act: 'add-ingredients', data: missing.join('|') }] : []).concat([{ label: 'Fechar', act: 'close', ghost: true }]) };
  }

  /* ---------- recado ---------- */
  function note(n) {
    var by = member(n.by);
    return { body: '<div class="dt-note"><span class="dt-note-ic">' + I.get('note', 40) + '</span><p>' + esc(n.text) + '</p><div class="dt-meta">' + (by ? PK.views.av(by, 40) + ' ' + esc(by.name) : '') +
      (n.at ? ' · ' + U.hm(n.at) : '') + '</div></div>', actions: [{ label: 'Fechar', act: 'close', ghost: true }] };
  }

  /* ---------- conteúdo (Assistir) ---------- */
  var APP_OF = { netflix: 'netflix', prime: 'amazon', disney: 'com.disney.disneyplus-prod', youtube: 'youtube.leanback.v4' };
  function playParams(w) {
    var L = w.links || {};
    if (w.service === 'netflix' && L.netflix) return { contentTarget: 'https://www.netflix.com/title/' + L.netflix };
    if (w.service === 'youtube' && L.youtube) return { contentTarget: 'v=' + L.youtube };
    return null; // Prime/Disney+: abre o app (deep link a testar)
  }
  function play(w) {
    var sv = PK.views.SERVICE[w.service] || [w.service];
    PK.tv.launch(APP_OF[w.service] || w.service, sv[0] + (playParams(w) ? ' em ' + w.title : ''), playParams(w));
  }
  function watchItem(w) {
    var sv = PK.views.SERVICE[w.service] || ['', '#64748b'], now = new Date();
    var art = w.poster ? 'background-image:url(\'' + esc(w.poster) + '\')' : 'background:linear-gradient(160deg,' + (w.colors || ['#334155', '#0f172a']).join(',') + ')';
    var body = '<div class="dt wt-dt"><div class="wt-art" style="' + art + '">' + (w.poster ? '' : '<div class="pst-name">' + esc(w.title) + '</div>') + '</div><div class="dt-main">' +
      '<div class="dt-chips"><span class="dt-type" style="--c:' + sv[1] + '">' + sv[0] + '</span>' + (w.badge ? '<span class="pill soon">' + esc(w.badge) + '</span>' : '') +
      (w.followed ? '<span class="pill past">Seguindo</span>' : '') + '</div>' +
      '<h1 class="dt-title">' + esc(w.title) + '</h1>' +
      (w.ep || w.date ? '<div class="dt-meta">' + I.get('calendar', 26) + ' ' + esc([w.ep, w.date && (U.sameDay(w.date, now) ? 'disponível hoje' : U.longDate(w.date))].filter(Boolean).join(' · ')) + '</div>' : '') +
      (w.kids ? '<div class="dt-meta">' + I.get('users', 26) + ' Bom para assistir com as crianças</div>' : '') +
      (w.overview ? '<p class="dt-desc">' + esc(w.overview) + '</p>' : '') +
      '<p class="dt-hint">' + (playParams(w) ? 'Abre direto no título.' : 'Abre o app; o título fica a um clique (link direto a testar no ' + sv[0] + ').') + '</p>' +
      (w.trailer ? '<div id="wt-trailer" class="wt-trailer"></div>' : '') + '</div></div>';
    return { body: body, actions: [{ label: I.get('play', 22) + ' Assistir no ' + sv[0], act: 'play', data: w.id }]
      .concat(w.trailer ? [{ label: 'Ver trailer aqui', act: 'trailer', data: w.id, ghost: true }] : [])
      .concat([{ label: w.followed ? 'Deixar de seguir' : 'Seguir', act: 'follow', data: (w.followed ? '-' : '+') + w.title, ghost: true }, { label: 'Fechar', act: 'close', ghost: true }]) };
  }

  function list(l) {
    return { body: '<div class="dt-list">' + PK.views.listPanel(st(), l) + '</div>', actions: [{ label: 'Abrir todas as listas', act: 'goto-lists', data: l.id }, { label: 'Fechar', act: 'close', ghost: true }] };
  }

  /* Abre o modal (com "carregando" enquanto busca) */
  function open(kind, id) {
    var s = st();
    if (kind === 'deal') { PK.deals.open(id); return; }
    if (kind === 'note') { var n = s.notes.filter(function (x) { return x.id === id; })[0]; if (n) PK.app.openModal(note(n), 'detail'); return; }
    if (kind === 'watch') { var w = (s.watch.items || []).filter(function (x) { return x.id === id; })[0]; if (w) PK.app.openModal(watchItem(w), 'detail wide'); return; }
    if (kind === 'list') { var l = s.lists.filter(function (x) { return x.id === id; })[0]; if (l) PK.app.openModal(list(l), 'detail wide'); return; }
    var mealObj = kind === 'meal' ? s.meals.filter(function (x) { return x.title === id; })[0] : null;
    var ev = kind === 'event' ? s.events.filter(function (x) { return x.id === id; })[0] : null;
    if (ev && ev.private) { PK.app.openModal({ body: '<div class="dt-note"><p>Ocupado</p><div class="dt-meta">' + when(ev) + '</div></div>' }, 'detail'); return; }
    var ov = PK.app.openModal({ body: '<div class="dt-loading"><span class="spin"></span> Carregando…</div>', actions: [{ label: 'Fechar', act: 'close', ghost: true }] }, 'detail wide');
    PK.data.detail(kind, id).then(function (d) {
      if (kind === 'event') { d.start = U.toDate(d.start); d.end = U.toDate(d.end); }
      if (kind === 'task' && d.due) d.due = U.toDate(d.due);
      if (kind === 'project') {
        (d.milestones || []).forEach(function (m) { m.due = U.toDate(m.due); });
        var pc = (s.projects.filter(function (x) { return x.id === d.id; })[0] || {}).color;
        (d.openTasks || []).forEach(function (t) { t.due = U.toDate(t.due); t.projectColor = t.projectColor || pc; });
        // a API de detalhe não traz cor/organização/progresso — completa com o que veio no painel
        var pl = s.projects.filter(function (x) { return x.id === d.id; })[0] || {};
        d.name = d.name || d.title || pl.name; d.org = d.org || pl.org || ''; d.color = d.color || pl.color || '#7c5cff';
        if (d.progress == null) d.progress = pl.progress || 0;
      }
      if (kind === 'task') (d.subtasks || []).forEach(function (x) { if (x.due) x.due = U.toDate(x.due); });
      if (kind === 'event') PK.details.last = d;
      var view = kind === 'event' ? event(d) : kind === 'task' ? task(d) : kind === 'project' ? project(d) : meal(mealObj, d);
      PK.app.fillModal(ov, view);
    }).catch(function (e) { PK.app.fillModal(ov, { body: '<div class="dt-empty">Não consegui carregar: ' + esc(e.message) + '</div>' }); });
  }

  function trailer(w) {
    var box = document.getElementById('wt-trailer'); if (!box || !w.trailer) return;
    box.innerHTML = '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(w.trailer) + '?autoplay=1&mute=1&controls=0&loop=1&playlist=' + encodeURIComponent(w.trailer) + '" allow="autoplay" frameborder="0"></iframe>';
  }
  // Gravação: usa a URL que veio no detalhe ou pede uma URL assinada nova ao backend
  function recording(id) {
    var d = PK.details.last && PK.details.last.id === id ? PK.details.last : null, u = d && recordingOf(d), r = (d && d.recording) || {};
    var go = function (url, kind) { PK.player.open(url, d ? d.title : 'Gravação', kind || r.kind || (/\.(mp3|m4a|wav|ogg)(\?|$)/i.test(url) ? 'audio' : 'video')); };
    if (u && u !== 'api') return go(u);
    PK.toast('Abrindo a gravação…');
    PK.api.recording(id).then(function (x) { go(x.url || x.signed_url, x.kind); }).catch(function () { PK.toast('Gravação indisponível'); });
  }
  return { open: open, play: play, trailer: trailer, recording: recording, last: null };
})();
