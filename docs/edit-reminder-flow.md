# Edit Reminder Flow (ATO-14)

Tapping the **body** of a reminder card opens an edit popup that pre-fills the
current `description` and `location`, lets the user change either, and saves
via `updateReminder`. Implements Linear ticket ATO-14.

> **Out of scope:** trash target (stubbed until its own story — delete will
> use a confirmation popup, unlike the bell toggle which has none). Bell-toggle
> (ATO-15) is implemented separately in `home.tsx` (`handlePressBell`) and is
> documented in `docs/toggle-reminder-active.md`. Geofence re-sync on location
> edit (geofencing is dormant; tracked as a follow-up).

## User-Facing Flow

1. **Tap card body** — `handlePressBody(id)` in `home.tsx` finds the target
   reminder in the fetched list and opens `EditReminderModal`. The bell toggle
   and trash touch targets are separate and never route here.

2. **Pre-fill** — the popup initialises its `description`, `pendingLocation`,
   and `locationSource` from the reminder. The map (shown when "Select on map"
   is chosen) centres on the reminder's own coordinates as the starting point,
   falling back to the device's cached location, then to `MapPicker`'s default
   SF region.

3. **Edit description** — `TextInput` with the same placeholder _"What do you
   want to be reminded?"_ as the create flow. Live validation via
   `isDescriptionValid` (trimmed, non-empty, ≤500 chars).

4. **Edit location** — same two-option UI as the create flow:
   - **Use current location** — calls `getCurrentLocationWithLabel()`, shows
     the reverse-geocoded label or `lat,lng` fallback, same error handling as
     `ReminderLocationModal` (permission denied / unavailable / generic).
   - **Select on map** — inline `MapPicker`. Pin is draggable; **Confirm**
     stays disabled until a pin is placed; **Cancel** returns to the
     location-choice view without discarding the description or pending edit.

5. **Location preview** — once a location is chosen, a chip shows the label
   or `lat,lng` fallback (same `toFixed(4)` format as `ReminderLocationModal`).

6. **Save** — `CustomButton` title _"Save"_. `isLoading={!canSave}` gates it:
   disabled while `description` is empty/whitespace or exceeds 500 chars, or
   while `pendingLocation` / `locationSource` is unset, or while `saving` is
   true.

   On save, calls:

   ```ts
   updateReminder(reminder.$id, {
     description: description.trim(),
     latitude: pendingLocation.latitude,
     longitude: pendingLocation.longitude,
     locationSource,
     locationLabel: pendingLocation.label ?? '',
   })
   ```

   **`active` is deliberately absent from the patch.** The bell toggle is the
   only writer of the `active` field; the edit popup never modifies it.

   On success, `onUpdated(updated)` merges the returned `Reminder` into the
   local `reminderOverrides` map and closes the popup.

   On failure, the popup stays open with all edits intact; an inline error is
   shown (actionable `updateReminder` messages passed through verbatim; unknown
   errors show the generic _"Failed to update reminder. Please try again."_).

7. **Cancel** — calls `onClose` only. No network call, no mutation.

8. **Maps API key** — `MapPicker` requires `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.
   Same configuration and restrictions as the create flow (see
   `docs/create-reminder-flow.md` → Dependencies → `react-native-maps`).

## Developer API

### `EditReminderModal` — `components/EditReminderModal.tsx`

```tsx
import EditReminderModal from '@/components/EditReminderModal';
import type { Reminder } from '@/lib/appwrite.types';

type EditReminderModalProps = {
  visible: boolean;
  /** The persisted reminder being edited — used to pre-fill every field. */
  reminder: Reminder;
  onClose: () => void;
  /** Called with the updated document after a successful save. */
  onUpdated: (reminder: Reminder) => void;
};
```

**Internal state:** `description`, `pendingLocation`
(`{latitude, longitude, label} | null`), `locationSource`
(`LocationSource | null`), `mapInitialRegion`, `selectingOnMap`,
`error` (`string | null`), `saving` (`boolean`).

**`canSave` guard:** `isDescriptionValid(description) && pendingLocation !== null && locationSource !== null && !saving`.

**Error handling:** catches `LocationPermissionDeniedError`,
`LocationUnavailableError`, and unnamed variants (checked via `instanceof`
and fallback `err.name`). Passes through actionable `updateReminder` messages
(prefix `Cannot update reminder:`) verbatim; unknown errors fall back to
`"Failed to update reminder. Please try again."`. Popup stays open; state is
preserved for retry.

**`locationLabel` semantics:** `null` (reverse-geocode succeeded) is passed as
`null`; the DAL's `buildUpdateData` treats `null` as "leave field untouched"
while `''` (no label) is written through and replaces a stale label with the
`lat,lng` fallback.

**`active` exclusion:** the save patch never contains an `active` key.

### `home.tsx` Wiring

| Symbol | Role |
|--------|------|
| `reminderOverrides` | `Record<string, Reminder>` — locally applied edits keyed by `$id` |
| `editingReminder` | `Reminder \| null` — currently open edit target |
| `handlePressBody(id)` | Finds the reminder (preferring `reminderOverrides[id]`), calls `setEditingReminder` |
| `handleReminderUpdated(updated)` | Merges `updated` into `reminderOverrides`, clears `editingReminder` |
| `serverIsAtLeastAsNew(server, override)` | Returns `true` when `server.$updatedAt >= override.$updatedAt` (lexicographic ISO-8601 string compare; non-string timestamps treated as "server wins") |
| reconcile `useEffect` | On each `reminderList` change: drops any override whose server copy is at least as new, keeping overrides newer than the server |

**Override merge on save:** `handleReminderUpdated` writes the returned
`Reminder` into `reminderOverrides` immediately — the card list re-renders with
the saved data without a full `refetch`, avoiding flicker.

**Stale-override eviction:** the reconcile effect runs only when
`reminderList` identity changes (i.e. after a refetch). An override newer
than its server copy (e.g. a save that landed after the read started) is
retained. An override older than or equal to the server's copy is dropped.

**Key prop on modal:** `<EditReminderModal key={editingReminder.$id} ... />`
ensures a fresh component instance (and fresh state) on every open.

### `updateReminder` — `lib/reminders.ts`

Already documented in `docs/reminders-data-layer.md`. The edit flow calls:

```ts
updateReminder(id: string, patch: UpdateReminderPatch): Promise<Reminder>
```

where `patch` is `Partial<Omit<CreateReminderInput, 'userId'>>` — same type
used by `toggleReminderActive`. `UpdateReminderPatch` excludes `userId`
(immutable after creation) and the edit flow also excludes `active`.

## Components

| File | Role |
|------|------|
| `components/EditReminderModal.tsx` | Edit popup — description, location choice, save/cancel |
| `components/MapPicker.tsx` | Reused from create flow (ATO-12) — map pin picker |
| `lib/locationService.ts` | Reused from create flow — `getCurrentLocationWithLabel`, `LocationPermissionDeniedError`, `LocationUnavailableError` |
| `lib/reminders.ts` | `updateReminder`, `UpdateReminderPatch` (see data-layer doc) |

## Testing

```bash
npm test
```

**New suites added in ATO-14 (2):**

| Suite | What it covers |
|-------|----------------|
| `components/__tests__/EditReminderModal.test.tsx` | Pre-fill initialisation (description, location, source, map initial region), save guard (`canSave` false when description invalid / location missing / saving), successful save (correct `updateReminder` args including `locationLabel` null/empty-string, `active` absent), failed save (inline error, popup stays open, state preserved), cancel (no network call, `onClose` called), current-location and map-picker error paths, location-label `null`/`''` semantics |
| `app/__tests__/home.test.tsx` | `handlePressBody` no-op when target not in list, prefers `reminderOverrides` for pre-fill, `handleReminderUpdated` merges into overrides and clears `editingReminder`, reconcile effect drops stale overrides (`serverIsAtLeastAsNew`), override newer than server is retained, `EditReminderModal` mounted/unmounted correctly, card list uses merged data |

**Baseline movement:** 454 → 480 → **482** (28 new tests across the two suites).

## Related Docs

- `docs/create-reminder-flow.md` — `MapPicker`, `getCurrentLocationWithLabel`,
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` configuration, `isDescriptionValid`
- `docs/reminders-data-layer.md` — `updateReminder`, `UpdateReminderPatch`,
  ownership model, validation rules
- `docs/location-tracking-guide.md` — geofencing is dormant; location edit
  re-sync tracked as a follow-up
- `docs/known-issues.md` — timestamp-compare normalisation and `isSignedIn`
  gating hardening items
