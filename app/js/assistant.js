/* Assistente da TV.
 *  - Conectado: o texto vai para a IA do PlanKnect (POST /api/tv/assistant), que executa e devolve
 *    { reply, actions:[{type:'navigate'|'meeting'|'refresh', ...}] }.
 *  - Demo: este interpretador local faz o mesmo papel, para testar o fluxo de ponta a ponta.
 *  Também cuida da captura de voz (Web Speech / microfone USB) — veja docs/FAMILY_HUB.md.
 */
var PK = window.PK || {};
window.PK = PK;

PK.assistant = (function () {
  var U = PK.util;
  var WD = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  var WD_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!?¿¡]/g, '').replace(/\s+/g, ' ').trim();
  }
  // Mesma normalização, mas preservando o tamanho (para recuperar acentos do texto original)
  function normKeep(s) {
    return String(s || '').split('').map(function (ch) { var n = ch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return n.length === 1 ? n : ch; }).join('');
  }
  var original = '';
  function orig(frag) {
    var i = normKeep(original).indexOf(frag);
    return i >= 0 ? original.substr(i, frag.length) : frag;
  }
  function cap(s) { s = orig(s.trim()); return s.charAt(0).toUpperCase() + s.slice(1); }
  function splitItems(s) {
    return s.split(/\s*(?:,|\be\b|\band\b|\+)\s*/).map(function (x) { return x.replace(/^(um|uma|uns|umas|o|a|os|as|de|some|a|an)\s+/, '').trim(); })
      .filter(function (x) { return x.length > 1; }).map(cap);
  }
  function parseDay(t) {
    var today = U.startOfDay(new Date());
    if (/\b(hoje|today)\b/.test(t)) return today;
    if (/\b(depois de amanha)\b/.test(t)) return U.addDays(today, 2);
    if (/\b(amanha|tomorrow)\b/.test(t)) return U.addDays(today, 1);
    for (var i = 0; i < 7; i++) {
      if (new RegExp('\\b(' + WD[i] + '|' + WD_EN[i] + ')').test(t)) {
        var diff = (i - today.getDay() + 7) % 7 || 7;
        return U.addDays(today, diff);
      }
    }
    return null;
  }
  function stripDay(s) {
    return s.replace(/\s*\b(para|pra|on|for|na|no)?\s*(hoje|amanha|depois de amanha|today|tomorrow|domingo|segunda|terca|quarta|quinta|sexta|sabado|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(-feira)?\b.*$/, '').trim();
  }
  function findMember(state, t) {
    return state.members.filter(function (m) { return new RegExp('\\b' + norm(m.name) + '\\b').test(t); })[0];
  }
  function score(a, b) {
    var wa = norm(a).split(' ').filter(function (w) { return w.length > 2; });
    var wb = norm(b);
    return wa.reduce(function (s, w) { return s + (wb.indexOf(w.slice(0, Math.max(4, w.length - 2))) >= 0 ? 1 : 0); }, 0);
  }
  function listFor(state, t) {
    var l = state.lists.filter(function (x) { return t.indexOf(norm(x.name)) >= 0; })[0];
    if (!l && /farmacia|remedio/.test(t)) l = state.lists.filter(function (x) { return /farm/i.test(x.name); })[0];
    return l || state.lists[0];
  }
  function fmtEvents(list) {
    return list.map(function (e) { return (e.allDay ? '' : U.hm(e.start) + ' ') + e.title; }).join('; ');
  }

  /* Interpretador local (modo demo). ctx.state = estado atual da TV */
  function local(text, ctx) {
    var state = ctx.state, t = norm(text), m, who;
    original = String(text || '').replace(/\s+/g, ' ').trim();
    var res = function (reply, actions, en) { return Promise.resolve({ reply: reply, en: en, actions: actions || [{ type: 'refresh' }] }); };

    // 1. Modo reunião
    if (/(modo (de )?reuniao|meeting mode|estou em reuniao|entrar em reuniao|on air)/.test(t)) {
      var off = /\b(sai|sair|desliga|desligar|termina|encerra|exit|off|stop|acabou)\b/.test(t);
      return res(off ? 'Saindo do modo reunião.' : 'Modo reunião ligado. Boa reunião!', [{ type: 'meeting', on: !off }], off ? 'Leaving meeting mode. Welcome back.' : 'Meeting mode is on. I shall keep the household quiet — do have a good meeting.');
    }

    // 2. Chores: "a Sofia terminou de arrumar a cama", "Wesley fez tudo"
    who = findMember(state, t);
    if (who && who.kid && /\b(terminou|fez|acabou|completou|concluiu|ja|finished|did|done|arrumou|guardou|escovou|colocou|separou|leu|levou|deu)\b/.test(t)) {
      var mine = state.chores.filter(function (c) { return c.member === who.id && !c.done; });
      if (/\b(tudo|todas|todos|everything|all)\b/.test(t)) {
        return Promise.all(mine.map(function (c) { return PK.mock.setChore(c.id, true); })).then(function () {
          return { reply: 'Uau! ' + who.name + ' fez todas as missões' + '! ⭐', en: 'Splendid! ' + who.name + ' has finished every mission. Well done indeed.', actions: [{ type: 'refresh' }, { type: 'navigate', view: 'chores' }, { type: 'celebrate', member: who.id }] };
        });
      }
      var best = null, bs = 0;
      mine.forEach(function (c) { var sc = score(c.title, t); if (sc > bs) { bs = sc; best = c; } });
      if (best) {
        return PK.mock.setChore(best.id, true).then(function () {
          return { reply: 'Boa, ' + who.name + '! "' + best.title + '" feito, +' + best.points + ' estrelas.', en: 'Well done, ' + who.name + '. ' + best.title + ' is marked as done — that is ' + best.points + ' more stars.', actions: [{ type: 'refresh' }, { type: 'navigate', view: 'chores' }, { type: 'celebrate', member: who.id }] };
        });
      }
      var all = state.chores.filter(function (c) { return c.member === who.id && c.done; }), doneBest = null;
      all.forEach(function (c) { if (score(c.title, t) > 0 && (!doneBest || score(c.title, t) > score(doneBest.title, t))) doneBest = c; });
      if (doneBest) return res('"' + doneBest.title + '" já estava feito. Valeu, ' + who.name + '! ' + (mine.length ? 'Ainda faltam ' + mine.length + ' missões.' : 'Tudo pronto por hoje!'), [{ type: 'navigate', view: 'chores' }]);
      return res('Não achei essa missão. Faltam para ' + who.name + ': ' + mine.map(function (c) { return c.title; }).join(', ') + '.', [{ type: 'navigate', view: 'chores' }]);
    }

    // 3. Lista de compras: "adiciona leite e ovos na lista", "precisamos comprar pão", "acabou o café"
    m = t.match(/^(?:adiciona(?:r)?|adicione|coloca(?:r)?|coloque|poe|por|bota(?:r)?|inclui(?:r)?|add|put)\s+(.+?)\s+(?:na|a|para a|pra|no|to(?: the)?|on(?: the)?)\s+(?:lista|list|shopping|compras|mercado|farmacia)/) ||
        t.match(/(?:precisa(?:mos)? (?:de )?comprar|tem que comprar|comprar|acabou (?:o |a |os |as )?|we need|buy)\s+(.+)/);
    if (m) {
      var items = splitItems(m[1].replace(/\s+(na|da|no|do)\s+(lista|farmacia|mercado).*$/, ''));
      var list = listFor(state, t);
      if (items.length) {
        return PK.mock.addListItems(list.id, items).then(function () {
          return { reply: 'Adicionei ' + items.join(', ') + ' na lista ' + list.name + '.', en: 'Very good. I have added ' + (items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items[0]).toLowerCase() + ' to the ' + list.name + ' list.', actions: [{ type: 'refresh' }, { type: 'navigate', view: 'lists', list: list.id }] };
        });
      }
    }

    // 4. Nova task: "adiciona uma tarefa ligar para o Paulo amanhã", "nova task urgente revisar contrato"
    m = t.match(/(?:adiciona(?:r)?|adicione|cria(?:r)?|crie|nova|novo|add|create|new)\s+(?:uma\s+|a\s+)?(?:tarefa|task|to-?do|lembrete)\s*(?:de\s+|para\s+|:)?\s*(.+)/);
    if (m) {
      var due = parseDay(m[1]), body = stripDay(m[1]);
      var prio = /\b(urgente|alta prioridade|importante|urgent|high)\b/.test(body) ? 'high' : 'medium';
      body = body.replace(/\b(urgente|alta prioridade|importante|urgent|high priority)\b/g, '').trim();
      var asg = findMember(state, body);
      return PK.mock.addTask({ title: cap(body), due: due, priority: prio, assignee: asg ? asg.id : PK.config.owner }).then(function () {
        return { reply: 'Task criada: "' + cap(body) + '"' + (due ? ' para ' + U.dueLabel(due, new Date()) : '') + (prio === 'high' ? ' (alta prioridade)' : '') + '.', en: 'Certainly. I have created the task ' + cap(body) + (prio === 'high' ? ', marked as high priority' : '') + '.',
          actions: [{ type: 'refresh' }, { type: 'navigate', view: 'work' }] };
      });
    }

    // 5. Novo evento: "marca dentista da Lara sexta às 10"
    m = t.match(/(?:marca(?:r)?|marque|agenda(?:r)?|agende|schedule)\s+(.+)/);
    if (m && parseDay(m[1])) {
      var day = parseDay(m[1]), hh = m[1].match(/\b(?:as|a|at)\s+(\d{1,2})(?:[:h](\d{2}))?/);
      var title = cap(stripDay(m[1].replace(/\b(?:as|a|at)\s+\d{1,2}([:h]\d{2})?\s*(h|horas)?/, '')));
      var start = new Date(day); start.setHours(hh ? +hh[1] : 9, hh && hh[2] ? +hh[2] : 0, 0, 0);
      var mem = state.members.filter(function (x) { return new RegExp('\\b' + norm(x.name) + '\\b').test(t); }).map(function (x) { return x.id; });
      return PK.mock.addEvent({ title: title, start: start, end: new Date(start.getTime() + 3600000), members: mem, type: 'family' }).then(function () {
        return { reply: 'Marquei "' + title + '" ' + U.dueLabel(day, new Date()) + (hh ? ' às ' + U.hm(start) : '') + '.', en: 'It is in the diary: ' + title + (hh ? ' at ' + U.hm(start) : '') + '.', actions: [{ type: 'refresh' }, { type: 'navigate', view: 'agenda', mode: 'week' }] };
      });
    }

    // 6a. Alfred: resumo do dia e Modo Trabalho
    if (/(modo trabalho|hdmi|mostrar o computador|mostra o computador|tela do computador|computador|work mode|my computer|show computer|airplay)/.test(t)) return res('Abrindo o Modo Trabalho com o computador na tela.', [{ type: 'work' }], 'Bringing your computer up on the screen now.');
    if (/(resumo|briefing|como esta (o )?meu dia|como vai ser (o )?dia|o que eu preciso saber|jarvis|knect|alfred|my day)/.test(t)) return res('Aqui está o resumo do dia.', [{ type: 'brief' }], 'Here is your day at a glance.');
    // 6b. Assistir: seguir séries, o que tem de novo
    m = t.match(/^(?:seguir|segue|acompanhar|follow)\s+(?:a serie\s+|o\s+|a\s+)?(.+)/) || t.match(/^(?:parar de seguir|deixar de seguir|unfollow)\s+(.+)/);
    if (m) {
      var on = !/^(parar|deixar|unfollow)/.test(t), name = cap(m[1]);
      return PK.mock.follow(name, on).then(function (r) {
        return { reply: on ? 'Seguindo ' + r.title + '. Aviso aqui quando sair episódio novo.' : 'Deixei de seguir ' + r.title + '.', actions: [{ type: 'refresh' }, { type: 'navigate', view: 'watch' }] };
      });
    }
    if (/(o que (tem|ha) (de novo|pra assistir|para assistir)|episodio novo|lancamento|pra assistir|para assistir|filme da sexta)/.test(t)) {
      var fresh = ((state.watch && state.watch.items) || []).filter(function (w) { return w.followed && /novo|nova/i.test(w.badge || ''); });
      return res(fresh.length ? 'Tem novidade: ' + fresh.slice(0, 3).map(function (w) { return w.title + ' (' + w.badge.toLowerCase() + ')'; }).join(', ') + '.' : 'Nada novo nas séries que vocês seguem.', [{ type: 'navigate', view: 'watch' }]);
    }
    // 6c. Avisar a família (aparece em todas as TVs da casa)
    m = t.match(/^(?:avisa|avise|anuncia|anuncie|announce)\s+(?:todo mundo|a familia|geral|everyone)?\s*(?:que\s+)?(.+)/);
    if (m) {
      var msg = cap(m[1]);
      return PK.data.broadcast({ kind: 'family', icon: /jantar|almoco|comida/.test(t) ? 'chef' : 'note', label: 'RECADO', title: msg, ttl: 10 }).then(function () {
        return { reply: 'Avisei a família: "' + msg + '".', en: 'I have let the family know.', actions: [] };
      });
    }
    // 6d. Casa (ThinQ)
    if (/\b(ar|ar-condicionado|ar condicionado|aircon|ac)\b/.test(t) && /(liga|desliga|coloca|poe|graus|temperatura|turn)/.test(t)) {
      var acs = (state.devices || []).filter(function (d) { return d.type === 'ac'; });
      var ac = acs.filter(function (d) { return t.indexOf(norm(d.room)) >= 0; })[0] || acs[0];
      if (ac) {
        var deg = t.match(/(\d{2})\s*(graus|°)?/), cmd2 = {};
        if (/desliga|turn off/.test(t)) cmd2.power = false; else cmd2.power = true;
        if (deg) cmd2.target = +deg[1];
        return PK.mock.deviceControl(ac.id, cmd2).then(function () {
          return { reply: cmd2.power === false ? ac.name + ' desligado.' : ac.name + ' ligado' + (cmd2.target ? ' em ' + cmd2.target + '°' : '') + '.', actions: [{ type: 'refresh' }, { type: 'navigate', view: 'home-devices' }] };
        });
      }
    }
    if (/(maquina|lavar|lava e seca|lava-loucas|lava loucas|geladeira|robo|aspirador)/.test(t)) {
      var dv = (state.devices || []).filter(function (d) { return /maquina|lavar|lava e seca/.test(t) ? d.type === 'washer' : /louca/.test(t) ? d.type === 'dishwasher' : /geladeira/.test(t) ? d.type === 'fridge' : d.type === 'robot'; })[0];
      if (dv) {
        if (dv.type === 'robot' && /(liga|comeca|aspira|limpa|start)/.test(t)) return PK.mock.deviceControl(dv.id, { start: true }).then(function () { return { reply: 'Robô começou a limpeza.', actions: [{ type: 'refresh' }] }; });
        var info = dv.state === 'running' ? 'termina em ' + dv.endsIn + ' min' : dv.state === 'done' ? 'já terminou' : dv.type === 'fridge' ? (dv.door ? 'está com a porta aberta' : 'está ok, ' + dv.fridge + '°') : 'está parada';
        return res(dv.name + ' ' + info + '.', [{ type: 'navigate', view: 'home-devices' }]);
      }
    }

    // 6. Perguntas
    if (/(o que (tem|temos|vem)|que tem hoje|proximo|proxima|agenda de hoje|what'?s next|what'?s on)/.test(t)) {
      var now = new Date();
      var nx = state.events.filter(function (e) { return !e.allDay && e.end > now && U.sameDay(e.start, now); }).slice(0, 3);
      return res(nx.length ? 'Hoje ainda tem: ' + fmtEvents(nx) + '.' : 'Nada mais na agenda hoje. Dia tranquilo!', [{ type: 'navigate', view: 'agenda', mode: 'people' }], nx.length ? 'Still to come today: ' + fmtEvents(nx) + '.' : 'Nothing further in the diary today. A quiet day, I should think.');
    }
    if (/(tempo|clima|chover|chuva|frio|calor|weather|rain)/.test(t) && state.weather) {
      var w = state.weather, tm = w.days[1];
      return res('Agora ' + w.temp + '° e ' + PK.icons.weatherText(w.code).toLowerCase() + '. Amanhã: ' + tm.min + '° a ' + tm.max + '°, ' + tm.rain + '% de chance de chuva.', [], 'It is ' + w.temp + ' degrees at the moment. Tomorrow, ' + tm.min + ' to ' + tm.max + ', with a ' + tm.rain + ' percent chance of rain.');
    }
    if (/(jantar|janta|dinner|comida)/.test(t)) {
      var md = state.meals.filter(function (x) { return U.sameDay(x.date, new Date()); })[0];
      var ck = md && state.members.filter(function (x) { return x.id === md.cook; })[0];
      return res(md ? 'Hoje o jantar é ' + md.title + (ck ? ', quem cozinha é ' + ck.name : '') + '.' : 'Ainda não tem jantar planejado para hoje.', [], md ? 'Dinner tonight is ' + md.title + (ck ? ', prepared by ' + ck.name : '') + '.' : 'There is no dinner planned for tonight as yet.');
    }

    // 7. Navegação
    if (/(calendario|agenda|calendar)/.test(t)) {
      who = findMember(state, t);
      return res('Abrindo a agenda' + (who ? ' de ' + who.name : ' da família') + '.', [{ type: 'navigate', view: 'agenda', member: who ? who.id : 'all', mode: /hoje|today|pessoa/.test(t) ? 'people' : 'week', familyOnly: /familia|family/.test(t) }]);
    }
    if (/(lista|compras|shopping|mercado)/.test(t)) return res('Abrindo as listas.', [{ type: 'navigate', view: 'lists' }]);
    if (/(chore|missao|missoes|tarefas das criancas|kids)/.test(t)) return res('Abrindo as missões das crianças.', [{ type: 'navigate', view: 'chores' }]);
    if (/(projeto|prioridade|trabalho|work|tasks)/.test(t)) return res('Abrindo projetos e prioridades.', [{ type: 'navigate', view: 'work' }]);
    if (/(netflix|youtube|disney|prime)/.test(t)) {
      var app = PK.config.apps.filter(function (a) { return t.indexOf(norm(a.name).split(' ')[0]) >= 0; })[0];
      if (app) return res('Abrindo ' + app.name + '.', [{ type: 'launch', app: app.id, name: app.name }]);
    }

    return res('Ainda não entendi. Tente: "adiciona leite na lista", "Sofia terminou de arrumar a cama" ou "nova tarefa ligar para o Paulo amanhã".', [], 'I beg your pardon, I did not quite follow. You might try: add milk to the list, or, what is on today?');
  }

  /* ---------- captura de voz ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  function canListen() { return !!SR; }
  function listen(handlers) {
    if (!SR) { handlers.onError('no-sr'); return; }
    rec = new SR();
    rec.lang = handlers.lang || 'pt-BR'; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var txt = '', final = false;
      for (var i = e.resultIndex; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) final = true; }
      handlers.onPartial(txt); if (final) handlers.onFinal(txt);
    };
    rec.onerror = function (e) { handlers.onError(e.error || 'erro'); };
    rec.onend = function () { handlers.onEnd && handlers.onEnd(); };
    try { rec.start(); } catch (e) { handlers.onError('start'); }
  }
  function stop() { if (rec) { try { rec.abort(); } catch (e) {} rec = null; } }
  function speak(text) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    try {
      var u = new SpeechSynthesisUtterance(text.replace(/[⭐]/g, '')); u.lang = 'pt-BR'; u.rate = 1.05;
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  return { local: local, canListen: canListen, listen: listen, stop: stop, speak: speak, norm: norm };
})();
