import React, { useEffect, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomButton from '@/components/CustomButton';
import MapPicker from '@/components/MapPicker';
import { createReminder } from '@/lib/appwrite';
import type { LocationSource } from '@/lib/appwrite.types';
import LocationService, {
  getCurrentLocationWithLabel,
  LocationPermissionDeniedError,
  LocationUnavailableError,
} from '@/lib/locationService';

interface ReminderLocationModalProps {
  visible: boolean;
  description: string;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Same zoom as MapPicker's SF DEFAULT_REGION; only the center changes.
const MAP_REGION_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const ReminderLocationModal = ({
  visible,
  description,
  userId,
  onClose,
  onCreated,
}: ReminderLocationModalProps) => {
  const [pendingLocation, setPendingLocation] = useState<{
    latitude: number;
    longitude: number;
    label: string | null;
  } | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectingOnMap, setSelectingOnMap] = useState(false);
  const [mapInitialRegion, setMapInitialRegion] = useState<MapRegion | undefined>(
    undefined
  );

  // Center the map picker on the device's current location. Reads the cached
  // fix from LocationService (no extra permission prompt or reverse-geocode);
  // a fix arriving while the modal is open re-centers via the subscription.
  // When no fix is cached yet, mapInitialRegion stays undefined and MapPicker
  // falls back to its SF default region.
  useEffect(() => {
    if (!visible) return;

    const toRegion = (coords: { latitude: number; longitude: number }): MapRegion => ({
      latitude: coords.latitude,
      longitude: coords.longitude,
      ...MAP_REGION_DELTAS,
    });

    const cached = LocationService.getState()?.location?.coords;
    setMapInitialRegion(cached ? toRegion(cached) : undefined);

    return LocationService.onLocationUpdate((location) => {
      setMapInitialRegion(toRegion(location.coords));
    });
  }, [visible]);

  const handleUseCurrentLocation = async () => {
    setError(null);
    try {
      const location = await getCurrentLocationWithLabel();
      setPendingLocation(location);
      setLocationSource('current');
    } catch (err) {
      if (
        err instanceof LocationPermissionDeniedError ||
        (err as Error)?.name === 'LocationPermissionDeniedError'
      ) {
        setError('Location permission denied. Please grant location permission in Settings and try again.');
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

  const handleMapConfirm = (location: { latitude: number; longitude: number }) => {
    setPendingLocation({ ...location, label: null });
    setLocationSource('map');
    setSelectingOnMap(false);
  };

  const handleCreate = async () => {
    if (!pendingLocation || !locationSource) return;

    setCreating(true);
    setError(null);

    try {
      await createReminder({
        description,
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        locationSource,
        locationLabel: pendingLocation.label ?? undefined,
        userId,
        active: true,
      });
      onCreated();
    } catch (err) {
      setError('Failed to create reminder. Please try again.');
    } finally {
      setCreating(false);
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
              Where do you want to be reminded?
            </Text>

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
              <View className="my-4 p-4 bg-light rounded-2xl">
                <Text className="text-dark font-insemiBold text-center">
                  {pendingLocation.label ??
                    `${pendingLocation.latitude.toFixed(4)}, ${pendingLocation.longitude.toFixed(4)}`}
                </Text>
              </View>
            )}

            {error && (
              <Text className="text-red-300 text-center font-inmedium my-2">
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
                title="Add reminder"
                handlePress={handleCreate}
                isLoading={!pendingLocation || creating}
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

export default ReminderLocationModal;
