import { AuthService } from '../services/AuthService';
import { SecurityService } from '../services/SecurityService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-crypto');
jest.mock('expo-mail-composer');
jest.mock('../services/SecurityService');

describe('AuthService', () => {
  let authService: AuthService;
  let securityService: jest.Mocked<SecurityService>;

  beforeEach(() => {
    authService = AuthService.getInstance();
    securityService = SecurityService.getInstance() as jest.Mocked<SecurityService>;
    jest.clearAllMocks();
  });

  describe('User Registration', () => {
    test('should register new user with valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'Test@123456';
      const name = 'Test User';

      securityService.hashPassword = jest.fn().mockResolvedValue({
        hash: 'hashed_password',
        salt: 'salt_value'
      });

      const result = await authService.register(email, password, name);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Registration successful');
      expect(securityService.hashPassword).toHaveBeenCalledWith(password);
    });

    test('should reject registration with weak password', async () => {
      const email = 'test@example.com';
      const password = 'weak';
      const name = 'Test User';

      const result = await authService.register(email, password, name);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Password');
    });

    test('should reject registration with invalid email', async () => {
      const email = 'invalid-email';
      const password = 'Test@123456';
      const name = 'Test User';

      const result = await authService.register(email, password, name);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid email');
    });

    test('should prevent duplicate registrations', async () => {
      const email = 'existing@example.com';
      const password = 'Test@123456';
      const name = 'Test User';

      // First registration
      await authService.register(email, password, name);

      // Attempt duplicate registration
      const result = await authService.register(email, password, name);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already registered');
    });
  });

  describe('User Login', () => {
    test('should login with valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'Test@123456';

      // Setup user
      await authService.register(email, password, 'Test User');

      securityService.verifyPassword = jest.fn().mockResolvedValue(true);
      securityService.generateSecureToken = jest.fn()
        .mockResolvedValueOnce('access_token')
        .mockResolvedValueOnce('refresh_token');

      const result = await authService.login(email, password);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(authService.isAuthenticated).toBe(true);
    });

    test('should fail login with wrong password', async () => {
      const email = 'test@example.com';
      const password = 'Test@123456';
      const wrongPassword = 'Wrong@123456';

      await authService.register(email, password, 'Test User');

      securityService.verifyPassword = jest.fn().mockResolvedValue(false);

      const result = await authService.login(email, wrongPassword);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid password');
    });

    test('should lock account after max failed attempts', async () => {
      const email = 'test@example.com';
      const password = 'Test@123456';
      const wrongPassword = 'Wrong@123456';

      await authService.register(email, password, 'Test User');

      securityService.verifyPassword = jest.fn().mockResolvedValue(false);

      // Attempt login multiple times
      for (let i = 0; i < 5; i++) {
        await authService.login(email, wrongPassword);
      }

      const result = await authService.login(email, wrongPassword);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Account locked');
    });

    test('should require 2FA code when enabled', async () => {
      const email = 'test@example.com';
      const password = 'Test@123456';

      await authService.register(email, password, 'Test User');
      
      // Enable 2FA for user
      const user = authService.currentUser;
      if (user) {
        await authService.enable2FA(user.id);
      }

      securityService.verifyPassword = jest.fn().mockResolvedValue(true);

      const result = await authService.login(email, password);

      expect(result.success).toBe(false);
      expect(result.message).toContain('2FA');
    });
  });

  describe('Password Reset', () => {
    test('should initiate password reset for existing user', async () => {
      const email = 'test@example.com';

      await authService.register(email, 'Test@123456', 'Test User');

      const result = await authService.requestPasswordReset(email);

      expect(result.success).toBe(true);
      expect(result.message).toContain('reset instructions');
    });

    test('should not reveal if user exists', async () => {
      const email = 'nonexistent@example.com';

      const result = await authService.requestPasswordReset(email);

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists');
    });

    test('should reset password with valid token', async () => {
      const email = 'test@example.com';
      const newPassword = 'NewTest@123456';

      await authService.register(email, 'Test@123456', 'Test User');
      
      // Mock reset token generation
      const mockToken = 'reset_token_123';
      jest.spyOn(authService as any, 'generateResetToken')
        .mockResolvedValue(mockToken);

      await authService.requestPasswordReset(email);

      securityService.hashPassword = jest.fn().mockResolvedValue({
        hash: 'new_hashed_password',
        salt: 'new_salt'
      });

      const result = await authService.resetPassword(mockToken, newPassword);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Password reset successful');
    });

    test('should reject expired reset token', async () => {
      const expiredToken = 'expired_token';
      const newPassword = 'NewTest@123456';

      const result = await authService.resetPassword(expiredToken, newPassword);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid or expired');
    });
  });

  describe('Admin Functions', () => {
    test('should allow admin to reset user password', async () => {
      // Create admin
      const admin = await authService.register('admin@example.com', 'Admin@123456', 'Admin');
      
      // Create regular user
      const user = await authService.register('user@example.com', 'User@123456', 'User');

      // Mock admin role
      if (admin.user) {
        admin.user.role = 'admin';
      }

      const result = await authService.adminResetUserPassword(
        admin.user!.id,
        user.user!.id
      );

      expect(result.success).toBe(true);
      expect(result.temporaryPassword).toBeDefined();
    });

    test('should prevent non-admin from resetting passwords', async () => {
      const user1 = await authService.register('user1@example.com', 'User@123456', 'User1');
      const user2 = await authService.register('user2@example.com', 'User@123456', 'User2');

      const result = await authService.adminResetUserPassword(
        user1.user!.id,
        user2.user!.id
      );

      expect(result.success).toBe(false);
    });

    test('should allow admin to unlock account', async () => {
      const admin = await authService.register('admin@example.com', 'Admin@123456', 'Admin');
      const user = await authService.register('user@example.com', 'User@123456', 'User');

      if (admin.user) {
        admin.user.role = 'admin';
      }

      // Lock user account
      if (user.user) {
        user.user.lockedUntil = new Date(Date.now() + 3600000);
      }

      const result = await authService.adminUnlockAccount(
        admin.user!.id,
        user.user!.id
      );

      expect(result).toBe(true);
    });

    test('should allow admin to disable account', async () => {
      const admin = await authService.register('admin@example.com', 'Admin@123456', 'Admin');
      const user = await authService.register('user@example.com', 'User@123456', 'User');

      if (admin.user) {
        admin.user.role = 'admin';
      }

      const result = await authService.adminDisableAccount(
        admin.user!.id,
        user.user!.id,
        'Violation of terms'
      );

      expect(result).toBe(true);
    });
  });

  describe('2FA Management', () => {
    test('should enable 2FA for user', async () => {
      const user = await authService.register('user@example.com', 'User@123456', 'User');

      const result = await authService.enable2FA(user.user!.id);

      expect(result.success).toBe(true);
      expect(result.secret).toBeDefined();
      expect(result.qrCode).toContain('otpauth://totp');
    });

    test('should verify valid 2FA code', async () => {
      const user = await authService.register('user@example.com', 'User@123456', 'User');
      
      await authService.enable2FA(user.user!.id);

      // Mock valid 2FA code
      const isValid = await authService.verify2FACode(user.user!.id, '123456');

      expect(isValid).toBe(true);
    });
  });

  describe('Session Management', () => {
    test('should maintain session after login', async () => {
      const email = 'test@example.com';
      const password = 'Test@123456';

      await authService.register(email, password, 'Test User');

      securityService.verifyPassword = jest.fn().mockResolvedValue(true);
      securityService.generateSecureToken = jest.fn()
        .mockResolvedValue('token');

      await authService.login(email, password);

      expect(authService.isAuthenticated).toBe(true);
      expect(authService.currentUser).toBeDefined();
      expect(authService.authToken).toBeDefined();
    });

    test('should clear session on logout', async () => {
      const email = 'test@example.com';
      const password = 'Test@123456';

      await authService.register(email, password, 'Test User');
      await authService.login(email, password);
      
      await authService.logout();

      expect(authService.isAuthenticated).toBe(false);
      expect(authService.currentUser).toBeNull();
      expect(authService.authToken).toBeNull();
    });
  });

  describe('Password Strength Validation', () => {
    test('should accept strong passwords', () => {
      const strongPasswords = [
        'Test@123456',
        'MyP@ssw0rd!',
        'Secure#Pass123',
        'C0mpl3x!Password'
      ];

      strongPasswords.forEach(password => {
        const result = (authService as any).checkPasswordStrength(password);
        expect(result.score).toBeGreaterThanOrEqual(3);
      });
    });

    test('should reject weak passwords', () => {
      const weakPasswords = [
        'password',
        '12345678',
        'Password',
        'test123'
      ];

      weakPasswords.forEach(password => {
        const result = (authService as any).checkPasswordStrength(password);
        expect(result.score).toBeLessThan(3);
      });
    });
  });
});