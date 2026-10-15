import React, { useRef, useState } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import CustomButton from '@/components/CustomButton';

interface MapPickerRegion {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
}

/** How the pin location was chosen. */
export type MapPickSource = 'poi' | 'tap' | 'drag';

export interface MapPickLocation {
  latitude: number;
  longitude: number;
  /** POI place name when picked via onPoiClick; null for raw tap/drag. */
  label?: string | null;
  /**
   * Google place id from onPoiClick. Transient only — never persisted
   * (no Appwrite attribute); reserved for a future Google Places Details
   * lookup.
   */
  placeId?: string | null;
  source?: MapPickSource;
}

interface MapPickerProps {
  onConfirm: (location: MapPickLocation) => void;
  onCancel: () => void;
  initialRegion?: MapPickerRegion;
}

const DEFAULT_REGION: Required<MapPickerRegion> = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

/**
 * Window after an onPoiClick during which a trailing onPress is treated as
 * the same gesture. On Android (Google backend) a POI tap commonly fires
 * onPoiClick followed by onPress for the same touch; without the guard the
 * second event would overwrite the POI pick with a raw tap.
 */
const POI_DOUBLE_FIRE_GUARD_MS = 400;

const MapPicker = ({ onConfirm, onCancel, initialRegion = DEFAULT_REGION }: MapPickerProps) => {
  const isWeb = Platform.OS === 'web';
  const [pin, setPin] = useState<MapPickLocation | null>(null);
  const lastPoiAtRef = useRef(0);

  const region: Required<MapPickerRegion> = {
    latitude: initialRegion.latitude,
    longitude: initialRegion.longitude,
    latitudeDelta: initialRegion.latitudeDelta ?? DEFAULT_REGION.latitudeDelta,
    longitudeDelta: initialRegion.longitudeDelta ?? DEFAULT_REGION.longitudeDelta,
  };

  const handlePress = (e: {
    nativeEvent: { coordinate: { latitude: number; longitude: number } };
  }) => {
    // Ignore the onPress that trails an onPoiClick for the same tap
    // (Android double-fire). A genuine later tap falls outside the window and
    // clears any POI label/placeId (latest intent wins; stale place names must
    // not survive — re-geocode happens downstream).
    if (Date.now() - lastPoiAtRef.current < POI_DOUBLE_FIRE_GUARD_MS) {
      return;
    }
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPin({ latitude, longitude, label: null, placeId: null, source: 'tap' });
  };

  const handlePoiClick = (e: {
    nativeEvent: {
      coordinate: { latitude: number; longitude: number };
      placeId: string;
      name: string;
    };
  }) => {
    // Fires on the Google backend (Android, and iOS only when Google Maps is
    // the provider). On Apple Maps this never fires and the tap path above is
    // the only selector — this handler stays inert there.
    lastPoiAtRef.current = Date.now();
    const { coordinate, placeId, name } = e.nativeEvent;
    setPin({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      label: name ?? null,
      placeId: placeId ?? null,
      source: 'poi',
    });
  };

  const handleDragEnd = (e: {
    nativeEvent: { coordinate: { latitude: number; longitude: number } };
  }) => {
    // Dragging away from a POI pin drops the place identity with it.
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPin({ latitude, longitude, label: null, placeId: null, source: 'drag' });
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
            onPress={handlePress}
            onPoiClick={handlePoiClick}
          >
            {pin && (
              <Marker
                coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                draggable
                onDragEnd={handleDragEnd}
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

export default MapPicker;

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
