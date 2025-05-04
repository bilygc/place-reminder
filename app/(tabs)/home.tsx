import React, { useEffect, useState } from "react";
import { images, icons } from "@/constants";
import { router, Redirect } from "expo-router";
import { FlatList, TouchableOpacity, Image } from "react-native";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import { FormField } from "@/components/FormField";
import CustomButton from "@/components/CustomButton";
import CardReminder from "@/components/CardReminder/CardReminder";

const Home = () => {
  const [reminder, setReminder] = useState("");

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
  useEffect(() => {
    scale.value = withTiming(1, { duration: 500 });
    opacity.value = withTiming(1, { duration: 500 });
    rotate.value = withSequence(
      withTiming(360, { duration: 2000 }),
      withDelay(1000, withTiming(360, { duration: 2000 }))
    );
  }, []);

  const handleChangeText = (text: string) => {
    setReminder(text);
  };

  const handleButton = () => {
    console.log("Reminder added");
  };

  return (
    <SafeAreaView>
      <FlatList
        data={[
          {
            at: "Evergreen Terrace, 742",
            do: "Ask for beer to Homer",
            active: false,
            $id: "iousdjcbcikaiuywe734g",
          },
          {
            at: "Evergreen Terrace, 742",
            do: "Ask for beer to Homer",
            active: true,
            $id: "ioucbcikaiuywe734g",
          },
          {
            at: "Evergreen Terrace, 742",
            do: "Ask for beer to Homer",
            active: false,
            $id: "ioukaiuywe734g",
          },
        ]}
        keyExtractor={(item) => item.$id}
        contentContainerStyle={{
          backgroundColor: "#E1FFF3",
          height: "auto",
          paddingBottom: "100%",
        }}
        renderItem={({ item }) => (
          <View className="flex my-4">
            <CardReminder card={item} />
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
                </View>
                <View className="flex-row gap-x-3">
                  <View className="flex-grow max-w-[280px]">
                    <CustomButton
                      title="Add reminder"
                      handlePress={handleButton}
                      textStyles="text-white"
                    />
                  </View>
                  <View className="flex-none w-[47px] h-[47px]">
                    <TouchableOpacity
                      onPress={() => console.log("mic pressed")}
                      activeOpacity={0.7}
                      className={
                        "bg-secondary rounded-full justify-center items-center px-8 py-6"
                      }
                      disabled={false}
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
          </View>
        )}
        ListEmptyComponent={() => (
          <View className="bg-light">
            <Text className="text-green-700">There's nothing to remind</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

export default Home;
