// React Native mock for Jest testing
module.exports = {
  Platform: {
    OS: 'ios',
    Version: '16.0',
    select: jest.fn((obj) => obj.ios || obj.default),
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
    absoluteFill: {},
    absoluteFillObject: {},
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  Image: 'Image',
  TextInput: 'TextInput',
  Modal: 'Modal',
  ActivityIndicator: 'ActivityIndicator',
  Dimensions: {
    get: jest.fn().mockReturnValue({ width: 375, height: 812 }),
  },
  Animated: {
    View: 'Animated.View',
    Text: 'Animated.Text',
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn(),
    })),
    timing: jest.fn(() => ({
      start: jest.fn(),
    })),
    spring: jest.fn(() => ({
      start: jest.fn(),
    })),
  },
  Alert: {
    alert: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(),
    canOpenURL: jest.fn().mockResolvedValue(true),
  },
  NativeModules: {},
  useWindowDimensions: jest.fn().mockReturnValue({ width: 375, height: 812 }),
  useColorScheme: jest.fn().mockReturnValue('light'),
};
