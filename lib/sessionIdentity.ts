import type { Models } from 'react-native-appwrite';

/**
 * Resolve the session identity (the Appwrite ACCOUNT id) from a
 * user-collection document.
 *
 * The document `$id` and the account `$id` live in different id spaces: the
 * document is created with `ID.unique()` (`lib/appwrite.ts` `createUser` /
 * `getCurrentUser`) while the account id comes from `account.create` /
 * `account.get()`. The document carries the account id in its `accountid`
 * field. The MobX store's session identity MUST be the account id, because
 * `createReminder` derives document ownership and `Role.user(...)` permissions
 * from `account.get()` and rejects a mismatched caller `userId`.
 *
 * Throws a clear error when `accountid` is missing or empty (e.g. a legacy
 * document written before the field existed) — callers surface it via their
 * existing error path (alert / console.error + stay logged out), never
 * silently falling back to the document id.
 */
export function resolveSessionAccountId(userDoc: Models.Document): string {
  const accountId = (userDoc as { accountid?: unknown }).accountid;
  if (typeof accountId !== 'string' || accountId.trim() === '') {
    throw new Error(
      'User profile is missing its account id. Please sign in again or contact support.'
    );
  }
  return accountId;
}
