import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { View, Text } from 'react-native';
import { images } from '@/constants';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import CustomButton from '@/components/CustomButton';

export default function SplashScreen() {

  const { AppLogo } = images;
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
    <View className="flex-1 justify-center items-center bg-background">
      <Animated.View className="flex flex-row gap-1 flex-wrap max-w-[250px]" style={containerStyle}>
        <Animated.View style={iconStyle}>
          <AppLogo width={80} height={97} />
        </Animated.View>
        <View >
          <Text className="font-inbold text-light mt-4 text-[32px]">PLACE REMINDER</Text>
        </View>
        <View >
        <Animated.Text className="text-[18px] text-primary mt-4" style={{ opacity }}>
          Remember where, not when
        </Animated.Text>
        </View>
      </Animated.View>
      <CustomButton title='Continue with email' handlePress={()=> router.push('/sign-in')} containerStyles="mt-5" textStyles="text-light text-lg font-insemiBold" />
    </View>
  );
}
