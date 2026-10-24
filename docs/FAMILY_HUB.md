# PlanKnect TV: Family Hub (produto + o que o Lovable constrói)

O app da TV (LG webOS) já está pronto e funciona em modo demonstração. Para ligá-lo à família de verdade, o PlanKnect (no Lovable) precisa de:

1. **Backend:** uma Edge Function `tv` + tabelas novas. Contrato completo em [`PLANKNECT_TV_API.md`](PLANKNECT_TV_API.md).
2. **Páginas no site:** listadas abaixo.
3. **Devolver os dados de conexão:** a lista está no fim deste arquivo.

---

## 1. O que a TV mostra

| Aba | Botão do controle | Conteúdo | De onde vem |
|---|---|---|---|
| Início | Vermelho | Foto ou vídeo de fundo, relógio, "A seguir", linha do tempo de hoje, prateleira (clima, missões, mercado, jantar, recado), dock de apps | `/dashboard` |
| Agenda | Verde | Hoje por pessoa e Semana; filtro "Só família"; eventos privados como "Ocupado" | `events`, `members`, `meals` |
| Missões | Amarelo | Chores das crianças com estrelas, sequência, meta de recompensa e confete | `chores`, `members[].stars/streak/reward` |
| Listas | Azul | Mercado, Farmácia, Casa, Pagamentos; QR para levar no celular | `lists` |
| Assistir | — | Séries seguidas com "Novo episódio", lançamentos, Filme da sexta | `/watch` (TMDB no servidor) |
| Casa | — | Aparelhos LG ThinQ com estado e controle | `devices` |
| Clima | — | Agora, 24 h, 7 dias, dicas ligadas à agenda | Open-Meteo (a TV busca direto; o servidor só manda `household.location`) |
| Trabalho | — | Projetos e prioridades | `projects`, `tasks` |

**OK em qualquer item abre o detalhe:** reunião (participantes, pauta, anexos, QR do Meet), task (subtarefas), projeto (milestones, equipe), jantar (ingredientes que faltam → lista), recado, lista e conteúdo.

**Modos de tela cheia**
- **Modo reunião:** liga sozinho nas reuniões do dono da TV. Duas cenas: *Fundo para câmera* (só cenário + marca pessoal, sem dados privados) e *Aviso para a família* ("EM REUNIÃO", minutos restantes).
- **Avisos:** reunião em 5 min com timer ao vivo, Adiar e Fechar; campainha; "Lava e seca terminou"; recados ("Jantar pronto!"). Por cima do Netflix, quem avisa é o serviço da TV (`service/`).
- **Rotinas:** 6h45, missões da manhã com contagem para sair e dica do tempo; 20h, contagem para dormir e agenda de amanhã.
- **Ambiente:** depois de 10 min sem uso, relógio e fotos da família com "Há 3 anos, hoje".

---

## 1b. nest-hub (Google Nest Hub da cozinha)

Versão de 1024×600, com toque, que abre no Nest Hub por Cast. Tem cinco abas:
- **Hoje:** relógio, "a seguir" e a linha do tempo.
- **Lista:** marca itens com o toque, com QR para levar no celular.
- **Missões** das crianças.
- **Jantar:** ingredientes e botão para adicionar à lista os que faltam.
- **Timers** de cozinha: vários ao mesmo tempo, com alarme.

Depois de 5 minutos sem toque, mostra fotos e o relógio. O pareamento é pelo mesmo QR (o Hub aparece em Dispositivos como "Google Nest Hub").

O Lovable só precisa hospedar os arquivos em `planknect.com/hub/` e registrar o receptor Cast. Detalhes em `PLANKNECT_TV_API.md`, seção 9.

## 2. Páginas que o Lovable cria no site

| Rota | Quem usa | O que faz | Chama |
|---|---|---|---|
| `/tv` | Celular de quem lê o QR da TV | Login (se preciso, voltando com `?code=` preservado) → "Conectar a TV **{device_name}** à família [▾]" → Conectar / Recusar. Sem `?code`, mostra um campo para o código `XXXX-XXXX` | `POST /device/approve` |
| `/tv/remote` | Celular como microfone | Botão grande "Segure para falar" (Web Speech API, `pt-BR`), campo de texto, últimos comandos e respostas | `POST /remote/command` |
| `/tv/vote` | Celular de cada membro | Escolhe quem é você → candidatos do Filme da sexta com capa → votar | `POST /movie-night/vote` (via sessão) |
| Configurações → **Dispositivos** | Pais | Lista de TVs (nome, modelo, último acesso, IP) com "Desconectar" e "Renomear"; botão "Criar token do agente" (para o agente local, mostrado uma única vez) | `tv_devices` (RLS) |
| Configurações → **TV** | Pais | Dono da TV (membro), antecedência do aviso de reunião (2/5/10/15 min), horários das rotinas, "Só família" por padrão, mensagem do aviso ("Shhh… papai está em reunião"), nome e subtítulo da marca no fundo para câmera | `tv_devices.settings` |
| Configurações → **Casa** | Pais | Colar o token do LG ThinQ, país e região; lista de aparelhos sincronizados | `thinq_connections` |
| **Memórias** | Família | Enviar fotos (data é lida do EXIF, legenda opcional) ou escolher do Google Photos (Picker API) | bucket `family-photos` + `family_photos` |
| Botão **"Mostrar no Nest Hub"** | Família (Chrome no computador ou Android) | Abre o nest-hub no Hub pelo Cast Web Sender; no iPhone, manda o comando para o agente de casa | Cast SDK / `agent/commands` |
| Botão **"Avisar na TV"** (em qualquer lugar do app) | Família | Recado rápido ("Jantar pronto!") que aparece em todas as TVs | `tv_alerts` |
| **Séries que seguimos** | Família | Buscar e seguir séries (TMDB) | `watch_follows` |

Visual: seguir o design system atual do PlanKnect (roxo `#7c5cff`, cards claros). As páginas são simples e para celular.

---

## 3. Prompt para colar no Lovable

> Copie o bloco abaixo no chat do projeto PlanKnect no Lovable e anexe `PLANKNECT_TV_API.md`.

```
Quero adicionar o "PlanKnect TV": um app para TV LG que já está pronto e precisa de backend.
O contrato completo está no arquivo anexado PLANKNECT_TV_API.md. Siga-o à risca (nomes de rotas e campos).

1) Banco: crie as tabelas da seção 2 (tv_device_codes, tv_devices, tv_alerts, watch_follows,
   movie_nights, movie_votes, thinq_connections, thinq_devices, family_photos, tv_scenes) ligando
   aos nossos households/members reais, com RLS para o site. Buckets: family-photos (privado) e tv-scenes (público).

2) Edge Function única "tv" (verify_jwt = false, CORS liberado inclusive Origin null) com TODAS as rotas
   da seção 4: pareamento por QR (RFC 8628), login, refresh, logout, dashboard, detalhes
   (events/tasks/projects/meals), watch, alerts, e as escritas (chores, lists, subtasks, follow,
   vote, devices control, alerts, assistant). Tokens da TV opacos com hash (seção 3).
   O /dashboard deve montar o JSON a partir das nossas tabelas existentes (agenda, tasks, projetos,
   chores, listas, refeições, recados), no fuso da casa.

3) Páginas: /tv (aprovar TV pelo celular), /tv/remote (falar com o assistente), /tv/vote,
   Configurações → Dispositivos, TV e Casa, Memórias (upload de fotos) e um botão "Avisar na TV".

4) Integrações no servidor: TMDB para /watch (segredo TMDB_API_KEY, região AU, cache 6 h),
   LG ThinQ via cron a cada 2 min gerando tv_alerts nas mudanças de estado, e o assistente com
   tool calling (ferramentas da seção 6), respondendo em português.

Comece pela Fase 1 (pareamento + dashboard + chores + listas + Dispositivos). No fim de cada fase,
me devolva os itens da seção 8 do contrato (apiBase, URLs das páginas, uma TV de teste aprovada,
exemplos reais de /dashboard e /events/:id, ids dos membros, de/para dos tipos de evento).
```

---

## 4. Fases

| Fase | Entrega | Resultado na TV |
|---|---|---|
| 1 | Tabelas de TV, pareamento, `/dashboard`, chores, listas, página `/tv`, Dispositivos | TV conectada com agenda, missões e listas reais |
| 2 | Detalhes (events/tasks/projects/meals), `/assistant`, `/tv/remote`, `/alerts` | Detalhe de cada item, voz e avisos da família |
| 3 | `/watch` (TMDB), Filme da sexta, `/tv/vote`, fotos, cenários no bucket | Aba Assistir e memórias reais |
| 4 | ThinQ (cron + controle), configurações da TV, Realtime (opcional) | Aba Casa e avisos de aparelhos |

---

## 5. Voz pelo controle (o que está do lado da TV)

| Caminho | Status |
|---|---|
| Ditado do teclado da LG no campo do assistente | Testar no modelo (Ajustes → Voz → Testar microfone) |
| Celular como microfone (`/tv/remote`) | Depende do Lovable (fase 2); funciona em qualquer TV |
| Alexa Skill "PlanKnect" | Depois; usa a mesma lógica do `/assistant` |
| Botão de microfone direto no app | Improvável (reservado ao assistente da LG) |

---

## 6. O que o Lovable devolve (checklist)

- [ ] `apiBase` = `https://<project-ref>.supabase.co/functions/v1/tv`
- [ ] URLs: `/tv`, `/tv/remote`, `/tv/vote`, Configurações → TV, Casa e Dispositivos
- [ ] TV de teste aprovada: `device_id` + `refresh_token` (família de teste)
- [ ] JSON real de `GET /dashboard` e de `GET /events/:id`
- [ ] Ids dos membros e qual é o dono da TV
- [ ] De/para das categorias de evento do PlanKnect → `type`
- [ ] CORS ok (`OPTIONS` → 204) e `verify_jwt = false`
- [ ] Status: TMDB, ThinQ, modelo do assistente, bucket de fotos, URLs dos cenários
- [ ] Token do agente de casa (se formos usar o agente)
- [ ] nest-hub publicado em `https://planknect.com/hub/nest-hub.html` + App ID do receptor Cast
- [ ] `GET /version`, `POST /lists/:id/share` + página pública `/l/:token`, comprados mantidos por 24 h e Google Photos copiado para `family-photos` (seção 11)
- [ ] Ajustes da seção 10 do contrato (Marcelo em members, Elisa duplicada, chores vazios)
- [ ] Logo oficial em SVG
- [ ] Lista de qualquer diferença em relação ao contrato

Com isso, eu troco `apiBase` em `js/config.js`, conecto a TV de teste e valido todas as telas com dados reais.
