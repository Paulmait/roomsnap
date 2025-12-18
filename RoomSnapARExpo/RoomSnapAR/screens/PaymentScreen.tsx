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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { PaymentService, PaymentMethod } from '../services/PaymentService';
import { ConfigService } from '../services/ConfigService';
import { AuthService } from '../services/AuthService';

export default function PaymentScreen({ route, navigation }: any) {
  const [loading, setLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [showAddCard, setShowAddCard] = useState(false);
  
  // Card input fields
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [billingZip, setBillingZip] = useState('');
  
  const paymentService = PaymentService.getInstance();
  const configService = ConfigService.getInstance();
  const authService = AuthService.getInstance();
  
  const { planId, amount } = route.params || {};

  useEffect(() => {
    loadPaymentMethods();
    initializePaymentService();
  }, []);

  const initializePaymentService = async () => {
    try {
      await paymentService.initialize();
      
      // Validate configuration
      const validation = configService.validateConfiguration();
      if (!validation.isValid) {
        console.warn('Configuration issues:', validation.errors);
      }
    } catch (error) {
      console.error('Payment service initialization failed:', error);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      const methods = await paymentService.getPaymentMethods();
      setPaymentMethods(methods);
      
      // Select default method
      const defaultMethod = methods.find(m => m.isDefault);
      if (defaultMethod) {
        setSelectedMethod(defaultMethod.id);
      }
    } catch (error) {
      console.error('Failed to load payment methods:', error);
    }
  };

  const handleAddCard = async () => {
    if (!validateCardInput()) {
      return;
    }
    
    setLoading(true);
    
    try {
      // Format card data
      const [month, year] = expiryDate.split('/');
      const cardDetails = {
        number: cardNumber.replace(/\s/g, ''),
        exp_month: parseInt(month),
        exp_year: parseInt('20' + year),
        cvc: cvv,
        name: cardholderName,
        address_zip: billingZip,
        last4: cardNumber.slice(-4),
        brand: detectCardBrand(cardNumber)
      };
      
      // Add payment method
      const newMethod = await paymentService.addPaymentMethod('card', cardDetails);
      
      // Update local state
      setPaymentMethods([...paymentMethods, newMethod]);
      setSelectedMethod(newMethod.id);
      setShowAddCard(false);
      
      // Clear form
      clearCardForm();
      
      Alert.alert('Success', 'Payment method added successfully');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Error', 'Failed to add payment method');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }
    
    if (!amount || !planId) {
      Alert.alert('Error', 'Invalid payment parameters');
      return;
    }
    
    setLoading(true);
    
    try {
      // Create payment intent
      const paymentIntent = await paymentService.createPaymentIntent(amount);
      
      // Confirm payment
      const success = await paymentService.confirmPayment(
        paymentIntent.id,
        selectedMethod
      );
      
      if (success) {
        // Create subscription if this is a plan purchase
        if (planId !== 'one_time') {
          await paymentService.createSubscription(planId, selectedMethod);
        }
        
        Alert.alert(
          'Payment Successful!',
          'Your payment has been processed successfully.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Home')
            }
          ]
        );
        
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Payment Failed', 'Please try again or use a different payment method');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error) {
      Alert.alert('Error', 'Payment processing failed. Please try again.');
      console.error('Payment error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMethod = async (methodId: string) => {
    Alert.alert(
      'Remove Payment Method',
      'Are you sure you want to remove this payment method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const success = await paymentService.removePaymentMethod(methodId);
              if (success) {
                setPaymentMethods(paymentMethods.filter(m => m.id !== methodId));
                if (selectedMethod === methodId) {
                  setSelectedMethod('');
                }
                Alert.alert('Success', 'Payment method removed');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to remove payment method');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const validateCardInput = (): boolean => {
    if (!cardNumber || cardNumber.length < 13) {
      Alert.alert('Error', 'Please enter a valid card number');
      return false;
    }
    
    if (!expiryDate || !expiryDate.match(/^\d{2}\/\d{2}$/)) {
      Alert.alert('Error', 'Please enter expiry date as MM/YY');
      return false;
    }
    
    const [month, year] = expiryDate.split('/');
    const currentYear = new Date().getFullYear() % 100;
    const currentMonth = new Date().getMonth() + 1;
    
    if (parseInt(month) < 1 || parseInt(month) > 12) {
      Alert.alert('Error', 'Invalid expiry month');
      return false;
    }
    
    if (parseInt(year) < currentYear || 
        (parseInt(year) === currentYear && parseInt(month) < currentMonth)) {
      Alert.alert('Error', 'Card has expired');
      return false;
    }
    
    if (!cvv || cvv.length < 3) {
      Alert.alert('Error', 'Please enter a valid CVV');
      return false;
    }
    
    if (!cardholderName) {
      Alert.alert('Error', 'Please enter cardholder name');
      return false;
    }
    
    return true;
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(' ');
  };

  const formatExpiryDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  const detectCardBrand = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    
    if (cleaned.startsWith('4')) return 'visa';
    if (cleaned.startsWith('5')) return 'mastercard';
    if (cleaned.startsWith('3')) return 'amex';
    if (cleaned.startsWith('6')) return 'discover';
    
    return 'unknown';
  };

  const clearCardForm = () => {
    setCardNumber('');
    setExpiryDate('');
    setCvv('');
    setCardholderName('');
    setBillingZip('');
  };

  const PaymentMethodCard = ({ method }: { method: PaymentMethod }) => (
    <TouchableOpacity
      style={[
        styles.methodCard,
        selectedMethod === method.id && styles.selectedMethod
      ]}
      onPress={() => setSelectedMethod(method.id)}
    >
      <View style={styles.methodInfo}>
        <Ionicons 
          name={method.type === 'apple_pay' ? 'logo-apple' : 
                method.type === 'google_pay' ? 'logo-google' : 'card'}
          size={24}
          color="#333"
        />
        <View style={styles.methodDetails}>
          <Text style={styles.methodBrand}>
            {method.brand ? method.brand.toUpperCase() : method.type.replace('_', ' ').toUpperCase()}
          </Text>
          <Text style={styles.methodLast4}>
            {method.last4 ? `•••• ${method.last4}` : 'Digital Wallet'}
          </Text>
          {method.expiryMonth && method.expiryYear && (
            <Text style={styles.methodExpiry}>
              Expires {method.expiryMonth}/{method.expiryYear}
            </Text>
          )}
        </View>
      </View>
      
      <View style={styles.methodActions}>
        {method.isDefault && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultText}>DEFAULT</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => handleRemoveMethod(method.id)}
          style={styles.removeButton}
        >
          <Ionicons name="trash-outline" size={20} color="#F44336" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <LinearGradient
        colors={['#2196F3', '#21CBF3']}
        style={styles.header}
      >
        <Ionicons name="card" size={50} color="#FFF" />
        <Text style={styles.headerTitle}>Payment</Text>
        {amount && (
          <Text style={styles.headerAmount}>
            Total: ${amount.toFixed(2)}
          </Text>
        )}
      </LinearGradient>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Payment Methods</Text>
        
        {paymentMethods.length > 0 ? (
          paymentMethods.map(method => (
            <PaymentMethodCard key={method.id} method={method} />
          ))
        ) : (
          <Text style={styles.noMethods}>No payment methods added</Text>
        )}
        
        <TouchableOpacity
          style={styles.addMethodButton}
          onPress={() => setShowAddCard(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color="#2196F3" />
          <Text style={styles.addMethodText}>Add Payment Method</Text>
        </TouchableOpacity>

        {amount && (
          <TouchableOpacity
            style={[styles.payButton, !selectedMethod && styles.disabledButton]}
            onPress={handlePayment}
            disabled={!selectedMethod || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={20} color="#FFF" />
                <Text style={styles.payButtonText}>
                  Pay ${amount.toFixed(2)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.securityInfo}>
          <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
          <Text style={styles.securityText}>
            Your payment information is encrypted and secure
          </Text>
        </View>
      </View>

      {/* Add Card Modal */}
      <Modal
        visible={showAddCard}
        transparent
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Card</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddCard(false);
                  clearCardForm();
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.cardForm}>
              <Text style={styles.inputLabel}>Card Number</Text>
              <TextInput
                style={styles.input}
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                keyboardType="numeric"
                maxLength={19}
              />

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Expiry Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="MM/YY"
                    value={expiryDate}
                    onChangeText={(text) => setExpiryDate(formatExpiryDate(text))}
                    keyboardType="numeric"
                    maxLength={5}
                  />
                </View>

                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>CVV</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123"
                    value={cvv}
                    onChangeText={setCvv}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Cardholder Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                value={cardholderName}
                onChangeText={setCardholderName}
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Billing ZIP Code</Text>
              <TextInput
                style={styles.input}
                placeholder="12345"
                value={billingZip}
                onChangeText={setBillingZip}
                keyboardType="numeric"
                maxLength={10}
              />

              <TouchableOpacity
                style={styles.saveCardButton}
                onPress={handleAddCard}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveCardText}>Add Card</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.cardSecurityNote}>
                Your card details are encrypted and stored securely.
                We never store your CVV.
              </Text>
            </ScrollView>
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
  headerAmount: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 5,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  methodCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedMethod: {
    borderColor: '#2196F3',
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodDetails: {
    marginLeft: 15,
    flex: 1,
  },
  methodBrand: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  methodLast4: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  methodExpiry: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  methodActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  defaultBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 10,
  },
  defaultText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  removeButton: {
    padding: 5,
  },
  noMethods: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    paddingVertical: 20,
  },
  addMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
  },
  addMethodText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 10,
  },
  payButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },
  disabledButton: {
    opacity: 0.5,
  },
  payButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  securityText: {
    color: '#666',
    fontSize: 12,
    marginLeft: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
  cardForm: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 15,
  },
  halfInput: {
    flex: 1,
  },
  saveCardButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  saveCardText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cardSecurityNote: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginTop: 15,
  },
});