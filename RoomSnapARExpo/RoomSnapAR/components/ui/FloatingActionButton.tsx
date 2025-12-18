import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

interface FloatingActionButtonProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
  tooltipText?: string;
}

export function FloatingActionButton({
  icon,
  label,
  onPress,
  style,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  showTooltip = false,
  tooltipText,
}: FloatingActionButtonProps) {
  const handlePress = () => {
    if (!disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { width: 44, height: 44, borderRadius: 22 };
      case 'large':
        return { width: 64, height: 64, borderRadius: 32 };
      default:
        return { width: 56, height: 56, borderRadius: 28 };
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: disabled ? '#E0E0E0' : '#FFFFFF',
          borderWidth: 2,
          borderColor: disabled ? '#BDBDBD' : '#2196F3',
        };
      case 'danger':
        return {
          backgroundColor: disabled ? '#FFCDD2' : '#F44336',
        };
      default:
        return {
          backgroundColor: disabled ? '#90CAF9' : '#2196F3',
        };
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 20;
      case 'large':
        return 32;
      default:
        return 24;
    }
  };

  const getIconColor = () => {
    if (disabled) return '#9E9E9E';
    if (variant === 'secondary') return '#2196F3';
    return '#FFFFFF';
  };

  return (
    <View style={style}>
      {showTooltip && tooltipText && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{tooltipText}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[
          styles.button,
          getSizeStyles(),
          getVariantStyles(),
          disabled && styles.disabled,
        ]}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        {icon && (
          <Ionicons name={icon} size={getIconSize()} color={getIconColor()} />
        )}
        {label && !icon && (
          <Text style={[styles.label, { color: getIconColor() }]}>{label}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.5,
  },
  disabled: {
    elevation: 2,
    shadowOpacity: 0.1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  tooltip: {
    position: 'absolute',
    bottom: 70,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 100,
    alignItems: 'center',
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
});