import * as THREE from 'three';
import { Platform } from 'react-native';

export interface DepthData {
  width: number;
  height: number;
  data: Float32Array;
  timestamp: number;
}

export interface PointCloud {
  points: THREE.Vector3[];
  colors?: THREE.Color[];
  normals?: THREE.Vector3[];
  confidence: number[];
}

export interface PlaneDetection {
  id: string;
  type: 'horizontal' | 'vertical';
  center: THREE.Vector3;
  normal: THREE.Vector3;
  extent: { width: number; height: number };
  confidence: number;
  classification?: 'floor' | 'ceiling' | 'wall' | 'table' | 'unknown';
}

export interface MeshReconstruction {
  vertices: Float32Array;
  faces: Uint32Array;
  normals: Float32Array;
  uvs?: Float32Array;
}

export class LiDARService {
  private static instance: LiDARService;
  private isLiDARAvailable: boolean = false;
  private depthDataBuffer: DepthData[] = [];
  private pointCloudCache: Map<string, PointCloud> = new Map();
  private detectedPlanes: Map<string, PlaneDetection> = new Map();
  private meshReconstruction: MeshReconstruction | null = null;
  
  // Configuration
  private config = {
    minConfidence: 0.7,
    maxPointDistance: 5.0, // meters
    pointDensity: 1000, // points per square meter
    planeDetectionThreshold: 0.02, // meters
    meshSimplification: 0.5, // 0-1
    enableColorMapping: true,
    enableNormalEstimation: true,
  };

  static getInstance(): LiDARService {
    if (!LiDARService.instance) {
      LiDARService.instance = new LiDARService();
    }
    return LiDARService.instance;
  }

  async initialize(): Promise<boolean> {
    this.isLiDARAvailable = await this.checkLiDARSupport();
    
    if (this.isLiDARAvailable) {
      console.log('LiDAR sensor detected and initialized');
      await this.calibrateSensor();
      return true;
    }
    
    console.log('LiDAR not available on this device');
    return false;
  }

  private async checkLiDARSupport(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    
    // Check for iPhone 12 Pro, 13 Pro, 14 Pro, 15 Pro, iPad Pro with LiDAR
    // In production, use native module to check device capabilities
    try {
      // This would be a native module call
      // const DeviceInfo = NativeModules.DeviceInfo;
      // return await DeviceInfo.hasLiDAR();
      
      // Mock for development
      return Platform.Version >= '14.0';
    } catch {
      return false;
    }
  }

  async captureDepthData(): Promise<DepthData> {
    if (!this.isLiDARAvailable) {
      throw new Error('LiDAR not available');
    }
    
    // In production, this would interface with ARKit's depth data
    // const depthData = await NativeModules.LiDAR.captureDepth();
    
    // Mock depth data for development
    const width = 256;
    const height = 192;
    const data = new Float32Array(width * height);
    
    // Generate realistic depth values (0.2m to 5m)
    for (let i = 0; i < data.length; i++) {
      data[i] = 0.2 + Math.random() * 4.8;
    }
    
    const depth: DepthData = {
      width,
      height,
      data,
      timestamp: Date.now(),
    };
    
    this.depthDataBuffer.push(depth);
    if (this.depthDataBuffer.length > 10) {
      this.depthDataBuffer.shift();
    }
    
    return depth;
  }

  async generatePointCloud(depthData: DepthData): Promise<PointCloud> {
    const cacheKey = `${depthData.timestamp}`;
    
    if (this.pointCloudCache.has(cacheKey)) {
      return this.pointCloudCache.get(cacheKey)!;
    }
    
    const points: THREE.Vector3[] = [];
    const colors: THREE.Color[] = [];
    const confidence: number[] = [];
    const normals: THREE.Vector3[] = [];
    
    const { width, height, data } = depthData;
    
    // Camera intrinsics (would come from device calibration)
    const fx = 525.0; // Focal length x
    const fy = 525.0; // Focal length y
    const cx = width / 2; // Principal point x
    const cy = height / 2; // Principal point y
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const depth = data[idx];
        
        if (depth > 0 && depth < this.config.maxPointDistance) {
          // Convert pixel to 3D point
          const worldX = (x - cx) * depth / fx;
          const worldY = (y - cy) * depth / fy;
          const worldZ = depth;
          
          points.push(new THREE.Vector3(worldX, worldY, worldZ));
          
          // Estimate confidence based on depth (closer = more confident)
          const conf = Math.max(0, 1 - (depth / this.config.maxPointDistance));
          confidence.push(conf);
          
          // Color based on depth (optional)
          if (this.config.enableColorMapping) {
            const hue = (1 - depth / this.config.maxPointDistance) * 240; // Blue to red
            colors.push(new THREE.Color().setHSL(hue / 360, 1, 0.5));
          }
          
          // Estimate normal (simplified)
          if (this.config.enableNormalEstimation && x > 0 && y > 0) {
            const normal = this.estimateNormal(x, y, width, height, data);
            normals.push(normal);
          }
        }
      }
    }
    
    const pointCloud: PointCloud = {
      points,
      colors: this.config.enableColorMapping ? colors : undefined,
      normals: this.config.enableNormalEstimation ? normals : undefined,
      confidence,
    };
    
    this.pointCloudCache.set(cacheKey, pointCloud);
    
    // Limit cache size
    if (this.pointCloudCache.size > 20) {
      const firstKey = this.pointCloudCache.keys().next().value;
      this.pointCloudCache.delete(firstKey);
    }
    
    return pointCloud;
  }

  async detectPlanes(pointCloud: PointCloud): Promise<PlaneDetection[]> {
    const planes: PlaneDetection[] = [];
    
    // RANSAC plane detection
    const iterations = 100;
    const inlierThreshold = this.config.planeDetectionThreshold;
    const minInliers = pointCloud.points.length * 0.1;
    
    const usedPoints = new Set<number>();
    
    for (let planeIdx = 0; planeIdx < 5; planeIdx++) { // Detect up to 5 planes
      let bestPlane: PlaneDetection | null = null;
      let bestInliers: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        // Random sample 3 points
        const sample: number[] = [];
        while (sample.length < 3) {
          const idx = Math.floor(Math.random() * pointCloud.points.length);
          if (!usedPoints.has(idx) && !sample.includes(idx)) {
            sample.push(idx);
          }
        }
        
        // Calculate plane from 3 points
        const p1 = pointCloud.points[sample[0]];
        const p2 = pointCloud.points[sample[1]];
        const p3 = pointCloud.points[sample[2]];
        
        const v1 = new THREE.Vector3().subVectors(p2, p1);
        const v2 = new THREE.Vector3().subVectors(p3, p1);
        const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
        
        // Find inliers
        const inliers: number[] = [];
        let centerSum = new THREE.Vector3();
        
        for (let j = 0; j < pointCloud.points.length; j++) {
          if (usedPoints.has(j)) continue;
          
          const point = pointCloud.points[j];
          const distance = Math.abs(
            normal.dot(new THREE.Vector3().subVectors(point, p1))
          );
          
          if (distance < inlierThreshold) {
            inliers.push(j);
            centerSum.add(point);
          }
        }
        
        // Check if this is the best plane so far
        if (inliers.length > bestInliers.length && inliers.length > minInliers) {
          const center = centerSum.divideScalar(inliers.length);
          
          // Determine plane type
          const isHorizontal = Math.abs(normal.y) > 0.9;
          const type = isHorizontal ? 'horizontal' : 'vertical';
          
          // Estimate extent
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity;
          
          for (const idx of inliers) {
            const p = pointCloud.points[idx];
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          
          bestPlane = {
            id: `plane_${Date.now()}_${planeIdx}`,
            type,
            center,
            normal,
            extent: {
              width: maxX - minX,
              height: maxY - minY,
            },
            confidence: inliers.length / pointCloud.points.length,
            classification: this.classifyPlane(center, normal, isHorizontal),
          };
          
          bestInliers = inliers;
        }
      }
      
      if (bestPlane) {
        planes.push(bestPlane);
        this.detectedPlanes.set(bestPlane.id, bestPlane);
        
        // Mark points as used
        for (const idx of bestInliers) {
          usedPoints.add(idx);
        }
      }
    }
    
    return planes;
  }

  async generateMesh(pointCloud: PointCloud): Promise<MeshReconstruction> {
    // Poisson surface reconstruction (simplified)
    // In production, use a proper implementation like Open3D
    
    const vertices: number[] = [];
    const faces: number[] = [];
    const normals: number[] = [];
    
    // Convert point cloud to vertices
    for (let i = 0; i < pointCloud.points.length; i++) {
      const p = pointCloud.points[i];
      vertices.push(p.x, p.y, p.z);
      
      if (pointCloud.normals && pointCloud.normals[i]) {
        const n = pointCloud.normals[i];
        normals.push(n.x, n.y, n.z);
      } else {
        normals.push(0, 1, 0); // Default up normal
      }
    }
    
    // Delaunay triangulation (simplified - would use proper algorithm)
    for (let i = 0; i < pointCloud.points.length - 2; i++) {
      if (i % 2 === 0) {
        faces.push(i, i + 1, i + 2);
      }
    }
    
    this.meshReconstruction = {
      vertices: new Float32Array(vertices),
      faces: new Uint32Array(faces),
      normals: new Float32Array(normals),
    };
    
    return this.meshReconstruction;
  }

  async measureWithLiDAR(
    startPoint: THREE.Vector3,
    endPoint: THREE.Vector3
  ): Promise<{ distance: number; accuracy: number }> {
    if (!this.isLiDARAvailable) {
      throw new Error('LiDAR not available');
    }
    
    // Get depth data at both points
    const depthData = await this.captureDepthData();
    
    // Project points to depth map
    const startDepth = this.sampleDepthAt(startPoint, depthData);
    const endDepth = this.sampleDepthAt(endPoint, depthData);
    
    // Calculate 3D distance with depth correction
    const correctedStart = new THREE.Vector3(
      startPoint.x,
      startPoint.y,
      startDepth
    );
    
    const correctedEnd = new THREE.Vector3(
      endPoint.x,
      endPoint.y,
      endDepth
    );
    
    const distance = correctedStart.distanceTo(correctedEnd);
    
    // Estimate accuracy based on depth confidence
    const accuracy = this.estimateAccuracy(startDepth, endDepth);
    
    return { distance, accuracy };
  }

  async detectObjects(pointCloud: PointCloud): Promise<any[]> {
    // ML-based object detection on point clouds
    // Would integrate with CoreML or TensorFlow Lite
    
    const objects = [];
    
    // Simplified object detection based on geometric features
    for (const plane of this.detectedPlanes.values()) {
      if (plane.classification === 'table') {
        objects.push({
          type: 'table',
          bounds: plane.extent,
          position: plane.center,
          confidence: plane.confidence,
        });
      }
    }
    
    return objects;
  }

  private estimateNormal(
    x: number,
    y: number,
    width: number,
    height: number,
    depthData: Float32Array
  ): THREE.Vector3 {
    // Estimate surface normal from neighboring points
    const idx = y * width + x;
    const depth = depthData[idx];
    
    const dx = x < width - 1 ? depthData[idx + 1] - depth : 0;
    const dy = y < height - 1 ? depthData[idx + width] - depth : 0;
    
    const normal = new THREE.Vector3(-dx, -dy, 1).normalize();
    return normal;
  }

  private classifyPlane(
    center: THREE.Vector3,
    normal: THREE.Vector3,
    isHorizontal: boolean
  ): PlaneDetection['classification'] {
    if (isHorizontal) {
      // Floor is typically lowest horizontal plane
      if (center.y < -0.5) return 'floor';
      // Ceiling is highest
      if (center.y > 2.0) return 'ceiling';
      // Table is mid-height
      if (center.y > 0.5 && center.y < 1.2) return 'table';
    } else {
      // Vertical planes are typically walls
      return 'wall';
    }
    
    return 'unknown';
  }

  private sampleDepthAt(point: THREE.Vector3, depthData: DepthData): number {
    // Convert 3D point to depth map coordinates
    const fx = 525.0;
    const fy = 525.0;
    const cx = depthData.width / 2;
    const cy = depthData.height / 2;
    
    const x = Math.round((point.x * fx / point.z) + cx);
    const y = Math.round((point.y * fy / point.z) + cy);
    
    if (x >= 0 && x < depthData.width && y >= 0 && y < depthData.height) {
      const idx = y * depthData.width + x;
      return depthData.data[idx];
    }
    
    return point.z; // Fallback to original depth
  }

  private estimateAccuracy(depth1: number, depth2: number): number {
    // Accuracy decreases with distance
    const avgDepth = (depth1 + depth2) / 2;
    
    // LiDAR accuracy model (approximate)
    // ±1mm at 0.5m, ±5mm at 5m
    const baseAccuracy = 0.001; // 1mm
    const accuracyFactor = avgDepth / 0.5;
    
    return baseAccuracy * accuracyFactor;
  }

  private async calibrateSensor(): Promise<void> {
    // Sensor calibration routine
    console.log('Calibrating LiDAR sensor...');
    
    // In production, this would:
    // 1. Capture reference measurements
    // 2. Calculate intrinsic parameters
    // 3. Perform temperature compensation
    // 4. Store calibration data
  }

  async exportPointCloud(format: 'ply' | 'pcd' | 'xyz'): Promise<string> {
    const latestCloud = Array.from(this.pointCloudCache.values()).pop();
    if (!latestCloud) throw new Error('No point cloud data available');
    
    switch (format) {
      case 'ply':
        return this.exportToPLY(latestCloud);
      case 'pcd':
        return this.exportToPCD(latestCloud);
      case 'xyz':
        return this.exportToXYZ(latestCloud);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private exportToPLY(pointCloud: PointCloud): string {
    let ply = 'ply\n';
    ply += 'format ascii 1.0\n';
    ply += `element vertex ${pointCloud.points.length}\n`;
    ply += 'property float x\n';
    ply += 'property float y\n';
    ply += 'property float z\n';
    
    if (pointCloud.colors) {
      ply += 'property uchar red\n';
      ply += 'property uchar green\n';
      ply += 'property uchar blue\n';
    }
    
    ply += 'end_header\n';
    
    for (let i = 0; i < pointCloud.points.length; i++) {
      const p = pointCloud.points[i];
      ply += `${p.x} ${p.y} ${p.z}`;
      
      if (pointCloud.colors) {
        const c = pointCloud.colors[i];
        ply += ` ${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)}`;
      }
      
      ply += '\n';
    }
    
    return ply;
  }

  private exportToPCD(pointCloud: PointCloud): string {
    // Point Cloud Data format
    let pcd = '# .PCD v0.7 - Point Cloud Data file format\n';
    pcd += 'VERSION 0.7\n';
    pcd += 'FIELDS x y z\n';
    pcd += 'SIZE 4 4 4\n';
    pcd += 'TYPE F F F\n';
    pcd += 'COUNT 1 1 1\n';
    pcd += `WIDTH ${pointCloud.points.length}\n`;
    pcd += 'HEIGHT 1\n';
    pcd += 'VIEWPOINT 0 0 0 1 0 0 0\n';
    pcd += `POINTS ${pointCloud.points.length}\n`;
    pcd += 'DATA ascii\n';
    
    for (const point of pointCloud.points) {
      pcd += `${point.x} ${point.y} ${point.z}\n`;
    }
    
    return pcd;
  }

  private exportToXYZ(pointCloud: PointCloud): string {
    let xyz = '';
    for (const point of pointCloud.points) {
      xyz += `${point.x} ${point.y} ${point.z}\n`;
    }
    return xyz;
  }

  getIsLiDARAvailable(): boolean {
    return this.isLiDARAvailable;
  }

  clearCache(): void {
    this.pointCloudCache.clear();
    this.detectedPlanes.clear();
    this.depthDataBuffer = [];
    this.meshReconstruction = null;
  }
}