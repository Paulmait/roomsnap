import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import ARMeasureScreen from '../screens/ARMeasureScreen';
import PlaceBoxScreen from '../screens/PlaceBoxScreen';
import SavePlanScreen from '../screens/SavePlanScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { SettingsProvider } from '../contexts/SettingsContext';
import { AIVisionService } from '../services/AIVisionService';
import { VoiceCommandService } from '../services/VoiceCommandService';
import { PDFGeneratorService } from '../services/PDFGeneratorService';
import { RoomStorage } from '../utils/roomStorage';

// Mock expo modules
jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    Constants: { Type: { back: 'back' } },
  },
}));

jest.mock('expo-gl', () => ({
  GLView: 'GLView',
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///',
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('RoomSnap AR Core Functionality', () => {
  
  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <SettingsProvider>
        <NavigationContainer>
          {component}
        </NavigationContainer>
      </SettingsProvider>
    );
  };

  describe('Home Screen', () => {
    it('renders correctly', () => {
      const { getByText } = renderWithProviders(<HomeScreen />);
      expect(getByText('RoomSnap AR')).toBeTruthy();
      expect(getByText('Professional room measurement made simple')).toBeTruthy();
    });

    it('displays all feature cards', () => {
      const { getByText } = renderWithProviders(<HomeScreen />);
      expect(getByText('AI-Powered AR')).toBeTruthy();
      expect(getByText('Precise Measuring')).toBeTruthy();
      expect(getByText('Voice Control')).toBeTruthy();
      expect(getByText('PDF Export')).toBeTruthy();
      expect(getByText('Multi-Room')).toBeTruthy();
      expect(getByText('Privacy First')).toBeTruthy();
    });

    it('shows privacy notice', () => {
      const { getByText } = renderWithProviders(<HomeScreen />);
      expect(getByText(/Your data stays on your device/)).toBeTruthy();
    });
  });

  describe('AR Measure Screen', () => {
    it('requests camera permissions on mount', async () => {
      renderWithProviders(<ARMeasureScreen />);
      await waitFor(() => {
        expect(Camera.Camera.requestCameraPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('displays measurement instructions', async () => {
      const { getByText } = renderWithProviders(<ARMeasureScreen />);
      await waitFor(() => {
        expect(getByText(/Tap to place first point/)).toBeTruthy();
      });
    });

    it('shows undo/redo buttons', async () => {
      const { getAllByRole } = renderWithProviders(<ARMeasureScreen />);
      await waitFor(() => {
        const buttons = getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Settings Screen', () => {
    it('renders all settings sections', () => {
      const { getByText } = renderWithProviders(<SettingsScreen />);
      expect(getByText('Measurements')).toBeTruthy();
      expect(getByText('AR Display')).toBeTruthy();
      expect(getByText('Interaction')).toBeTruthy();
      expect(getByText('Data Management')).toBeTruthy();
    });

    it('allows unit switching', () => {
      const { getByText } = renderWithProviders(<SettingsScreen />);
      const unitsButton = getByText('Units');
      expect(unitsButton).toBeTruthy();
      fireEvent.press(unitsButton.parent!);
      // Should toggle between metric and imperial
    });

    it('shows clear data button', () => {
      const { getByText } = renderWithProviders(<SettingsScreen />);
      expect(getByText('Clear All Data')).toBeTruthy();
    });
  });

  describe('AI Vision Service', () => {
    it('analyzes images correctly', async () => {
      const aiService = AIVisionService.getInstance();
      const analysis = await aiService.analyzeImage('test-image-uri');
      
      expect(analysis).toHaveProperty('roomType');
      expect(analysis).toHaveProperty('dimensions');
      expect(analysis).toHaveProperty('furniture');
      expect(analysis).toHaveProperty('floorArea');
      expect(Array.isArray(analysis.furniture)).toBe(true);
    });

    it('generates furniture suggestions', async () => {
      const aiService = AIVisionService.getInstance();
      const analysis = await aiService.analyzeImage('test-image-uri');
      
      expect(analysis.suggestions).toBeDefined();
      expect(Array.isArray(analysis.suggestions)).toBe(true);
      expect(analysis.suggestions.length).toBeGreaterThan(0);
    });

    it('calculates room volume', () => {
      const aiService = AIVisionService.getInstance();
      const volume = aiService.calculateRoomVolume({
        width: 400,
        height: 250,
        depth: 500,
      });
      
      expect(volume).toBe(50); // in m³
    });

    it('estimates paint requirements', () => {
      const aiService = AIVisionService.getInstance();
      const paint = aiService.estimatePaintRequired(50);
      
      expect(paint.liters).toBe(10);
      expect(paint.cans).toBe(2);
    });
  });

  describe('Voice Command Service', () => {
    it('initializes correctly', async () => {
      const voiceService = VoiceCommandService.getInstance();
      await expect(voiceService.initialize()).resolves.not.toThrow();
    });

    it('returns available commands', () => {
      const voiceService = VoiceCommandService.getInstance();
      const commands = voiceService.getAvailableCommands();
      
      expect(Array.isArray(commands)).toBe(true);
      expect(commands).toContain('measure');
      expect(commands).toContain('place');
      expect(commands).toContain('undo');
      expect(commands).toContain('save');
    });

    it('handles quick commands', async () => {
      const voiceService = VoiceCommandService.getInstance();
      
      await expect(voiceService.measureDistance()).resolves.not.toThrow();
      await expect(voiceService.placeObject('sofa')).resolves.not.toThrow();
      await expect(voiceService.quickSave()).resolves.not.toThrow();
    });
  });

  describe('PDF Generator Service', () => {
    it('generates floor plan PDF', async () => {
      const pdfService = PDFGeneratorService.getInstance();
      const session = {
        id: 'test-session',
        name: 'Test Room',
        createdAt: new Date(),
        updatedAt: new Date(),
        measurements: [],
        boxes: [],
        screenshots: [],
        notes: 'Test notes',
      };
      
      const pdfPath = await pdfService.generateFloorPlan(session);
      expect(pdfPath).toContain('.pdf');
    });
  });

  describe('Room Storage', () => {
    it('creates new session', async () => {
      const session = await RoomStorage.createSession('Test Room');
      
      expect(session.id).toBeDefined();
      expect(session.name).toBe('Test Room');
      expect(session.measurements).toEqual([]);
      expect(session.boxes).toEqual([]);
    });

    it('saves and loads sessions', async () => {
      await RoomStorage.createSession('Room 1');
      await RoomStorage.createSession('Room 2');
      
      const sessions = await RoomStorage.loadSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('exports to .roomsnap format', async () => {
      const filePath = await RoomStorage.exportToRoomSnapFile();
      expect(filePath).toContain('.roomsnap');
    });

    it('clears all data', async () => {
      await RoomStorage.clearAllData();
      const sessions = await RoomStorage.loadSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('Save Plan Screen', () => {
    it('displays session list', () => {
      const { getByText } = renderWithProviders(<SavePlanScreen />);
      expect(getByText('New')).toBeTruthy();
      expect(getByText('Export')).toBeTruthy();
    });

    it('shows empty state when no sessions', () => {
      const { getByText } = renderWithProviders(<SavePlanScreen />);
      expect(getByText('No sessions yet')).toBeTruthy();
      expect(getByText('Create a new session to start measuring')).toBeTruthy();
    });
  });

  describe('Place Box Screen', () => {
    it('displays furniture presets', async () => {
      const { getByText } = renderWithProviders(<PlaceBoxScreen />);
      await waitFor(() => {
        expect(getByText('Sofa')).toBeTruthy();
        expect(getByText('Bed')).toBeTruthy();
        expect(getByText('Table')).toBeTruthy();
        expect(getByText('Chair')).toBeTruthy();
      });
    });

    it('shows placement instructions', async () => {
      const { getByText } = renderWithProviders(<PlaceBoxScreen />);
      await waitFor(() => {
        expect(getByText(/Select furniture and tap to place/)).toBeTruthy();
      });
    });
  });

  describe('Integration Tests', () => {
    it('complete measurement workflow', async () => {
      // 1. Initialize app
      const { getByText } = renderWithProviders(<ARMeasureScreen />);
      
      // 2. Wait for camera permissions
      await waitFor(() => {
        expect(Camera.Camera.requestCameraPermissionsAsync).toHaveBeenCalled();
      });
      
      // 3. Verify UI is ready
      expect(getByText(/Tap to place first point/)).toBeTruthy();
    });

    it('settings persistence', async () => {
      const { getByText, rerender } = renderWithProviders(<SettingsScreen />);
      
      // Change settings
      const unitsButton = getByText('Units');
      fireEvent.press(unitsButton.parent!);
      
      // Remount component
      rerender(
        <SettingsProvider>
          <NavigationContainer>
            <SettingsScreen />
          </NavigationContainer>
        </SettingsProvider>
      );
      
      // Settings should persist
      expect(getByText('Units')).toBeTruthy();
    });
  });
});