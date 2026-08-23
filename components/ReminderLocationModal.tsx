import React, { useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomButton from '@/components/CustomButton';
import MapPicker from '@/components/MapPicker';
import { createReminder } from '@/lib/appwrite';
import type { LocationSource } from '@/lib/appwrite.types';
import {
  getCurrentLocationWithLabel,
  LocationPermissionDeniedError,
} from '@/lib/locationService';

interface ReminderLocationModalProps {
  visible: boolean;
  description: string;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

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
        setError('Location permission denied. Please enable location services and try again.');
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
