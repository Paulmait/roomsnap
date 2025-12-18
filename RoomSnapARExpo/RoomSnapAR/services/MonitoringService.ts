import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ApiService } from './ApiService';
import { SecurityService } from './SecurityService';
import { PushNotificationService } from './PushNotificationService';
import { AnalyticsService } from './AnalyticsService';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface ErrorReport {
  id: string;
  error: Error;
  context: Record<string, any>;
  timestamp: Date;
  userId?: string;
  sessionId: string;
  deviceInfo: any;
  stackTrace: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  handled: boolean;
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  lastCheck: Date;
  error?: string;
}

export interface Alert {
  id: string;
  type: 'error' | 'performance' | 'security' | 'business';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: any;
}

export interface MonitoringConfig {
  enabled: boolean;
  errorReporting: boolean;
  performanceMonitoring: boolean;
  crashReporting: boolean;
  networkMonitoring: boolean;
  customMetrics: boolean;
  alertThresholds: {
    errorRate: number; // errors per minute
    responseTime: number; // milliseconds
    memoryUsage: number; // percentage
    crashRate: number; // crashes per session
  };
  samplingRate: number; // 0-1
  debugMode: boolean;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private readonly METRICS_KEY = '@roomsnap_metrics';
  private readonly ERRORS_KEY = '@roomsnap_errors';
  private readonly ALERTS_KEY = '@roomsnap_alerts';
  private readonly CONFIG_KEY = '@roomsnap_monitoring_config';
  
  private apiService = ApiService.getInstance();
  private securityService = SecurityService.getInstance();
  private pushService = PushNotificationService.getInstance();
  private analyticsService = AnalyticsService.getInstance();
  
  private config: MonitoringConfig = {
    enabled: true,
    errorReporting: true,
    performanceMonitoring: true,
    crashReporting: true,
    networkMonitoring: true,
    customMetrics: true,
    alertThresholds: {
      errorRate: 10,
      responseTime: 3000,
      memoryUsage: 80,
      crashRate: 0.01,
    },
    samplingRate: 1.0,
    debugMode: false,
  };
  
  private metrics: PerformanceMetric[] = [];
  private errors: ErrorReport[] = [];
  private alerts: Alert[] = [];
  private healthChecks: Map<string, HealthCheck> = new Map();
  private sessionStartTime: Date = new Date();
  private errorCount = 0;
  private networkRequests: Map<string, number> = new Map();
  private performanceObserver: any = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load configuration
      await this.loadConfig();
      
      if (!this.config.enabled) {
        console.log('Monitoring disabled');
        return;
      }
      
      // Set up error handling
      this.setupErrorHandling();
      
      // Set up performance monitoring
      this.setupPerformanceMonitoring();
      
      // Set up network monitoring
      this.setupNetworkMonitoring();
      
      // Start health checks
      this.startHealthChecks();
      
      // Start metrics collection
      this.startMetricsCollection();
      
      // Load previous session data
      await this.loadSessionData();
      
      console.log('Monitoring service initialized');
    } catch (error) {
      console.error('Monitoring initialization failed:', error);
    }
  }

  // Error Monitoring
  async reportError(
    error: Error,
    context?: Record<string, any>,
    severity: ErrorReport['severity'] = 'medium',
    handled: boolean = true
  ): Promise<void> {
    if (!this.config.errorReporting) return;
    
    try {
      const errorReport: ErrorReport = {
        id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        error,
        context: context || {},
        timestamp: new Date(),
        userId: await this.getUserId(),
        sessionId: await this.getSessionId(),
        deviceInfo: await this.getDeviceInfo(),
        stackTrace: error.stack || '',
        severity,
        handled,
      };
      
      // Store locally
      this.errors.push(errorReport);
      this.errorCount++;
      
      // Check error rate threshold
      if (this.shouldTriggerErrorAlert()) {
        await this.createAlert('error', 'critical', 'High Error Rate', 
          `Error rate exceeded threshold: ${this.errorCount} errors in the last minute`);
      }
      
      // Send to backend if critical
      if (severity === 'critical' || !handled) {
        await this.sendErrorReport(errorReport);
      }
      
      // Log to analytics
      await this.analyticsService.trackException(error, !handled);
      
      // Save errors
      await this.saveErrors();
    } catch (err) {
      console.error('Failed to report error:', err);
    }
  }

  async reportCrash(error: Error, fatal: boolean = true): Promise<void> {
    if (!this.config.crashReporting) return;
    
    await this.reportError(error, { fatal }, 'critical', false);
    
    // Send crash report immediately
    await this.flush();
    
    // Notify user if needed
    if (fatal) {
      await this.pushService.sendLocalNotification(
        'App Crash Detected',
        'The app encountered an error and needs to restart',
        { type: 'crash' }
      );
    }
  }

  // Performance Monitoring
  async recordMetric(
    name: string,
    value: number,
    unit: string = 'ms',
    tags?: Record<string, string>
  ): Promise<void> {
    if (!this.config.performanceMonitoring) return;
    
    // Apply sampling
    if (Math.random() > this.config.samplingRate) return;
    
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags,
    };
    
    this.metrics.push(metric);
    
    // Check performance thresholds
    if (name === 'response_time' && value > this.config.alertThresholds.responseTime) {
      await this.createAlert('performance', 'warning', 'Slow Response Time',
        `API response time ${value}ms exceeded threshold`);
    }
    
    // Keep metrics size manageable
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500);
    }
  }

  async measureAsync<T>(
    name: string,
    operation: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      await this.recordMetric(name, duration, 'ms', tags);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      await this.recordMetric(name, duration, 'ms', { ...tags, error: 'true' });
      
      throw error;
    }
  }

  // Network Monitoring
  async recordNetworkRequest(
    url: string,
    method: string,
    statusCode: number,
    duration: number,
    size?: number
  ): Promise<void> {
    if (!this.config.networkMonitoring) return;
    
    const endpoint = this.extractEndpoint(url);
    
    await this.recordMetric('network_request', duration, 'ms', {
      endpoint,
      method,
      status: statusCode.toString(),
    });
    
    if (size) {
      await this.recordMetric('network_payload', size, 'bytes', {
        endpoint,
        method,
      });
    }
    
    // Track request counts
    const key = `${method}:${endpoint}`;
    this.networkRequests.set(key, (this.networkRequests.get(key) || 0) + 1);
    
    // Check for failures
    if (statusCode >= 500) {
      await this.createAlert('error', 'error', 'Server Error',
        `${method} ${endpoint} returned ${statusCode}`);
    }
  }

  // Custom Metrics
  async trackBusinessMetric(
    metric: string,
    value: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.customMetrics) return;
    
    await this.recordMetric(`business.${metric}`, value, 'count', metadata);
    
    // Send to analytics
    await this.analyticsService.trackEvent('business_metric', {
      metric,
      value,
      ...metadata,
    });
  }

  // Health Checks
  async checkHealth(service: string, check: () => Promise<boolean>): Promise<HealthCheck> {
    const startTime = Date.now();
    let status: HealthCheck['status'] = 'healthy';
    let error: string | undefined;
    
    try {
      const healthy = await check();
      status = healthy ? 'healthy' : 'unhealthy';
    } catch (err: any) {
      status = 'unhealthy';
      error = err.message;
    }
    
    const latency = Date.now() - startTime;
    
    const healthCheck: HealthCheck = {
      service,
      status,
      latency,
      lastCheck: new Date(),
      error,
    };
    
    this.healthChecks.set(service, healthCheck);
    
    // Alert on unhealthy services
    if (status === 'unhealthy') {
      await this.createAlert('error', 'error', `${service} Unhealthy`,
        error || 'Service health check failed');
    }
    
    return healthCheck;
  }

  async performHealthChecks(): Promise<void> {
    // Check API health
    await this.checkHealth('api', async () => {
      const response = await this.apiService.checkHealth();
      return response.success;
    });
    
    // Check storage health
    await this.checkHealth('storage', async () => {
      await AsyncStorage.setItem('health_check', Date.now().toString());
      const value = await AsyncStorage.getItem('health_check');
      return value !== null;
    });
    
    // Check memory usage
    await this.checkHealth('memory', async () => {
      const usage = await this.getMemoryUsage();
      return usage < this.config.alertThresholds.memoryUsage;
    });
    
    // Check network connectivity
    await this.checkHealth('network', async () => {
      try {
        const response = await fetch('https://api.roomsnap.app/health', {
          method: 'HEAD',
          timeout: 5000,
        } as any);
        return response.ok;
      } catch {
        return false;
      }
    });
  }

  // Alerts
  async createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    title: string,
    message: string,
    metadata?: any
  ): Promise<void> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      title,
      message,
      timestamp: new Date(),
      resolved: false,
      metadata,
    };
    
    this.alerts.push(alert);
    
    // Send critical alerts immediately
    if (severity === 'critical') {
      await this.sendAlert(alert);
      
      // Send push notification to admins
      await this.pushService.sendLocalNotification(
        `🚨 ${title}`,
        message,
        { type: 'alert', alertId: alert.id }
      );
    }
    
    // Log to security service
    await this.securityService.auditLog('monitoring_alert', true, {
      alertId: alert.id,
      type,
      severity,
    });
    
    await this.saveAlerts();
  }

  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      await this.saveAlerts();
    }
  }

  // Memory Monitoring
  async getMemoryUsage(): Promise<number> {
    // In React Native, this would require a native module
    // For now, return a mock value
    if (this.config.debugMode) {
      return Math.random() * 100;
    }
    
    // In production, use react-native-device-info or similar
    return 50; // Mock 50% usage
  }

  async trackMemoryUsage(): Promise<void> {
    const usage = await this.getMemoryUsage();
    
    await this.recordMetric('memory_usage', usage, 'percent');
    
    if (usage > this.config.alertThresholds.memoryUsage) {
      await this.createAlert('performance', 'warning', 'High Memory Usage',
        `Memory usage at ${usage.toFixed(1)}%`);
    }
  }

  // App Lifecycle
  async trackAppLaunch(launchTime: number): Promise<void> {
    await this.recordMetric('app_launch', launchTime, 'ms');
    await this.analyticsService.trackAppLaunch(launchTime);
  }

  async trackScreenView(screen: string, renderTime?: number): Promise<void> {
    if (renderTime) {
      await this.recordMetric('screen_render', renderTime, 'ms', { screen });
    }
    
    await this.analyticsService.trackScreen(screen);
  }

  async trackUserAction(
    action: string,
    duration?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (duration) {
      await this.recordMetric('user_action', duration, 'ms', { action });
    }
    
    await this.analyticsService.trackEvent(action, metadata);
  }

  // Data Management
  async flush(): Promise<void> {
    try {
      // Send all pending data
      if (this.metrics.length > 0) {
        await this.sendMetrics();
      }
      
      if (this.errors.length > 0) {
        await this.sendErrors();
      }
      
      if (this.alerts.filter(a => !a.resolved).length > 0) {
        await this.sendAlerts();
      }
    } catch (error) {
      console.error('Failed to flush monitoring data:', error);
    }
  }

  async getMetrics(limit: number = 100): Promise<PerformanceMetric[]> {
    return this.metrics.slice(-limit);
  }

  async getErrors(limit: number = 50): Promise<ErrorReport[]> {
    return this.errors.slice(-limit);
  }

  async getAlerts(includeResolved: boolean = false): Promise<Alert[]> {
    if (includeResolved) {
      return this.alerts;
    }
    return this.alerts.filter(a => !a.resolved);
  }

  async getHealthStatus(): Promise<Record<string, HealthCheck>> {
    const status: Record<string, HealthCheck> = {};
    this.healthChecks.forEach((check, service) => {
      status[service] = check;
    });
    return status;
  }

  // Private Methods
  private setupErrorHandling(): void {
    // Global error handler
    const originalHandler = ErrorUtils.getGlobalHandler();
    
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      this.reportCrash(error, isFatal);
      
      // Call original handler
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
    
    // Promise rejection handler
    const originalRejectionHandler = global.onunhandledrejection;
    
    global.onunhandledrejection = (event: any) => {
      this.reportError(
        new Error(event.reason?.message || 'Unhandled Promise Rejection'),
        { reason: event.reason },
        'high',
        false
      );
      
      if (originalRejectionHandler) {
        originalRejectionHandler(event);
      }
    };
  }

  private setupPerformanceMonitoring(): void {
    // Monitor JS frame rate
    let lastFrameTime = Date.now();
    const frameMonitor = () => {
      const now = Date.now();
      const frameDuration = now - lastFrameTime;
      
      if (frameDuration > 100) { // Detect jank (>100ms frames)
        this.recordMetric('frame_drop', frameDuration, 'ms');
      }
      
      lastFrameTime = now;
      requestAnimationFrame(frameMonitor);
    };
    
    if (this.config.performanceMonitoring) {
      requestAnimationFrame(frameMonitor);
    }
  }

  private setupNetworkMonitoring(): void {
    // Intercept fetch to monitor network requests
    const originalFetch = global.fetch;
    
    global.fetch = async (...args) => {
      const startTime = Date.now();
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      const method = args[1]?.method || 'GET';
      
      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - startTime;
        
        await this.recordNetworkRequest(
          url,
          method,
          response.status,
          duration
        );
        
        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        await this.recordNetworkRequest(
          url,
          method,
          0,
          duration
        );
        
        throw error;
      }
    };
  }

  private startHealthChecks(): void {
    // Run health checks every 5 minutes
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, 5 * 60 * 1000);
    
    // Initial check
    this.performHealthChecks();
  }

  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsTimer = setInterval(() => {
      this.collectSystemMetrics();
    }, 60 * 1000);
  }

  private async collectSystemMetrics(): Promise<void> {
    // Memory usage
    await this.trackMemoryUsage();
    
    // Session duration
    const sessionDuration = Date.now() - this.sessionStartTime.getTime();
    await this.recordMetric('session_duration', sessionDuration, 'ms');
    
    // Error rate
    const errorRate = this.errorCount / (sessionDuration / 60000); // errors per minute
    await this.recordMetric('error_rate', errorRate, 'errors/min');
    
    // Flush old data
    if (this.metrics.length > 100) {
      await this.flush();
    }
  }

  private shouldTriggerErrorAlert(): boolean {
    const recentErrors = this.errors.filter(e => 
      Date.now() - e.timestamp.getTime() < 60000
    ).length;
    
    return recentErrors > this.config.alertThresholds.errorRate;
  }

  private extractEndpoint(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname;
    } catch {
      return url;
    }
  }

  private async getUserId(): Promise<string | undefined> {
    return await this.analyticsService.getAnonymousId();
  }

  private async getSessionId(): Promise<string> {
    return await this.analyticsService.getSessionId();
  }

  private async getDeviceInfo(): Promise<any> {
    return {
      platform: Platform.OS,
      version: Platform.Version,
      model: Device.modelName,
      brand: Device.brand,
      isDevice: Device.isDevice,
    };
  }

  private async loadConfig(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem(this.CONFIG_KEY);
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load monitoring config:', error);
    }
  }

  private async loadSessionData(): Promise<void> {
    try {
      const [metrics, errors, alerts] = await Promise.all([
        AsyncStorage.getItem(this.METRICS_KEY),
        AsyncStorage.getItem(this.ERRORS_KEY),
        AsyncStorage.getItem(this.ALERTS_KEY),
      ]);
      
      if (metrics) this.metrics = JSON.parse(metrics);
      if (errors) this.errors = JSON.parse(errors);
      if (alerts) this.alerts = JSON.parse(alerts);
    } catch (error) {
      console.error('Failed to load session data:', error);
    }
  }

  private async saveErrors(): Promise<void> {
    try {
      // Keep only recent errors
      const recentErrors = this.errors.slice(-100);
      await AsyncStorage.setItem(this.ERRORS_KEY, JSON.stringify(recentErrors));
    } catch (error) {
      console.error('Failed to save errors:', error);
    }
  }

  private async saveAlerts(): Promise<void> {
    try {
      // Keep only recent alerts
      const recentAlerts = this.alerts.slice(-50);
      await AsyncStorage.setItem(this.ALERTS_KEY, JSON.stringify(recentAlerts));
    } catch (error) {
      console.error('Failed to save alerts:', error);
    }
  }

  private async sendMetrics(): Promise<void> {
    try {
      await this.apiService.sendMetrics({
        metrics: this.metrics,
        sessionId: await this.getSessionId(),
        timestamp: new Date(),
      });
      
      // Clear sent metrics
      this.metrics = [];
    } catch (error) {
      console.error('Failed to send metrics:', error);
    }
  }

  private async sendErrors(): Promise<void> {
    try {
      // Send only unhandled or critical errors
      const criticalErrors = this.errors.filter(e => 
        !e.handled || e.severity === 'critical'
      );
      
      if (criticalErrors.length > 0) {
        // In production, send to error tracking service
        console.log('Sending error reports:', criticalErrors.length);
      }
    } catch (error) {
      console.error('Failed to send errors:', error);
    }
  }

  private async sendErrorReport(error: ErrorReport): Promise<void> {
    try {
      // Send to backend or error tracking service
      await this.apiService.trackEvent('error_report', {
        errorId: error.id,
        message: error.error.message,
        severity: error.severity,
        stackTrace: error.stackTrace,
      });
    } catch (err) {
      console.error('Failed to send error report:', err);
    }
  }

  private async sendAlert(alert: Alert): Promise<void> {
    try {
      // Send to backend for admin notification
      await this.apiService.trackEvent('monitoring_alert', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
      });
    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }

  private async sendAlerts(): Promise<void> {
    const unresolvedAlerts = this.alerts.filter(a => !a.resolved);
    
    for (const alert of unresolvedAlerts) {
      if (alert.severity === 'critical' || alert.severity === 'error') {
        await this.sendAlert(alert);
      }
    }
  }

  async disable(): Promise<void> {
    this.config.enabled = false;
    
    // Clear timers
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    // Flush remaining data
    await this.flush();
  }
}