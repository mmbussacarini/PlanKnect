# PlanKnect TV: backend no Lovable (Supabase)

Este é o contrato que o app da TV já usa. O Lovable implementa tudo numa **única Edge Function `tv`** do Supabase, com as tabelas novas abaixo, e mais quatro páginas no site (veja `FAMILY_HUB.md`).

- Endereço base da API: `https://<project-ref>.supabase.co/functions/v1/tv`. No app da TV, ele vai em `js/config.js → apiBase`.
- Todas as rotas abaixo são relativas a esse endereço (ex.: `GET {apiBase}/dashboard`).
- A TV manda `Authorization: Bearer <token da TV>` e `X-Device-Id: tv-…` em toda chamada (menos nas de pareamento).

---

## 1. Configuração da Edge Function

**`supabase/config.toml`**
```toml
[functions.tv]
verify_jwt = false   # a TV usa token próprio de dispositivo, não JWT do Supabase
```

**CORS** (o app roda como `file://` na TV, então o navegador manda `Origin: null`):
```ts
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-device-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
// responder OPTIONS com 204 + CORS; todas as respostas com CORS
```

**Roteamento interno:** `new URL(req.url).pathname` termina em `/tv/<rota>`; faça um `switch` pela rota.
A função usa o **service role** para acessar o banco e aplica as regras de família ela mesma (sempre filtrar por `household_id` do token).

**Segredos** (Supabase → Edge Functions → Secrets):

| Nome | Para quê |
|---|---|
| `TV_TOKEN_PEPPER` | "Tempero" do hash dos tokens da TV (string aleatória longa) |
| `TMDB_API_KEY` | Conteúdo (aba Assistir); chave v3 do themoviedb.org |
| `THINQ_ENC_KEY` | Criptografar o token do LG ThinQ de cada família (32 bytes base64) |
| `ANTHROPIC_API_KEY` | Assistente (ou use o Lovable AI Gateway; veja a seção 6) |

---

## 2. Tabelas novas (migração SQL)

> Os nomes das tabelas que já existem no PlanKnect (famílias, membros, eventos, tasks, projetos, chores, listas, refeições, recados) **não são conhecidos aqui**. Onde aparece `households(id)` e `members(id)`, troque pelos nomes reais.

```sql
-- Pareamento por QR (RFC 8628)
create table tv_device_codes (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique,
  user_code text not null unique,            -- XXXX-XXXX, sem 0/O/1/I
  device_id text not null,
  device_name text, model text,
  status text not null default 'pending' check (status in ('pending','approved','denied','used')),
  household_id uuid references households(id),
  approved_by uuid references auth.users(id),
  interval_s int not null default 5,
  last_poll_at timestamptz,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

-- TVs conectadas
create table tv_devices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  device_id text not null,
  name text, model text,
  owner_member_id uuid references members(id),   -- de quem são as reuniões que ativam o modo reunião
  access_hash text not null, access_expires_at timestamptz not null,
  refresh_hash text not null,
  settings jsonb not null default '{}',           -- antecedência do aviso, rotinas, "só família" etc.
  last_seen_at timestamptz, last_ip text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, device_id)
);

-- Avisos para as TVs (recados, campainha, casa)
create table tv_alerts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  kind text not null check (kind in ('family','door','device','meeting','system')),
  title text not null, body text, image_url text, icon text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index on tv_alerts (household_id, created_at desc);

-- Séries seguidas e Filme da sexta
create table watch_follows (
  household_id uuid not null references households(id) on delete cascade,
  tmdb_id int not null, kind text not null check (kind in ('tv','movie')),
  title text not null, created_at timestamptz not null default now(),
  primary key (household_id, tmdb_id, kind)
);
create table movie_nights (
  household_id uuid not null references households(id) on delete cascade,
  week_start date not null,
  day int not null default 5, time text not null default '19:30',
  candidates jsonb not null default '[]',           -- [{tmdb_id, title, service, poster}]
  primary key (household_id, week_start)
);
create table movie_votes (
  household_id uuid not null, week_start date not null,
  member_id uuid not null references members(id) on delete cascade,
  item_id text not null,
  primary key (household_id, week_start, member_id)
);

-- Casa (LG ThinQ)
create table thinq_connections (
  household_id uuid primary key references households(id) on delete cascade,
  pat_encrypted text not null, country text not null default 'AU', region text not null default 'kic',
  last_sync_at timestamptz, last_error text
);
create table thinq_devices (
  household_id uuid not null references households(id) on delete cascade,
  device_id text not null, type text not null, name text, room text,
  state jsonb not null default '{}',               -- formato "devices" da seção 4
  updated_at timestamptz not null default now(),
  primary key (household_id, device_id)
);

-- Fotos da família (modo ambiente: "Há 3 anos, hoje")
create table family_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  storage_path text not null,                     -- bucket "family-photos"
  caption text, taken_at timestamptz,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);

-- Cenários (fotos/vídeos de fundo) — globais
create table tv_scenes (
  id text primary key, name text not null,
  kind text not null check (kind in ('photo','video')),
  src text not null, poster text, tags text[] default '{}', credit text, sort int default 0
);

alter table tv_device_codes enable row level security;
alter table tv_devices enable row level security;
alter table tv_alerts enable row level security;
alter table watch_follows enable row level security;
alter table movie_nights enable row level security;
alter table movie_votes enable row level security;
alter table thinq_connections enable row level security;
alter table thinq_devices enable row level security;
alter table family_photos enable row level security;
alter table tv_scenes enable row level security;
-- Políticas para o SITE (usuário logado) — a Edge Function usa service role e ignora RLS.
-- Ex.: membros da família leem/gerenciam as TVs e avisos da própria família
-- (troque is_household_member pela função/consulta que o PlanKnect já usa):
create policy "familia ve suas tvs" on tv_devices for select using (is_household_member(household_id));
create policy "familia revoga tvs" on tv_devices for update using (is_household_member(household_id));
create policy "familia manda avisos" on tv_alerts for insert with check (is_household_member(household_id));
create policy "familia le fotos" on family_photos for select using (is_household_member(household_id));
create policy "familia envia fotos" on family_photos for insert with check (is_household_member(household_id));
create policy "cenarios publicos" on tv_scenes for select using (true);
```

**Storage:** bucket privado `family-photos` (a TV recebe URLs assinadas válidas por 24 h) e bucket público `tv-scenes` (vídeos e fotos de fundo).

---

## 3. Tokens da TV

- `access_token` e `refresh_token`: 32 bytes aleatórios em base64url. No banco, só `sha256(token + TV_TOKEN_PEPPER)`.
- `access_token` vale 1 hora e o `refresh_token` vale 90 dias, renovado a cada uso (rotativo).
- Se um refresh token antigo for reutilizado, a TV é revogada (`revoked_at = now()`).
- Em toda chamada autenticada: achar `tv_devices` pelo hash, checar validade e `revoked_at is null`, atualizar `last_seen_at` e `last_ip`. A partir daí, tudo usa o `household_id` dessa TV.
- **Escopo:** a TV só lê a família e escreve em missões, listas, subtarefas, votos, seguir séries, avisos e aparelhos. Nunca membros, cobrança, exclusões ou configurações da conta.

---

## 4. Rotas

### Pareamento (sem token)

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /device/code` | `{ device_id, device_name, model }` | `{ device_code, user_code, verification_uri: "https://planknect.com/tv", verification_uri_complete: "https://planknect.com/tv?code=WDJB-MJHT", expires_in: 600, interval: 5 }` |
| `POST /device/token` | `{ device_code, device_id }` | Pendente: **400** `{ "error": "authorization_pending" }`. Rápido demais: `slow_down`. Expirou: `expired_token`. Recusado: `access_denied`. Aprovado: **200** com o token (abaixo) |
| `POST /device/approve` (chamada pelo **site**, com a sessão do usuário) | `{ user_code, household_id, approve }` | `{ ok, device_name }` |
| `POST /login` | `{ email, password, device_id }` | Token, ou 400 `{ error: "invalid_grant" }`; conta com 2FA: `{ error: "use_qr" }` |
| `POST /token/refresh` | `{ refresh_token }` | Token novo |
| `POST /logout` | — | `{ ok }` (revoga a TV) |

Resposta de token:
```json
{ "access_token": "…", "refresh_token": "…", "expires_in": 3600,
  "household": { "id": "uuid", "name": "Silva Family" } }
```

### Leitura

**`GET /dashboard?from=ISO&to=ISO&tz=Australia/Sydney`**. A TV chama a cada 60 s; `from` é o domingo da semana e `to` vem 8 dias depois.
```json
{
  "household": { "id": "uuid", "name": "Silva Family",
                 "location": { "name": "Sydney", "lat": -33.80, "lon": 151.28 } },
  "members": [
    { "id": "uuid-m", "name": "Marcelo", "initial": "M", "color": "#7c5cff" },
    { "id": "uuid-s", "name": "Sofia", "initial": "S", "color": "#38bdf8", "kid": true,
      "stars": 42, "streak": 5, "reward": { "title": "Cinema no sábado", "goal": 60 } }
  ],
  "events": [
    { "id": "e1", "title": "Product strategy sync", "type": "meeting",
      "start": "2026-10-22T12:30:00+11:00", "end": "2026-10-22T13:15:00+11:00",
      "allDay": false, "members": ["uuid-m"], "video": "meet", "location": "", "private": false }
  ],
  "tasks": [
    { "id": "t1", "title": "NCNDA Execution & Filing", "project": "InnovaTradeCapital", "projectId": "p1",
      "priority": "high", "due": "2026-10-21", "assignee": "uuid-m", "status": "open" }
  ],
  "projects": [
    { "id": "p1", "name": "InnovaTradeCapital", "org": "Trade / Commodities", "progress": 0.42, "color": "#7c5cff",
      "milestone": { "title": "NCNDA Execution & Filing", "due": "2026-10-26" } }
  ],
  "chores": [
    { "id": "c1", "member": "uuid-s", "title": "Arrumar a cama", "icon": "bed", "period": "manhã", "points": 5, "done": false }
  ],
  "lists": [
    { "id": "l1", "name": "Mercado", "icon": "cart", "color": "#34d399",
      "items": [{ "id": "i1", "title": "Leite", "category": "Laticínios", "by": "uuid-e", "done": false }] }
  ],
  "meals": [{ "date": "2026-10-22", "meal": "jantar", "title": "Lasanha da vovó", "cook": "uuid-e" }],
  "notes": [{ "id": "n1", "by": "uuid-e", "text": "Natação hoje! Toalhas na porta.", "at": "2026-10-22T08:00:00+11:00" }],
  "photos": [{ "url": "https://…signed…", "caption": "Praia em Manly", "takenAt": "2023-10-22T10:00:00+11:00" }],
  "watch": { "items": ["… igual a GET /watch …"], "movieNight": "…" },
  "devices": [{ "id": "wm", "type": "washer", "name": "Lava e seca", "room": "Lavanderia", "state": "running", "endsIn": 23, "detail": "Algodão · 40°" }],
  "scenes": [{ "id": "office-1", "name": "Escritório", "kind": "video", "src": "https://…/tv-scenes/office.mp4", "poster": "https://…/office.jpg", "credit": "…" }]
}
```

Valores permitidos:

| Campo | Valores |
|---|---|
| `events[].type` | `meeting` · `task` · `milestone` · `event` · `family` · `church` · `birthday` |
| `events[].video` | `meet` ou `null` (`zoom` e `teams` no futuro) |
| `tasks[].priority` | `high` · `medium` · `low` |
| `chores[].icon` | `bed` · `tooth` · `book` · `toy` · `plate` · `shirt` · `paw` · `trash` · `star` · `task` |
| `chores[].period` | `manhã` · `tarde` · `noite` |
| `lists[].icon` | `cart` · `pill` · `home` · `card` |
| `devices[].type` | `washer` · `dryer` · `dishwasher` · `fridge` · `ac` · `robot` |

Regras: `tasks` traz só as abertas (atrasadas e até 14 dias à frente, no máximo 40). Evento com `private: true` vem com o título "Ocupado" e sem `members`. Campos vazios podem faltar; a TV trata.

| Rota | Resposta |
|---|---|
| `GET /events/:id` | evento + `organizer {name,email}`, `attendees [{name, org, color, response: accepted\|tentative\|declined\|needsAction, member?}]`, `conference {provider, url}`, `description`, `agenda [string]`, `attachments [{name, kind: sheet\|pdf\|doc}]`, `related {projectId, taskIds}` |
| `GET /tasks/:id` | task + `description`, `subtasks [{id,title,done}]`, `lastComment {by, text}` |
| `GET /projects/:id` | projeto + `team [{name, org, color}]`, `milestones [{title, due, done}]`, `openTasks [task]` |
| `GET /meals/:title` | `{ ingredients: [string] }` |
| `GET /watch` | `{ items: [{ id, title, kind: tv\|movie, service: netflix\|prime\|disney\|youtube, followed, badge, ep: "T3 · E1", date, poster, overview, trailer: "<youtube key>", links: { netflix: "<id do título>", youtube: "<videoId>" }, kids }], movieNight: { day: 5, time: "19:30", candidates: [itemId], votes: { memberId: itemId } } }` |
| `GET /alerts?since=<epoch ms>` | `{ now: <epoch ms>, alerts: [{ id, kind, title, body, image, icon }] }`, ou seja, avisos não expirados criados depois de `since` |

### Escrita

| Rota | Corpo | Efeito |
|---|---|---|
| `POST /chores/:id` | `{ done }` | Marca a missão e soma ou subtrai as estrelas da criança |
| `POST /lists/:id/items` | `{ titles: [string] }` | Adiciona itens (categoria "Adicionado pela TV") |
| `POST /lists/:id/items/:itemId` | `{ done }` | Marca como comprado |
| `POST /lists/:id/clear-done` | — | Remove os comprados |
| `POST /tasks/:id/subtasks/:sid` | `{ done }` | Marca a subtarefa |
| `POST /watch/follow` | `{ query, follow }` | Procura no TMDB e segue ou deixa de seguir |
| `POST /movie-night/vote` | `{ member, item }` | Voto |
| `POST /devices/:id/control` | `{ power?, target?, start?, dock? }` | Controla aparelho ThinQ |
| `POST /alerts` | `{ kind, title, body?, icon? }` | Recado para todas as TVs da família |
| `POST /assistant` | `{ text, view, tz }` | Veja a seção 6 |

### Tempo real (opcional, fase 2)
Na fase 1 basta o polling: `/dashboard` a cada 60 s e `/alerts` a cada 30 s. Edge Functions têm duração limitada, então um SSE longo não serve. Na fase 2, a função pode emitir para a TV um JWT curto do Supabase (claim `household_id`), e a TV assina o canal Realtime `household:<id>` (broadcast `update`, `alert` e `meeting`).

---

## 5. Integrações no servidor

**TMDB (aba Assistir):**
- Para cada `watch_follows`: `GET /3/tv/{id}?append_to_response=watch/providers,videos&language=pt-BR`.
- Use `last_episode_to_air` e `next_episode_to_air`.
- Selo: "Novo episódio" se saiu nos últimos 7 dias; "Nova temporada" se `episode_number = 1`.
- Serviço pelo provedor `flatrate` na região `AU`: 8 = Netflix, 9 ou 119 = Prime Video, 337 = Disney+.
- Lançamentos: `/3/discover/tv?watch_region=AU&with_watch_providers=8|9|119|337&first_air_date.gte=<30 dias>`.
- Filmes de família: `/3/discover/movie?with_genres=10751&...`.
- Guardar em cache por 6 horas.

**LG ThinQ:**
- A família cola o Personal Access Token (gerado em connect-pat.lgthinq.com) em Configurações → Casa. Ele vai criptografado com `THINQ_ENC_KEY`.
- Um cron (`pg_cron` chamando a função a cada 2 min) faz `GET https://api-{region}.lgthinq.com/devices` e `/devices/{id}/state`, e atualiza `thinq_devices`.
- Quando um estado muda ("terminou", "porta aberta"), insere uma linha em `tv_alerts`.
- Cabeçalhos: `Authorization: Bearer <PAT>`, `x-country`, `x-message-id` (22 caracteres base64url), `x-client-id`, `x-api-key`, `x-service-phase: OP`. Conferir a `x-api-key` e os campos por aparelho no portal ThinQ Developer.
- O agente local (`agent/lib/thinq.js`) tem o mapeamento de referência.

**Fotos:** `family_photos` → URLs assinadas por 24 h. Para "Há N anos, hoje", priorizar fotos com o mesmo dia e mês de `taken_at`.

**Cenários:** `tv_scenes` (curadoria do PlanKnect; arquivos no bucket `tv-scenes`). O protótipo tem 15 cenários de referência em `js/scenes.js`. As fotos são do Unsplash e os vídeos do Mixkit; ambos têm licença gratuita, mas é preciso revisar os termos e baixar os arquivos para o próprio bucket.

---

## 6. Assistente: `POST /assistant`

Recebe `{ text, view, tz }`, entende o pedido, **executa no banco** e responde o que a TV deve fazer:
```json
{ "reply": "Adicionei Leite e Pão na lista Mercado.",
  "actions": [ { "type": "refresh" }, { "type": "navigate", "view": "lists", "list": "l1" } ] }
```

Tipos de ação:

| Ação | Campos |
|---|---|
| `refresh` | — |
| `navigate` | `view`: `home` · `agenda` · `chores` · `lists` · `watch` · `home-devices` · `weather` · `work`; opcionais `mode` (`people` ou `week`), `member`, `familyOnly`, `list` |
| `meeting` | `on` |
| `launch` | `app`, `name` |
| `celebrate` | `member` |

**Modelo:** um LLM com tool calling. Pode ser o Lovable AI Gateway ou a API da Anthropic, usando o modelo mais recente disponível; hoje, `claude-sonnet-5-5`. O system prompt leva: data e hora no fuso da casa, membros (id, nome, se é criança), listas (id e nome), chores de hoje e eventos das próximas 24 h.

**Ferramentas** (JSON Schema resumido):

| Ferramenta | Parâmetros |
|---|---|
| `add_list_items` | `{ list_id, titles: string[] }` |
| `complete_chore` | `{ member_id, chore_id?, all?: boolean }` |
| `create_task` | `{ title, due?: date, priority?: high\|medium\|low, assignee_id? }` |
| `create_event` | `{ title, start: datetime, end?: datetime, member_ids?: string[] }` |
| `follow_show` | `{ query, follow: boolean }` |
| `send_alert` | `{ title, body? }` → `tv_alerts` (kind `family`) |
| `control_device` | `{ device_id, power?, target? }` |
| `query_agenda` | `{ day? }` (só leitura) |
| `set_meeting` | `{ on: boolean }` (só devolve a ação, não grava) |

Regras: responder em português, numa ou duas frases curtas. Nunca apagar nada. Respeitar o escopo da TV. Se faltar informação, perguntar ("Em qual lista?").
O interpretador local do protótipo (`js/assistant.js`) tem 25 exemplos de frases que servem como casos de teste.

**`/tv/remote` e Alexa:** a página do celular chama a mesma lógica pela rota `POST /remote/command { text, household_id }` (com a sessão do usuário). O resultado chega à TV como `tv_alerts` ou pelo próximo `/dashboard`.

---

## 7. Como testar (curl)

```bash
API=https://<project-ref>.supabase.co/functions/v1/tv
```
```bash
curl -s -X POST $API/device/code -H 'Content-Type: application/json' -d '{"device_id":"tv-teste","device_name":"LG teste","model":"OLED55C3"}'
```
Depois de aprovar em `planknect.com/tv?code=…`:
```bash
curl -s -X POST $API/device/token -H 'Content-Type: application/json' -d '{"device_code":"<device_code>","device_id":"tv-teste"}'
```
```bash
curl -s "$API/dashboard?from=2026-10-18T00:00:00Z&to=2026-10-26T00:00:00Z&tz=Australia/Sydney" -H "Authorization: Bearer <access_token>" -H "X-Device-Id: tv-teste"
```
Na TV (ou no preview), basta trocar `apiBase` em `js/config.js`. O app testa sozinho o pareamento e o dashboard.

---

## 8. O que o Lovable precisa devolver para ligarmos a TV

1. **`apiBase`**: o endereço final da função (`https://<ref>.supabase.co/functions/v1/tv`).
2. **Endereços das páginas**: `/tv` (aprovar TV), `/tv/remote`, `/tv/vote` e Configurações → TV e Casa.
3. **Uma TV de teste aprovada**: `device_id` + `refresh_token` de uma família de teste, para conectarmos sem passar pelo QR.
4. **Um exemplo real** de `GET /dashboard` e de `GET /events/:id`, com os dados da família de teste.
5. **Ids dos membros**, dizendo qual é o dono da TV (para o modo reunião).
6. **De/para dos tipos de evento**: como as categorias do PlanKnect viram `type` (`meeting`, `family`, `church`…).
7. **Confirmação de CORS** (uma chamada `OPTIONS` respondendo 204) e de `verify_jwt = false`.
8. **Status de cada integração**: TMDB (chave configurada?), ThinQ (PAT de teste?), assistente (qual modelo), fotos (bucket criado?), cenários (URLs no bucket).
9. **A logo oficial em SVG**, para trocar `assets/logo.svg`.
10. **Token do agente de casa** (se usarmos o agente): gerado em Configurações → Dispositivos, mesmo formato do token da TV.
11. **App ID do receptor Cast** do nest-hub (seção 9) e confirmação de que `https://planknect.com/hub/nest-hub.html` está no ar.
12. **Qualquer diferença** deste contrato: nome de campo, rota ou formato que tenha mudado.

---

## 9. nest-hub (Google Nest Hub) — mesmo backend

O Google Nest Hub não instala apps, mas abre páginas web por **Cast**. O PlanKnect nest-hub (`nest-hub.html` + `js/hub.js` + `css/nest-hub.css`, tela 1024×600 com toque) usa **a mesma API, o mesmo pareamento por QR e os mesmos dados** da TV. Já foi testado no Kitchen Display (Nest Hub 1ª geração), carregando a página pelo DashCast.

**O que o Lovable faz para não depender de nenhum computador em casa:**

1. **Hospedar os arquivos estáticos** em `https://planknect.com/hub/`: copiar `nest-hub.html`, `js/`, `css/` e `assets/` da pasta `planknect-tv` para `public/hub/` do projeto. Nada de build; são arquivos prontos. O Cast exige `https`, por isso precisa ficar no planknect.com.
2. **Registrar um receptor Cast próprio** no [Google Cast SDK Developer Console](https://cast.google.com/publish) (taxa única de US$ 5):
   - Tipo: *Custom Receiver*.
   - URL: `https://planknect.com/hub/receiver.html`. É uma página que carrega o Cast Receiver SDK e abre o nest-hub com `disableIdleTimeout: true`; eu escrevo essa página quando houver o App ID.
   - Para testar antes de publicar, registrar o número de série do Kitchen Display como dispositivo de teste.
   - Devolver o **App ID** do receptor.
3. **Botão "Mostrar no Nest Hub"** no site. Usa o Cast Web Sender SDK com o App ID e funciona no Chrome do computador ou do Android. **Não funciona no Safari do iPhone**, porque a Apple não suporta Cast em páginas web.
4. **Canal de comandos para o agente de casa:** `GET /agent/commands?since=` (token do agente) → `{ commands: [{ id, type: "nest_hub_show" | "tv_on" | "routine", payload }] }`. Assim, um botão no planknect.com (inclusive no iPhone) manda o agente abrir o nest-hub ou ligar a TV. O agente só faz conexões de saída; nenhuma porta da casa fica aberta.

**Por que ainda existe um "agente" em casa:** o Cast só funciona dentro da rede local. O planknect.com, na nuvem, não consegue iniciar uma sessão de Cast no Hub; só os apps do próprio Google têm esse caminho pela nuvem. Alguém na rede precisa "apertar o play": o Chrome de alguém da família (botão do item 3) ou o agente sempre ligado (Raspberry Pi ou Home Assistant). O agente também reabre o nest-hub quando a sessão cai, e só faz isso se o Hub estiver ocioso; nunca interrompe música ou YouTube.

## 10. Ajustes encontrados nos dados reais (teste de 24/10)

O pareamento e o `/dashboard` estão funcionando com a família real: 38 eventos, 40 tasks, 44 projetos, 5 membros, 2 listas. Faltam estes ajustes:

| # | O que vi | O que mudar |
|---|---|---|
| 1 | **Marcelo não aparece** em `members` | Incluir o dono da conta. Sem ele, o modo reunião e o aviso de reunião não sabem quais reuniões são dele |
| 2 | **Elisa Rosely aparece duas vezes** (ids diferentes) | Remover a duplicata (o PlanKnect já mostra um selo "dup") ou devolver só um membro por pessoa |
| 3 | `chores` veio vazio | Conferir se há chores cadastrados para Wesley e Lara; se houver, a consulta não está trazendo |
| 4 | `members[].kid` = `true` só para Wesley e Lara | Confirmar se a Sofia é adulta. A aba Missões só mostra quem tem `kid: true` |
| 5 | Campos extras `organizations`, `settings`, `capabilities` | Tudo bem, a TV ignora o que não usa. Se `settings` tiver o dono da TV e a antecedência do aviso, mandar em `settings.ownerMemberId` e `settings.meetingLeadMin` |
| 6 | `meals`, `notes`, `photos`, `scenes`, `devices` vazios | Esperado nesta fase |

## 11. Atualização imediata, listas compartilhadas e Google Photos (24/10)

### 11.1 "Algo mudou?": `GET /version`
A TV busca o dashboard inteiro a cada 20 s e o nest-hub a cada 15 s. Para a mudança aparecer em segundos, sem baixar tudo de novo:
- `GET /version` (token da TV) → `{ "version": "2026-10-24T09:12:03.512Z" }`: o maior `updated_at` entre eventos, tasks, chores, listas, itens, recados, fotos e `tv_alerts` da família.
- O app consulta a cada 5 s e só baixa o `/dashboard` quando a versão muda. Se a rota não existir, volta ao modo de 15 s.
- Depois de qualquer ação na TV ou no Hub, o app já recarrega na hora.
- Fase 2: Supabase Realtime (canal `household:<id>`, evento `update`) para ficar instantâneo.

### 11.2 Itens comprados
Ao marcar um item, a TV e o Hub mostram o check, fazem o item sumir em 2–3 s e oferecem "Desfazer". Os comprados ficam num contador ("✓ 3 comprados · ver"). O backend deve:
- manter os itens com `done: true` e `done_at` por **24 horas** (para o "ver comprados" e o "Desfazer");
- depois disso, deixar de mandá-los no `/dashboard` ou arquivá-los.

### 11.3 QR único da lista (abre sem login)
O QR da lista na TV e no Hub deve abrir a lista **mesmo para quem não está logado**, por exemplo alguém que vai ao mercado.
- `POST /lists/:id/share` (token da TV) → `{ "url": "https://planknect.com/l/k7QxP2…", "expires_at": "…", "can_edit": true }`. Reaproveita o link ativo se já existir; cria outro se faltarem menos de 24 h para expirar.
- Tabela:
```sql
create table list_shares (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  list_id uuid not null,
  token_hash text not null unique,            -- sha256 do token (o token só aparece na URL)
  can_edit boolean not null default true,     -- marcar e adicionar itens
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz, created_by text,    -- 'tv:<device_id>' ou user id
  last_used_at timestamptz, created_at timestamptz not null default now()
);
```
- **Página pública `/l/:token`** (sem login): nome da lista, itens por categoria, marcar e desmarcar, adicionar item, botão "Entrar no PlanKnect". Não mostra nomes nem outros dados da família.
- **Rotas públicas** (pelo token da URL): `GET /public/lists/:token`, `POST /public/lists/:token/items` `{ title }`, `POST /public/lists/:token/items/:itemId` `{ done }`. Com rate limit por IP; token expirado ou revogado → 410.
- **Configurações → Listas:** ver os links ativos, "Revogar" e "Gerar novo".
- O app já pede o link; enquanto a rota não existir, o QR continua abrindo `planknect.com/lists/<id>` com login.

### 11.4 Google Photos no fundo (moldura)
- Usar a **Google Photos Picker API**: a família escolhe fotos ou álbuns numa tela do Google. A Library API antiga não dá mais acesso amplo à biblioteca.
- As URLs do Picker (`baseUrl`) **expiram em cerca de 60 min** e exigem o token OAuth. Por isso o backend deve **copiar** as fotos escolhidas para o bucket `family-photos` em 1920 px, guardando a data da foto (`mediaFile.createTime`) em `family_photos.taken_at`.
- O `/dashboard` manda até 50 fotos com URL assinada por 24 h, priorizando as tiradas no mesmo dia e mês ("Há 3 anos, hoje").
- **Configurações → Moldura:** escolher fotos novas, ligar ou desligar o clima e a agenda na moldura, e o tempo até a moldura abrir. Mandar em `settings.frame = { weather, agenda, afterMin }`; o Hub já respeita esses ajustes se vierem.

### 11.5 nest-hub "na hora" pelo agente
Comandos para o agente de casa (`GET /agent/commands`): `nest_hub_show`, `nest_hub_reload`. O agente fecha e reabre a sessão de Cast para recarregar; isso é necessário porque o DashCast deixa de ouvir comandos depois de abrir a página.

## 12. Dados para as telas novas do nest-hub (24/10)

| Tela | O que o backend precisa mandar | Rota |
|---|---|---|
| Jantar → **Cozinhar passo a passo** | `GET /meals/:title` → `{ ingredients: [string], steps: [{ text, minutes }] }`. Com `minutes > 0`, aparece o botão "Iniciar timer" | já prevista; falta `steps` |
| **Recados** com "visto por" | `notes[]` com `seenBy: [memberId]` | `POST /notes` `{ text, by }` · `POST /notes/:id/seen` `{ member }` |
| **Contas do mês** | Itens da lista de pagamentos com `due` (data de vencimento). O Hub mostra "1 conta atrasada" e "2 contas esta semana" e ordena por vencimento | campo `lists[].items[].due` |
| **Campainha** | `tv_alerts` com `kind: 'door'` e `image_url` = URL de snapshot da câmera. O Hub recarrega a imagem a cada 2 s por 90 s | `GET /alerts` (já previsto) |
| **Placar da semana** | `members[].stars` = estrelas da semana; `reward { title, goal }` | `/dashboard` |
| **Contagens** | `watch.movieNight { day, time }`, eventos `type: 'birthday'` e as rotinas (`settings.routines`) | `/dashboard` |
| **Clima** | Nada: o Hub busca no Open-Meteo direto. Só precisa de `household.location` | — |

## 13. Criar missões e tarefas pela TV e pelo Hub (24/10)

**Missões das crianças.** No Hub: Missões → "+ Nova missão" → criança, modelo (12 prontos: arrumar a cama, dever de casa, levar o lixo…), repetição (todo dia, dias de semana ou só hoje) e estrelas.
- `POST /chores` `{ member, title, icon, period: "manhã"|"tarde"|"noite", points, repeat: "daily"|"weekdays"|"once" }` → `{ ok, id }`.
- O backend guarda a missão como **modelo recorrente** e, a cada dia, gera as instâncias de hoje que aparecem em `chores` do `/dashboard`.
- No site: Família → Missões, para criar, editar e apagar modelos e ver o histórico de estrelas.
- Hoje o `/dashboard` real devolve `chores: []`. Ou não há missões cadastradas, ou a consulta não as traz.
- A aba Missões só mostra membros com `kid: true`.

**Tarefas.** `POST /tasks` `{ title, due?, priority?, assignee?, projectId? }`. Usado pelo assistente e pelo celular (`/tv/remote`).

**Voz no Hub.** Testado no Kitchen Display em 24/10:
- O Chrome do Hub tem o reconhecimento de voz, mas a permissão do microfone vem como **"denied"** e o reconhecimento não começa.
- O microfone fica reservado ao Google Assistente.
- O botão de microfone do Hub abre um QR para `/tv/remote?device=nest-hub` (falar pelo celular), e a resposta volta ao Hub por `/alerts`.
- Vale repetir o teste quando a página estiver em `https://planknect.com/hub/`.

## 14. Campainha Google Nest e tarefas (24/10)

### 14.0 Funciona hoje, sem código
O próprio Google mostra a câmera no Nest Hub quando a campainha toca. No app Google Home, entre nas configurações da campainha e ative **mostrar o vídeo nos displays ao tocar**. O nome exato da opção muda conforme a versão do app; fica em "Notificações" ou "Campainha".
O vídeo do Google aparece por cima do PlanKnect; depois que ele fecha, o agente de casa reabre o nest-hub sozinho, porque o Hub volta a ficar ocioso.

### 14.1 Campainha no PlanKnect (TV, Hub e celular): Google Device Access
O caminho oficial para um app saber que a campainha tocou é a **Smart Device Management (SDM) API**, do programa **Device Access** do Google.

**O Marcelo faz uma vez (conta Google dona da casa):**
1. Inscrever-se no Device Access Console (`console.nest.google.com/device-access`), com taxa única de US$ 5, e criar um projeto. Anotar o **Project ID**.
2. No Google Cloud: criar um **OAuth Client (Web)** com o redirect `https://planknect.com/settings/home/google/callback`; ativar **Smart Device Management API** e **Cloud Pub/Sub**.
3. No projeto Device Access, ativar os eventos com um **tópico Pub/Sub**.
4. Entregar ao Lovable: Project ID, Client ID, Client Secret e o nome do tópico Pub/Sub.

**O Lovable constrói:**

| Peça | O que fazer |
|---|---|
| Configurações → Casa → **Conectar Google Nest** | Botão que abre o Partner Connections Manager: `https://nestservices.google.com/partnerconnections/<PROJECT_ID>/auth?redirect_uri=…&access_type=offline&prompt=consent&client_id=…&response_type=code&scope=https://www.googleapis.com/auth/sdm.service`. A família escolhe a campainha e as câmeras |
| Callback | Trocar o `code` por tokens em `https://www.googleapis.com/oauth2/v4/token`; guardar o **refresh token criptografado** em `google_home_connections (household_id, refresh_token_enc, project_id, devices jsonb)` |
| Lista de aparelhos | `GET https://smartdevicemanagement.googleapis.com/v1/enterprises/<PROJECT_ID>/devices`, guardando nome, tipo e traits de cada um |
| **Eventos** | Assinatura Pub/Sub em modo *push* para a Edge Function `google-sdm-events`, validando o JWT do Pub/Sub. Ao receber `sdm.devices.events.DoorbellChime.Chime`, inserir em `tv_alerts` `{ kind: 'door', title: 'Tem alguém na porta', body: <nome da câmera>, device_id }`. Opcional: `CameraPerson.Person` como "Pessoa na porta" |
| **Imagem / vídeo** | Depende do modelo da campainha: com o trait `CameraEventImage`, chamar `sdm.devices.commands.CameraEventImage.GenerateImage` com o `eventId`, baixar (o link dura cerca de 30 s), salvar no Storage e mandar `image_url`; com `CameraClipPreview`, baixar o `previewUrl` do evento e mandar `video_url` (mp4) |
| **Ao vivo** (fase 2) | `POST /door/live { offerSdp, deviceId }` → chamar `sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream` com a oferta → devolver `{ answerSdp, mediaSessionId, expiresAt }`. O Hub já monta a oferta WebRTC (áudio + vídeo + canal de dados, só recepção) quando o aviso vem com `live: true`. Renovar com `ExtendWebRtcStream` se durar mais de 5 min |
| TV e Hub | Já prontos: em `kind: 'door'`, abrem a janela na frente de tudo, com som. `image_url` é recarregado a cada 2 s; `video_url` toca em loop; `live: true` tenta o ao vivo |

**Precisamos saber:** o **modelo da campainha** (Nest Doorbell com bateria, com fio de 2ª geração ou o modelo antigo), porque define se vem imagem, clipe ou só ao vivo.

### 14.2 Tarefas
- **Bug no `/dashboard`:** as 40 tasks devolvidas estão **todas atrasadas** (prazos de junho e julho). O limite de 40 está sendo preenchido pelas mais antigas. Mandar nesta ordem: as de **hoje**, as dos **próximos 7 dias**, e depois as atrasadas **dos últimos 30 dias**, até 60 no total. As atrasadas há mais tempo podem vir só como contagem: `tasksSummary: { overdueOld: 123 }`.
- **Responsável:** os `assignee` das tasks não batem com nenhum id em `members` (o Marcelo não está na lista). Incluir o Marcelo e usar os mesmos ids.
- **Novas rotas:**
  - `POST /tasks/:id` `{ status: "done" | "todo" }` para concluir;
  - `POST /tasks/:id` `{ due: "YYYY-MM-DD" }` para adiar;
  - `POST /tasks` `{ title, due?, priority?, assignee?, projectId? }` para criar.
- **Página no celular:** `https://planknect.com/tasks/:id` (o QR do Hub abre aqui) e `/tv/remote?intent=task` (já abre em "nova tarefa").

## 15. Knect Meeting, gravações e KnectAI: alinhamento com o contrato do PlanKnect (24/10)

**Confirmado funcionando com dados reais:**
- `/dashboard`: 84 eventos, incluindo 2 reuniões do Knect Meeting com id `meeting:<uuid>`.
- `GET /events/meeting:<id>`: traz `conference.url`, `agenda`, `attendees` e `attachments`.
- `GET /alerts`: no ar, responde `{ now, alerts: [] }`.

**O app da TV já usa:**
- **Ids `meeting:<uuid>`** sem codificar o `:`.
- **Modo reunião automático no estilo do contrato:**
  - banner discreto no topo: "Reunião em andamento: …", com quanto falta;
  - **QR do Google Meet**, tirado de `conference.url`;
  - **Não perturbe**: só campainha e avisos urgentes aparecem enquanto durar a reunião.
  - O botão de câmera leva à tela cheia (fundo para câmera ou aviso para a família).
- **Campainha:** janela por cima (PiP) com a foto por 15 s e o botão **Ver ao vivo** (`POST /door/live`, WebRTC só de recepção, com áudio, vídeo e canal de dados nessa ordem). Campos usados: `image`, `video_url`, `live`, `device_id`.
- **Detalhe da reunião:** mostra `summary`, `key_decisions[]`, `action_items[]` (`text`, `owner`, `due`) e `transcript[]` (`speaker`, `at`, `text`) quando vierem.
- **Gravação:** botão "Assistir gravação" com player nativo `<video>` ou `<audio>` (OK pausa, ◀▶ 10 s).
- **Ações do assistente:** `navigate` (inclusive com `camera`), `camera` `{ deviceId }`, `meeting` `{ on }` ou `{ meetingId }`, `refresh`, `celebrate`, `alert` `{ title, body }`.

**O que falta o Lovable construir (já combinado no contrato dele):**
1. **`POST /assistant`** (hoje responde 404), com as ferramentas `list_tasks`, `list_meetings`, `meeting_recap`, `add_list_items`, `complete_chore`, `create_task`, `create_event`, `open_camera`, `send_alert` e `control_device`. A resposta segue o catálogo acima.
2. **Gravações.** Escolher um destes formatos:
   - no detalhe: `recording: { url, kind: "video"|"audio", expires_at }` com a URL assinada (TTL de 300 a 3600 s); ou
   - `has_recording: true` + a rota `GET /events/meeting:<id>/recording` → `{ url, kind, expires_at }`. A TV pede a URL só na hora de tocar, então essa opção é a preferida.
3. **Recaps no detalhe:** `summary`, `key_decisions`, `action_items` e `transcript`, a partir do Knect Meeting.
4. **KnectAI proativo (o lado "Jarvis"):**
   - `GET /ai/briefing` → `{ title, lines: [{ ic, t, s }], speech }`: resumo da manhã ou da noite;
   - `GET /ai/suggestions` → `{ suggestions: [{ id, ic, tone?, title, body, accept, server: true }] }`: conflitos, prazos, contas, chuva em compromisso, missões;
   - `POST /ai/suggestions/:id` `{ action: "accept"|"dismiss" }`: o backend executa e responde `{ reply }`.
   - Enquanto não existirem, a TV e o Hub geram o resumo e as sugestões localmente; no modo real, o "Aceitar" local só navega.

## 16. Escrita de tarefas — status em 24/10/2026

Teste real: `POST /tasks/:id {status:"todo"}` → **403 `Enable task editing for this TV in device settings`**.
A rota existe; a TV só não tem permissão. Para "Concluir/Adiar" funcionar na TV e no nest-hub:

1. O usuário ativa **Editar tarefas** para o dispositivo em planknect.com › Dispositivos (já existe no app?). Se não houver esse toggle na UI, criar.
2. Pedido: depois de aprovar o pareamento, oferecer o toggle já na tela de aprovação ("Permitir que esta TV conclua/adie tarefas").
3. Pendências: `GET /version` responde 405 e `POST /version` 404 — implementar `GET /version → {version:"<hash/updated_at>"}` para sincronização instantânea (hoje caímos no polling de 15–20 s).
4. `assignee` das tarefas não bate com nenhum `members[].id` (0 de 60) — devolver o mesmo id usado em `members`, e incluir o Marcelo em `members`.

O app agora mostra o motivo real do erro na tela (ex.: "Ative “Editar tarefas” para esta TV em planknect.com › Dispositivos") em vez de "Ainda não disponível".

## 17. Alfred (antes "KnectAI") — voz britânica, áudio e idioma

O assistente agora se chama **Alfred**: educado, simpático, sotaque britânico. Mudanças no contrato:

- `POST /assistant` passa a receber `{ text, view, lang, persona: "alfred", tz }`. `lang` é `"en-GB"` (padrão) ou `"pt-BR"`.
  Responder **no idioma de `lang`**, no tom do Alfred ("Very good. I have added milk and bread to the shopping list.").
  Opcional: devolver também `en` (texto em inglês) quando `reply` estiver em português.
- **Áudio** (câmera/microfone USB da TV, quando não há reconhecimento de voz no aparelho):
  `POST /assistant { audio: <base64>, mime: "audio/webm", lang, listen_lang: "pt-BR", persona: "alfred", tz }`
  → transcrever (Whisper/Gemini), executar como texto e devolver `{ text: "<transcrição>", reply, actions }`.
- `GET /ai/briefing?lang=en-GB&persona=alfred` e `GET /ai/suggestions?lang=en-GB` — gerar no idioma pedido.
- `GET /events/:id` — se não houver Meet, mandar `conference: null` (hoje chega `conference` sem `url`, o que quebrava o detalhe; a TV já trata).

## 18. Alfred usando o sistema de áudio do PlanKnect (voz natural + transcrição)

A TV já está pronta; falta só expor no Edge Function `tv` a mesma voz/IA que o KnectAI usa no site.
Hoje `POST /voice/tts` → 404, então a TV usa a voz britânica do aparelho como reserva (e tenta de novo a cada 6 h).

**1. Voz (TTS) — `POST /voice/tts`**
```json
{ "text": "Good evening. Dinner is served at seven.", "voice": "alfred", "lang": "en-GB", "format": "mp3" }
```
→ `200 { "audio": "<base64 mp3>", "mime": "audio/mpeg" }` (ou `{ "url": "<signed url com CORS>" }`).
- A TV manda **uma frase por chamada** e já pede a próxima enquanto toca a atual (começa a falar em ~1 s).
- Voz: masculina britânica, calma e educada (ex.: ElevenLabs "George"/"Daniel", OpenAI `fable`, Azure `en-GB-RyanNeural`). Em `pt-BR`, uma voz masculina natural.
- Cache por hash do texto (frases como "Very good." se repetem muito).

**2. Resposta já com áudio (opcional, mais rápido)** — em `POST /assistant`, se vier `"speak": true`, devolver também
`{ reply, actions, audio: "<base64>", audio_mime: "audio/mpeg" }`. A TV toca direto.

**3. Transcrição** — `POST /assistant { audio, mime, lang, listen_lang, persona:"alfred" }` → `{ text, reply, actions, audio? }` (seção 17).

**4. Memória do Alfred** ("lembra que…", "o que você lembra?", "esquece…")
- `GET /ai/memory` → `{ items: [{ id, text, created_at }] }`
- `POST /ai/memory { text }` → `{ id }`
- `POST /ai/memory/:id { action: "delete" }`
- Usar a memória como contexto no `/assistant` e no `/ai/briefing` (ex.: "Sofia tem natação às terças").

**5. "Precisa de você"** — a TV calcula sozinha (reunião em ≤15 min, tarefa alta prioridade vencendo, conta vencendo hoje). Se quiserem controlar no servidor: `GET /ai/attention` → `{ items: [{ icon, title, subtitle, open: {kind,id} | {view}, say }] }`.

## 19. Status 24/10 — Alfred ligado ao PlanKnect + calendário da família

Testado ao vivo na TV: `POST /assistant` (proposta `add_list_items` + `audio/wav` com `speak:true`), `POST /assistant/proposals/:id` (dismiss → "Very well, cancelled."), `POST /voice/tts` (~2,8 s por frase, WAV), `GET /ai/memory`. A TV mostra o cartão **Confirmar / Cancelar** e só grava após Confirmar.

**Calendário da família:** um aparelho recebeu `household = "Greater Sydney Conference"` (a primeira organização). `/dashboard` e `/device/token` devem sempre devolver em `household` a organização definida no PlanKnect como **calendário da família** (aqui "Silva Family Calendar", `74930c5c…`), em qualquer TV/hub. Ideal: incluir também `family_calendar_id`. A TV já se protege (usa `family_calendar_id` ou a organização dos membros da família).

**Pequenos ajustes pedidos:** `heard` veio `null` para texto (ok); quando a frase vier de áudio, mandar `heard`. Para reduzir a espera da voz, `speak:true` já resolve a primeira frase — mantenha.

## 20. Knect Meeting ao vivo, pontos das missões e controle pelo celular (pedidos 24/10)

A TV já tem as telas prontas (testadas com dados de demonstração). Faltam estas rotas no Edge Function `tv`:

**1. Transcrição ao vivo da reunião** — `GET /events/:id/live?since=<seq>` (`:id` = `meeting:<uuid>`)
→ `{ "live": true, "lines": [{ "seq": 12, "speaker": "Ana", "text": "…", "at": "ISO" }] }` — só as linhas com `seq > since`. A TV chama a cada 4 s durante a reunião.

**2. Insights e tarefas sugeridas** — `GET /events/:id/insights`
→ `{ "summary": "…", "key_decisions": ["…"], "action_items": [{ "text", "owner", "due" }],
     "suggested_tasks": [{ "id", "title", "project_id", "project", "owner", "due" }] }` (a TV agrupa por projeto). Chamada a cada 20 s.

**3. Criar/ignorar tarefa sugerida** — `POST /events/:id/suggestions/:sid { "action": "accept" | "dismiss" }` → `{ ok, reply, task_id? }`.
Respeita "Editar tarefas" do dispositivo (403 com o motivo).

**4. Pontos da semana das missões** — `GET /chores/scores`
→ `{ "week_start": "2026-10-19", "members": [{ "member": "<id>", "points": 42, "goal": 60, "reward": "Cinema no sábado", "days": [5,10,0,8,12,7,0] }] }`.
Hoje a TV soma localmente os pontos das missões concluídas a cada dia (só enxerga o que viu ligada). Com a rota, o "pote de estrelas" fica exato.

**5. Celular como microfone** — `https://planknect.com/tv/remote` responde **404**. Criar essa página (usuário logado): botão "segure para falar" (Web Speech no celular) → manda o texto para o mesmo assistente com o `device_id` da TV escolhida → a resposta/proposta aparece no Alfred da TV (via `/alerts` ou um canal `GET /assistant/pending`). A TV já mostra o QR quando `remoteReady` for ligado.

**Observação:** "Entrar na reunião" na TV abre o Meet no computador ligado ao HDMI por um serviço local (`agent/computer-helper.js`, só Meet/Zoom/Teams, com segredo). Não depende do PlanKnect.

## 21. Status 24/10 — TV usando as rotas de missões e tarefas

- **Concluir missão** na TV → `POST /chores/:id { action: "submit" }` e mostra "aguardando aprovação" (amarelo). A TV não desfaz nem marca `done`; pontos só entram quando um adulto aprova no PlanKnect.
- **Nova missão** → `POST /chores { organizationId: household.id, title, points, due, frequency: daily|weekdays|once, scheduleStart, weekdays, assignees: [familyMemberId] }`.
- **Membros:** a TV liga `chores[].member` (familyMemberId) ao membro certo por `members[].familyMemberId`.
- **Tarefas:** Concluir (`done`), **Em andamento** (`in_progress`), Adiar (`due`) no detalhe e no modo Computador.
- Ainda não testado gravando dados reais (precisa ativar edição de Missões/Tarefas para a TV em Configurações › Dispositivos).

## 22. Deal Room, detalhes de projeto/tarefa e listas (pedidos 24/10)

A TV já tem a aba **Deals** (funil por estágio), o detalhe do deal e a lista de deals no modo Computador — hoje só com dados de demonstração porque `GET /deals` responde 405.

**1. Deals** — `GET /deals` → `{ "deals": [ {
  "id", "title", "company", "value": 2400000, "currency": "USD", "stage": "Negociação",
  "stages": ["Prospecção","Proposta","Negociação","Due diligence","Fechamento"], "probability": 0.6,
  "expected_close": "YYYY-MM-DD", "owner": "<member id ou nome>", "next_step": { "text": "Assinar NCNDA", "due": "ISO" },
  "last_activity_at": "ISO", "risk": "NCNDA pendente" | null, "project_id", "project", "url": "<link do Deal Room no celular>" } ] }`
`GET /deals/:id` → o mesmo + `documents: [{ name, kind: pdf|doc|sheet|image, url }]`, `contacts: [{ name, role, company }]`, `activity: [{ at, text, by }]`.
Respeitar o compartilhamento do dispositivo (Deals só se a TV tiver permissão; empresas autorizadas).

**2. Projeto** (`GET /projects/:id`) — hoje vem `milestones: []`, `team: []` e sem progresso. Pedidos: `progress` (0–1), `milestones: [{ title, due, done }]`, `team: [{ name, role }]`, `description`, e nas tarefas `blocked_by: [taskId]` / `blocks: [taskId]` (a TV já mostra "Depende de / Bloqueia" e uma seção de dependências no projeto quando vier).

**3. Tarefa** (`GET /tasks/:id`) — a TV já usa `url` (QR "abrir no celular"), `subtasks`, `lastComment`, `status` (in_progress/review). Útil: `created_at`, `updated_at`, `comments_count`, `blocked_by`.

**4. Listas** — a TV passou a usar `POST /lists/:id/items { items: [{ title }] }` (até 20) e `POST /lists/:id/items/:itemId { done }`.

## 23. Agenda individual (Wesley, Lara…) — o que falta no `/dashboard` (verificado 24/10)

A TV já monta a agenda por pessoa, mas hoje **nenhum dos 35 eventos traz `members`** (todos vêm `[]`) e nenhum é das crianças. Só a Sofia tem `memberDestinations`. Com isso a TV não consegue mostrar a semana do Wesley ou da Lara. Pedidos:

1. **`events[].members`**: ids das pessoas do evento (`familyMemberId` e/ou `userId`). Ex.: "Natação" → `[<id Wesley>, <id Lara>]`. Pode vir do participante do Google Calendar, do responsável da tarefa ou do quadro pessoal.
2. **Calendários das crianças**: compartilhar com a TV os calendários/quadros onde estão os compromissos delas (escola, esportes, médico) e criar `memberDestinations` para Wesley e Lara.
3. **Período**: hoje os eventos vão só de 25/10 a 01/11. Enviar **14 dias** (semana atual + próxima) para a TV mostrar "próxima semana".
4. Tarefas com `assignee` = id do membro (hoje 0 de 60 têm responsável que bata com `members[].id`).

**Deals:** a TV já lê o formato novo (`name`, `stageLabel`, `priority`, `temperature`, `temperatureAi`, `nextAction(Due)`, `outcome`, `values[]`). Esta TV recebe 403 — falta marcar "Mostrar pipeline de deals" para ela.


## 24. Música (Spotify Connect)

O app não toca o áudio: mostra e controla o Spotify Connect (app do Spotify na TV, Nest Hub, caixa de som). Cliente: `app/js/music.js`.

- `GET /music/now` → `{ connected, playing, progress_ms, track:{title,artist,album,image,duration_ms,uri}, device:{id,name,type,volume}, context:{name,uri} }`
- `POST /music/control { action: play|pause|next|previous|volume|seek|shuffle, value? }`
- `GET /music/devices` → `{ devices:[{id,name,type,active,volume}] }` · `POST /music/transfer { device_id, play }`
- `GET /music/playlists` → `{ playlists:[{uri,name,image,owner}] }` · `POST /music/play { uri } | { query }`
- Erros: 403 `music_disabled`, `not_connected`, `no_device`, `premium_required`.
- Polling: 5 s com o player aberto, 20 s no resto. Alfred: pausa/próxima/volume/"toca X" são resolvidos na própria TV; o resto vai para `/assistant` (`actions:[{type:'music',…}]`).
