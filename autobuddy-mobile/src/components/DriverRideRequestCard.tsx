import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface RideRequest {
  id: string;
  passenger: {
    id: string;
    name: string;
    photo?: string;
    rating: number;
    rideCount: number;
  };
  pickupLocation: string;
  destinationLocation: string;
  estimatedFare: number;
  estimatedDistance: number;
  estimatedDuration: number;
}

interface RideRequestCardProps {
  ride: RideRequest;
  onAccept: (rideId: string) => void;
  onDecline: (rideId: string) => void;
  decisionTimeLimit?: number;
}

const DEFAULT_TIME_LIMIT = 12; // seconds

export function RideRequestCard({
  ride,
  onAccept,
  onDecline,
  decisionTimeLimit = DEFAULT_TIME_LIMIT,
}: RideRequestCardProps) {
  const [timeRemaining, setTimeRemaining] = useState(decisionTimeLimit);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          onDecline(ride.id);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [ride.id, onDecline]);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      onAccept(ride.id);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    setIsDeclining(true);
    try {
      onDecline(ride.id);
    } finally {
      setIsDeclining(false);
    }
  };

  const progressPercent = (timeRemaining / decisionTimeLimit) * 100;
  const isLowTime = timeRemaining <= 3;

  return (
    <View style={styles.container}>
      {/* Timer bar at top */}
      <View style={styles.timerBarContainer}>
        <View
          style={[
            styles.timerBar,
            {
              width: `${progressPercent}%`,
              backgroundColor: isLowTime ? '#F44336' : '#2196F3',
            },
          ]}
        />
      </View>

      {/* Timer badge */}
      <View
        style={[
          styles.timerBadge,
          isLowTime && styles.timerBadgeLow,
        ]}
      >
        <MaterialIcons
          name="schedule"
          size={16}
          color={isLowTime ? '#fff' : '#2196F3'}
        />
        <Text style={[
          styles.timerText,
          isLowTime && styles.timerTextLow,
        ]}>
          {timeRemaining}s
        </Text>
      </View>

      <View style={styles.content}>
        {/* Passenger info */}
        <View style={styles.passengerSection}>
          <View style={styles.passengerInfo}>
            {ride.passenger.photo ? (
              <Image
                source={{ uri: ride.passenger.photo }}
                style={styles.passengerPhoto}
              />
            ) : (
              <View style={styles.passengerPhotoPlaceholder}>
                <MaterialIcons name="person" size={32} color="#999" />
              </View>
            )}

            <View style={styles.passengerDetails}>
              <Text style={styles.passengerName}>{ride.passenger.name}</Text>
              <View style={styles.ratingRow}>
                <MaterialIcons name="star" size={14} color="#FFC107" />
                <Text style={styles.rating}>
                  {ride.passenger.rating.toFixed(1)}
                </Text>
                <Text style={styles.rideCount}>
                  ({ride.passenger.rideCount} rides)
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Location details */}
        <View style={styles.locationsSection}>
          <LocationRow
            icon="location-on"
            label="Pickup"
            location={ride.pickupLocation}
            color="#4CAF50"
          />
          <View style={styles.locationConnector} />
          <LocationRow
            icon="location-on"
            label="Destination"
            location={ride.destinationLocation}
            color="#F44336"
          />
        </View>

        {/* Fare and distance info */}
        <View style={styles.fareSection}>
          <FareInfo
            icon="money"
            label="Estimated Fare"
            value={`₹ ${ride.estimatedFare}`}
            color="#4CAF50"
          />
          <FareInfo
            icon="directions-car"
            label="Distance"
            value={`${ride.estimatedDistance} km`}
            color="#2196F3"
          />
          <FareInfo
            icon="schedule"
            label="Duration"
            value={`~${ride.estimatedDuration} min`}
            color="#FF9800"
          />
        </View>
      </View>

      {/* Action buttons - LARGE for easy tapping */}
      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.declineButton,
            pressed && styles.buttonPressed,
            isDeclining && styles.buttonLoading,
          ]}
          onPress={handleDecline}
          disabled={isAccepting || isDeclining}
        >
          <MaterialIcons
            name="close"
            size={24}
            color="#F44336"
          />
          <Text style={styles.declineButtonText}>
            {isDeclining ? 'Declining...' : 'DECLINE'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.acceptButton,
            pressed && styles.buttonPressed,
            isAccepting && styles.buttonLoading,
          ]}
          onPress={handleAccept}
          disabled={isAccepting || isDeclining}
        >
          <MaterialIcons
            name="check"
            size={24}
            color="#fff"
          />
          <Text style={styles.acceptButtonText}>
            {isAccepting ? 'Accepting...' : 'ACCEPT'}
          </Text>
        </Pressable>
      </View>

      {/* Info text */}
      <Text style={styles.infoText}>
        You have {timeRemaining} seconds to respond
      </Text>
    </View>
  );
}

interface LocationRowProps {
  icon: string;
  label: string;
  location: string;
  color: string;
}

function LocationRow({ icon, label, location, color }: LocationRowProps) {
  return (
    <View style={styles.locationRow}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <View style={styles.locationDetails}>
        <Text style={styles.locationLabel}>{label}</Text>
        <Text style={styles.locationText}>{location}</Text>
      </View>
    </View>
  );
}

interface FareInfoProps {
  icon: string;
  label: string;
  value: string;
  color: string;
}

function FareInfo({ icon, label, value, color }: FareInfoProps) {
  return (
    <View style={styles.fareInfoBox}>
      <MaterialIcons name={icon as any} size={18} color={color} />
      <View style={styles.fareInfoContent}>
        <Text style={styles.fareInfoLabel}>{label}</Text>
        <Text style={styles.fareInfoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 0,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  timerBarContainer: {
    height: 4,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  timerBar: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  timerBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  timerBadgeLow: {
    backgroundColor: '#F44336',
  },
  timerText: {
    marginLeft: 4,
    fontWeight: '700',
    fontSize: 14,
    color: '#2196F3',
  },
  timerTextLow: {
    color: '#fff',
  },
  content: {
    padding: 16,
  },
  passengerSection: {
    marginBottom: 16,
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  passengerPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  passengerDetails: {
    flex: 1,
  },
  passengerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  rating: {
    marginLeft: 4,
    fontWeight: '600',
    fontSize: 12,
    color: '#333',
  },
  rideCount: {
    marginLeft: 4,
    fontSize: 12,
    color: '#999',
  },
  locationsSection: {
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 8,
  },
  locationDetails: {
    marginLeft: 12,
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
  locationConnector: {
    height: 12,
    width: 2,
    backgroundColor: '#e0e0e0',
    marginLeft: 8,
  },
  fareSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  fareInfoBox: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    alignItems: 'center',
  },
  fareInfoContent: {
    marginTop: 6,
    alignItems: 'center',
  },
  fareInfoLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  fareInfoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#fafafa',
  },
  declineButton: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F44336',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  acceptButton: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#4CAF50',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonLoading: {
    opacity: 0.6,
  },
  declineButtonText: {
    marginLeft: 8,
    fontWeight: '700',
    fontSize: 14,
    color: '#F44336',
  },
  acceptButtonText: {
    marginLeft: 8,
    fontWeight: '700',
    fontSize: 14,
    color: '#fff',
  },
  infoText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
});
