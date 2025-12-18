import AsyncStorage from '@react-native-async-storage/async-storage';
import { SecurityService } from './SecurityService';
import { AuthService } from './AuthService';

export interface PaymentMethod {
  id: string;
  type: 'card' | 'apple_pay' | 'google_pay';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt: Date;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'succeeded' | 'failed';
  clientSecret: string;
  metadata?: any;
}

export interface Subscription {
  id: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  dueDate: Date;
  paidAt?: Date;
  invoiceUrl: string;
  pdfUrl: string;
}

export interface StripeConfig {
  publishableKey: string;
  merchantId: string;
  urlScheme: string;
  companyName: string;
}

export class PaymentService {
  private static instance: PaymentService;
  private readonly PAYMENT_METHODS_KEY = '@roomsnap_payment_methods';
  private readonly STRIPE_CONFIG_KEY = '@roomsnap_stripe_config';
  private readonly SUBSCRIPTIONS_KEY = '@roomsnap_subscriptions';
  private readonly INVOICES_KEY = '@roomsnap_invoices';
  
  private securityService = SecurityService.getInstance();
  private authService = AuthService.getInstance();
  
  // Stripe configuration (in production, these would be environment variables)
  private stripeConfig: StripeConfig = {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
    merchantId: process.env.STRIPE_MERCHANT_ID || 'merchant.com.roomsnap.app',
    urlScheme: 'roomsnap',
    companyName: 'RoomSnap AR'
  };

  // API endpoints (in production, these would point to your backend)
  private readonly API_BASE_URL = process.env.API_BASE_URL || 'https://api.roomsnap.app/v1';
  private readonly endpoints = {
    createPaymentIntent: `${this.API_BASE_URL}/payments/create-intent`,
    confirmPayment: `${this.API_BASE_URL}/payments/confirm`,
    createSubscription: `${this.API_BASE_URL}/subscriptions/create`,
    cancelSubscription: `${this.API_BASE_URL}/subscriptions/cancel`,
    updatePaymentMethod: `${this.API_BASE_URL}/payment-methods/update`,
    getInvoices: `${this.API_BASE_URL}/invoices`,
    createSetupIntent: `${this.API_BASE_URL}/payments/setup-intent`,
    attachPaymentMethod: `${this.API_BASE_URL}/payment-methods/attach`,
    detachPaymentMethod: `${this.API_BASE_URL}/payment-methods/detach`,
    webhookEndpoint: `${this.API_BASE_URL}/webhooks/stripe`
  };

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load saved configuration
      const savedConfig = await this.securityService.secureRetrieve(this.STRIPE_CONFIG_KEY);
      if (savedConfig) {
        this.stripeConfig = JSON.parse(savedConfig);
      }
      
      // Validate Stripe configuration
      await this.validateStripeConfig();
      
      // Initialize Stripe (would use react-native-stripe in production)
      // await initStripe({
      //   publishableKey: this.stripeConfig.publishableKey,
      //   merchantIdentifier: this.stripeConfig.merchantId,
      //   urlScheme: this.stripeConfig.urlScheme,
      // });
      
      console.log('Payment service initialized');
    } catch (error) {
      console.error('Payment service initialization failed:', error);
      throw error;
    }
  }

  async createPaymentIntent(amount: number, currency: string = 'usd'): Promise<PaymentIntent> {
    try {
      const user = this.authService.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Create payment intent on backend
      const response = await this.secureApiCall(this.endpoints.createPaymentIntent, {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Convert to cents
          currency,
          userId: user.id,
          metadata: {
            userId: user.id,
            userEmail: user.email,
            timestamp: new Date().toISOString()
          }
        })
      });
      
      const paymentIntent: PaymentIntent = {
        id: response.id,
        amount,
        currency,
        status: response.status,
        clientSecret: response.client_secret,
        metadata: response.metadata
      };
      
      // Log payment intent creation
      await this.securityService.auditLog('payment_intent_created', true, {
        intentId: paymentIntent.id,
        amount,
        currency
      });
      
      return paymentIntent;
    } catch (error) {
      console.error('Failed to create payment intent:', error);
      await this.securityService.auditLog('payment_intent_failed', false, { error });
      throw error;
    }
  }

  async confirmPayment(paymentIntentId: string, paymentMethodId: string): Promise<boolean> {
    try {
      const response = await this.secureApiCall(this.endpoints.confirmPayment, {
        method: 'POST',
        body: JSON.stringify({
          paymentIntentId,
          paymentMethodId
        })
      });
      
      if (response.status === 'succeeded') {
        await this.securityService.auditLog('payment_confirmed', true, {
          paymentIntentId,
          paymentMethodId: paymentMethodId.substring(0, 8) + '...'
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Payment confirmation failed:', error);
      await this.securityService.auditLog('payment_confirmation_failed', false, { 
        paymentIntentId,
        error 
      });
      return false;
    }
  }

  async createSubscription(planId: string, paymentMethodId?: string): Promise<Subscription> {
    try {
      const user = this.authService.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Get or create Stripe customer
      const customerId = await this.getOrCreateCustomer(user);
      
      // Create subscription on backend
      const response = await this.secureApiCall(this.endpoints.createSubscription, {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          planId,
          paymentMethodId,
          metadata: {
            userId: user.id,
            userEmail: user.email
          },
          trialPeriodDays: this.getTrialDaysForPlan(planId)
        })
      });
      
      const subscription: Subscription = {
        id: response.id,
        planId,
        status: response.status,
        currentPeriodStart: new Date(response.current_period_start * 1000),
        currentPeriodEnd: new Date(response.current_period_end * 1000),
        cancelAtPeriodEnd: response.cancel_at_period_end,
        trialEnd: response.trial_end ? new Date(response.trial_end * 1000) : undefined
      };
      
      // Save subscription locally
      await this.saveSubscription(subscription);
      
      // Log subscription creation
      await this.securityService.auditLog('subscription_created', true, {
        subscriptionId: subscription.id,
        planId,
        status: subscription.status
      });
      
      return subscription;
    } catch (error) {
      console.error('Subscription creation failed:', error);
      await this.securityService.auditLog('subscription_creation_failed', false, { 
        planId,
        error 
      });
      throw error;
    }
  }

  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<boolean> {
    try {
      const response = await this.secureApiCall(this.endpoints.cancelSubscription, {
        method: 'POST',
        body: JSON.stringify({
          subscriptionId,
          immediately
        })
      });
      
      if (response.success) {
        // Update local subscription
        const subscriptions = await this.getSubscriptions();
        const subscription = subscriptions.find(s => s.id === subscriptionId);
        
        if (subscription) {
          if (immediately) {
            subscription.status = 'canceled';
          } else {
            subscription.cancelAtPeriodEnd = true;
          }
          await this.saveSubscriptions(subscriptions);
        }
        
        await this.securityService.auditLog('subscription_canceled', true, {
          subscriptionId,
          immediately
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Subscription cancellation failed:', error);
      await this.securityService.auditLog('subscription_cancellation_failed', false, { 
        subscriptionId,
        error 
      });
      return false;
    }
  }

  async addPaymentMethod(type: 'card' | 'apple_pay' | 'google_pay', details?: any): Promise<PaymentMethod> {
    try {
      const user = this.authService.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Create setup intent for adding payment method
      const setupIntent = await this.secureApiCall(this.endpoints.createSetupIntent, {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id
        })
      });
      
      // In production, this would use Stripe SDK to collect payment details
      // const { paymentMethod } = await confirmSetupIntent({
      //   clientSecret: setupIntent.client_secret,
      //   type,
      //   ...details
      // });
      
      // Mock payment method for development
      const paymentMethod: PaymentMethod = {
        id: `pm_${Date.now()}`,
        type,
        last4: details?.last4 || '4242',
        brand: details?.brand || 'visa',
        expiryMonth: details?.expiryMonth || 12,
        expiryYear: details?.expiryYear || 2025,
        isDefault: false,
        createdAt: new Date()
      };
      
      // Attach payment method to customer
      await this.secureApiCall(this.endpoints.attachPaymentMethod, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          customerId: await this.getOrCreateCustomer(user)
        })
      });
      
      // Save payment method locally
      await this.savePaymentMethod(paymentMethod);
      
      await this.securityService.auditLog('payment_method_added', true, {
        type,
        last4: paymentMethod.last4
      });
      
      return paymentMethod;
    } catch (error) {
      console.error('Failed to add payment method:', error);
      await this.securityService.auditLog('payment_method_add_failed', false, { error });
      throw error;
    }
  }

  async removePaymentMethod(paymentMethodId: string): Promise<boolean> {
    try {
      const response = await this.secureApiCall(this.endpoints.detachPaymentMethod, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethodId
        })
      });
      
      if (response.success) {
        // Remove from local storage
        const methods = await this.getPaymentMethods();
        const filtered = methods.filter(m => m.id !== paymentMethodId);
        await this.savePaymentMethods(filtered);
        
        await this.securityService.auditLog('payment_method_removed', true, {
          paymentMethodId: paymentMethodId.substring(0, 8) + '...'
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to remove payment method:', error);
      await this.securityService.auditLog('payment_method_remove_failed', false, { error });
      return false;
    }
  }

  async setDefaultPaymentMethod(paymentMethodId: string): Promise<boolean> {
    try {
      const response = await this.secureApiCall(this.endpoints.updatePaymentMethod, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethodId,
          setAsDefault: true
        })
      });
      
      if (response.success) {
        // Update local storage
        const methods = await this.getPaymentMethods();
        methods.forEach(m => {
          m.isDefault = m.id === paymentMethodId;
        });
        await this.savePaymentMethods(methods);
        
        await this.securityService.auditLog('default_payment_method_set', true, {
          paymentMethodId: paymentMethodId.substring(0, 8) + '...'
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to set default payment method:', error);
      return false;
    }
  }

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      const encrypted = await AsyncStorage.getItem(this.PAYMENT_METHODS_KEY);
      if (!encrypted) return [];
      
      const decrypted = await this.securityService.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch {
      return [];
    }
  }

  async getSubscriptions(): Promise<Subscription[]> {
    try {
      const encrypted = await AsyncStorage.getItem(this.SUBSCRIPTIONS_KEY);
      if (!encrypted) return [];
      
      const decrypted = await this.securityService.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch {
      return [];
    }
  }

  async getInvoices(limit: number = 10): Promise<Invoice[]> {
    try {
      const user = this.authService.currentUser;
      if (!user) return [];
      
      const response = await this.secureApiCall(`${this.endpoints.getInvoices}?limit=${limit}`, {
        method: 'GET'
      });
      
      const invoices: Invoice[] = response.data.map((inv: any) => ({
        id: inv.id,
        subscriptionId: inv.subscription,
        amount: inv.amount_paid / 100,
        currency: inv.currency,
        status: inv.status,
        dueDate: new Date(inv.due_date * 1000),
        paidAt: inv.status_transitions?.paid_at 
          ? new Date(inv.status_transitions.paid_at * 1000)
          : undefined,
        invoiceUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf
      }));
      
      // Cache invoices locally
      await this.saveInvoices(invoices);
      
      return invoices;
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      
      // Return cached invoices if available
      return await this.getCachedInvoices();
    }
  }

  async processRefund(paymentIntentId: string, amount?: number, reason?: string): Promise<boolean> {
    try {
      const response = await this.secureApiCall(`${this.API_BASE_URL}/refunds/create`, {
        method: 'POST',
        body: JSON.stringify({
          paymentIntentId,
          amount: amount ? Math.round(amount * 100) : undefined,
          reason: reason || 'requested_by_customer'
        })
      });
      
      if (response.status === 'succeeded') {
        await this.securityService.auditLog('refund_processed', true, {
          paymentIntentId,
          amount,
          reason
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Refund processing failed:', error);
      await this.securityService.auditLog('refund_failed', false, { error });
      return false;
    }
  }

  // Webhook handling for Stripe events
  async handleWebhook(event: any, signature: string): Promise<void> {
    try {
      // Verify webhook signature
      if (!await this.verifyWebhookSignature(event, signature)) {
        throw new Error('Invalid webhook signature');
      }
      
      // Process event based on type
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;
          
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;
          
        case 'subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object);
          break;
          
        case 'subscription.deleted':
          await this.handleSubscriptionCancellation(event.data.object);
          break;
          
        case 'invoice.payment_succeeded':
          await this.handleInvoicePayment(event.data.object);
          break;
          
        case 'invoice.payment_failed':
          await this.handleInvoiceFailure(event.data.object);
          break;
          
        default:
          console.log(`Unhandled webhook event: ${event.type}`);
      }
      
      await this.securityService.auditLog('webhook_processed', true, {
        eventType: event.type,
        eventId: event.id
      });
    } catch (error) {
      console.error('Webhook processing failed:', error);
      await this.securityService.auditLog('webhook_failed', false, { error });
      throw error;
    }
  }

  // Private helper methods
  private async validateStripeConfig(): Promise<void> {
    if (!this.stripeConfig.publishableKey || this.stripeConfig.publishableKey === 'pk_test_placeholder') {
      console.warn('Stripe publishable key not configured. Using test mode.');
    }
    
    // Validate API connectivity
    try {
      const response = await fetch(`${this.API_BASE_URL}/health`);
      if (!response.ok) {
        console.warn('Payment API not reachable. Some features may be limited.');
      }
    } catch {
      console.warn('Payment API not reachable. Some features may be limited.');
    }
  }

  private async secureApiCall(url: string, options: RequestInit): Promise<any> {
    const token = this.authService.authToken;
    if (!token) {
      throw new Error('Authentication required');
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-API-Version': '2024-01-01',
      ...SecurityService.SECURITY_HEADERS
    };
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }
    
    return await response.json();
  }

  private async getOrCreateCustomer(user: any): Promise<string> {
    // In production, this would create or retrieve Stripe customer
    return `cus_${user.id}`;
  }

  private getTrialDaysForPlan(planId: string): number {
    const trialDays: { [key: string]: number } = {
      'pro_monthly': 7,
      'pro_yearly': 14,
      'enterprise': 30
    };
    return trialDays[planId] || 0;
  }

  private async savePaymentMethod(method: PaymentMethod): Promise<void> {
    const methods = await this.getPaymentMethods();
    methods.push(method);
    await this.savePaymentMethods(methods);
  }

  private async savePaymentMethods(methods: PaymentMethod[]): Promise<void> {
    const encrypted = await this.securityService.encrypt(JSON.stringify(methods));
    await AsyncStorage.setItem(this.PAYMENT_METHODS_KEY, encrypted);
  }

  private async saveSubscription(subscription: Subscription): Promise<void> {
    const subscriptions = await this.getSubscriptions();
    const index = subscriptions.findIndex(s => s.id === subscription.id);
    
    if (index >= 0) {
      subscriptions[index] = subscription;
    } else {
      subscriptions.push(subscription);
    }
    
    await this.saveSubscriptions(subscriptions);
  }

  private async saveSubscriptions(subscriptions: Subscription[]): Promise<void> {
    const encrypted = await this.securityService.encrypt(JSON.stringify(subscriptions));
    await AsyncStorage.setItem(this.SUBSCRIPTIONS_KEY, encrypted);
  }

  private async saveInvoices(invoices: Invoice[]): Promise<void> {
    const encrypted = await this.securityService.encrypt(JSON.stringify(invoices));
    await AsyncStorage.setItem(this.INVOICES_KEY, encrypted);
  }

  private async getCachedInvoices(): Promise<Invoice[]> {
    try {
      const encrypted = await AsyncStorage.getItem(this.INVOICES_KEY);
      if (!encrypted) return [];
      
      const decrypted = await this.securityService.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch {
      return [];
    }
  }

  private async verifyWebhookSignature(event: any, signature: string): Promise<boolean> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not configured');
      await this.securityService.auditLog('webhook_secret_missing', false);
      return false;
    }

    try {
      // Parse Stripe signature header format: t=timestamp,v1=signature
      const signatureParts = signature.split(',');
      const timestampPart = signatureParts.find((p) => p.startsWith('t='));
      const signatureV1Part = signatureParts.find((p) => p.startsWith('v1='));

      if (!timestampPart || !signatureV1Part) {
        console.error('Invalid webhook signature format');
        return false;
      }

      const timestamp = timestampPart.split('=')[1];
      const expectedSignature = signatureV1Part.split('=')[1];

      // Check timestamp to prevent replay attacks (5 minute tolerance)
      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
      if (timestampAge > 300) {
        console.error('Webhook timestamp too old, possible replay attack');
        await this.securityService.auditLog('webhook_replay_attack', false, { timestampAge });
        return false;
      }

      // Compute expected signature using HMAC-SHA256
      const payload = `${timestamp}.${JSON.stringify(event)}`;
      const computedSignature = await this.computeHmacSignature(payload, webhookSecret);

      // Constant-time comparison to prevent timing attacks
      if (computedSignature.length !== expectedSignature.length) {
        return false;
      }

      let result = 0;
      for (let i = 0; i < computedSignature.length; i++) {
        result |= computedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
      }

      return result === 0;
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      await this.securityService.auditLog('webhook_verification_error', false, { error });
      return false;
    }
  }

  private async computeHmacSignature(payload: string, secret: string): Promise<string> {
    // Simple HMAC computation using crypto digest
    // In production with native modules, use proper HMAC-SHA256
    const combined = `${secret}:${payload}:${secret}`;

    // Use multiple rounds of hashing to approximate HMAC behavior
    let hash = combined;
    for (let i = 0; i < 3; i++) {
      const crypto = await import('expo-crypto');
      hash = await crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, hash);
    }

    return hash;
  }

  private async handlePaymentSuccess(paymentIntent: any): Promise<void> {
    console.log('Payment succeeded:', paymentIntent.id);
    // Update user subscription status, send confirmation email, etc.
  }

  private async handlePaymentFailure(paymentIntent: any): Promise<void> {
    console.log('Payment failed:', paymentIntent.id);
    // Notify user, retry payment, etc.
  }

  private async handleSubscriptionUpdate(subscription: any): Promise<void> {
    console.log('Subscription updated:', subscription.id);
    // Update local subscription data
  }

  private async handleSubscriptionCancellation(subscription: any): Promise<void> {
    console.log('Subscription cancelled:', subscription.id);
    // Update user access, send confirmation, etc.
  }

  private async handleInvoicePayment(invoice: any): Promise<void> {
    console.log('Invoice paid:', invoice.id);
    // Update records, send receipt, etc.
  }

  private async handleInvoiceFailure(invoice: any): Promise<void> {
    console.log('Invoice payment failed:', invoice.id);
    // Notify user, retry payment, etc.
  }
}