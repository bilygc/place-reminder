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

## expo-doctor failures are pre-existing and unrelated to ATO-11

`npx expo-doctor` currently fails on environment issues unrelated to the
reminders change set:

- Missing native binary for `lightningcss` (e.g. `lightningcss.linux-x64-gnu`).
- 9 Expo packages behind expected versions for SDK 57 (run `npx expo install --check` to list).

These existed before ATO-11 and do not affect the reminders DAL or its tests
(`npm test` / `jest --ci` is the relevant gate; baseline is `408` tests in
`scripts/test-count-baseline.txt`). Fix by reinstalling deps / running
`npx expo install --check` and `npx expo install --fix` separately from this ticket.
