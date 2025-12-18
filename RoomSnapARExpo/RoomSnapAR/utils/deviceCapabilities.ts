import { Platform, Dimensions } from 'react-native';
import * as Device from 'expo-device';

interface DeviceCapabilities {
  hasHighPerformance: boolean;
  supportsAR: boolean;
  recommendedQuality: 'high' | 'balanced' | 'performance';
  maxTextureSize: number;
  deviceScore: number;
}

export function getDeviceCapabilities(): DeviceCapabilities {
  const { width, height } = Dimensions.get('window');
  const screenPixels = width * height;
  
  let deviceScore = 50;
  let hasHighPerformance = false;
  let supportsAR = false;
  let recommendedQuality: 'high' | 'balanced' | 'performance' = 'balanced';
  let maxTextureSize = 2048;

  if (Platform.OS === 'ios') {
    const modelName = Device.modelName || '';
    const osVersion = parseFloat(Device.osVersion || '0');
    
    supportsAR = osVersion >= 11.0;
    
    if (modelName.includes('Pro Max') || modelName.includes('Pro')) {
      deviceScore = 95;
      hasHighPerformance = true;
      recommendedQuality = 'high';
      maxTextureSize = 4096;
    } else if (modelName.includes('iPhone 14') || modelName.includes('iPhone 15')) {
      deviceScore = 90;
      hasHighPerformance = true;
      recommendedQuality = 'high';
      maxTextureSize = 4096;
    } else if (modelName.includes('iPhone 13') || modelName.includes('iPhone 12')) {
      deviceScore = 80;
      hasHighPerformance = true;
      recommendedQuality = 'high';
      maxTextureSize = 4096;
    } else if (modelName.includes('iPhone 11') || modelName.includes('iPhone XS')) {
      deviceScore = 70;
      recommendedQuality = 'balanced';
      maxTextureSize = 2048;
    } else if (modelName.includes('iPad Pro')) {
      deviceScore = 95;
      hasHighPerformance = true;
      recommendedQuality = 'high';
      maxTextureSize = 4096;
    } else if (modelName.includes('iPad')) {
      deviceScore = 75;
      recommendedQuality = 'balanced';
      maxTextureSize = 2048;
    } else {
      deviceScore = 60;
      recommendedQuality = 'performance';
      maxTextureSize = 1024;
    }
  } else if (Platform.OS === 'android') {
    const brand = Device.brand?.toLowerCase() || '';
    const totalMemory = Device.totalMemory || 0;
    const memoryGB = totalMemory / (1024 * 1024 * 1024);
    
    supportsAR = parseInt(Device.osVersion || '0') >= 7;
    
    if (memoryGB >= 8) {
      deviceScore = 85;
      hasHighPerformance = true;
      recommendedQuality = 'high';
      maxTextureSize = 4096;
    } else if (memoryGB >= 6) {
      deviceScore = 75;
      recommendedQuality = 'balanced';
      maxTextureSize = 2048;
    } else if (memoryGB >= 4) {
      deviceScore = 65;
      recommendedQuality = 'balanced';
      maxTextureSize = 2048;
    } else {
      deviceScore = 50;
      recommendedQuality = 'performance';
      maxTextureSize = 1024;
    }
    
    if (brand === 'samsung' || brand === 'google') {
      deviceScore += 5;
    }
    
    if (screenPixels > 2000000) {
      deviceScore += 5;
    }
  }
  
  if (Platform.OS === 'web') {
    supportsAR = false;
    deviceScore = 40;
    recommendedQuality = 'performance';
  }
  
  return {
    hasHighPerformance,
    supportsAR,
    recommendedQuality,
    maxTextureSize,
    deviceScore: Math.min(100, deviceScore),
  };
}

export function getOptimalARSettings(quality: 'auto' | 'high' | 'balanced' | 'performance') {
  const capabilities = getDeviceCapabilities();
  
  let actualQuality = quality;
  if (quality === 'auto') {
    actualQuality = capabilities.recommendedQuality;
  }
  
  switch (actualQuality) {
    case 'high':
      return {
        renderScale: 1.0,
        shadowMapSize: 2048,
        maxLights: 8,
        antialias: true,
        postProcessing: true,
        targetFPS: 60,
      };
    case 'balanced':
      return {
        renderScale: 0.85,
        shadowMapSize: 1024,
        maxLights: 4,
        antialias: true,
        postProcessing: false,
        targetFPS: 30,
      };
    case 'performance':
      return {
        renderScale: 0.7,
        shadowMapSize: 512,
        maxLights: 2,
        antialias: false,
        postProcessing: false,
        targetFPS: 30,
      };
    default:
      return {
        renderScale: 0.85,
        shadowMapSize: 1024,
        maxLights: 4,
        antialias: true,
        postProcessing: false,
        targetFPS: 30,
      };
  }
}