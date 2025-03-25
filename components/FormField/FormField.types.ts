export interface FormFieldProps {
  title: string;
  value: string;
  placeholder?: string;
  handleChangeText?: (text: string) => void;
  otherStyles?: string;
}
