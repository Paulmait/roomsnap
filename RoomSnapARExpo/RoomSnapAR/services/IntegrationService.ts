import { LiDARService } from './LiDARService';
import { AIVisionPipeline } from './AIVisionPipeline';
import { ModelGenerationService } from './ModelGenerationService';
import { OfflineSyncService } from './OfflineSyncService';
import { PerformanceOptimizationService } from './PerformanceOptimizationService';
import { MeasurementService } from './MeasurementService';
import { AnalyticsService } from './AnalyticsService';
import { NotificationService } from './NotificationService';
import { SubscriptionService } from './SubscriptionService';
import { AuthService } from './AuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as THREE from 'three';

export interface IntegratedMeasurement {
  id: string;
  type: 'wall' | 'floor' | 'object' | 'furniture' | 'room';
  points: THREE.Vector3[];
  distance: number;
  unit: 'meters' | 'feet';
  confidence: number;
  aiSuggestions?: string[];
  modelId?: string;
  timestamp: Date;
}

export interface SceneData {
  measurements: IntegratedMeasurement[];
  pointCloud?: any;
  models: any[];
  aiAnalysis?: any;
  roomType?: string;
  furniture?: any[];
  metadata: {
    deviceCapabilities: string[];
    sessionDuration: number;
    accuracyLevel: 'high' | 'medium' | 'low';
    processingTime: number;
  };
}

export interface WorkflowOptions {
  useAI: boolean;
  useLiDAR: boolean;
  generateModels: boolean;
  offlineMode: boolean;
  performanceMode: 'quality' | 'balanced' | 'performance';
  collaborationEnabled: boolean;
}

export class IntegrationService {
  private static instance: IntegrationService;
  
  // Service instances
  private lidarService = LiDARService.getInstance();
  private aiVision = AIVisionPipeline.getInstance();
  private modelGen = ModelGenerationService.getInstance();
  private offlineSync = OfflineSyncService.getInstance();
  private performance = PerformanceOptimizationService.getInstance();
  private measurement = MeasurementService.getInstance();
  private analytics = AnalyticsService.getInstance();
  private notifications = NotificationService.getInstance();
  private subscription = SubscriptionService.getInstance();
  private auth = AuthService.getInstance();
  
  // State management
  private currentScene: SceneData | null = null;
  private workflowOptions: WorkflowOptions = {
    useAI: true,
    useLiDAR: true,
    generateModels: true,
    offlineMode: false,
    performanceMode: 'balanced',
    collaborationEnabled: false,
  };
  
  // Performance metrics
  private sessionStartTime: number = 0;
  private processingTimes: Map<string, number> = new Map();
  
  // Collaboration state
  private collaborationSession: string | null = null;
  private collaborators: Map<string, any> = new Map();
  
  static getInstance(): IntegrationService {
    if (!IntegrationService.instance) {
      IntegrationService.instance = new IntegrationService();
    }
    return IntegrationService.instance;
  }

  async initialize(): Promise<void> {
    console.log('Initializing Integration Service...');
    
    this.sessionStartTime = Date.now();
    
    // Initialize all services in parallel where possible
    const initPromises = [
      this.performance.initialize(),
      this.offlineSync.initialize(),
      this.notifications.initializeNotifications(),
      this.analytics.trackEvent('app_launch', {}),
    ];
    
    // Initialize AI and LiDAR based on device capabilities
    const capabilities = await this.detectDeviceCapabilities();
    
    if (capabilities.hasLiDAR) {
      initPromises.push(this.lidarService.initialize());
    }
    
    if (capabilities.hasGPU) {
      initPromises.push(this.aiVision.initialize());
    }
    
    await Promise.all(initPromises);
    
    // Load saved workflow options
    await this.loadWorkflowOptions();
    
    // Setup performance optimization based on device
    await this.optimizeForDevice(capabilities);
    
    console.log('Integration Service initialized');
  }

  // Comprehensive measurement workflow
  async startMeasurementWorkflow(imageData?: ImageData | string): Promise<SceneData> {
    const startTime = Date.now();
    
    // Check subscription limits
    const canMeasure = await this.checkMeasurementLimits();
    if (!canMeasure) {
      await this.notifications.sendNotification(
        'Measurement Limit Reached',
        'Please upgrade your subscription for unlimited measurements'
      );
      throw new Error('Measurement limit exceeded');
    }
    
    // Initialize scene data
    this.currentScene = {
      measurements: [],
      models: [],
      metadata: {
        deviceCapabilities: await this.getDeviceCapabilityList(),
        sessionDuration: Date.now() - this.sessionStartTime,
        accuracyLevel: 'medium',
        processingTime: 0,
      },
    };
    
    // Performance optimization
    const qualitySettings = this.performance.getQualitySettings();
    
    try {
      // Parallel processing based on workflow options
      const tasks: Promise<any>[] = [];
      
      // LiDAR scanning
      if (this.workflowOptions.useLiDAR && await this.lidarService.isAvailable()) {
        tasks.push(this.performLiDARScan());
      }
      
      // AI vision processing
      if (this.workflowOptions.useAI && imageData) {
        tasks.push(this.performAIAnalysis(imageData));
      }
      
      // Execute parallel tasks
      const results = await Promise.all(tasks);
      
      // Generate 3D models if enabled
      if (this.workflowOptions.generateModels) {
        await this.generate3DModels();
      }
      
      // Calculate accuracy level
      this.currentScene.metadata.accuracyLevel = this.calculateAccuracyLevel();
      
      // Track analytics
      await this.trackMeasurementAnalytics();
      
      // Save to offline storage if needed
      if (this.workflowOptions.offlineMode || !this.offlineSync.getIsOnline()) {
        await this.saveSceneOffline();
      }
      
      // Notify collaborators if in collaboration mode
      if (this.workflowOptions.collaborationEnabled && this.collaborationSession) {
        await this.broadcastSceneUpdate();
      }
      
    } catch (error) {
      console.error('Measurement workflow failed:', error);
      await this.handleWorkflowError(error);
    } finally {
      this.currentScene.metadata.processingTime = Date.now() - startTime;
      this.processingTimes.set('workflow', this.currentScene.metadata.processingTime);
    }
    
    return this.currentScene;
  }

  // Enhanced measurement with AI suggestions
  async measureWithAI(
    startPoint: THREE.Vector3,
    endPoint: THREE.Vector3,
    imageData?: ImageData | string
  ): Promise<IntegratedMeasurement> {
    const measurement = await this.measurement.createMeasurement(
      startPoint,
      endPoint,
      'line'
    );
    
    const integrated: IntegratedMeasurement = {
      id: measurement.id,
      type: 'wall',
      points: [startPoint, endPoint],
      distance: measurement.distance,
      unit: measurement.unit as 'meters' | 'feet',
      confidence: 0.95,
      timestamp: new Date(),
    };
    
    // Get AI suggestions if available
    if (this.workflowOptions.useAI && imageData) {
      const aiAnalysis = await this.aiVision.processFrame(imageData);
      
      if (aiAnalysis.suggestions.length > 0) {
        integrated.aiSuggestions = aiAnalysis.suggestions.map(s => s.reason);
      }
      
      // Update measurement type based on AI detection
      if (aiAnalysis.objects.length > 0) {
        const nearestObject = this.findNearestObject(startPoint, aiAnalysis.objects);
        if (nearestObject) {
          integrated.type = this.mapObjectToMeasurementType(nearestObject.class);
        }
      }
    }
    
    // Add to current scene
    if (this.currentScene) {
      this.currentScene.measurements.push(integrated);
    }
    
    // Track event
    await this.analytics.trackEvent('measurement_created', {
      type: integrated.type,
      hasAI: !!integrated.aiSuggestions,
      confidence: integrated.confidence,
    });
    
    return integrated;
  }

  // Smart room scanning
  async performSmartRoomScan(): Promise<SceneData> {
    console.log('Starting smart room scan...');
    
    const scanSteps = [
      'Detecting room boundaries...',
      'Identifying furniture...',
      'Measuring dimensions...',
      'Generating floor plan...',
      'Creating 3D model...',
    ];
    
    for (let i = 0; i < scanSteps.length; i++) {
      await this.notifications.sendNotification('Scanning', scanSteps[i]);
      
      // Simulate processing steps
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update progress
      if (this.workflowOptions.collaborationEnabled) {
        await this.broadcastProgress(i / scanSteps.length);
      }
    }
    
    // Perform actual scanning
    const scene = await this.startMeasurementWorkflow();
    
    // Auto-generate room layout
    if (scene.measurements.length > 0) {
      const model = await this.modelGen.generateFromMeasurements(scene.measurements);
      scene.models.push(model);
    }
    
    return scene;
  }

  // Export comprehensive report
  async exportMeasurementReport(format: 'pdf' | 'excel' | 'cad'): Promise<string> {
    if (!this.currentScene) {
      throw new Error('No active scene to export');
    }
    
    // Check subscription for export features
    const subscription = await this.subscription.getCurrentSubscription();
    if (subscription?.plan === 'free' && format === 'cad') {
      throw new Error('CAD export requires Pro subscription');
    }
    
    let exportPath: string;
    
    switch (format) {
      case 'pdf':
        exportPath = await this.exportToPDF();
        break;
      case 'excel':
        exportPath = await this.exportToExcel();
        break;
      case 'cad':
        exportPath = await this.exportToCAD();
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
    
    // Track export
    await this.analytics.trackEvent('report_exported', { format });
    
    return exportPath;
  }

  // Collaboration features
  async startCollaborationSession(roomCode?: string): Promise<string> {
    if (!roomCode) {
      roomCode = this.generateRoomCode();
    }
    
    this.collaborationSession = roomCode;
    this.workflowOptions.collaborationEnabled = true;
    
    // Initialize WebSocket or WebRTC connection
    await this.initializeRealtimeConnection(roomCode);
    
    // Notify team
    await this.notifications.sendNotification(
      'Collaboration Started',
      `Room code: ${roomCode}`
    );
    
    return roomCode;
  }

  async joinCollaborationSession(roomCode: string): Promise<void> {
    this.collaborationSession = roomCode;
    this.workflowOptions.collaborationEnabled = true;
    
    await this.initializeRealtimeConnection(roomCode);
    
    // Sync current state
    await this.syncCollaborationState();
  }

  // Private helper methods
  private async detectDeviceCapabilities(): Promise<any> {
    const capabilities = {
      hasLiDAR: await this.lidarService.isAvailable(),
      hasGPU: await this.checkGPUSupport(),
      hasHighMemory: await this.checkMemoryCapacity(),
      networkSpeed: await this.measureNetworkSpeed(),
    };
    
    return capabilities;
  }

  private async checkGPUSupport(): Promise<boolean> {
    // Check for WebGL2 support
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return !!gl;
    } catch {
      return false;
    }
  }

  private async checkMemoryCapacity(): Promise<boolean> {
    // Check available memory
    const memoryUsage = await this.performance.getMemoryUsage();
    return memoryUsage < 100; // Less than 100MB used
  }

  private async measureNetworkSpeed(): Promise<'fast' | 'medium' | 'slow'> {
    // Simple network speed test
    const startTime = Date.now();
    try {
      await fetch('https://www.google.com/favicon.ico');
      const duration = Date.now() - startTime;
      
      if (duration < 100) return 'fast';
      if (duration < 500) return 'medium';
      return 'slow';
    } catch {
      return 'slow';
    }
  }

  private async optimizeForDevice(capabilities: any): Promise<void> {
    if (!capabilities.hasHighMemory) {
      this.performance.updateSettings({ maxMemoryUsage: 50 });
    }
    
    if (!capabilities.hasGPU) {
      this.performance.updateSettings({ gpuAcceleration: false });
    }
    
    if (capabilities.networkSpeed === 'slow') {
      this.workflowOptions.offlineMode = true;
    }
  }

  private async loadWorkflowOptions(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem('@roomsnap_workflow_options');
      if (saved) {
        this.workflowOptions = { ...this.workflowOptions, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load workflow options:', error);
    }
  }

  private async saveWorkflowOptions(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        '@roomsnap_workflow_options',
        JSON.stringify(this.workflowOptions)
      );
    } catch (error) {
      console.error('Failed to save workflow options:', error);
    }
  }

  private async checkMeasurementLimits(): Promise<boolean> {
    const subscription = await this.subscription.getCurrentSubscription();
    
    if (subscription?.plan === 'pro' || subscription?.plan === 'enterprise') {
      return true;
    }
    
    // Check free tier limits
    const todayMeasurements = await AsyncStorage.getItem('@roomsnap_daily_measurements');
    const count = todayMeasurements ? JSON.parse(todayMeasurements).count : 0;
    
    return count < 10; // Free tier: 10 measurements per day
  }

  private async performLiDARScan(): Promise<void> {
    const pointCloud = await this.lidarService.capturePointCloud();
    
    if (this.currentScene && pointCloud) {
      this.currentScene.pointCloud = pointCloud;
      this.currentScene.metadata.accuracyLevel = 'high';
      
      // Generate mesh from point cloud
      if (this.workflowOptions.generateModels) {
        const model = await this.modelGen.generateFromPointCloud(pointCloud);
        this.currentScene.models.push(model);
      }
    }
  }

  private async performAIAnalysis(imageData: ImageData | string): Promise<void> {
    const analysis = await this.aiVision.processFrame(imageData);
    
    if (this.currentScene) {
      this.currentScene.aiAnalysis = analysis.scene;
      this.currentScene.roomType = analysis.scene.room_type;
      this.currentScene.furniture = analysis.objects.filter(o => 
        this.aiVision['isFurniture'](o.class)
      );
      
      // Add AI suggestions as measurements
      for (const suggestion of analysis.suggestions) {
        const measurement: IntegratedMeasurement = {
          id: `ai_${Date.now()}_${Math.random()}`,
          type: this.mapSuggestionToType(suggestion.type),
          points: suggestion.points.map(p => new THREE.Vector3(p.x, p.y, 0)),
          distance: suggestion.expectedValue || 0,
          unit: 'meters',
          confidence: suggestion.confidence,
          aiSuggestions: [suggestion.reason],
          timestamp: new Date(),
        };
        
        this.currentScene.measurements.push(measurement);
      }
    }
  }

  private async generate3DModels(): Promise<void> {
    if (!this.currentScene || this.currentScene.measurements.length === 0) {
      return;
    }
    
    // Generate room model from measurements
    const roomModel = await this.modelGen.generateFromMeasurements(
      this.currentScene.measurements
    );
    
    this.currentScene.models.push(roomModel);
    
    // Generate furniture models
    if (this.currentScene.furniture) {
      for (const furniture of this.currentScene.furniture) {
        if (furniture.dimensions) {
          const model = await this.modelGen.generateFurniture(
            furniture.furniture_type || furniture.class,
            furniture.dimensions
          );
          
          this.currentScene.models.push(model);
        }
      }
    }
  }

  private calculateAccuracyLevel(): 'high' | 'medium' | 'low' {
    if (!this.currentScene) return 'low';
    
    // High accuracy if LiDAR was used
    if (this.currentScene.pointCloud) {
      return 'high';
    }
    
    // Medium accuracy if AI confidence is high
    if (this.currentScene.measurements.some(m => m.confidence > 0.8)) {
      return 'medium';
    }
    
    return 'low';
  }

  private async trackMeasurementAnalytics(): Promise<void> {
    if (!this.currentScene) return;
    
    await this.analytics.trackEvent('measurement_workflow_completed', {
      measurementCount: this.currentScene.measurements.length,
      modelCount: this.currentScene.models.length,
      hasAI: !!this.currentScene.aiAnalysis,
      hasLiDAR: !!this.currentScene.pointCloud,
      accuracyLevel: this.currentScene.metadata.accuracyLevel,
      processingTime: this.currentScene.metadata.processingTime,
      roomType: this.currentScene.roomType,
    });
  }

  private async saveSceneOffline(): Promise<void> {
    if (!this.currentScene) return;
    
    const sceneId = `scene_${Date.now()}`;
    
    await this.offlineSync.saveOffline(sceneId, this.currentScene, {
      compress: true,
      encrypt: true,
    });
    
    // Queue for sync when online
    await this.offlineSync.queueOperation({
      type: 'create',
      entity: 'scene',
      data: this.currentScene,
    });
  }

  private async handleWorkflowError(error: any): Promise<void> {
    console.error('Workflow error:', error);
    
    await this.analytics.trackEvent('workflow_error', {
      error: error.message,
      stack: error.stack,
    });
    
    // Notify user
    await this.notifications.sendNotification(
      'Measurement Error',
      'An error occurred during measurement. Please try again.'
    );
  }

  private async broadcastSceneUpdate(): Promise<void> {
    if (!this.collaborationSession || !this.currentScene) return;
    
    // Broadcast to all collaborators
    // This would use WebSocket or WebRTC
    console.log('Broadcasting scene update to collaborators');
  }

  private async broadcastProgress(progress: number): Promise<void> {
    if (!this.collaborationSession) return;
    
    console.log(`Broadcasting progress: ${progress * 100}%`);
  }

  private async initializeRealtimeConnection(roomCode: string): Promise<void> {
    // Initialize WebSocket or WebRTC connection
    console.log(`Initializing realtime connection for room: ${roomCode}`);
  }

  private async syncCollaborationState(): Promise<void> {
    // Sync current state with collaborators
    console.log('Syncing collaboration state');
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private findNearestObject(point: THREE.Vector3, objects: any[]): any {
    let nearest = null;
    let minDistance = Infinity;
    
    for (const obj of objects) {
      const objCenter = new THREE.Vector3(
        obj.bbox.x + obj.bbox.width / 2,
        obj.bbox.y + obj.bbox.height / 2,
        0
      );
      
      const distance = point.distanceTo(objCenter);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = obj;
      }
    }
    
    return nearest;
  }

  private mapObjectToMeasurementType(objectClass: string): IntegratedMeasurement['type'] {
    const mapping: Record<string, IntegratedMeasurement['type']> = {
      'chair': 'furniture',
      'couch': 'furniture',
      'table': 'furniture',
      'bed': 'furniture',
      'wall': 'wall',
      'floor': 'floor',
    };
    
    return mapping[objectClass] || 'object';
  }

  private mapSuggestionToType(suggestionType: string): IntegratedMeasurement['type'] {
    const mapping: Record<string, IntegratedMeasurement['type']> = {
      'wall_length': 'wall',
      'furniture_dimension': 'furniture',
      'room_dimension': 'room',
    };
    
    return mapping[suggestionType] || 'object';
  }

  private async getDeviceCapabilityList(): Promise<string[]> {
    const capabilities: string[] = [];
    
    if (await this.lidarService.isAvailable()) {
      capabilities.push('lidar');
    }
    
    if (await this.checkGPUSupport()) {
      capabilities.push('gpu');
    }
    
    if (this.offlineSync.getIsOnline()) {
      capabilities.push('online');
    }
    
    return capabilities;
  }

  private async exportToPDF(): Promise<string> {
    // Export scene to PDF
    // Implementation would use pdf-lib
    return 'path/to/report.pdf';
  }

  private async exportToExcel(): Promise<string> {
    // Export measurements to Excel
    return 'path/to/measurements.xlsx';
  }

  private async exportToCAD(): Promise<string> {
    if (!this.currentScene || this.currentScene.models.length === 0) {
      throw new Error('No models to export');
    }
    
    // Export first model to DXF
    const modelId = this.currentScene.models[0].id;
    return await this.modelGen.exportToCAD(modelId, 'dxf');
  }

  // Public API
  updateWorkflowOptions(options: Partial<WorkflowOptions>): void {
    this.workflowOptions = { ...this.workflowOptions, ...options };
    this.saveWorkflowOptions();
  }

  getWorkflowOptions(): WorkflowOptions {
    return { ...this.workflowOptions };
  }

  getCurrentScene(): SceneData | null {
    return this.currentScene;
  }

  clearCurrentScene(): void {
    this.currentScene = null;
  }

  async getProcessingMetrics(): Promise<Record<string, number>> {
    return Object.fromEntries(this.processingTimes);
  }

  async endCollaborationSession(): Promise<void> {
    this.collaborationSession = null;
    this.workflowOptions.collaborationEnabled = false;
    this.collaborators.clear();
    
    await this.saveWorkflowOptions();
  }

  dispose(): void {
    this.clearCurrentScene();
    this.processingTimes.clear();
    this.collaborators.clear();
  }
}