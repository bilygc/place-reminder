import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image } from "react-native";
import { icons } from "@/constants";
import type { FormFieldProps } from "./FormField.types";

const FormField = ({
  title,
  value,
  placeholder,
  handleChangeText,
  otherStyles,
  ...props
}: FormFieldProps) => {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <View className={`space-y-2 space-x-2 mt-6 ${otherStyles}`}>
      <Text className="text-green-50  font-inmedium mb-2">{title}</Text>
      <View className="border-2 border-secondary w-full h-16 px-4 bg-white-50 rounded-2xl focus:border-secondary items-center flex-row">
        <TextInput
          className="flex-1 font-insemiBold text-green-50"
          placeholder={placeholder}
          placeholderTextColor="#7b7b8b"
          secureTextEntry={title === "Password" && !showPassword}
          value={value}
          onChangeText={handleChangeText}
          {...props}
        />
        {title === "Password" && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Image
              source={showPassword ? icons.eye : icons.eyeHide}
              className="w-6 h-6"
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default FormField;
