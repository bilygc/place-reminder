import { View, Text, ScrollView } from "react-native";
import { Link } from "expo-router";
import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { images } from "@/constants";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import { FormField } from "@/components/FormField";
import CustomButton from "@/components/CustomButton";
import { useAppwrite } from "@/hooks/useAppwrite";
import { signIn } from "@/lib/appwrite";
import { GreenLoading } from "@/components/Loading/Loading";

const SignIn = () => {
  const [signInData, setSignInData] = useState({ Email: "", Password: "" });
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const { refetch, isLoading, error } = useAppwrite(() =>
    signIn(signInData.Email, signInData.Password)
  );

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
        {isLoading && (
          <View className="absolute z-10 h-screen w-full bg-slate-600/50">
            <View className="m-auto">
              <GreenLoading />
            </View>
          </View>
        )}
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
          <Text className="font-inbold text-light mt-10 mb-4 text-3xl">
            Sign in
          </Text>
          <FormField
            title="Email"
            value={signInData.Email}
            handleChangeText={(text) =>
              setSignInData({ ...signInData, Email: text })
            }
          />
          <FormField
            title="Password"
            value={signInData.Password}
            handleChangeText={(text) =>
              setSignInData({ ...signInData, Password: text })
            }
          />
          <Link
            href="/reset-pwd"
            className="text-green-50 font-inmedium mt-5 text-right"
          >
            Forgot password?
          </Link>
          <View className="mt-5">
            <CustomButton
              title="Log In"
              handlePress={refetch}
              textStyles="text-white font-inbold"
            />
          </View>
          <Text className="text-green-50 mt-5 text-center font-inmedium">
            Don't have an account?{" "}
            <Link href="/sign-up" className="text-secondary font-inbold">
              Sign up
            </Link>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SignIn;
