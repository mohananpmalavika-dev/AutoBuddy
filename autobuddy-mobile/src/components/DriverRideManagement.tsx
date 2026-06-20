import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useDriverDispatch, RideOffer } from '../hooks/useDriverDispatch';
import { useRideLifecycleManager } from '../hooks/useRideLifecycleManager';
import { useRidePaymentProcessing } from '../hooks/useRidePaymentProcessing';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { RideRequestCard } from '../components/DriverRideRequestCard';

interface DriverRideManagementProps {
  token: string | null;
  driverId: string;
  userId: string;
  onRideAccepted?: (rideId: string) => void;
  onRideCompleted?: (rideId: string) => void;
}

/**
 * Container component that wires together:
 * - useDriverDispatch: receive ride offers
 * - useRideLifecycleManager: state transitions
 * - useRidePaymentProcessing: fare & payment
 * - usePushNotifications: ride updates
 */
export function DriverRideManagement({
  token,
  driverId,
  userId,
  onRideAccepted,
  onRideCompleted,
}: DriverRideManagementProps) {
  const [isOnline, setIsOnline] = useState(false);
  const [currentOffer, setCurrentOffer] = useState<RideOffer | null>(null);
  const [offerQueue, setOfferQueue] = useState<RideOffer[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Hooks for business logic
  const dispatch = useDriverDispatch(token, driverId);
  const lifecycle = useRideLifecycleManager(token, userId);
  const payment = useRidePaymentProcessing(token, userId);
  const notifications = usePushNotifications(token, userId);

  const queueRef = useRef<RideOffer[]>([]);
  const expiredOffersRef = useRef<Set<string>>(new Set());

  // Initialize: fetch offers when driver goes online
  useEffect(() => {
    if (!isOnline || !token) return;

    const initializeOffers = async () => {
      await dispatch.fetchRideOffers();
      await notifications.registerDevice();
      await notifications.subscribeToChannel('ride_updates');
    };

    initializeOffers();
  }, [isOnline, token, dispatch, notifications]);

  // Listen for new ride offers from WebSocket
  useEffect(() => {
    if (!isOnline || !token) return;

    // Simulate WebSocket incoming ride offers
    // In production, this would be handled by useDriverDispatch's socket
    const handleNewOffer = (offer: RideOffer) => {
      if (expiredOffersRef.current.has(offer.offerId)) return;

      if (!currentOffer) {
        setCurrentOffer(offer);
      } else {
        queueRef.current.push(offer);
        setOfferQueue([...queueRef.current]);
      }

      // Send notification
      notifications.sendLocalNotification({
        title: 'New Ride Request',
        body: `${offer.passengerName} • ${offer.estimatedFare} • ${offer.estimatedDistance} km`,
        type: 'ride_update',
        data: { offerId: offer.offerId, rideId: offer.rideId },
      });
    };

    // Subscribe to ride offers from dispatch
    if (dispatch.rideOffers.length > 0) {
      dispatch.rideOffers.forEach((offer) => {
        if (!currentOffer && expiredOffersRef.current.has(offer.offerId)) return;
        if (!currentOffer) {
          setCurrentOffer(offer);
        } else {
          queueRef.current.push(offer);
        }
      });
    }
  }, [dispatch.rideOffers, isOnline, token, currentOffer, notifications]);

  /**
   * Accept current ride offer
   */
  const handleAcceptRide = useCallback(
    async (offerId: string) => {
      if (!currentOffer || !token) return;

      setIsProcessing(true);

      try {
        // Accept the offer through dispatch
        const accepted = await dispatch.acceptRideOffer(offerId);
        if (!accepted) {
          throw new Error('Failed to accept ride');
        }

        // Transition ride state: requested → confirmed → accepted
        const confirmed = await lifecycle.confirmRide(
          currentOffer.rideId,
          driverId
        );
        if (!confirmed) {
          throw new Error('Failed to confirm ride');
        }

        const rideAccepted = await lifecycle.acceptRide(currentOffer.rideId);
        if (!rideAccepted) {
          throw new Error('Failed to accept ride in system');
        }

        // Authorize payment (hold funds)
        const fare = await payment.calculateFare(
          currentOffer.estimatedDistance,
          currentOffer.estimatedDuration,
          currentOffer.surgeMultiplier
        );

        // Store fare for later capture
        const authId = await payment.authorizePayment(
          currentOffer.rideId,
          fare.totalFare,
          'default' // Use default payment method
        );

        // Notify passenger
        await notifications.sendLocalNotification({
          title: 'Driver Accepted',
          body: `${driverId} accepted your ride • ETA ${currentOffer.etaSeconds / 60} min`,
          type: 'ride_update',
          data: { rideId: currentOffer.rideId, status: 'accepted' },
        });

        // Move to next offer in queue
        setCurrentOffer(null);
        expiredOffersRef.current.add(offerId);

        if (queueRef.current.length > 0) {
          const nextOffer = queueRef.current.shift();
          queueRef.current = queueRef.current.filter(
            (o) => !expiredOffersRef.current.has(o.offerId)
          );
          setOfferQueue([...queueRef.current]);

          if (nextOffer) {
            setCurrentOffer(nextOffer);
          }
        }

        onRideAccepted?.(currentOffer.rideId);

        Alert.alert('Success', 'Ride accepted! Head to pickup location.');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to accept ride';
        Alert.alert('Error', message);
        console.error('[DriverRideManagement] Accept failed:', error);
      } finally {
        setIsProcessing(false);
      }
    },
    [
      currentOffer,
      token,
      dispatch,
      lifecycle,
      payment,
      driverId,
      notifications,
      onRideAccepted,
    ]
  );

  /**
   * Decline current ride offer
   */
  const handleDeclineRide = useCallback(
    async (offerId: string) => {
      if (!currentOffer || !token) return;

      setIsProcessing(true);

      try {
        // Decline the offer through dispatch
        const declined = await dispatch.declineRideOffer(
          offerId,
          'driver_declined'
        );

        if (!declined) {
          throw new Error('Failed to decline ride');
        }

        expiredOffersRef.current.add(offerId);

        // Show next offer in queue
        setCurrentOffer(null);

        if (queueRef.current.length > 0) {
          const nextOffer = queueRef.current.shift();
          queueRef.current = queueRef.current.filter(
            (o) => !expiredOffersRef.current.has(o.offerId)
          );
          setOfferQueue([...queueRef.current]);

          if (nextOffer) {
            setCurrentOffer(nextOffer);
          }
        } else {
          // Fetch new offers
          await dispatch.fetchRideOffers();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to decline ride';
        Alert.alert('Error', message);
        console.error('[DriverRideManagement] Decline failed:', error);
      } finally {
        setIsProcessing(false);
      }
    },
    [currentOffer, token, dispatch]
  );

  /**
   * Auto-decline when offer expires (12 seconds)
   */
  const handleOfferExpired = useCallback(
    async (offerId: string) => {
      if (!currentOffer || currentOffer.offerId !== offerId) return;

      await dispatch.declineRideOffer(offerId, 'auto_decline_timeout');

      expiredOffersRef.current.add(offerId);
      setCurrentOffer(null);

      // Show next offer in queue
      if (queueRef.current.length > 0) {
        const nextOffer = queueRef.current.shift();
        queueRef.current = queueRef.current.filter(
          (o) => !expiredOffersRef.current.has(o.offerId)
        );
        setOfferQueue([...queueRef.current]);

        if (nextOffer) {
          setCurrentOffer(nextOffer);
        }
      }
    },
    [currentOffer, dispatch]
  );

  if (!isOnline) {
    return (
      <View style={styles.offlineContainer}>
        <MaterialIcons name="location-off" size={48} color="#999" />
        <Text style={styles.offlineText}>You're offline</Text>
        <Text style={styles.offlineSubtext}>Go online to receive ride offers</Text>
      </View>
    );
  }

  if (dispatch.isLoadingOffers) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading ride offers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Current ride offer - full screen modal */}
      <Modal visible={!!currentOffer} transparent animationType="fade">
        {currentOffer && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <RideRequestCard
                ride={{
                  id: currentOffer.offerId,
                  passenger: {
                    id: currentOffer.passengerId,
                    name: currentOffer.passengerName,
                    rating: currentOffer.passengerRating,
                    rideCount: 0, // Would get from API
                  },
                  pickupLocation: currentOffer.pickupLocation,
                  destinationLocation: currentOffer.dropoffLocation,
                  estimatedFare: currentOffer.estimatedFare,
                  estimatedDistance: currentOffer.estimatedDistance,
                  estimatedDuration: currentOffer.estimatedDuration,
                }}
                onAccept={() => handleAcceptRide(currentOffer.offerId)}
                onDecline={() => handleDeclineRide(currentOffer.offerId)}
              />
            </View>
          </View>
        )}
      </Modal>

      {/* Queue indicator */}
      {offerQueue.length > 0 && (
        <View style={styles.queueIndicator}>
          <MaterialIcons name="queue" size={16} color="#2196F3" />
          <Text style={styles.queueText}>{offerQueue.length} more offers</Text>
        </View>
      )}

      {/* Error display */}
      {dispatch.error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error" size={20} color="#F44336" />
          <Text style={styles.errorText}>{dispatch.error.message}</Text>
        </View>
      )}

      {/* No offers state */}
      {!currentOffer && offerQueue.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialIcons name="event-busy" size={48} color="#ccc" />
          <Text style={styles.emptyStateTitle}>No ride offers right now</Text>
          <Text style={styles.emptyStateSubtext}>
            You'll get notified when a ride request matches your location
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  offlineText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 16,
  },
  offlineSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
  },
  queueIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    paddingVertical: 12,
    gap: 8,
  },
  queueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#C62828',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default DriverRideManagement;
