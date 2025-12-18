import Constants from 'expo-constants';
import { SecurityService } from './SecurityService';

interface AppConfig {
  stripe: {
    publishableKey: string;
    merchantId: string;
    urlScheme: string;
  };
  api: {
    baseUrl: string;
    apiKey: string;
    timeout: number;
  };
  push: {
    expoPushToken: string;
    fcmServerKey: string;
    apnsKeyId: string;
    apnsTeamId: string;
  };
  analytics: {
    googleAnalyticsId: string;
    mixpanelToken: string;
    amplitudeApiKey: string;
  };
  security: {
    jwtSecret: string;
    encryptionKey: string;
  };
  environment: {
    isDevelopment: boolean;
    isProduction: boolean;
    isStaging: boolean;
    appEnv: string;
  };
}

export class ConfigService {
  private static instance: ConfigService;
  private config: AppConfig;
  private securityService = SecurityService.getInstance();

  private constructor() {
    this.config = this.loadConfiguration();
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  private loadConfiguration(): AppConfig {
    const extra = Constants.expoConfig?.extra || {};
    const env = process.env.NODE_ENV || 'development';

    return {
      stripe: {
        publishableKey: this.getEnvVar('STRIPE_PUBLISHABLE_KEY', extra.stripePublishableKey, 'pk_test_placeholder'),
        merchantId: this.getEnvVar('STRIPE_MERCHANT_ID', extra.stripeMerchantId, 'merchant.com.roomsnap.app'),
        urlScheme: extra.urlScheme || 'roomsnap'
      },
      api: {
        baseUrl: this.getEnvVar('API_BASE_URL', extra.apiBaseUrl, 'https://api.roomsnap.app/v1'),
        apiKey: this.getEnvVar('API_KEY', extra.apiKey, ''),
        timeout: 30000
      },
      push: {
        expoPushToken: this.getEnvVar('EXPO_PUSH_TOKEN', extra.expoPushToken, ''),
        fcmServerKey: this.getEnvVar('FCM_SERVER_KEY', extra.fcmServerKey, ''),
        apnsKeyId: this.getEnvVar('APNS_KEY_ID', extra.apnsKeyId, ''),
        apnsTeamId: this.getEnvVar('APNS_TEAM_ID', extra.apnsTeamId, '')
      },
      analytics: {
        googleAnalyticsId: this.getEnvVar('GOOGLE_ANALYTICS_ID', extra.googleAnalyticsId, ''),
        mixpanelToken: this.getEnvVar('MIXPANEL_TOKEN', extra.mixpanelToken, ''),
        amplitudeApiKey: this.getEnvVar('AMPLITUDE_API_KEY', extra.amplitudeApiKey, '')
      },
      security: {
        jwtSecret: this.getEnvVar('JWT_SECRET', extra.jwtSecret, 'default_jwt_secret_change_in_production'),
        encryptionKey: this.getEnvVar('ENCRYPTION_KEY', extra.encryptionKey, 'default_encryption_key_change_in_production')
      },
      environment: {
        isDevelopment: env === 'development',
        isProduction: env === 'production',
        isStaging: env === 'staging',
        appEnv: env
      }
    };
  }

  private getEnvVar(key: string, fallback?: string, defaultValue: string = ''): string {
    // Priority: Environment variable > Expo config > Default
    return process.env[key] || fallback || defaultValue;
  }

  // Public getters
  get stripe() {
    return this.config.stripe;
  }

  get api() {
    return this.config.api;
  }

  get push() {
    return this.config.push;
  }

  get analytics() {
    return this.config.analytics;
  }

  get security() {
    return this.config.security;
  }

  get environment() {
    return this.config.environment;
  }

  get isDevelopment() {
    return this.config.environment.isDevelopment;
  }

  get isProduction() {
    return this.config.environment.isProduction;
  }

  // Secure configuration updates
  async updateStripeKeys(publishableKey: string, merchantId?: string): Promise<void> {
    try {
      this.config.stripe.publishableKey = publishableKey;
      if (merchantId) {
        this.config.stripe.merchantId = merchantId;
      }

      // Securely store the updated configuration
      await this.securityService.secureStore(
        'stripe_config',
        JSON.stringify(this.config.stripe)
      );

      await this.securityService.auditLog('stripe_config_updated', true);
    } catch (error) {
      console.error('Failed to update Stripe configuration:', error);
      throw error;
    }
  }

  async updateApiConfiguration(baseUrl?: string, apiKey?: string): Promise<void> {
    try {
      if (baseUrl) {
        this.config.api.baseUrl = baseUrl;
      }
      if (apiKey) {
        this.config.api.apiKey = apiKey;
      }

      // Securely store the updated configuration
      await this.securityService.secureStore(
        'api_config',
        JSON.stringify(this.config.api)
      );

      await this.securityService.auditLog('api_config_updated', true);
    } catch (error) {
      console.error('Failed to update API configuration:', error);
      throw error;
    }
  }

  // Validate configuration
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required Stripe configuration
    if (!this.config.stripe.publishableKey || this.config.stripe.publishableKey === 'pk_test_placeholder') {
      errors.push('Stripe publishable key not configured');
    }

    // Check API configuration
    if (!this.config.api.baseUrl) {
      errors.push('API base URL not configured');
    }

    // Check security configuration in production
    if (this.isProduction) {
      if (this.config.security.jwtSecret === 'default_jwt_secret_change_in_production') {
        errors.push('JWT secret must be changed for production');
      }
      if (this.config.security.encryptionKey === 'default_encryption_key_change_in_production') {
        errors.push('Encryption key must be changed for production');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Get configuration summary (safe for logging)
  getConfigurationSummary(): any {
    return {
      stripe: {
        publishableKey: this.maskKey(this.config.stripe.publishableKey),
        merchantId: this.config.stripe.merchantId
      },
      api: {
        baseUrl: this.config.api.baseUrl,
        hasApiKey: !!this.config.api.apiKey
      },
      push: {
        hasExpoPushToken: !!this.config.push.expoPushToken,
        hasFcmKey: !!this.config.push.fcmServerKey,
        hasApnsConfig: !!this.config.push.apnsKeyId && !!this.config.push.apnsTeamId
      },
      analytics: {
        hasGoogleAnalytics: !!this.config.analytics.googleAnalyticsId,
        hasMixpanel: !!this.config.analytics.mixpanelToken,
        hasAmplitude: !!this.config.analytics.amplitudeApiKey
      },
      environment: this.config.environment
    };
  }

  private maskKey(key: string): string {
    if (!key || key.length < 8) return '***';
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
  }
}