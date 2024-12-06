import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import type { CustomButtonType } from './CustomButton.types';

const CustomButton = ({ title, handlePress, containerStyles, textStyles, isLoading }: CustomButtonType) => {
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      className={`bg-secondary rounded-full min-h-[62px]
            justify-center items-center px-8 py-6 ${containerStyles}
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={isLoading}
    >
      <Text className={textStyles}>{title}</Text>
    </TouchableOpacity>
  );
};

export default CustomButton;
