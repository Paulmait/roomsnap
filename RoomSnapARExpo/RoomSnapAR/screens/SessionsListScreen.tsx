import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RoomStorage, RoomSession } from '../utils/roomStorage';
import { useSettings } from '../contexts/SettingsContext';
import * as Haptics from 'expo-haptics';

export default function SessionsListScreen() {
  const [sessions, setSessions] = useState<RoomSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const { hapticFeedback } = useSettings();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const loadedSessions = await RoomStorage.loadSessions();
      // Sort by most recent first
      const sortedSessions = loadedSessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setSessions(sortedSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      Alert.alert('Error', 'Failed to load sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  const handleCreateSession = async () => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // Since Alert.prompt is iOS only, use a default name for now
    // In production, you'd want to use a modal with TextInput
    const defaultName = `Room ${sessions.length + 1}`;
    
    try {
      await RoomStorage.createSession(defaultName);
      loadSessions();
      Alert.alert('Success', `Session "${defaultName}" created successfully`);
    } catch (error) {
      Alert.alert('Error', 'Failed to create session');
    }
  };

  const handleDeleteSession = (session: RoomSession) => {
    Alert.alert(
      'Delete Session',
      `Are you sure you want to delete "${session.name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await RoomStorage.deleteSession(session.id);
              loadSessions();
              if (hapticFeedback) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete session');
            }
          },
        },
      ]
    );
  };

  const handleExportSession = async (session: RoomSession) => {
    try {
      const filePath = await RoomStorage.exportToRoomSnapFile([session.id]);
      Alert.alert('Success', `Session exported to: ${filePath}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to export session');
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderSessionItem = ({ item }: { item: RoomSession }) => {
    const measurementCount = item.measurements?.length || 0;
    const boxCount = item.boxes?.length || 0;
    const screenshotCount = item.screenshots?.length || 0;

    return (
      <TouchableOpacity 
        style={styles.sessionCard}
        onPress={() => {
          // Navigate to session detail or AR view with this session
          if (hapticFeedback) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }}
      >
        <View style={styles.sessionHeader}>
          <View style={styles.sessionTitleContainer}>
            <Text style={styles.sessionName}>{item.name}</Text>
            <Text style={styles.sessionDate}>{formatDate(item.updatedAt)}</Text>
          </View>
          <View style={styles.sessionActions}>
            <TouchableOpacity 
              onPress={() => handleExportSession(item)}
              style={styles.actionButton}
            >
              <Ionicons name="share-outline" size={20} color="#2196F3" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => handleDeleteSession(item)}
              style={styles.actionButton}
            >
              <Ionicons name="trash-outline" size={20} color="#FF5252" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.sessionStats}>
          <View style={styles.statItem}>
            <Ionicons name="resize" size={16} color="#666" />
            <Text style={styles.statText}>{measurementCount} measurements</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="cube-outline" size={16} color="#666" />
            <Text style={styles.statText}>{boxCount} objects</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="camera-outline" size={16} color="#666" />
            <Text style={styles.statText}>{screenshotCount} screenshots</Text>
          </View>
        </View>
        
        {item.notes ? (
          <Text style={styles.sessionNotes} numberOfLines={2}>
            {item.notes}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="folder-open-outline" size={64} color="#CCC" />
      <Text style={styles.emptyStateTitle}>No Sessions Yet</Text>
      <Text style={styles.emptyStateText}>
        Create your first room measurement session to get started
      </Text>
      <TouchableOpacity 
        style={styles.createButton}
        onPress={handleCreateSession}
      >
        <Ionicons name="add-circle" size={24} color="#FFF" />
        <Text style={styles.createButtonText}>Create Session</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading sessions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionItem}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2196F3']}
          />
        }
        contentContainerStyle={sessions.length === 0 ? styles.emptyContainer : styles.listContainer}
      />
      
      {sessions.length > 0 && (
        <TouchableOpacity 
          style={styles.fab}
          onPress={handleCreateSession}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sessionTitleContainer: {
    flex: 1,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sessionDate: {
    fontSize: 14,
    color: '#666',
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  sessionStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: '#666',
  },
  sessionNotes: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});