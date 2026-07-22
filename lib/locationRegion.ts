import type { LocationCard } from '@/components/CardReminder/CardReminder.location.types';
import type { LocationRegion } from '@/lib/locationService';

export function reminderToRegion(reminder: LocationCard): LocationRegion {
  return {
    identifier: reminder.$id,
    latitude: reminder.latitude,
    longitude: reminder.longitude,
    radius: reminder.radius,
    notifyOnEnter: reminder.notifyOnEnter ?? true,
    notifyOnExit: reminder.notifyOnExit ?? false,
  };
}