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
