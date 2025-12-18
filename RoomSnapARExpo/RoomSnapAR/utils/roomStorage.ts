import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface RoomSession {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  measurements: Array<{
    points: Array<{ x: number; y: number }>;
    distance: number;
    unit: 'metric' | 'imperial';
  }>;
  boxes: Array<{
    id: string;
    position: [number, number, number];
    size: [number, number, number];
    label: string;
    color: string;
  }>;
  screenshots: string[];
  notes: string;
}

export interface RoomSnapFile {
  version: string;
  exportDate: Date;
  sessions: RoomSession[];
  metadata: {
    appVersion: string;
    deviceInfo: string;
  };
}

const SESSIONS_KEY = '@roomsnap_sessions';
const ROOMSNAP_DIR = `${FileSystem.documentDirectory}roomsnap/`;
const CURRENT_VERSION = '1.0.0';

export class RoomStorage {
  static async ensureDirectoryExists() {
    const dirInfo = await FileSystem.getInfoAsync(ROOMSNAP_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ROOMSNAP_DIR, { intermediates: true });
    }
  }

  static async saveSessions(sessions: RoomSession[]): Promise<void> {
    try {
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Failed to save sessions:', error);
      throw error;
    }
  }

  static async loadSessions(): Promise<RoomSession[]> {
    try {
      const data = await AsyncStorage.getItem(SESSIONS_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return [];
    }
  }

  static async createSession(name: string): Promise<RoomSession> {
    const session: RoomSession = {
      id: `session-${Date.now()}`,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      measurements: [],
      boxes: [],
      screenshots: [],
      notes: '',
    };

    const sessions = await this.loadSessions();
    sessions.push(session);
    await this.saveSessions(sessions);

    return session;
  }

  static async updateSession(sessionId: string, updates: Partial<RoomSession>): Promise<void> {
    const sessions = await this.loadSessions();
    const index = sessions.findIndex(s => s.id === sessionId);
    
    if (index !== -1) {
      sessions[index] = {
        ...sessions[index],
        ...updates,
        updatedAt: new Date(),
      };
      await this.saveSessions(sessions);
    }
  }

  static async deleteSession(sessionId: string): Promise<void> {
    const sessions = await this.loadSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    await this.saveSessions(filtered);
  }

  static async exportToRoomSnapFile(sessionIds?: string[]): Promise<string> {
    await this.ensureDirectoryExists();
    
    const sessions = await this.loadSessions();
    const sessionsToExport = sessionIds 
      ? sessions.filter(s => sessionIds.includes(s.id))
      : sessions;

    const roomSnapFile: RoomSnapFile = {
      version: CURRENT_VERSION,
      exportDate: new Date(),
      sessions: sessionsToExport,
      metadata: {
        appVersion: '1.0.0',
        deviceInfo: `${Platform.OS} ${Platform.Version}`,
      },
    };

    const fileName = `roomsnap_${Date.now()}.roomsnap`;
    const filePath = `${ROOMSNAP_DIR}${fileName}`;
    
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(roomSnapFile, null, 2));
    
    return filePath;
  }

  static async importFromRoomSnapFile(fileUri: string): Promise<RoomSession[]> {
    try {
      const content = await FileSystem.readAsStringAsync(fileUri);
      const roomSnapFile: RoomSnapFile = JSON.parse(content);
      
      if (roomSnapFile.version && roomSnapFile.sessions) {
        const currentSessions = await this.loadSessions();
        const importedSessions = roomSnapFile.sessions.map(session => ({
          ...session,
          id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
        }));
        
        const allSessions = [...currentSessions, ...importedSessions];
        await this.saveSessions(allSessions);
        
        return importedSessions;
      }
      
      throw new Error('Invalid RoomSnap file format');
    } catch (error) {
      console.error('Failed to import RoomSnap file:', error);
      throw error;
    }
  }

  static async saveScreenshot(sessionId: string, imageUri: string): Promise<string> {
    await this.ensureDirectoryExists();
    
    const fileName = `screenshot_${sessionId}_${Date.now()}.jpg`;
    const destPath = `${ROOMSNAP_DIR}${fileName}`;
    
    await FileSystem.copyAsync({
      from: imageUri,
      to: destPath,
    });
    
    const sessions = await this.loadSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (session) {
      session.screenshots.push(destPath);
      await this.saveSessions(sessions);
    }
    
    return destPath;
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