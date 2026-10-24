/* Conteúdo via TMDB (themoviedb.org).
 * Em produção o PlanKnect faz isto no servidor (GET /api/tv/watch) e a chave nunca vai para a TV.
 * Aqui serve para testar com uma chave v3 em config.tmdb.apiKey: busca as séries seguidas,
 * o último/próximo episódio, em qual serviço está (região AU), lançamentos e filmes de família. */
var PK = window.PK || {};
window.PK = PK;

PK.content = (function () {
  var C = PK.config, U = PK.util;
  var IMG = 'https://image.tmdb.org/t/p/';
  function api(path, q) {
    var t = C.tmdb, qs = 'api_key=' + encodeURIComponent(t.apiKey) + '&language=' + t.language;
    for (var k in q || {}) qs += '&' + k + '=' + encodeURIComponent(q[k]);
    return fetch('https://api.themoviedb.org/3' + path + '?' + qs).then(function (r) { if (!r.ok) throw new Error('TMDB ' + r.status); return r.json(); });
  }
  function service(providers) {
    var reg = providers && providers.results && providers.results[C.tmdb.region];
    var flat = (reg && reg.flatrate) || [];
    for (var i = 0; i < flat.length; i++) if (C.providers[flat[i].provider_id]) return C.providers[flat[i].provider_id];
    return null;
  }
  function trailerOf(videos) {
    var v = ((videos && videos.results) || []).filter(function (x) { return x.site === 'YouTube' && /Trailer|Teaser/.test(x.type); })[0];
    return v ? v.key : null;
  }
  function followedShow(name) {
    return api('/search/tv', { query: name }).then(function (r) {
      var hit = r.results && r.results[0]; if (!hit) return null;
      return api('/tv/' + hit.id, { append_to_response: 'watch/providers,videos' }).then(function (d) {
        var ep = d.next_episode_to_air && Date.parse(d.next_episode_to_air.air_date) - Date.now() < 7 * 864e5 ? d.next_episode_to_air : d.last_episode_to_air;
        var date = ep && ep.air_date ? new Date(ep.air_date + 'T12:00:00') : null;
        var fresh = date && Math.abs(date - Date.now()) < 7 * 864e5;
        return {
          id: 'tmdb-tv-' + d.id, title: d.name, kind: 'tv', followed: true, service: service(d['watch/providers']) || 'netflix',
          poster: d.poster_path ? IMG + 'w342' + d.poster_path : null, overview: d.overview,
          ep: ep ? 'T' + ep.season_number + ' · E' + ep.episode_number : '', date: date,
          badge: fresh ? (ep.episode_number === 1 ? 'Nova temporada' : 'Novo episódio') : 'Seguindo',
          trailer: trailerOf(d.videos)
        };
      });
    });
  }
  function discover(kind, extra) {
    var q = { watch_region: C.tmdb.region, with_watch_providers: Object.keys(C.providers).join('|'), with_watch_monetization_types: 'flatrate', sort_by: 'popularity.desc' };
    for (var k in extra) q[k] = extra[k];
    return api('/discover/' + kind, q).then(function (r) {
      return (r.results || []).slice(0, 6).map(function (x) {
        return { id: 'tmdb-' + kind + '-' + x.id, title: x.name || x.title, kind: kind === 'tv' ? 'tv' : 'movie', service: 'netflix',
          poster: x.poster_path ? IMG + 'w342' + x.poster_path : null, overview: x.overview, badge: kind === 'tv' ? 'Lançamento' : 'Família' };
      });
    });
  }
  // follows: lista de nomes de séries. Devolve o mesmo formato de state.watch.
  function load(follows) {
    if (!C.tmdb.apiKey) return Promise.resolve(null);
    var since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return Promise.all([
      Promise.all(follows.map(function (n) { return followedShow(n).catch(function () { return null; }); })),
      discover('tv', { 'first_air_date.gte': since }).catch(function () { return []; }),
      discover('movie', { with_genres: '10751' }).catch(function () { return []; })
    ]).then(function (r) {
      var fam = r[2].slice(0, 3);
      return { items: r[0].filter(Boolean).concat(r[1], fam), movieNight: { day: 5, time: '19:30', candidates: fam.map(function (f) { return f.id; }), votes: U.store.get('votes', {}) } };
    });
  }
  return { load: load };
})();
