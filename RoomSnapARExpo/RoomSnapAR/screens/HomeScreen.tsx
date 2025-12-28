import React from 'react';
import { View, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import FloatingButton from '../components/FloatingButton';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../App';

export default function HomeScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityLabel="RoomSnap AR Home Screen"
      accessibilityRole="main"
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        accessibilityLabel="RoomSnap AR, home screen"
      >
        RoomSnapAR
      </Text>
      <View style={styles.row} accessibilityRole="menubar">
        <FloatingButton
          icon="ruler"
          label="Measure"
          onPress={() => navigation.navigate('measure')}
          accessibilityLabel="Measure room dimensions"
          accessibilityHint="Opens AR camera to measure distances between points"
        />
        <FloatingButton
          icon="cube-outline"
          label="Place Box"
          onPress={() => navigation.navigate('place')}
          accessibilityLabel="Place virtual furniture"
          accessibilityHint="Opens AR view to place and resize 3D objects"
        />
      </View>
      <View style={styles.row} accessibilityRole="menubar">
        <FloatingButton
          icon="export-variant"
          label="Export"
          onPress={() => navigation.navigate('export')}
          accessibilityLabel="Export floor plan"
          accessibilityHint="Export your measurements as PDF or share with others"
        />
        <FloatingButton
          icon="content-save"
          label="Save"
          onPress={() => navigation.navigate('save')}
          accessibilityLabel="Save current session"
          accessibilityHint="Save your measurements and furniture layout for later"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 30,
  },
});
