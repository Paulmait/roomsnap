import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

type Units = 'metric' | 'imperial';
type GridSize = 'off' | 'small' | 'medium' | 'large';

interface SettingsContextType {
  units: Units;
  setUnits: (units: Units) => void;
  gridEnabled: boolean;
  setGridEnabled: (enabled: boolean) => void;
  gridSize: GridSize;
  setGridSize: (size: GridSize) => void;
  hapticFeedback: boolean;
  setHapticFeedback: (enabled: boolean) => void;
  arQuality: 'auto' | 'high' | 'balanced' | 'performance';
  setArQuality: (quality: 'auto' | 'high' | 'balanced' | 'performance') => void;
  convertDistance: (distance: number, fromCm?: boolean) => string;
  convertDimensions: (width: number, height: number, depth: number) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_KEY = '@roomsnap_settings';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<Units>('metric');
  const [gridEnabled, setGridEnabledState] = useState(true);
  const [gridSize, setGridSizeState] = useState<GridSize>('medium');
  const [hapticFeedback, setHapticFeedbackState] = useState(true);
  const [arQuality, setArQualityState] = useState<'auto' | 'high' | 'balanced' | 'performance'>('auto');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        setUnitsState(settings.units || 'metric');
        setGridEnabledState(settings.gridEnabled ?? true);
        setGridSizeState(settings.gridSize || 'medium');
        setHapticFeedbackState(settings.hapticFeedback ?? true);
        setArQualityState(settings.arQuality || 'auto');
      } else {
        const currentLocale = Localization.getLocales()[0].languageTag;
        const defaultUnits = currentLocale.startsWith('en-US') ? 'imperial' : 'metric';
        setUnitsState(defaultUnits);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async (newSettings: any) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const setUnits = (newUnits: Units) => {
    setUnitsState(newUnits);
    saveSettings({ units: newUnits, gridEnabled, gridSize, hapticFeedback, arQuality });
  };

  const setGridEnabled = (enabled: boolean) => {
    setGridEnabledState(enabled);
    saveSettings({ units, gridEnabled: enabled, gridSize, hapticFeedback, arQuality });
  };

  const setGridSize = (size: GridSize) => {
    setGridSizeState(size);
    saveSettings({ units, gridEnabled, gridSize: size, hapticFeedback, arQuality });
  };

  const setHapticFeedback = (enabled: boolean) => {
    setHapticFeedbackState(enabled);
    saveSettings({ units, gridEnabled, gridSize, hapticFeedback: enabled, arQuality });
  };

  const setArQuality = (quality: 'auto' | 'high' | 'balanced' | 'performance') => {
    setArQualityState(quality);
    saveSettings({ units, gridEnabled, gridSize, hapticFeedback, arQuality: quality });
  };

  const convertDistance = (distance: number, fromCm = true): string => {
    if (units === 'metric') {
      if (fromCm) {
        if (distance < 100) {
          return `${distance.toFixed(1)} cm`;
        } else {
          return `${(distance / 100).toFixed(2)} m`;
        }
      }
      return `${distance.toFixed(2)} m`;
    } else {
      const inches = fromCm ? distance / 2.54 : distance * 39.3701;
      if (inches < 12) {
        return `${inches.toFixed(1)}"`;
      } else {
        const feet = Math.floor(inches / 12);
        const remainingInches = inches % 12;
        if (remainingInches < 0.5) {
          return `${feet}'`;
        }
        return `${feet}' ${remainingInches.toFixed(0)}"`;
      }
    }
  };

  const convertDimensions = (width: number, height: number, depth: number): string => {
    if (units === 'metric') {
      return `${width.toFixed(0)} × ${height.toFixed(0)} × ${depth.toFixed(0)} cm`;
    } else {
      const w = (width / 2.54).toFixed(0);
      const h = (height / 2.54).toFixed(0);
      const d = (depth / 2.54).toFixed(0);
      return `${w}" × ${h}" × ${d}"`;
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        units,
        setUnits,
        gridEnabled,
        setGridEnabled,
        gridSize,
        setGridSize,
        hapticFeedback,
        setHapticFeedback,
        arQuality,
        setArQuality,
        convertDistance,
        convertDimensions,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}