import { observer } from 'mobx-react-lite';
import { View, Text, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import React, { useEffect, useState, useContext } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { images } from '@/constants';
import ensureError from '@/utils/ensureError';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { FormField } from '@/components/FormField';
import CustomButton from '@/components/CustomButton';
import { createUser } from '@/lib/appwrite';
import { UserContext } from '@/store/user';

interface FormProps {
  username: string;
  email: string;
  password: string;
  pwdConfirm: string;
}

const SignUp = observer(() => {
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState<FormProps>({
    username: '',
    email: '',
    password: '',
    pwdConfirm: '',
  });

  const user = useContext(UserContext);

  const submit = async () => {
    if (!form.email || !form.password || !form.username) {
      alert('Please fill all fields');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(form.email)) {
      alert('Please enter a valid email address');
      return;
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])[A-Za-z0-9]{8,}$/;

    if (!passwordRegex.test(form.password)) {
      alert(
        'Password must be at least 6 characters long and contain at least one capital letter and one number'
      );
      return;
    }

    if (form.password !== form.pwdConfirm) {
      alert('Passwords do not match');
      return;
    }
    setIsLoading(true);
    try {
      const userDocument = await createUser(
        form.email,
        form.password,
        form.username
      );
      console.log({ userDocument });
      user.login({
        session: {
          $id: userDocument.$id,
          isLoggedIn: true,
        },
        email: form.email,
        userName: form.username,
        avatar: userDocument.avatar,
      });
      router.replace('/home');
    } catch (error: unknown) {
      const err = ensureError(error);
      console.error(err.message);
      throw new Error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

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
        <View className="mt-16 ml-7 max-w-sm">
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
          <Text className="font-inbold text-light mt-8 mb-4 text-3xl">
            Sign in
          </Text>
          <FormField
            otherStyles="mt-5"
            title="Username"
            value={form.username}
            handleChangeText={(text: string) =>
              handleFormChange('username', text)
            }
          />
          <FormField
            otherStyles="mt-4"
            title="Email"
            value={form.email}
            handleChangeText={(text: string) => handleFormChange('email', text)}
          />
          <FormField
            otherStyles="mt-4"
            title="Password"
            value={form.password}
            handleChangeText={(text: string) =>
              handleFormChange('password', text)
            }
          />
          <FormField
            otherStyles="mt-4"
            title="Confirm password"
            value={form.pwdConfirm}
            handleChangeText={(text: string) =>
              handleFormChange('pwdConfirm', text)
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
              title="Sign Up"
              handlePress={submit}
              textStyles="text-white font-inbold"
              isLoading={isLoading}
            />
          </View>
          <Text className="text-green-50 mt-5 text-center font-inmedium">
            Already have an account?{' '}
            <Link href="/sign-in" className="text-secondary font-inbold">
              Login
            </Link>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
});

export default SignUp;
