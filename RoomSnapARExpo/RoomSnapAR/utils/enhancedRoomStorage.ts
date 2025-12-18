import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// Enhanced metadata for professional AR measurements
export interface EnhancedMetadata {
  // Device Information
  deviceId: string;
  deviceName: string;
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
  osName: string;
  osVersion: string;
  
  // App Information
  appVersion: string;
  appBuildNumber: string;
  sessionVersion: string;
  
  // Location & Environment
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
    heading?: number;
    speed?: number;
    timestamp: number;
    address?: string;
  };
  
  // Network Information
  networkType?: string;
  ipAddress?: string;
  isConnected: boolean;
  
  // Sensor Calibration
  sensorCalibration: {
    gyroscopeAvailable: boolean;
    magnetometerAvailable: boolean;
    accelerometerAvailable: boolean;
    barometerAvailable: boolean;
    lastCalibrated?: Date;
  };
  
  // User Information
  userId?: string;
  userName?: string;
  userEmail?: string;
  organization?: string;
  projectId?: string;
  projectName?: string;
  
  // Timestamps
  createdAt: Date;
  lastModified: Date;
  exportedAt?: Date;
  
  // AR Session Quality
  arQualityMetrics: {
    trackingQuality: 'excellent' | 'good' | 'fair' | 'poor';
    lightingConditions: 'bright' | 'normal' | 'dim' | 'dark';
    surfaceDetection: boolean;
    planeDetectionCount: number;
    featurePointCount: number;
  };
}

export interface EnhancedRoomSession {
  // Core Session Data
  id: string;
  name: string;
  description?: string;
  roomType?: 'bedroom' | 'living_room' | 'kitchen' | 'bathroom' | 'office' | 'garage' | 'other';
  floorNumber?: number;
  roomNumber?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  duration?: number; // in seconds
  
  // Measurements with enhanced accuracy
  measurements: Array<{
    id: string;
    type: 'distance' | 'area' | 'volume' | 'angle';
    points: Array<{
      x: number;
      y: number;
      z?: number;
      confidence: number; // 0-1 accuracy confidence
      timestamp: number;
    }>;
    value: number;
    unit: 'metric' | 'imperial';
    accuracy: number; // in percentage
    notes?: string;
    capturedAt: Date;
    temperature?: number; // Environmental factors
    humidity?: number;
  }>;
  
  // 3D Objects with materials
  objects: Array<{
    id: string;
    type: 'furniture' | 'fixture' | 'appliance' | 'custom';
    category: string;
    brand?: string;
    model?: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    dimensions: {
      width: number;
      height: number;
      depth: number;
      unit: 'cm' | 'inches';
    };
    material?: string;
    color: string;
    texture?: string;
    weight?: number;
    price?: number;
    purchaseUrl?: string;
    notes?: string;
  }>;
  
  // Enhanced Screenshots with metadata
  screenshots: Array<{
    id: string;
    uri: string;
    thumbnail?: string;
    timestamp: Date;
    type: 'ar' | '2d' | 'floorplan' | '3d_render';
    annotations?: Array<{
      x: number;
      y: number;
      text: string;
      color: string;
    }>;
    cameraPosition?: [number, number, number];
    cameraRotation?: [number, number, number];
  }>;
  
  // Room Dimensions
  roomDimensions?: {
    length: number;
    width: number;
    height: number;
    area: number;
    volume: number;
    perimeter: number;
    unit: 'metric' | 'imperial';
  };
  
  // Professional Features
  floorPlan?: {
    svgData?: string;
    scale: number;
    gridSize: number;
    walls: Array<{
      start: [number, number];
      end: [number, number];
      thickness: number;
      height: number;
    }>;
    doors: Array<{
      position: [number, number];
      width: number;
      direction: 'left' | 'right' | 'double';
    }>;
    windows: Array<{
      position: [number, number];
      width: number;
      height: number;
    }>;
  };
  
  // Materials & Surfaces
  surfaces?: Array<{
    type: 'floor' | 'wall' | 'ceiling';
    material: string;
    color: string;
    area: number;
    condition: 'excellent' | 'good' | 'fair' | 'poor';
    notes?: string;
  }>;
  
  // Notes & Tags
  notes: string;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'draft' | 'in_progress' | 'completed' | 'archived';
  
  // Collaboration
  sharedWith?: string[];
  permissions?: {
    canEdit: string[];
    canView: string[];
  };
  
  // Audit Trail
  history: Array<{
    action: string;
    timestamp: Date;
    userId?: string;
    changes?: any;
  }>;
  
  // Cloud Sync
  cloudId?: string;
  lastSynced?: Date;
  syncStatus?: 'synced' | 'pending' | 'conflict' | 'error';
  
  // Metadata
  metadata: EnhancedMetadata;
}

export interface ProfessionalRoomSnapFile {
  version: string;
  fileFormat: 'roomsnap_pro';
  exportDate: Date;
  sessions: EnhancedRoomSession[];
  globalMetadata: EnhancedMetadata;
  signature?: string; // Digital signature for verification
  checksum?: string; // File integrity check
}

const SESSIONS_KEY = '@roomsnap_enhanced_sessions';
const ROOMSNAP_DIR = `${FileSystem.documentDirectory}roomsnap_pro/`;
const CURRENT_VERSION = '2.0.0';

export class EnhancedRoomStorage {
  static async ensureDirectoryExists() {
    const dirInfo = await FileSystem.getInfoAsync(ROOMSNAP_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ROOMSNAP_DIR, { intermediates: true });
    }
  }

  static async getDeviceMetadata(): Promise<Partial<EnhancedMetadata>> {
    const metadata: Partial<EnhancedMetadata> = {
      createdAt: new Date(),
      lastModified: new Date(),
      osName: Platform.OS,
      osVersion: Platform.Version?.toString() || 'Unknown',
      deviceType: Device.deviceType?.toString() || 'Unknown',
      deviceBrand: Device.brand || 'Unknown',
      deviceModel: Device.modelName || 'Unknown',
      deviceName: Device.deviceName || 'Unknown',
      appVersion: Application.nativeApplicationVersion || '1.0.0',
      appBuildNumber: Application.nativeBuildVersion || '1',
      sessionVersion: CURRENT_VERSION,
      isConnected: true,
      sensorCalibration: {
        gyroscopeAvailable: true,
        magnetometerAvailable: true,
        accelerometerAvailable: true,
        barometerAvailable: Platform.OS === 'ios',
      },
      arQualityMetrics: {
        trackingQuality: 'good',
        lightingConditions: 'normal',
        surfaceDetection: true,
        planeDetectionCount: 0,
        featurePointCount: 0,
      },
    };

    // Get unique device ID
    if (Platform.OS === 'ios') {
      metadata.deviceId = await Application.getIosIdForVendorAsync() || 'unknown';
    } else {
      metadata.deviceId = Application.androidId || 'unknown';
    }

    // Get network info
    try {
      const netInfo = await NetInfo.fetch();
      metadata.networkType = netInfo.type;
      metadata.isConnected = netInfo.isConnected || false;
      
      const networkInfo = await Network.getNetworkStateAsync();
      metadata.networkType = networkInfo.type;
    } catch (error) {
      console.log('Network info not available');
    }

    // Get location if permitted
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        
        metadata.location = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude || undefined,
          accuracy: location.coords.accuracy || undefined,
          heading: location.coords.heading || undefined,
          speed: location.coords.speed || undefined,
          timestamp: location.timestamp,
        };

        // Try to get address
        try {
          const addresses = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          if (addresses.length > 0) {
            const addr = addresses[0];
            metadata.location.address = `${addr.street || ''} ${addr.city || ''} ${addr.region || ''} ${addr.postalCode || ''}`.trim();
          }
        } catch (error) {
          console.log('Address lookup failed');
        }
      }
    } catch (error) {
      console.log('Location not available');
    }

    return metadata;
  }

  static async saveSessions(sessions: EnhancedRoomSession[]): Promise<void> {
    try {
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      
      // Also backup to file system
      await this.ensureDirectoryExists();
      const backupPath = `${ROOMSNAP_DIR}sessions_backup.json`;
      await FileSystem.writeAsStringAsync(backupPath, JSON.stringify(sessions, null, 2));
    } catch (error) {
      console.error('Failed to save sessions:', error);
      throw error;
    }
  }

  static async loadSessions(): Promise<EnhancedRoomSession[]> {
    try {
      const data = await AsyncStorage.getItem(SESSIONS_KEY);
      if (data) {
        return JSON.parse(data);
      }
      
      // Try to restore from backup
      const backupPath = `${ROOMSNAP_DIR}sessions_backup.json`;
      const backupInfo = await FileSystem.getInfoAsync(backupPath);
      if (backupInfo.exists) {
        const backupData = await FileSystem.readAsStringAsync(backupPath);
        return JSON.parse(backupData);
      }
      
      return [];
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return [];
    }
  }

  static async createSession(
    name: string,
    roomType?: string,
    description?: string
  ): Promise<EnhancedRoomSession> {
    const metadata = await this.getDeviceMetadata();
    
    const session: EnhancedRoomSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      roomType: roomType as any || 'other',
      createdAt: new Date(),
      updatedAt: new Date(),
      measurements: [],
      objects: [],
      screenshots: [],
      notes: '',
      tags: [],
      priority: 'medium',
      status: 'draft',
      history: [{
        action: 'created',
        timestamp: new Date(),
      }],
      metadata: metadata as EnhancedMetadata,
    };

    const sessions = await this.loadSessions();
    sessions.push(session);
    await this.saveSessions(sessions);

    return session;
  }

  static async updateSession(
    sessionId: string,
    updates: Partial<EnhancedRoomSession>
  ): Promise<void> {
    const sessions = await this.loadSessions();
    const index = sessions.findIndex(s => s.id === sessionId);
    
    if (index !== -1) {
      const currentSession = sessions[index];
      
      // Add to history
      const historyEntry = {
        action: 'updated',
        timestamp: new Date(),
        changes: updates,
      };
      
      sessions[index] = {
        ...currentSession,
        ...updates,
        updatedAt: new Date(),
        history: [...(currentSession.history || []), historyEntry],
      };
      
      // Update metadata
      if (sessions[index].metadata) {
        sessions[index].metadata.lastModified = new Date();
      }
      
      await this.saveSessions(sessions);
    }
  }

  static async exportToProfessionalFormat(
    sessionIds?: string[]
  ): Promise<string> {
    await this.ensureDirectoryExists();
    
    const sessions = await this.loadSessions();
    const sessionsToExport = sessionIds 
      ? sessions.filter(s => sessionIds.includes(s.id))
      : sessions;

    const globalMetadata = await this.getDeviceMetadata();

    const professionalFile: ProfessionalRoomSnapFile = {
      version: CURRENT_VERSION,
      fileFormat: 'roomsnap_pro',
      exportDate: new Date(),
      sessions: sessionsToExport,
      globalMetadata: globalMetadata as EnhancedMetadata,
    };

    // Generate checksum for integrity
    const content = JSON.stringify(professionalFile, null, 2);
    const checksum = this.generateChecksum(content);
    professionalFile.checksum = checksum;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `roomsnap_pro_${timestamp}.roomsnap`;
    const filePath = `${ROOMSNAP_DIR}${fileName}`;
    
    await FileSystem.writeAsStringAsync(
      filePath,
      JSON.stringify(professionalFile, null, 2)
    );
    
    return filePath;
  }

  private static generateChecksum(content: string): string {
    // Simple checksum for demo - in production use proper crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  static async addMeasurement(
    sessionId: string,
    measurement: any
  ): Promise<void> {
    const sessions = await this.loadSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (session) {
      const enhancedMeasurement = {
        ...measurement,
        id: `measure-${Date.now()}`,
        capturedAt: new Date(),
        accuracy: 95, // Default accuracy
      };
      
      session.measurements.push(enhancedMeasurement);
      session.updatedAt = new Date();
      
      // Update room dimensions if applicable
      if (measurement.type === 'distance') {
        this.updateRoomDimensions(session, measurement);
      }
      
      await this.saveSessions(sessions);
    }
  }

  private static updateRoomDimensions(
    session: EnhancedRoomSession,
    measurement: any
  ): void {
    // Auto-calculate room dimensions based on measurements
    if (!session.roomDimensions) {
      session.roomDimensions = {
        length: 0,
        width: 0,
        height: 0,
        area: 0,
        volume: 0,
        perimeter: 0,
        unit: measurement.unit || 'metric',
      };
    }
    
    // Update dimensions based on measurement type and values
    // This is a simplified example - implement proper logic based on your needs
    if (measurement.value > session.roomDimensions.length) {
      session.roomDimensions.length = measurement.value;
    }
  }

  static async syncToCloud(sessionId: string): Promise<void> {
    // Implement cloud sync logic here
    const sessions = await this.loadSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (session) {
      // Mock cloud sync
      session.lastSynced = new Date();
      session.syncStatus = 'synced';
      session.cloudId = `cloud-${session.id}`;
      
      await this.updateSession(sessionId, session);
    }
  }

  static async generateReport(sessionId: string): Promise<string> {
    const session = (await this.loadSessions()).find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const report = {
      title: `Room Measurement Report - ${session.name}`,
      date: new Date().toLocaleDateString(),
      sessionInfo: {
        id: session.id,
        created: session.createdAt,
        roomType: session.roomType,
        status: session.status,
      },
      measurements: session.measurements.map(m => ({
        type: m.type,
        value: m.value,
        unit: m.unit,
        accuracy: `${m.accuracy}%`,
      })),
      objects: session.objects.map(o => ({
        type: o.type,
        category: o.category,
        dimensions: o.dimensions,
      })),
      roomDimensions: session.roomDimensions,
      deviceInfo: {
        device: `${session.metadata.deviceBrand} ${session.metadata.deviceModel}`,
        os: `${session.metadata.osName} ${session.metadata.osVersion}`,
        appVersion: session.metadata.appVersion,
      },
      location: session.metadata.location?.address || 'Not available',
    };

    const reportPath = `${ROOMSNAP_DIR}report_${sessionId}_${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(reportPath, JSON.stringify(report, null, 2));
    
    return reportPath;
  }

  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SESSIONS_KEY);
      const dirInfo = await FileSystem.getInfoAsync(ROOMSNAP_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(ROOMSNAP_DIR, { idempotent: true });
      }
    } catch (error) {
      console.error('Failed to clear data:', error);
    }
  }
}