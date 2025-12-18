import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { FloatingActionButton } from '../components/ui/FloatingActionButton';
import { getOptimalARSettings } from '../utils/deviceCapabilities';

const { width, height } = Dimensions.get('window');

interface MeasurementPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface MeasurementData {
  points: MeasurementPoint[];
  distance: number | null;
}

export default function ARMeasureScreen() {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [arError, setArError] = useState<string | null>(null);
  const { convertDistance, hapticFeedback, arQuality, gridEnabled, gridSize } = useSettings();

  const {
    state: measurementData,
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useUndoRedo<MeasurementData>({ points: [], distance: null }, hapticFeedback);

  const [showGrid, setShowGrid] = useState(gridEnabled);
  const arSettings = getOptimalARSettings(arQuality);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const handleTap = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    const newPoint: MeasurementPoint = {
      x: locationX,
      y: locationY,
      timestamp: Date.now(),
    };

    if (measurementData.points.length < 2) {
      pushState({
        points: [...measurementData.points, newPoint],
        distance: null,
      });
    } else {
      pushState({
        points: [newPoint],
        distance: null,
      });
    }

    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleClear = () => {
    reset();
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const getGridDivisions = () => {
    switch (gridSize) {
      case 'small': return 10;
      case 'large': return 4;
      case 'off': return 0;
      default: return 6;
    }
  };

  const onContextCreate = async (gl: any) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({
      canvas: gl.canvas || undefined,
      context: gl,
      antialias: arSettings.antialias,
    } as any);
    renderer.setSize(width * arSettings.renderScale, height * arSettings.renderScale);
    renderer.shadowMap.enabled = arSettings.shadowMapSize > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    let line: THREE.Line | null = null;
    let spheres: THREE.Mesh[] = [];

    function renderScene() {
      if (line) scene.remove(line);
      spheres.forEach(s => scene.remove(s));
      spheres = [];

      if (measurementData.points.length === 2) {
        const p1 = new THREE.Vector3(
          (measurementData.points[0].x / width) * 4 - 2,
          -(measurementData.points[0].y / height) * 4 + 2,
          0
        );
        const p2 = new THREE.Vector3(
          (measurementData.points[1].x / width) * 4 - 2,
          -(measurementData.points[1].y / height) * 4 + 2,
          0
        );

        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const material = new THREE.LineBasicMaterial({
          color: 0x2196F3,
          linewidth: 3
        });
        line = new THREE.Line(geometry, material);
        scene.add(line);

        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00BCD4 });
        const sphereGeo = new THREE.SphereGeometry(0.05, 16, 16);
        const s1 = new THREE.Mesh(sphereGeo, sphereMat);
        const s2 = new THREE.Mesh(sphereGeo, sphereMat);
        s1.position.copy(p1);
        s2.position.copy(p2);
        spheres = [s1, s2];
        scene.add(s1);
        scene.add(s2);

        const dist = p1.distanceTo(p2) * 100;
        pushState({
          ...measurementData,
          distance: dist,
        });
      } else if (measurementData.points.length === 1) {
        const p1 = new THREE.Vector3(
          (measurementData.points[0].x / width) * 4 - 2,
          -(measurementData.points[0].y / height) * 4 + 2,
          0
        );
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x4CAF50 });
        const sphereGeo = new THREE.SphereGeometry(0.06, 16, 16);
        const s1 = new THREE.Mesh(sphereGeo, sphereMat);
        s1.position.copy(p1);
        spheres = [s1];
        scene.add(s1);
      }

      if (showGrid && gridSize !== 'off') {
        const gridHelper = new THREE.GridHelper(
          10,
          getGridDivisions(),
          0x888888,
          0xCCCCCC
        );
        gridHelper.rotation.x = Math.PI / 2;
        scene.add(gridHelper);
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
    }

    renderScene();
  };

  if (arError) {
    return (
      <View style={styles.container}>
        <Text style={styles.fallbackText}>{arError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => setArError(null)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No access to camera</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onTouchEnd={handleTap}
      />
      <GLView
        style={StyleSheet.absoluteFill}
        onContextCreate={onContextCreate}
      />

      {measurementData.distance !== null && (
        <View style={styles.measurementBox}>
          <Text style={styles.measurementLabel}>Distance</Text>
          <Text style={styles.measurementText}>
            {convertDistance(measurementData.distance, true)}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <FloatingActionButton
          icon="arrow-undo"
          onPress={undo}
          disabled={!canUndo}
          variant="secondary"
          size="small"
          tooltipText="Undo"
        />
        <FloatingActionButton
          icon="arrow-redo"
          onPress={redo}
          disabled={!canRedo}
          variant="secondary"
          size="small"
          tooltipText="Redo"
        />
        <FloatingActionButton
          icon="grid"
          onPress={() => setShowGrid(!showGrid)}
          variant={showGrid ? 'primary' : 'secondary'}
          size="small"
          tooltipText={showGrid ? 'Hide Grid' : 'Show Grid'}
        />
        <FloatingActionButton
          icon="trash"
          onPress={handleClear}
          variant="danger"
          size="small"
          tooltipText="Clear"
        />
      </View>

      <View style={styles.instructions}>
        <View style={styles.instructionCard}>
          <Ionicons name="hand-left" size={20} color="#FFF" />
          <Text style={styles.instructionText}>
            {measurementData.points.length === 0
              ? 'Tap to place first point'
              : measurementData.points.length === 1
              ? 'Tap to place second point'
              : 'Tap to start new measurement'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#333',
    fontSize: 16,
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 12,
    textAlign: 'center',
    marginHorizontal: 24,
    fontWeight: '500',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 3,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 16,
  },
  measurementBox: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    minWidth: 180,
  },
  measurementLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  measurementText: {
    color: '#2196F3',
    fontSize: 24,
    fontWeight: 'bold',
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
  permissionButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 20,
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});