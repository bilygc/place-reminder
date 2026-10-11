# Delete Reminder Flow (ATO-16)

Tapping the **trash** icon on a reminder card opens a confirmation popup.
Confirm calls `deleteReminder(id)` from the DAL; on success the card is
pessimistically removed from the local list. Implements Linear ticket ATO-16.

## User-Facing Flow

1. **Tap trash** — the `Pressable` in `CardReminder` fires `onPressTrash($id)`,
   which is forwarded from `home.tsx` as `handlePressTrash(id)`. The trash is a
   separate touch target from the card body (edit) and the bell (toggle).

2. **Confirmation popup** — `home.tsx` shows a `Modal` with the title
   _"Delete this reminder?"_ and two buttons: **Cancel** and **Confirm**.

3. **Cancel** — calls `onClose` only. Zero network calls. The list is
   untouched.

4. **Confirm** — calls `deleteReminder(id)` in `lib/reminders.ts`. The card is
   removed from the local list immediately (pessimistic removal) via the
   `deletedIds` state set — no `refetch` is triggered.

   - **On success:** `deletedIds` is left containing the id; the card is gone.
   - **On failure:** the popup stays open and an inline error is shown.
     Actionable `deleteReminder` messages (prefix `Cannot delete reminder:`)
     are passed through verbatim. Unknown errors show the generic
     _"Failed to delete reminder. Please try again."_

## Developer API

### `home.tsx` Wiring

| Symbol | Role |
|--------|------|
| `deletingId` | `string \| null` — the id currently being deleted (drives `isLoading` on the confirm button) |
| `deletedIds` | `Set<string>` — ids removed optimistically; cleared on session change |
| `deletingIdRef` | `React.RefObject<string \| null>` — synchronous in-flight guard |
| `sessionEpochRef` | `React.MutableRefObject<number>` — incremented on every `userId` change; stale delete results are discarded |
| `handlePressTrash(id)` | Opens the confirmation popup; guards on `isSignedIn && !!userId`; per-id in-flight guard via `deletingId` / `deletingIdRef` |
| `handleDeleteConfirm(id)` | Calls `deleteReminder(id)`; on success adds `id` to `deletedIds`; on failure sets inline error |
| `handleDeleteCancel()` | Calls `onClose` only; no network activity |

### Per-id in-flight guard

```ts
if (deletingIdRef.current) return; // already deleting one
```

`deletingId` state gates the confirm button's `isLoading`. The synchronous
`deletingIdRef` guard prevents a same-tick double-confirm (e.g. a second
tap on the confirm button before React commits the `isLoading` state).

### Session-epoch guard

```ts
const epoch = sessionEpochRef.current;
// ... async delete ...
if (epoch !== sessionEpochRef.current) return; // stale — user switched account
```

Any `deleteReminder` result that arrives after the user has signed out or
switched accounts is discarded silently.

### Session-change cleanup

```ts
useEffect(() => {
  sessionEpochRef.current += 1;
  setDeletedIds(new Set());   // clear pessimistic removals
  deletingIdRef.current = null;
  setDeletingId(null);
}, [userId]);
```

`deletedIds` is cleared on session change so that a sign-in to a different
account does not carry forward deletions from the previous session.

### Empty list

When the fetched `reminderList` (filtered to exclude `deletedIds`) is empty,
the existing `HomeEmpty` component renders automatically. No special empty-state
logic was needed for this ticket.

### Relationship to Other Flows

| Target | How opened | Confirmation | `active` written by |
|--------|-----------|--------------|---------------------|
| Body tap | `handlePressBody` → `EditReminderModal` | None (inline popup) | Bell only |
| Bell tap | `handlePressBell` → optimistic flip + DAL | None | `handlePressBell` |
| Trash tap | `handlePressTrash` → confirmation popup | **Yes** | — |

## Components

| File | Role |
|------|------|
| `app/(tabs)/home.tsx` | Confirmation popup, `handlePressTrash`, `handleDeleteConfirm`, `handleDeleteCancel`, `deletedIds`, `deletingId`, guards |
| `components/CardReminder.tsx` | Trash `Pressable` — unchanged; forwards `$id` via `onPressTrash` prop |

## Data Layer

`deleteReminder(id)` is in `lib/reminders.ts`. Already documented in
`docs/reminders-data-layer.md` — summary of contract:

- **Parameters:** `id: string`
- **Returns:** `Promise<unknown>` (Appwrite delete result)
- **Throws:** `Reminder not found` (missing or not-owned);
  `Cannot delete reminder: no active session...` when signed out;
  `Failed to delete reminder` on other SDK failures.

## Testing

```bash
npm test
```

**New suites added in ATO-16 (1):**

| Suite | What it covers |
|-------|----------------|
| `app/__tests__/home.test.tsx` (`delete reminder flow (ATO-16)`) | `handlePressTrash` opens popup, confirm calls `deleteReminder` with correct id, inline error on failure (actionable + generic messages), popup stays open on failure, card removed from list on success via `deletedIds`, cancel calls no network method, per-id in-flight guard prevents double delete, same-tick double-confirm regression test, session-epoch guard discards stale result after account switch, `deletedIds` cleared on session change, `HomeEmpty` renders when list is empty after delete, `handlePressTrash` no-op when not signed in |

**Baseline movement:** 494 → **505** (11 new tests).

## Related Docs

- `docs/reminders-data-layer.md` — `deleteReminder` contract, ownership model,
  error conventions
- `docs/edit-reminder-flow.md` — edit popup; out-of-scope note updated to
  reflect this ticket's completion
- `docs/toggle-reminder-active.md` — relationship table and in-flight guard
  pattern (shared approach with `runToggleLoop`)
