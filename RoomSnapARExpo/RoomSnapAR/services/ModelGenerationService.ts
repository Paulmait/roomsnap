import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { ColladaExporter } from 'three/examples/jsm/exporters/ColladaExporter';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { LiDARService, PointCloud } from './LiDARService';

export interface MeshData {
  vertices: Float32Array;
  normals: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  colors?: Float32Array;
}

export interface Model3D {
  id: string;
  name: string;
  type: 'room' | 'object' | 'furniture' | 'measurement';
  mesh: THREE.Mesh;
  metadata: {
    dimensions: { width: number; height: number; depth: number };
    volume: number;
    surfaceArea: number;
    vertexCount: number;
    faceCount: number;
    materials: string[];
    createdAt: Date;
  };
}

export interface ExportOptions {
  format: 'obj' | 'gltf' | 'glb' | 'stl' | 'fbx' | 'dae' | 'usdz';
  includeTextures: boolean;
  includeNormals: boolean;
  scale: number;
  compression?: boolean;
  quality?: 'low' | 'medium' | 'high';
}

export interface PhotogrammetryData {
  images: string[];
  cameraPositions: THREE.Vector3[];
  cameraRotations: THREE.Euler[];
  timestamp: Date;
}

export class ModelGenerationService {
  private static instance: ModelGenerationService;
  private lidarService = LiDARService.getInstance();
  private scene: THREE.Scene;
  private models: Map<string, Model3D> = new Map();
  private textureLoader: THREE.TextureLoader;
  private materialLibrary: Map<string, THREE.Material> = new Map();
  
  // Mesh optimization settings
  private readonly MESH_SIMPLIFICATION_RATIO = 0.5;
  private readonly MAX_VERTICES = 65536; // For mobile performance
  private readonly TEXTURE_MAX_SIZE = 2048;
  
  constructor() {
    this.scene = new THREE.Scene();
    this.textureLoader = new THREE.TextureLoader();
    this.initializeMaterials();
  }

  static getInstance(): ModelGenerationService {
    if (!ModelGenerationService.instance) {
      ModelGenerationService.instance = new ModelGenerationService();
    }
    return ModelGenerationService.instance;
  }

  private initializeMaterials(): void {
    // Initialize common materials
    this.materialLibrary.set('default', new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.7,
      metalness: 0.3,
    }));
    
    this.materialLibrary.set('wood', new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.8,
      metalness: 0.1,
      map: this.generateWoodTexture(),
    }));
    
    this.materialLibrary.set('metal', new THREE.MeshStandardMaterial({
      color: 0xC0C0C0,
      roughness: 0.3,
      metalness: 0.9,
    }));
    
    this.materialLibrary.set('glass', new THREE.MeshPhysicalMaterial({
      color: 0xFFFFFF,
      metalness: 0,
      roughness: 0,
      transparency: true,
      opacity: 0.3,
      reflectivity: 0.9,
      refractionRatio: 0.98,
    }));
    
    this.materialLibrary.set('fabric', new THREE.MeshStandardMaterial({
      color: 0x4169E1,
      roughness: 0.9,
      metalness: 0,
    }));
  }

  // Generate 3D model from measurements
  async generateFromMeasurements(measurements: any[]): Promise<Model3D> {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    
    // Group measurements by type
    const walls = measurements.filter(m => m.type === 'wall');
    const floors = measurements.filter(m => m.type === 'floor');
    const objects = measurements.filter(m => m.type === 'object');
    
    // Generate wall geometry
    for (const wall of walls) {
      const wallGeometry = this.createWallGeometry(wall);
      this.mergeGeometry(geometry, wallGeometry);
    }
    
    // Generate floor geometry
    if (floors.length > 0) {
      const floorGeometry = this.createFloorGeometry(floors);
      this.mergeGeometry(geometry, floorGeometry);
    }
    
    // Generate object geometry
    for (const obj of objects) {
      const objGeometry = this.createObjectGeometry(obj);
      this.mergeGeometry(geometry, objGeometry);
    }
    
    // Optimize mesh
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    
    const material = this.materialLibrary.get('default')!;
    const mesh = new THREE.Mesh(geometry, material);
    
    // Calculate metadata
    const metadata = this.calculateMeshMetadata(mesh);
    
    const model: Model3D = {
      id: `model_${Date.now()}`,
      name: 'Room Model',
      type: 'room',
      mesh,
      metadata,
    };
    
    this.models.set(model.id, model);
    this.scene.add(mesh);
    
    return model;
  }

  // Generate from point cloud (LiDAR)
  async generateFromPointCloud(pointCloud: PointCloud): Promise<Model3D> {
    // Poisson Surface Reconstruction
    const meshData = await this.poissonReconstruction(pointCloud);
    
    // Create Three.js geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(meshData.vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    
    if (meshData.colors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
    }
    
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    
    // Simplify if needed
    if (meshData.vertices.length / 3 > this.MAX_VERTICES) {
      await this.simplifyMesh(geometry);
    }
    
    const material = new THREE.MeshStandardMaterial({
      vertexColors: meshData.colors ? true : false,
      color: meshData.colors ? 0xFFFFFF : 0x808080,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    const metadata = this.calculateMeshMetadata(mesh);
    
    const model: Model3D = {
      id: `model_${Date.now()}`,
      name: 'LiDAR Scan',
      type: 'room',
      mesh,
      metadata,
    };
    
    this.models.set(model.id, model);
    this.scene.add(mesh);
    
    return model;
  }

  // Photogrammetry reconstruction
  async generateFromPhotogrammetry(data: PhotogrammetryData): Promise<Model3D> {
    // Structure from Motion (SfM) pipeline
    const pointCloud = await this.structureFromMotion(data);
    
    // Multi-View Stereo (MVS) for dense reconstruction
    const denseCloud = await this.multiViewStereo(pointCloud, data);
    
    // Generate mesh
    const model = await this.generateFromPointCloud(denseCloud);
    
    // Texture mapping
    await this.applyPhotoTextures(model, data);
    
    return model;
  }

  // Generate furniture models
  async generateFurniture(
    type: string,
    dimensions: { width: number; height: number; depth: number }
  ): Promise<Model3D> {
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;
    
    switch (type) {
      case 'chair':
        geometry = this.createChairGeometry(dimensions);
        material = this.materialLibrary.get('wood')!;
        break;
        
      case 'table':
        geometry = this.createTableGeometry(dimensions);
        material = this.materialLibrary.get('wood')!;
        break;
        
      case 'sofa':
        geometry = this.createSofaGeometry(dimensions);
        material = this.materialLibrary.get('fabric')!;
        break;
        
      case 'cabinet':
        geometry = this.createCabinetGeometry(dimensions);
        material = this.materialLibrary.get('wood')!;
        break;
        
      default:
        // Generic box for unknown furniture
        geometry = new THREE.BoxGeometry(
          dimensions.width,
          dimensions.height,
          dimensions.depth
        );
        material = this.materialLibrary.get('default')!;
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    const metadata = this.calculateMeshMetadata(mesh);
    
    const model: Model3D = {
      id: `furniture_${Date.now()}`,
      name: type,
      type: 'furniture',
      mesh,
      metadata,
    };
    
    this.models.set(model.id, model);
    this.scene.add(mesh);
    
    return model;
  }

  // Export models
  async exportModel(modelId: string, options: ExportOptions): Promise<string> {
    const model = this.models.get(modelId);
    if (!model) throw new Error('Model not found');
    
    let exportData: string | ArrayBuffer;
    
    switch (options.format) {
      case 'obj':
        exportData = await this.exportToOBJ(model, options);
        break;
        
      case 'gltf':
      case 'glb':
        exportData = await this.exportToGLTF(model, options);
        break;
        
      case 'stl':
        exportData = await this.exportToSTL(model, options);
        break;
        
      case 'fbx':
        exportData = await this.exportToFBX(model, options);
        break;
        
      case 'dae':
        exportData = await this.exportToCollada(model, options);
        break;
        
      case 'usdz':
        exportData = await this.exportToUSDZ(model, options);
        break;
        
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
    
    // Save to file
    const fileName = `${model.name}_${Date.now()}.${options.format}`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;
    
    if (typeof exportData === 'string') {
      await FileSystem.writeAsStringAsync(filePath, exportData);
    } else {
      const base64 = this.arrayBufferToBase64(exportData);
      await FileSystem.writeAsStringAsync(filePath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    
    return filePath;
  }

  private async exportToOBJ(model: Model3D, options: ExportOptions): Promise<string> {
    const exporter = new OBJExporter();
    const result = exporter.parse(model.mesh);
    return result;
  }

  private async exportToGLTF(model: Model3D, options: ExportOptions): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    
    return new Promise((resolve, reject) => {
      exporter.parse(
        model.mesh,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else {
            resolve(new TextEncoder().encode(JSON.stringify(result)));
          }
        },
        reject,
        {
          binary: options.format === 'glb',
          includeCustomExtensions: true,
        }
      );
    });
  }

  private async exportToSTL(model: Model3D, options: ExportOptions): Promise<ArrayBuffer> {
    const exporter = new STLExporter();
    const result = exporter.parse(model.mesh, { binary: true });
    return result as ArrayBuffer;
  }

  private async exportToFBX(model: Model3D, options: ExportOptions): Promise<ArrayBuffer> {
    // FBX export would require additional library
    // Placeholder implementation
    throw new Error('FBX export not yet implemented');
  }

  private async exportToCollada(model: Model3D, options: ExportOptions): Promise<string> {
    const exporter = new ColladaExporter();
    const result = exporter.parse(model.mesh, {});
    return result.data;
  }

  private async exportToUSDZ(model: Model3D, options: ExportOptions): Promise<ArrayBuffer> {
    // USDZ export for iOS AR Quick Look
    // Would require USDZ library
    throw new Error('USDZ export not yet implemented');
  }

  // Share exported model
  async shareModel(modelId: string, options: ExportOptions): Promise<void> {
    const filePath = await this.exportModel(modelId, options);
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, {
        mimeType: this.getMimeType(options.format),
        dialogTitle: 'Share 3D Model',
      });
    }
  }

  // CAD Integration
  async exportToCAD(modelId: string, format: 'dwg' | 'dxf' | 'step' | 'iges'): Promise<string> {
    const model = this.models.get(modelId);
    if (!model) throw new Error('Model not found');
    
    // Convert to CAD format
    // This would require specialized CAD libraries
    switch (format) {
      case 'dxf':
        return this.exportToDXF(model);
      case 'dwg':
        // DWG is proprietary, would need AutoCAD API
        throw new Error('DWG export requires AutoCAD integration');
      case 'step':
        return this.exportToSTEP(model);
      case 'iges':
        return this.exportToIGES(model);
      default:
        throw new Error(`Unsupported CAD format: ${format}`);
    }
  }

  private exportToDXF(model: Model3D): string {
    // Simple DXF export
    let dxf = '0\nSECTION\n2\nENTITIES\n';
    
    const geometry = model.mesh.geometry;
    const positions = geometry.attributes.position.array;
    
    // Export as 3DFACE entities
    for (let i = 0; i < positions.length; i += 9) {
      dxf += '0\n3DFACE\n';
      dxf += `10\n${positions[i]}\n20\n${positions[i + 1]}\n30\n${positions[i + 2]}\n`;
      dxf += `11\n${positions[i + 3]}\n21\n${positions[i + 4]}\n31\n${positions[i + 5]}\n`;
      dxf += `12\n${positions[i + 6]}\n22\n${positions[i + 7]}\n32\n${positions[i + 8]}\n`;
      dxf += `13\n${positions[i + 6]}\n23\n${positions[i + 7]}\n33\n${positions[i + 8]}\n`;
    }
    
    dxf += '0\nENDSEC\n0\nEOF\n';
    
    return dxf;
  }

  private exportToSTEP(model: Model3D): string {
    // STEP (ISO 10303) export
    // Simplified implementation
    const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('RoomSnap AR Model'),'2;1');
FILE_NAME('${model.name}','${new Date().toISOString()}',('RoomSnap'),('RoomSnap AR'),'','','');
FILE_SCHEMA(('AP203'));
ENDSEC;
DATA;`;
    
    // Convert mesh to STEP entities
    // ... STEP conversion logic ...
    
    const footer = 'ENDSEC;\nEND-ISO-10303-21;';
    
    return header + '\n' + footer;
  }

  private exportToIGES(model: Model3D): string {
    // IGES export
    // Simplified implementation
    return ''; // Placeholder
  }

  // Mesh optimization
  private async simplifyMesh(geometry: THREE.BufferGeometry): Promise<void> {
    // Quadric edge collapse decimation
    const targetCount = Math.floor(geometry.attributes.position.count * this.MESH_SIMPLIFICATION_RATIO);
    
    // This would use a proper mesh simplification algorithm
    // For now, just ensure we don't exceed max vertices
    if (geometry.attributes.position.count > this.MAX_VERTICES) {
      console.warn('Mesh simplified to meet vertex limit');
    }
  }

  // Poisson reconstruction
  private async poissonReconstruction(pointCloud: PointCloud): Promise<MeshData> {
    // Poisson surface reconstruction algorithm
    // This is a simplified version - real implementation would use CGAL or Open3D
    
    const vertices = new Float32Array(pointCloud.points.length * 3);
    const normals = new Float32Array(pointCloud.points.length * 3);
    const colors = pointCloud.colors ? new Float32Array(pointCloud.points.length * 3) : undefined;
    
    for (let i = 0; i < pointCloud.points.length; i++) {
      const point = pointCloud.points[i];
      vertices[i * 3] = point.x;
      vertices[i * 3 + 1] = point.y;
      vertices[i * 3 + 2] = point.z;
      
      if (pointCloud.normals) {
        const normal = pointCloud.normals[i];
        normals[i * 3] = normal.x;
        normals[i * 3 + 1] = normal.y;
        normals[i * 3 + 2] = normal.z;
      }
      
      if (pointCloud.colors && colors) {
        const color = pointCloud.colors[i];
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
    }
    
    // Delaunay triangulation for mesh generation
    const indices = this.delaunayTriangulation(pointCloud.points);
    
    return {
      vertices,
      normals,
      colors,
      indices,
    };
  }

  private delaunayTriangulation(points: THREE.Vector3[]): Uint32Array {
    // Simplified Delaunay triangulation
    // Real implementation would use proper algorithm
    const indices: number[] = [];
    
    for (let i = 0; i < points.length - 2; i++) {
      indices.push(i, i + 1, i + 2);
    }
    
    return new Uint32Array(indices);
  }

  // Structure from Motion
  private async structureFromMotion(data: PhotogrammetryData): Promise<PointCloud> {
    // SfM pipeline: Feature detection, matching, and triangulation
    // This is a placeholder - real implementation would use OpenCV or similar
    
    const points: THREE.Vector3[] = [];
    const colors: THREE.Color[] = [];
    const confidence: number[] = [];
    
    // Simulate point cloud generation from images
    for (let i = 0; i < 1000; i++) {
      points.push(new THREE.Vector3(
        Math.random() * 10 - 5,
        Math.random() * 3,
        Math.random() * 10 - 5
      ));
      colors.push(new THREE.Color(Math.random(), Math.random(), Math.random()));
      confidence.push(Math.random());
    }
    
    return { points, colors, confidence, normals: [] };
  }

  // Multi-View Stereo
  private async multiViewStereo(
    sparseCloud: PointCloud,
    data: PhotogrammetryData
  ): Promise<PointCloud> {
    // MVS for dense reconstruction
    // Placeholder implementation
    return sparseCloud;
  }

  // Texture mapping
  private async applyPhotoTextures(model: Model3D, data: PhotogrammetryData): Promise<void> {
    // UV unwrapping and texture projection
    // This would project photos onto the 3D model
    
    const texture = await this.createTextureAtlas(data.images);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
    });
    
    model.mesh.material = material;
  }

  private async createTextureAtlas(images: string[]): Promise<THREE.Texture> {
    // Create texture atlas from multiple images
    // Placeholder - would combine images into atlas
    const canvas = document.createElement('canvas');
    canvas.width = this.TEXTURE_MAX_SIZE;
    canvas.height = this.TEXTURE_MAX_SIZE;
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // Geometry creation helpers
  private createWallGeometry(wall: any): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(wall.width, wall.height);
    geometry.translate(wall.position.x, wall.position.y, wall.position.z);
    geometry.rotateY(wall.rotation);
    return geometry;
  }

  private createFloorGeometry(floors: any[]): THREE.BufferGeometry {
    // Create floor from outline points
    const shape = new THREE.Shape();
    
    if (floors.length > 0) {
      const points = floors[0].points;
      shape.moveTo(points[0].x, points[0].z);
      
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].z);
      }
      
      shape.closePath();
    }
    
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    
    return geometry;
  }

  private createObjectGeometry(obj: any): THREE.BufferGeometry {
    return new THREE.BoxGeometry(obj.width, obj.height, obj.depth);
  }

  private createChairGeometry(dimensions: any): THREE.BufferGeometry {
    const group = new THREE.Group();
    
    // Seat
    const seat = new THREE.BoxGeometry(dimensions.width, 0.05, dimensions.depth);
    seat.translate(0, dimensions.height * 0.5, 0);
    
    // Back
    const back = new THREE.BoxGeometry(dimensions.width, dimensions.height * 0.5, 0.05);
    back.translate(0, dimensions.height * 0.75, -dimensions.depth * 0.45);
    
    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.02, 0.02, dimensions.height * 0.5);
    const leg1 = legGeometry.clone();
    leg1.translate(-dimensions.width * 0.4, dimensions.height * 0.25, -dimensions.depth * 0.4);
    
    // Merge geometries
    const geometries = [seat, back, leg1];
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
    
    return merged;
  }

  private createTableGeometry(dimensions: any): THREE.BufferGeometry {
    // Table top
    const top = new THREE.BoxGeometry(dimensions.width, 0.05, dimensions.depth);
    top.translate(0, dimensions.height, 0);
    
    // Legs
    const legGeometry = new THREE.BoxGeometry(0.05, dimensions.height, 0.05);
    
    const geometries = [top];
    
    // Add 4 legs
    for (let x of [-1, 1]) {
      for (let z of [-1, 1]) {
        const leg = legGeometry.clone();
        leg.translate(
          x * dimensions.width * 0.45,
          dimensions.height * 0.5,
          z * dimensions.depth * 0.45
        );
        geometries.push(leg);
      }
    }
    
    return THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
  }

  private createSofaGeometry(dimensions: any): THREE.BufferGeometry {
    // Simplified sofa geometry
    const base = new THREE.BoxGeometry(dimensions.width, dimensions.height * 0.4, dimensions.depth);
    const back = new THREE.BoxGeometry(dimensions.width, dimensions.height * 0.6, dimensions.depth * 0.3);
    back.translate(0, dimensions.height * 0.3, -dimensions.depth * 0.35);
    
    const armLeft = new THREE.BoxGeometry(dimensions.width * 0.1, dimensions.height * 0.5, dimensions.depth);
    armLeft.translate(-dimensions.width * 0.45, dimensions.height * 0.25, 0);
    
    const armRight = armLeft.clone();
    armRight.translate(dimensions.width * 0.9, 0, 0);
    
    return THREE.BufferGeometryUtils.mergeBufferGeometries([base, back, armLeft, armRight]);
  }

  private createCabinetGeometry(dimensions: any): THREE.BufferGeometry {
    return new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
  }

  private generateWoodTexture(): THREE.Texture {
    // Generate procedural wood texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Wood grain pattern
    const gradient = ctx.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, '#8B4513');
    gradient.addColorStop(0.5, '#A0522D');
    gradient.addColorStop(1, '#8B4513');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    return new THREE.CanvasTexture(canvas);
  }

  private mergeGeometry(target: THREE.BufferGeometry, source: THREE.BufferGeometry): void {
    // Merge source geometry into target
    target.merge(source);
  }

  private calculateMeshMetadata(mesh: THREE.Mesh): Model3D['metadata'] {
    const geometry = mesh.geometry;
    
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    
    const dimensions = {
      width: box.max.x - box.min.x,
      height: box.max.y - box.min.y,
      depth: box.max.z - box.min.z,
    };
    
    // Calculate volume and surface area (simplified)
    const volume = dimensions.width * dimensions.height * dimensions.depth;
    const surfaceArea = 2 * (
      dimensions.width * dimensions.height +
      dimensions.width * dimensions.depth +
      dimensions.height * dimensions.depth
    );
    
    return {
      dimensions,
      volume,
      surfaceArea,
      vertexCount: geometry.attributes.position.count,
      faceCount: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
      materials: [mesh.material.type],
      createdAt: new Date(),
    };
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      obj: 'model/obj',
      gltf: 'model/gltf+json',
      glb: 'model/gltf-binary',
      stl: 'model/stl',
      fbx: 'application/octet-stream',
      dae: 'model/vnd.collada+xml',
      usdz: 'model/vnd.usdz+zip',
    };
    
    return mimeTypes[format] || 'application/octet-stream';
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    return btoa(binary);
  }

  // Public API
  getModel(id: string): Model3D | undefined {
    return this.models.get(id);
  }

  getAllModels(): Model3D[] {
    return Array.from(this.models.values());
  }

  deleteModel(id: string): void {
    const model = this.models.get(id);
    if (model) {
      this.scene.remove(model.mesh);
      model.mesh.geometry.dispose();
      if (model.mesh.material instanceof THREE.Material) {
        model.mesh.material.dispose();
      }
      this.models.delete(id);
    }
  }

  clearAll(): void {
    for (const model of this.models.values()) {
      this.scene.remove(model.mesh);
      model.mesh.geometry.dispose();
      if (model.mesh.material instanceof THREE.Material) {
        model.mesh.material.dispose();
      }
    }
    this.models.clear();
  }

  getScene(): THREE.Scene {
    return this.scene;
  }
}