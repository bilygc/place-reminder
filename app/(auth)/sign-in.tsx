import { observer } from 'mobx-react-lite';
import { View, Text, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import React, { useContext, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { images } from '@/constants';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { FormField } from '@/components/FormField';
import CustomButton from '@/components/CustomButton';
import { useAppwrite } from '@/hooks/useAppwrite';
import { getCurrentUser, signIn } from '@/lib/appwrite';
import { validateEmail } from '@/utils/validateEmail';
import ensureError from '@/utils/ensureError';
import { GreenLoading } from '@/components/Loading/Loading';
import { UserContext } from '@/store/user';

const SignIn = observer(() => {
  const [signInData, setSignInData] = useState({ Email: '', Password: '' });
  const user = useContext(UserContext);
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  const { refetch, isLoading } = useAppwrite(
    async (email: string, password: string) => {
      await signIn(email, password);
      return getCurrentUser();
    }
  );

  const submit = async () => {
    const emailResult = validateEmail(signInData.Email);
    if (!emailResult.valid) {
      alert(`Invalid email: ${emailResult.reason}`);
      return;
    }

    if (!signInData.Password || signInData.Password.trim() === '') {
      alert('Password is required');
      return;
    }

    try {
      const userDoc = await refetch(emailResult.value, signInData.Password);
      if (!userDoc) {
        throw new Error('Unable to load user profile after sign in');
      }

      user.login({
        session: {
          $id: userDoc.$id,
          isLoggedIn: true,
        },
        email: userDoc.email,
        userName: userDoc.email,
        avatar: userDoc.avatar,
      });
      router.replace('/home');
    } catch (error: unknown) {
      const err = ensureError(error);
      alert(err.message);
    }
  };

  useEffect(() => {
    if (user.isLoggedIn) {
      router.replace('/home');
    }
  }, [user, user.isLoggedIn]);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 500 });
    opacity.value = withTiming(1, { duration: 500 });
    rotate.value = withSequence(
      withTiming(360, { duration: 2000 }),
      withDelay(1000, withTiming(360, { duration: 2000 }))
    );
  }, [opacity, rotate, scale]);

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
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
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
              handlePress={submit}
              textStyles="text-white font-inbold"
            />
          </View>
          <Text className="text-green-50 mt-5 text-center font-inmedium">
            Don't have an account?{' '}
            <Link href="/sign-up" className="text-secondary font-inbold">
              Sign up
            </Link>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
});

export default SignIn;
