import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, TextInput, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView, PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { FloatingActionButton } from '../components/ui/FloatingActionButton';
import { getOptimalARSettings } from '../utils/deviceCapabilities';

const { width, height } = Dimensions.get('window');

interface Box {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  label: string;
  color: string;
  timestamp: number;
}

interface BoxesState {
  boxes: Box[];
  selectedBoxId: string | null;
}

const FURNITURE_PRESETS = [
  { label: 'Sofa', size: [200, 80, 90], color: '#4A90E2' },
  { label: 'Bed', size: [200, 50, 190], color: '#7B68EE' },
  { label: 'Table', size: [120, 75, 80], color: '#8B4513' },
  { label: 'Chair', size: [45, 85, 45], color: '#FF6B6B' },
  { label: 'Desk', size: [140, 75, 60], color: '#4ECDC4' },
  { label: 'Wardrobe', size: [120, 200, 60], color: '#95A5A6' },
  { label: 'TV Stand', size: [150, 50, 40], color: '#34495E' },
  { label: 'Bookshelf', size: [80, 180, 30], color: '#D4A574' },
];

export default function PlaceBoxScreen() {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [pendingBox, setPendingBox] = useState<Omit<Box, 'id' | 'timestamp'> | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<typeof FURNITURE_PRESETS[0] | null>(null);
  const [initialBoxPosition, setInitialBoxPosition] = useState<[number, number, number] | null>(null);
  
  const { convertDimensions, hapticFeedback, arQuality, gridEnabled } = useSettings();
  const arSettings = getOptimalARSettings(arQuality);
  
  const {
    state: boxesState,
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useUndoRedo<BoxesState>({ boxes: [], selectedBoxId: null }, hapticFeedback);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const handleTap = (event: any) => {
    // Check if we tapped on an existing box
    const { locationX, locationY } = event.nativeEvent;
    const tapX = (locationX / width) * 4 - 2;
    const tapY = -(locationY / height) * 4 + 2;
    
    // Check for box selection
    let boxSelected = false;
    for (const box of boxesState.boxes) {
      const dx = Math.abs(box.position[0] - tapX);
      const dy = Math.abs(box.position[1] - tapY);
      if (dx < 0.5 && dy < 0.5) {
        pushState({ ...boxesState, selectedBoxId: box.id });
        boxSelected = true;
        if (hapticFeedback) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        return;
      }
    }
    
    // If no box selected, add new box
    if (!boxSelected && selectedPreset) {
      setPendingBox({
        position: [tapX, tapY, 0],
        size: (selectedPreset.size || [50, 50, 50]) as [number, number, number],
        label: selectedPreset.label || 'Box',
        color: selectedPreset.color || '#00BCD4',
      });
      setShowLabelModal(true);
      
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const addBox = () => {
    if (pendingBox) {
      const newBox: Box = {
        ...pendingBox,
        id: `box-${Date.now()}`,
        label: customLabel || pendingBox.label,
        timestamp: Date.now(),
      };
      
      pushState({
        boxes: [...boxesState.boxes, newBox],
        selectedBoxId: newBox.id,
      });
      
      setShowLabelModal(false);
      setPendingBox(null);
      setCustomLabel('');
      
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const deleteSelectedBox = () => {
    if (boxesState.selectedBoxId) {
      pushState({
        boxes: boxesState.boxes.filter(b => b.id !== boxesState.selectedBoxId),
        selectedBoxId: null,
      });
      
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const onPinchEvent = (event: any) => {
    if (boxesState.selectedBoxId && event.nativeEvent.scale) {
      const scale = event.nativeEvent.scale;
      const updatedBoxes = boxesState.boxes.map(box => 
        box.id === boxesState.selectedBoxId
          ? { ...box, size: box.size.map(s => s * scale) as [number, number, number] }
          : box
      );
      pushState({ ...boxesState, boxes: updatedBoxes });
    }
  };

  const onPanEvent = (event: any) => {
    if (!boxesState.selectedBoxId) return;
    
    if (event.nativeEvent.state === State.BEGAN) {
      const selectedBox = boxesState.boxes.find(b => b.id === boxesState.selectedBoxId);
      if (selectedBox) {
        setInitialBoxPosition(selectedBox.position);
      }
    } else if (event.nativeEvent.state === State.ACTIVE && initialBoxPosition) {
      const dx = event.nativeEvent.translationX / width * 4;
      const dy = -event.nativeEvent.translationY / height * 4;
      
      const updatedBoxes = boxesState.boxes.map(box => 
        box.id === boxesState.selectedBoxId
          ? { 
              ...box, 
              position: [
                initialBoxPosition[0] + dx,
                initialBoxPosition[1] + dy,
                initialBoxPosition[2]
              ] as [number, number, number]
            }
          : box
      );
      pushState({ ...boxesState, boxes: updatedBoxes });
    } else if (event.nativeEvent.state === State.END) {
      setInitialBoxPosition(null);
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    scene.children = scene.children.filter(child => 
      child instanceof THREE.Light
    );

    boxesState.boxes.forEach(box => {
      const geometry = new THREE.BoxGeometry(...box.size.map(s => s / 100));
      const material = new THREE.MeshPhongMaterial({ 
        color: box.color,
        transparent: true,
        opacity: box.id === boxesState.selectedBoxId ? 0.8 : 0.6,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...box.position);
      scene.add(mesh);

      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ 
        color: box.id === boxesState.selectedBoxId ? 0xFFFF00 : 0x333333,
        linewidth: box.id === boxesState.selectedBoxId ? 3 : 1,
      });
      const lineSegments = new THREE.LineSegments(edges, lineMat);
      lineSegments.position.copy(mesh.position);
      scene.add(lineSegments);
    });

    if (gridEnabled) {
      const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0xCCCCCC);
      gridHelper.rotation.x = Math.PI / 2;
      scene.add(gridHelper);
    }

    renderer.render(scene, camera);
    gl.endFrameEXP();
  };

  if (!permission) {
    return <View style={styles.container} />;
  }
  
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera permission required</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />
      
      <PanGestureHandler onGestureEvent={onPanEvent} enabled={!!boxesState.selectedBoxId}>
        <View style={StyleSheet.absoluteFill}>
          <PinchGestureHandler onGestureEvent={onPinchEvent} enabled={!!boxesState.selectedBoxId}>
            <View style={StyleSheet.absoluteFill}>
              <GLView
                style={StyleSheet.absoluteFill}
                onContextCreate={onContextCreate}
              />
              <View style={StyleSheet.absoluteFill} onTouchEnd={handleTap} />
            </View>
          </PinchGestureHandler>
        </View>
      </PanGestureHandler>

      {boxesState.selectedBoxId && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedLabel}>
            {boxesState.boxes.find(b => b.id === boxesState.selectedBoxId)?.label}
          </Text>
          <Text style={styles.selectedDimensions}>
            {(() => {
              const box = boxesState.boxes.find(b => b.id === boxesState.selectedBoxId);
              return box ? convertDimensions(...box.size) : '';
            })()}
          </Text>
        </View>
      )}

      <ScrollView 
        horizontal 
        style={styles.presetContainer}
        showsHorizontalScrollIndicator={false}
      >
        {FURNITURE_PRESETS.map((preset, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.presetButton,
              selectedPreset?.label === preset.label && styles.presetButtonActive
            ]}
            onPress={() => setSelectedPreset(preset)}
          >
            <View style={[styles.presetIcon, { backgroundColor: preset.color }]} />
            <Text style={styles.presetLabel}>{preset.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.controls}>
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
          icon="trash"
          onPress={deleteSelectedBox}
          disabled={!boxesState.selectedBoxId}
          variant="danger"
          size="small"
        />
        <FloatingActionButton
          icon="refresh"
          onPress={reset}
          variant="secondary"
          size="small"
        />
      </View>

      <Modal
        visible={showLabelModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Label this object</Text>
            <TextInput
              style={styles.modalInput}
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder={pendingBox?.label || "Enter label"}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowLabelModal(false);
                  setPendingBox(null);
                  setCustomLabel('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.addButton]}
                onPress={addBox}
              >
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.instructions}>
        <View style={styles.instructionCard}>
          <Ionicons name="cube" size={20} color="#FFF" />
          <Text style={styles.instructionText}>
            {boxesState.boxes.length === 0
              ? 'Select furniture and tap to place'
              : `${boxesState.boxes.length} object${boxesState.boxes.length > 1 ? 's' : ''} placed`}
          </Text>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'center',
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedInfo: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  selectedLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  selectedDimensions: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  presetContainer: {
    position: 'absolute',
    top: 140,
    left: 0,
    right: 0,
    maxHeight: 80,
    paddingHorizontal: 10,
  },
  presetButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 5,
    alignItems: 'center',
    minWidth: 70,
  },
  presetButtonActive: {
    backgroundColor: '#2196F3',
  },
  presetIcon: {
    width: 30,
    height: 30,
    borderRadius: 4,
    marginBottom: 5,
  },
  presetLabel: {
    fontSize: 12,
    color: '#333',
  },
  controls: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    gap: 12,
  },
  instructions: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
  instructionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  instructionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F0F0F0',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#2196F3',
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});