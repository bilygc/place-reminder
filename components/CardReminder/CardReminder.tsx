import React from "react";
import { View, Text, Pressable, Image } from "react-native";
import type { CardProps } from "@/components/CardReminder/CardReminder.types";
import icons from "@/constants/icons";

const CardReminder: React.FC<CardProps> = ({ card }) => {
  return (
    <View className="flex flex-row w-[333px] bg-orange-200 self-center">
      <View className="flex bg-white w-[41px] h-[41px] items-center justify-around">
        <Image
          source={card.active ? icons.alertOn : icons.alertOff}
          className="w-[29px] h-[37px]"
          resizeMode="contain"
        />
      </View>
      <View className="flex bg-zinc-400">
        <View>
          <Text>At {card.at}</Text>
        </View>
        <View>
          <Text>Do {card.do}</Text>
        </View>
        <View>
          <Text>Active {card.active ? "ON" : "OFF"}</Text>
        </View>
      </View>
      <View className="flex bg-red-400">
        <View>
          <Image
            source={
              card.active ? icons.deactivateReminder : icons.activateReminder
            }
            className="w- h-6"
            resizeMode="contain"
          />
        </View>
        <View>
          <Image
            source={icons.deleteReminder}
            className="w-6 h-6"
            resizeMode="contain"
          />
        </View>
      </View>
    </View>
  );
};

export default CardReminder;
