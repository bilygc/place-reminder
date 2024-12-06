import { View, Text, ScrollView } from "react-native";
import React, { useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { images } from "@/constants";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";

const SignIn = () => {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 500 });
    opacity.value = withTiming(1, { duration: 500 });
    rotate.value = withSequence(
      withTiming(360, { duration: 2000 }),
      withDelay(1000, withTiming(360, { duration: 2000 }))
    );
  }, []);

  const { AppLogo } = images;

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

  return (
    <SafeAreaView className="bg-background h-full">
      <ScrollView>
        <View className="mt-20 ml-7 max-w-sm">
          <Animated.View
            className="flex flex-row gap-1 flex-wrap max-w-[220px]"
            style={containerStyle}
          >
            <Animated.View style={iconStyle}>
              <AppLogo width={60} height={72} />
            </Animated.View>
            <View>
              <Text className="font-inbold text-light text-[28px]">
                PLACE REMINDER
              </Text>
            </View>
          </Animated.View>
          <Text className="font-inbold text-light mt-10 text-3xl">Sign in</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SignIn;
