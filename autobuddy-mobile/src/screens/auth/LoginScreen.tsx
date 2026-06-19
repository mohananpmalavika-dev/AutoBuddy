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

interface LoginScreenProps {
  onLogin: (credentials: { phone: string; password: string }) => Promise<void>;
  onSignupPress: () => void;
}

export default function LoginScreen({
  onLogin,
  onSignupPress,
}: LoginScreenProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userType, setUserType] = useState<'passenger' | 'driver' | 'operator' | 'admin'>(
    'passenger'
  );

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter phone and password');
      return;
    }

    if (phone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number');
      return;
    }

    try {
      setLoading(true);
      await onLogin({ phone, password });
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Please check your credentials');
    } finally {
      setLoading(false);
    }
  };

  const userTypeOptions = [
    { id: 'passenger', label: 'Passenger', icon: 'person' },
    { id: 'driver', label: 'Driver', icon: 'directions-car' },
    { id: 'operator', label: 'Operator', icon: 'business' },
    { id: 'admin', label: 'Admin', icon: 'admin-panel-settings' },
  ];

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
            <View style={styles.logoBox}>
              <MaterialIcons name="two-wheeler" size={48} color="#2196F3" />
            </View>
            <Text style={styles.title}>AutoBuddy</Text>
            <Text style={styles.subtitle}>Get rides on your terms</Text>
          </View>

          {/* User Type Selection */}
          <View style={styles.userTypeSection}>
            <Text style={styles.sectionTitle}>I am a</Text>
            <View style={styles.userTypeGrid}>
              {userTypeOptions.map(type => (
                <Pressable
                  key={type.id}
                  style={[
                    styles.userTypeButton,
                    userType === type.id && styles.userTypeButtonActive,
                  ]}
                  onPress={() => setUserType(type.id as any)}
                >
                  <MaterialIcons
                    name={type.icon as any}
                    size={24}
                    color={userType === type.id ? '#2196F3' : '#999'}
                  />
                  <Text
                    style={[
                      styles.userTypeLabel,
                      userType === type.id && styles.userTypeLabelActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Login Form */}
          <View style={styles.form}>
            {/* Phone Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneInput}>
                <Text style={styles.countryCode}>+91</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 10-digit number"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={10}
                  editable={!loading}
                  placeholderTextColor="#ccc"
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordInput}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
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

            {/* Forgot Password */}
            <Pressable style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </Pressable>

            {/* Login Button */}
            <Pressable
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="login" size={20} color="#fff" />
                  <Text style={styles.loginButtonText}>LOGIN</Text>
                </>
              )}
            </Pressable>

            {/* Demo Credentials */}
            <View style={styles.demoSection}>
              <Text style={styles.demoTitle}>Demo Credentials</Text>
              <View style={styles.demoCreds}>
                <Text style={styles.demoText}>Phone: 9876543210</Text>
                <Text style={styles.demoText}>Password: demo123</Text>
              </View>
            </View>
          </View>

          {/* Signup Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Pressable onPress={onSignupPress}>
              <Text style={styles.signupLink}>Sign up</Text>
            </Pressable>
          </View>

          {/* Info Cards */}
          <View style={styles.infoCards}>
            <InfoCard
              icon="security"
              title="Secure"
              description="Your data is encrypted and secure"
            />
            <InfoCard
              icon="speed"
              title="Fast"
              description="Quick login and ride booking"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface InfoCardProps {
  icon: string;
  title: string;
  description: string;
}

function InfoCard({ icon, title, description }: InfoCardProps) {
  return (
    <View style={styles.infoCard}>
      <MaterialIcons name={icon as any} size={24} color="#2196F3" />
      <View style={styles.infoContent}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  userTypeSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  userTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  userTypeButton: {
    flex: 0.48,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  userTypeButtonActive: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  userTypeLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 6,
    fontWeight: '600',
  },
  userTypeLabelActive: {
    color: '#2196F3',
  },
  form: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
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
  togglePassword: {
    padding: 8,
  },
  forgotPassword: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  demoSection: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA726',
  },
  demoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F57F17',
    marginBottom: 6,
  },
  demoCreds: {
    gap: 4,
  },
  demoText: {
    fontSize: 11,
    color: '#F57F17',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  footerText: {
    fontSize: 13,
    color: '#666',
  },
  signupLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
  infoCards: {
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1565C0',
  },
  infoDescription: {
    fontSize: 11,
    color: '#0D47A1',
    marginTop: 4,
  },
});
