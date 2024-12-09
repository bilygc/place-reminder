import { useFonts } from "expo-font";
import { Stack, SplashScreen } from "expo-router";
import React, { useEffect } from "react";
import { Text } from "react-native";

// Import your global CSS file
import "../global.css";
import { View } from "react-native-reanimated/lib/typescript/Animated";

SplashScreen.preventAutoHideAsync();

const RootLayout = () => {
  const [fontsLoaded, error] = useFonts({
    "Inter-Black": require("../assets/fonts/Inter_18pt-Black.ttf"),
    "Inter-BlackItalic": require("../assets/fonts/Inter_18pt-BlackItalic.ttf"),
    "Inter-Bold": require("../assets/fonts/Inter_18pt-Bold.ttf"),
    "Inter-BoldItalic": require("../assets/fonts/Inter_18pt-BoldItalic.ttf"),
    "Inter-ExtraBold": require("../assets/fonts/Inter_18pt-ExtraBold.ttf"),
    "Inter-ExtraBoldItalic": require("../assets/fonts/Inter_18pt-ExtraBoldItalic.ttf"),
    "Inter-ExtraLight": require("../assets/fonts/Inter_18pt-ExtraLight.ttf"),
    "Inter-ExtraLightItalic": require("../assets/fonts/Inter_18pt-ExtraLightItalic.ttf"),
    "Inter-Italic": require("../assets/fonts/Inter_18pt-Italic.ttf"),
    "Inter-Light": require("../assets/fonts/Inter_18pt-Light.ttf"),
    "Inter-LightItalic": require("../assets/fonts/Inter_18pt-LightItalic.ttf"),
    "Inter-Medium": require("../assets/fonts/Inter_18pt-Medium.ttf"),
    "Inter-MediumItalic": require("../assets/fonts/Inter_18pt-MediumItalic.ttf"),
    "Inter-Regular": require("../assets/fonts/Inter_18pt-Regular.ttf"),
    "Inter-SemiBold": require("../assets/fonts/Inter_18pt-SemiBold.ttf"),
    "Inter-SemiBoldItalic": require("../assets/fonts/Inter_18pt-SemiBoldItalic.ttf"),
    "Inter-Thin": require("../assets/fonts/Inter_18pt-Thin.ttf"),
    default: require("../assets/fonts/Inter_18pt-Regular.ttf"),
  });

  useEffect(() => {
    if (error) throw error;

    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, error]);

  if (!fontsLoaded && !error) {
    return null;
  }

  return (
    // <GlobalProvider>
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      {/* <Stack.Screen name="(tabs)" options={{ headerShown: false }} /> */}
      {/* <Stack.Screen name="/search/[query]" options={{ headerShown: false }} /> */}
    </Stack>
    // </GlobalProvider>
  );
};

export default RootLayout;
