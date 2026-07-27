import { Card } from './CardReminder.types';

/**
 * Extended Card interface with location information for geofencing
 */
export interface LocationCard extends Card {
  // Location information
  latitude: number;
  longitude: number;
  radius: number; // in meters
  
  // Geofencing options
  notifyOnEnter?: boolean;
  notifyOnExit?: boolean;
  
  // Optional address for display purposes (can be derived from coordinates)
  address?: string;
}

export type LocationCardProps = {
  card: LocationCard;
  onGeofenceEvent?: (eventType: 'enter' | 'exit', card: LocationCard) => void;
};