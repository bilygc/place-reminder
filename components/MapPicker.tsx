import React, { useState } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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
  const isWeb = Platform.OS === 'web';
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);

  const region: Required<MapPickerRegion> = {
    latitude: initialRegion.latitude,
    longitude: initialRegion.longitude,
    latitudeDelta: initialRegion.latitudeDelta ?? DEFAULT_REGION.latitudeDelta,
    longitudeDelta: initialRegion.longitudeDelta ?? DEFAULT_REGION.longitudeDelta,
  };

  return (
    <View testID="map-picker-root" style={styles.container} className="flex-1 bg-background">
      {isWeb ? (
        <View style={styles.mapContainer} className="flex-1 justify-center items-center p-6">
          <Text className="text-light text-center font-inmedium">
            Map selection is not available on web.
          </Text>
          <Text className="text-light text-center mt-2">
            Please use the iOS or Android app to select a location on the map.
          </Text>
        </View>
      ) : (
        <View style={styles.mapContainer} className="flex-1">
          <MapView
            className="flex-1"
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={region}
            showsUserLocation
            showsMyLocationButton
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
        </View>
      )}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default MapPicker;
