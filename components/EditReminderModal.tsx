import React, { useEffect, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomButton from '@/components/CustomButton';
import { FormField } from '@/components/FormField';
import MapPicker, { type MapPickLocation, type MapPickSource } from '@/components/MapPicker';
import { updateReminder } from '@/lib/reminders';
import type { LocationSource, Reminder } from '@/lib/appwrite.types';
import { isDescriptionValid, clampLocationLabel } from '@/utils/validateReminder';
import LocationService, {
  getCurrentLocationWithLabel,
  getLabelForCoordinates,
  LocationPermissionDeniedError,
  LocationUnavailableError,
} from '@/lib/locationService';

interface EditReminderModalProps {
  visible: boolean;
  /** The persisted reminder being edited. Used to pre-fill every field. */
  reminder: Reminder;
  onClose: () => void;
  /** Called with the updated document after a successful save. */
  onUpdated: (reminder: Reminder) => void;
}

interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Same zoom as MapPicker's SF DEFAULT_REGION (and ReminderLocationModal);
// only the center changes.
const MAP_REGION_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const VALID_LOCATION_SOURCES: LocationSource[] = ['current', 'map'];

const toRegion = (coords: {
  latitude: number;
  longitude: number;
}): MapRegion => ({
  latitude: coords.latitude,
  longitude: coords.longitude,
  ...MAP_REGION_DELTAS,
});

const hasFiniteCoords = (reminder: Reminder): boolean =>
  Number.isFinite(reminder.latitude) && Number.isFinite(reminder.longitude);

/**
 * Edit popup for an existing reminder (ATO-14).
 *
 * Opened by tapping the *body* of a reminder card on the Home screen; the bell
 * toggle and trash targets are separate and never route here. Reuses the same
 * location-choice UI as the create flow (current location OR `MapPicker` pin)
 * and persists via `updateReminder`.
 *
 * Scope guarantees:
 *  - `active` is NOT editable here and no control for it is rendered. The
 *    save patch never contains an `active` key, so the toggle bell remains the
 *    only writer of that field.
 *  - There is no delete control in this popup.
 *  - Save is disabled while the description is empty/whitespace-only (or
 *    exceeds the shared length limit) via `isDescriptionValid`.
 *  - On failure the inline error is shown, the popup stays open and every
 *    in-progress edit is preserved for retry.
 */
const EditReminderModal = ({
  visible,
  reminder,
  onClose,
  onUpdated,
}: EditReminderModalProps) => {
  const hasCoords = hasFiniteCoords(reminder);

  const [description, setDescription] = useState(reminder.description ?? '');
  const [pendingLocation, setPendingLocation] = useState<{
    latitude: number;
    longitude: number;
    label: string | null;
    /**
     * Google place id from a POI tap. Transient only — never sent to
     * updateReminder (no Appwrite attribute); reserved for a future Google
     * Places Details lookup.
     */
    placeId?: string | null;
    source?: MapPickSource | 'current';
  } | null>(() =>
    hasCoords
      ? {
        latitude: reminder.latitude,
        longitude: reminder.longitude,
        label: reminder.locationLabel ?? null,
      }
      : null
  );
  const [locationSource, setLocationSource] = useState<LocationSource | null>(
    () =>
      VALID_LOCATION_SOURCES.includes(reminder.locationSource)
        ? reminder.locationSource
        : null
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectingOnMap, setSelectingOnMap] = useState(false);
  // Center the map on the reminder's own coordinates when it has them (the
  // useful starting point for an edit); otherwise fall back to the device's
  // cached fix, then to MapPicker's SF default.
  const [mapInitialRegion, setMapInitialRegion] = useState<MapRegion | undefined>(
    () => {
      if (hasCoords) {
        return toRegion({
          latitude: reminder.latitude,
          longitude: reminder.longitude,
        });
      }
      const cached = LocationService.getState()?.location?.coords;
      return cached ? toRegion(cached) : undefined;
    }
  );

  useEffect(() => {
    // Only subscribe when the reminder has no coordinates of its own: a fix
    // arriving while the popup is open may center the map, but it must never
    // override the reminder's existing location.
    if (!visible || hasCoords) return;

    return LocationService.onLocationUpdate((location) => {
      setMapInitialRegion(toRegion(location.coords));
    });
  }, [visible, hasCoords]);

  const canSave =
    isDescriptionValid(description) &&
    pendingLocation !== null &&
    locationSource !== null &&
    !saving;

  const handleUseCurrentLocation = async () => {
    setError(null);
    try {
      const location = await getCurrentLocationWithLabel();
      setPendingLocation({ ...location, source: 'current' });
      setLocationSource('current');
    } catch (err) {
      if (
        err instanceof LocationPermissionDeniedError ||
        (err as Error)?.name === 'LocationPermissionDeniedError'
      ) {
        setError(
          'Location permission denied. Please grant location permission in Settings and try again.'
        );
      } else if (
        err instanceof LocationUnavailableError ||
        (err as Error)?.name === 'LocationUnavailableError'
      ) {
        setError((err as Error).message);
      } else {
        setError('Could not get your location. Please try again.');
      }
    }
  };

  const handleMapConfirm = (location: MapPickLocation) => {
    const source = location.source ?? 'tap';
    const poiName =
      typeof location.label === 'string' ? location.label : '';
    if (source === 'poi' && poiName.trim() !== '') {
      // POI tap: the place name is already the precise identity, so the
      // reverse-geocode is skipped entirely. placeId stays transient (never
      // persisted); only the clamped label flows into locationLabel on save.
      setPendingLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        label: clampLocationLabel(poiName),
        placeId: location.placeId ?? null,
        source: 'poi',
      });
      setLocationSource('map');
      setSelectingOnMap(false);
      return;
    }
    // Raw tap / drag (or a POI with an empty/missing name): any previous POI
    // identity is cleared and the existing background reverse-geocode path
    // runs unchanged.
    setPendingLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      label: null,
      placeId: null,
      source,
    });
    setLocationSource('map');
    setSelectingOnMap(false);
    // Same background reverse-geocode as the create flow. A resolved label is
    // saved via `locationLabel`; a failure leaves label null so handleSave
    // sends '' and correctly clears any stale label (see handleSave comment).
    void getLabelForCoordinates({
      latitude: location.latitude,
      longitude: location.longitude,
    })
      .then((label) => {
        if (!label) return;
        setPendingLocation((prev) =>
          prev !== null &&
          prev.latitude === location.latitude &&
          prev.longitude === location.longitude
            ? { ...prev, label }
            : prev
        );
      })
      .catch(() => {
        // getLabelForCoordinates never rejects; belt-and-braces so a geocode
        // failure can never surface as an unhandled rejection.
      });
  };

  const handleSave = async () => {
    if (!canSave || !pendingLocation || !locationSource) return;

    setSaving(true);
    setError(null);

    try {
      const updated = await updateReminder(reminder.$id, {
        description,
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        locationSource,
        // `locationLabel` is cleared to '' (not null): the DAL's
        // buildUpdateData treats undefined/null as "leave untouched", while an
        // empty string is written through. The card's toCard() maps an empty
        // label back to the lat,lng fallback, so a map-picked location with no
        // reverse-geocoded label correctly replaces a stale one. `active` is
        // deliberately omitted — this popup never edits it.
        locationLabel: pendingLocation.label ?? '',
      });
      onUpdated(updated);
    } catch (err) {
      // Pass through actionable updateReminder messages verbatim (they start
      // with "Cannot update reminder:", e.g. session expired while the popup
      // was open). Only unknown errors fall back to the generic string. State
      // is preserved for retry; the popup stays open either way
      // (onUpdated/onClose are not called here).
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.startsWith('Cannot update reminder:')
          ? message
          : 'Failed to update reminder. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background">
        {selectingOnMap ? (
          <MapPicker
            onConfirm={handleMapConfirm}
            onCancel={() => setSelectingOnMap(false)}
            initialRegion={mapInitialRegion}
          />
        ) : (
          <View className="flex-1 p-6 justify-center">
            <Text className="text-light text-2xl font-inbold text-center mb-8">
              Edit reminder
            </Text>

            <FormField
              placeholder="What do you want to be reminded?"
              value={description}
              handleChangeText={setDescription}
              inputStyles="rounded-full"
            />

            <CustomButton
              title="Use current location"
              handlePress={handleUseCurrentLocation}
              containerStyles="mb-4"
              textStyles="text-white"
            />
            <CustomButton
              title="Select on map"
              handlePress={() => setSelectingOnMap(true)}
              containerStyles="mb-4 bg-dark"
              textStyles="text-light"
            />

            {pendingLocation && (
              <View
                testID="edit-location-preview"
                className="my-4 p-4 bg-light rounded-2xl"
              >
                <Text className="text-dark font-insemiBold text-center">
                  {pendingLocation.label ??
                    `${pendingLocation.latitude.toFixed(4)}, ${pendingLocation.longitude.toFixed(4)}`}
                </Text>
              </View>
            )}

            {error && (
              <Text
                testID="edit-reminder-error"
                className="text-red-300 text-center font-inmedium my-2"
              >
                {error}
              </Text>
            )}

            <View className="flex-row gap-3 mt-auto">
              <CustomButton
                title="Cancel"
                handlePress={onClose}
                containerStyles="flex-1 bg-dark"
                textStyles="text-light"
              />
              <CustomButton
                title="Save"
                handlePress={handleSave}
                isLoading={!canSave}
                containerStyles="flex-1"
                textStyles="text-white"
              />
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

export default EditReminderModal;
