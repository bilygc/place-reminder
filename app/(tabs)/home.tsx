import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { images, icons } from '@/constants';
import { FlatList, TouchableOpacity, Image } from 'react-native';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { FormField } from '@/components/FormField';
import CustomButton from '@/components/CustomButton';
import CardReminder from '@/components/CardReminder/CardReminder';
import type { Card } from '@/components/CardReminder/CardReminder.types';
import ReminderLocationModal from '@/components/ReminderLocationModal';
import { GreenLoading } from '@/components/Loading/Loading';
import { useAppwrite } from '@/hooks/useAppwrite';
import { listReminders } from '@/lib/reminders';
import type { Reminder } from '@/lib/appwrite.types';
import { UserContext } from '@/store/user';
import { isDescriptionValid } from '@/utils/validateReminder';

/**
 * Map a persisted reminder onto the card view-model. `locationLabel` is
 * nullable; when absent we fall back to a `lat,lng` string (same fallback as
 * ReminderLocationModal's preview) when both coordinates are finite numbers,
 * otherwise to 'Unknown location' (server-side data drift can yield null or
 * non-numeric coordinates when a writer bypasses the DAL, and `toFixed` on
 * those would crash during render).
 */
const toCard = (reminder: Reminder): Card => {
  const hasLabel =
    typeof reminder.locationLabel === 'string' &&
    reminder.locationLabel.trim() !== '';
  const hasCoords =
    Number.isFinite(reminder.latitude) &&
    Number.isFinite(reminder.longitude);
  return {
    $id: reminder.$id,
    do: reminder.description,
    active: reminder.active,
    at: hasLabel
      ? (reminder.locationLabel as string)
      : hasCoords
        ? `${(reminder.latitude as number).toFixed(4)}, ${(reminder.longitude as number).toFixed(4)}`
        : 'Unknown location',
  };
};

const Home = observer(() => {
  const [reminder, setReminder] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const user = useContext(UserContext);
  // Use the store's public typed accessors. Never reach into the private
  // `_session` field (or the raw Appwrite account object, which has no
  // `_session` at all) — that produced '' or a wrong id and Appwrite rejected
  // the resulting Role.user(...) permissions. createReminder() owns the final
  // owner derivation from the active session; userId here is a cross-check hint.
  const userId = user.userId;
  const isSignedIn = user.isLoggedIn;
  const isValid = isDescriptionValid(reminder);
  // const {
  //   addLocationReminder,
  //   removeLocationReminder,
  //   updateLocationReminder,
  //   getLocationReminders,
  //   currentLocation,
  // } = useLocationReminders();

  const { data, refetch, isLoading, error } = useAppwrite(listReminders);
  // listReminders returns an array; useAppwrite normalizes an array result
  // as-is at runtime (no double-wrap) but its generic return type is `T[]`.
  // Re-narrow the normalized list back to the element type here.
  const reminderList = data as unknown as Reminder[];

  const { AppLogo } = images;
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  const containerStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });
  const iconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotate.value}deg` }],
    };
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    scale.value = withTiming(1, { duration: 500 });
    opacity.value = withTiming(1, { duration: 500 });
    rotate.value = withSequence(
      withTiming(360, { duration: 2000 }),
      withDelay(1000, withTiming(360, { duration: 2000 }))
    );
  }, []);

  // Refetch on mount and whenever the authenticated user changes (sign-in,
  // sign-out, or switching accounts). Skipped while signed out. Errors surface
  // through the hook's `error` state and are rendered inline below.
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    void refetch().catch(() => {
      // Handled by the `error` state.
    });
  }, [isSignedIn, userId, refetch]);

  // Only ever show rows that belong to the current user — this keeps the
  // previous user's list from leaking during a sign-out/user switch before the
  // new fetch resolves.
  const cards =
    isSignedIn && userId
      ? reminderList.filter((item) => item.userId === userId).map(toCard)
      : [];

  const handleChangeText = (text: string) => {
    setReminder(text);
  };

  const handleButton = () => {
    // Gate modal entry on a signed-in state rather than an empty-string
    // userId fallback: with no session, createReminder would fail on
    // permissions anyway, so don't open the location popup at all.
    if (isValid && isSignedIn) {
      setIsModalVisible(true);
    }
  };

  const handleRetry = () => {
    if (!userId) return;
    void refetch().catch(() => {
      // Handled by the `error` state.
    });
  };

  // Stubbed tap targets for later stories (edit / toggle / delete). The
  // signature is ($id) to match the CardReminder prop contract; wire these to
  // updateReminder / toggleReminderActive / deleteReminder when those land.
  const handlePressBody = (_id: string): void => {
    void _id;
  };
  const handlePressBell = (_id: string): void => {
    void _id;
  };
  const handlePressTrash = (_id: string): void => {
    void _id;
  };

  return (
    <SafeAreaView>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.$id}
        contentContainerStyle={{
          backgroundColor: '#E1FFF3',
          height: 'auto',
          paddingBottom: '100%',
        }}
        renderItem={({ item }) => (
          <View className="flex my-4">
            <CardReminder
              card={item}
              onPressBody={handlePressBody}
              onPressBell={handlePressBell}
              onPressTrash={handlePressTrash}
            />
          </View>
        )}
        ListHeaderComponent={() => (
          <View>
            {/* Logo & Form */}
            <View className="flex w-full bg-background pt-16 pb-6">
              {/* Logo */}
              <View className="flex-1 justify-center items-center text-center">
                <Animated.View
                  className="flex flex-row gap-1 flex-wrap max-w-[250px] text-center"
                  style={containerStyle}
                >
                  <Animated.View style={iconStyle}>
                    <AppLogo width={80} height={97} />
                  </Animated.View>
                  <View>
                    <Text className="font-inbold text-light mt-4 text-[32px]">
                      PLACE REMINDER
                    </Text>
                  </View>
                </Animated.View>
              </View>
              {/* Form */}
              <View className="flex gap-y-3 w-[333px] m-auto mt-10">
                <View className="flex-grow ">
                  <FormField
                    placeholder="What do you want to be reminded?"
                    value={reminder}
                    handleChangeText={handleChangeText}
                    inputStyles="rounded-full"
                  />
                  {!isValid && reminder.length > 0 && (
                    <Text className="text-light text-sm font-inmedium text-center mt-1">
                      Please enter a valid description.
                    </Text>
                  )}
                </View>
                <View className="flex-row gap-x-3">
                  <View className="flex-grow max-w-[280px]">
                    <CustomButton
                      title="Add reminder"
                      handlePress={handleButton}
                      isLoading={!isValid}
                      textStyles="text-white"
                    />
                  </View>
                  <View className="flex-none w-[47px] h-[47px]">
                    <TouchableOpacity
                      activeOpacity={0.7}
                      className={
                        'bg-secondary rounded-full justify-center items-center px-8 py-6 opacity-50'
                      }
                      disabled={true}
                      accessibilityLabel="Microphone, unavailable"
                      accessibilityState={{ disabled: true }}
                    >
                      <Image source={icons.mic} resizeMode="contain" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
            <View className="flex self-center w-[333px] bg-light">
              <View className="">
                <Text className="text-green-700 font-insemiBold text-[32px]">
                  My Reminders
                </Text>
              </View>
            </View>
            {/* Loading / error live inline under the heading, above the list. */}
            {isLoading && (
              <View className="py-4" testID="reminders-loading">
                <GreenLoading />
              </View>
            )}
            {error && !isLoading && (
              <View className="py-4 items-center" testID="reminders-error">
                <Text className="text-light text-center font-inmedium mb-2">
                  {error}
                </Text>
                <TouchableOpacity
                  onPress={handleRetry}
                  activeOpacity={0.7}
                  testID="reminders-retry"
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading reminders"
                  className="bg-secondary rounded-full px-6 py-3"
                >
                  <Text className="text-white font-insemiBold">Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={() => (
          <View className="bg-light">
            <Text className="text-green-700">There's nothing to remind</Text>
          </View>
        )}
      />
      {isModalVisible && isSignedIn && (
        <ReminderLocationModal
          key={String(isModalVisible)}
          visible={true}
          description={reminder}
          userId={userId}
          onClose={() => setIsModalVisible(false)}
          onCreated={() => {
            setReminder('');
            setIsModalVisible(false);
            if (userId) {
              void refetch().catch(() => {
                // Handled by the `error` state.
              });
            }
          }}
        />
      )}
    </SafeAreaView>
  );
});

export default Home;
