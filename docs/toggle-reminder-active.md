# Toggle Reminder Active / Inactive (ATO-15)

Tapping the **bell** icon on a reminder card immediately flips its `active`
state (active → inactive, inactive → active) with no confirmation popup, then
persists the change via `toggleReminderActive` in the DAL. Implements Linear
ticket ATO-15.

> **Out of scope (pre-ATO-16):** the trash / delete target was stubbed
> until its own story; delete uses a confirmation popup, deliberately different
> from toggle's zero-confirmation design. Documented in
> `docs/delete-reminder-flow.md`.

## User-Facing Flow

1. **Tap bell** — `handlePressBell(id)` in `app/(tabs)/home.tsx` runs
   synchronously. The UI flips `active` in the rendered card **before** any
   network request resolves (optimistic update). There is no popup, no dialog,
   no loading spinner on the bell itself.

2. **No confirmation** — toggling is intentionally a single tap with no
   undo/changes-made confirmation. This is a deliberate product decision: the
   `active` field is low-stakes (reversible by another tap), whereas delete
   is not and will get its own confirmation in a later story.

3. **Persistence** — the flip is sent to `toggleReminderActive(id, desired)`
   in the background. `toggleReminderActive` is a thin wrapper over
   `updateReminder(id, { active: desired })` in `lib/reminders.ts` (see
   `docs/reminders-data-layer.md`).

4. **Inline error on failure** — if persistence fails, the card reverts to
   the last known good `active` value and an inline error message appears
   under the heading (`testID="toggle-reminder-error"`). Actionable DAL
   messages (`Cannot update reminder: ...`) pass through verbatim; unknown
   errors show the generic _"Failed to update reminder. Please try again."_
   The error clears on the next toggle attempt.

5. **Rapid taps** — tapping the bell again while a toggle is in flight does
   **not** write the same value twice. The second tap sees the pending value
   and alternates: if the first tap is `true → false` and the second is
   `false → true`, only `true` is eventually persisted (last-write-wins chase
   loop; see [Rapid-tap handling](#rapid-tap-handling) below).

## Developer API

### `handlePressBell(id)` — `app/(tabs)/home.tsx`

```ts
const handlePressBell = (id: string): void
```

**Pre-conditions:**

- `isSignedIn && userId` — gated at the top; unsigned sessions have no
  persistent state to toggle and the call would fail the ACL check anyway.
- `id` must be present in the fetched list (preferring any in-flight edit
  override). Unknown ids are a no-op.

**Optimistic flip:**

```ts
// base: latest override or fetched document
const base  = reminderOverrides[id] ?? reminderList.find(...)
// desired: alternate of the latest requested (or current) value
const desired = !(pendingToggleRef.current[id] ?? base.active)
// merge: write ONLY active; every other field is preserved
setReminderOverrides(prev => ({ ...prev, [id]: { ...base, active: desired } }))
```

The merge writes only `active` so the toggle composes correctly with
concurrent edit saves that may have landed mid-flight.

**Post-merge:** `setToggleError(null)` clears any previous inline error, then
`runToggleLoop(id, sessionEpochRef.current)` runs the persistence loop.

### `runToggleLoop(id, epoch)` — chase loop

```ts
const runToggleLoop = async (id: string, epoch: number): Promise<void>
```

Handles three cases for each toggle request:

1. **Stale session guard** — `epoch !== sessionEpochRef.current` means the
   user signed out or switched accounts mid-flight. The result is discarded
   without merging to avoid applying a write from the old session to the new
   session's document list.

2. **Settled (no newer tap)** — the server snapshot becomes the base;
   `editFieldsOf(existing)` re-applies any concurrent edit's non-active fields
   so they are not lost. If `pendingToggleRef.current[id]` is still the same
   value it is cleared.

3. **Chase (newer tap in flight)** — a second tap arrived while the first
   request was still in flight. The server snapshot from the resolved request
   is the base; only the newest requested `active` plus any concurrent edit
   fields are merged, then a follow-up `toggleReminderActive` fires with the
   latest value. The loop repeats until settled.

**Error path:** if `toggleReminderActive` rejects, the UI reverts only the
`active` field to `lastGoodActiveRef.current[id]` (the last value the server
confirmed). All other fields (from any concurrent edit) are preserved in
`reminderOverrides`. An inline error is set via `setToggleError`. The
`pendingToggleRef` entry is cleared so the bell is immediately usable again.

### Account-switch / sign-out cleanup

```ts
useEffect(() => {
  sessionEpochRef.current += 1;
  toggleInFlightRef.current.clear();
  pendingToggleRef.current = {};
  lastGoodActiveRef.current = {};
  setReminderOverrides({});
  setToggleError(null);
}, [userId]);
```

Every `userId` change (sign-in, sign-out, or account switch) increments the
session epoch and clears all toggle bookkeeping and local overrides. Any
in-flight `runToggleLoop` that resolves after this will see the epoch mismatch
and discard its result.

### Reconcile effect and in-flight toggle authority

The reconcile `useEffect` (runs when `reminderList` identity changes) keeps
optimistic overrides for ids in `toggleInFlightRef` even when the fetched
document is at least as new — the loop owns those ids and will merge the
server snapshot when it resolves. For ids with no toggle in flight, the
existing `serverIsAtLeastAsNew` check applies: a server document that is at
least as new as the override evicts the override.

`serverIsAtLeastAsNew` compares `$updatedAt` as lexicographic ISO-8601 strings
(server-issued only; no wall-clock synthesis). A non-string timestamp is
treated as "server wins".

## Rapid-tap Handling

The in-flight guard + chase loop provides last-write-wins semantics without
debouncing:

```
Tap 1: true → false  (in-flight, held in pendingToggleRef)
Tap 2: false → true (pendingToggleRef updated; no new network call yet)
Request 1 resolves: server=false (stale, because Tap 2 already fired)
  → server snapshot taken as base
  → pendingToggleRef says true
  → follow-up: toggleReminderActive(id, true)
  → loop settles
```

No tap is dropped. No artificial delay is added. The final persisted value
always equals the last tap.

## Relationship to Edit and Delete Flows

| Target | How opened | Confirmation | `active` written by |
|--------|-----------|--------------|---------------------|
| Body tap | `handlePressBody` → `EditReminderModal` | None (inline popup) | Bell only (`handlePressBell`) |
| Bell tap | `handlePressBell` → optimistic flip + DAL | None | `handlePressBell` / `runToggleLoop` |
| Trash tap | `handlePressTrash` → confirmation popup | **Yes** | — |

The edit popup never sends `active` in its patch — `UpdateReminderPatch`
excludes it, and the save path in `EditReminderModal` deliberately omits it.
`handleReminderUpdated` (the merge callback from the edit modal) re-applies
any pending toggle intent when an edit save lands while a toggle is in flight:

```ts
const pending = pendingToggleRef.current[updated.$id];
return { ...updated, active: pending ?? updated.active };
```

This ensures a pending toggle is never clobbered by an edit save's snapshot.

## Testing

```bash
npm test
```

**New suites added in ATO-15 (2):**

| Suite | What it covers |
|-------|----------------|
| `app/__tests__/home.test.tsx` (12 toggle tests) | Optimistic flip both directions (true→false, false→true), revert + inline error on persistence failure (actionable and generic messages), no edit popup from bell, rapid double-tap last-write-wins, toggle preserves concurrent edit fields + edit save preserves pending toggle, no-op for unknown id, clock-ahead device cannot pin stale override (refetch converges), mid-flight refetch does not flicker the optimistic flip, account switch clears toggle error and overrides, stale mid-flight result ignored after account switch |
| `app/__tests__/home.test.tsx` (4 security/race tests) | `jest.setSystemTime` clock-ahead convergence, mid-flight refetch no-flicker, account-switch state clearing, stale toggle result ignored |

**Baseline movement:** 482 → **494** (12 new toggle tests).

## Related Docs

- `docs/edit-reminder-flow.md` — edit popup, `reminderOverrides` reconciliation,
  `handleReminderUpdated` merge, `active` exclusion from edit patch
- `docs/reminders-data-layer.md` — `toggleReminderActive`, `UpdateReminderPatch`,
  ownership model, error conventions
- `docs/create-reminder-flow.md` — `MapPicker`, `getCurrentLocationWithLabel`,
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` configuration
