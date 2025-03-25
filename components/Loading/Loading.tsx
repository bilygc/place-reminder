import React from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";

interface GreenLoadingProps {
  size?: number;
}

export const GreenLoading: React.FC<GreenLoadingProps> = ({ size = 10 }) => {
  const animation1 = React.useRef(new Animated.Value(0)).current;
  const animation2 = React.useRef(new Animated.Value(0)).current;
  const animation3 = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animate = (animation: Animated.Value) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animation, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.ease,
          }),
          Animated.timing(animation, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.ease,
          }),
        ])
      ).start();
    };

    animate(animation1);
    setTimeout(() => animate(animation2), 166);
    setTimeout(() => animate(animation3), 333);
  }, [animation1, animation2, animation3]); // Added dependencies

  const scaleInterpolate = (animation: Animated.Value) =>
    animation.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.5],
    });

  return (
    <View style={styles.container}>
      <View style={styles.dotsContainer}>
        <Animated.View
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              transform: [{ scale: scaleInterpolate(animation1) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              transform: [{ scale: scaleInterpolate(animation2) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              transform: [{ scale: scaleInterpolate(animation3) }],
            },
          ]}
        />
      </View>
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  dot: {
    backgroundColor: "#4ade80", // green-400 equivalent
    borderRadius: 5,
    marginHorizontal: 3,
  },
  text: {
    marginTop: 10,
    color: "#16a34a", // green-600 equivalent
    fontSize: 14,
  },
});
