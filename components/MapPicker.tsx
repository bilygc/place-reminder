import React, { useState } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import CustomButton from '@/components/CustomButton';

interface MapPickerRegion {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
}

interface MapPickerProps {
  onConfirm: (location: { latitude: number; longitude: number }) => void;
  onCancel: () => void;
  initialRegion?: MapPickerRegion;
}

const DEFAULT_REGION: Required<MapPickerRegion> = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const MapPicker = ({ onConfirm, onCancel, initialRegion = DEFAULT_REGION }: MapPickerProps) => {
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);

  const region: Required<MapPickerRegion> = {
    latitude: initialRegion.latitude,
    longitude: initialRegion.longitude,
    latitudeDelta: initialRegion.latitudeDelta ?? DEFAULT_REGION.latitudeDelta,
    longitudeDelta: initialRegion.longitudeDelta ?? DEFAULT_REGION.longitudeDelta,
  };

  return (
    <View className="flex-1 bg-background">
      <MapView
        className="flex-1"
        initialRegion={region}
        onPress={(e) => setPin(e.nativeEvent.coordinate)}
      >
        {pin && (
          <Marker
            coordinate={pin}
            draggable
            onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
          />
        )}
      </MapView>
      <View className="p-6 bg-background">
        <Text className="text-light text-center font-inmedium mb-4">
          Tap the map to drop a pin, then drag to adjust
        </Text>
        <View className="flex-row gap-3">
          <CustomButton
            title="Cancel"
            handlePress={onCancel}
            containerStyles="flex-1 bg-dark"
            textStyles="text-light"
          />
          <CustomButton
            title="Confirm"
            handlePress={() => pin && onConfirm(pin)}
            isLoading={!pin}
            containerStyles="flex-1"
            textStyles="text-white"
          />
        </View>
      </View>
    </View>
  );
};

export default MapPicker;
