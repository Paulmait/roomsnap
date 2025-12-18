import React from 'react';
import { TouchableOpacity, StyleSheet, Text, View, GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface FloatingButtonProps {
  icon: IconName;
  label?: string;
  onPress: (event: GestureResponderEvent) => void;
}

export default function FloatingButton({ icon, label, onPress }: FloatingButtonProps) {
  const handlePress = (event: GestureResponderEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(event);
  };
  return (
    <View style={styles.wrapper}>
      <TouchableOpacity style={styles.button} onPress={handlePress}>
        <MaterialCommunityIcons name={icon} size={32} color="#fff" />
      </TouchableOpacity>
      {label && <Text style={styles.label}>{label}</Text>}
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
  label: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
});
