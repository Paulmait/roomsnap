import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as MailComposer from 'expo-mail-composer';
import { SecurityService } from './SecurityService';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'support';
  createdAt: Date;
  lastLogin: Date;
  isActive: boolean;
  isVerified: boolean;
  subscription: string;
  twoFactorEnabled: boolean;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export interface PasswordResetRequest {
  email: string;
  token: string;
  expires: Date;
  ipAddress: string;
  userAgent: string;
}

export class AuthService {
  private static instance: AuthService;
  private readonly AUTH_KEY = '@roomsnap_auth';
  private readonly USERS_KEY = '@roomsnap_users';
  private readonly RESET_REQUESTS_KEY = '@roomsnap_reset_requests';
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
  private readonly RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
  
  private securityService = SecurityService.getInstance();
  private currentAuth: AuthState = {
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null,
    expiresAt: null,
  };

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load saved auth state
      const authData = await AsyncStorage.getItem(this.AUTH_KEY);
      if (authData) {
        const auth = JSON.parse(authData);
        
        // Check if token is still valid
        if (auth.expiresAt && new Date(auth.expiresAt) > new Date()) {
          this.currentAuth = auth;
        } else {
          // Try to refresh token
          await this.refreshAuthToken();
        }
      }
      
      // Initialize default admin account if needed
      await this.ensureAdminAccount();
    } catch (error) {
      console.error('Auth initialization failed:', error);
    }
  }

  async register(email: string, password: string, name: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate email
      if (!this.isValidEmail(email)) {
        return { success: false, message: 'Invalid email address' };
      }
      
      // Check password strength
      const passwordStrength = this.checkPasswordStrength(password);
      if (passwordStrength.score < 3) {
        return { success: false, message: passwordStrength.feedback };
      }
      
      // Check if user exists
      const users = await this.getAllUsers();
      if (users.find(u => u.email === email)) {
        return { success: false, message: 'Email already registered' };
      }
      
      // Hash password
      const { hash, salt } = await this.securityService.hashPassword(password);
      
      // Create user
      const user: User = {
        id: await this.generateUserId(),
        email,
        name,
        role: 'user',
        createdAt: new Date(),
        lastLogin: new Date(),
        isActive: true,
        isVerified: false,
        subscription: 'free',
        twoFactorEnabled: false,
        loginAttempts: 0,
      };
      
      // Save user with encrypted password
      const encryptedUser = await this.securityService.encrypt(JSON.stringify({
        ...user,
        passwordHash: hash,
        passwordSalt: salt,
      }));
      
      users.push(user);
      await this.saveUsers(users);
      
      // Send verification email
      await this.sendVerificationEmail(email, name);
      
      // Log registration
      await this.securityService.auditLog('user_registered', true, { userId: user.id });
      
      return { success: true, message: 'Registration successful. Please check your email to verify your account.' };
    } catch (error) {
      console.error('Registration failed:', error);
      return { success: false, message: 'Registration failed. Please try again.' };
    }
  }

  async login(email: string, password: string, twoFactorCode?: string): Promise<{ success: boolean; message: string; user?: User }> {
    try {
      // Get user
      const users = await this.getAllUsers();
      const user = users.find(u => u.email === email);
      
      if (!user) {
        await this.securityService.auditLog('login_failed_user_not_found', false, { email });
        return { success: false, message: 'Invalid email or password' };
      }
      
      // Check if account is locked
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
        return { success: false, message: `Account locked. Try again in ${remainingMinutes} minutes.` };
      }
      
      // Verify password
      const userData = await this.getUserData(user.id);
      const isValidPassword = await this.securityService.verifyPassword(
        password,
        userData.passwordHash,
        userData.passwordSalt
      );
      
      if (!isValidPassword) {
        // Increment login attempts
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        
        if (user.loginAttempts >= this.MAX_LOGIN_ATTEMPTS) {
          // Lock account
          user.lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION);
          await this.updateUser(user);
          
          await this.securityService.auditLog('account_locked', false, { userId: user.id });
          return { success: false, message: 'Account locked due to too many failed attempts' };
        }
        
        await this.updateUser(user);
        await this.securityService.auditLog('login_failed_wrong_password', false, { userId: user.id });
        
        return { success: false, message: `Invalid password. ${this.MAX_LOGIN_ATTEMPTS - user.loginAttempts} attempts remaining.` };
      }
      
      // Check 2FA if enabled
      if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
          return { success: false, message: '2FA code required' };
        }
        
        const isValid2FA = await this.verify2FACode(user.id, twoFactorCode);
        if (!isValid2FA) {
          await this.securityService.auditLog('2fa_failed', false, { userId: user.id });
          return { success: false, message: 'Invalid 2FA code' };
        }
      }
      
      // Check if account is active
      if (!user.isActive) {
        return { success: false, message: 'Account is disabled. Please contact support.' };
      }
      
      // Generate tokens
      const token = await this.securityService.generateSecureToken();
      const refreshToken = await this.securityService.generateSecureToken();
      
      // Update user
      user.lastLogin = new Date();
      user.loginAttempts = 0;
      user.lockedUntil = undefined;
      await this.updateUser(user);
      
      // Save auth state
      this.currentAuth = {
        isAuthenticated: true,
        user,
        token,
        refreshToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };
      
      await this.saveAuthState();
      
      // Log successful login
      await this.securityService.auditLog('login_success', true, { userId: user.id });
      
      return { success: true, message: 'Login successful', user };
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, message: 'Login failed. Please try again.' };
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.currentAuth.user) {
        await this.securityService.auditLog('logout', true, { userId: this.currentAuth.user.id });
      }
      
      this.currentAuth = {
        isAuthenticated: false,
        user: null,
        token: null,
        refreshToken: null,
        expiresAt: null,
      };
      
      await AsyncStorage.removeItem(this.AUTH_KEY);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if user exists
      const users = await this.getAllUsers();
      const user = users.find(u => u.email === email);
      
      if (!user) {
        // Don't reveal if user exists (security best practice)
        return { success: true, message: 'If an account exists with this email, you will receive password reset instructions.' };
      }
      
      // Generate reset token
      const resetToken = await this.generateResetToken();
      const hashedToken = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        resetToken
      );
      
      // Save reset request
      const resetRequest: PasswordResetRequest = {
        email,
        token: hashedToken,
        expires: new Date(Date.now() + this.RESET_TOKEN_EXPIRY),
        ipAddress: 'user_ip', // In production, get actual IP
        userAgent: 'user_agent', // In production, get actual user agent
      };
      
      await this.saveResetRequest(resetRequest);
      
      // Update user with reset token
      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = resetRequest.expires;
      await this.updateUser(user);
      
      // Send reset email
      await this.sendPasswordResetEmail(email, resetToken);
      
      // Log reset request
      await this.securityService.auditLog('password_reset_requested', true, { userId: user.id });
      
      return { success: true, message: 'Password reset instructions sent to your email.' };
    } catch (error) {
      console.error('Password reset request failed:', error);
      return { success: false, message: 'Failed to process reset request. Please try again.' };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      // Hash the provided token
      const hashedToken = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        token
      );
      
      // Find user with this token
      const users = await this.getAllUsers();
      const user = users.find(u => 
        u.passwordResetToken === hashedToken &&
        u.passwordResetExpires &&
        new Date(u.passwordResetExpires) > new Date()
      );
      
      if (!user) {
        await this.securityService.auditLog('password_reset_invalid_token', false);
        return { success: false, message: 'Invalid or expired reset token' };
      }
      
      // Check password strength
      const passwordStrength = this.checkPasswordStrength(newPassword);
      if (passwordStrength.score < 3) {
        return { success: false, message: passwordStrength.feedback };
      }
      
      // Hash new password
      const { hash, salt } = await this.securityService.hashPassword(newPassword);
      
      // Update user data
      const userData = await this.getUserData(user.id);
      userData.passwordHash = hash;
      userData.passwordSalt = salt;
      
      await this.saveUserData(user.id, userData);
      
      // Clear reset token
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.loginAttempts = 0;
      user.lockedUntil = undefined;
      await this.updateUser(user);
      
      // Log password reset
      await this.securityService.auditLog('password_reset_success', true, { userId: user.id });
      
      // Send confirmation email
      await this.sendPasswordChangedEmail(user.email);
      
      return { success: true, message: 'Password reset successful. You can now login with your new password.' };
    } catch (error) {
      console.error('Password reset failed:', error);
      return { success: false, message: 'Password reset failed. Please try again.' };
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      
      // Verify current password
      const userData = await this.getUserData(userId);
      const isValid = await this.securityService.verifyPassword(
        currentPassword,
        userData.passwordHash,
        userData.passwordSalt
      );
      
      if (!isValid) {
        await this.securityService.auditLog('password_change_failed', false, { userId });
        return { success: false, message: 'Current password is incorrect' };
      }
      
      // Check password strength
      const passwordStrength = this.checkPasswordStrength(newPassword);
      if (passwordStrength.score < 3) {
        return { success: false, message: passwordStrength.feedback };
      }
      
      // Hash new password
      const { hash, salt } = await this.securityService.hashPassword(newPassword);
      
      // Update password
      userData.passwordHash = hash;
      userData.passwordSalt = salt;
      await this.saveUserData(userId, userData);
      
      // Log password change
      await this.securityService.auditLog('password_changed', true, { userId });
      
      // Send notification
      await this.sendPasswordChangedEmail(user.email);
      
      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('Password change failed:', error);
      return { success: false, message: 'Failed to change password' };
    }
  }

  async enable2FA(userId: string): Promise<{ success: boolean; secret?: string; qrCode?: string }> {
    try {
      const user = await this.getUser(userId);
      if (!user) {
        return { success: false };
      }
      
      // Generate 2FA secret
      const secret = await this.generate2FASecret();
      
      // Save secret (encrypted)
      const userData = await this.getUserData(userId);
      userData.twoFactorSecret = secret;
      await this.saveUserData(userId, userData);
      
      // Update user
      user.twoFactorEnabled = true;
      await this.updateUser(user);
      
      // Generate QR code for authenticator apps
      const qrCode = `otpauth://totp/RoomSnapAR:${user.email}?secret=${secret}&issuer=RoomSnapAR`;
      
      await this.securityService.auditLog('2fa_enabled', true, { userId });
      
      return { success: true, secret, qrCode };
    } catch (error) {
      console.error('2FA setup failed:', error);
      return { success: false };
    }
  }

  async verify2FACode(userId: string, code: string): Promise<boolean> {
    try {
      const userData = await this.getUserData(userId);
      if (!userData.twoFactorSecret) {
        return false;
      }

      // Verify TOTP code using time-based algorithm
      const isValid = await this.verifyTOTP(userData.twoFactorSecret, code);
      return isValid;
    } catch (error) {
      console.error('2FA verification failed:', error);
      return false;
    }
  }

  private async verifyTOTP(secret: string, code: string): Promise<boolean> {
    // TOTP verification with 30-second time windows
    // Allow 1 window before and after for clock drift
    const timeStep = 30;
    const currentTime = Math.floor(Date.now() / 1000);

    for (let i = -1; i <= 1; i++) {
      const counter = Math.floor((currentTime + i * timeStep) / timeStep);
      const expectedCode = await this.generateTOTPCode(secret, counter);

      // Constant-time comparison to prevent timing attacks
      if (this.secureCompare(code, expectedCode)) {
        return true;
      }
    }

    return false;
  }

  private async generateTOTPCode(secret: string, counter: number): Promise<string> {
    // Convert counter to 8-byte buffer
    const counterBuffer = new Uint8Array(8);
    let temp = counter;
    for (let i = 7; i >= 0; i--) {
      counterBuffer[i] = temp & 0xff;
      temp = Math.floor(temp / 256);
    }

    // Generate HMAC-SHA256 (simplified for React Native compatibility)
    const hmacInput = secret + Array.from(counterBuffer).map(b => String.fromCharCode(b)).join('');
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      hmacInput
    );

    // Dynamic truncation
    const offset = parseInt(hash.slice(-1), 16);
    const truncatedHash = hash.slice(offset * 2, offset * 2 + 8);
    const code = (parseInt(truncatedHash, 16) & 0x7fffffff) % 1000000;

    return code.toString().padStart(6, '0');
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  // Admin Functions
  async adminResetUserPassword(adminId: string, targetUserId: string): Promise<{ success: boolean; temporaryPassword?: string }> {
    try {
      // Verify admin privileges
      const admin = await this.getUser(adminId);
      if (!admin || admin.role !== 'admin') {
        await this.securityService.auditLog('unauthorized_admin_action', false, { adminId });
        return { success: false };
      }
      
      const targetUser = await this.getUser(targetUserId);
      if (!targetUser) {
        return { success: false };
      }
      
      // Generate temporary password
      const tempPassword = this.generateTemporaryPassword();
      
      // Hash and save
      const { hash, salt } = await this.securityService.hashPassword(tempPassword);
      const userData = await this.getUserData(targetUserId);
      userData.passwordHash = hash;
      userData.passwordSalt = salt;
      userData.requirePasswordChange = true;
      await this.saveUserData(targetUserId, userData);
      
      // Clear any locks
      targetUser.loginAttempts = 0;
      targetUser.lockedUntil = undefined;
      await this.updateUser(targetUser);
      
      // Log admin action
      await this.securityService.auditLog('admin_password_reset', true, { 
        adminId, 
        targetUserId,
        targetEmail: targetUser.email 
      });
      
      // Send notification to user
      await this.sendAdminPasswordResetEmail(targetUser.email, tempPassword);
      
      return { success: true, temporaryPassword: tempPassword };
    } catch (error) {
      console.error('Admin password reset failed:', error);
      return { success: false };
    }
  }

  async adminUnlockAccount(adminId: string, targetUserId: string): Promise<boolean> {
    try {
      const admin = await this.getUser(adminId);
      if (!admin || admin.role !== 'admin') {
        return false;
      }
      
      const targetUser = await this.getUser(targetUserId);
      if (!targetUser) {
        return false;
      }
      
      targetUser.loginAttempts = 0;
      targetUser.lockedUntil = undefined;
      await this.updateUser(targetUser);
      
      await this.securityService.auditLog('admin_unlock_account', true, { 
        adminId, 
        targetUserId 
      });
      
      return true;
    } catch (error) {
      console.error('Admin unlock failed:', error);
      return false;
    }
  }

  async adminDisableAccount(adminId: string, targetUserId: string, reason: string): Promise<boolean> {
    try {
      const admin = await this.getUser(adminId);
      if (!admin || admin.role !== 'admin') {
        return false;
      }
      
      const targetUser = await this.getUser(targetUserId);
      if (!targetUser) {
        return false;
      }
      
      targetUser.isActive = false;
      await this.updateUser(targetUser);
      
      await this.securityService.auditLog('admin_disable_account', true, { 
        adminId, 
        targetUserId,
        reason 
      });
      
      return true;
    } catch (error) {
      console.error('Admin disable account failed:', error);
      return false;
    }
  }

  async adminGetAllUsers(adminId: string): Promise<User[]> {
    const admin = await this.getUser(adminId);
    if (!admin || (admin.role !== 'admin' && admin.role !== 'support')) {
      return [];
    }
    
    return await this.getAllUsers();
  }

  // Helper methods
  private async getAllUsers(): Promise<User[]> {
    try {
      const usersData = await AsyncStorage.getItem(this.USERS_KEY);
      return usersData ? JSON.parse(usersData) : [];
    } catch {
      return [];
    }
  }

  private async saveUsers(users: User[]): Promise<void> {
    await AsyncStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  }

  private async getUser(userId: string): Promise<User | null> {
    const users = await this.getAllUsers();
    return users.find(u => u.id === userId) || null;
  }

  private async updateUser(user: User): Promise<void> {
    const users = await this.getAllUsers();
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      users[index] = user;
      await this.saveUsers(users);
    }
  }

  private async getUserData(userId: string): Promise<any> {
    const key = `user_data_${userId}`;
    const encryptedData = await this.securityService.secureRetrieve(key);
    return encryptedData ? JSON.parse(encryptedData) : {};
  }

  private async saveUserData(userId: string, data: any): Promise<void> {
    const key = `user_data_${userId}`;
    await this.securityService.secureStore(key, JSON.stringify(data));
  }

  private async saveAuthState(): Promise<void> {
    await AsyncStorage.setItem(this.AUTH_KEY, JSON.stringify(this.currentAuth));
  }

  private async refreshAuthToken(): Promise<void> {
    // Implement token refresh logic
    // This would typically call a backend API
  }

  private async ensureAdminAccount(): Promise<void> {
    const users = await this.getAllUsers();
    if (!users.find(u => u.role === 'admin')) {
      // Generate cryptographically secure random admin password
      const adminPassword = await this.generateSecureAdminPassword();
      const { hash, salt } = await this.securityService.hashPassword(adminPassword);

      const admin: User = {
        id: 'admin-001',
        email: 'admin@roomsnap.app',
        name: 'System Admin',
        role: 'admin',
        createdAt: new Date(),
        lastLogin: new Date(),
        isActive: true,
        isVerified: true,
        subscription: 'enterprise',
        twoFactorEnabled: true,
        loginAttempts: 0,
      };

      users.push(admin);
      await this.saveUsers(users);

      await this.saveUserData(admin.id, {
        passwordHash: hash,
        passwordSalt: salt,
        requirePasswordChange: true, // Force password change on first login
      });

      // Log admin creation for security audit
      console.warn(
        'SECURITY: Initial admin account created. Password must be changed on first login.'
      );
      await this.securityService.auditLog('admin_account_created', true, {
        adminId: admin.id,
        email: admin.email,
        requirePasswordChange: true,
      });
    }
  }

  private async generateSecureAdminPassword(): Promise<string> {
    // Generate 24 random bytes for a strong password
    const randomBytes = await Crypto.getRandomBytesAsync(24);

    // Convert to base64 and add special characters for complexity
    const base64 = Array.from(randomBytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    // Create password with mixed character types
    const specialChars = '!@#$%^&*';
    const password =
      base64.slice(0, 8).toUpperCase() +
      specialChars[randomBytes[0] % specialChars.length] +
      base64.slice(8, 16).toLowerCase() +
      specialChars[randomBytes[1] % specialChars.length] +
      base64.slice(16, 24);

    return password;
  }

  private async saveResetRequest(request: PasswordResetRequest): Promise<void> {
    const requests = await this.getResetRequests();
    requests.push(request);
    await AsyncStorage.setItem(this.RESET_REQUESTS_KEY, JSON.stringify(requests));
  }

  private async getResetRequests(): Promise<PasswordResetRequest[]> {
    try {
      const data = await AsyncStorage.getItem(this.RESET_REQUESTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private checkPasswordStrength(password: string): { score: number; feedback: string } {
    let score = 0;
    let feedback = '';
    
    if (password.length < 8) {
      return { score: 0, feedback: 'Password must be at least 8 characters long' };
    }
    
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    
    if (score < 3) {
      feedback = 'Password is too weak. Use uppercase, lowercase, numbers, and symbols.';
    } else if (score === 3) {
      feedback = 'Password is acceptable';
    } else {
      feedback = 'Password is strong';
    }
    
    return { score, feedback };
  }

  private async generateUserId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `user-${timestamp}-${randomPart}`;
  }

  private async generateResetToken(): Promise<string> {
    const bytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async generate2FASecret(): Promise<string> {
    const bytes = await Crypto.getRandomBytesAsync(20);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // Email functions (placeholders - implement with actual email service)
  private async sendVerificationEmail(email: string, name: string): Promise<void> {
    console.log(`Sending verification email to ${email}`);
    // In production, use SendGrid, AWS SES, etc.
  }

  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetLink = `https://roomsnap.app/reset-password?token=${token}`;
    console.log(`Sending password reset email to ${email} with link: ${resetLink}`);
  }

  private async sendPasswordChangedEmail(email: string): Promise<void> {
    console.log(`Sending password changed notification to ${email}`);
  }

  private async sendAdminPasswordResetEmail(email: string, tempPassword: string): Promise<void> {
    console.log(`Admin reset password for ${email}. Temporary password: ${tempPassword}`);
  }

  // Public getters
  get isAuthenticated(): boolean {
    return this.currentAuth.isAuthenticated;
  }

  get currentUser(): User | null {
    return this.currentAuth.user;
  }

  get authToken(): string | null {
    return this.currentAuth.token;
  }

  get isAdmin(): boolean {
    return this.currentAuth.user?.role === 'admin';
  }

  get isSupport(): boolean {
    return this.currentAuth.user?.role === 'support' || this.isAdmin;
  }
}