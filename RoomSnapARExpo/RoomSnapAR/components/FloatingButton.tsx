import React from 'react';
import { TouchableOpacity, StyleSheet, Text, View, GestureResponderEvent, AccessibilityRole } from 'react-native';
import * as Haptics from 'expo-haptics';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface FloatingButtonProps {
  icon: IconName;
  label?: string;
  onPress: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  disabled?: boolean;
}

export default function FloatingButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  disabled = false,
}: FloatingButtonProps) {
  const handlePress = (event: GestureResponderEvent) => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(event);
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handlePress}
        accessible={true}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityHint={accessibilityHint}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled }}
        disabled={disabled}
      >
        <MaterialCommunityIcons
          name={icon}
          size={32}
          color={disabled ? '#999' : '#fff'}
        />
      </TouchableOpacity>
      {label && (
        <Text
          style={[styles.label, disabled && styles.labelDisabled]}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        >
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginHorizontal: 20,
  },
  button: {
    backgroundColor: '#0097a7',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    marginBottom: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    elevation: 0,
  },
  label: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  labelDisabled: {
    color: '#999',
  },
});
