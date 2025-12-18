import { SecurityService } from './SecurityService';
import { AuthService } from './AuthService';
import { ConfigService } from './ConfigService';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class ApiService {
  private static instance: ApiService;
  private securityService = SecurityService.getInstance();
  private authService = AuthService.getInstance();
  private configService = ConfigService.getInstance();
  private baseUrl: string;
  private requestQueue: Map<string, Promise<any>> = new Map();
  private retryAttempts = 3;
  private timeout = 30000;

  private constructor() {
    this.baseUrl = this.configService.api.baseUrl;
  }

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  // Authentication Endpoints
  async register(email: string, password: string, name: string): Promise<ApiResponse> {
    return this.post('/auth/register', {
      email,
      password,
      name,
      platform: 'mobile',
      deviceInfo: await this.getDeviceInfo()
    });
  }

  async login(email: string, password: string, twoFactorCode?: string): Promise<ApiResponse> {
    return this.post('/auth/login', {
      email,
      password,
      twoFactorCode,
      rememberMe: true
    });
  }

  async logout(): Promise<ApiResponse> {
    return this.post('/auth/logout', {
      token: this.authService.authToken
    });
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse> {
    return this.post('/auth/refresh', { refreshToken });
  }

  async requestPasswordReset(email: string): Promise<ApiResponse> {
    return this.post('/auth/password/reset-request', { email });
  }

  async resetPassword(token: string, newPassword: string): Promise<ApiResponse> {
    return this.post('/auth/password/reset', {
      token,
      newPassword
    });
  }

  async verifyEmail(token: string): Promise<ApiResponse> {
    return this.post('/auth/verify-email', { token });
  }

  async enable2FA(): Promise<ApiResponse> {
    return this.post('/auth/2fa/enable', {}, true);
  }

  async disable2FA(code: string): Promise<ApiResponse> {
    return this.post('/auth/2fa/disable', { code }, true);
  }

  // User Management Endpoints
  async getProfile(): Promise<ApiResponse> {
    return this.get('/users/profile', true);
  }

  async updateProfile(data: any): Promise<ApiResponse> {
    return this.put('/users/profile', data, true);
  }

  async deleteAccount(reason?: string): Promise<ApiResponse> {
    return this.delete('/users/account', { reason }, true);
  }

  async uploadAvatar(imageUri: string): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('avatar', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'avatar.jpg'
    } as any);
    
    return this.upload('/users/avatar', formData, true);
  }

  // Subscription Endpoints
  async getSubscriptionStatus(): Promise<ApiResponse> {
    return this.get('/subscriptions/status', true);
  }

  async createSubscription(planId: string, paymentMethodId: string): Promise<ApiResponse> {
    return this.post('/subscriptions/create', {
      planId,
      paymentMethodId
    }, true);
  }

  async cancelSubscription(reason?: string): Promise<ApiResponse> {
    return this.post('/subscriptions/cancel', { reason }, true);
  }

  async updateSubscription(planId: string): Promise<ApiResponse> {
    return this.put('/subscriptions/update', { planId }, true);
  }

  async getInvoices(limit: number = 10, offset: number = 0): Promise<ApiResponse<PaginatedResponse<any>>> {
    return this.get(`/subscriptions/invoices?limit=${limit}&offset=${offset}`, true);
  }

  // Payment Endpoints
  async createPaymentIntent(amount: number, currency: string = 'usd'): Promise<ApiResponse> {
    return this.post('/payments/create-intent', {
      amount: Math.round(amount * 100),
      currency
    }, true);
  }

  async confirmPayment(paymentIntentId: string, paymentMethodId: string): Promise<ApiResponse> {
    return this.post('/payments/confirm', {
      paymentIntentId,
      paymentMethodId
    }, true);
  }

  async addPaymentMethod(type: string, details: any): Promise<ApiResponse> {
    return this.post('/payments/methods/add', {
      type,
      details
    }, true);
  }

  async removePaymentMethod(paymentMethodId: string): Promise<ApiResponse> {
    return this.delete(`/payments/methods/${paymentMethodId}`, {}, true);
  }

  async getPaymentMethods(): Promise<ApiResponse> {
    return this.get('/payments/methods', true);
  }

  // Measurement & Project Endpoints
  async createProject(data: any): Promise<ApiResponse> {
    return this.post('/projects/create', data, true);
  }

  async updateProject(projectId: string, data: any): Promise<ApiResponse> {
    return this.put(`/projects/${projectId}`, data, true);
  }

  async deleteProject(projectId: string): Promise<ApiResponse> {
    return this.delete(`/projects/${projectId}`, {}, true);
  }

  async getProjects(limit: number = 20, offset: number = 0): Promise<ApiResponse<PaginatedResponse<any>>> {
    return this.get(`/projects?limit=${limit}&offset=${offset}`, true);
  }

  async getProject(projectId: string): Promise<ApiResponse> {
    return this.get(`/projects/${projectId}`, true);
  }

  async shareProject(projectId: string, emails: string[], permission: string = 'view'): Promise<ApiResponse> {
    return this.post(`/projects/${projectId}/share`, {
      emails,
      permission
    }, true);
  }

  async saveMeasurement(projectId: string, measurement: any): Promise<ApiResponse> {
    return this.post(`/projects/${projectId}/measurements`, measurement, true);
  }

  async exportProject(projectId: string, format: 'pdf' | 'csv' | 'json'): Promise<ApiResponse> {
    return this.get(`/projects/${projectId}/export?format=${format}`, true);
  }

  // AI Vision Endpoints
  async analyzeImage(imageUri: string, mode: 'furniture' | 'room' | 'dimensions'): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'analysis.jpg'
    } as any);
    formData.append('mode', mode);
    
    return this.upload('/ai/analyze', formData, true);
  }

  async generateSuggestions(projectId: string): Promise<ApiResponse> {
    return this.post(`/ai/suggestions/${projectId}`, {}, true);
  }

  async processVoiceCommand(audioUri: string): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('audio', {
      uri: audioUri,
      type: 'audio/wav',
      name: 'command.wav'
    } as any);
    
    return this.upload('/ai/voice', formData, true);
  }

  // Analytics Endpoints
  async trackEvent(eventName: string, properties?: any): Promise<void> {
    // Fire and forget for performance
    this.post('/analytics/track', {
      event: eventName,
      properties,
      timestamp: new Date().toISOString(),
      sessionId: await this.getSessionId()
    }, true).catch(console.error);
  }

  async sendMetrics(metrics: any): Promise<void> {
    // Batch metrics sending
    this.post('/analytics/metrics', {
      metrics,
      timestamp: new Date().toISOString()
    }, true).catch(console.error);
  }

  // Admin Endpoints
  async adminGetUsers(page: number = 1, limit: number = 50): Promise<ApiResponse<PaginatedResponse<any>>> {
    return this.get(`/admin/users?page=${page}&limit=${limit}`, true);
  }

  async adminGetUser(userId: string): Promise<ApiResponse> {
    return this.get(`/admin/users/${userId}`, true);
  }

  async adminUpdateUser(userId: string, data: any): Promise<ApiResponse> {
    return this.put(`/admin/users/${userId}`, data, true);
  }

  async adminSuspendUser(userId: string, reason: string): Promise<ApiResponse> {
    return this.post(`/admin/users/${userId}/suspend`, { reason }, true);
  }

  async adminResetUserPassword(userId: string): Promise<ApiResponse> {
    return this.post(`/admin/users/${userId}/reset-password`, {}, true);
  }

  async adminGetMetrics(startDate: string, endDate: string): Promise<ApiResponse> {
    return this.get(`/admin/metrics?start=${startDate}&end=${endDate}`, true);
  }

  async adminGetAuditLogs(limit: number = 100): Promise<ApiResponse> {
    return this.get(`/admin/audit-logs?limit=${limit}`, true);
  }

  // Support Endpoints
  async createTicket(subject: string, message: string, category: string): Promise<ApiResponse> {
    return this.post('/support/tickets', {
      subject,
      message,
      category,
      platform: 'mobile'
    }, true);
  }

  async getTickets(): Promise<ApiResponse> {
    return this.get('/support/tickets', true);
  }

  async replyToTicket(ticketId: string, message: string): Promise<ApiResponse> {
    return this.post(`/support/tickets/${ticketId}/reply`, { message }, true);
  }

  // Health & Status Endpoints
  async checkHealth(): Promise<ApiResponse> {
    return this.get('/health');
  }

  async getStatus(): Promise<ApiResponse> {
    return this.get('/status');
  }

  // Core HTTP Methods
  private async get(endpoint: string, authenticated: boolean = false): Promise<ApiResponse> {
    return this.request('GET', endpoint, null, authenticated);
  }

  private async post(endpoint: string, data: any, authenticated: boolean = false): Promise<ApiResponse> {
    return this.request('POST', endpoint, data, authenticated);
  }

  private async put(endpoint: string, data: any, authenticated: boolean = false): Promise<ApiResponse> {
    return this.request('PUT', endpoint, data, authenticated);
  }

  private async delete(endpoint: string, data: any, authenticated: boolean = false): Promise<ApiResponse> {
    return this.request('DELETE', endpoint, data, authenticated);
  }

  private async upload(endpoint: string, formData: FormData, authenticated: boolean = false): Promise<ApiResponse> {
    return this.request('POST', endpoint, formData, authenticated, true);
  }

  private async request(
    method: string,
    endpoint: string,
    data: any,
    authenticated: boolean = false,
    isFormData: boolean = false,
    retryCount: number = 0
  ): Promise<ApiResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const requestKey = `${method}:${endpoint}:${JSON.stringify(data)}`;

    // Check if same request is already in progress
    if (this.requestQueue.has(requestKey)) {
      return this.requestQueue.get(requestKey);
    }

    const requestPromise = this.executeRequest(
      method,
      url,
      data,
      authenticated,
      isFormData,
      retryCount
    );

    this.requestQueue.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.requestQueue.delete(requestKey);
    }
  }

  private async executeRequest(
    method: string,
    url: string,
    data: any,
    authenticated: boolean,
    isFormData: boolean,
    retryCount: number
  ): Promise<ApiResponse> {
    try {
      const headers: any = {
        ...SecurityService.SECURITY_HEADERS,
        'X-Platform': 'mobile',
        'X-App-Version': '1.0.0',
        'X-Request-ID': await this.generateRequestId()
      };

      if (!isFormData) {
        headers['Content-Type'] = 'application/json';
      }

      if (authenticated) {
        const token = this.authService.authToken;
        if (!token) {
          throw new Error('Authentication required');
        }
        headers['Authorization'] = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        // Handle specific error codes
        if (response.status === 401) {
          // Try to refresh token
          if (authenticated && retryCount === 0) {
            await this.handleTokenRefresh();
            return this.request(method, url.replace(this.baseUrl, ''), data, authenticated, isFormData, retryCount + 1);
          }
          await this.authService.logout();
          throw new Error('Session expired. Please login again.');
        }

        if (response.status === 429) {
          // Rate limited - wait and retry
          if (retryCount < this.retryAttempts) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
            await this.sleep(retryAfter * 1000);
            return this.request(method, url.replace(this.baseUrl, ''), data, authenticated, isFormData, retryCount + 1);
          }
        }

        throw new Error(responseData?.message || `Request failed with status ${response.status}`);
      }

      // Log successful API call
      await this.securityService.auditLog('api_call_success', true, {
        method,
        endpoint: url.replace(this.baseUrl, ''),
        statusCode: response.status
      });

      return {
        success: true,
        data: responseData,
        statusCode: response.status
      };
    } catch (error: any) {
      // Retry on network errors
      if (retryCount < this.retryAttempts && this.isRetryableError(error)) {
        await this.sleep(Math.pow(2, retryCount) * 1000); // Exponential backoff
        return this.request(method, url.replace(this.baseUrl, ''), data, authenticated, isFormData, retryCount + 1);
      }

      // Log failed API call
      await this.securityService.auditLog('api_call_failed', false, {
        method,
        endpoint: url.replace(this.baseUrl, ''),
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        statusCode: 0
      };
    }
  }

  private async handleTokenRefresh(): Promise<void> {
    // Implement token refresh logic
    const refreshToken = await this.securityService.secureRetrieve('refresh_token');
    if (refreshToken) {
      const response = await this.refreshToken(refreshToken);
      if (response.success && response.data) {
        // Update tokens
        await this.securityService.secureStore('access_token', response.data.accessToken);
        await this.securityService.secureStore('refresh_token', response.data.refreshToken);
      }
    }
  }

  private isRetryableError(error: any): boolean {
    return error.name === 'AbortError' || 
           error.message.includes('network') ||
           error.message.includes('fetch');
  }

  private async getDeviceInfo(): Promise<any> {
    // Get device information for tracking
    return {
      platform: 'mobile',
      os: 'iOS/Android',
      version: '1.0.0'
    };
  }

  private async getSessionId(): Promise<string> {
    let sessionId = await this.securityService.secureRetrieve('session_id');
    if (!sessionId) {
      sessionId = await this.generateRequestId();
      await this.securityService.secureStore('session_id', sessionId);
    }
    return sessionId;
  }

  private async generateRequestId(): Promise<string> {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}