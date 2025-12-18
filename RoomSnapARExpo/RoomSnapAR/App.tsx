import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './screens/HomeScreen';
import ARMeasureScreen from './screens/ARMeasureScreen';
import PlaceBoxScreen from './screens/PlaceBoxScreen';
import ExportPlanScreen from './screens/ExportPlanScreen';
import SavePlanScreen from './screens/SavePlanScreen';

export type RootStackParamList = {
  Home: undefined;
  ARMeasure: undefined;
  PlaceBox: undefined;
  ExportPlan: undefined;
  SavePlan: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="ARMeasure" component={ARMeasureScreen} options={{ title: 'Measure' }} />
        <Stack.Screen name="PlaceBox" component={PlaceBoxScreen} options={{ title: 'Place Box' }} />
        <Stack.Screen name="ExportPlan" component={ExportPlanScreen} options={{ title: 'Export Plan' }} />
        <Stack.Screen name="SavePlan" component={SavePlanScreen} options={{ title: 'Save Plan' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
