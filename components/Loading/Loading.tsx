import React, { useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

interface GreenLoadingProps {
  size?: number;
}

export const GreenLoading: React.FC<GreenLoadingProps> = ({ size = 10 }) => {
  // Use state (not refs) so these values are safe to read during render.
  // The lazy initializer runs once, so identity stays stable across
  // re-renders — same effect as a ref, without triggering react-hooks/refs.
  const [animation1] = useState(() => new Animated.Value(0));
  const [animation2] = useState(() => new Animated.Value(0));
  const [animation3] = useState(() => new Animated.Value(0));

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
    const timeout2 = setTimeout(() => animate(animation2), 166);
    const timeout3 = setTimeout(() => animate(animation3), 333);

    return () => {
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      animation1.stopAnimation();
      animation2.stopAnimation();
      animation3.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // animation1/2/3 have stable identity (lazy useState init); intentionally run once.

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
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    backgroundColor: '#4ade80', // green-400 equivalent
    borderRadius: 5,
    marginHorizontal: 3,
  },
  text: {
    marginTop: 10,
    color: '#16a34a', // green-600 equivalent
    fontSize: 14,
  },
});