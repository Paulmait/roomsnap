import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';

import { useSettings } from '../contexts/SettingsContext';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { FloatingActionButton } from '../components/ui/FloatingActionButton';
import { getOptimalARSettings } from '../utils/deviceCapabilities';
import { AIVisionService } from '../services/AIVisionService';
import { VoiceCommandService, VoiceCommand } from '../services/VoiceCommandService';
import { PDFGeneratorService } from '../services/PDFGeneratorService';
import { RoomStorage } from '../utils/roomStorage';

const { width, height } = Dimensions.get('window');

interface ARState {
  measurements: Array<{
    points: Array<{ x: number; y: number }>;
    distance: number;
  }>;
  boxes: Array<{
    id: string;
    position: [number, number, number];
    size: [number, number, number];
    label: string;
    color: string;
  }>;
  currentMode: 'measure' | 'place' | 'view';
  activeSessionId: string | null;
}

export default function EnhancedARScreen() {
  const cameraRef = useRef<any>(null);
  const viewRef = useRef<View>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAIResults, setShowAIResults] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [showDemoMode, setShowDemoMode] = useState(false);
  const [show2DView, setShow2DView] = useState(false);
  
  const { convertDistance, hapticFeedback, arQuality, gridEnabled } = useSettings();
  const arSettings = getOptimalARSettings(arQuality);
  
  const aiService = AIVisionService.getInstance();
  const voiceService = VoiceCommandService.getInstance();
  const pdfService = PDFGeneratorService.getInstance();
  
  const {
    state: arState,
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useUndoRedo<ARState>(
    {
      measurements: [],
      boxes: [],
      currentMode: 'measure',
      activeSessionId: null,
    },
    hapticFeedback
  );

  useEffect(() => {
    initializeAR();
  }, []);

  const initializeAR = async () => {
    try {
      // Check platform and permissions
      if (Platform.OS === 'web') {
        setShowDemoMode(true);
        return;
      }

      if (!permission?.granted) {
        requestPermission();
      }
      
      if (permission?.granted) {
        await voiceService.initialize();
      }
    } catch (error) {
      console.error('AR initialization failed:', error);
      setShowDemoMode(true);
    }
  };

  const handleVoiceCommand = (command: VoiceCommand) => {
    console.log('Voice command received:', command);
    
    switch (command.action) {
      case 'start_measure':
        pushState({ ...arState, currentMode: 'measure' });
        break;
      case 'place_sofa':
      case 'place_table':
      case 'place_chair':
        const furnitureType = command.parameters?.furnitureType || 'box';
        placeVirtualObject(furnitureType);
        break;
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'take_screenshot':
        captureScreenshot();
        break;
      case 'toggle_grid':
        // Toggle grid setting
        break;
      case 'save_session':
        saveCurrentSession();
        break;
      default:
        break;
    }
  };

  const toggleVoiceCommands = async () => {
    if (isVoiceActive) {
      await voiceService.stopListening();
      setIsVoiceActive(false);
    } else {
      await voiceService.startListening(handleVoiceCommand);
      setIsVoiceActive(true);
      
      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  };

  const analyzeScene = async () => {
    if (!cameraRef.current) return;
    
    setIsProcessing(true);
    try {
      // Capture current frame
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      
      // Analyze with AI
      const analysis = await aiService.analyzeImage(photo.uri);
      setAiAnalysis(analysis);
      setShowAIResults(true);
      
      // Auto-place detected furniture
      if (analysis.furniture.length > 0) {
        const newBoxes = analysis.furniture.map((item: any, index: number) => ({
          id: `ai-${Date.now()}-${index}`,
          position: [item.position.x * 4 - 2, item.position.y * 4 - 2, 0] as [number, number, number],
          size: [
            item.suggestedDimensions.width / 100,
            item.suggestedDimensions.height / 100,
            item.suggestedDimensions.depth / 100,
          ] as [number, number, number],
          label: item.type,
          color: '#00BCD4',
        }));
        
        pushState({
          ...arState,
          boxes: [...arState.boxes, ...newBoxes],
        });
      }
      
      // Speak results
      voiceService.speak(
        `Detected ${analysis.furniture.length} furniture items in a ${analysis.roomType}. 
        Estimated floor area is ${analysis.floorArea} square meters.`
      );
      
    } catch (error) {
      console.error('Scene analysis failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const captureScreenshot = async () => {
    if (!viewRef.current) return;

    try {
      const uri = await captureRef(viewRef, {
        format: 'png',
        quality: 0.9,
      });

      // Save to current session if active
      if (arState.activeSessionId) {
        await RoomStorage.saveScreenshot(arState.activeSessionId, uri);
      }

      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      voiceService.speak('Screenshot captured');
    } catch (error) {
      console.error('Screenshot failed:', error);
    }
  };

  const generatePDF = async () => {
    if (!arState.activeSessionId) {
      // Create a temporary session for PDF
      const session = await RoomStorage.createSession('Quick Export');
      await RoomStorage.updateSession(session.id, {
        measurements: arState.measurements.map(m => ({
          ...m,
          unit: 'metric' as const,
        })),
        boxes: arState.boxes,
      });
      
      const pdfPath = await pdfService.generateFloorPlan(session);
      await pdfService.sharePDF(pdfPath);
    } else {
      const sessions = await RoomStorage.loadSessions();
      const currentSession = sessions.find(s => s.id === arState.activeSessionId);
      
      if (currentSession) {
        const pdfPath = await pdfService.generateFloorPlan(currentSession);
        await pdfService.sharePDF(pdfPath);
      }
    }
    
    voiceService.speak('PDF floor plan generated');
  };

  const saveCurrentSession = async () => {
    if (arState.activeSessionId) {
      await RoomStorage.updateSession(arState.activeSessionId, {
        measurements: arState.measurements.map(m => ({
          ...m,
          unit: 'metric' as const,
        })),
        boxes: arState.boxes,
      });
      
      voiceService.speak('Session saved');
    }
  };

  const placeVirtualObject = (type: string) => {
    const furniturePresets: any = {
      sofa: { size: [2, 0.8, 0.9], color: '#4A90E2' },
      table: { size: [1.2, 0.75, 0.8], color: '#8B4513' },
      chair: { size: [0.45, 0.85, 0.45], color: '#FF6B6B' },
      bed: { size: [2, 0.5, 1.9], color: '#7B68EE' },
      desk: { size: [1.4, 0.75, 0.6], color: '#4ECDC4' },
    };
    
    const preset = furniturePresets[type] || furniturePresets.sofa;
    const newBox = {
      id: `box-${Date.now()}`,
      position: [0, 0, 0] as [number, number, number],
      size: preset.size as [number, number, number],
      label: type.charAt(0).toUpperCase() + type.slice(1),
      color: preset.color,
    };
    
    pushState({
      ...arState,
      boxes: [...arState.boxes, newBox],
      currentMode: 'place',
    });
  };

  const toggle2DView = () => {
    setShow2DView(!show2DView);
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const onContextCreate = async (gl: any) => {
    const scene = new THREE.Scene();
    scene.background = null;
    
    const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 1000);
    camera.position.z = 5;
    
    const renderer = new THREE.WebGLRenderer({
      canvas: gl.canvas || undefined,
      context: gl,
      alpha: true,
      antialias: arSettings.antialias,
    } as any);
    renderer.setSize(width * arSettings.renderScale, height * arSettings.renderScale);
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    
    // Render measurements
    arState.measurements.forEach(measurement => {
      if (measurement.points.length === 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(measurement.points[0].x, measurement.points[0].y, 0),
          new THREE.Vector3(measurement.points[1].x, measurement.points[1].y, 0),
        ]);
        const material = new THREE.LineBasicMaterial({ color: 0x2196F3 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
      }
    });
    
    // Render boxes
    arState.boxes.forEach(box => {
      const geometry = new THREE.BoxGeometry(...box.size);
      const material = new THREE.MeshPhongMaterial({
        color: box.color,
        transparent: true,
        opacity: 0.7,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...box.position);
      scene.add(mesh);
    });
    
    // Add grid
    if (gridEnabled) {
      const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0xCCCCCC);
      gridHelper.rotation.x = Math.PI / 2;
      scene.add(gridHelper);
    }
    
    renderer.render(scene, camera);
    gl.endFrameEXP();
  };

  // Demo mode for web/testing
  if (showDemoMode) {
    return (
      <View style={styles.container}>
        <View style={styles.demoContainer}>
          <Ionicons name="cube-outline" size={100} color="#2196F3" />
          <Text style={styles.demoTitle}>RoomSnap AR Demo Mode</Text>
          <Text style={styles.demoText}>
            AR features work best on mobile devices with camera access.
          </Text>
          
          <View style={styles.demoFeatures}>
            <Text style={styles.demoFeatureTitle}>Available Features:</Text>
            <Text style={styles.demoFeature}>✓ AI-powered furniture detection</Text>
            <Text style={styles.demoFeature}>✓ Voice commands for hands-free use</Text>
            <Text style={styles.demoFeature}>✓ PDF floor plan generation</Text>
            <Text style={styles.demoFeature}>✓ Multi-room session management</Text>
            <Text style={styles.demoFeature}>✓ Real-time measurements</Text>
            <Text style={styles.demoFeature}>✓ 2D/3D view toggle</Text>
          </View>
          
          <TouchableOpacity style={styles.demoButton} onPress={() => setShowDemoMode(false)}>
            <Text style={styles.demoButtonText}>Try Anyway</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Initializing AR...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera permission required for AR</Text>
        <TouchableOpacity style={styles.retryButton} onPress={requestPermission}>
          <Text style={styles.retryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View ref={viewRef} style={styles.container}>
      {!show2DView ? (
        <>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
          />
          <GLView
            style={StyleSheet.absoluteFill}
            onContextCreate={onContextCreate}
          />
        </>
      ) : (
        <View style={styles.view2D}>
          <Text style={styles.view2DTitle}>2D Floor Plan View</Text>
          {/* Render 2D representation */}
        </View>
      )}
      
      {/* Mode Selector */}
      <View style={styles.modeSelector}>
        <TouchableOpacity
          style={[styles.modeButton, arState.currentMode === 'measure' && styles.modeButtonActive]}
          onPress={() => pushState({ ...arState, currentMode: 'measure' })}
        >
          <Ionicons name="resize" size={20} color={arState.currentMode === 'measure' ? '#FFF' : '#666'} />
          <Text style={[styles.modeButtonText, arState.currentMode === 'measure' && styles.modeButtonTextActive]}>
            Measure
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.modeButton, arState.currentMode === 'place' && styles.modeButtonActive]}
          onPress={() => pushState({ ...arState, currentMode: 'place' })}
        >
          <Ionicons name="cube" size={20} color={arState.currentMode === 'place' ? '#FFF' : '#666'} />
          <Text style={[styles.modeButtonText, arState.currentMode === 'place' && styles.modeButtonTextActive]}>
            Place
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.modeButton, arState.currentMode === 'view' && styles.modeButtonActive]}
          onPress={() => pushState({ ...arState, currentMode: 'view' })}
        >
          <Ionicons name="eye" size={20} color={arState.currentMode === 'view' ? '#FFF' : '#666'} />
          <Text style={[styles.modeButtonText, arState.currentMode === 'view' && styles.modeButtonTextActive]}>
            View
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* AI Analysis Button */}
      <TouchableOpacity
        style={[styles.aiButton, isProcessing && styles.aiButtonProcessing]}
        onPress={analyzeScene}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="sparkles" size={24} color="#FFF" />
            <Text style={styles.aiButtonText}>AI Analyze</Text>
          </>
        )}
      </TouchableOpacity>
      
      {/* Voice Command Button */}
      <TouchableOpacity
        style={[styles.voiceButton, isVoiceActive && styles.voiceButtonActive]}
        onPress={toggleVoiceCommands}
      >
        <Ionicons 
          name={isVoiceActive ? "mic" : "mic-off"} 
          size={24} 
          color="#FFF" 
        />
        {isVoiceActive && (
          <View style={styles.voiceIndicator} />
        )}
      </TouchableOpacity>
      
      {/* Control Panel */}
      <View style={styles.controlPanel}>
        <FloatingActionButton
          icon="arrow-undo"
          onPress={undo}
          disabled={!canUndo}
          variant="secondary"
          size="small"
        />
        <FloatingActionButton
          icon="arrow-redo"
          onPress={redo}
          disabled={!canRedo}
          variant="secondary"
          size="small"
        />
        <FloatingActionButton
          icon="camera"
          onPress={captureScreenshot}
          variant="secondary"
          size="small"
        />
        <FloatingActionButton
          icon="document-text"
          onPress={generatePDF}
          variant="primary"
          size="small"
        />
        <FloatingActionButton
          icon="apps"
          onPress={toggle2DView}
          variant={show2DView ? 'primary' : 'secondary'}
          size="small"
        />
        <FloatingActionButton
          icon="save"
          onPress={saveCurrentSession}
          variant="secondary"
          size="small"
        />
      </View>
      
      {/* AI Results Modal */}
      <Modal
        visible={showAIResults}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Analysis Results</Text>
              <TouchableOpacity onPress={() => setShowAIResults(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {aiAnalysis && (
              <ScrollView style={styles.analysisContent}>
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>Room Type</Text>
                  <Text style={styles.analysisValue}>{aiAnalysis.roomType}</Text>
                </View>
                
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>Dimensions</Text>
                  <Text style={styles.analysisValue}>
                    {aiAnalysis.dimensions.width} × {aiAnalysis.dimensions.depth} × {aiAnalysis.dimensions.height} cm
                  </Text>
                </View>
                
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>Floor Area</Text>
                  <Text style={styles.analysisValue}>{aiAnalysis.floorArea} m²</Text>
                </View>
                
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>Detected Furniture</Text>
                  {aiAnalysis.furniture.map((item: any, index: number) => (
                    <View key={index} style={styles.furnitureItem}>
                      <Text style={styles.furnitureType}>{item.type}</Text>
                      <Text style={styles.furnitureConfidence}>
                        {(item.confidence * 100).toFixed(0)}% confidence
                      </Text>
                      {item.estimatedCost && (
                        <Text style={styles.furnitureCost}>
                          ${item.estimatedCost.min} - ${item.estimatedCost.max}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
                
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>Suggestions</Text>
                  {aiAnalysis.suggestions.map((suggestion: string, index: number) => (
                    <Text key={index} style={styles.suggestionText}>
                      • {suggestion}
                    </Text>
                  ))}
                </View>
              </ScrollView>
            )}
            
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowAIResults(false)}
            >
              <Text style={styles.modalButtonText}>Apply Suggestions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  demoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  demoTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    color: '#333',
  },
  demoText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  demoFeatures: {
    marginTop: 30,
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 12,
    width: '100%',
  },
  demoFeatureTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  demoFeature: {
    fontSize: 14,
    color: '#555',
    marginVertical: 5,
  },
  demoButton: {
    marginTop: 30,
    backgroundColor: '#2196F3',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 24,
  },
  demoButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  view2D: {
    flex: 1,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  view2DTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modeSelector: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: '#2196F3',
  },
  modeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: '#FFF',
  },
  aiButton: {
    position: 'absolute',
    top: 120,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9C27B0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.5,
  },
  aiButtonProcessing: {
    opacity: 0.8,
  },
  aiButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  voiceButton: {
    position: 'absolute',
    top: 120,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.5,
  },
  voiceButtonActive: {
    backgroundColor: '#F44336',
  },
  voiceIndicator: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: '#FFF',
    opacity: 0.5,
  },
  controlPanel: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    gap: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  analysisContent: {
    maxHeight: 400,
  },
  analysisSection: {
    marginBottom: 20,
  },
  analysisSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  analysisValue: {
    fontSize: 16,
    color: '#333',
  },
  furnitureItem: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
  },
  furnitureType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  furnitureConfidence: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  furnitureCost: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '500',
  },
  suggestionText: {
    fontSize: 14,
    color: '#555',
    marginVertical: 4,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});