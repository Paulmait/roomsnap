import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { SecurityService } from './SecurityService';
import { ApiService } from './ApiService';
import { ConfigService } from './ConfigService';

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp: Date;
  sessionId: string;
  userId?: string;
}

export interface UserConsent {
  analytics: boolean;
  performance: boolean;
  marketing: boolean;
  functional: boolean;
  consentDate: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionData {
  id: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  events: number;
  screens: string[];
  userId?: string;
  deviceInfo: any;
}

export interface AnalyticsConfig {
  enabled: boolean;
  debugMode: boolean;
  sessionTimeout: number; // minutes
  batchSize: number;
  flushInterval: number; // seconds
  trackScreens: boolean;
  trackGestures: boolean;
  trackPerformance: boolean;
  anonymizeIp: boolean;
  respectDoNotTrack: boolean;
}

export class AnalyticsService {
  private static instance: AnalyticsService;
  private readonly CONSENT_KEY = '@roomsnap_analytics_consent';
  private readonly SESSION_KEY = '@roomsnap_analytics_session';
  private readonly EVENTS_KEY = '@roomsnap_analytics_events';
  private readonly USER_ID_KEY = '@roomsnap_analytics_user_id';
  
  private securityService = SecurityService.getInstance();
  private apiService = ApiService.getInstance();
  private configService = ConfigService.getInstance();
  
  private config: AnalyticsConfig = {
    enabled: false,
    debugMode: false,
    sessionTimeout: 30,
    batchSize: 20,
    flushInterval: 30,
    trackScreens: true,
    trackGestures: false,
    trackPerformance: true,
    anonymizeIp: true,
    respectDoNotTrack: true,
  };
  
  private consent: UserConsent | null = null;
  private currentSession: SessionData | null = null;
  private eventQueue: AnalyticsEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private sessionTimer: NodeJS.Timeout | null = null;
  private anonymousId: string | null = null;
  private userId: string | null = null;

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load consent status
      await this.loadConsent();
      
      // Check if analytics is allowed
      if (!this.isAnalyticsAllowed()) {
        console.log('Analytics disabled - no user consent');
        return;
      }
      
      // Generate or load anonymous ID
      await this.ensureAnonymousId();
      
      // Load or create session
      await this.startSession();
      
      // Load queued events
      await this.loadQueuedEvents();
      
      // Start flush timer
      this.startFlushTimer();
      
      // Initialize third-party analytics if configured
      await this.initializeThirdPartyAnalytics();
      
      this.config.enabled = true;
      console.log('Analytics service initialized');
    } catch (error) {
      console.error('Analytics initialization failed:', error);
    }
  }

  async requestConsent(): Promise<boolean> {
    // This would typically show a consent dialog
    // For now, we'll simulate consent
    const consent: UserConsent = {
      analytics: true,
      performance: true,
      marketing: false,
      functional: true,
      consentDate: new Date(),
      ipAddress: 'anonymized',
      userAgent: this.getUserAgent(),
    };
    
    await this.updateConsent(consent);
    return consent.analytics;
  }

  async updateConsent(consent: UserConsent): Promise<void> {
    this.consent = consent;
    
    // Store consent securely
    await this.securityService.secureStore(
      this.CONSENT_KEY,
      JSON.stringify(consent)
    );
    
    // Send consent to backend
    await this.apiService.updateProfile({
      privacyConsent: consent
    }).catch(console.error);
    
    // Log consent change
    await this.trackEvent('consent_updated', {
      analytics: consent.analytics,
      performance: consent.performance,
      marketing: consent.marketing,
      functional: consent.functional,
    });
    
    // Re-initialize if enabling
    if (consent.analytics && !this.config.enabled) {
      await this.initialize();
    } else if (!consent.analytics && this.config.enabled) {
      await this.disable();
    }
  }

  async trackEvent(
    eventName: string,
    properties?: Record<string, any>
  ): Promise<void> {
    if (!this.isAnalyticsAllowed()) return;
    
    try {
      const event: AnalyticsEvent = {
        name: eventName,
        properties: this.sanitizeProperties(properties),
        timestamp: new Date(),
        sessionId: this.currentSession?.id || '',
        userId: this.userId || undefined,
      };
      
      // Add to queue
      this.eventQueue.push(event);
      
      // Update session
      if (this.currentSession) {
        this.currentSession.events++;
        this.resetSessionTimer();
      }
      
      // Debug logging
      if (this.config.debugMode) {
        console.log('Analytics Event:', event);
      }
      
      // Check if should flush
      if (this.eventQueue.length >= this.config.batchSize) {
        await this.flush();
      }
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }

  async trackScreen(screenName: string, properties?: Record<string, any>): Promise<void> {
    if (!this.config.trackScreens) return;
    
    await this.trackEvent('screen_view', {
      screen_name: screenName,
      ...properties,
    });
    
    // Add to session screens
    if (this.currentSession && !this.currentSession.screens.includes(screenName)) {
      this.currentSession.screens.push(screenName);
    }
  }

  async trackTiming(
    category: string,
    variable: string,
    time: number,
    label?: string
  ): Promise<void> {
    if (!this.config.trackPerformance) return;
    
    await this.trackEvent('timing', {
      category,
      variable,
      time,
      label,
    });
  }

  async trackException(
    error: Error,
    fatal: boolean = false
  ): Promise<void> {
    await this.trackEvent('exception', {
      description: error.message,
      stack: error.stack,
      fatal,
    });
    
    // Immediately flush critical errors
    if (fatal) {
      await this.flush();
    }
  }

  async trackPurchase(
    productId: string,
    amount: number,
    currency: string = 'USD',
    properties?: Record<string, any>
  ): Promise<void> {
    await this.trackEvent('purchase', {
      product_id: productId,
      amount,
      currency,
      ...properties,
    });
  }

  async identifyUser(userId: string, traits?: Record<string, any>): Promise<void> {
    this.userId = userId;
    
    // Store user ID
    await AsyncStorage.setItem(this.USER_ID_KEY, userId);
    
    // Track identification event
    await this.trackEvent('identify', {
      user_id: userId,
      traits: this.sanitizeProperties(traits),
    });
    
    // Update session
    if (this.currentSession) {
      this.currentSession.userId = userId;
    }
  }

  async reset(): Promise<void> {
    // Clear user identification
    this.userId = null;
    await AsyncStorage.removeItem(this.USER_ID_KEY);
    
    // Generate new anonymous ID
    await this.ensureAnonymousId(true);
    
    // Start new session
    await this.endSession();
    await this.startSession();
    
    // Track reset event
    await this.trackEvent('user_reset');
  }

  async getSessionId(): Promise<string> {
    return this.currentSession?.id || '';
  }

  async getAnonymousId(): Promise<string> {
    return this.anonymousId || '';
  }

  // Performance Metrics
  async trackAppLaunch(launchTime: number): Promise<void> {
    await this.trackTiming('app', 'launch', launchTime);
  }

  async trackApiCall(
    endpoint: string,
    duration: number,
    success: boolean
  ): Promise<void> {
    await this.trackEvent('api_call', {
      endpoint,
      duration,
      success,
    });
  }

  async trackMemoryUsage(): Promise<void> {
    if (!this.config.trackPerformance) return;
    
    // Get memory info (simplified - would need native module for accurate data)
    const memoryInfo = {
      // In production, use react-native-device-info or similar
      used: 100, // MB
      total: 512, // MB
    };
    
    await this.trackEvent('memory_usage', memoryInfo);
  }

  // Privacy Methods
  async exportUserData(): Promise<any> {
    const events = await this.getAllEvents();
    const sessions = await this.getAllSessions();
    
    return {
      userId: this.userId,
      anonymousId: this.anonymousId,
      consent: this.consent,
      events,
      sessions,
      exportDate: new Date(),
    };
  }

  async deleteAllData(): Promise<void> {
    // Clear all stored data
    await AsyncStorage.multiRemove([
      this.CONSENT_KEY,
      this.SESSION_KEY,
      this.EVENTS_KEY,
      this.USER_ID_KEY,
    ]);
    
    // Reset in-memory data
    this.consent = null;
    this.currentSession = null;
    this.eventQueue = [];
    this.userId = null;
    this.anonymousId = null;
    
    // Notify backend
    await this.apiService.deleteAccount('data_deletion_request').catch(console.error);
  }

  // Private Methods
  private async loadConsent(): Promise<void> {
    try {
      const consentData = await this.securityService.secureRetrieve(this.CONSENT_KEY);
      if (consentData) {
        this.consent = JSON.parse(consentData);
      }
    } catch (error) {
      console.error('Failed to load consent:', error);
    }
  }

  private isAnalyticsAllowed(): boolean {
    // Check user consent
    if (!this.consent?.analytics) return false;
    
    // Check Do Not Track
    if (this.config.respectDoNotTrack && this.isDoNotTrackEnabled()) {
      return false;
    }
    
    // Check if in development mode (always allow for debugging)
    if (this.configService.isDevelopment && this.config.debugMode) {
      return true;
    }
    
    return true;
  }

  private isDoNotTrackEnabled(): boolean {
    // Check for Do Not Track header
    // In React Native, this would need to be checked differently
    return false;
  }

  private async ensureAnonymousId(regenerate: boolean = false): Promise<void> {
    if (!regenerate) {
      const stored = await AsyncStorage.getItem('analytics_anonymous_id');
      if (stored) {
        this.anonymousId = stored;
        return;
      }
    }
    
    // Generate new anonymous ID
    this.anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await AsyncStorage.setItem('analytics_anonymous_id', this.anonymousId);
  }

  private async startSession(): Promise<void> {
    // Check for existing session
    const existingSession = await this.loadSession();
    
    if (existingSession && this.isSessionValid(existingSession)) {
      this.currentSession = existingSession;
      return;
    }
    
    // Create new session
    this.currentSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: new Date(),
      events: 0,
      screens: [],
      userId: this.userId || undefined,
      deviceInfo: await this.getDeviceInfo(),
    };
    
    await this.saveSession();
    
    // Track session start
    await this.trackEvent('session_start', {
      device: this.currentSession.deviceInfo,
    });
    
    this.resetSessionTimer();
  }

  private async endSession(): Promise<void> {
    if (!this.currentSession) return;
    
    this.currentSession.endTime = new Date();
    this.currentSession.duration = 
      this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime();
    
    // Track session end
    await this.trackEvent('session_end', {
      duration: this.currentSession.duration,
      events: this.currentSession.events,
      screens: this.currentSession.screens.length,
    });
    
    await this.saveSession();
    await this.flush();
    
    this.currentSession = null;
  }

  private isSessionValid(session: SessionData): boolean {
    const now = Date.now();
    const sessionAge = now - new Date(session.startTime).getTime();
    const maxAge = this.config.sessionTimeout * 60 * 1000;
    
    return sessionAge < maxAge;
  }

  private resetSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }
    
    this.sessionTimer = setTimeout(() => {
      this.endSession();
      this.startSession();
    }, this.config.sessionTimeout * 60 * 1000);
  }

  private async loadSession(): Promise<SessionData | null> {
    try {
      const sessionData = await AsyncStorage.getItem(this.SESSION_KEY);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch {
      return null;
    }
  }

  private async saveSession(): Promise<void> {
    if (this.currentSession) {
      await AsyncStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentSession));
    }
  }

  private async loadQueuedEvents(): Promise<void> {
    try {
      const eventsData = await AsyncStorage.getItem(this.EVENTS_KEY);
      if (eventsData) {
        this.eventQueue = JSON.parse(eventsData);
      }
    } catch (error) {
      console.error('Failed to load queued events:', error);
    }
  }

  private async saveQueuedEvents(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.EVENTS_KEY, JSON.stringify(this.eventQueue));
    } catch (error) {
      console.error('Failed to save queued events:', error);
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval * 1000);
  }

  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    
    try {
      // Send events to backend
      const events = [...this.eventQueue];
      this.eventQueue = [];
      
      await this.apiService.sendMetrics({
        events,
        sessionId: this.currentSession?.id,
        anonymousId: this.anonymousId,
        userId: this.userId,
      });
      
      // Clear saved events
      await AsyncStorage.removeItem(this.EVENTS_KEY);
    } catch (error) {
      // Restore events on failure
      this.eventQueue.unshift(...this.eventQueue);
      await this.saveQueuedEvents();
      console.error('Failed to flush analytics:', error);
    }
  }

  private sanitizeProperties(properties?: Record<string, any>): Record<string, any> | undefined {
    if (!properties) return undefined;
    
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      // Remove sensitive data
      if (this.isSensitiveKey(key)) continue;
      
      // Sanitize values
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeProperties(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /key/i,
      /credit/i,
      /card/i,
      /cvv/i,
      /ssn/i,
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(key));
  }

  private sanitizeString(value: string): string {
    // Remove email addresses
    value = value.replace(/\S+@\S+\.\S+/g, '[email]');
    
    // Remove phone numbers
    value = value.replace(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g, '[phone]');
    
    // Remove credit card numbers
    value = value.replace(/\b(?:\d{4}[\s-]?){3}\d{4}\b/g, '[card]');
    
    return value;
  }

  private async getDeviceInfo(): Promise<any> {
    return {
      platform: Platform.OS,
      version: Platform.Version,
      model: Device.modelName,
      brand: Device.brand,
      osVersion: Device.osVersion,
      isDevice: Device.isDevice,
      appVersion: Constants.expoConfig?.version,
    };
  }

  private getUserAgent(): string {
    return `RoomSnapAR/${Constants.expoConfig?.version || '1.0.0'} (${Platform.OS}; ${Device.modelName})`;
  }

  private async initializeThirdPartyAnalytics(): Promise<void> {
    const config = this.configService.analytics;
    
    // Initialize Google Analytics
    if (config.googleAnalyticsId) {
      // Would initialize GA here
      console.log('Google Analytics configured:', this.maskId(config.googleAnalyticsId));
    }
    
    // Initialize Mixpanel
    if (config.mixpanelToken) {
      // Would initialize Mixpanel here
      console.log('Mixpanel configured:', this.maskId(config.mixpanelToken));
    }
    
    // Initialize Amplitude
    if (config.amplitudeApiKey) {
      // Would initialize Amplitude here
      console.log('Amplitude configured:', this.maskId(config.amplitudeApiKey));
    }
  }

  private maskId(id: string): string {
    if (!id || id.length < 8) return '***';
    return id.substring(0, 4) + '...' + id.substring(id.length - 4);
  }

  private async getAllEvents(): Promise<AnalyticsEvent[]> {
    // Would fetch from backend
    return this.eventQueue;
  }

  private async getAllSessions(): Promise<SessionData[]> {
    // Would fetch from backend
    return this.currentSession ? [this.currentSession] : [];
  }

  async disable(): Promise<void> {
    this.config.enabled = false;
    
    // Flush remaining events
    await this.flush();
    
    // End session
    await this.endSession();
    
    // Clear timers
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }
}