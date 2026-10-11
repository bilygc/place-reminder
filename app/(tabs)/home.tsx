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
import type { AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { FormField } from '@/components/FormField';
import CustomButton from '@/components/CustomButton';
import CardReminder from '@/components/CardReminder/CardReminder';
import type { Card } from '@/components/CardReminder/CardReminder.types';
import ReminderLocationModal from '@/components/ReminderLocationModal';
import EditReminderModal from '@/components/EditReminderModal';
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

/**
 * True when a freshly fetched server document is at least as new as a locally
 * applied edit. ISO-8601 `$updatedAt` strings compare lexicographically, so a
 * plain string `>=` is sufficient (and avoids parsing values that may be
 * missing or drifted). A non-string timestamp is treated as "server wins" so a
 * malformed value can never pin a stale override in place.
 */
const serverIsAtLeastAsNew = (server: Reminder, override: Reminder): boolean => {
  if (typeof server.$updatedAt !== 'string') return true;
  if (typeof override.$updatedAt !== 'string') return true;
  return server.$updatedAt >= override.$updatedAt;
};

/**
 * Header content for the home FlatList, hoisted to module level so FlatList
 * always sees a STABLE component type.
 *
 * It was previously an inline `ListHeaderComponent={() => (...)}` closure
 * inside `Home`: every keystroke (`setReminder` → re-render) produced a NEW
 * function identity, which React treats as a NEW component type, unmounting
 * and remounting the entire header subtree — including the reminder-name
 * `FormField`/`TextInput`, which therefore lost focus after every character.
 * All render-local values the header reads now flow in as props, so the input
 * stays mounted while its value (and validation/loading/error states) update.
 */
type HomeHeaderProps = {
  reminder: string;
  isValid: boolean;
  isLoading: boolean;
  error: string | null;
  containerStyle: AnimatedStyle<ViewStyle>;
  iconStyle: AnimatedStyle<ViewStyle>;
  AppLogo: React.ComponentType<{ width?: number; height?: number }>;
  onChangeText: (text: string) => void;
  onAddPress: () => void;
  onRetry: () => void;
};

const HomeHeader = ({
  reminder,
  isValid,
  isLoading,
  error,
  containerStyle,
  iconStyle,
  AppLogo,
  onChangeText,
  onAddPress,
  onRetry,
}: HomeHeaderProps) => (
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
            handleChangeText={onChangeText}
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
              handlePress={onAddPress}
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
          onPress={onRetry}
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
);

/** Empty-list content, hoisted for the same stable-type reason as HomeHeader. */
const HomeEmpty = () => (
  <View className="bg-light">
    <Text className="text-green-700">There's nothing to remind</Text>
  </View>
);

const Home = observer(() => {
  const [reminder, setReminder] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  // Reminder currently being edited (null = edit popup closed) and an overlay of
  // locally-applied updates keyed by $id. The overlay lets a successful edit be
  // merged into the rendered list immediately instead of triggering a full
  // `refetch`, which would reload the whole list and flicker.
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [reminderOverrides, setReminderOverrides] = useState<
    Record<string, Reminder>
  >({});
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

  // Reconcile locally-applied edits against freshly fetched server data so a
  // stale override can never shadow a newer server document. Any refetch
  // returns the authoritative list, so an override whose server copy is at
  // least as new is dropped; an override newer than the server copy (e.g. a
  // save that landed after the read started) is kept. Runs only when the
  // fetched list identity changes, i.e. on refetch resolution — never on a
  // local edit, so a just-saved override is not cleared out from under the UI.
  useEffect(() => {
    setReminderOverrides((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      const freshById = new Map(reminderList.map((item) => [item.$id, item]));
      let changed = false;
      const next: Record<string, Reminder> = {};
      for (const id of ids) {
        const server = freshById.get(id);
        if (!server || serverIsAtLeastAsNew(server, prev[id])) {
          changed = true;
          continue;
        }
        next[id] = prev[id];
      }
      return changed ? next : prev;
    });
  }, [reminderList]);

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
  // new fetch resolves. Locally-applied edits (reminderOverrides) win over the
  // fetched document so a save is reflected without a full refetch.
  const cards =
    isSignedIn && userId
      ? reminderList
        .filter((item) => item.userId === userId)
        .map((item) => toCard(reminderOverrides[item.$id] ?? item))
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

  // Tap targets for the card. The body opens the edit popup (ATO-14); the bell
  // and trash remain stubbed until their own stories land. The signature is
  // ($id) to match the CardReminder prop contract.
  const handlePressBody = (id: string): void => {
    const target = reminderList.find((item) => item.$id === id);
    // If the row is no longer in the fetched list there is nothing to pre-fill
    // the popup with; treat as a no-op rather than opening an empty editor.
    if (!target) return;
    // Prefer the locally-applied (saved) copy. The popup unmounts on close, so
    // without this a reopen would prefill from the stale fetched document, and
    // a second save (which sends the full snapshot) would silently revert the
    // first edit on the server.
    setEditingReminder(reminderOverrides[id] ?? target);
  };
  const handlePressBell = (_id: string): void => {
    void _id;
  };
  const handlePressTrash = (_id: string): void => {
    void _id;
  };

  const handleReminderUpdated = (updated: Reminder): void => {
    setReminderOverrides((prev) => ({ ...prev, [updated.$id]: updated }));
    setEditingReminder(null);
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
        ListHeaderComponent={
          <HomeHeader
            reminder={reminder}
            isValid={isValid}
            isLoading={isLoading}
            error={error}
            containerStyle={containerStyle}
            iconStyle={iconStyle}
            AppLogo={AppLogo}
            onChangeText={handleChangeText}
            onAddPress={handleButton}
            onRetry={handleRetry}
          />
        }
        ListEmptyComponent={<HomeEmpty />}
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
      {editingReminder && (
        <EditReminderModal
          key={editingReminder.$id}
          visible={true}
          reminder={editingReminder}
          onClose={() => setEditingReminder(null)}
          onUpdated={handleReminderUpdated}
        />
      )}
    </SafeAreaView>
  );
});

export default Home;
