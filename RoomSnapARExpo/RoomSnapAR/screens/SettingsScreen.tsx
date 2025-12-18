import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';
import { RoomStorage } from '../utils/roomStorage';
import * as Haptics from 'expo-haptics';

export default function SettingsScreen() {
  const {
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
  } = useSettings();

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all saved sessions and measurements. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await RoomStorage.clearAllData();
            if (hapticFeedback) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            Alert.alert('Success', 'All data has been cleared');
          },
        },
      ]
    );
  };

  const SettingRow = ({ 
    icon, 
    label, 
    value, 
    onPress, 
    type = 'text' 
  }: { 
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string | boolean;
    onPress?: () => void;
    type?: 'text' | 'switch' | 'button';
  }) => (
    <TouchableOpacity 
      style={styles.settingRow} 
      onPress={type !== 'switch' ? onPress : undefined}
      activeOpacity={type === 'switch' ? 1 : 0.7}
    >
      <View style={styles.settingLeft}>
        <Ionicons name={icon} size={24} color="#2196F3" />
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {type === 'switch' ? (
        <Switch
          value={value as boolean}
          onValueChange={onPress}
          trackColor={{ false: '#CCC', true: '#2196F3' }}
          thumbColor="#FFF"
        />
      ) : type === 'button' ? (
        <Ionicons name="chevron-forward" size={20} color="#999" />
      ) : (
        <View style={styles.settingRight}>
          <Text style={styles.settingValue}>{value}</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Measurements</Text>
        
        <SettingRow
          icon="speedometer"
          label="Units"
          value={units === 'metric' ? 'Metric (cm/m)' : 'Imperial (in/ft)'}
          onPress={() => {
            const newUnits = units === 'metric' ? 'imperial' : 'metric';
            setUnits(newUnits);
            if (hapticFeedback) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AR Display</Text>
        
        <SettingRow
          icon="grid"
          label="Show Grid"
          value={gridEnabled}
          type="switch"
          onPress={() => {
            setGridEnabled(!gridEnabled);
            if (hapticFeedback) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
        />
        
        {gridEnabled && (
          <SettingRow
            icon="resize"
            label="Grid Size"
            value={gridSize === 'small' ? 'Small' : gridSize === 'large' ? 'Large' : 'Medium'}
            onPress={() => {
              const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
              const currentIndex = sizes.indexOf(gridSize as any);
              const nextIndex = (currentIndex + 1) % sizes.length;
              setGridSize(sizes[nextIndex]);
              if (hapticFeedback) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
          />
        )}
        
        <SettingRow
          icon="settings"
          label="AR Quality"
          value={
            arQuality === 'auto' ? 'Auto' :
            arQuality === 'high' ? 'High' :
            arQuality === 'balanced' ? 'Balanced' : 'Performance'
          }
          onPress={() => {
            const qualities: Array<'auto' | 'high' | 'balanced' | 'performance'> = 
              ['auto', 'high', 'balanced', 'performance'];
            const currentIndex = qualities.indexOf(arQuality);
            const nextIndex = (currentIndex + 1) % qualities.length;
            setArQuality(qualities[nextIndex]);
            if (hapticFeedback) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Interaction</Text>
        
        <SettingRow
          icon="phone-portrait"
          label="Haptic Feedback"
          value={hapticFeedback}
          type="switch"
          onPress={() => {
            const newValue = !hapticFeedback;
            setHapticFeedback(newValue);
            if (newValue) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Management</Text>
        
        <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
          <Ionicons name="trash" size={20} color="#FFF" />
          <Text style={styles.dangerButtonText}>Clear All Data</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>RoomSnap AR v1.0.0</Text>
        <Text style={styles.footerSubtext}>Privacy-first AR measurement tool</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  section: {
    backgroundColor: '#FFF',
    marginTop: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    marginLeft: 15,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: '#999',
    marginRight: 5,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    marginHorizontal: 20,
    marginVertical: 10,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  dangerButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});