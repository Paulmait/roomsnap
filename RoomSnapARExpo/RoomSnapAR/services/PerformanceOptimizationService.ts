import { Platform, InteractionManager } from 'react-native';
import * as tf from '@tensorflow/tfjs';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  cpuUsage: number;
  batteryLevel: number;
  networkLatency: number;
  renderTime: number;
  jsThreadTime: number;
}

export interface OptimizationSettings {
  dynamicQuality: boolean;
  targetFPS: number;
  maxMemoryUsage: number; // MB
  batchProcessing: boolean;
  lazyLoading: boolean;
  cacheSize: number; // MB
  webAssemblyEnabled: boolean;
  gpuAcceleration: boolean;
}

export class PerformanceOptimizationService {
  private static instance: PerformanceOptimizationService;
  private metrics: PerformanceMetrics = {
    fps: 60,
    memoryUsage: 0,
    cpuUsage: 0,
    batteryLevel: 100,
    networkLatency: 0,
    renderTime: 0,
    jsThreadTime: 0,
  };
  
  private settings: OptimizationSettings = {
    dynamicQuality: true,
    targetFPS: 60,
    maxMemoryUsage: 150,
    batchProcessing: true,
    lazyLoading: true,
    cacheSize: 50,
    webAssemblyEnabled: true,
    gpuAcceleration: true,
  };
  
  private frameCount = 0;
  private lastFrameTime = Date.now();
  private renderQueue: Map<string, () => Promise<void>> = new Map();
  private memoryCache: Map<string, { data: any; size: number; lastAccess: number }> = new Map();
  private wasmModules: Map<string, WebAssembly.Module> = new Map();
  
  // Quality levels
  private qualityLevel: 'low' | 'medium' | 'high' = 'high';
  private readonly QUALITY_SETTINGS = {
    low: {
      textureSize: 512,
      meshSimplification: 0.3,
      shadowQuality: 'none',
      antialiasing: false,
      pointCloudDensity: 0.3,
      aiFrameSkip: 5,
    },
    medium: {
      textureSize: 1024,
      meshSimplification: 0.6,
      shadowQuality: 'low',
      antialiasing: false,
      pointCloudDensity: 0.6,
      aiFrameSkip: 3,
    },
    high: {
      textureSize: 2048,
      meshSimplification: 1.0,
      shadowQuality: 'high',
      antialiasing: true,
      pointCloudDensity: 1.0,
      aiFrameSkip: 1,
    },
  };

  static getInstance(): PerformanceOptimizationService {
    if (!PerformanceOptimizationService.instance) {
      PerformanceOptimizationService.instance = new PerformanceOptimizationService();
    }
    return PerformanceOptimizationService.instance;
  }

  async initialize(): Promise<void> {
    // Load saved settings
    await this.loadSettings();
    
    // Initialize WebAssembly if supported
    if (this.settings.webAssemblyEnabled) {
      await this.initializeWebAssembly();
    }
    
    // Set up TensorFlow.js optimization
    if (this.settings.gpuAcceleration) {
      await this.optimizeTensorFlow();
    }
    
    // Start performance monitoring
    this.startPerformanceMonitoring();
    
    console.log('Performance optimization initialized');
  }

  // WebAssembly Acceleration
  private async initializeWebAssembly(): Promise<void> {
    try {
      // Load WASM modules for heavy computations
      const modules = [
        { name: 'imageProcessing', url: '/wasm/image_processing.wasm' },
        { name: 'pointCloud', url: '/wasm/point_cloud.wasm' },
        { name: 'meshOptimization', url: '/wasm/mesh_optimization.wasm' },
        { name: 'mathOperations', url: '/wasm/math_operations.wasm' },
      ];
      
      for (const module of modules) {
        try {
          const response = await fetch(module.url);
          const bytes = await response.arrayBuffer();
          const wasmModule = await WebAssembly.compile(bytes);
          this.wasmModules.set(module.name, wasmModule);
        } catch (error) {
          console.warn(`Failed to load WASM module ${module.name}:`, error);
        }
      }
      
      console.log('WebAssembly modules loaded');
    } catch (error) {
      console.error('WebAssembly initialization failed:', error);
      this.settings.webAssemblyEnabled = false;
    }
  }

  // Image Processing with WASM (10x faster)
  async processImageWASM(imageData: ImageData): Promise<ImageData> {
    const wasmModule = this.wasmModules.get('imageProcessing');
    
    if (!wasmModule) {
      return this.processImageJS(imageData);
    }
    
    const instance = await WebAssembly.instantiate(wasmModule);
    const exports = instance.exports as any;
    
    // Allocate memory in WASM
    const ptr = exports.allocate(imageData.data.length);
    const memory = new Uint8Array(exports.memory.buffer);
    
    // Copy image data to WASM memory
    memory.set(imageData.data, ptr);
    
    // Process in WASM (edge detection, filters, etc.)
    exports.processImage(ptr, imageData.width, imageData.height);
    
    // Copy result back
    const result = new ImageData(
      new Uint8ClampedArray(memory.slice(ptr, ptr + imageData.data.length)),
      imageData.width,
      imageData.height
    );
    
    // Free WASM memory
    exports.deallocate(ptr);
    
    return result;
  }

  private processImageJS(imageData: ImageData): ImageData {
    // Fallback JavaScript implementation
    // Apply basic edge detection
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const output = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Sobel edge detection
        const gx = 
          -1 * data[((y - 1) * width + (x - 1)) * 4] +
          1 * data[((y - 1) * width + (x + 1)) * 4] +
          -2 * data[(y * width + (x - 1)) * 4] +
          2 * data[(y * width + (x + 1)) * 4] +
          -1 * data[((y + 1) * width + (x - 1)) * 4] +
          1 * data[((y + 1) * width + (x + 1)) * 4];
        
        const gy = 
          -1 * data[((y - 1) * width + (x - 1)) * 4] +
          -2 * data[((y - 1) * width + x) * 4] +
          -1 * data[((y - 1) * width + (x + 1)) * 4] +
          1 * data[((y + 1) * width + (x - 1)) * 4] +
          2 * data[((y + 1) * width + x) * 4] +
          1 * data[((y + 1) * width + (x + 1)) * 4];
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        
        output[idx] = magnitude;
        output[idx + 1] = magnitude;
        output[idx + 2] = magnitude;
        output[idx + 3] = 255;
      }
    }
    
    return new ImageData(output, width, height);
  }

  // TensorFlow.js Optimization
  private async optimizeTensorFlow(): Promise<void> {
    // Set TensorFlow.js backend
    await tf.setBackend('webgl');
    
    // Enable WebGL optimizations
    tf.env().set('WEBGL_VERSION', 2);
    tf.env().set('WEBGL_CPU_FORWARD', false);
    tf.env().set('WEBGL_PACK', true);
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
    tf.env().set('WEBGL_RENDER_FLOAT32_CAPABLE', true);
    
    console.log('TensorFlow.js optimized for WebGL');
  }

  // Dynamic Quality Adjustment
  private adjustQualityBasedOnPerformance(): void {
    if (!this.settings.dynamicQuality) return;
    
    const { fps, memoryUsage, batteryLevel } = this.metrics;
    
    // Determine quality level based on metrics
    if (fps < 30 || memoryUsage > this.settings.maxMemoryUsage || batteryLevel < 20) {
      this.qualityLevel = 'low';
    } else if (fps < 45 || memoryUsage > this.settings.maxMemoryUsage * 0.8 || batteryLevel < 40) {
      this.qualityLevel = 'medium';
    } else {
      this.qualityLevel = 'high';
    }
  }

  // Frame Rate Optimization
  private startPerformanceMonitoring(): void {
    const measureFPS = () => {
      const now = Date.now();
      const delta = now - this.lastFrameTime;
      
      if (delta >= 1000) {
        this.metrics.fps = Math.round((this.frameCount * 1000) / delta);
        this.frameCount = 0;
        this.lastFrameTime = now;
        
        // Adjust quality if needed
        this.adjustQualityBasedOnPerformance();
      }
      
      this.frameCount++;
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }

  // Batch Processing
  async batchProcess<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 10
  ): Promise<R[]> {
    if (!this.settings.batchProcessing) {
      return Promise.all(items.map(processor));
    }
    
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
      
      // Allow UI to update between batches
      await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
    }
    
    return results;
  }

  // Memory Management
  async cacheData(key: string, data: any, sizeInBytes?: number): Promise<void> {
    const size = sizeInBytes || JSON.stringify(data).length;
    
    // Check cache size limit
    let totalSize = size;
    for (const [, value] of this.memoryCache) {
      totalSize += value.size;
    }
    
    // Evict old entries if needed (LRU)
    while (totalSize > this.settings.cacheSize * 1024 * 1024) {
      let oldestKey = '';
      let oldestTime = Date.now();
      
      for (const [k, v] of this.memoryCache) {
        if (v.lastAccess < oldestTime) {
          oldestTime = v.lastAccess;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        const removed = this.memoryCache.get(oldestKey);
        if (removed) {
          totalSize -= removed.size;
          this.memoryCache.delete(oldestKey);
        }
      } else {
        break;
      }
    }
    
    this.memoryCache.set(key, {
      data,
      size,
      lastAccess: Date.now(),
    });
  }

  getCachedData(key: string): any {
    const cached = this.memoryCache.get(key);
    
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.data;
    }
    
    return null;
  }

  // Lazy Loading
  async lazyLoad<T>(
    loader: () => Promise<T>,
    placeholder?: T
  ): Promise<T> {
    if (!this.settings.lazyLoading) {
      return loader();
    }
    
    // Return placeholder immediately
    if (placeholder !== undefined) {
      InteractionManager.runAfterInteractions(() => {
        loader();
      });
      return placeholder;
    }
    
    // Load after interactions
    return new Promise((resolve) => {
      InteractionManager.runAfterInteractions(async () => {
        const result = await loader();
        resolve(result);
      });
    });
  }

  // Render Queue Management
  async queueRender(id: string, renderFunc: () => Promise<void>): Promise<void> {
    this.renderQueue.set(id, renderFunc);
    
    // Process queue in next frame
    requestAnimationFrame(async () => {
      const func = this.renderQueue.get(id);
      if (func) {
        await func();
        this.renderQueue.delete(id);
      }
    });
  }

  // Matrix Operations Optimization
  async multiplyMatricesWASM(a: Float32Array, b: Float32Array, size: number): Promise<Float32Array> {
    const wasmModule = this.wasmModules.get('mathOperations');
    
    if (!wasmModule) {
      return this.multiplyMatricesJS(a, b, size);
    }
    
    const instance = await WebAssembly.instantiate(wasmModule);
    const exports = instance.exports as any;
    
    const bytesPerMatrix = size * size * 4;
    const ptrA = exports.allocate(bytesPerMatrix);
    const ptrB = exports.allocate(bytesPerMatrix);
    const ptrResult = exports.allocate(bytesPerMatrix);
    
    const memory = new Float32Array(exports.memory.buffer);
    
    memory.set(a, ptrA / 4);
    memory.set(b, ptrB / 4);
    
    exports.matrixMultiply(ptrA, ptrB, ptrResult, size);
    
    const result = new Float32Array(size * size);
    result.set(memory.slice(ptrResult / 4, ptrResult / 4 + size * size));
    
    exports.deallocate(ptrA);
    exports.deallocate(ptrB);
    exports.deallocate(ptrResult);
    
    return result;
  }

  private multiplyMatricesJS(a: Float32Array, b: Float32Array, size: number): Float32Array {
    const result = new Float32Array(size * size);
    
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let sum = 0;
        for (let k = 0; k < size; k++) {
          sum += a[i * size + k] * b[k * size + j];
        }
        result[i * size + j] = sum;
      }
    }
    
    return result;
  }

  // Point Cloud Processing Optimization
  async processPointCloudWASM(points: Float32Array, count: number): Promise<Float32Array> {
    const wasmModule = this.wasmModules.get('pointCloud');
    
    if (!wasmModule) {
      return points; // Return unprocessed
    }
    
    const instance = await WebAssembly.instantiate(wasmModule);
    const exports = instance.exports as any;
    
    const bytesNeeded = count * 3 * 4; // 3 floats per point
    const ptr = exports.allocate(bytesNeeded);
    
    const memory = new Float32Array(exports.memory.buffer);
    memory.set(points, ptr / 4);
    
    // Process point cloud (filtering, downsampling, etc.)
    exports.processPointCloud(ptr, count);
    
    const result = new Float32Array(count * 3);
    result.set(memory.slice(ptr / 4, ptr / 4 + count * 3));
    
    exports.deallocate(ptr);
    
    return result;
  }

  // Texture Compression
  async compressTexture(imageData: ImageData, quality: 'low' | 'medium' | 'high'): Promise<ImageData> {
    const targetSize = this.QUALITY_SETTINGS[quality].textureSize;
    
    if (imageData.width <= targetSize && imageData.height <= targetSize) {
      return imageData;
    }
    
    // Resize texture
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    
    const ctx = canvas.getContext('2d')!;
    
    // Create temp canvas with original image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);
    
    // Draw scaled down version
    ctx.drawImage(tempCanvas, 0, 0, targetSize, targetSize);
    
    return ctx.getImageData(0, 0, targetSize, targetSize);
  }

  // Memory Monitoring
  async getMemoryUsage(): Promise<number> {
    if (Platform.OS === 'web') {
      // @ts-ignore
      if (performance.memory) {
        // @ts-ignore
        return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      }
    }
    
    // Estimate based on cache size
    let usage = 0;
    for (const [, value] of this.memoryCache) {
      usage += value.size;
    }
    
    return Math.round(usage / 1024 / 1024);
  }

  // Battery Optimization
  async optimizeForBattery(): Promise<void> {
    // Reduce quality settings
    this.qualityLevel = 'low';
    
    // Disable non-essential features
    this.settings.gpuAcceleration = false;
    this.settings.dynamicQuality = false;
    
    // Increase frame skip for AI
    if (this.qualityLevel === 'low') {
      this.QUALITY_SETTINGS.low.aiFrameSkip = 10;
    }
    
    console.log('Battery optimization mode enabled');
  }

  // Network Optimization
  async preloadResources(urls: string[]): Promise<void> {
    const preloadPromises = urls.map(async (url) => {
      const cacheKey = `preload_${url}`;
      
      // Check cache first
      if (this.getCachedData(cacheKey)) {
        return;
      }
      
      try {
        const response = await fetch(url);
        const data = await response.blob();
        await this.cacheData(cacheKey, data, data.size);
      } catch (error) {
        console.warn(`Failed to preload ${url}:`, error);
      }
    });
    
    await Promise.all(preloadPromises);
  }

  // Settings Management
  private async loadSettings(): Promise<void> {
    try {
      const saved = await AsyncStorage.getItem('@performance_settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load performance settings:', error);
    }
  }

  async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem('@performance_settings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save performance settings:', error);
    }
  }

  // Public API
  getQualityLevel(): 'low' | 'medium' | 'high' {
    return this.qualityLevel;
  }

  getQualitySettings() {
    return this.QUALITY_SETTINGS[this.qualityLevel];
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  updateSettings(settings: Partial<OptimizationSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.saveSettings();
  }

  async clearCache(): Promise<void> {
    this.memoryCache.clear();
  }

  dispose(): void {
    this.memoryCache.clear();
    this.renderQueue.clear();
    this.wasmModules.clear();
  }
}