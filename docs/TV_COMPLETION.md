# PlanKnect TV / Nest Hub integration — 24 October 2026

Current integration handoff, complete route inventory, error policy and real-device acceptance checklist: [TV_INTEGRATION_HANDOFF.md](TV_INTEGRATION_HANDOFF.md).

## Delivery and boundaries

The PlanKnect API and account settings are implemented here. The Samsung/Nest client is a separate application and must consume these contracts; this update does **not** package or publish that client, register a Google Cast receiver, or publish the PlanKnect website.

The project summary's broken shopping-list query now uses the real `completed` field. Its existing meetings, events, risks/questions, deals, milestones, shopping and same-organization links remain available.

## Authentication for every TV request

Base: `https://mfenmzwuosubzfuehywc.supabase.co/functions/v1/tv`

```http
Authorization: Bearer <opaque paired TV access token>
x-device-id: <exact paired device ID>
Content-Type: application/json
```

Both headers are required. Never use a service key. Existing `/device/code`, `/device/token`, `/token/refresh` and `/logout` remain. The phone-only `/remote/assistant` uses the signed-in user's Supabase access token instead, and may address only their own active paired TVs.

## Account setup

1. Family → choose Wesley/Lara/Sofia → **Set project & board** → Organization → Project → Board → Save. Children do not need a login.
2. Settings → Devices → find the **exact device ID** beside its name → Content & connections.
3. Choose authorized calendars; enable Calendar/Tasks/Chores/Shopping/Notes as needed.
4. Under **Personal calendars on this TV**, select each person whose personal board should be shown. A person marked Nothing/hidden in their profile cannot be exposed by this switch. Switching a person off on this TV overrides their default personal-sharing preference.
5. School, sport and medical activities must already be on an authorized shared calendar or the chosen personal board. Private Google calendars are not automatically read; map/share them using the existing Google calendar setup first.
6. Editing switches are independent: tasks, chores, shopping, notes and household memory. Enable only the operations intended for that device; Save sharing.
7. Deals requires **Show deals pipeline** on this exact device. The inspected preview TV still had only `{ "content": { "events": true } }`, explaining its Deals 403. Permissions were not silently enabled.
8. Meeting live/insights/recordings require their separate switches **and** selection under **Reviewed meetings approved for this TV**. Review recordings/transcripts for private/commercial content before selecting. Recording consent is additionally required.
9. For a child's personal screen, select that member under **Own-items-only device**. It shows only the selected personal board and their chore submissions; no household memory, deals, meeting evidence, photos or shopping. A parent-paired living-room TV acts as the parent, not the child speaking.

## 1. Dashboard, destinations and identity

`GET /dashboard?from=2026-10-18&to=2026-11-02`

`from` inclusive and `to` exclusive; ISO dates/timestamps, maximum 32 days. The supplied 15-day range is supported. Task priority feed remains today/next seven days/recent overdue; `from/to` controls calendar events, meetings and meals, not that task feed.

Relevant response additions:

```json
{
  "memberDestinations": [{
    "familyMemberId": "<family-member-uuid>", "userId": null,
    "organizationId": "<organization-uuid>", "projectId": "<project-uuid>",
    "boardId": "<board-uuid>"
  }],
  "members": [{
    "id": "<linked-user-id-or-family-member-id>", "familyMemberId": "<family-member-uuid>",
    "name": "Wesley", "color": "<calendar-color>", "avatar": "<photo-url-or-null>",
    "photoUrl": "<photo-url-or-null>", "kid": true
  }],
  "tasks": [{
    "id": "<task-id>", "boardId": "<board-id>", "projectId": "<project-id>",
    "assignee": "<matching-members-id-or-null>",
    "assigneeFamilyMemberId": "<family-member-id-or-null>",
    "assignees": ["<members-id>"], "created_at": "<ISO>", "updated_at": "<ISO>"
  }],
  "events": [{"id":"<task-id-or-meeting:uuid>","members":["<members-id>"],"boardId":"<board-id>","projectId":"<project-id>"}],
  "notes": [{"id":"<note-id>","text":"Pickup at 3", "by":"<author-user-id>","at":"<ISO>","seenBy":[]}],
  "settings": {"content": {
    "events":true,"tasks":true,"taskWrite":false,"chores":true,"choreWrite":false,
    "lists":true,"listWrite":false,"notes":true,"noteWrite":false,"deals":false,
    "meals":true,"members":true,"projects":true,"photos":false,"cameras":false,
    "meetingLive":false,"meetingInsights":false,"meetingRecordings":false
  }}
}
```

Shapes above show relevant fields, not an entire dashboard. Member identity uses explicit task-family assignments, task-user assignments and exact personal-board ownership. Meeting attendees match only visible family members' emails within authorized organizations; email addresses themselves are not returned. Private event members and details stay blank. Filter personal views by exact board ID, never by guessed names.

## 2. Notes / Recados

Switch: Family notes; writing additionally requires note editing.

- `GET /notes` → `{ "notes": [{ "id", "text", "by", "at", "seenBy": [] }] }`.
- `POST /notes` request `{ "text": "Pickup at 3", "by": "Wesley" }` → `{ "ok": true, "id": "<note-id>" }`. `by` is accepted for compatibility, but ownership is always the approving account; a spoken name cannot impersonate another person. New notes belong to the TV's main household.
- `POST /notes/<note-id>/seen` request `{ "member": "<family-member-uuid>" }` → `{ "ok": true }`. Member must be active in the note's organization. Repeated seen calls upsert, not duplicate.

Expired notes are omitted. Refresh after an explicit Save/Seen action.

## 3. Deals

Switch: Show deals pipeline, per exact device ID.

- `GET /deals` → `{ "deals": [...] }`, maximum 60 open deals, priority first.
- `GET /deals?closed=true` includes closed deals.
- `GET /deals/<deal-id>` returns one authorized deal.

Each deal: `id,name,project,projectId,boardId,organizationId,stage,stageLabel,priority,temperature,temperatureAi,nextAction,nextActionDue,outcome,lastActivity,values`.

`values`: `[{ "currency": "AUD", "frequency": "once", "amount": 1000 }]`. Never combine different currencies/periods. No costs, commissions, margins or financial scenarios are projected. Details: `docs/TV_WRITES.md`.

## 4. Live meetings, insights and suggestion review

Switches: Calendar + respective meeting switch + exact reviewed meeting selected. Commercial evidence is refused rather than partially exposed. Raw transcript/recording sharing is an explicit reviewed exception, not enabled by the general Calendar switch.

Use dashboard event ID `meeting:<uuid>` or a task linked to that meeting.

- `GET /events/meeting:<uuid>/live?since=0`

```json
{"live":true,"lines":[{"seq":1,"speaker":"Marcelo","text":"Let's confirm pickup","at":"<ISO>"}]}
```

`since` is a nonnegative sequence; excludes partial lines; maximum 200 returned lines. Persist the last received sequence; query errors do not advance it.

- `GET /events/meeting:<uuid>/insights`

```json
{
  "summary":"<meeting-summary>","key_decisions":["Confirm pickup"],"action_items":[],
  "suggested_tasks":[{"id":"<proposal-id>","title":"Confirm pickup","project_id":"<project-id>","project":"Family","owner":null,"due":"2026-10-25"}],
  "recording":null
}
```

- `POST /events/meeting:<uuid>/suggestions/<proposal-id>` with `{ "action": "accept" }` → `{ "ok": true, "taskId": "<task-id>" }`; `{ "action": "dismiss" }` → `{ "ok": true }`.

Accept only after a visible confirmation. Requires task editing, current editor access and an authorized explicit board destination. Creates a source-linked ordinary task once transactionally. Stale/previously handled proposals return 409; refresh instead of repeating creation. Non-create proposals require the app's full meeting review.

## 5. Recording access

`GET /events/meeting:<uuid>` may include:

```json
{"recording":{"url":"<short-lived-signed-storage-url>","duration":1800,"expires_in":300}}
```

Otherwise `recording:null`. Requires recording switch, reviewed meeting selection, stored consent, private meeting-id-prefixed storage, transcript evidence and no detected commercial evidence. External provider/public recording URLs are not forwarded. Reload details for a fresh URL after five minutes. Do not persist signed URLs.

## 6. Projects and task dependencies

Switch: Projects; open task projection additionally requires Tasks.

`GET /projects/<project-id>`:

```json
{"id":"<project-id>","name":"Family","description":"<description>","progress":0.5,"milestones":[{"title":"Term registration","due":"2026-11-01","done":false}],"team":[{"name":"Marcelo","role":"owner"}],"openTasks":[]}
```

Progress is done / visible tasks; up to 1000 visible tasks loaded. Hidden personal boards cannot enter counts or open tasks.

`GET /tasks/<task-id>` includes:

```json
{"blocked_by":["<visible-task-id>"],"blocks":["<visible-task-id>"],"created_at":"<ISO>","updated_at":"<ISO>","comments_count":2}
```

Dependency IDs are restricted to other visible tasks. Existing title/status/date/subtasks remain.

## 7. Weekly chore scores

Switch: Chores. `GET /chores/scores`:

```json
{"week_start":"2026-10-19","members":[{"member":"<family-member-id>","points":10,"goal":null,"reward":null,"days":[0,0,0,0,0,10,0]}]}
```

Week begins Monday in the household timezone. Reads already-awarded positive point history; never awards points on TV submission. `goal` and `reward` use optional member preferences `weekly_points_goal`/`weekly_reward`, otherwise null; no invented targets. Own-items-only devices receive only their member.

## 8. Phone microphone and TV delivery

Page: `https://planknect.com/tv/remote` (website update requires publishing). Sign in, select TV, hold microphone, release, review text, Send to TV. Unsupported Web Speech browsers can type. Voice does not auto-send.

Phone uses **user** access token:

`POST /remote/assistant` request:

```json
{"device_id":"<chosen-tv-id>","text":"Add milk to groceries","lang":"en-GB"}
```

Response: `{ "ok": true, "reply": "Shall I add milk?", "needs_confirmation": true }`.

TV uses its own token:

`GET /assistant/pending?since=<last-cursor-ISO>`:

```json
{"replies":[{"id":"<reply-id>","created_at":"<ISO>","reply":{"reply":"Shall I add milk?","proposals":[],"actions":[],"needs_confirmation":true}}],"cursor":"<ISO>"}
```

Deduplicate by reply ID, then update cursor after processing. Pending replies expire; render the real proposal array (illustrative array above is empty). Confirm/Cancel uses existing `POST /assistant/proposals/<id>` `{ "action": "confirm"|"dismiss" }`. The phone never confirms on behalf of the TV.

## 9. Refresh and capabilities

- `GET /version` → `{ "version": "<opaque-sha256>", "poll_after": 15 }`.
- `GET /capabilities` → `{ "device_id": "<id>", "content": { "...all normalized toggles": true }, "routes": ["dashboard", "notes", "deals", "chores/scores", "events/:id/live", "events/:id/insights", "events/:id/suggestions/:sid", "assistant", "assistant/pending", "voice/tts", "ai/briefing", "ai/suggestions", "version"], "refresh": "poll", "poll_after": 15 }`.

Version hashes private organization change counters, device settings and the day. Triggers cover tasks/subtasks/assignments/dependencies/comments, projects/boards/team, members/chores/points, notes/seen, shopping, meetings/transcript/insights/proposals, meals, deals, memory and pending replies. A changed record outside the current window also invalidates the version; signed URLs do not. Poll and refresh dashboard only when changed. This is **not** an instant Realtime subscription; Google camera/photo-source updates still use their existing refresh flow.

## 10. Alfred briefing and suggestions

`GET /ai/briefing?lang=en-GB&persona=alfred&from=2026-10-24&to=2026-11-01`

→ `{ "reply": "<concise-spoken-briefing>", "generated_at": "<ISO>" }`.

`GET /ai/suggestions?lang=en-GB`:

```json
{"suggestions":[{"id":"family-briefing","icon":"calendar","title":"Family and work briefing","body":"<generated-briefing>","accept":"Open agenda","action":{"type":"navigate","view":"agenda"}}]}
```

`POST /ai/suggestions/family-briefing` with `{ "action": "accept" }` → `{ "ok": true, "actions": [{ "type": "navigate", "view": "agenda" }] }`; dismiss returns empty actions. No task/deal is created by briefing/suggestion reads. Uses device-authorized calendar/tasks, client-safe deal stage/next action, and household memory. Own-items-only devices receive no household memory. This first suggestion is navigation-only; operational actions remain the ordinary confirmed assistant proposals.

Optional speech: `POST /voice/tts` `{ "text": "<briefing>", "lang": "en-GB" }` → `{ "audio": "<base64>", "mime": "audio/wav" }`. Keep WAV support; not MP3.

## Additional opportunities — not implemented here

- Registered Google Cast receiver ID: requires Google Cast Console registration/ownership.
- Hosting external TV repository under `/tv/hub/`: requires importing and testing the external client; not part of this API delivery.
- Instant Realtime updates: future device subscription; organization change counters and version polling are available now.
- Rich homework/pickup/birthday/bill/flight digest, school notices and proactive alerts: structured schemas and audience review needed before exposing more account data to a shared screen.
- Project-specific colour values and editable weekly score goals/rewards: existing member colours/preferences are returned; no new setup editor was added.

Existing Nest snapshots, door alerts and WebRTC remain in the previous integration; real camera grant/device behavior was not verified by this update.

## Verification and limitations

- 66 TV automated tests pass, including eleven new personal destination/identity/range/settings/notes/child/meeting/score/version rules.
- TV entrypoint Deno check passes; ten focused frontend regression tests pass.
- Isolated desktop/mobile Plan at a glance actions and event navigation verified, no page overflow or runtime errors. Real requested project redirected to sign-in; its authenticated live data was not verified.
- Live AI Gateway readonly Alfred response tested: reply present, zero proposals, no writes.
- API deployment succeeded; deployed capabilities and phone-assistant routes reject invalid tokens with 401.
- No paired TV token or authenticated external Supabase browser session was available. Actual Samsung/Nest microphone, playback, note save/readback, phone→TV delivery and meeting approval/readback remain unverified.
- Database migrations introduced no new linter findings; 36 pre-existing warnings remain outside this task.

Skill used for the maintained assistant request: AI Apps OpenAI Responses (existing raw HTTP client preserved).