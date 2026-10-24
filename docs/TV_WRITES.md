# PlanKnect TV: adding and updating chores, tasks and shopping

See [TV completion contracts](./TV_COMPLETION.md) for member/device switches, notes, meeting review/recordings, project dependencies, weekly scores, phone microphone, version and Alfred briefings.

Base URL: `https://mfenmzwuosubzfuehywc.supabase.co/functions/v1/tv`

Every call uses the paired TV's opaque access token, **not** a Supabase user token or service key:

```http
Authorization: Bearer <TV_ACCESS_TOKEN>
x-device-id: <PAIRED_DEVICE_ID>
Content-Type: application/json
```

## Setup

On PlanKnect, open **Settings → Devices → Content & connections**. Enable Chores and/or Tasks, select the authorized family/company calendars, enable the corresponding chore/task editing checkbox, then **Save sharing**. Editing is off by default; sharing content alone does not grant write access. Do not automatically enable it for every TV.

Writes act within the approving account's existing permissions. A shared TV paired by a parent acts as that parent, not as whichever child speaks; a spoken name is an assignee choice, never authentication. Child-owned pairing may submit only that child's assigned chores and cannot manage chores unless granted that permission.

Fetch `GET /dashboard` to load organizations, projects, members, tasks and chores. Chore assignees use `members[].familyMemberId`, whereas task assignees use a linked user's `members[].id`. The dashboard chore `member` is a family-member row ID. Never substitute an email address or name for either ID.

## Direct chore forms

Only send these calls after the person taps Save/Submit.

### Create — `POST /chores`

```json
{
  "organizationId": "<family-uuid>",
  "title": "Tidy bedroom",
  "description": "Put toys away",
  "assignees": ["<family-member-uuid-1>", "<family-member-uuid-2>"],
  "points": 10,
  "due": "2026-10-26",
  "frequency": "weekdays",
  "scheduleStart": "2026-10-26",
  "scheduleEnd": "2026-11-30",
  "weekdays": [1, 2, 3, 4, 5]
}
```

Response: `{ "ok": true, "chores": [...] }`. One independent chore per selected person, with independent completion and points. An empty/omitted assignee array creates an unassigned chore. Family defaults to the paired household if omitted. Title is required; dates are `YYYY-MM-DD`; points are integers 0–10000. Frequency: `once`, `one-time`, `daily`, `weekdays`, `weekly`, `biweekly`, `monthly`. Weekdays use Sunday=0 through Saturday=6. For weekday recurrence provide a due date matching a selected weekday. Schedule end must follow start; due must lie within those bounds.

### Edit — `POST /chores/<chore-uuid>`

```json
{ "title": "Tidy bedroom and desk", "due": "2026-10-27", "points": 15 }
```

Any create fields except organization ownership may be updated on an open/rejected chore. To change assignee, use `assignees: ["<family-member-uuid>"]`; `[]` unassigns. Editing accepts at most one assignee; create another chore to assign several people. `due`, `scheduleStart`, `scheduleEnd` accept null to clear. Response: `{ "ok": true, "chore": {...} }`. Ownership is always taken from the existing chore, not the caller's organization choice.

### Submit completion — `POST /chores/<chore-uuid>`

```json
{ "action": "submit" }
```

Response: `{ "ok": true, "pendingApproval": true, "chore": {...} }`. Show **Waiting for approval**, not **Approved**. Do not send `status: done`, `is_completed`, or approve requests. Adults approve in PlanKnect's existing Chores & Rewards view; that awards points and creates the next recurring occurrence once. TV submission itself never awards points.

## Direct task forms

## Family personal projects and boards

In **Family / family calendar → select a person → Set project & board** (or **Edit → Family sharing & TV**), choose the personal Organization → Project → Board and **Save changes**. The organization starts with the family; use **+ Create new…** at any level to create missing parents and a board. One shared family project may have a separate personal board per person, or each person may have a separate project. Do not select the shared family board as a personal destination if its shared activities should remain visible independently.

After saving, **New personal task** / **New personal event** opens the existing reviewed activity form on that exact board with the family member assigned. Existing activities are not moved; activity creation elsewhere retains its explicitly selected project/board. Linking a destination does not grant that person access to a different organization or project — use the existing membership/invitation controls when needed.

Choose **Only family-shared items**, **Shared + their personal items**, or **Nothing** under TV visibility. Personal-board tasks/events/linked meetings are excluded unless explicitly enabled; missing preferences default to shared-only. Hidden/inactive members' linked personal boards are excluded. Unlinked family/shared boards retain the existing device rules. Sharing a personal board between several people requires all of them to opt in before it is displayed. This is board-level sharing, not a per-task privacy override; private event details remain redacted.

The TV must select the destination organization in **Settings → Devices → Content & connections** as well. The approver must already have access; no personal Google calendars are read. Cross-organization links alone cannot expand TV access. `/dashboard` returns `memberDestinations: [{familyMemberId,userId,organizationId,projectId,boardId}]` for opted-in destinations in the selected organizations, and tasks include `boardId`. For a personal screen, filter the already-authorized task/event feed by the exact board; do not fetch arbitrary boards or infer identity from a spoken name. Send that exact `projectId` + `boardId` to `POST /tasks`, and the linked `userId` as `assignee` when available. Kids without logins retain a family-member identity for chores; do not send that row ID as a task login assignee.

Refresh `/dashboard` after setup changes and after confirmed saves. Task details, project task lists, calendar task events, linked meetings, task writes and Alfred's task/board context follow the same personal-board restriction. The external TV/Hub application must wire these destinations into its screens; no Samsung app is packaged here. Existing edit opt-ins, roles and review-before-write rules still apply.

### Create — `POST /tasks`

```json
{ "projectId": "<project-uuid>", "boardId": "<board-uuid>", "title": "Buy school supplies", "due": "2026-10-27", "priority": "medium", "assignee": "<linked-user-uuid>" }
```

Project and title are required. `boardId` is optional only when exactly one active board exists; otherwise select the exact board from PlanKnect's project setup and retain its ID in the TV form. Do not guess a board. Voice proposals have a board catalogue and can select/clarify it. Response includes the saved task ID and its phone URL.

### Update — `POST /tasks/<task-uuid>`

```json
{ "title": "Buy notebooks", "status": "in_progress", "priority": "high", "due": "2026-10-28", "assignee": "<linked-user-uuid>" }
```

Send only changed fields. Supported status: `todo`, `in_progress`, `review`, `done`; priority: `low`, `medium`, `high`, `urgent`. Use `due: null` to remove a date or `assignee: null` to unassign. Assignee must belong to the project/company. Task editing retains existing owner/admin/editor/member role rules. Meeting/Google/travel/series/client-visible dates cannot be changed here: use PlanKnect's reviewed schedule instead. Response: `{ "ok": true, "task": {...} }`.

## Voice through Alfred / Knect

## Shopping forms and readback

In **Settings → Devices → Content & connections**, enable **Shopping lists** and **Allow this TV to create and edit shopping lists…**, then **Save sharing**. Requires the approving account's current family/company membership; read sharing alone is not editing permission. No private calendars or out-of-scope lists are added.

Use the same TV token and device header as above. Only call writes after Save/check-off confirmation:

- `POST /lists` — `{ "organizationId": "<family-uuid>", "title": "Weekly groceries" }`. Creates a family-shared list; organization defaults to the paired family. Returns `{ok:true,list:{id,...}}`.
- `POST /lists/<list-uuid>` — `{ "title": "Weekend groceries", "completed": false, "preferredStore": "Local supermarket" }`. Rename, complete/reopen, update preferredStore/storeCategory (nullable). Ownership and sharing cannot be changed.
- `POST /lists/<list-uuid>/items` — `{ "items": [{ "title": "Milk", "quantity": 2, "unit": "litres", "category": "Dairy" }] }`. Adds 1–20 items; returns `{ok:true,added,items,listId}`.
- `POST /lists/<list-uuid>/items/<item-uuid>` — `{ "title": "Oat milk", "quantity": 3, "unit": "litres", "done": true }`. Edits or checks off an existing item; `done:false` reopens it. Returns `{ok:true,item,listId}`. Completion records the approving account.
- `GET /lists/<list-uuid>` — returns the saved list and its items, including completed items and `done`, quantity and unit. Use this for readback even if completing the list removes it from the dashboard.

Items also accept description/category; quantity must be positive and can be cleared with null, as can unit/description/category. Fields are allowlisted; never send an ownership ID, completed_by or added_by. Item IDs must belong to the exact list. No deletion endpoint is exposed.

Voice examples: “Create a weekly groceries list for the family”, “Add milk and bread to Weekly groceries”, “Mark milk purchased in Weekly groceries”, “Change milk to three litres”, “Rename Weekly groceries to Weekend groceries”, “Reopen Weekend groceries”. New proposal kinds: `create_list`, `update_list`, `update_list_item`; `add_list_items` now uses the same opt-in and shared save handler. Render Confirm/Cancel as below; nothing saves automatically from speech. Refresh `/dashboard` and read the exact `/lists/:id` after success; retain drafts after errors. The external Samsung/Hub app must wire its forms to these calls.

## Voice through Alfred / Knect (confirmation)

`POST /assistant` accepts text or recorded base64 audio, as before:

```json
{ "text": "Create a ten-point tidy-bedroom chore for Sofia and Alex on Monday in the family", "persona": "alfred", "lang": "en-GB", "tz": "Australia/Sydney", "speak": true }
```

Other examples: “Move tidy bedroom to Tuesday”, “Submit my tidy-bedroom chore for approval”, “Mark buy notebooks in progress”, “Move buy notebooks to Wednesday”. Send explicit dates/family/project when needed. For a follow-up, resend the complete corrected sentence; the TV assistant does not persist conversation history.

Render every returned `proposals[].summary` with Confirm and Cancel. Do **not** auto-confirm from speech or call a direct save when a proposal was returned. New kinds: `create_chores`, `update_chore`, `submit_chore`, `update_task`; existing `create_task`, `complete_task`, `add_list_items` remain supported.

```http
POST /assistant/proposals/<proposal-uuid>
```
```json
{ "action": "confirm" }
```

Use `{ "action": "dismiss" }` to cancel. A proposal expires after 15 minutes and executes at most once. Confirmation rechecks current permissions. Only show Done after `ok: true`; a submitted chore is still awaiting adult approval. Refresh the dashboard after each successful direct save or confirmed proposal.

## Error handling and causes

- **Missing chore route/tool:** previously TV chores could be displayed but had no write endpoint, and Alfred had no chore tool. Posting a chore to `/tasks` also used the wrong fields/model. Dedicated chore routes and reviewed voice tools now exist.
- **Task field restrictions:** the old task validator accepted only `todo`/`done` and `due`, so valid `in_progress`/`review`, title, priority and assignee edits were rejected. These are now supported. Missing parent projects now return a controlled error instead of crashing.
- **Earlier family membership problem:** the family creator was missing from organization membership, rejecting normal app chore inserts. Membership was repaired earlier; this was separate from missing TV chore routes.
- **401:** refresh the TV token once using the existing token rotation flow; if it fails, pair again. Never retry with a service key.
- **403:** content/editing opt-in or current family/project permission is missing. Explain the returned reason; do not silently expand access.
- **400:** invalid fields/date, wrong assignee IDs, missing board or recurrence details. Keep the draft and correct it.
- **409:** stale/handled/expired proposal, changed record, already submitted chore or protected task date. Refresh and ask for a new review; do not blindly retry a write.
- **5xx:** keep the draft; offer a deliberate retry. Do not claim success or issue duplicate creates automatically.

Verification: automated handler tests cover independent multi-person chores, opt-in, family scope, child permissions, submit-only completion, recurrence validation, all task statuses and protected dates. Real paired-TV persistence and Samsung microphone input still require testing with a paired device; they were not exercised in this change.

Shopping previously had only an assistant add-items action, not direct list/item save/update routes; it also lacked a separate editing opt-in. The dedicated routes now share validation and current scope/membership checks with reviewed voice proposals. Automated tests cover create, add, update, completion/reopening and cross-list protection; actual TV save/readback still needs a paired device.
## Deals (read-only, opt-in)
Enable: Settings → Devices → Content & connections → "Show deals pipeline" → Save sharing (off by default).
- `GET /deals` → `{ deals: [...] }` open deals (p1 first, then most recent activity, max 60). `?closed=true` includes won/lost.
- `GET /deals/:id` → one deal.
Fields: id, name, project, projectId, boardId, organizationId, stage, stageLabel, priority (p1–p3|null), temperature (hot|warm|cold, manual), temperatureAi (0–100), nextAction, nextActionDue, outcome, lastActivity, values [{currency, frequency, amount}] (never summed across currencies/periods).
Never returned: costs, commissions, margins, finance scenarios (`deals.internal`). 403 when the device has not opted in.
