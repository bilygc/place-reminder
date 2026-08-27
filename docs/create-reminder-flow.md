# Create Reminder Flow (ATO-12)

Home-screen flow that lets a signed-in user type a description, pick a location, and create an owner-scoped `reminders` document. Implements Linear ticket ATO-12.

> **Out of scope:** voice input (mic button is rendered but disabled), reminder-list card rendering beyond the placeholder, and geofencing/notification triggering — all tracked as future stories.

## User-Facing Flow

1. **Description input** — `TextInput` placeholder _"What do you want to be reminded?"_ in `app/(tabs)/home.tsx`. Validation is live via `isDescriptionValid` (trimmed, non-empty, ≤500 chars). The inline message _"Please enter a valid description."_ shows when `reminder.length > 0 && !isValid`.

2. **Add reminder button** — `CustomButton` titled _"Add reminder"_. Its `isLoading` prop is `!isValid`, so it renders disabled/inactive when the description is empty or whitespace-only. Tapping while valid sets `isModalVisible = true`.

3. **Location popup** — `ReminderLocationModal` in a `Modal` (`animationType="slide"`). Conditionally rendered from `home.tsx` (`{isModalVisible && <ReminderLocationModal key={String(isModalVisible)} ... />}`) so it remounts fresh on every open. Title: _"Where do you want to be reminded?"_

   - **Use current location** — calls `getCurrentLocationWithLabel()`. On success, shows a preview chip with the reverse-geocoded label or `lat, lng` fallback (`toFixed(4)`). On foreground-permission denial, shows inline text _"Location permission denied. Please enable location services and try again."_ and keeps the popup open (no `Alert`, no navigation to Settings). Other GPS errors show _"Could not get your location. Please try again."_
   - **Select on map** — switches inline to `MapPicker`. User taps to drop a pin, drags to adjust. **Confirm** stays disabled until a pin is placed (no default location). `Cancel` in the picker returns to the location-choice view without discarding the description.

4. **Cancel / Back** — `Cancel` in the modal calls `onClose` (`setIsModalVisible(false)`). The typed description in `home.tsx` is preserved.

5. **Confirm (Add reminder inside the modal)** — enabled only after a location is chosen (`pendingLocation` + `locationSource` set). Calls `createReminder({ description, latitude, longitude, locationSource, locationLabel, userId, active: true })`. On success, `home.tsx` handles `onCreated`: clears `reminder` (`setReminder('')`) and closes the modal. On failure, shows inline _"Failed to create reminder. Please try again."_, leaves the modal open, and preserves all state for retry (`creating` resets in `finally`).

6. **Mic button** — circular button with `icons.mic` next to _Add reminder_. Rendered with `disabled={true}`, `className` includes `opacity-50`, `accessibilityLabel="Microphone, unavailable"` and `accessibilityState={{ disabled: true }}`. No-op by design (voice input is a future feature).

## Developer API

### `createReminder` — `lib/appwrite.ts`

```ts
import { createReminder } from '@/lib/appwrite';
import type { CreateReminderInput, Reminder } from '@/lib/appwrite.types';

export const createReminder: (input: CreateReminderInput) => Promise<Reminder>
```

**Contract:**

- Validates client-side before any SDK call:
  - `description` — `isDescriptionValid` (trim non-empty, ≤500). Throws `Invalid reminder: description must be ...`.
  - `latitude`/`longitude` — `isLocationValid` (-90..90, -180..180). Throws `Invalid reminder: latitude must be ...`.
  - `userId` — non-empty after trim. Throws `Invalid reminder: userId is required`.
  - `locationSource` — allowlisted to `['current','map']`. Throws `Invalid reminder: locationSource must be ...`.
  - `locationLabel` — when present, must be a string ≤255 chars. Throws `Invalid reminder: locationLabel must be ...`.
- Trims `description` before writing.
- Writes an allowlisted payload only (no spread):

  ```ts
  {
    userId: input.userId,
    description: input.description.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    locationSource: input.locationSource,
    active: input.active ?? true,
    ...(input.locationLabel != null ? { locationLabel: input.locationLabel } : {})
  }
  ```

- Appwrite call:

  ```ts
  database.createDocument(
    config.databaseId,
    config.reminderCollectionId,
    ID.unique(),
    data,
    [
      Permission.read(Role.user(input.userId)),
      Permission.update(Role.user(input.userId)),
      Permission.delete(Role.user(input.userId)),
    ]
  )
  ```

  Returns the created document cast as `Reminder`. SDK errors are normalized via `ensureError` and rethrown after `console.error`.

### Types — `lib/appwrite.types.ts`

```ts
export type LocationSource = 'current' | 'map';

export type CreateReminderInput = {
  description: string;        // non-empty, ≤500 chars (validate before calling)
  latitude: number;           // -90..90
  longitude: number;          // -180..180
  locationSource: LocationSource;
  locationLabel?: string;     // reverse-geocoded label, ≤255 chars
  userId: string;             // owner (Appwrite account $id)
  active?: boolean;           // defaults to true
};

export type Reminder = {
  $id: string;
  userId: string;
  description: string;
  latitude: number;
  longitude: number;
  locationSource: LocationSource;
  locationLabel?: string | null;
  active: boolean;
  $createdAt: string;
  $updatedAt: string;
};

export type CreateReminderResponse = Promise<Reminder>;
export type CreateReminderFunction = (input: CreateReminderInput) => CreateReminderResponse;
```

Deleted in this ticket (unreferenced conflicting duplicates): `lib/reminders.ts`, `lib/reminders.types.ts`. Import from `lib/appwrite` / `lib/appwrite.types` instead.

### Location Helpers — `lib/locationService.ts`

```ts
import {
  LocationPermissionDeniedError,
  getCurrentLocationWithLabel,
} from '@/lib/locationService';

export class LocationPermissionDeniedError extends Error {}

export function getCurrentLocationWithLabel(): Promise<{
  latitude: number;
  longitude: number;
  label: string | null;
}>
```

- `getCurrentLocationWithLabel` requests **foreground-only** permission via `Location.requestForegroundPermissionsAsync()`. If `status !== 'granted'`, throws `LocationPermissionDeniedError` (caller shows an inline error and keeps the popup open).
- On grant, calls `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })`.
- Reverse-geocodes via `Location.reverseGeocodeAsync({ latitude, longitude })`. Builds a label with internal `buildLocationLabel` (`"Street, City"` preferred, deduped, max two parts: `street`, `city`, `region`, `country`). If the geocode array is empty or `reverseGeocodeAsync` throws (e.g. offline), returns `{ latitude, longitude, label: null }` so the caller can fall back to coordinates.
- No background permission is requested in this flow.

### Validation Utils — `utils/validateReminder.ts`

```ts
export const DESCRIPTION_MAX_LENGTH = 500;
export const LOCATION_LABEL_MAX_LENGTH = 255;

export function isDescriptionValid(s: string): boolean
// true iff s.trim().length > 0 && s.trim().length <= 500

export function isLocationValid(lat: number, lng: number): boolean
// true iff both are finite numbers with lat in [-90,90] and lng in [-180,180]
```

Pure, synchronous helpers used by both `createReminder` (pre-write guard) and `home.tsx` (live UI feedback).

## Components

### `components/ReminderLocationModal.tsx`

Location-choice modal shown after a valid description is entered. No `Alert` usage — all errors are inline `Text`.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `visible` | `boolean` | Yes | Controls `Modal visible`. Always `true` when conditionally rendered; `home.tsx` mounts/unmounts the component instead of toggling this alone. |
| `description` | `string` | Yes | Trimmed description passed through to `createReminder`. |
| `userId` | `string` | Yes | Owner id (`_session.$id` from `UserContext`). Used for both `createDocument` data and per-document permissions. |
| `onClose` | `() => void` | Yes | Called by **Cancel**. `home.tsx` sets `isModalVisible` to `false`; description is intentionally preserved. |
| `onCreated` | `() => void` | Yes | Called on successful `createReminder`. `home.tsx` clears `reminder` and closes the modal. |

**Internal state:** `pendingLocation` (`{latitude, longitude, label}` or `null`), `locationSource` (`LocationSource | null`), `error` (`string | null`, inline only), `creating` (`boolean`), `selectingOnMap` (`boolean`).

**Behavior:** `handleUseCurrentLocation` catches `LocationPermissionDeniedError` (checked via `instanceof` and fallback `err.name` check) to show the permission-denied inline message. `handleMapConfirm` sets `locationSource: 'map'` with `label: null`. `handleCreate` guards on `pendingLocation && locationSource`, sets `active: true` explicitly, and on failure shows _"Failed to create reminder..."_ without clearing state. Fresh state per open is ensured by `home.tsx` rendering as `{isModalVisible && <ReminderLocationModal key={String(isModalVisible)} visible={true} .../>}`.

### `components/MapPicker.tsx`

```ts
type MapPickerProps = {
  onConfirm: (location: { latitude: number; longitude: number }) => void;
  onCancel: () => void;
}
```

- Renders `MapView` (`react-native-maps`) full-flex with helper text _"Tap the map to drop a pin, then drag to adjust"_.
- `MapView.onPress` drops a pin (`setPin(e.nativeEvent.coordinate)`).
- `Marker` is `draggable`; `onDragEnd` updates the pin.
- **Confirm** (`CustomButton title="Confirm"`) calls `onConfirm(pin)` and is disabled via `isLoading={!pin}` until a pin exists. **Cancel** calls `onCancel` to return to the location-choice view.

### `app/(tabs)/home.tsx` Wiring

- `reminder` state + `isDescriptionValid(reminder)` drives `isValid`.
- `handleChangeText` updates `reminder`; `handleButton` opens the modal only when `isValid`.
- Mic button: `TouchableOpacity` with `disabled={true}`, `accessibilityLabel="Microphone, unavailable"`, `accessibilityState={{ disabled: true }}`, `opacity-50` — visible but inert.
- Modal wiring as described above. No direct Appwrite calls from the screen; all creation goes through `ReminderLocationModal` → `createReminder`.

## Appwrite Schema & Permissions

Collection: `reminders` (`config.reminderCollectionId`, env `EXPO_PUBLIC_REMINDER_COLLECTION_ID`).

**Attributes (10, DBA-verified final):**

| Attribute | Type | Required | Details |
|-----------|------|----------|---------|
| `userId` | `string` | Yes | Owner id (Appwrite account `$id`). Filtered by `idx_userId`. |
| `creator` | `string` | No | **New** — dual-write future (mirrors owner). Indexed by `idx_creator`. |
| `description` | `string` | Yes | Size 2000. App enforces ≤500 via `isDescriptionValid`. Stored trimmed. |
| `latitude` | `double` | Yes | -90..90 |
| `longitude` | `double` | Yes | -180..180 |
| `address` | `string` | No | **New** — optional free-form address. |
| `locationLabel` | `string` | No | Optional reverse-geocoded label (≤255). Falls back to `null`/omitted. |
| `locationSource` | `enum` | Yes | `current` \| `map` |
| `radius` | `integer` | No | Default 100, min 10, max 10000. **New** — not set by the ATO-12 flow (uses default). |
| `active` | `boolean` | No | Default `true`. ATO-12 writes `active: true` explicitly. |

**Indexes:** `idx_userId`, `idx_creator`.

**Permissions:**

- Collection has `documentSecurity: true`.
- Collection-level permission: `create("users")` only.
- Per-document permissions set by `createReminder` on every `createDocument`:

  ```ts
  Permission.read(Role.user(userId))
  Permission.update(Role.user(userId))
  Permission.delete(Role.user(userId))
  ```

  Documents are owner-scoped; only the creating user can read/update/delete their own reminders. No collection-level read/update/delete.

## Dependencies

### `react-native-maps@1.27.2`

- Added in ATO-12 for `MapPicker`. Provides `MapView` / `Marker` (see `__mocks__/react-native-maps.js` for the Jest mock).
- **Requires a dev build / prebuild** — native maps do not run in Expo Go. Use `eas build --profile development` or `npx expo run:android` / `npx expo run:ios`. See `docs/location-tracking-guide.md` for the existing dev-build guidance and `app.json` permission setup.
- **No Google Maps API key is configured yet.** When adding one, do **not** commit it in plaintext:
  - Android: set via `app.json` / `app.config.js` `android.config.googleMaps.apiKey` sourced from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` or an EAS secret, or via `eas.json` env.
  - iOS: `ios.config.googleMapsApiKey` similarly.
  - Prefer **EAS Secrets / EAS Build environment variables** (`eas secret:create`, referenced as `EXPO_PUBLIC_*` at build time) over checking keys into the repo. Rotate any accidentally committed key immediately.

### Expo SDK Alignment

- Expo SDK 57. Nine SDK packages were aligned to `~57.0.15` patch levels in this ticket (e.g. `expo ~57.0.15`, `expo-router ~57.0.15`, `expo-location ~57.0.12`, `expo-task-manager ~57.0.12`). `expo-doctor` passes 21/21. See `package.json` for the full list.

## Testing

Run:

```bash
npm test        # jest --ci (preset jest-expo, setup jest.setup.js)
```

**New suites added in ATO-12 (3):**

| Suite | What it covers |
|-------|----------------|
| `lib/__tests__/createReminder.test.ts` | Success path (correct `databaseId`/`collectionId`/`ID.unique()` and allowlisted payload, three per-document permissions, `locationLabel` inclusion/omission, `active` default/override), validation rejections before any SDK call (empty/whitespace description, >500 chars, out-of-range lat/lng, empty `userId`, invalid `locationSource`, >255 label), SDK error propagation. Mocks `react-native-appwrite` via `__database`/`Permission`/`Role`/`ID` test doubles. |
| `lib/__tests__/locationService.reminder.test.ts` | `LocationPermissionDeniedError` is an `Error` subclass; `getCurrentLocationWithLabel` happy path (foreground grant → `getCurrentPositionAsync` with `Accuracy.Balanced` → `reverseGeocodeAsync` → `"Street, City"` label), permission-denied throw without calling position/geocode, `label: null` on empty geocode array, `label: null` on `reverseGeocodeAsync` throw. Mocks `expo-location`. |
| `utils/__tests__/validateReminder.test.ts` | `isDescriptionValid` (normal, empty, whitespace-only, exactly 500, 501, trim-before-measure) and `isLocationValid` (boundary pairs, out-of-range lat/lng, non-finite, non-number). |

**Mock file:**

- `__mocks__/react-native-maps.js` — manual Jest mock providing `MapView`, `Marker`, `Callout`, `Polyline`, `Circle`, `PROVIDER_GOOGLE/DEFAULT` as lightweight host elements. Opt in with `jest.mock('react-native-maps')` (no factory) in any suite that renders `MapPicker` / `ReminderLocationModal`.

**Baseline:** **366 tests / 33 suites green** after ATO-12.

**Env for tests:** `lib/__tests__/createReminder.test.ts` sets dummy `EXPO_PUBLIC_*` vars and expects `requireEnv` in `lib/appwrite.ts` to pass. For local runs, copy `.env.example` to `.env` and fill `EXPO_PUBLIC_REMINDER_COLLECTION_ID` etc.

## Related Docs

- `docs/location-tracking-guide.md` — background tracking, geofencing setup, and the `LocationService` singleton (foreground/background permissions, `startGeofencingAsync`, dev-build requirement). The create-reminder flow's `getCurrentLocationWithLabel` is foreground-only and does not start tracking.
- `docs/known-issues.md` — pinned `lodash` CVE note and other deferred items.
- `README.md` — quick start, testing command, and feature overview.

## File Map

| File | Role |
|------|------|
| `app/(tabs)/home.tsx` | Description input, validation, modal wiring, disabled mic button |
| `components/ReminderLocationModal.tsx` | Location-choice modal + `createReminder` orchestration |
| `components/MapPicker.tsx` | Map pin picker (react-native-maps) |
| `lib/appwrite.ts` | `createReminder` — validation, allowlisted write, owner-scoped permissions |
| `lib/appwrite.types.ts` | `LocationSource`, `CreateReminderInput`, `Reminder` |
| `lib/locationService.ts` | `LocationPermissionDeniedError`, `getCurrentLocationWithLabel` |
| `utils/validateReminder.ts` | `isDescriptionValid`, `isLocationValid`, length constants |
| `__mocks__/react-native-maps.js` | Jest manual mock for native maps |
