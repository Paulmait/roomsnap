import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { AuthService } from '../services/AuthService';
import { useNavigation } from '@react-navigation/native';

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Password Reset Modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'email' | 'token'>('email');
  
  const authService = AuthService.getInstance();
  const navigation = useNavigation<any>();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    
    setLoading(true);
    
    try {
      // Try biometric authentication first
      const hasBiometric = await LocalAuthentication.hasHardwareAsync();
      if (hasBiometric) {
        const biometricResult = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to login',
          cancelLabel: 'Use Password',
          fallbackLabel: 'Use Password',
        });
        
        if (biometricResult.success) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
      
      const result = await authService.login(email, password, twoFactorCode);
      
      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.navigate('Home');
      } else {
        if (result.message.includes('2FA')) {
          setShowTwoFactor(true);
        } else {
          Alert.alert('Login Failed', result.message);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !name) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await authService.register(email, password, name);
      
      if (result.success) {
        Alert.alert('Success', result.message, [
          { text: 'OK', onPress: () => setMode('login') }
        ]);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Registration Failed', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (resetStep === 'email') {
      if (!resetEmail) {
        Alert.alert('Error', 'Please enter your email');
        return;
      }
      
      setLoading(true);
      
      try {
        const result = await authService.requestPasswordReset(resetEmail);
        
        if (result.success) {
          Alert.alert('Success', result.message);
          setResetStep('token');
        } else {
          Alert.alert('Error', result.message);
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to send reset email');
      } finally {
        setLoading(false);
      }
    } else {
      if (!resetToken || !newPassword) {
        Alert.alert('Error', 'Please enter reset code and new password');
        return;
      }
      
      setLoading(true);
      
      try {
        const result = await authService.resetPassword(resetToken, newPassword);
        
        if (result.success) {
          Alert.alert('Success', result.message, [
            { text: 'OK', onPress: () => {
              setShowResetModal(false);
              setResetStep('email');
              setResetEmail('');
              setResetToken('');
              setNewPassword('');
            }}
          ]);
        } else {
          Alert.alert('Error', result.message);
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to reset password');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={['#2196F3', '#21CBF3']}
          style={styles.header}
        >
          <Ionicons name="cube" size={80} color="#FFF" />
          <Text style={styles.appName}>RoomSnap AR</Text>
          <Text style={styles.tagline}>Professional AR Measurement</Text>
        </LinearGradient>

        <View style={styles.formContainer}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.activeTab]}
              onPress={() => setMode('login')}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.activeTabText]}>
                Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'register' && styles.activeTab]}
              onPress={() => setMode('register')}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.activeTabText]}>
                Register
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'register' && (
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Ionicons name="mail" size={20} color="#999" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed" size={20} color="#999" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons 
                name={showPassword ? "eye-off" : "eye"} 
                size={20} 
                color="#999" 
              />
            </TouchableOpacity>
          </View>

          {mode === 'register' && (
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </View>
          )}

          {showTwoFactor && (
            <View style={styles.inputContainer}>
              <Ionicons name="shield-checkmark" size={20} color="#999" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="2FA Code"
                value={twoFactorCode}
                onChangeText={setTwoFactorCode}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.mainButton}
            onPress={mode === 'login' ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.mainButtonText}>
                {mode === 'login' ? 'Login' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'login' && (
            <>
              <TouchableOpacity 
                style={styles.forgotButton}
                onPress={() => setShowResetModal(true)}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.socialButtons}>
                <TouchableOpacity style={styles.socialButton}>
                  <Ionicons name="logo-google" size={24} color="#DB4437" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton}>
                  <Ionicons name="logo-apple" size={24} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton}>
                  <Ionicons name="finger-print" size={24} color="#2196F3" />
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to our{' '}
              <Text style={styles.link}>Terms</Text> and{' '}
              <Text style={styles.link}>Privacy Policy</Text>
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Password Reset Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => {
                setShowResetModal(false);
                setResetStep('email');
                setResetEmail('');
                setResetToken('');
                setNewPassword('');
              }}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            <Ionicons name="lock-open" size={50} color="#2196F3" />
            <Text style={styles.modalTitle}>Reset Password</Text>
            
            {resetStep === 'email' ? (
              <>
                <Text style={styles.modalDescription}>
                  Enter your email address and we'll send you instructions to reset your password.
                </Text>
                
                <View style={styles.modalInputContainer}>
                  <Ionicons name="mail" size={20} color="#999" />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Email address"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalDescription}>
                  Enter the reset code sent to your email and choose a new password.
                </Text>
                
                <View style={styles.modalInputContainer}>
                  <Ionicons name="key" size={20} color="#999" />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Reset code"
                    value={resetToken}
                    onChangeText={setResetToken}
                  />
                </View>
                
                <View style={styles.modalInputContainer}>
                  <Ionicons name="lock-closed" size={20} color="#999" />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="New password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                </View>
                
                <Text style={styles.passwordHint}>
                  Password must be at least 8 characters with uppercase, lowercase, numbers, and symbols.
                </Text>
              </>
            )}

            <TouchableOpacity
              style={styles.modalButton}
              onPress={handlePasswordReset}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.modalButtonText}>
                  {resetStep === 'email' ? 'Send Reset Email' : 'Reset Password'}
                </Text>
              )}
            </TouchableOpacity>

            {resetStep === 'token' && (
              <TouchableOpacity onPress={() => setResetStep('email')}>
                <Text style={styles.resendText}>Didn't receive code? Resend</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 50,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 10,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 5,
  },
  formContainer: {
    flex: 1,
    padding: 20,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 30,
    backgroundColor: '#FFF',
    borderRadius: 25,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 22,
  },
  activeTab: {
    backgroundColor: '#2196F3',
  },
  tabText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FFF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 16,
  },
  mainButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  mainButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: 15,
  },
  forgotText: {
    color: '#2196F3',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DDD',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#999',
    fontSize: 12,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  socialButton: {
    width: 50,
    height: 50,
    backgroundColor: '#FFF',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  footer: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  link: {
    color: '#2196F3',
    textDecorationLine: 'underline',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 15,
    right: 15,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    width: '100%',
  },
  modalInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    marginLeft: 10,
  },
  passwordHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginTop: 10,
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendText: {
    color: '#2196F3',
    fontSize: 14,
    marginTop: 15,
  },
});