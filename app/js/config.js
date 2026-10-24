/* Configuração do PlanKnect TV. A API pode sobrescrever (household.location etc.)
 * e o que muda em Ajustes na TV fica salvo em localStorage ("pk.settings"). */
var PK = window.PK || {};
window.PK = PK;

PK.config = {
  baseUrl: 'https://planknect.com',
  // Endereço da API da TV. No Lovable/Supabase: 'https://<project-ref>.supabase.co/functions/v1/tv'
  apiBase: 'https://mfenmzwuosubzfuehywc.supabase.co/functions/v1/tv',
  linkUrl: 'https://planknect.com/tv',          // QR de pareamento (?code=XXXX-XXXX) — página do Lovable
  remoteUrl: 'https://planknect.com/tv/remote', // celular como controle de voz
  remoteReady: false, // a página acima ainda não existe no PlanKnect (404) — mostra o QR só quando existir
  listUrl: 'https://planknect.com/lists',       // levar a lista de compras no celular

  location: { name: 'Sydney', lat: -33.80, lon: 151.28 },

  // Quem é o "dono" da TV: as reuniões dele ativam o modo reunião
  owner: 'm',

  refresh: { dataMs: 20 * 1000, weatherMs: 20 * 60 * 1000 },
  nextHours: 14,
  night: { from: 22, to: 6 },
  pixelShiftMin: 3,

  meeting: {
    auto: true,             // entra sozinho quando começa uma reunião com vídeo
    leadMin: 1,             // minutos antes do início
    style: 'banner',        // 'banner' (discreto, padrão Knect Meeting) | 'backdrop' (fundo p/ câmera) | 'onair' (aviso p/ família)
    fullStyle: 'backdrop',  // tela cheia: 'backdrop' | 'onair' (◀▶▲▼ no modo reunião)
    scene: 'library-warm',  // id de PK.scenes (fotos, vídeos ou animados)
    brandTitle: 'Marcelo Silva',
    brandSubtitle: 'PlanKnect · Family & Work OS',
    onAirMessage: 'Shhh… papai está em reunião'
  },

  ambient: { afterMin: 10, scene: 'auto', weather: true, agenda: true }, // 0 = nunca
  home: { scene: 'auto' },     // fundo da tela inicial: 'auto' | id de cenário | 'dark'

  // Alfred (conceito Jarvis): nome, voz e momentos do briefing automático
  work: { hdmi: 'auto' },
  ai: { name: 'Alfred', voice: true, lang: 'en-GB', listenLang: 'pt-BR', planknectVoice: true, particles: true, scene: 'library-warm' },

  // Avisos (por cima de tudo no app; por cima do Netflix via serviço da TV ou agente local)
  alerts: { meetingLeadMin: 5, snoozeMin: 2 },

  // Rotinas: a TV abre sozinha (via agente local) ou, se já estiver ligada, o app entra no modo rotina
  routines: {
    morning: { start: '06:45', until: '08:15', label: 'Saída para a escola', days: [1, 2, 3, 4, 5] },
    bedtime: { start: '20:00', until: '20:30', label: 'Hora de dormir', days: [0, 1, 2, 3, 4, 5, 6] }
  },

  // Agente local (Raspberry Pi / Home Assistant) na rede de casa — opcional
  agentUrl: '',
  // Computador ligado na TV (agent/computer-helper.js): "Entrar" abre o Meet nele
  computer: { url: '', secret: '' }, // preenchido em js/config.local.js (não vai para o GitHub)

  // Conteúdo: em produção o PlanKnect faz o proxy do TMDB (a chave fica no servidor).
  // Para testes locais dá para pôr uma chave v3 do TMDB aqui.
  tmdb: { apiKey: '', region: 'AU', language: 'pt-BR' },
  providers: { 8: 'netflix', 9: 'prime', 119: 'prime', 337: 'disney' },

  // id = app no LG webOS · samsung = id do mesmo app no Samsung Tizen (conferido na Q60BA da sala)
  apps: [
    { id: 'netflix',                    samsung: '3201907018807', name: 'Netflix',     style: 'netflix' },
    { id: 'youtube.leanback.v4',        samsung: '111299001912',  name: 'YouTube',     style: 'youtube' },
    { id: 'com.disney.disneyplus-prod', samsung: '3201901017640', name: 'Disney+',     style: 'disney' },
    { id: 'amazon',                     samsung: '3201910019365', name: 'Prime Video', style: 'prime' },
    { id: 'com.webos.app.livetv',       samsung: '3201606009684', name: 'TV ao vivo',  style: 'livetv', samsungName: 'Spotify', samsungStyle: 'spotify' }
  ]
};

/* Ajustes salvos na TV */
PK.settings = (function () {
  var KEY = 'pk.settings';
  var s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  function get(path) {
    if (s[path] !== undefined) return s[path];
    var p = path.split('.'), v = PK.config;
    for (var i = 0; i < p.length; i++) v = v ? v[p[i]] : undefined;
    return v;
  }
  function set(path, val) { s[path] = val; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  return { get: get, set: set };
})();
