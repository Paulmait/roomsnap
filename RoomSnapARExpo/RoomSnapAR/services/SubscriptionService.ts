import * as InAppPurchases from 'expo-in-app-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  priceMonthly: number;
  features: string[];
  popularTag?: boolean;
  savePercentage?: number;
}

export interface SubscriptionStatus {
  isActive: boolean;
  plan: string;
  expiresAt: Date | null;
  autoRenew: boolean;
  cancellationDate: Date | null;
  trialEndsAt: Date | null;
  paymentMethod?: string;
}

export interface ComplianceData {
  gdprConsent: boolean;
  ccpaOptOut: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  marketingOptIn: boolean;
  dataRetentionDays: number;
  consentDate: Date;
  ipAddress?: string;
  country?: string;
}

export class SubscriptionService {
  private static instance: SubscriptionService;
  private readonly SUBSCRIPTION_KEY = '@roomsnap_subscription';
  private readonly COMPLIANCE_KEY = '@roomsnap_compliance';
  private readonly CANCELLATION_KEY = '@roomsnap_cancellation';
  
  // Subscription Plans
  static readonly PLANS: SubscriptionPlan[] = [
    {
      id: 'free',
      name: 'Free',
      price: '$0/month',
      priceMonthly: 0,
      features: [
        '5 measurements per month',
        'Basic AR features',
        'Local storage only',
        'Export to image',
      ],
    },
    {
      id: 'pro_monthly',
      name: 'Pro Monthly',
      price: '$9.99/month',
      priceMonthly: 9.99,
      features: [
        'Unlimited measurements',
        'AI-powered detection',
        'Voice commands',
        'PDF exports',
        'Cloud backup',
        'Priority support',
      ],
    },
    {
      id: 'pro_yearly',
      name: 'Pro Yearly',
      price: '$99/year',
      priceMonthly: 8.25,
      features: [
        'Everything in Pro Monthly',
        'Save 17%',
        'Advanced analytics',
        'API access',
        'White-label options',
        'Dedicated support',
      ],
      popularTag: true,
      savePercentage: 17,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      priceMonthly: 0,
      features: [
        'Everything in Pro',
        'Custom integrations',
        'SLA guarantee',
        'On-premise deployment',
        'Training & onboarding',
        'Dedicated account manager',
      ],
    },
  ];

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Initialize in-app purchases
      await InAppPurchases.connectAsync();
      
      // Set up listeners
      InAppPurchases.setPurchaseListener(({ responseCode, results, errorCode }) => {
        if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {
          results.forEach(purchase => {
            if (!purchase.acknowledged) {
              this.handleSuccessfulPurchase(purchase);
            }
          });
        }
      });
      
      // Get available products
      const products = await InAppPurchases.getProductsAsync([
        'pro_monthly',
        'pro_yearly',
      ]);
      
      console.log('Available products:', products);
    } catch (error) {
      console.error('Failed to initialize subscriptions:', error);
    }
  }

  async subscribe(planId: string, complianceData: ComplianceData): Promise<boolean> {
    try {
      // Validate compliance first
      if (!this.validateCompliance(complianceData)) {
        throw new Error('Compliance requirements not met');
      }
      
      // Save compliance data
      await this.saveComplianceData(complianceData);
      
      // Process subscription based on plan
      if (planId === 'free') {
        return await this.activateFreePlan();
      }
      
      // Purchase subscription
      const results = await InAppPurchases.purchaseItemAsync(planId);
      
      if (results.responseCode === InAppPurchases.IAPResponseCode.OK) {
        await this.saveSubscription({
          isActive: true,
          plan: planId,
          expiresAt: this.calculateExpiryDate(planId),
          autoRenew: true,
          cancellationDate: null,
          trialEndsAt: this.calculateTrialEnd(),
          paymentMethod: 'app_store',
        });
        
        // Log for analytics (privacy-compliant)
        await this.logSubscriptionEvent('subscription_started', planId);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Subscription failed:', error);
      await this.logSubscriptionEvent('subscription_failed', planId);
      return false;
    }
  }

  async cancelSubscription(reason?: string): Promise<boolean> {
    try {
      const subscription = await this.getSubscriptionStatus();
      
      if (!subscription.isActive) {
        return false;
      }
      
      // Record cancellation with timestamp (for compliance)
      const cancellationData = {
        date: new Date(),
        reason: reason || 'user_initiated',
        plan: subscription.plan,
        wasAutoRenew: subscription.autoRenew,
        remainingDays: this.calculateRemainingDays(subscription.expiresAt),
      };
      
      await AsyncStorage.setItem(
        this.CANCELLATION_KEY,
        JSON.stringify(cancellationData)
      );
      
      // Update subscription status
      await this.saveSubscription({
        ...subscription,
        autoRenew: false,
        cancellationDate: new Date(),
      });
      
      // Platform-specific cancellation
      if (Platform.OS === 'ios') {
        // iOS users must cancel through App Store
        return true; // Return true but show instructions
      } else if (Platform.OS === 'android') {
        // Android users must cancel through Play Store
        return true; // Return true but show instructions
      }
      
      // Log cancellation (privacy-compliant)
      await this.logSubscriptionEvent('subscription_cancelled', subscription.plan);
      
      return true;
    } catch (error) {
      console.error('Cancellation failed:', error);
      return false;
    }
  }

  async restoreSubscription(): Promise<boolean> {
    try {
      const history = await InAppPurchases.getPurchaseHistoryAsync();
      
      if (history.results && history.results.length > 0) {
        // Find most recent valid subscription
        const validPurchase = history.results.find(purchase => 
          this.isSubscriptionValid(purchase)
        );
        
        if (validPurchase) {
          await this.handleSuccessfulPurchase(validPurchase);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Restore failed:', error);
      return false;
    }
  }

  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    try {
      const data = await AsyncStorage.getItem(this.SUBSCRIPTION_KEY);
      
      if (data) {
        const subscription = JSON.parse(data);
        
        // Check if subscription is still valid
        if (subscription.expiresAt) {
          const expiryDate = new Date(subscription.expiresAt);
          if (expiryDate < new Date()) {
            // Subscription expired
            return {
              isActive: false,
              plan: 'free',
              expiresAt: null,
              autoRenew: false,
              cancellationDate: null,
              trialEndsAt: null,
            };
          }
        }
        
        return subscription;
      }
      
      // Default to free plan
      return {
        isActive: false,
        plan: 'free',
        expiresAt: null,
        autoRenew: false,
        cancellationDate: null,
        trialEndsAt: null,
      };
    } catch (error) {
      console.error('Failed to get subscription status:', error);
      return {
        isActive: false,
        plan: 'free',
        expiresAt: null,
        autoRenew: false,
        cancellationDate: null,
        trialEndsAt: null,
      };
    }
  }

  async validateCompliance(data: ComplianceData): boolean {
    // GDPR compliance
    if (this.isEuropeanUser(data.country)) {
      if (!data.gdprConsent || !data.privacyAccepted) {
        return false;
      }
    }
    
    // CCPA compliance (California)
    if (this.isCaliforniaUser(data.country)) {
      // User must be able to opt-out
      // No validation needed, just record preference
    }
    
    // Terms must always be accepted
    if (!data.termsAccepted) {
      return false;
    }
    
    return true;
  }

  async saveComplianceData(data: ComplianceData): Promise<void> {
    const complianceRecord = {
      ...data,
      timestamp: new Date(),
      appVersion: '1.0.0',
      platform: Platform.OS,
    };
    
    await AsyncStorage.setItem(
      this.COMPLIANCE_KEY,
      JSON.stringify(complianceRecord)
    );
  }

  async getComplianceData(): Promise<ComplianceData | null> {
    try {
      const data = await AsyncStorage.getItem(this.COMPLIANCE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async deleteUserData(): Promise<void> {
    // GDPR/CCPA right to deletion
    await AsyncStorage.multiRemove([
      this.SUBSCRIPTION_KEY,
      this.COMPLIANCE_KEY,
      this.CANCELLATION_KEY,
      '@roomsnap_sessions',
      '@roomsnap_settings',
    ]);
    
    // Log deletion for compliance
    console.log('User data deleted at:', new Date());
  }

  async exportUserData(): Promise<string> {
    // GDPR right to data portability
    const subscription = await this.getSubscriptionStatus();
    const compliance = await this.getComplianceData();
    const cancellation = await AsyncStorage.getItem(this.CANCELLATION_KEY);
    
    const userData = {
      subscription,
      compliance,
      cancellation: cancellation ? JSON.parse(cancellation) : null,
      exportDate: new Date(),
    };
    
    return JSON.stringify(userData, null, 2);
  }

  private async saveSubscription(status: SubscriptionStatus): Promise<void> {
    await AsyncStorage.setItem(
      this.SUBSCRIPTION_KEY,
      JSON.stringify(status)
    );
  }

  private async handleSuccessfulPurchase(purchase: any): Promise<void> {
    // Acknowledge purchase
    await InAppPurchases.finishTransactionAsync(purchase, true);
    
    // Save subscription
    await this.saveSubscription({
      isActive: true,
      plan: purchase.productId,
      expiresAt: new Date(purchase.transactionDate + this.getSubscriptionDuration(purchase.productId)),
      autoRenew: true,
      cancellationDate: null,
      trialEndsAt: null,
      paymentMethod: Platform.OS === 'ios' ? 'app_store' : 'play_store',
    });
  }

  private calculateExpiryDate(planId: string): Date {
    const now = new Date();
    
    if (planId === 'pro_monthly') {
      now.setMonth(now.getMonth() + 1);
    } else if (planId === 'pro_yearly') {
      now.setFullYear(now.getFullYear() + 1);
    }
    
    return now;
  }

  private calculateTrialEnd(): Date {
    const trialDate = new Date();
    trialDate.setDate(trialDate.getDate() + 7); // 7-day trial
    return trialDate;
  }

  private calculateRemainingDays(expiresAt: Date | null): number {
    if (!expiresAt) return 0;
    
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  private getSubscriptionDuration(planId: string): number {
    if (planId === 'pro_monthly') {
      return 30 * 24 * 60 * 60 * 1000; // 30 days
    } else if (planId === 'pro_yearly') {
      return 365 * 24 * 60 * 60 * 1000; // 365 days
    }
    return 0;
  }

  private isSubscriptionValid(purchase: any): boolean {
    const now = Date.now();
    const purchaseDate = purchase.transactionDate;
    const duration = this.getSubscriptionDuration(purchase.productId);
    
    return (purchaseDate + duration) > now;
  }

  private isEuropeanUser(country?: string): boolean {
    const euCountries = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB',
    ];
    return country ? euCountries.includes(country) : false;
  }

  private isCaliforniaUser(country?: string): boolean {
    // Simplified check - in production, check state/region
    return country === 'US';
  }

  private async activateFreePlan(): Promise<boolean> {
    await this.saveSubscription({
      isActive: false,
      plan: 'free',
      expiresAt: null,
      autoRenew: false,
      cancellationDate: null,
      trialEndsAt: null,
    });
    return true;
  }

  private async logSubscriptionEvent(event: string, planId: string): Promise<void> {
    // Privacy-compliant event logging
    // Only log necessary data, no PII
    const eventData = {
      event,
      planId,
      timestamp: new Date(),
      platform: Platform.OS,
    };
    
    console.log('Subscription event:', eventData);
    // In production, send to analytics service
  }
}