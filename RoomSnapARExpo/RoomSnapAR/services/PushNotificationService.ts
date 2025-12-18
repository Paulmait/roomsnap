import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from './ApiService';
import { SecurityService } from './SecurityService';

export interface NotificationPreferences {
  enabled: boolean;
  projectUpdates: boolean;
  subscriptionAlerts: boolean;
  securityAlerts: boolean;
  marketingMessages: boolean;
  dailySummary: boolean;
  weeklyReport: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  data?: any;
  timestamp: Date;
  read: boolean;
  category: 'project' | 'subscription' | 'security' | 'marketing' | 'system';
  actionUrl?: string;
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class PushNotificationService {
  private static instance: PushNotificationService;
  private readonly PUSH_TOKEN_KEY = '@roomsnap_push_token';
  private readonly PREFERENCES_KEY = '@roomsnap_notification_prefs';
  private readonly NOTIFICATIONS_KEY = '@roomsnap_notifications';
  private readonly MAX_STORED_NOTIFICATIONS = 100;
  
  private apiService = ApiService.getInstance();
  private securityService = SecurityService.getInstance();
  private pushToken: string | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;
  private preferences: NotificationPreferences = {
    enabled: true,
    projectUpdates: true,
    subscriptionAlerts: true,
    securityAlerts: true,
    marketingMessages: false,
    dailySummary: false,
    weeklyReport: false,
    soundEnabled: true,
    vibrationEnabled: true,
  };

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load saved preferences
      await this.loadPreferences();
      
      if (!this.preferences.enabled) {
        console.log('Push notifications disabled by user');
        return;
      }
      
      // Register for push notifications
      const token = await this.registerForPushNotifications();
      if (token) {
        this.pushToken = token;
        await this.savePushToken(token);
        
        // Send token to backend
        await this.updateServerPushToken(token);
      }
      
      // Set up notification listeners
      this.setupNotificationListeners();
      
      // Schedule local notifications if needed
      await this.scheduleRecurringNotifications();
      
      console.log('Push notification service initialized');
    } catch (error) {
      console.error('Push notification initialization failed:', error);
    }
  }

  private async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    try {
      // Get existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      // Request permissions if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Push notification permissions not granted');
        return null;
      }
      
      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId
      });
      
      // Configure notification channels for Android
      if (Platform.OS === 'android') {
        await this.setupAndroidChannels();
      }
      
      return tokenData.data;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  }

  private async setupAndroidChannels(): Promise<void> {
    if (Platform.OS === 'android') {
      // Project updates channel
      await Notifications.setNotificationChannelAsync('projects', {
        name: 'Project Updates',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196F3',
      });
      
      // Subscription alerts channel
      await Notifications.setNotificationChannelAsync('subscriptions', {
        name: 'Subscription Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500],
        lightColor: '#FF9800',
      });
      
      // Security alerts channel
      await Notifications.setNotificationChannelAsync('security', {
        name: 'Security Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 1000],
        lightColor: '#F44336',
      });
      
      // Marketing channel
      await Notifications.setNotificationChannelAsync('marketing', {
        name: 'Updates & Offers',
        importance: Notifications.AndroidImportance.LOW,
        lightColor: '#4CAF50',
      });
    }
  }

  private setupNotificationListeners(): void {
    // Listen for incoming notifications
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      this.handleNotificationReceived(notification);
    });
    
    // Listen for notification interactions
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      this.handleNotificationResponse(response);
    });
  }

  private async handleNotificationReceived(notification: Notifications.Notification): Promise<void> {
    try {
      // Store notification
      const notificationData: NotificationData = {
        id: notification.request.identifier,
        title: notification.request.content.title || '',
        body: notification.request.content.body || '',
        data: notification.request.content.data,
        timestamp: new Date(),
        read: false,
        category: this.categorizeNotification(notification),
        actionUrl: notification.request.content.data?.actionUrl
      };
      
      await this.storeNotification(notificationData);
      
      // Check if in quiet hours
      if (this.isInQuietHours()) {
        // Suppress notification sound/vibration
        await Notifications.dismissNotificationAsync(notification.request.identifier);
        
        // Re-schedule for after quiet hours
        await this.scheduleAfterQuietHours(notificationData);
      }
      
      // Log notification received
      await this.securityService.auditLog('notification_received', true, {
        notificationId: notification.request.identifier,
        category: notificationData.category
      });
    } catch (error) {
      console.error('Error handling notification:', error);
    }
  }

  private async handleNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
    try {
      const { notification } = response;
      const data = notification.request.content.data;
      
      // Mark as read
      await this.markAsRead(notification.request.identifier);
      
      // Handle different action types
      if (data?.actionType) {
        switch (data.actionType) {
          case 'navigate':
            // Navigate to specific screen
            if (data.screen) {
              // Navigation would be handled by the app
              console.log(`Navigate to: ${data.screen}`);
            }
            break;
            
          case 'open_url':
            // Open external URL
            if (data.url) {
              // Open URL logic
              console.log(`Open URL: ${data.url}`);
            }
            break;
            
          case 'quick_action':
            // Handle quick action
            await this.handleQuickAction(data.action, data.params);
            break;
        }
      }
      
      // Track interaction
      await this.apiService.trackEvent('notification_interaction', {
        notificationId: notification.request.identifier,
        actionType: data?.actionType
      });
    } catch (error) {
      console.error('Error handling notification response:', error);
    }
  }

  async sendLocalNotification(
    title: string,
    body: string,
    data?: any,
    scheduledTime?: Date
  ): Promise<string> {
    try {
      const content: Notifications.NotificationContentInput = {
        title,
        body,
        data,
        sound: this.preferences.soundEnabled,
        vibrate: this.preferences.vibrationEnabled ? [200] : undefined,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      };
      
      let trigger: Notifications.NotificationTriggerInput | null = null;
      
      if (scheduledTime) {
        trigger = {
          date: scheduledTime,
        };
      }
      
      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger,
      });
      
      return notificationId;
    } catch (error) {
      console.error('Failed to send local notification:', error);
      throw error;
    }
  }

  async scheduleRecurringNotifications(): Promise<void> {
    // Cancel existing scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    if (this.preferences.dailySummary) {
      // Schedule daily summary at 9 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Daily Summary',
          body: 'Check your daily measurement summary',
          data: { type: 'daily_summary' },
        },
        trigger: {
          hour: 9,
          minute: 0,
          repeats: true,
        },
      });
    }
    
    if (this.preferences.weeklyReport) {
      // Schedule weekly report on Mondays at 10 AM
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Weekly Report',
          body: 'Your weekly activity report is ready',
          data: { type: 'weekly_report' },
        },
        trigger: {
          weekday: 2, // Monday
          hour: 10,
          minute: 0,
          repeats: true,
        },
      });
    }
  }

  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...preferences };
    await this.savePreferences();
    
    // Update backend preferences
    await this.apiService.updateProfile({
      notificationPreferences: this.preferences
    });
    
    // Re-schedule notifications if needed
    if (preferences.dailySummary !== undefined || preferences.weeklyReport !== undefined) {
      await this.scheduleRecurringNotifications();
    }
    
    // Re-register if enabling/disabling
    if (preferences.enabled !== undefined) {
      if (preferences.enabled) {
        await this.initialize();
      } else {
        await this.disable();
      }
    }
  }

  async getNotifications(limit: number = 50): Promise<NotificationData[]> {
    try {
      const storedNotifications = await AsyncStorage.getItem(this.NOTIFICATIONS_KEY);
      if (!storedNotifications) return [];
      
      const notifications: NotificationData[] = JSON.parse(storedNotifications);
      return notifications
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to get notifications:', error);
      return [];
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notifications = await this.getNotifications(this.MAX_STORED_NOTIFICATIONS);
      const notification = notifications.find(n => n.id === notificationId);
      
      if (notification) {
        notification.read = true;
        await AsyncStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(notifications));
      }
      
      // Update badge count
      await this.updateBadgeCount();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  async markAllAsRead(): Promise<void> {
    try {
      const notifications = await this.getNotifications(this.MAX_STORED_NOTIFICATIONS);
      notifications.forEach(n => n.read = true);
      await AsyncStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(notifications));
      
      // Clear badge
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  async clearNotifications(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.NOTIFICATIONS_KEY);
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  async getUnreadCount(): Promise<number> {
    const notifications = await this.getNotifications();
    return notifications.filter(n => !n.read).length;
  }

  private async updateBadgeCount(): Promise<void> {
    const unreadCount = await this.getUnreadCount();
    await Notifications.setBadgeCountAsync(unreadCount);
  }

  private async storeNotification(notification: NotificationData): Promise<void> {
    try {
      const notifications = await this.getNotifications(this.MAX_STORED_NOTIFICATIONS);
      notifications.unshift(notification);
      
      // Keep only the latest notifications
      const trimmed = notifications.slice(0, this.MAX_STORED_NOTIFICATIONS);
      
      await AsyncStorage.setItem(this.NOTIFICATIONS_KEY, JSON.stringify(trimmed));
      await this.updateBadgeCount();
    } catch (error) {
      console.error('Failed to store notification:', error);
    }
  }

  private categorizeNotification(notification: Notifications.Notification): NotificationData['category'] {
    const data = notification.request.content.data;
    
    if (data?.category) {
      return data.category;
    }
    
    // Categorize based on channel (Android) or content
    const channelId = notification.request.content.categoryIdentifier;
    
    switch (channelId) {
      case 'projects':
        return 'project';
      case 'subscriptions':
        return 'subscription';
      case 'security':
        return 'security';
      case 'marketing':
        return 'marketing';
      default:
        return 'system';
    }
  }

  private isInQuietHours(): boolean {
    if (!this.preferences.quietHoursStart || !this.preferences.quietHoursEnd) {
      return false;
    }
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = this.preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = this.preferences.quietHoursEnd.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  private async scheduleAfterQuietHours(notification: NotificationData): Promise<void> {
    if (!this.preferences.quietHoursEnd) return;
    
    const [hour, minute] = this.preferences.quietHoursEnd.split(':').map(Number);
    const scheduledTime = new Date();
    scheduledTime.setHours(hour, minute, 0, 0);
    
    // If end time has passed today, schedule for tomorrow
    if (scheduledTime <= new Date()) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    await this.sendLocalNotification(
      notification.title,
      notification.body,
      notification.data,
      scheduledTime
    );
  }

  private async handleQuickAction(action: string, params: any): Promise<void> {
    switch (action) {
      case 'mark_project_complete':
        // Handle project completion
        if (params?.projectId) {
          await this.apiService.updateProject(params.projectId, { status: 'completed' });
        }
        break;
        
      case 'renew_subscription':
        // Handle subscription renewal
        // Navigation to subscription screen would happen here
        break;
        
      default:
        console.log(`Unknown quick action: ${action}`);
    }
  }

  private async savePushToken(token: string): Promise<void> {
    await this.securityService.secureStore(this.PUSH_TOKEN_KEY, token);
  }

  private async updateServerPushToken(token: string): Promise<void> {
    try {
      await this.apiService.updateProfile({
        pushToken: token,
        platform: Platform.OS,
        deviceInfo: {
          model: Device.modelName,
          osVersion: Device.osVersion,
        }
      });
    } catch (error) {
      console.error('Failed to update server push token:', error);
    }
  }

  private async loadPreferences(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem(this.PREFERENCES_KEY);
      if (saved) {
        this.preferences = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }

  private async savePreferences(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  async disable(): Promise<void> {
    // Cancel all scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Remove listeners
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
    
    // Clear push token on server
    if (this.pushToken) {
      await this.apiService.updateProfile({ pushToken: null });
    }
    
    // Clear badge
    await Notifications.setBadgeCountAsync(0);
  }

  getPushToken(): string | null {
    return this.pushToken;
  }

  getPreferences(): NotificationPreferences {
    return this.preferences;
  }
}