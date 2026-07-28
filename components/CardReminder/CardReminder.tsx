import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import type { CardProps } from '@/components/CardReminder/CardReminder.types';
import icons from '@/constants/icons';

const CardReminder: React.FC<CardProps> = ({ card }) => {
  return (
    <View className="flex flex-row w-[333px] h-[96px] gap-3 justify-between bg-white-50 items-center m-auto px-[10px] py-2 rounded-lg shadow shadow-slate-800">
      <View className="w-[41px] h-[41px] items-center justify-around">
        <Image
          source={card.active ? icons.alertOn : icons.alertOff}
          className="w-[29px] h-[37px]"
          resizeMode="contain"
        />
      </View>
      <View className="self-stretch justify-around min-w-[184px]">
        <View>
          <Text className="text-gray-50">
            <Text className="text-primary">At</Text> {card.at}
          </Text>
        </View>
        <View>
          <Text className="text-gray-50">
            <Text className="text-primary">Do</Text> {card.do}
          </Text>
        </View>
        <View>
          <Text className="text-gray-50">
            <Text className="text-primary">Active</Text>{' '}
            {card.active ? 'ON' : 'OFF'}
          </Text>
        </View>
      </View>
      <View className="">
        <View className="flex justify-center items-center p-[1px] size-10 ">
          <Image
            source={
              card.active ? icons.deactivateReminder : icons.activateReminder
            }
            className="size-6"
            resizeMode="contain"
          />
        </View>
        <View className="flex justify-center items-center p-[1px] size-10 justify-center">
          <Image
            source={icons.deleteReminder}
            className="size-6"
            resizeMode="contain"
          />
        </View>
      </View>
    </View>
  );
};

export default CardReminder;
