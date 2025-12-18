import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { Camera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';

export interface DetectedObject {
  id: string;
  class: string;
  confidence: number;
  bbox: BoundingBox;
  dimensions?: Dimensions3D;
  material?: string;
  color?: string;
  furniture_type?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Dimensions3D {
  width: number;
  height: number;
  depth: number;
  unit: 'meters' | 'feet';
}

export interface SemanticSegmentation {
  masks: Map<string, ImageData>;
  labels: string[];
  confidences: number[];
}

export interface SceneUnderstanding {
  room_type: string;
  lighting: 'bright' | 'normal' | 'dim';
  materials: string[];
  furniture: DetectedObject[];
  layout_score: number;
  suggestions: string[];
}

export interface MeasurementSuggestion {
  type: string;
  points: { x: number; y: number }[];
  expectedValue?: number;
  confidence: number;
  reason: string;
}

export class AIVisionPipeline {
  private static instance: AIVisionPipeline;
  
  // Models
  private objectDetectionModel: tf.GraphModel | null = null;
  private segmentationModel: tf.GraphModel | null = null;
  private depthEstimationModel: tf.GraphModel | null = null;
  private furnitureClassifier: tf.LayersModel | null = null;
  
  // Model URLs
  private readonly MODEL_URLS = {
    yolov8: 'https://models.roomsnap.app/yolov8/model.json',
    segmentation: 'https://models.roomsnap.app/deeplabv3/model.json',
    depth: 'https://models.roomsnap.app/midas/model.json',
    furniture: 'https://models.roomsnap.app/furniture/model.json',
  };
  
  // Class mappings
  private readonly COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
    'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
    'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
    'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
    'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
    'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
    'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
  ];
  
  private readonly FURNITURE_TYPES = [
    'sofa', 'chair', 'table', 'desk', 'bed', 'dresser', 'cabinet', 'shelf',
    'tv_stand', 'coffee_table', 'dining_table', 'nightstand', 'bookshelf',
    'wardrobe', 'ottoman', 'bench', 'stool', 'armchair', 'recliner', 'loveseat'
  ];
  
  private readonly ROOM_TYPES = [
    'living_room', 'bedroom', 'kitchen', 'bathroom', 'dining_room', 'office',
    'hallway', 'garage', 'basement', 'attic', 'closet', 'laundry_room'
  ];
  
  // Processing settings
  private processingQueue: any[] = [];
  private isProcessing: boolean = false;
  private frameSkip: number = 3; // Process every 3rd frame
  private frameCounter: number = 0;

  static getInstance(): AIVisionPipeline {
    if (!AIVisionPipeline.instance) {
      AIVisionPipeline.instance = new AIVisionPipeline();
    }
    return AIVisionPipeline.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Initialize TensorFlow.js
      await tf.ready();
      
      // Set backend
      await tf.setBackend('webgl'); // or 'rn-webgl' for React Native
      
      // Load models
      await this.loadModels();
      
      console.log('AI Vision Pipeline initialized');
      console.log(`TensorFlow.js backend: ${tf.getBackend()}`);
    } catch (error) {
      console.error('AI Vision Pipeline initialization failed:', error);
    }
  }

  private async loadModels(): Promise<void> {
    try {
      // Load YOLOv8 for object detection
      this.objectDetectionModel = await this.loadModel(this.MODEL_URLS.yolov8);
      
      // Load DeepLabV3 for segmentation
      this.segmentationModel = await this.loadModel(this.MODEL_URLS.segmentation);
      
      // Load MiDaS for depth estimation
      this.depthEstimationModel = await this.loadModel(this.MODEL_URLS.depth);
      
      // Load furniture classifier
      this.furnitureClassifier = await tf.loadLayersModel(this.MODEL_URLS.furniture);
      
      // Warm up models
      await this.warmupModels();
    } catch (error) {
      console.error('Failed to load AI models:', error);
      // Fall back to local inference
      await this.initializeLocalModels();
    }
  }

  private async loadModel(url: string): Promise<tf.GraphModel> {
    try {
      // Try to load from cache first
      const cachedPath = `${FileSystem.cacheDirectory}${url.split('/').pop()}`;
      
      if (await FileSystem.getInfoAsync(cachedPath).then(info => info.exists)) {
        return await tf.loadGraphModel(`file://${cachedPath}`);
      }
      
      // Download and cache
      const model = await tf.loadGraphModel(url);
      
      // Save to cache for offline use
      await model.save(`file://${cachedPath}`);
      
      return model;
    } catch (error) {
      console.error(`Failed to load model from ${url}:`, error);
      throw error;
    }
  }

  private async warmupModels(): Promise<void> {
    // Warm up models with dummy data for faster first inference
    const dummyImage = tf.zeros([1, 224, 224, 3]);
    
    if (this.objectDetectionModel) {
      await this.objectDetectionModel.predict(dummyImage);
    }
    
    if (this.segmentationModel) {
      await this.segmentationModel.predict(dummyImage);
    }
    
    if (this.depthEstimationModel) {
      await this.depthEstimationModel.predict(dummyImage);
    }
    
    dummyImage.dispose();
  }

  // Real-time Object Detection (YOLOv8)
  async detectObjects(imageData: ImageData | string): Promise<DetectedObject[]> {
    if (!this.objectDetectionModel) {
      return this.fallbackObjectDetection(imageData);
    }
    
    const imageTensor = await this.preprocessImage(imageData);
    
    try {
      // Run YOLOv8 inference
      const predictions = await this.objectDetectionModel.predict(imageTensor) as tf.Tensor;
      
      // Parse YOLO output
      const [boxes, scores, classes] = await this.parseYOLOOutput(predictions);
      
      // Apply NMS (Non-Maximum Suppression)
      const nmsResults = await this.applyNMS(boxes, scores, classes);
      
      // Convert to DetectedObject format
      const objects = await this.formatDetections(nmsResults, imageData);
      
      // Estimate 3D dimensions for furniture
      for (const obj of objects) {
        if (this.isFurniture(obj.class)) {
          obj.dimensions = await this.estimate3DDimensions(obj, imageData);
          obj.furniture_type = await this.classifyFurniture(obj, imageData);
        }
      }
      
      predictions.dispose();
      imageTensor.dispose();
      
      return objects;
    } catch (error) {
      console.error('Object detection failed:', error);
      return this.fallbackObjectDetection(imageData);
    }
  }

  // Semantic Segmentation
  async segmentScene(imageData: ImageData | string): Promise<SemanticSegmentation> {
    if (!this.segmentationModel) {
      return this.fallbackSegmentation();
    }
    
    const imageTensor = await this.preprocessImage(imageData, [513, 513]);
    
    try {
      // Run segmentation
      const segmentation = await this.segmentationModel.predict(imageTensor) as tf.Tensor;
      
      // Get class masks
      const masks = await this.extractSegmentationMasks(segmentation);
      
      segmentation.dispose();
      imageTensor.dispose();
      
      return masks;
    } catch (error) {
      console.error('Segmentation failed:', error);
      return this.fallbackSegmentation();
    }
  }

  // Depth Estimation
  async estimateDepth(imageData: ImageData | string): Promise<Float32Array> {
    if (!this.depthEstimationModel) {
      return this.fallbackDepthEstimation(imageData);
    }
    
    const imageTensor = await this.preprocessImage(imageData, [384, 384]);
    
    try {
      // Run MiDaS depth estimation
      const depthMap = await this.depthEstimationModel.predict(imageTensor) as tf.Tensor;
      
      // Convert to meters
      const depthArray = await this.convertDepthToMeters(depthMap);
      
      depthMap.dispose();
      imageTensor.dispose();
      
      return depthArray;
    } catch (error) {
      console.error('Depth estimation failed:', error);
      return this.fallbackDepthEstimation(imageData);
    }
  }

  // Scene Understanding
  async analyzeScene(imageData: ImageData | string): Promise<SceneUnderstanding> {
    const [objects, segmentation, depth] = await Promise.all([
      this.detectObjects(imageData),
      this.segmentScene(imageData),
      this.estimateDepth(imageData),
    ]);
    
    // Classify room type
    const roomType = await this.classifyRoomType(objects, segmentation);
    
    // Analyze lighting
    const lighting = await this.analyzeLighting(imageData);
    
    // Detect materials
    const materials = await this.detectMaterials(segmentation);
    
    // Filter furniture objects
    const furniture = objects.filter(obj => this.isFurniture(obj.class));
    
    // Calculate layout score
    const layoutScore = this.calculateLayoutScore(furniture, roomType);
    
    // Generate suggestions
    const suggestions = this.generateLayoutSuggestions(furniture, roomType, layoutScore);
    
    return {
      room_type: roomType,
      lighting,
      materials,
      furniture,
      layout_score: layoutScore,
      suggestions,
    };
  }

  // Automatic Measurement Suggestions
  async suggestMeasurements(
    imageData: ImageData | string,
    existingMeasurements: any[]
  ): Promise<MeasurementSuggestion[]> {
    const suggestions: MeasurementSuggestion[] = [];
    
    // Detect objects and edges
    const objects = await this.detectObjects(imageData);
    const edges = await this.detectEdges(imageData);
    
    // Suggest wall measurements
    const wallEdges = edges.filter(e => e.type === 'wall');
    for (const edge of wallEdges) {
      if (!this.hasSimilarMeasurement(edge, existingMeasurements)) {
        suggestions.push({
          type: 'wall_length',
          points: edge.points,
          expectedValue: edge.estimatedLength,
          confidence: edge.confidence,
          reason: 'Detected wall edge without measurement',
        });
      }
    }
    
    // Suggest furniture measurements
    for (const obj of objects) {
      if (this.isFurniture(obj.class) && !this.hasObjectMeasurement(obj, existingMeasurements)) {
        const points = this.getBoundingBoxPoints(obj.bbox);
        suggestions.push({
          type: 'furniture_dimension',
          points,
          expectedValue: obj.dimensions?.width,
          confidence: obj.confidence,
          reason: `Measure ${obj.class} dimensions`,
        });
      }
    }
    
    // Suggest room dimensions if not measured
    if (!this.hasRoomDimensions(existingMeasurements)) {
      suggestions.push({
        type: 'room_dimension',
        points: this.getRoomCorners(edges),
        confidence: 0.8,
        reason: 'Complete room dimensions needed',
      });
    }
    
    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);
    
    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  // Material Recognition
  private async detectMaterials(segmentation: SemanticSegmentation): Promise<string[]> {
    const materials = new Set<string>();
    
    // Analyze textures in each segment
    for (const [label, mask] of segmentation.masks) {
      const material = await this.classifyMaterial(mask);
      if (material) {
        materials.add(material);
      }
    }
    
    return Array.from(materials);
  }

  private async classifyMaterial(mask: ImageData): Promise<string> {
    // Simplified material classification based on texture analysis
    // In production, use a trained classifier
    
    const textures = {
      wood: { hue: [20, 40], saturation: [30, 70] },
      metal: { hue: [0, 360], saturation: [0, 20] },
      fabric: { hue: [0, 360], saturation: [20, 60] },
      glass: { hue: [180, 240], saturation: [0, 30] },
      plastic: { hue: [0, 360], saturation: [40, 80] },
    };
    
    // Analyze dominant color/texture
    // ... texture analysis logic ...
    
    return 'wood'; // Placeholder
  }

  // Lighting Analysis
  private async analyzeLighting(imageData: ImageData | string): Promise<'bright' | 'normal' | 'dim'> {
    const tensor = await this.preprocessImage(imageData);
    
    // Calculate average brightness
    const brightness = await tensor.mean().array() as number;
    
    tensor.dispose();
    
    if (brightness > 0.7) return 'bright';
    if (brightness > 0.3) return 'normal';
    return 'dim';
  }

  // Room Type Classification
  private async classifyRoomType(
    objects: DetectedObject[],
    segmentation: SemanticSegmentation
  ): Promise<string> {
    // Score each room type based on detected objects
    const roomScores: Record<string, number> = {};
    
    for (const roomType of this.ROOM_TYPES) {
      roomScores[roomType] = 0;
    }
    
    // Object-based scoring
    for (const obj of objects) {
      if (obj.class === 'bed') roomScores['bedroom'] += 10;
      if (obj.class === 'couch' || obj.class === 'tv') roomScores['living_room'] += 8;
      if (obj.class === 'dining table') roomScores['dining_room'] += 10;
      if (obj.class === 'desk' || obj.class === 'laptop') roomScores['office'] += 8;
      if (obj.class === 'refrigerator' || obj.class === 'oven') roomScores['kitchen'] += 10;
      if (obj.class === 'toilet' || obj.class === 'sink') roomScores['bathroom'] += 10;
    }
    
    // Find room with highest score
    let maxScore = 0;
    let detectedRoom = 'unknown';
    
    for (const [room, score] of Object.entries(roomScores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedRoom = room;
      }
    }
    
    return detectedRoom;
  }

  // 3D Dimension Estimation
  private async estimate3DDimensions(
    object: DetectedObject,
    imageData: ImageData | string
  ): Promise<Dimensions3D> {
    // Use depth map and known object priors
    const depth = await this.estimateDepth(imageData);
    
    // Get average depth at object location
    const objectDepth = this.getAverageDepth(object.bbox, depth);
    
    // Use camera intrinsics to convert pixel dimensions to real-world
    const focalLength = 525; // Camera focal length in pixels
    
    const width = (object.bbox.width * objectDepth) / focalLength;
    const height = (object.bbox.height * objectDepth) / focalLength;
    
    // Estimate depth using object class priors
    const depthPrior = this.getObjectDepthPrior(object.class);
    
    return {
      width: width,
      height: height,
      depth: depthPrior,
      unit: 'meters',
    };
  }

  // Furniture Classification
  private async classifyFurniture(
    object: DetectedObject,
    imageData: ImageData | string
  ): Promise<string> {
    if (!this.furnitureClassifier) {
      return object.class; // Fallback to generic class
    }
    
    // Crop object from image
    const cropped = await this.cropObject(object.bbox, imageData);
    
    // Classify furniture type
    const prediction = await this.furnitureClassifier.predict(cropped) as tf.Tensor;
    const classIndex = (await prediction.argMax(-1).array() as number[])[0];
    
    prediction.dispose();
    cropped.dispose();
    
    return this.FURNITURE_TYPES[classIndex] || object.class;
  }

  // Edge Detection for Measurements
  private async detectEdges(imageData: ImageData | string): Promise<any[]> {
    const tensor = await this.preprocessImage(imageData);
    
    // Apply Canny edge detection
    // In production, use proper implementation
    const edges: any[] = [];
    
    // Detect lines using Hough transform
    // ... edge detection logic ...
    
    tensor.dispose();
    
    return edges;
  }

  // Helper Methods
  private async preprocessImage(
    imageData: ImageData | string,
    targetSize: [number, number] = [640, 640]
  ): Promise<tf.Tensor> {
    let tensor: tf.Tensor;
    
    if (typeof imageData === 'string') {
      // Load from URI
      const response = await fetch(imageData);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      tensor = tf.browser.fromPixels(imageBitmap);
    } else {
      tensor = tf.browser.fromPixels(imageData);
    }
    
    // Resize and normalize
    const resized = tf.image.resizeBilinear(tensor, targetSize);
    const normalized = resized.div(255.0);
    const batched = normalized.expandDims(0);
    
    tensor.dispose();
    resized.dispose();
    normalized.dispose();
    
    return batched;
  }

  private async parseYOLOOutput(predictions: tf.Tensor): Promise<[number[][], number[], number[]]> {
    // Parse YOLO output format
    // Format: [batch, num_boxes, 85] where 85 = 4 bbox + 1 obj_conf + 80 classes
    
    const output = await predictions.array() as number[][][];
    const boxes: number[][] = [];
    const scores: number[] = [];
    const classes: number[] = [];
    
    for (const detection of output[0]) {
      const [x, y, w, h, objConf, ...classProbs] = detection;
      
      const classId = classProbs.indexOf(Math.max(...classProbs));
      const score = objConf * classProbs[classId];
      
      if (score > 0.5) { // Confidence threshold
        boxes.push([x - w/2, y - h/2, w, h]);
        scores.push(score);
        classes.push(classId);
      }
    }
    
    return [boxes, scores, classes];
  }

  private async applyNMS(
    boxes: number[][],
    scores: number[],
    classes: number[],
    iouThreshold: number = 0.5
  ): Promise<any[]> {
    // Non-Maximum Suppression
    const results = [];
    const used = new Set<number>();
    
    // Sort by score
    const indices = scores
      .map((_, i) => i)
      .sort((a, b) => scores[b] - scores[a]);
    
    for (const i of indices) {
      if (used.has(i)) continue;
      
      results.push({ box: boxes[i], score: scores[i], class: classes[i] });
      used.add(i);
      
      // Suppress overlapping boxes
      for (const j of indices) {
        if (i === j || used.has(j)) continue;
        
        if (this.calculateIOU(boxes[i], boxes[j]) > iouThreshold) {
          used.add(j);
        }
      }
    }
    
    return results;
  }

  private calculateIOU(box1: number[], box2: number[]): number {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;
    
    const xOverlap = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
    const yOverlap = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
    
    const intersection = xOverlap * yOverlap;
    const union = w1 * h1 + w2 * h2 - intersection;
    
    return intersection / union;
  }

  private async formatDetections(nmsResults: any[], imageData: any): Promise<DetectedObject[]> {
    const objects: DetectedObject[] = [];
    
    for (const result of nmsResults) {
      objects.push({
        id: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        class: this.COCO_CLASSES[result.class],
        confidence: result.score,
        bbox: {
          x: result.box[0],
          y: result.box[1],
          width: result.box[2],
          height: result.box[3],
        },
      });
    }
    
    return objects;
  }

  private isFurniture(className: string): boolean {
    const furnitureClasses = [
      'chair', 'couch', 'bed', 'dining table', 'toilet', 'tv',
      'laptop', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator'
    ];
    
    return furnitureClasses.includes(className);
  }

  private getObjectDepthPrior(className: string): number {
    // Known depth priors for common objects (in meters)
    const priors: Record<string, number> = {
      chair: 0.5,
      couch: 0.9,
      bed: 2.0,
      'dining table': 0.8,
      tv: 0.1,
      refrigerator: 0.7,
      // ... more priors
    };
    
    return priors[className] || 0.5;
  }

  private calculateLayoutScore(furniture: DetectedObject[], roomType: string): number {
    // Score based on furniture arrangement principles
    let score = 100;
    
    // Check for overlapping furniture
    for (let i = 0; i < furniture.length; i++) {
      for (let j = i + 1; j < furniture.length; j++) {
        if (this.calculateIOU(
          [furniture[i].bbox.x, furniture[i].bbox.y, furniture[i].bbox.width, furniture[i].bbox.height],
          [furniture[j].bbox.x, furniture[j].bbox.y, furniture[j].bbox.width, furniture[j].bbox.height]
        ) > 0.1) {
          score -= 10; // Penalty for overlapping
        }
      }
    }
    
    // Room-specific scoring
    // ... additional scoring logic ...
    
    return Math.max(0, Math.min(100, score));
  }

  private generateLayoutSuggestions(
    furniture: DetectedObject[],
    roomType: string,
    layoutScore: number
  ): string[] {
    const suggestions: string[] = [];
    
    if (layoutScore < 50) {
      suggestions.push('Consider rearranging furniture for better flow');
    }
    
    // Room-specific suggestions
    if (roomType === 'living_room') {
      const hasTV = furniture.some(f => f.class === 'tv');
      const hasCouch = furniture.some(f => f.class === 'couch');
      
      if (hasTV && hasCouch) {
        suggestions.push('Ensure comfortable viewing distance between TV and seating');
      }
    }
    
    // ... more suggestions ...
    
    return suggestions;
  }

  // Fallback methods for when AI models aren't available
  private fallbackObjectDetection(imageData: any): DetectedObject[] {
    // Simple color-based detection
    return [];
  }

  private fallbackSegmentation(): SemanticSegmentation {
    return {
      masks: new Map(),
      labels: [],
      confidences: [],
    };
  }

  private fallbackDepthEstimation(imageData: any): Float32Array {
    // Return uniform depth
    return new Float32Array(640 * 480).fill(2.0);
  }

  private async initializeLocalModels(): Promise<void> {
    // Initialize lightweight local models
    console.log('Using local inference models');
  }

  private async extractSegmentationMasks(segmentation: tf.Tensor): Promise<SemanticSegmentation> {
    // Extract individual class masks
    const masks = new Map<string, ImageData>();
    const labels: string[] = [];
    const confidences: number[] = [];
    
    // ... extraction logic ...
    
    return { masks, labels, confidences };
  }

  private async convertDepthToMeters(depthMap: tf.Tensor): Promise<Float32Array> {
    // Convert depth values to meters
    const array = await depthMap.array() as number[];
    return new Float32Array(array);
  }

  private getAverageDepth(bbox: BoundingBox, depthArray: Float32Array): number {
    // Calculate average depth within bounding box
    return 2.0; // Placeholder
  }

  private async cropObject(bbox: BoundingBox, imageData: any): Promise<tf.Tensor> {
    const tensor = await this.preprocessImage(imageData);
    
    // Crop to bounding box
    const cropped = tf.image.cropAndResize(
      tensor,
      [[bbox.y, bbox.x, bbox.y + bbox.height, bbox.x + bbox.width]],
      [0],
      [224, 224]
    );
    
    tensor.dispose();
    
    return cropped;
  }

  private hasSimilarMeasurement(edge: any, measurements: any[]): boolean {
    // Check if similar measurement exists
    return false; // Placeholder
  }

  private hasObjectMeasurement(object: DetectedObject, measurements: any[]): boolean {
    // Check if object has been measured
    return false; // Placeholder
  }

  private hasRoomDimensions(measurements: any[]): boolean {
    // Check if room dimensions are complete
    return measurements.some(m => m.type === 'room_dimension');
  }

  private getBoundingBoxPoints(bbox: BoundingBox): { x: number; y: number }[] {
    return [
      { x: bbox.x, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
      { x: bbox.x, y: bbox.y + bbox.height },
    ];
  }

  private getRoomCorners(edges: any[]): { x: number; y: number }[] {
    // Extract room corners from edges
    return [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
  }

  // Public API
  async processFrame(imageData: ImageData | string): Promise<{
    objects: DetectedObject[];
    scene: SceneUnderstanding;
    suggestions: MeasurementSuggestion[];
  }> {
    // Skip frames for performance
    this.frameCounter++;
    if (this.frameCounter % this.frameSkip !== 0) {
      return {
        objects: [],
        scene: {} as SceneUnderstanding,
        suggestions: [],
      };
    }
    
    const [objects, scene, suggestions] = await Promise.all([
      this.detectObjects(imageData),
      this.analyzeScene(imageData),
      this.suggestMeasurements(imageData, []),
    ]);
    
    return { objects, scene, suggestions };
  }

  setFrameSkip(skip: number): void {
    this.frameSkip = Math.max(1, skip);
  }

  dispose(): void {
    // Clean up models
    this.objectDetectionModel?.dispose();
    this.segmentationModel?.dispose();
    this.depthEstimationModel?.dispose();
    this.furnitureClassifier?.dispose();
  }
}