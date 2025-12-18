import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { RoomStorage, RoomSession } from '../utils/roomStorage';
import { useSettings } from '../contexts/SettingsContext';
import * as Haptics from 'expo-haptics';

export default function SavePlanScreen() {
  const [sessions, setSessions] = useState<RoomSession[]>([]);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { hapticFeedback, convertDistance } = useSettings();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const loadedSessions = await RoomStorage.loadSessions();
    setSessions(loadedSessions.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  };

  const createNewSession = async () => {
    if (newSessionName.trim()) {
      const session = await RoomStorage.createSession(newSessionName.trim());
      setNewSessionName('');
      setShowNewSessionModal(false);
      await loadSessions();
      
      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  };

  const deleteSession = async (sessionId: string) => {
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await RoomStorage.deleteSession(sessionId);
            await loadSessions();
            if (hapticFeedback) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          },
        },
      ]
    );
  };

  const exportSessions = async () => {
    try {
      const filePath = await RoomStorage.exportToRoomSnapFile(
        selectedSessions.length > 0 ? selectedSessions : undefined
      );
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Export RoomSnap File',
        });
        
        if (hapticFeedback) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
      
      setIsSelectionMode(false);
      setSelectedSessions([]);
    } catch (error) {
      Alert.alert('Export Failed', 'Could not export sessions');
    }
  };

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessions(prev =>
      prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
    
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const SessionCard = ({ session }: { session: RoomSession }) => {
    const isSelected = selectedSessions.includes(session.id);
    
    return (
      <TouchableOpacity
        style={[styles.sessionCard, isSelected && styles.sessionCardSelected]}
        onPress={() => {
          if (isSelectionMode) {
            toggleSessionSelection(session.id);
          }
        }}
        onLongPress={() => {
          if (!isSelectionMode) {
            setIsSelectionMode(true);
            toggleSessionSelection(session.id);
          }
        }}
      >
        {isSelectionMode && (
          <View style={styles.selectionCheckbox}>
            <Ionicons 
              name={isSelected ? 'checkbox' : 'square-outline'} 
              size={24} 
              color={isSelected ? '#2196F3' : '#999'} 
            />
          </View>
        )}
        
        <View style={styles.sessionContent}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionName}>{session.name}</Text>
            {!isSelectionMode && (
              <TouchableOpacity onPress={() => deleteSession(session.id)}>
                <Ionicons name="trash-outline" size={20} color="#F44336" />
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.sessionDate}>{formatDate(session.updatedAt)}</Text>
          
          <View style={styles.sessionStats}>
            <View style={styles.statItem}>
              <Ionicons name="resize" size={16} color="#666" />
              <Text style={styles.statText}>
                {session.measurements.length} measurements
              </Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="cube" size={16} color="#666" />
              <Text style={styles.statText}>
                {session.boxes.length} objects
              </Text>
            </View>
          </View>
          
          {session.notes && (
            <Text style={styles.sessionNotes} numberOfLines={2}>
              {session.notes}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity 
          style={styles.toolbarButton}
          onPress={() => setShowNewSessionModal(true)}
        >
          <Ionicons name="add-circle" size={24} color="#2196F3" />
          <Text style={styles.toolbarButtonText}>New</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.toolbarButton, sessions.length === 0 && styles.disabled]}
          onPress={exportSessions}
          disabled={sessions.length === 0}
        >
          <Ionicons name="share" size={24} color={sessions.length === 0 ? '#CCC' : '#2196F3'} />
          <Text style={[styles.toolbarButtonText, sessions.length === 0 && styles.disabledText]}>
            Export
          </Text>
        </TouchableOpacity>
        
        {isSelectionMode && (
          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => {
              setIsSelectionMode(false);
              setSelectedSessions([]);
            }}
          >
            <Ionicons name="close-circle" size={24} color="#F44336" />
            <Text style={styles.toolbarButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {isSelectionMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>
            {selectedSessions.length} selected
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (selectedSessions.length === sessions.length) {
                setSelectedSessions([]);
              } else {
                setSelectedSessions(sessions.map(s => s.id));
              }
            }}
          >
            <Text style={styles.selectAllText}>
              {selectedSessions.length === sessions.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      
      <ScrollView
        style={styles.sessionsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {sessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open" size={64} color="#CCC" />
            <Text style={styles.emptyStateText}>No sessions yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Create a new session to start measuring
            </Text>
          </View>
        ) : (
          sessions.map(session => (
            <SessionCard key={session.id} session={session} />
          ))
        )}
      </ScrollView>
      
      <Modal
        visible={showNewSessionModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Session</Text>
            <TextInput
              style={styles.modalInput}
              value={newSessionName}
              onChangeText={setNewSessionName}
              placeholder="Enter session name (e.g., Living Room)"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowNewSessionModal(false);
                  setNewSessionName('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={createNewSession}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 20,
  },
  toolbarButton: {
    alignItems: 'center',
    gap: 4,
  },
  toolbarButtonText: {
    fontSize: 12,
    color: '#2196F3',
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#CCC',
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  selectionText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '500',
  },
  selectAllText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },
  sessionsList: {
    flex: 1,
  },
  sessionCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 15,
    marginVertical: 8,
    borderRadius: 12,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionCardSelected: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  selectionCheckbox: {
    marginRight: 12,
  },
  sessionContent: {
    flex: 1,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  sessionDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  sessionStats: {
    flexDirection: 'row',
    gap: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statText: {
    fontSize: 13,
    color: '#666',
  },
  sessionNotes: {
    fontSize: 13,
    color: '#777',
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#666',
    marginTop: 15,
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    width: '85%',
    maxWidth: 350,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F0F0F0',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#2196F3',
  },
  createButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});