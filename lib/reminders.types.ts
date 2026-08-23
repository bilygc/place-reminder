import { Models } from 'react-native-appwrite';

export type LocationSource = 'current' | 'map';

export interface ReminderDocument extends Models.Document {
  userId: string;
  description: string;
  locationSource: LocationSource;
  locationLabel?: string;
  latitude: number;
  longitude: number;
  active: boolean;
}

export interface CreateReminderInput {
  description: string;
  locationSource: LocationSource;
  locationLabel?: string;
  latitude: number;
  longitude: number;
  active?: boolean;
}

export type UpdateReminderPatch = Partial<CreateReminderInput>;
