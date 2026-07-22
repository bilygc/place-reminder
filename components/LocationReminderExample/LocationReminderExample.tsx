import React, { useState, useEffect } from 'react';
import { View, Text, Alert, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useLocationReminders } from '@/components/LocationReminderManager/LocationReminderManager';
import { LocationCard } from '@/components/CardReminder/CardReminder.location.types';
import CardReminder from '@/components/CardReminder/CardReminder';

/**
 * Example component demonstrating how to use location-based reminders
 */
const LocationReminderExample: React.FC = () => {
  const {
    addLocationReminder,
    removeLocationReminder,
    getLocationReminders,
    currentLocation,
    isInitialized,
  } = useLocationReminders();
  
  const [reminders, setReminders] = useState<LocationCard[]>([]);
  const [reminderText, setReminderText] = useState('');
  const [radius, setRadius] = useState('100'); // Default radius in meters
  
  // Load reminders on mount
  useEffect(() => {
    setReminders(getLocationReminders());
  }, [getLocationReminders]);
  
  // Add a new location-based reminder at the current location
  const handleAddReminder = async () => {
    if (!isInitialized()) {
      Alert.alert('Location Not Ready', 'Please wait for location services to initialize.');
      return;
    }
    
    if (!currentLocation) {
      Alert.alert('No Location', 'Unable to get your current location. Please try again later.');
      return;
    }
    
    if (!reminderText.trim()) {
      Alert.alert('Empty Reminder', 'Please enter a reminder text.');
      return;
    }
    
    // Create a new reminder
    const newReminder: LocationCard = {
      $id: `reminder-${Date.now()}`, // Generate a unique ID
      at: 'Current Location', // This could be replaced with a reverse geocoded address
      do: reminderText,
      active: true,
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude,
      radius: parseInt(radius, 10) || 100,
      notifyOnEnter: true,
      notifyOnExit: false,
    };
    
    // Add the reminder
    const success = await addLocationReminder(newReminder);
    
    if (success) {
      setReminderText('');
      setReminders(getLocationReminders());
      Alert.alert('Reminder Added', 'Your location-based reminder has been added.');
    } else {
      Alert.alert('Error', 'Failed to add the reminder. Please try again.');
    }
  };
  
  // Remove a reminder
  const handleRemoveReminder = async (reminderId: string) => {
    const success = await removeLocationReminder(reminderId);
    
    if (success) {
      setReminders(getLocationReminders());
      Alert.alert('Reminder Removed', 'Your location-based reminder has been removed.');
    } else {
      Alert.alert('Error', 'Failed to remove the reminder. Please try again.');
    }
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location-Based Reminders</Text>
      
      {/* Current location display */}
      <View style={styles.locationContainer}>
        <Text style={styles.locationTitle}>Current Location:</Text>
        {currentLocation ? (
          <Text style={styles.locationText}>
            Lat: {currentLocation.coords.latitude.toFixed(6)}, 
            Lon: {currentLocation.coords.longitude.toFixed(6)}
          </Text>
        ) : (
          <Text style={styles.locationText}>Waiting for location...</Text>
        )}
      </View>
      
      {/* Add reminder form */}
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="What do you want to be reminded of?"
          value={reminderText}
          onChangeText={setReminderText}
        />
        <TextInput
          style={styles.radiusInput}
          placeholder="Radius (meters)"
          value={radius}
          onChangeText={setRadius}
          keyboardType="numeric"
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddReminder}
          disabled={!currentLocation || !reminderText.trim()}
        >
          <Text style={styles.buttonText}>Add Location Reminder</Text>
        </TouchableOpacity>
      </View>
      
      {/* Reminders list */}
      <View style={styles.remindersContainer}>
        <Text style={styles.remindersTitle}>Your Reminders:</Text>
        {reminders.length === 0 ? (
          <Text style={styles.noRemindersText}>No location reminders yet.</Text>
        ) : (
          reminders.map((reminder) => (
            <View key={reminder.$id} style={styles.reminderItem}>
              <CardReminder card={reminder} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveReminder(reminder.$id)}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#E1FFF3',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#2D6A4F',
  },
  locationContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D6A4F',
  },
  locationText: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
  },
  formContainer: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  radiusInput: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    width: '50%',
  },
  addButton: {
    backgroundColor: '#2D6A4F',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  remindersContainer: {
    flex: 1,
  },
  remindersTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#2D6A4F',
  },
  noRemindersText: {
    color: '#666',
    fontStyle: 'italic',
  },
  reminderItem: {
    marginBottom: 12,
  },
  removeButton: {
    backgroundColor: '#D32F2F',
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 4,
  },
  removeButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default LocationReminderExample;