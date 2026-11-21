// Text inputs. InputField already is the shared input (Base UI Field underneath, label / hint /
// icons / error states, its own animated placeholder), so it is the Input here rather than a rewrite.
// PasswordInputField adds the show/hide toggle; TimeField is the time-of-day picker.

export { InputField as Input, type InputFieldProps as InputProps } from '@/components/InputField'
export { PasswordInputField as PasswordInput } from '@/components/PasswordInputField'
