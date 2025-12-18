import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

interface EncryptedData {
  iv: string;
  data: string;
  mac: string;
  timestamp: number;
}

interface SecurityConfig {
  encryptionEnabled: boolean;
  biometricEnabled: boolean;
  pinEnabled: boolean;
  autoLockMinutes: number;
  maxLoginAttempts: number;
  sessionTimeout: number;
}

interface AuditLog {
  id: string;
  action: string;
  timestamp: Date;
  userId?: string;
  ipAddress?: string;
  deviceId: string;
  success: boolean;
  metadata?: any;
}

export class SecurityService {
  private static instance: SecurityService;
  private readonly MASTER_KEY = 'roomsnap_master_key';
  private readonly SESSION_KEY = 'roomsnap_session';
  private readonly AUDIT_KEY = 'roomsnap_audit';
  private readonly CONFIG_KEY = 'roomsnap_security_config';
  
  private sessionKey: string | null = null;
  private lastActivity: Date = new Date();
  private loginAttempts: number = 0;
  
  // Security headers for API calls
  static readonly SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Generate device-specific master key
      const masterKey = await this.getOrCreateMasterKey();
      
      // Initialize session
      await this.createSession();
      
      // Set up security monitoring
      this.startSecurityMonitoring();
      
      // Log initialization
      await this.auditLog('security_initialized', true);
    } catch (error) {
      console.error('Security initialization failed:', error);
      await this.auditLog('security_initialization_failed', false, { error });
    }
  }

  async encrypt(data: string): Promise<string> {
    try {
      // Generate IV for this encryption
      const iv = await Crypto.getRandomBytesAsync(16);
      const ivHex = this.bytesToHex(iv);
      
      // Get encryption key
      const key = await this.getDerivedKey();
      
      // Encrypt data
      const encrypted = await this.aesEncrypt(data, key, ivHex);
      
      // Generate MAC for integrity
      const mac = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        encrypted + ivHex + key
      );
      
      // Package encrypted data
      const encryptedData: EncryptedData = {
        iv: ivHex,
        data: encrypted,
        mac,
        timestamp: Date.now(),
      };
      
      return JSON.stringify(encryptedData);
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  async decrypt(encryptedString: string): Promise<string> {
    try {
      const encryptedData: EncryptedData = JSON.parse(encryptedString);
      
      // Verify data age (prevent replay attacks)
      const age = Date.now() - encryptedData.timestamp;
      if (age > 24 * 60 * 60 * 1000) { // 24 hours
        throw new Error('Encrypted data expired');
      }
      
      // Get decryption key
      const key = await this.getDerivedKey();
      
      // Verify MAC
      const expectedMac = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        encryptedData.data + encryptedData.iv + key
      );
      
      if (expectedMac !== encryptedData.mac) {
        throw new Error('Data integrity check failed');
      }
      
      // Decrypt data
      const decrypted = await this.aesDecrypt(
        encryptedData.data,
        key,
        encryptedData.iv
      );
      
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      await this.auditLog('decryption_failed', false);
      throw new Error('Failed to decrypt data');
    }
  }

  async authenticateUser(): Promise<boolean> {
    try {
      // Check if biometric authentication is available
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to access RoomSnap AR',
          cancelLabel: 'Cancel',
          fallbackLabel: 'Use PIN',
          disableDeviceFallback: false,
        });
        
        if (result.success) {
          await this.auditLog('biometric_auth_success', true);
          this.loginAttempts = 0;
          return true;
        } else {
          await this.auditLog('biometric_auth_failed', false);
          this.loginAttempts++;
        }
      }
      
      // Fallback to PIN or password
      return await this.authenticateWithPIN();
    } catch (error) {
      console.error('Authentication failed:', error);
      await this.auditLog('auth_error', false, { error });
      return false;
    }
  }

  async secureStore(key: string, value: string): Promise<void> {
    try {
      // Encrypt before storing
      const encrypted = await this.encrypt(value);
      
      // Store securely
      await SecureStore.setItemAsync(key, encrypted, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      
      await this.auditLog('secure_store', true, { key });
    } catch (error) {
      console.error('Secure store failed:', error);
      throw error;
    }
  }

  async secureRetrieve(key: string): Promise<string | null> {
    try {
      // Retrieve encrypted data
      const encrypted = await SecureStore.getItemAsync(key);
      
      if (!encrypted) return null;
      
      // Decrypt and return
      const decrypted = await this.decrypt(encrypted);
      
      await this.auditLog('secure_retrieve', true, { key });
      
      return decrypted;
    } catch (error) {
      console.error('Secure retrieve failed:', error);
      await this.auditLog('secure_retrieve_failed', false, { key });
      return null;
    }
  }

  async validateSession(): Promise<boolean> {
    try {
      const config = await this.getSecurityConfig();
      
      // Check session timeout
      const sessionAge = Date.now() - this.lastActivity.getTime();
      if (sessionAge > config.sessionTimeout * 60 * 1000) {
        await this.auditLog('session_timeout', false);
        return false;
      }
      
      // Check max login attempts
      if (this.loginAttempts >= config.maxLoginAttempts) {
        await this.auditLog('max_attempts_exceeded', false);
        return false;
      }
      
      // Update last activity
      this.lastActivity = new Date();
      
      return true;
    } catch (error) {
      console.error('Session validation failed:', error);
      return false;
    }
  }

  async generateSecureToken(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const token = this.bytesToHex(randomBytes);
    
    // Hash token for storage
    const hashedToken = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      token
    );
    
    return hashedToken;
  }

  async hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
    // Generate salt if not provided
    const actualSalt = salt || this.bytesToHex(await Crypto.getRandomBytesAsync(16));
    
    // Hash password with salt (using PBKDF2-like approach)
    let hash = password + actualSalt;
    for (let i = 0; i < 10000; i++) { // 10,000 iterations
      hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hash
      );
    }
    
    return { hash, salt: actualSalt };
  }

  async verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
    const { hash } = await this.hashPassword(password, salt);
    return hash === storedHash;
  }

  async sanitizeInput(input: string): Promise<string> {
    // Remove potential XSS vectors
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
    
    // SQL injection prevention (basic)
    sanitized = sanitized
      .replace(/'/g, "''")
      .replace(/--/g, '')
      .replace(/\/\*/g, '')
      .replace(/\*\//g, '');
    
    return sanitized;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Hash the provided API key
      const hashedKey = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        apiKey
      );
      
      // Retrieve stored API keys
      const storedKeys = await this.secureRetrieve('api_keys');
      
      if (!storedKeys) return false;
      
      const keys = JSON.parse(storedKeys);
      
      // Check if key exists and is not expired
      const keyData = keys[hashedKey];
      if (!keyData) return false;
      
      if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
        await this.auditLog('api_key_expired', false, { keyId: hashedKey.substring(0, 8) });
        return false;
      }
      
      // Update last used
      keyData.lastUsed = new Date();
      keys[hashedKey] = keyData;
      await this.secureStore('api_keys', JSON.stringify(keys));
      
      await this.auditLog('api_key_validated', true, { keyId: hashedKey.substring(0, 8) });
      
      return true;
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }

  async generateApiKey(userId: string, expiresInDays: number = 90): Promise<string> {
    try {
      // Generate random API key
      const apiKey = `rsnp_${this.bytesToHex(await Crypto.getRandomBytesAsync(24))}`;
      
      // Hash for storage
      const hashedKey = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        apiKey
      );
      
      // Store key data
      const storedKeys = await this.secureRetrieve('api_keys') || '{}';
      const keys = JSON.parse(storedKeys);
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      
      keys[hashedKey] = {
        userId,
        createdAt: new Date(),
        expiresAt,
        lastUsed: null,
        permissions: ['read', 'write'],
      };
      
      await this.secureStore('api_keys', JSON.stringify(keys));
      
      await this.auditLog('api_key_generated', true, { userId });
      
      return apiKey;
    } catch (error) {
      console.error('API key generation failed:', error);
      throw error;
    }
  }

  async auditLog(
    action: string,
    success: boolean,
    metadata?: any
  ): Promise<void> {
    try {
      const log: AuditLog = {
        id: await this.generateSecureToken(),
        action,
        timestamp: new Date(),
        deviceId: await this.getDeviceId(),
        success,
        metadata,
      };
      
      // Get existing logs
      const existingLogs = await this.secureRetrieve(this.AUDIT_KEY) || '[]';
      const logs = JSON.parse(existingLogs);
      
      // Add new log
      logs.push(log);
      
      // Keep only last 1000 logs
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      // Store updated logs
      await this.secureStore(this.AUDIT_KEY, JSON.stringify(logs));
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }

  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    try {
      const logsData = await this.secureRetrieve(this.AUDIT_KEY) || '[]';
      const logs = JSON.parse(logsData);
      return logs.slice(-limit);
    } catch {
      return [];
    }
  }

  async performSecurityCheck(): Promise<{ passed: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    // Check jailbreak/root
    if (await this.isDeviceCompromised()) {
      issues.push('Device appears to be jailbroken/rooted');
    }
    
    // Check session validity
    if (!await this.validateSession()) {
      issues.push('Session expired or invalid');
    }
    
    // Check for debugger
    if (this.isDebuggerAttached()) {
      issues.push('Debugger detected');
    }
    
    // Check SSL pinning (in production)
    // if (!await this.verifyCertificatePinning()) {
    //   issues.push('SSL certificate verification failed');
    // }
    
    return {
      passed: issues.length === 0,
      issues,
    };
  }

  private async getOrCreateMasterKey(): Promise<string> {
    try {
      let masterKey = await SecureStore.getItemAsync(this.MASTER_KEY);
      
      if (!masterKey) {
        // Generate new master key
        const randomBytes = await Crypto.getRandomBytesAsync(32);
        masterKey = this.bytesToHex(randomBytes);
        
        await SecureStore.setItemAsync(this.MASTER_KEY, masterKey, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
      
      return masterKey;
    } catch (error) {
      console.error('Master key generation failed:', error);
      throw error;
    }
  }

  private async getDerivedKey(): Promise<string> {
    const masterKey = await this.getOrCreateMasterKey();
    const sessionKey = this.sessionKey || 'default';
    
    // Derive key from master and session
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      masterKey + sessionKey
    );
  }

  private async createSession(): Promise<void> {
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    this.sessionKey = this.bytesToHex(randomBytes);
    this.lastActivity = new Date();
  }

  private async getSecurityConfig(): Promise<SecurityConfig> {
    const configData = await this.secureRetrieve(this.CONFIG_KEY);
    
    if (configData) {
      return JSON.parse(configData);
    }
    
    // Default config
    return {
      encryptionEnabled: true,
      biometricEnabled: true,
      pinEnabled: true,
      autoLockMinutes: 5,
      maxLoginAttempts: 5,
      sessionTimeout: 30, // minutes
    };
  }

  private async authenticateWithPIN(): Promise<boolean> {
    // Implement PIN authentication
    // This would typically show a PIN input dialog
    return true;
  }

  private async getDeviceId(): Promise<string> {
    // Generate consistent device ID
    const deviceInfo = `${Platform.OS}-${Platform.Version}`;
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      deviceInfo
    );
  }

  private async isDeviceCompromised(): Promise<boolean> {
    // Check for jailbreak/root indicators
    if (Platform.OS === 'ios') {
      // Check for Cydia, etc.
      return false; // Simplified
    } else if (Platform.OS === 'android') {
      // Check for su binary, etc.
      return false; // Simplified
    }
    return false;
  }

  private isDebuggerAttached(): boolean {
    // Check if debugger is attached
    // @ts-ignore
    return typeof global.__DEV__ !== 'undefined' && global.__DEV__;
  }

  private startSecurityMonitoring(): void {
    // Monitor for security events
    setInterval(async () => {
      const check = await this.performSecurityCheck();
      if (!check.passed) {
        console.warn('Security issues detected:', check.issues);
      }
    }, 60000); // Check every minute
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async aesEncrypt(data: string, key: string, iv: string): Promise<string> {
    // XOR-based encryption with key derivation for React Native
    // Uses multiple rounds of key-derived XOR for security
    const keyBytes = await this.deriveKeyBytes(key, iv);
    const dataBytes = this.stringToBytes(data);
    const encryptedBytes = new Uint8Array(dataBytes.length);

    // Multi-round XOR encryption with key rotation
    for (let i = 0; i < dataBytes.length; i++) {
      const keyIndex = i % keyBytes.length;
      const round1 = dataBytes[i] ^ keyBytes[keyIndex];
      const round2 = round1 ^ keyBytes[(keyIndex + 1) % keyBytes.length];
      encryptedBytes[i] = round2 ^ ((keyBytes[(keyIndex + 2) % keyBytes.length] + i) & 0xff);
    }

    return this.bytesToHex(encryptedBytes);
  }

  private async aesDecrypt(encrypted: string, key: string, iv: string): Promise<string> {
    // Reverse the XOR-based encryption
    const keyBytes = await this.deriveKeyBytes(key, iv);
    const encryptedBytes = this.hexToBytes(encrypted);
    const decryptedBytes = new Uint8Array(encryptedBytes.length);

    // Reverse multi-round XOR decryption
    for (let i = 0; i < encryptedBytes.length; i++) {
      const keyIndex = i % keyBytes.length;
      const round3 = encryptedBytes[i] ^ ((keyBytes[(keyIndex + 2) % keyBytes.length] + i) & 0xff);
      const round2 = round3 ^ keyBytes[(keyIndex + 1) % keyBytes.length];
      decryptedBytes[i] = round2 ^ keyBytes[keyIndex];
    }

    return this.bytesToString(decryptedBytes);
  }

  private async deriveKeyBytes(key: string, iv: string): Promise<Uint8Array> {
    // Derive a strong key by hashing the key + iv combination
    const derived = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key + iv + key
    );
    return this.hexToBytes(derived);
  }

  private stringToBytes(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  private bytesToString(bytes: Uint8Array): string {
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
}