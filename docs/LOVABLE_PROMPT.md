# Prompt for Lovable — finish the PlanKnect TV / Nest Hub integration

You built the TV API (`/functions/v1/tv`) and the TV app already uses it every day on a Samsung TV and a Google Nest Hub (public client code: https://github.com/mmbussacarini/PlanKnect — `app/js/api.js` shows exactly what the TV calls and expects). Below is what I verified **live today with a paired TV** and what is still missing. Please build everything in "Must have", then go further: you know PlanKnect's data model better than anyone, so **propose and add whatever else would make the TV the family's command centre** (see "Surprise us" at the end). For every change, reply with the route, the exact JSON shape and how to switch it on in Settings.

## 1. Verified facts (24 Oct, paired TV id `tv-5820c…`)

| Area | What the TV gets today | Problem |
|---|---|---|
| Personal boards | `memberDestinations` has **only Sofia**. Wesley and Lara both have a board + project in the family company set in their profile, but they do not appear. | Their schedules can't be shown. |
| Events | 71 events for 18 Oct–1 Nov. **Every `events[].members` is `[]`.** No event belongs to Wesley or Lara. | The per-person calendar (TV and Nest Hub frame) is empty for everyone. |
| Tasks | 60 tasks, all with `projectId` + `boardId`. **0 tasks have an `assignee` that matches `members[].id`.** | "Tasks by person" is empty. |
| Notes (Recados) | `notes: []`; `GET /notes` → 405. | The Recados tab is always empty. |
| Deals | `GET /deals` → **403 forbidden** for this TV, even after "Show deals pipeline" was ticked (it may have been ticked on another paired TV). | No deals on screen. |
| Settings | `settings.content` = `{ "events": true }` only. | The TV can't tell which content is switched on, or why something is missing. |
| Projects | `GET /projects/:id` → `milestones: []`, `team: []`, no `progress`, no dependencies. | The project detail can't show health or dependencies properly. |
| Meetings | Meeting events have `conference.url` (good). There's no live transcript, insights or suggested tasks for the TV. | The meeting room's Knect Meeting panel only works in demo. |
| Phone mic | `https://planknect.com/tv/remote` → 404. | No way to talk to Alfred from a phone. |
| Version | `GET /version` → 405, `POST /version` → 404. | The TV polls every 15–20 s instead of refreshing instantly. |

Working well: pairing, `/dashboard`, task/event detail, `/assistant` with proposals + Confirm/Cancel, `/voice/tts` (WAV), `/ai/memory`, chores submit, lists, `memberDestinations` for Sofia.

## 2. Must have

1. **Personal boards for every member.** Return `memberDestinations` for **all** family members who have a board/project in their profile, **including children without a login** (`userId: null`). If a per-TV setting ("Shared + personal items") is required, show it clearly on the device page and make it a single switch per member.
2. **Who each event and task is for.**
   - `events[].members`: the `familyMemberId` and/or `userId` of every person in the event (Google Calendar attendees, task assignee, personal board, kids' activities).
   - `tasks[].assignee` must match a `members[].id`, or add `assigneeFamilyMemberId`.
3. **Kids' calendars.** Share school, sport and medical calendars with the TV. Document the setting.
4. **Date range.** Honour `from`/`to` on `/dashboard`. The TV sends this week + next (15 days). Today events stop at 1 Nov.
5. **Notes (Recados).** `notes: [{ id, text, by, at, seenBy: [] }]` in `/dashboard`, plus `POST /notes { text, by }` and `POST /notes/:id/seen { member }` (the TV already calls both).
6. **Deals per device.** Make "Show deals pipeline" visible for **each** paired device (show the device id `tv-…` next to its name), so the user can tell which one is on. Check why `tv-5820c…` still gets 403.
7. **Content status.** Return `settings.content` with **every** toggle and its state: `{ events, tasks, taskWrite, chores, choreWrite, lists, listWrite, notes, deals, meals, photos, cameras }`. The TV will explain on screen what to switch on.
8. **Meetings (Knect Meeting):**
   - `GET /events/:id/live?since=<seq>` → `{ live, lines:[{seq,speaker,text,at}] }`
   - `GET /events/:id/insights` → `{ summary, key_decisions[], action_items[], suggested_tasks:[{id,title,project_id,project,owner,due}] }`
   - `POST /events/:id/suggestions/:sid { action: "accept"|"dismiss" }` → creates the task (respects task editing).
   - Recordings: `recording: { url (signed), duration }` on past meetings.
9. **Projects:** `progress` (0–1), `milestones[{title,due,done}]`, `team[{name,role}]`, `description`. On tasks: `blocked_by[]` / `blocks[]`, `created_at`, `updated_at`, `comments_count`.
10. **Chores weekly score:** `GET /chores/scores` → `{ week_start, members:[{ member, points, goal, reward, days:[7] }] }` (the TV shows a star jar per child).
11. **Phone as microphone:** build `planknect.com/tv/remote` (signed-in user). "Hold to talk" (Web Speech on the phone) → send to the same assistant with the chosen TV's `device_id` → the reply or proposal appears on that TV (via `/alerts` or `GET /assistant/pending`).
12. **Instant refresh:** `GET /version` → `{ version }` that changes on any data change. Even better: a Supabase Realtime channel per device (`tv:<device_id>`) the TV can subscribe to.
13. **AI routes for Alfred:** `GET /ai/briefing?lang=en-GB&persona=alfred` and `GET /ai/suggestions?lang=en-GB` (each suggestion `{ id, icon, title, body, accept, action }` and `POST /ai/suggestions/:id {action}`). Use family memory + calendar + tasks + deals.

## 3. Nice to have

- **Cast receiver:** register a PlanKnect Cast receiver app id (Google Cast SDK console) pointing to the hosted hub, so the Nest Hub doesn't depend on DashCast.
- **Host the TV app on planknect.com** (`public/tv/` = the repo's `app/`), with the "Show on Nest Hub" page at `/tv/hub/`.
- **Doorbell:** Google Nest SDM events → `/alerts` with snapshot + `POST /door/live` WebRTC (contract in the repo docs).
- **Member avatars** (photo URL) and a colour per member/project in `/dashboard`.
- **`GET /capabilities`** returning which routes and features are live for this device.

## 4. Surprise us

Think like the head of a busy family who also runs several companies, standing in the living room with a remote. What would you add?
- **Family:** a weekly family digest, who's picking up whom, homework due, birthdays, bills, travel and flights, school notices.
- **Work:** today's meetings with prep notes, deal-room changes since yesterday, an "overdue across companies" view, a client waiting on an answer.
- **The TV itself:** proactive alerts the TV should pop up, things Alfred could say each morning, and data that would make the TV screens richer.

Please add the ones you can build now, and list the rest with the shape you'd send. **Don't hold back.** The TV side is ready to render new fields quickly.

## 5. Rules to keep

- Nothing is written without Confirm on the TV (proposals) or an explicit edit permission per device.
- Never send costs, commissions, margins or finance scenarios to the TV.
- Children's devices only see and submit their own items.
- Always reply with: route, method, request/response JSON, the Settings switch, and what you tested.

---

# Round 2 — KnectMeet on the TV (reply to your meeting plan)

**Hardware in use:** Samsung QA75Q60B (2022, Tizen 6.5) running our packaged web app; Google Nest Hub (1st gen) via Cast (DashCast); LG webOS supported by the same code. A MacBook is connected by HDMI.

**Correction on HDMI:** on Samsung the app *can* show a physical HDMI input in a window using the official `tizen.tvwindow` API (privilege `tv.window`); our "Computer mode" already does this (HDMI window + PlanKnect around it). We don't read pixels — the TV composites the input under the page. So Scenario B works without Multi-View.

**Already built on the TV (uses your routes):**
- Meeting room HUD: live transcript (`GET /events/meeting:<uuid>/live?since=`, 4 s), insights (`/insights`, 10 s), suggested tasks grouped by project with Create/Dismiss (`POST …/suggestions/:id`), decisions, and now **risks / questions / conflicts / duplicates** cards, agenda progress, linked deal card, Meet QR and **Join on computer** (opens the Meet on the HDMI-connected Mac through a local helper).
- Your gate messages (e.g. "Review this meeting and select it for this TV") are shown on screen.
- **"Ask the meeting"**: the TV now sends `meeting_id` with `POST /assistant` (text and audio). Please implement it: inject the last minutes of transcript + agenda + project tasks + linked deal, answer in the requested `lang` with Alfred's tone, and return proposals as usual.

**Please add/confirm:**
1. `POST /assistant` with `meeting_id` (above) — and say what the response adds (e.g. `sources: [{seq, speaker}]` so the TV can highlight the quoted lines).
2. Insights response: include `risks[]`, `questions[]`, `conflicts[]`, `duplicates[]` (strings or `{text, seq}`); keep `pricing` server-side only.
3. `agenda: [{ title, done }]` (done = covered in the conversation) on the meeting detail, so the TV shows agenda progress.
4. `dealId` (or `projectId`) on the meeting event so the TV can show the linked deal; and a reviewed **"add to deal"** action (`POST /events/meeting:<uuid>/suggestions/:id { action: "accept", target: "deal" }`) if you support it.
5. Optional: slide/screen-share snapshots from the bot (`GET /events/meeting:<uuid>/frames?since=` → signed image URLs) so the TV can show what is being presented.
6. Route naming: your note mentions `/events/:id/meeting/live`; the deployed route is `/events/meeting:<uuid>/live` — the TV uses the deployed one. Please keep it.

---

# Round 3 — Notes (Recados) from the TV

The TV's new-note form now sends:
```json
POST /notes { "text": "Jantar pronto!", "by": "<members[].id>", "to": ["<familyMemberId>", "..."], "expires_at": "2026-10-25T23:59:00+11:00", "device_ids": ["tv-…"] }
```
- `to` = who the note is for (empty = everyone). Please store it and return it in `GET /notes` / dashboard `notes[]`.
- `expires_at` = when it disappears (1 h, tonight, tomorrow, 3 days, 1 week, or null = never). Please honour it (omit expired notes).
- `device_ids` = show only on these screens (null = all screens of the household). Please store and filter per device, or return it so the TV filters.
- "Seen" now supports several people at once (the TV calls `POST /notes/:id/seen` once per member).

---

# Round 4 — Spotify "Now playing" on the TV and Nest Hub

The TV app and the Nest Hub already have a full **Now playing** player (cover, title, artist, progress, play/pause/next/previous, volume, "Play on" device picker, playlists) and Alfred handles "play the family playlist / pause / next / louder" locally. Today it runs in demo. Please build the backend so it works with the family's real Spotify.

**How it works:** the sound never comes from our web app (Spotify blocks its Web Playback SDK on TVs). We use the **Spotify Web API + Spotify Connect**: the music plays on the Spotify app of the Samsung TV, the Nest Hub (Cast), a speaker or a phone, and the TV/Nest Hub only shows and controls it.

## 1. Connect Spotify once (PlanKnect web)
- Settings › Integrations › **Spotify** › "Connect" → Spotify OAuth (Authorization Code + PKCE), scopes: `user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read`.
- Store the refresh token server-side (encrypted), per **household** (optionally per member: "whose Spotify does this TV use?"). Refresh access tokens automatically. Never send Spotify tokens to the TV.
- Device page: a switch **"Music (Spotify)"** per paired TV/hub (`settings.content.music`), off → the routes below answer 403 `{ "error": "music_disabled" }`.

## 2. Routes (the TV already calls these, base `/functions/v1/tv`)
| Method | Route | Body | Response |
|---|---|---|---|
| GET | `/music/now` | — | `{ connected, playing, progress_ms, track:{ title, artist, album, image, duration_ms, uri }, device:{ id, name, type, volume }, context:{ name, uri } }` · not connected → `{ connected:false }` · nothing playing → `{ connected:true, playing:false, track:null }` |
| POST | `/music/control` | `{ action: "play"\|"pause"\|"next"\|"previous"\|"volume"\|"seek"\|"shuffle", value? }` | `{ ok:true }` (`value` = 0–100 for volume, ms for seek, bool for shuffle) |
| GET | `/music/devices` | — | `{ devices:[{ id, name, type, active, volume }] }` |
| POST | `/music/transfer` | `{ device_id, play:true }` | `{ ok:true }` |
| GET | `/music/playlists` | — | `{ playlists:[{ uri, name, image, owner, tracks }] }` (user's playlists, 50 max, family ones first) |
| POST | `/music/play` | `{ uri }` or `{ query }` (+ optional `device_id`) | `{ ok:true, playing:{ name, uri } }` — `query` = search tracks/playlists/artists and play the best match |

Errors: `{ "error": "not_connected" }` (Spotify not linked), `{ "error": "no_device" }` (Spotify's NO_ACTIVE_DEVICE — the TV then shows "Play on" so the user picks a device), `{ "error": "premium_required" }` (Spotify only allows remote control with Premium).

- **No active device fallback:** if `play`/`play {uri}` gets NO_ACTIVE_DEVICE and the household has a **default device** set in Settings (e.g. "Samsung TV"), transfer to it and retry.
- Cache `/music/now` for ~2 s per household (the TV polls every 5 s while the player is open, 20 s otherwise). Even better: push changes via `/version` bumps.

## 3. Alfred
- `POST /assistant` should also understand music ("toca a playlist da família", "play some jazz in the kitchen", "pause", "next song", "what's playing?") and return `actions:[{ type:"music", action:"play", uri|query, device_id? }]` — music needs **no Confirm**. The TV already handles the simple commands locally; the server is the fallback for richer requests ("play something calm for dinner", "play Lara's playlist on the Nest Hub").
- `/ai/briefing` may mention what's playing or suggest a playlist (e.g. dinner time → "Jantar tranquilo").

## 4. Nice to have
- `GET /music/recent` (recently played) and `GET /music/queue`.
- Per-member playlists on the kids' tiles ("Músicas das crianças").
- Spotify "family mix" suggestion at dinner/weekend in `/ai/suggestions`.

Reply with: routes, JSON samples, the Settings switch, and what you tested with a real Spotify Premium account.
