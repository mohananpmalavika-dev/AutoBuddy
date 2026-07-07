import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
// BUG-018 FIX: Import phone validation
import { validatePhone } from '../../utils/validation';

interface SignupScreenProps {
  onSignup: (data: any) => Promise<void>;
  onLoginPress: () => void;
}

export default function SignupScreen({
  onSignup,
  onLoginPress,
}: SignupScreenProps) {
  const [userType, setUserType] = useState<'passenger' | 'driver'>('passenger');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleNext = () => {
    if (step === 1) {
      if (!formData.phone.trim() || !formData.name.trim()) {
        Alert.alert('Required Fields', 'Please fill in all fields');
        return;
      }
      
      // BUG-018 FIX: Use validatePhone for comprehensive phone validation
      const phoneValidation = validatePhone(formData.phone);
      if (!phoneValidation.isValid) {
        Alert.alert('Invalid Phone', phoneValidation.error || 'Please enter a valid phone number');
        return;
      }
      
      setStep(2);
    } else if (step === 2) {
      if (!formData.password.trim() || !formData.confirmPassword.trim()) {
        Alert.alert('Required Fields', 'Please enter password');
        return;
      }
      if (formData.password.length < 6) {
        Alert.alert('Weak Password', 'Password must be at least 6 characters');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        Alert.alert('Password Mismatch', 'Passwords do not match');
        return;
      }
      handleSignup();
    }
  };

  const handleSignup = async () => {
    try {
      setLoading(true);
      await onSignup({
        ...formData,
        role: userType,
      });
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => setStep(1)}>
              <MaterialIcons name="arrow-back" size={24} color="#2196F3" />
            </Pressable>
            <Text style={styles.title}>Create Account</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBar,
                  { width: step === 1 ? '50%' : '100%' },
                ]}
              />
            </View>
            <Text style={styles.stepText}>Step {step} of 2</Text>
          </View>

          {/* User Type Selection */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.sectionTitle}>Who are you?</Text>
              <View style={styles.userTypeGrid}>
                {[
                  { id: 'passenger', label: 'Passenger', icon: 'person' },
                  { id: 'driver', label: 'Driver', icon: 'directions-car' },
                ].map(type => (
                  <Pressable
                    key={type.id}
                    style={[
                      styles.userTypeCard,
                      userType === type.id && styles.userTypeCardActive,
                    ]}
                    onPress={() => setUserType(type.id as any)}
                  >
                    <MaterialIcons
                      name={type.icon as any}
                      size={40}
                      color={userType === type.id ? '#2196F3' : '#999'}
                    />
                    <Text
                      style={[
                        styles.userTypeCardLabel,
                        userType === type.id && styles.userTypeCardLabelActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Phone & Name */}
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Phone Number</Text>
                  <View style={styles.phoneInput}>
                    <Text style={styles.countryCode}>+91</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter 10-digit number"
                      keyboardType="phone-pad"
                      value={formData.phone}
                      onChangeText={value => updateFormData('phone', value)}
                      maxLength={10}
                      editable={!loading}
                      placeholderTextColor="#ccc"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={[styles.input, styles.textInput]}
                    placeholder="John Doe"
                    value={formData.name}
                    onChangeText={value => updateFormData('name', value)}
                    editable={!loading}
                    placeholderTextColor="#ccc"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textInput]}
                    placeholder="john@example.com"
                    keyboardType="email-address"
                    value={formData.email}
                    onChangeText={value => updateFormData('email', value)}
                    editable={!loading}
                    placeholderTextColor="#ccc"
                  />
                </View>
              </View>
            </View>
          )}

          {/* Password Step */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.sectionTitle}>Secure Your Account</Text>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordInput}>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter password (min 6 characters)"
                      secureTextEntry={!showPassword}
                      value={formData.password}
                      onChangeText={value => updateFormData('password', value)}
                      editable={!loading}
                      placeholderTextColor="#ccc"
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.togglePassword}
                    >
                      <MaterialIcons
                        name={showPassword ? 'visibility' : 'visibility-off'}
                        size={20}
                        color="#999"
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.passwordInput}>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm password"
                      secureTextEntry={!showPassword}
                      value={formData.confirmPassword}
                      onChangeText={value => updateFormData('confirmPassword', value)}
                      editable={!loading}
                      placeholderTextColor="#ccc"
                    />
                  </View>
                </View>

                {/* Terms */}
                <View style={styles.termsBox}>
                  <MaterialIcons name="info" size={16} color="#0D47A1" />
                  <Text style={styles.termsText}>
                    By signing up, you agree to our Terms of Service and Privacy Policy
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttons}>
            {step === 2 && (
              <Pressable
                style={styles.backButton}
                onPress={() => setStep(1)}
                disabled={loading}
              >
                <Text style={styles.backButtonText}>BACK</Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.nextButton,
                loading && styles.buttonDisabled,
                step === 2 && styles.fullWidth,
              ]}
              onPress={handleNext}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons
                    name={step === 1 ? 'arrow-forward' : 'check'}
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.nextButtonText}>
                    {step === 1 ? 'NEXT' : 'CREATE ACCOUNT'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Login Link */}
          <View style={styles.loginSection}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <Pressable onPress={onLoginPress}>
              <Text style={styles.loginLink}>Login</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  placeholder: {
    width: 24,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 3,
  },
  stepText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  stepContent: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  userTypeGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  userTypeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  userTypeCardActive: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  userTypeCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
  },
  userTypeCardLabelActive: {
    color: '#2196F3',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  countryCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  togglePassword: {
    padding: 8,
  },
  termsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    gap: 10,
  },
  termsText: {
    fontSize: 11,
    color: '#0D47A1',
    flex: 1,
    lineHeight: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    gap: 8,
  },
  fullWidth: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: 13,
    color: '#666',
  },
  loginLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
});
