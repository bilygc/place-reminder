import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import type { CardProps } from '@/components/CardReminder/CardReminder.types';
import icons from '@/constants/icons';

/**
 * Reminder card.
 *
 * Layout (left → right): a non-interactive status bell, the At/Do/Active body
 * (a single press target), and a right-hand column holding two isolated tap
 * targets — a toggle bell on top and a trash icon on the bottom. The status
 * bell source and the "Active ON/OFF" text both derive from the same
 * `card.active` value, so they can never disagree.
 *
 * Behaviour is stubbed for now: the three callbacks are forwarded the
 * reminder id ($id) and the actual edit/toggle/delete flows land in later
 * stories.
 */
const CardReminder: React.FC<CardProps> = ({
  card,
  onPressBody,
  onPressBell,
  onPressTrash,
}) => {
  const { $id, at, do: description, active } = card;

  return (
    <View className="flex flex-row w-[333px] h-[96px] gap-3 justify-between bg-white-50 items-center m-auto px-[10px] py-2 rounded-lg shadow shadow-slate-800">
      {/* Left status bell — display only, never a tap target. */}
      <View className="w-[41px] h-[41px] items-center justify-around">
        <Image
          source={active ? icons.alertOn : icons.alertOff}
          className="w-[29px] h-[37px]"
          resizeMode="contain"
        />
      </View>
      {/* Body tap target — At / Do / Active. */}
      <Pressable
        testID={`card-body-${$id}`}
        onPress={() => onPressBody?.($id)}
        accessibilityRole="button"
        accessibilityLabel={`Reminder at ${at}: ${description}. Active ${
          active ? 'ON' : 'OFF'
        }`}
        className="flex-1 min-w-0 self-stretch justify-around"
      >
        <View>
          <Text
            className="text-gray-50"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            <Text className="text-primary">At</Text> {at}
          </Text>
        </View>
        <View>
          <Text
            className="text-gray-50"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            <Text className="text-primary">Do</Text> {description}
          </Text>
        </View>
        <View>
          <Text className="text-gray-50">
            <Text className="text-primary">Active</Text>{' '}
            {active ? 'ON' : 'OFF'}
          </Text>
        </View>
      </Pressable>
      {/* Right column — two separate, non-overlapping tap targets. */}
      <View className="shrink-0">
        <Pressable
          testID={`card-bell-${$id}`}
          onPress={() => onPressBell?.($id)}
          hitSlop={{ top: 8, bottom: 0, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={
            active ? 'Deactivate reminder' : 'Activate reminder'
          }
          accessibilityState={{ selected: active }}
          className="flex justify-center items-center p-[1px] size-10"
        >
          <Image
            source={
              active ? icons.deactivateReminder : icons.activateReminder
            }
            className="size-6"
            resizeMode="contain"
          />
        </Pressable>
        <Pressable
          testID={`card-trash-${$id}`}
          onPress={() => onPressTrash?.($id)}
          hitSlop={{ top: 0, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Delete reminder"
          className="flex justify-center items-center p-[1px] size-10"
        >
          <Image
            source={icons.deleteReminder}
            className="size-6"
            resizeMode="contain"
          />
        </Pressable>
      </View>
    </View>
  );
};

export default CardReminder;
