import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { AuthService, User } from '../services/AuthService';
import { ApiService } from '../services/ApiService';
import { SecurityService } from '../services/SecurityService';

interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  subscriptions: {
    free: number;
    pro: number;
    enterprise: number;
  };
  revenue: {
    daily: number;
    monthly: number;
    yearly: number;
  };
}

interface AuditLogEntry {
  id: string;
  action: string;
  userId?: string;
  timestamp: Date;
  success: boolean;
  metadata?: any;
}

export default function AdminDashboard({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'metrics' | 'logs'>('users');
  
  const authService = AuthService.getInstance();
  const apiService = ApiService.getInstance();
  const securityService = SecurityService.getInstance();

  useEffect(() => {
    checkAdminAccess();
    loadDashboardData();
  }, []);

  const checkAdminAccess = () => {
    if (!authService.isAdmin && !authService.isSupport) {
      Alert.alert('Access Denied', 'Admin privileges required', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadUsers(),
        loadMetrics(),
        loadAuditLogs(),
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await apiService.adminGetUsers(1, 100);
      if (response.success && response.data) {
        setUsers(response.data.items);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadMetrics = async () => {
    try {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const response = await apiService.adminGetMetrics(startDate, endDate);
      if (response.success && response.data) {
        setMetrics(response.data);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await securityService.getAuditLogs(50);
      setAuditLogs(logs);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleUserAction = async (action: string, user: User) => {
    const adminId = authService.currentUser?.id;
    if (!adminId) return;

    setLoading(true);
    try {
      switch (action) {
        case 'reset_password':
          const resetResult = await authService.adminResetUserPassword(adminId, user.id);
          if (resetResult.success) {
            Alert.alert('Success', `Temporary password: ${resetResult.temporaryPassword}`);
          }
          break;
          
        case 'unlock':
          const unlockResult = await authService.adminUnlockAccount(adminId, user.id);
          if (unlockResult) {
            Alert.alert('Success', 'Account unlocked');
          }
          break;
          
        case 'suspend':
          Alert.prompt(
            'Suspend Account',
            'Enter reason for suspension:',
            async (reason) => {
              const suspendResult = await apiService.adminSuspendUser(user.id, reason || 'Admin action');
              if (suspendResult.success) {
                Alert.alert('Success', 'Account suspended');
                await loadUsers();
              }
            }
          );
          break;
          
        case 'delete':
          Alert.alert(
            'Delete Account',
            'Are you sure? This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  const deleteResult = await authService.adminDisableAccount(
                    adminId,
                    user.id,
                    'Admin deletion'
                  );
                  if (deleteResult) {
                    Alert.alert('Success', 'Account deleted');
                    await loadUsers();
                  }
                }
              }
            ]
          );
          break;
      }
    } catch (error) {
      Alert.alert('Error', 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => {
        setSelectedUser(item);
        setShowUserModal(true);
      }}
    >
      <View style={styles.userInfo}>
        <View style={styles.userAvatar}>
          <Text style={styles.avatarText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          <View style={styles.userMeta}>
            <View style={[styles.badge, item.isActive ? styles.activeBadge : styles.inactiveBadge]}>
              <Text style={styles.badgeText}>
                {item.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <View style={[styles.badge, styles.roleBadge]}>
              <Text style={styles.badgeText}>{item.role}</Text>
            </View>
            <View style={[styles.badge, styles.planBadge]}>
              <Text style={styles.badgeText}>{item.subscription}</Text>
            </View>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  const renderMetrics = () => (
    <ScrollView style={styles.metricsContainer}>
      {metrics && (
        <>
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Ionicons name="people" size={30} color="#2196F3" />
              <Text style={styles.metricValue}>{metrics.totalUsers}</Text>
              <Text style={styles.metricLabel}>Total Users</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="pulse" size={30} color="#4CAF50" />
              <Text style={styles.metricValue}>{metrics.activeUsers}</Text>
              <Text style={styles.metricLabel}>Active Users</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Ionicons name="person-add" size={30} color="#FF9800" />
              <Text style={styles.metricValue}>{metrics.newUsersToday}</Text>
              <Text style={styles.metricLabel}>New Today</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="trending-up" size={30} color="#9C27B0" />
              <Text style={styles.metricValue}>
                ${metrics.revenue.monthly.toFixed(0)}
              </Text>
              <Text style={styles.metricLabel}>Monthly Revenue</Text>
            </View>
          </View>

          <View style={styles.subscriptionCard}>
            <Text style={styles.sectionTitle}>Subscriptions</Text>
            <View style={styles.subscriptionRow}>
              <Text style={styles.subscriptionLabel}>Free:</Text>
              <Text style={styles.subscriptionValue}>{metrics.subscriptions.free}</Text>
            </View>
            <View style={styles.subscriptionRow}>
              <Text style={styles.subscriptionLabel}>Pro:</Text>
              <Text style={styles.subscriptionValue}>{metrics.subscriptions.pro}</Text>
            </View>
            <View style={styles.subscriptionRow}>
              <Text style={styles.subscriptionLabel}>Enterprise:</Text>
              <Text style={styles.subscriptionValue}>{metrics.subscriptions.enterprise}</Text>
            </View>
          </View>

          <View style={styles.revenueCard}>
            <Text style={styles.sectionTitle}>Revenue</Text>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Daily:</Text>
              <Text style={styles.revenueValue}>${metrics.revenue.daily.toFixed(2)}</Text>
            </View>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Monthly:</Text>
              <Text style={styles.revenueValue}>${metrics.revenue.monthly.toFixed(2)}</Text>
            </View>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Yearly:</Text>
              <Text style={styles.revenueValue}>${metrics.revenue.yearly.toFixed(2)}</Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );

  const renderAuditLogs = () => (
    <FlatList
      data={auditLogs}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.logCard}>
          <View style={styles.logHeader}>
            <Text style={styles.logAction}>{item.action}</Text>
            <View style={[
              styles.logStatus,
              item.success ? styles.successStatus : styles.failureStatus
            ]}>
              <Text style={styles.logStatusText}>
                {item.success ? 'Success' : 'Failed'}
              </Text>
            </View>
          </View>
          <Text style={styles.logTime}>
            {new Date(item.timestamp).toLocaleString()}
          </Text>
          {item.userId && (
            <Text style={styles.logUser}>User: {item.userId}</Text>
          )}
        </View>
      )}
    />
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2196F3', '#21CBF3']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <Text style={styles.headerSubtitle}>
          Manage users and monitor system
        </Text>
      </LinearGradient>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.activeTab]}
          onPress={() => setActiveTab('users')}
        >
          <Ionicons name="people" size={20} color={activeTab === 'users' ? '#2196F3' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>
            Users
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'metrics' && styles.activeTab]}
          onPress={() => setActiveTab('metrics')}
        >
          <Ionicons name="stats-chart" size={20} color={activeTab === 'metrics' ? '#2196F3' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'metrics' && styles.activeTabText]}>
            Metrics
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'logs' && styles.activeTab]}
          onPress={() => setActiveTab('logs')}
        >
          <Ionicons name="list" size={20} color={activeTab === 'logs' ? '#2196F3' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'logs' && styles.activeTabText]}>
            Logs
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'users' && (
        <>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          
          <FlatList
            data={filteredUsers}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            contentContainerStyle={styles.listContainer}
          />
        </>
      )}

      {activeTab === 'metrics' && renderMetrics()}
      {activeTab === 'logs' && renderAuditLogs()}

      {/* User Details Modal */}
      <Modal
        visible={showUserModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Details</Text>
              <TouchableOpacity onPress={() => setShowUserModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{selectedUser.name}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email:</Text>
                  <Text style={styles.detailValue}>{selectedUser.email}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Role:</Text>
                  <Text style={styles.detailValue}>{selectedUser.role}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={styles.detailValue}>
                    {selectedUser.isActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Verified:</Text>
                  <Text style={styles.detailValue}>
                    {selectedUser.isVerified ? 'Yes' : 'No'}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Subscription:</Text>
                  <Text style={styles.detailValue}>{selectedUser.subscription}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>2FA:</Text>
                  <Text style={styles.detailValue}>
                    {selectedUser.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Created:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedUser.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Last Login:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedUser.lastLogin).toLocaleString()}
                  </Text>
                </View>
                
                {selectedUser.loginAttempts > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Failed Attempts:</Text>
                    <Text style={styles.detailValue}>{selectedUser.loginAttempts}</Text>
                  </View>
                )}
                
                {selectedUser.lockedUntil && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Locked Until:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedUser.lockedUntil).toLocaleString()}
                    </Text>
                  </View>
                )}

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.resetButton]}
                    onPress={() => {
                      setShowUserModal(false);
                      handleUserAction('reset_password', selectedUser);
                    }}
                  >
                    <Ionicons name="key" size={20} color="#FFF" />
                    <Text style={styles.actionButtonText}>Reset Password</Text>
                  </TouchableOpacity>
                  
                  {selectedUser.lockedUntil && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.unlockButton]}
                      onPress={() => {
                        setShowUserModal(false);
                        handleUserAction('unlock', selectedUser);
                      }}
                    >
                      <Ionicons name="lock-open" size={20} color="#FFF" />
                      <Text style={styles.actionButtonText}>Unlock Account</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[styles.actionButton, styles.suspendButton]}
                    onPress={() => {
                      setShowUserModal(false);
                      handleUserAction('suspend', selectedUser);
                    }}
                  >
                    <Ionicons name="pause-circle" size={20} color="#FFF" />
                    <Text style={styles.actionButtonText}>Suspend</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => {
                      setShowUserModal(false);
                      handleUserAction('delete', selectedUser);
                    }}
                  >
                    <Ionicons name="trash" size={20} color="#FFF" />
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#2196F3',
  },
  tabText: {
    fontSize: 14,
    color: '#999',
  },
  activeTabText: {
    color: '#2196F3',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    margin: 15,
    paddingHorizontal: 15,
    borderRadius: 10,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  listContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
  },
  userInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  userMeta: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeBadge: {
    backgroundColor: '#E8F5E9',
  },
  inactiveBadge: {
    backgroundColor: '#FFEBEE',
  },
  roleBadge: {
    backgroundColor: '#E3F2FD',
  },
  planBadge: {
    backgroundColor: '#FFF3E0',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metricsContainer: {
    padding: 15,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 15,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    elevation: 2,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  subscriptionCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 20,
    marginBottom: 15,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  subscriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  subscriptionLabel: {
    fontSize: 14,
    color: '#666',
  },
  subscriptionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  revenueCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 20,
    elevation: 2,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  revenueLabel: {
    fontSize: 14,
    color: '#666',
  },
  revenueValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  logCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 15,
    marginHorizontal: 15,
    marginBottom: 10,
    elevation: 2,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  logStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  successStatus: {
    backgroundColor: '#E8F5E9',
  },
  failureStatus: {
    backgroundColor: '#FFEBEE',
  },
  logStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  logTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  logUser: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    borderRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    padding: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  actionButtons: {
    marginTop: 20,
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  resetButton: {
    backgroundColor: '#2196F3',
  },
  unlockButton: {
    backgroundColor: '#4CAF50',
  },
  suspendButton: {
    backgroundColor: '#FF9800',
  },
  deleteButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});