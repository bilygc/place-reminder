import type { ComponentProps } from 'react';
import type { TextInput } from 'react-native';

export interface FormFieldProps
  extends Omit<ComponentProps<typeof TextInput>, 'value' | 'onChangeText'> {
  title?: string;
  value: string;
  placeholder?: string;
  handleChangeText?: (text: string) => void;
  inputStyles?: string;
  otherStyles?: string;
}
