import React, { useEffect, useState } from "react";
import { images } from "@/constants";
import { router, Redirect } from "expo-router";
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
      <View>
        {/* Logo & Form */}
        <View className="flex w-full h-1/2 bg-background">
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
          <View className="w-72 m-auto">
            <FormField
              title="reminder"
              placeholder="What do you want to be reminded?"
              value={reminder}
              handleChangeText={handleChangeText}
            />
            <CustomButton title="Add reminder" handlePress={handleButton} />
          </View>
        </View>
        <View className="h-1/2 w-full"></View>
      </View>
    </SafeAreaView>
  );
};

export default Home;
