# Known Issues

A running log of accepted risks and deferred tech-debt items. Items here are
intentionally not blocking and are tracked for future follow-up.

## lodash pinned at 4.17.15 (ATO-9)

`lodash` is pinned to exactly `4.17.15` in `package.json` (with `@types/lodash`
in devDependencies) as an explicit requirement of ticket ATO-9, which introduced
`lodash/get` for safe property access in `lib/appwrite.ts` (`getCurrentUser()`).

**Security note (security gate: PASS):** lodash 4.17.15 carries known CVEs —
CVE-2020-8203 (via `zipObjectDeep`) and CVE-2021-23337 (via `template`). These
are **not exploitable** in this change set: only `lodash/get` with a hardcoded
path (`'documents[0]'`) is imported and used; the vulnerable functions are never
pulled in or called.

**Follow-up (recommended tech debt):** Revisit the pinned lodash version, or
replace the single `get` usage with a small local helper, to clear the known
CVEs. The regression guard at `lib/__tests__/getCurrentUser.test.ts` protects
behavioral equivalence if the implementation is later swapped.

## Repurposed reminders collection — legacy video-post helpers are dead (ATO-11)

The Appwrite collection `reminders` (`67590d690032f7fc76f6` in database
`67590cf000382b570c08`, env `EXPO_PUBLIC_REMINDER_COLLECTION_ID`) was
repurposed for location reminders. Its current attributes are `userId`,
`description`, `locationSource` (`current` | `map`), `locationLabel`,
`latitude`, `longitude`, `active` (see `docs/reminders-data-layer.md`).
There is no `appwrite.json` in the repo; the schema lives in Appwrite Cloud
and this repo's only record is that doc (bus-factor risk if it drifts).

Legacy helpers in `lib/appwrite.ts` still target the same collection id via
`config.reminderCollectionId` but query attributes that **no longer exist**:

- `getAllPosts` / `getLatestPosts` — list without/with `orderDesc('$createdAt')` on the reminders collection (no longer a posts collection).
- `getBookmarkedPosts(userId)` — `Query.contains('bookmarkedByUserId', userId)`.
- `searchPosts(query)` — `Query.search('title', query)`.
- `getUserPosts(userId)` — `Query.equal('creator', userId)`.
- `bookmarkVideo(videoId, userId, bookmarkData, isBookmarked)` — `updateDocument(..., { bookmarkedByUserId: ... })`.

All six are **dead/broken** against the current schema and must not be used.
All access to the `reminders` collection must go through `lib/reminders.ts`
(see `docs/reminders-data-layer.md` for the enforced DAL contract).

**Follow-up (debt):** Remove or rewrite the six helpers and their types in
`lib/appwrite.types.ts` (`VideoPost`, `GetAllPostsFunction`, etc.) once no
callers remain. Tracked as follow-up to ATO-11.

## expo-doctor (resolved)

`npx expo-doctor` now passes **21/21** after SDK alignment. Previously failed due to missing `lightningcss` native binary and 9 Expo packages behind expected SDK 57 versions; both resolved by the package updates on this branch. The test-count baseline is **389** (`scripts/test-count-baseline.txt`).

## createReminder owner is session-derived — server-side enforcement still required (ATO-12)

**Bug (fixed on this branch, in two parts):** `createReminder` (`lib/appwrite.ts`) built per-document permissions from caller-supplied `input.userId`, which `app/(tabs)/home.tsx` fed from the MobX store's private `_session.$id` via an unsafe cast. That id is the *user-collection document* id (sign-in stores `getCurrentUser()`'s document `$id`; sign-up stores `createUser`'s document `$id`) — a different id space from the Appwrite *account* `$id` — or `''` when signed out. `Role.user(...)` therefore produced `user:<wrong-id>` / `user:`, and Appwrite rejected the write with `Permissions must be one of: (any, users, user:<accountId>, ...)`. Part 1 derives the owner inside `createReminder` from `account.get().$id` (with a clear `no active session` error when signed out), keeps a caller `userId` only as an optional mismatch cross-check, and gates the home-screen modal on the store's public `isLoggedIn`/`userId` accessors instead of the `_session` cast. Part 2 (security-gate follow-up) fixes the id space at the source: `sign-in.tsx`, `sign-up.tsx`, and `components/Auth/Auth.tsx` now set the store's session `$id` from the user document's `accountid` field via `resolveSessionAccountId` (`lib/sessionIdentity.ts`) — which throws a clear error on a missing/empty `accountid` instead of silently using the document id — so the cross-check hint `home.tsx` passes always matches the session. A consumer audit confirmed no active code path needs the document id (`LocationReminderManager`/`LocationReminderExample` never read the user store; `getUserPosts`/`getBookmarkedPosts`/`bookmarkVideo` are dead legacy helpers with no callers; `app/index.tsx` reads only `isLoggedIn`), so no separate `userDocId` field was added. `ReminderLocationModal` now also passes actionable `createReminder` messages (`Cannot create reminder: ...`) through verbatim instead of blanket-mapping everything to the generic failure string. Regression guards: `components/Auth/__tests__/sessionIdentity.integration.test.tsx` (account-id session identity + end-to-end creation with `acct-1`/`doc-1`), the `id-space contract` block in `lib/__tests__/createReminder.test.ts`, and the error-passthrough block in `components/__tests__/ReminderLocationModal.test.tsx`.

**Residual risk (accepted):** client-side ownership is not a security boundary — a tampered client could still call the Appwrite API directly. True enforcement must happen server-side.
**Follow-up (Appwrite console, not code):** confirm the `reminders` collection keeps `documentSecurity: true` with collection-level `create("users")` only, so per-document owner ACLs are the only path to read/update/delete; consider Appwrite database rules / functions if stronger guarantees are needed.
