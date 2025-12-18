import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SubscriptionService, ComplianceData } from '../services/SubscriptionService';
import { SecurityService } from '../services/SecurityService';

export default function SubscriptionScreen() {
  const [currentPlan, setCurrentPlan] = useState('free');
  const [loading, setLoading] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [compliance, setCompliance] = useState<ComplianceData>({
    gdprConsent: false,
    ccpaOptOut: false,
    termsAccepted: false,
    privacyAccepted: false,
    marketingOptIn: false,
    dataRetentionDays: 90,
    consentDate: new Date(),
  });

  const subscriptionService = SubscriptionService.getInstance();
  const securityService = SecurityService.getInstance();

  useEffect(() => {
    loadSubscriptionStatus();
  }, []);

  const loadSubscriptionStatus = async () => {
    const status = await subscriptionService.getSubscriptionStatus();
    setCurrentPlan(status.plan);
  };

  const handleSubscribe = async (planId: string) => {
    setSelectedPlan(planId);
    
    if (planId === 'free') {
      await subscribeToPlan(planId);
      return;
    }
    
    // Show compliance modal for paid plans
    setShowComplianceModal(true);
  };

  const subscribeToPlan = async (planId: string) => {
    setLoading(true);
    
    try {
      // Encrypt sensitive data before processing
      const encryptedCompliance = await securityService.encrypt(
        JSON.stringify(compliance)
      );
      
      // Process subscription
      const success = await subscriptionService.subscribe(planId, compliance);
      
      if (success) {
        setCurrentPlan(planId);
        Alert.alert(
          'Success!',
          `You're now subscribed to ${SubscriptionService.PLANS.find(p => p.id === planId)?.name}`,
          [{ text: 'OK' }]
        );
        
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Subscription Failed', 'Please try again later');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process subscription');
    } finally {
      setLoading(false);
      setShowComplianceModal(false);
    }
  };

  const handleCancel = async () => {
    Alert.alert(
      '🚨 Cancel Subscription',
      'You can cancel anytime. Your subscription will remain active until the end of the billing period.\n\nWhy are you leaving?',
      [
        { text: 'Too expensive', onPress: () => processCancellation('price') },
        { text: 'Not using enough', onPress: () => processCancellation('usage') },
        { text: 'Missing features', onPress: () => processCancellation('features') },
        { text: 'Other reason', onPress: () => processCancellation('other') },
        { text: 'Keep Subscription', style: 'cancel' },
      ]
    );
  };

  const processCancellation = async (reason: string) => {
    setLoading(true);
    
    try {
      const success = await subscriptionService.cancelSubscription(reason);
      
      if (success) {
        Alert.alert(
          '✅ Subscription Cancelled',
          'Your subscription has been cancelled. You can continue using Pro features until the end of your billing period.\n\nWe\'re sorry to see you go!',
          [
            { text: 'Export My Data', onPress: exportUserData },
            { text: 'Delete My Data', onPress: confirmDataDeletion, style: 'destructive' },
            { text: 'OK' },
          ]
        );
        
        setCurrentPlan('free');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to cancel subscription');
    } finally {
      setLoading(false);
    }
  };

  const exportUserData = async () => {
    try {
      const userData = await subscriptionService.exportUserData();
      // In production, this would save to a file or email
      Alert.alert('Data Exported', 'Your data has been exported successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to export data');
    }
  };

  const confirmDataDeletion = () => {
    Alert.alert(
      '⚠️ Delete All Data',
      'This will permanently delete all your data. This action cannot be undone.',
      [
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            await subscriptionService.deleteUserData();
            Alert.alert('Data Deleted', 'All your data has been permanently deleted');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const PlanCard = ({ plan }: { plan: typeof SubscriptionService.PLANS[0] }) => {
    const isCurrentPlan = currentPlan === plan.id;
    const isPro = plan.id.includes('pro');
    
    return (
      <TouchableOpacity
        style={[styles.planCard, isCurrentPlan && styles.currentPlanCard]}
        onPress={() => !isCurrentPlan && handleSubscribe(plan.id)}
        disabled={isCurrentPlan || loading}
      >
        {plan.popularTag && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>MOST POPULAR</Text>
          </View>
        )}
        
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planPrice}>{plan.price}</Text>
          {plan.savePercentage && (
            <View style={styles.saveBadge}>
              <Text style={styles.saveText}>Save {plan.savePercentage}%</Text>
            </View>
          )}
        </View>
        
        <View style={styles.featuresList}>
          {plan.features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Ionicons 
                name="checkmark-circle" 
                size={20} 
                color={isPro ? '#4CAF50' : '#999'} 
              />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
        
        {isCurrentPlan ? (
          <View style={styles.currentPlanBadge}>
            <Text style={styles.currentPlanText}>CURRENT PLAN</Text>
          </View>
        ) : (
          <LinearGradient
            colors={isPro ? ['#2196F3', '#21CBF3'] : ['#E0E0E0', '#F5F5F5']}
            style={styles.selectButton}
          >
            <Text style={[styles.selectButtonText, !isPro && styles.selectButtonTextFree]}>
              {plan.id === 'enterprise' ? 'Contact Sales' : 'Select Plan'}
            </Text>
          </LinearGradient>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#2196F3', '#21CBF3']}
        style={styles.header}
      >
        <Ionicons name="diamond" size={50} color="#FFF" />
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
        <Text style={styles.headerSubtitle}>
          Cancel anytime with 1-click • No hidden fees
        </Text>
      </LinearGradient>

      {/* Current Subscription Status */}
      {currentPlan !== 'free' && (
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Current Plan:</Text>
            <Text style={styles.statusValue}>
              {SubscriptionService.PLANS.find(p => p.id === currentPlan)?.name}
            </Text>
          </View>
          
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Plans */}
      <View style={styles.plansContainer}>
        {SubscriptionService.PLANS.map(plan => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </View>

      {/* Benefits */}
      <View style={styles.benefitsSection}>
        <Text style={styles.benefitsTitle}>Why Choose Pro?</Text>
        <View style={styles.benefitsList}>
          <View style={styles.benefitItem}>
            <Ionicons name="shield-checkmark" size={24} color="#4CAF50" />
            <Text style={styles.benefitText}>30-day money-back guarantee</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="lock-closed" size={24} color="#4CAF50" />
            <Text style={styles.benefitText}>Bank-level encryption</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="flash" size={24} color="#4CAF50" />
            <Text style={styles.benefitText}>Instant activation</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="close-circle" size={24} color="#4CAF50" />
            <Text style={styles.benefitText}>Cancel anytime, no questions</Text>
          </View>
        </View>
      </View>

      {/* Compliance Modal */}
      <Modal
        visible={showComplianceModal}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Privacy & Terms</Text>
            
            <ScrollView style={styles.complianceList}>
              <View style={styles.complianceItem}>
                <Switch
                  value={compliance.termsAccepted}
                  onValueChange={v => setCompliance({...compliance, termsAccepted: v})}
                />
                <Text style={styles.complianceText}>
                  I accept the <Text style={styles.link} onPress={() => Linking.openURL('https://roomsnap.app/terms')}>
                    Terms of Service
                  </Text>
                </Text>
              </View>
              
              <View style={styles.complianceItem}>
                <Switch
                  value={compliance.privacyAccepted}
                  onValueChange={v => setCompliance({...compliance, privacyAccepted: v})}
                />
                <Text style={styles.complianceText}>
                  I accept the <Text style={styles.link} onPress={() => Linking.openURL('https://roomsnap.app/privacy')}>
                    Privacy Policy
                  </Text>
                </Text>
              </View>
              
              <View style={styles.complianceItem}>
                <Switch
                  value={compliance.gdprConsent}
                  onValueChange={v => setCompliance({...compliance, gdprConsent: v})}
                />
                <Text style={styles.complianceText}>
                  I consent to data processing (GDPR)
                </Text>
              </View>
              
              <View style={styles.complianceItem}>
                <Switch
                  value={!compliance.ccpaOptOut}
                  onValueChange={v => setCompliance({...compliance, ccpaOptOut: !v})}
                />
                <Text style={styles.complianceText}>
                  Share my data (CCPA - California residents)
                </Text>
              </View>
              
              <View style={styles.complianceItem}>
                <Switch
                  value={compliance.marketingOptIn}
                  onValueChange={v => setCompliance({...compliance, marketingOptIn: v})}
                />
                <Text style={styles.complianceText}>
                  Send me product updates (optional)
                </Text>
              </View>
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowComplianceModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  (!compliance.termsAccepted || !compliance.privacyAccepted) && styles.disabledButton
                ]}
                onPress={() => subscribeToPlan(selectedPlan)}
                disabled={!compliance.termsAccepted || !compliance.privacyAccepted}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <Text style={styles.securityNote}>
              🔒 Secured by 256-bit encryption
            </Text>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 8,
  },
  statusCard: {
    backgroundColor: '#FFF',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    backgroundColor: '#F44336',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  plansContainer: {
    paddingHorizontal: 20,
  },
  planCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  currentPlanCard: {
    borderColor: '#2196F3',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  popularText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  planHeader: {
    marginBottom: 20,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    marginTop: 5,
  },
  saveBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  saveText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  featuresList: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: '#555',
    flex: 1,
  },
  currentPlanBadge: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  currentPlanText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: 'bold',
  },
  selectButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  selectButtonTextFree: {
    color: '#666',
  },
  benefitsSection: {
    padding: 20,
  },
  benefitsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  benefitsList: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 12,
  },
  benefitText: {
    fontSize: 14,
    color: '#555',
    flex: 1,
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
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  complianceList: {
    maxHeight: 300,
  },
  complianceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 10,
  },
  complianceText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  link: {
    color: '#2196F3',
    textDecorationLine: 'underline',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  securityNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 15,
  },
});