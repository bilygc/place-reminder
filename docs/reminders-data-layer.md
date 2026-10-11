# Reminders Data Layer (ATO-11)

Single source of truth for the `reminders` Appwrite collection and its
TypeScript data-access layer. The collection schema lives **only in
Appwrite Cloud** (managed via console/MCP) — there is no `appwrite.json`
in this repo. This document is the only in-repo record; keep it in sync
with any console changes (bus-factor risk).

## Collection identity

| Field | Value |
|-------|-------|
| Project | `6757b828001bec8e662a` |
| Database | `67590cf000382b570c08` (`EXPO_PUBLIC_DATABASE_ID`) |
| Collection | `67590d690032f7fc76f6` (`EXPO_PUBLIC_REMINDER_COLLECTION_ID`) |
| Collection name | `reminders` |

No declarative `appwrite.json` is checked in. Schema changes are applied
directly in the Appwrite console (or via MCP) and must be reflected here
manually.

## Schema

| Attribute | Type | Required | Default | Notes |
|-----------|------|----------|---------|-------|
| `userId` | string (255) | yes | — | Owner id; indexed. Never caller-supplied on create — derived from the active session via `account.get()`. |
| `description` | string (500) | yes | — | The "Do" field. Trimmed on write; validated non-empty and `≤ 500` chars. Column size matches the Appwrite attribute (shrunk from 2000 to align with `utils/validateReminder.ts`). |
| `locationSource` | enum `current` \| `map` | yes | — | How the location was chosen. |
| `locationLabel` | string (255) | no | — | Human-readable "At ..." label. Validated `≤ 255` chars when present. |
| `latitude` | double | yes | — | Validated finite, `-90` to `90`. |
| `longitude` | double | yes | — | Validated finite, `-180` to `180`. |
| `active` | boolean | no | `true` | Whether the reminder is enabled. DAL defaults to `true` when omitted. |

### Indexes

| Index | Type | Attribute |
|-------|------|-----------|
| `idx_userId` | key | `userId` |

### Security

- `documentSecurity: true` — per-document ACLs are enforced.
- Collection-level permissions: `create("users")` ONLY. Doc-level security
  (`rowSecurity: true`) is enforced, and **Appwrite permissions are OR, NOT
  AND** — a collection-level grant applies to every document and cannot be
  narrowed by per-document ACLs. That is why `read`/`update`/`delete` must NOT
  exist at collection level.
- Every document is created with per-document permissions:
  ```
  Permission.read(Role.user(ownerId))
  Permission.update(Role.user(ownerId))
  Permission.delete(Role.user(ownerId))
  ```
  These per-document ACLs are the effective read/update/delete control.
  `ownerId` is derived inside `createReminder` from the active session via
  `account.get()` (the Appwrite ACCOUNT $id, which is the only id the server
  accepts in `Role.user(...)`); it is never taken from caller input.
- Ownership is enforced in the DAL as well (see below). A foreign or missing document surfaces the same `Reminder not found` error so existence is not leaked. **Post-ACL-tightening normalization (done):** with collection-level `read("users")` removed, a permission-denied read of a foreign document surfaces the SDK's permission error (403 / missing permissions) instead of a 404; the DAL normalizes read-step permission errors to `Reminder not found` via `isPermissionDeniedError` (alongside `isDocumentNotFoundError`), so the uniform not-found semantics hold for both missing and foreign documents.

### Environment

```
EXPO_PUBLIC_DATABASE_ID            # 67590cf000382b570c08
EXPO_PUBLIC_REMINDER_COLLECTION_ID # 67590d690032f7fc76f6
```

Both are required via `requireEnv()` in `lib/appwrite.ts` (`config.databaseId`, `config.reminderCollectionId`). See `.env.example` for placeholders.

## Data-access layer

**Module:** `lib/reminders.ts` (list/get/update/delete/toggle) + `createReminder` in `lib/appwrite.ts`. Types in `lib/appwrite.types.ts` (`CreateReminderInput`, `Reminder`); the update shape `UpdateReminderPatch = Partial<Omit<CreateReminderInput, 'userId'>>` is exported from `lib/reminders.ts`.
**DAL-owned instances:** `lib/reminders.ts` constructs its own `Account`/`Databases` clients using `config` values from `lib/appwrite.ts`. For the `reminders` collection, always use the DAL — never call `database.*Document` directly.

### Types

```ts
import type { Reminder, CreateReminderInput, LocationSource } from '@/lib/appwrite.types';
import type { UpdateReminderPatch } from '@/lib/reminders';

// UpdateReminderPatch excludes userId — the owner is immutable after creation.
type UpdateReminderPatch = Partial<Omit<CreateReminderInput, 'userId'>>;
```

`UpdateReminderPatch` cannot carry `userId` — the owner is immutable after creation.

### API reference

Ownership is session-derived (ATO-12): every function including `listReminders`
resolves the owner from the active session via `account.get()` (the Appwrite
ACCOUNT id — the only id the server accepts in `Role.user(...)` ACLs) and
rejects with `Cannot <load|update|delete> reminder: no active session. Please
sign in and try again.` when nobody is signed in. There is no `sessionUserId`
parameter. `createReminder` (in `lib/appwrite.ts`) derives its owner the same
way; a non-empty caller `userId` on its input is only an optional cross-check.

#### `createReminder(input)`

Lives in `lib/appwrite.ts`, not `lib/reminders.ts` (single implementation —
do not duplicate it).

Creates a reminder owned by the signed-in user. `userId` is derived from the
session, not from `input` (a non-empty caller-supplied `userId` must match the
session id or creation throws).

- **Parameters:**
  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `input` | `CreateReminderInput` | Yes | `description` is trimmed, non-empty, `≤ 500` chars; `active` defaults to `true`. `userId` is optional and cross-checked only. |

- **Returns:** `Promise<Reminder>`
- **Throws:** `Invalid reminder: ...` validation error before any network call, or the original SDK message (logged via `console.error`) on failure, including the `Cannot create reminder: no active session...` sign-in error.
- **Side effects:** Calls `database.createDocument(config.databaseId, config.reminderCollectionId, ID.unique(), data, permissions)` with per-document ACLs for the session owner.

```ts
import { createReminder } from '@/lib/appwrite';

const doc = await createReminder(
  { description: 'Buy milk', locationSource: 'current', latitude: 40.71, longitude: -74.00 }
);
```

#### `listReminders()`

Lists reminders owned by the signed-in user, newest first. Ownership is
session-derived — there is no `userId` parameter and none may be passed.

- **Parameters:** none.
- **Returns:** `Promise<Reminder[]>` — empty array when no matches.
- **Throws:** `Cannot list reminder: no active session. Please sign in and try again.` when signed out, or `Failed to list reminders` on failure.
- **SDK call:** `database.listDocuments(..., [Query.equal('userId', ownerId), Query.orderDesc('$createdAt')])` where `ownerId` comes from `account.get()`.

#### `getReminder(id)`

Ownership-verified read against the session owner. Foreign and missing documents both throw `Reminder not found`.

- **Parameters:** `id: string` (trimmed, `≤ 64` chars).
- **Returns:** `Promise<Reminder>`
- **Throws:** `Reminder not found` (not-found or not-owned), `Cannot load reminder: no active session...` when signed out, or `Failed to load reminder` for other SDK failures.

#### `updateReminder(id, patch)`

Fetch-verify-then-mutate against the session owner. Only fields present in `patch` are sent; `description` is trimmed when included and rejected when empty/whitespace-only (same `≤ 500`-char rule as `createReminder`); `patch` cannot carry `userId` (excluded by the `UpdateReminderPatch` type).

- **Parameters:** `id: string`, `patch: UpdateReminderPatch`
- **Returns:** `Promise<Reminder>`
- **Throws:** Validation errors before any SDK call; `Reminder not found` if the document does not exist or is not owned; `Cannot update reminder: no active session...` when signed out; `Failed to update reminder` otherwise.
- **SDK calls:** `database.getDocument(...)` then `database.updateDocument(..., data)` where `data` contains only the defined patch keys.
- **Used by:** the edit-reminder popup (ATO-14, `EditReminderModal`). The edit flow always omits `active` from its patch — the bell toggle is the only writer of that field. See `docs/edit-reminder-flow.md` for the full edit flow wiring and `reminderOverrides` reconciliation pattern.

#### `deleteReminder(id)`

Fetch-verify-then-delete against the session owner.

- **Parameters:** `id: string`
- **Returns:** `Promise<unknown>` (Appwrite delete result).
- **Throws:** Same ownership/not-found semantics as above (`Reminder not found`); `Cannot delete reminder: no active session...` when signed out; `Failed to delete reminder` on other failures.

#### `toggleReminderActive(id, active)`

Thin wrapper over `updateReminder(id, { active })`.

- **Parameters:** `id: string`, `active: boolean`
- **Returns:** `Promise<Reminder>`

### Conventions

1. **All access to the `reminders` collection MUST go through the DAL (`lib/reminders.ts` for list/get/update/delete/toggle, `lib/appwrite.ts` for `createReminder`).** Do not call `database.createDocument` / `listDocuments` / `getDocument` / `updateDocument` / `deleteDocument` directly for this collection.
2. **Ownership is session-derived and mandatory.** Every read/update/delete/list resolves the owner from `account.get()` and verifies `document.userId === ownerId`; `listReminders` scopes via the `userId` equality filter (plus server-side per-document ACLs). `createReminder` derives `userId` from the session.
3. **`patch` cannot carry `userId`.** The type `UpdateReminderPatch` is `Partial<Omit<CreateReminderInput, 'userId'>>`.
4. **Client-side validation runs before any network call.** Validation failures throw synchronously (without calling the SDK and without `console.error`).
5. **Error handling:** SDK failures are logged via `console.error(originalMessage)` and rethrown as generic messages (`Failed to create/load/update/delete/list reminder(s)`), except session failures which keep their actionable `Cannot ... no active session...` message. Not-found and not-owned are indistinguishable (`Reminder not found`); read-step permission errors on single-document reads normalize to `Reminder not found` as well (see Security note above), while mutate-step failures stay `Failed to ...`.

### Validation rules

| Field | Rule |
|-------|------|
| `description` | `string`, `trim() !== ''`, `length ≤ 500` |
| `locationSource` | `current` or `map` |
| `latitude` | finite number, `-90 ≤ x ≤ 90` |
| `longitude` | finite number, `-180 ≤ x ≤ 180` |
| `locationLabel` | when present: `string`, `length ≤ 255` |
| `active` | when present: `boolean` |
| `id` / `userId` | `string`, `trim() !== ''`, `length ≤ 64` |

## Testing

- **Suite:** `lib/__tests__/reminders.test.ts` — covers the five restored DAL functions (list/get/update/delete/toggle): session-derived ownership, newest-first ordering, exact SDK call args, client-side validation, and error propagation (network / permission / not-found / no-session paths). `createReminder` is covered separately by `lib/__tests__/createReminder.test.ts`.
- **Baseline:** `scripts/test-count-baseline.txt` is `449` (was `461` before the legacy-helper removal; was `408` before the restore; was `446` before the listReminders rework). ATO-14 adds `home.test.tsx` + `EditReminderModal.test.tsx` (28 tests); total climbs to **482**. ATO-15 adds 12 toggle tests → 494. ATO-16 adds 11 delete tests → **505**.
- **Mock:** `__mocks__/react-native-appwrite.js` exposes stable singleton instances (`__database`, `__account`, etc.) and now includes `database.getDocument`, `database.deleteDocument`, `Permission`, and `Role`. Any test that needs the real SDK omits `jest.mock('react-native-appwrite')`.

```bash
npm test   # jest --ci
```

## Known drift

None currently. The legacy video-post helpers (`getAllPosts`, `getLatestPosts`, `getBookmarkedPosts`, `searchPosts`, `getUserPosts`, `bookmarkVideo`) were removed from `lib/appwrite.ts` along with their tests — they queried the `reminders` collection with no ownership filter against attributes that no longer exist. See `docs/known-issues.md` for the removal record.
