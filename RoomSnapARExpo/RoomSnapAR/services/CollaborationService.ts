import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from './AuthService';
import { NotificationService } from './NotificationService';
import { OfflineSyncService } from './OfflineSyncService';
import * as THREE from 'three';

export interface CollaborationSession {
  id: string;
  roomCode: string;
  hostId: string;
  participants: Participant[];
  measurements: SharedMeasurement[];
  cursors: Map<string, CursorPosition>;
  annotations: Annotation[];
  createdAt: Date;
  updatedAt: Date;
  settings: SessionSettings;
}

export interface Participant {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  role: 'host' | 'editor' | 'viewer';
  color: string;
  isActive: boolean;
  joinedAt: Date;
  lastSeen: Date;
}

export interface SharedMeasurement {
  id: string;
  authorId: string;
  points: THREE.Vector3[];
  distance: number;
  unit: string;
  label?: string;
  timestamp: Date;
  version: number;
  locked: boolean;
}

export interface CursorPosition {
  participantId: string;
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export interface Annotation {
  id: string;
  authorId: string;
  type: 'text' | 'arrow' | 'circle' | 'freehand';
  position: THREE.Vector3;
  content: string;
  style: {
    color: string;
    fontSize?: number;
    strokeWidth?: number;
  };
  timestamp: Date;
}

export interface SessionSettings {
  allowEditing: boolean;
  requireApproval: boolean;
  autoSync: boolean;
  maxParticipants: number;
  expiresIn: number; // minutes
}

export interface CollaborationMessage {
  type: 'join' | 'leave' | 'measurement' | 'cursor' | 'annotation' | 'sync' | 'chat';
  sessionId: string;
  participantId: string;
  data: any;
  timestamp: number;
  sequence: number;
}

export class CollaborationService {
  private static instance: CollaborationService;
  
  private authService = AuthService.getInstance();
  private notificationService = NotificationService.getInstance();
  private offlineSync = OfflineSyncService.getInstance();
  
  // WebSocket connection
  private ws: WebSocket | null = null;
  private wsUrl = 'wss://collaborate.roomsnap.app';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  // Session management
  private currentSession: CollaborationSession | null = null;
  private currentParticipant: Participant | null = null;
  private messageQueue: CollaborationMessage[] = [];
  private sequenceNumber = 0;
  
  // Event handlers
  private eventHandlers: Map<string, Set<Function>> = new Map();
  
  // Conflict resolution
  private conflictQueue: Map<string, any[]> = new Map();
  private operationalTransform = new OperationalTransform();
  
  // Performance
  private cursorThrottle = 100; // ms
  private lastCursorUpdate = 0;
  private syncInterval = 5000; // ms
  private syncTimer: NodeJS.Timeout | null = null;
  
  static getInstance(): CollaborationService {
    if (!CollaborationService.instance) {
      CollaborationService.instance = new CollaborationService();
    }
    return CollaborationService.instance;
  }

  async initialize(): Promise<void> {
    console.log('Initializing Collaboration Service...');
    
    // Setup WebSocket connection
    await this.connectWebSocket();
    
    // Load saved sessions
    await this.loadSavedSessions();
    
    // Start sync timer
    this.startSyncTimer();
    
    console.log('Collaboration Service initialized');
  }

  // Session Management
  async createSession(settings?: Partial<SessionSettings>): Promise<CollaborationSession> {
    const user = await this.authService.getCurrentUser();
    if (!user) throw new Error('Authentication required');
    
    const roomCode = this.generateRoomCode();
    const participantColor = this.generateParticipantColor();
    
    const session: CollaborationSession = {
      id: `session_${Date.now()}`,
      roomCode,
      hostId: user.uid,
      participants: [{
        id: `participant_${user.uid}`,
        userId: user.uid,
        name: user.email || 'Host',
        role: 'host',
        color: participantColor,
        isActive: true,
        joinedAt: new Date(),
        lastSeen: new Date(),
      }],
      measurements: [],
      cursors: new Map(),
      annotations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        allowEditing: true,
        requireApproval: false,
        autoSync: true,
        maxParticipants: 10,
        expiresIn: 120,
        ...settings,
      },
    };
    
    this.currentSession = session;
    this.currentParticipant = session.participants[0];
    
    // Send create session message
    await this.sendMessage({
      type: 'join',
      sessionId: session.id,
      participantId: this.currentParticipant.id,
      data: session,
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
    
    // Save session locally
    await this.saveSession(session);
    
    // Notify user
    await this.notificationService.sendNotification(
      'Session Created',
      `Room code: ${roomCode}`
    );
    
    return session;
  }

  async joinSession(roomCode: string): Promise<CollaborationSession> {
    const user = await this.authService.getCurrentUser();
    if (!user) throw new Error('Authentication required');
    
    // Request session from server
    const response = await this.requestSession(roomCode);
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to join session');
    }
    
    const session = response.data as CollaborationSession;
    
    // Add current user as participant
    const participant: Participant = {
      id: `participant_${user.uid}`,
      userId: user.uid,
      name: user.email || 'Participant',
      role: 'editor',
      color: this.generateParticipantColor(),
      isActive: true,
      joinedAt: new Date(),
      lastSeen: new Date(),
    };
    
    session.participants.push(participant);
    
    this.currentSession = session;
    this.currentParticipant = participant;
    
    // Send join message
    await this.sendMessage({
      type: 'join',
      sessionId: session.id,
      participantId: participant.id,
      data: participant,
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
    
    // Save session locally
    await this.saveSession(session);
    
    // Sync initial state
    await this.syncSessionState();
    
    // Notify user
    await this.notificationService.sendNotification(
      'Joined Session',
      `Connected to room: ${roomCode}`
    );
    
    return session;
  }

  async leaveSession(): Promise<void> {
    if (!this.currentSession || !this.currentParticipant) return;
    
    // Send leave message
    await this.sendMessage({
      type: 'leave',
      sessionId: this.currentSession.id,
      participantId: this.currentParticipant.id,
      data: null,
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
    
    // Clear local state
    this.currentSession = null;
    this.currentParticipant = null;
    this.messageQueue = [];
    this.conflictQueue.clear();
    
    // Stop sync timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Measurement Collaboration
  async shareMeasurement(measurement: any): Promise<void> {
    if (!this.currentSession || !this.currentParticipant) {
      throw new Error('No active session');
    }
    
    const sharedMeasurement: SharedMeasurement = {
      id: measurement.id,
      authorId: this.currentParticipant.id,
      points: measurement.points,
      distance: measurement.distance,
      unit: measurement.unit,
      label: measurement.label,
      timestamp: new Date(),
      version: 1,
      locked: false,
    };
    
    // Apply operational transform if needed
    if (this.conflictQueue.has(measurement.id)) {
      const conflicts = this.conflictQueue.get(measurement.id)!;
      sharedMeasurement.version = this.operationalTransform.transform(
        sharedMeasurement,
        conflicts
      );
    }
    
    // Add to session
    this.currentSession.measurements.push(sharedMeasurement);
    
    // Send to other participants
    await this.sendMessage({
      type: 'measurement',
      sessionId: this.currentSession.id,
      participantId: this.currentParticipant.id,
      data: sharedMeasurement,
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
    
    // Emit event
    this.emit('measurementShared', sharedMeasurement);
  }

  async updateMeasurement(id: string, updates: Partial<SharedMeasurement>): Promise<void> {
    if (!this.currentSession || !this.currentParticipant) {
      throw new Error('No active session');
    }
    
    const measurement = this.currentSession.measurements.find(m => m.id === id);
    if (!measurement) throw new Error('Measurement not found');
    
    // Check permissions
    if (measurement.locked && this.currentParticipant.role !== 'host') {
      throw new Error('Measurement is locked');
    }
    
    // Apply updates
    Object.assign(measurement, updates);
    measurement.version++;
    
    // Send update
    await this.sendMessage({
      type: 'measurement',
      sessionId: this.currentSession.id,
      participantId: this.currentParticipant.id,
      data: measurement,
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
  }

  // Cursor Tracking
  async updateCursor(position: THREE.Vector3): Promise<void> {
    if (!this.currentSession || !this.currentParticipant) return;
    
    // Throttle cursor updates
    const now = Date.now();
    if (now - this.lastCursorUpdate < this.cursorThrottle) return;
    this.lastCursorUpdate = now;
    
    const cursorPosition: CursorPosition = {
      participantId: this.currentParticipant.id,
      x: position.x,
      y: position.y,
      z: position.z,
      timestamp: now,
    };
    
    // Update local state
    this.currentSession.cursors.set(this.currentParticipant.id, cursorPosition);
    
    // Send to other participants
    await this.sendMessage({
      type: 'cursor',
      sessionId: this.currentSession.id,
      participantId: this.currentParticipant.id,
      data: cursorPosition,
      timestamp: now,
      sequence: this.getNextSequence(),
    });
  }

  // Annotations
  async addAnnotation(
    type: Annotation['type'],
    position: THREE.Vector3,
    content: string,
    style?: Partial<Annotation['style']>
  ): Promise<Annotation> {
    if (!this.currentSession || !this.currentParticipant) {
      throw new Error('No active session');
    }
    
    const annotation: Annotation = {
      id: `annotation_${Date.now()}`,
      authorId: this.currentParticipant.id,
      type,
      position,
      content,
      style: {
        color: this.currentParticipant.color,
        fontSize: 14,
        strokeWidth: 2,
        ...style,
      },
      timestamp: new Date(),
    };
    
    // Add to session
    this.currentSession.annotations.push(annotation);
    
    // Send to other participants
    await this.sendMessage({
      type: 'annotation',
      sessionId: this.currentSession.id,
      participantId: this.currentParticipant.id,
      data: annotation,
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
    
    return annotation;
  }

  // Chat
  async sendChatMessage(message: string): Promise<void> {
    if (!this.currentSession || !this.currentParticipant) {
      throw new Error('No active session');
    }
    
    await this.sendMessage({
      type: 'chat',
      sessionId: this.currentSession.id,
      participantId: this.currentParticipant.id,
      data: {
        message,
        author: this.currentParticipant.name,
        color: this.currentParticipant.color,
      },
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
    
    // Emit event
    this.emit('chatMessage', { message, author: this.currentParticipant });
  }

  // WebSocket Communication
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.processMessageQueue();
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(event.data);
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
        
        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.handleWebSocketClose();
        };
        
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        reject(error);
      }
    });
  }

  private handleWebSocketMessage(data: string): void {
    try {
      const message: CollaborationMessage = JSON.parse(data);
      
      // Ignore own messages
      if (message.participantId === this.currentParticipant?.id) return;
      
      switch (message.type) {
        case 'join':
          this.handleParticipantJoin(message.data);
          break;
          
        case 'leave':
          this.handleParticipantLeave(message.participantId);
          break;
          
        case 'measurement':
          this.handleMeasurementUpdate(message.data);
          break;
          
        case 'cursor':
          this.handleCursorUpdate(message.data);
          break;
          
        case 'annotation':
          this.handleAnnotationUpdate(message.data);
          break;
          
        case 'sync':
          this.handleSyncUpdate(message.data);
          break;
          
        case 'chat':
          this.emit('chatMessage', message.data);
          break;
      }
      
    } catch (error) {
      console.error('Failed to handle WebSocket message:', error);
    }
  }

  private handleWebSocketClose(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connectWebSocket();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('connectionLost');
    }
  }

  private async sendMessage(message: CollaborationMessage): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      this.messageQueue.push(message);
    }
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift()!;
      this.ws.send(JSON.stringify(message));
    }
  }

  // Event Handlers
  private handleParticipantJoin(participant: Participant): void {
    if (!this.currentSession) return;
    
    // Add participant if not exists
    if (!this.currentSession.participants.find(p => p.id === participant.id)) {
      this.currentSession.participants.push(participant);
    }
    
    // Notify
    this.notificationService.sendNotification(
      'Participant Joined',
      `${participant.name} joined the session`
    );
    
    this.emit('participantJoined', participant);
  }

  private handleParticipantLeave(participantId: string): void {
    if (!this.currentSession) return;
    
    const participant = this.currentSession.participants.find(p => p.id === participantId);
    if (participant) {
      participant.isActive = false;
      participant.lastSeen = new Date();
      
      // Notify
      this.notificationService.sendNotification(
        'Participant Left',
        `${participant.name} left the session`
      );
      
      this.emit('participantLeft', participant);
    }
  }

  private handleMeasurementUpdate(measurement: SharedMeasurement): void {
    if (!this.currentSession) return;
    
    const existing = this.currentSession.measurements.find(m => m.id === measurement.id);
    
    if (existing) {
      // Check for conflicts
      if (existing.version >= measurement.version) {
        // Queue for conflict resolution
        if (!this.conflictQueue.has(measurement.id)) {
          this.conflictQueue.set(measurement.id, []);
        }
        this.conflictQueue.get(measurement.id)!.push(measurement);
      } else {
        // Apply update
        Object.assign(existing, measurement);
      }
    } else {
      // Add new measurement
      this.currentSession.measurements.push(measurement);
    }
    
    this.emit('measurementUpdated', measurement);
  }

  private handleCursorUpdate(cursor: CursorPosition): void {
    if (!this.currentSession) return;
    
    this.currentSession.cursors.set(cursor.participantId, cursor);
    this.emit('cursorUpdated', cursor);
  }

  private handleAnnotationUpdate(annotation: Annotation): void {
    if (!this.currentSession) return;
    
    const existing = this.currentSession.annotations.find(a => a.id === annotation.id);
    
    if (existing) {
      Object.assign(existing, annotation);
    } else {
      this.currentSession.annotations.push(annotation);
    }
    
    this.emit('annotationUpdated', annotation);
  }

  private handleSyncUpdate(data: any): void {
    if (!this.currentSession) return;
    
    // Full state sync
    this.currentSession = { ...this.currentSession, ...data };
    this.emit('sessionSynced', this.currentSession);
  }

  // Synchronization
  private async syncSessionState(): Promise<void> {
    if (!this.currentSession || !this.currentParticipant) return;
    
    await this.sendMessage({
      type: 'sync',
      sessionId: this.currentSession.id,
      participantId: this.currentParticipant.id,
      data: {
        measurements: this.currentSession.measurements,
        annotations: this.currentSession.annotations,
      },
      timestamp: Date.now(),
      sequence: this.getNextSequence(),
    });
  }

  private startSyncTimer(): void {
    this.syncTimer = setInterval(() => {
      if (this.currentSession?.settings.autoSync) {
        this.syncSessionState();
      }
    }, this.syncInterval);
  }

  // Persistence
  private async saveSession(session: CollaborationSession): Promise<void> {
    await AsyncStorage.setItem(
      `@roomsnap_session_${session.id}`,
      JSON.stringify(session)
    );
    
    // Save to offline sync
    await this.offlineSync.saveOffline(`session_${session.id}`, session, {
      compress: true,
    });
  }

  private async loadSavedSessions(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(k => k.startsWith('@roomsnap_session_'));
      
      for (const key of sessionKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const session = JSON.parse(data) as CollaborationSession;
          
          // Check if session is still valid
          const expiresAt = new Date(session.createdAt).getTime() + 
            (session.settings.expiresIn * 60 * 1000);
          
          if (Date.now() < expiresAt) {
            // Session is still valid
            console.log(`Loaded saved session: ${session.roomCode}`);
          } else {
            // Remove expired session
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load saved sessions:', error);
    }
  }

  // Utilities
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private generateParticipantColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA5E9', '#FF8CC6', '#6C5CE7', '#A29BFE', '#FD79A8',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private getNextSequence(): number {
    return ++this.sequenceNumber;
  }

  private async requestSession(roomCode: string): Promise<any> {
    // Mock implementation - would connect to real server
    return {
      success: true,
      data: {
        id: `session_${Date.now()}`,
        roomCode,
        hostId: 'host123',
        participants: [],
        measurements: [],
        cursors: new Map(),
        annotations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {
          allowEditing: true,
          requireApproval: false,
          autoSync: true,
          maxParticipants: 10,
          expiresIn: 120,
        },
      },
    };
  }

  // Event Emitter
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: Function): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: string, data?: any): void {
    this.eventHandlers.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  // Public API
  getCurrentSession(): CollaborationSession | null {
    return this.currentSession;
  }

  getCurrentParticipant(): Participant | null {
    return this.currentParticipant;
  }

  getParticipants(): Participant[] {
    return this.currentSession?.participants || [];
  }

  getMeasurements(): SharedMeasurement[] {
    return this.currentSession?.measurements || [];
  }

  getAnnotations(): Annotation[] {
    return this.currentSession?.annotations || [];
  }

  getCursors(): Map<string, CursorPosition> {
    return this.currentSession?.cursors || new Map();
  }

  isHost(): boolean {
    return this.currentParticipant?.role === 'host';
  }

  canEdit(): boolean {
    const role = this.currentParticipant?.role;
    return role === 'host' || role === 'editor';
  }

  dispose(): void {
    this.leaveSession();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    
    this.eventHandlers.clear();
    this.messageQueue = [];
    this.conflictQueue.clear();
  }
}

// Operational Transform for conflict resolution
class OperationalTransform {
  transform(local: any, remote: any[]): number {
    // Simple version-based transform
    let maxVersion = local.version || 1;
    
    for (const r of remote) {
      if (r.version > maxVersion) {
        maxVersion = r.version;
      }
    }
    
    return maxVersion + 1;
  }
  
  merge(local: any, remote: any): any {
    // Merge strategy: combine non-conflicting properties
    const merged = { ...local };
    
    for (const key in remote) {
      if (!(key in local) || local[key] === remote[key]) {
        merged[key] = remote[key];
      } else if (key === 'version') {
        merged[key] = Math.max(local[key], remote[key]);
      }
      // For conflicts, keep local value (could implement more sophisticated merge)
    }
    
    return merged;
  }
}