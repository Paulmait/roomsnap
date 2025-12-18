import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { ApiService } from './ApiService';
import { SecurityService } from './SecurityService';

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  data: any;
  timestamp: number;
  retries: number;
  conflictResolution?: 'local' | 'remote' | 'merge';
}

export interface ConflictResolution {
  strategy: 'last-write-wins' | 'first-write-wins' | 'manual' | 'merge';
  resolver?: (local: any, remote: any) => any;
}

export interface CRDT {
  id: string;
  clock: VectorClock;
  data: any;
  tombstone: boolean;
}

interface VectorClock {
  [deviceId: string]: number;
}

export class OfflineSyncService {
  private static instance: OfflineSyncService;
  private readonly SYNC_QUEUE_KEY = '@roomsnap_sync_queue';
  private readonly OFFLINE_DATA_KEY = '@roomsnap_offline_data';
  private readonly VECTOR_CLOCKS_KEY = '@roomsnap_vector_clocks';
  private readonly DEVICE_ID_KEY = '@roomsnap_device_id';
  
  private apiService = ApiService.getInstance();
  private securityService = SecurityService.getInstance();
  
  private syncQueue: SyncOperation[] = [];
  private offlineData: Map<string, any> = new Map();
  private vectorClocks: Map<string, VectorClock> = new Map();
  private deviceId: string = '';
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private conflictHandlers: Map<string, ConflictResolution> = new Map();
  
  // Compression settings
  private compressionEnabled: boolean = true;
  private compressionRatio: number = 0;
  
  // Storage optimization
  private readonly MAX_OFFLINE_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly SYNC_BATCH_SIZE = 50;
  private readonly SYNC_INTERVAL = 30000; // 30 seconds

  static getInstance(): OfflineSyncService {
    if (!OfflineSyncService.instance) {
      OfflineSyncService.instance = new OfflineSyncService();
    }
    return OfflineSyncService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Generate or load device ID
      await this.ensureDeviceId();
      
      // Load offline data
      await this.loadOfflineData();
      
      // Setup network monitoring
      this.setupNetworkMonitoring();
      
      // Start sync timer
      this.startSyncTimer();
      
      // Register default conflict handlers
      this.registerDefaultConflictHandlers();
      
      console.log('Offline sync service initialized');
    } catch (error) {
      console.error('Offline sync initialization failed:', error);
    }
  }

  // CRDT Operations
  async createCRDT<T>(id: string, data: T): Promise<CRDT> {
    const clock = this.incrementClock(id);
    
    const crdt: CRDT = {
      id,
      clock,
      data,
      tombstone: false,
    };
    
    await this.storeCRDT(crdt);
    return crdt;
  }

  async updateCRDT<T>(id: string, updater: (data: T) => T): Promise<CRDT> {
    const existing = await this.getCRDT(id);
    
    if (!existing) {
      throw new Error(`CRDT ${id} not found`);
    }
    
    const clock = this.incrementClock(id);
    const updatedData = updater(existing.data);
    
    const crdt: CRDT = {
      id,
      clock,
      data: updatedData,
      tombstone: false,
    };
    
    await this.storeCRDT(crdt);
    return crdt;
  }

  async deleteCRDT(id: string): Promise<void> {
    const existing = await this.getCRDT(id);
    
    if (!existing) return;
    
    const clock = this.incrementClock(id);
    
    const crdt: CRDT = {
      id,
      clock,
      data: existing.data,
      tombstone: true,
    };
    
    await this.storeCRDT(crdt);
  }

  async mergeCRDTs(local: CRDT, remote: CRDT): Promise<CRDT> {
    // Vector clock comparison
    const comparison = this.compareVectorClocks(local.clock, remote.clock);
    
    switch (comparison) {
      case 'concurrent':
        // Conflict - use registered handler
        return this.resolveConflict(local, remote);
      
      case 'local-newer':
        return local;
      
      case 'remote-newer':
        await this.storeCRDT(remote);
        return remote;
      
      default:
        return local;
    }
  }

  // Offline Data Management
  async saveOffline(key: string, data: any, options?: {
    compress?: boolean;
    encrypt?: boolean;
    ttl?: number;
  }): Promise<void> {
    let processedData = data;
    
    // Compress if needed
    if (options?.compress ?? this.compressionEnabled) {
      processedData = await this.compress(JSON.stringify(data));
    }
    
    // Encrypt if needed
    if (options?.encrypt) {
      processedData = await this.securityService.encrypt(processedData);
    }
    
    // Add metadata
    const entry = {
      data: processedData,
      timestamp: Date.now(),
      ttl: options?.ttl,
      compressed: options?.compress ?? this.compressionEnabled,
      encrypted: options?.encrypt ?? false,
    };
    
    this.offlineData.set(key, entry);
    await this.persistOfflineData();
    
    // Check storage limits
    await this.checkStorageLimits();
  }

  async getOffline(key: string): Promise<any> {
    const entry = this.offlineData.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.offlineData.delete(key);
      return null;
    }
    
    let data = entry.data;
    
    // Decrypt if needed
    if (entry.encrypted) {
      data = await this.securityService.decrypt(data);
    }
    
    // Decompress if needed
    if (entry.compressed) {
      data = await this.decompress(data);
      data = JSON.parse(data);
    }
    
    return data;
  }

  // Sync Queue Operations
  async queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const op: SyncOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retries: 0,
    };
    
    this.syncQueue.push(op);
    
    // Limit queue size
    if (this.syncQueue.length > this.MAX_QUEUE_SIZE) {
      // Remove oldest operations
      this.syncQueue = this.syncQueue.slice(-this.MAX_QUEUE_SIZE);
    }
    
    await this.persistSyncQueue();
    
    // Try immediate sync if online
    if (this.isOnline && !this.isSyncing) {
      this.performSync();
    }
  }

  async performSync(): Promise<void> {
    if (!this.isOnline || this.isSyncing || this.syncQueue.length === 0) {
      return;
    }
    
    this.isSyncing = true;
    
    try {
      // Process queue in batches
      const batch = this.syncQueue.slice(0, this.SYNC_BATCH_SIZE);
      
      for (const operation of batch) {
        try {
          await this.executeSyncOperation(operation);
          
          // Remove from queue on success
          this.syncQueue = this.syncQueue.filter(op => op.id !== operation.id);
        } catch (error) {
          console.error(`Sync operation failed: ${operation.id}`, error);
          
          // Increment retry count
          operation.retries++;
          
          // Remove if max retries exceeded
          if (operation.retries > 3) {
            this.syncQueue = this.syncQueue.filter(op => op.id !== operation.id);
            
            // Store in failed operations for manual resolution
            await this.storeFailedOperation(operation);
          }
        }
      }
      
      await this.persistSyncQueue();
      
      // Pull remote changes
      await this.pullRemoteChanges();
      
    } finally {
      this.isSyncing = false;
    }
  }

  private async executeSyncOperation(operation: SyncOperation): Promise<void> {
    switch (operation.type) {
      case 'create':
        await this.apiService.createProject(operation.data);
        break;
      
      case 'update':
        await this.apiService.updateProject(operation.entity, operation.data);
        break;
      
      case 'delete':
        await this.apiService.deleteProject(operation.entity);
        break;
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    try {
      // Get last sync timestamp
      const lastSync = await AsyncStorage.getItem('@roomsnap_last_sync');
      const since = lastSync ? new Date(lastSync) : new Date(0);
      
      // Fetch changes from server
      const response = await this.apiService.getProjects(100, 0);
      
      if (response.success && response.data) {
        for (const remoteItem of response.data.items) {
          const localItem = await this.getOffline(remoteItem.id);
          
          if (localItem) {
            // Check for conflicts
            await this.resolveDataConflict(localItem, remoteItem);
          } else {
            // New remote item
            await this.saveOffline(remoteItem.id, remoteItem);
          }
        }
      }
      
      // Update last sync timestamp
      await AsyncStorage.setItem('@roomsnap_last_sync', new Date().toISOString());
    } catch (error) {
      console.error('Failed to pull remote changes:', error);
    }
  }

  // Conflict Resolution
  private async resolveConflict(local: CRDT, remote: CRDT): Promise<CRDT> {
    const handler = this.conflictHandlers.get(local.id) || 
                   this.conflictHandlers.get('default');
    
    if (!handler) {
      // Default: Last Write Wins
      return local.clock[this.deviceId] > remote.clock[this.deviceId] ? local : remote;
    }
    
    switch (handler.strategy) {
      case 'last-write-wins':
        return local.clock[this.deviceId] > remote.clock[this.deviceId] ? local : remote;
      
      case 'first-write-wins':
        return local.clock[this.deviceId] < remote.clock[this.deviceId] ? local : remote;
      
      case 'merge':
        if (handler.resolver) {
          const mergedData = handler.resolver(local.data, remote.data);
          return await this.createCRDT(local.id, mergedData);
        }
        return local;
      
      case 'manual':
        // Queue for manual resolution
        await this.queueConflictForResolution(local, remote);
        return local; // Keep local until resolved
      
      default:
        return local;
    }
  }

  private async resolveDataConflict(local: any, remote: any): Promise<void> {
    // Simple timestamp-based resolution
    if (local.updatedAt && remote.updatedAt) {
      if (new Date(remote.updatedAt) > new Date(local.updatedAt)) {
        await this.saveOffline(remote.id, remote);
      }
    }
  }

  // Compression
  private async compress(data: string): Promise<string> {
    // Using LZ-string algorithm (would need to import library)
    // For now, simple base64 encoding
    const compressed = btoa(unescape(encodeURIComponent(data)));
    
    this.compressionRatio = compressed.length / data.length;
    
    return compressed;
  }

  private async decompress(data: string): Promise<string> {
    // Reverse of compression
    return decodeURIComponent(escape(atob(data)));
  }

  // Network Monitoring
  private setupNetworkMonitoring(): void {
    NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;
      
      console.log(`Network status: ${this.isOnline ? 'Online' : 'Offline'}`);
      
      // Trigger sync when coming back online
      if (wasOffline && this.isOnline) {
        console.log('Back online - starting sync');
        this.performSync();
      }
    });
  }

  // Storage Management
  private async checkStorageLimits(): Promise<void> {
    const usage = await this.getStorageUsage();
    
    if (usage > this.MAX_OFFLINE_SIZE) {
      // Clean up old data
      await this.cleanupOldData();
    }
  }

  private async getStorageUsage(): Promise<number> {
    let totalSize = 0;
    
    for (const [key, value] of this.offlineData) {
      const size = JSON.stringify(value).length;
      totalSize += size;
    }
    
    return totalSize;
  }

  private async cleanupOldData(): Promise<void> {
    const entries = Array.from(this.offlineData.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 20%
    const toRemove = Math.floor(entries.length * 0.2);
    
    for (let i = 0; i < toRemove; i++) {
      this.offlineData.delete(entries[i][0]);
    }
    
    await this.persistOfflineData();
  }

  // Vector Clock Operations
  private incrementClock(id: string): VectorClock {
    const clock = this.vectorClocks.get(id) || {};
    clock[this.deviceId] = (clock[this.deviceId] || 0) + 1;
    this.vectorClocks.set(id, clock);
    return { ...clock };
  }

  private compareVectorClocks(clock1: VectorClock, clock2: VectorClock): 'concurrent' | 'local-newer' | 'remote-newer' | 'equal' {
    let clock1Newer = false;
    let clock2Newer = false;
    
    const allDevices = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);
    
    for (const deviceId of allDevices) {
      const v1 = clock1[deviceId] || 0;
      const v2 = clock2[deviceId] || 0;
      
      if (v1 > v2) clock1Newer = true;
      if (v2 > v1) clock2Newer = true;
    }
    
    if (clock1Newer && clock2Newer) return 'concurrent';
    if (clock1Newer) return 'local-newer';
    if (clock2Newer) return 'remote-newer';
    return 'equal';
  }

  // Persistence
  private async persistOfflineData(): Promise<void> {
    const data = Array.from(this.offlineData.entries());
    await AsyncStorage.setItem(this.OFFLINE_DATA_KEY, JSON.stringify(data));
  }

  private async loadOfflineData(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.OFFLINE_DATA_KEY);
      if (data) {
        this.offlineData = new Map(JSON.parse(data));
      }
    } catch (error) {
      console.error('Failed to load offline data:', error);
    }
  }

  private async persistSyncQueue(): Promise<void> {
    await AsyncStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));
  }

  private async loadSyncQueue(): Promise<void> {
    try {
      const queue = await AsyncStorage.getItem(this.SYNC_QUEUE_KEY);
      if (queue) {
        this.syncQueue = JSON.parse(queue);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  }

  private async storeCRDT(crdt: CRDT): Promise<void> {
    await this.saveOffline(`crdt_${crdt.id}`, crdt);
  }

  private async getCRDT(id: string): Promise<CRDT | null> {
    return await this.getOffline(`crdt_${id}`);
  }

  private async ensureDeviceId(): Promise<void> {
    let deviceId = await AsyncStorage.getItem(this.DEVICE_ID_KEY);
    
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(this.DEVICE_ID_KEY, deviceId);
    }
    
    this.deviceId = deviceId;
  }

  private startSyncTimer(): void {
    this.syncTimer = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.performSync();
      }
    }, this.SYNC_INTERVAL);
  }

  private registerDefaultConflictHandlers(): void {
    // Default handler
    this.conflictHandlers.set('default', {
      strategy: 'last-write-wins',
    });
    
    // Measurement-specific handler
    this.conflictHandlers.set('measurement', {
      strategy: 'merge',
      resolver: (local, remote) => ({
        ...local,
        ...remote,
        measurements: [...(local.measurements || []), ...(remote.measurements || [])],
        updatedAt: new Date(),
      }),
    });
  }

  private async storeFailedOperation(operation: SyncOperation): Promise<void> {
    const failed = await AsyncStorage.getItem('@roomsnap_failed_operations') || '[]';
    const operations = JSON.parse(failed);
    operations.push(operation);
    await AsyncStorage.setItem('@roomsnap_failed_operations', JSON.stringify(operations));
  }

  private async queueConflictForResolution(local: CRDT, remote: CRDT): Promise<void> {
    const conflicts = await AsyncStorage.getItem('@roomsnap_conflicts') || '[]';
    const conflictList = JSON.parse(conflicts);
    
    conflictList.push({
      id: `conflict_${Date.now()}`,
      local,
      remote,
      timestamp: Date.now(),
    });
    
    await AsyncStorage.setItem('@roomsnap_conflicts', JSON.stringify(conflictList));
  }

  // Public API
  registerConflictHandler(entityType: string, handler: ConflictResolution): void {
    this.conflictHandlers.set(entityType, handler);
  }

  async getQueueSize(): Promise<number> {
    return this.syncQueue.length;
  }

  async getStorageInfo(): Promise<{
    usage: number;
    limit: number;
    compression: number;
    itemCount: number;
  }> {
    const usage = await this.getStorageUsage();
    
    return {
      usage,
      limit: this.MAX_OFFLINE_SIZE,
      compression: this.compressionRatio,
      itemCount: this.offlineData.size,
    };
  }

  async forceSync(): Promise<void> {
    if (this.isOnline) {
      await this.performSync();
    }
  }

  async clearOfflineData(): Promise<void> {
    this.offlineData.clear();
    this.syncQueue = [];
    this.vectorClocks.clear();
    
    await Promise.all([
      AsyncStorage.removeItem(this.OFFLINE_DATA_KEY),
      AsyncStorage.removeItem(this.SYNC_QUEUE_KEY),
      AsyncStorage.removeItem(this.VECTOR_CLOCKS_KEY),
    ]);
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  dispose(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }
}