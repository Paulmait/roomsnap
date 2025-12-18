import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FloatingButton from '../components/FloatingButton';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../App';

export default function HomeScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RoomSnapAR</Text>
      <View style={styles.row}>
        <FloatingButton icon="ruler" label="Measure" onPress={() => navigation.navigate('measure')} />
        <FloatingButton icon="cube-outline" label="Place Box" onPress={() => navigation.navigate('place')} />
      </View>
      <View style={styles.row}>
        <FloatingButton icon="export-variant" label="Export" onPress={() => navigation.navigate('export')} />
        <FloatingButton icon="content-save" label="Save" onPress={() => navigation.navigate('save')} />
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
