import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorCount: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Log error to crash reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // You can log to services like Sentry, Bugsnag, etc.
    this.logErrorToService(error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
      errorCount: this.state.errorCount + 1,
    });
  }

  logErrorToService = (error: Error, errorInfo: any) => {
    // Implement crash reporting here
    // Example: Sentry.captureException(error, { extra: errorInfo });
    
    // For now, just log to console
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    };
    
    console.log('Error logged:', errorData);
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    });
  };

  handleReload = () => {
    // In production, this would reload the app
    // For now, just reset the error state
    this.handleReset();
    
    // Alternative: You could also reload the entire app in development
    if (__DEV__ && Platform.OS === 'web') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Ionicons name="warning" size={48} color="#FF5252" />
              <Text style={styles.title}>Oops! Something went wrong</Text>
              <Text style={styles.subtitle}>
                The app encountered an unexpected error
              </Text>
            </View>

            <View style={styles.errorDetails}>
              <Text style={styles.errorMessage}>
                {this.state.error?.message || 'Unknown error occurred'}
              </Text>
              
              {__DEV__ && this.state.error?.stack && (
                <ScrollView style={styles.stackTrace} horizontal>
                  <Text style={styles.stackText}>
                    {this.state.error.stack}
                  </Text>
                </ScrollView>
              )}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={this.handleReset}
              >
                <Ionicons name="refresh" size={20} color="#FFF" />
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={this.handleReload}
              >
                <Ionicons name="reload" size={20} color="#2196F3" />
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                  Restart App
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.helpSection}>
              <Text style={styles.helpTitle}>What can you do?</Text>
              <View style={styles.helpItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.helpText}>
                  Try again - this often resolves temporary issues
                </Text>
              </View>
              <View style={styles.helpItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.helpText}>
                  Restart the app to clear any corrupted state
                </Text>
              </View>
              <View style={styles.helpItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.helpText}>
                  If the problem persists, please update the app
                </Text>
              </View>
            </View>

            {this.state.errorCount > 2 && (
              <View style={styles.persistentError}>
                <Text style={styles.persistentErrorText}>
                  This error has occurred multiple times. 
                  Please restart the app or contact support.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  errorDetails: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  errorMessage: {
    fontSize: 14,
    color: '#D32F2F',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stackTrace: {
    marginTop: 12,
    maxHeight: 120,
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 8,
  },
  stackText: {
    fontSize: 11,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actions: {
    gap: 12,
    marginBottom: 30,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  secondaryButtonText: {
    color: '#2196F3',
  },
  helpSection: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  persistentError: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  persistentErrorText: {
    fontSize: 14,
    color: '#E65100',
    textAlign: 'center',
  },
});

export default ErrorBoundary;