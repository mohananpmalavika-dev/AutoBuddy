import React, { useMemo } from 'react';
import { View, Text } from 'react-native';

/**
 * Passenger Tracking Map Component
 * Displays passenger location during pickup phase
 * 
 * Props:
 *   - passengerLocation: { latitude, longitude, address } or null
 *   - driverLocation: { latitude, longitude, address } or null
 *   - pickupLocation: { latitude, longitude, address } or null
 *   - status: string - Current ride status
 *   - estimatedPickupTime: number - ETA in seconds
 *   - onNavigateToPassenger: () => void
 */
export default function PassengerTrackingMap({
  passengerLocation = null,
  driverLocation = null,
  pickupLocation = null,
  status = 'searching',
  estimatedPickupTime = 300,
  onNavigateToPassenger = () => null,
}) {
  const trackingInfo = useMemo(() => {
    if (!driverLocation || !pickupLocation) {
      return null;
    }

    const dLat = driverLocation.latitude;
    const dLng = driverLocation.longitude;
    const pLat = pickupLocation.latitude;
    const pLng = pickupLocation.longitude;

    // Simple distance calculation (Haversine approximation)
    const R = 6371; // Earth's radius in km
    const dLat_rad = (pLat - dLat) * Math.PI / 180;
    const dLng_rad = (pLng - dLng) * Math.PI / 180;
    const a =
      Math.sin(dLat_rad / 2) * Math.sin(dLat_rad / 2) +
      Math.cos((dLat) * Math.PI / 180) * Math.cos((pLat) * Math.PI / 180) *
      Math.sin(dLng_rad / 2) * Math.sin(dLng_rad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    const timeInMinutes = Math.ceil(estimatedPickupTime / 60);

    return {
      distance: distance.toFixed(1),
      timeMinutes: timeInMinutes,
      direction: getDirection(dLat, dLng, pLat, pLng),
    };
  }, [driverLocation, pickupLocation, estimatedPickupTime]);

  const isApproaching = useMemo(() => {
    return trackingInfo && trackingInfo.distance < 0.5;
  }, [trackingInfo]);

  const getStatusColor = (stat) => {
    switch (stat) {
      case 'accepted':
        return '#2196F3';
      case 'driver_arrived':
        return '#FF9800';
      case 'in_progress':
        return '#4CAF50';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (stat) => {
    switch (stat) {
      case 'accepted':
        return 'Heading to pickup';
      case 'driver_arrived':
        return 'I\'ve arrived!';
      case 'in_progress':
        return 'On trip';
      default:
        return 'Searching...';
    }
  };

  return (
    <View style={styles.container}>
      {/* Status Banner */}
      <View
        style={[
          styles.statusBanner,
          { borderLeftColor: getStatusColor(status) },
          isApproaching && styles.statusBannerApproaching,
        ]}
      >
        <View style={styles.statusContent}>
          <Text style={styles.statusLabel}>{getStatusLabel(status)}</Text>
          {trackingInfo && (
            <Text style={styles.statusDetails}>
              📍 {trackingInfo.distance} km away • ⏱ {trackingInfo.timeMinutes} min
            </Text>
          )}
        </View>
        {isApproaching && (
          <View style={styles.approachingBadge}>
            <Text style={styles.approachingText}>Nearby!</Text>
          </View>
        )}
      </View>

      {/* Location Info Cards */}
      <View style={styles.locationsContainer}>
        {/* Driver Location */}
        {driverLocation && (
          <View style={[styles.locationCard, styles.driverCard]}>
            <Text style={styles.locationLabel}>Your Location</Text>
            <Text style={styles.locationAddress} numberOfLines={2}>
              🚗 {driverLocation.address || 'Current location'}
            </Text>
            <Text style={styles.coordinates}>
              {driverLocation.latitude.toFixed(4)}, {driverLocation.longitude.toFixed(4)}
            </Text>
          </View>
        )}

        {/* Pickup Location */}
        {pickupLocation && (
          <View style={[styles.locationCard, styles.pickupCard]}>
            <Text style={styles.locationLabel}>Pickup Point</Text>
            <Text style={styles.locationAddress} numberOfLines={2}>
              📍 {pickupLocation.address || 'Pickup location'}
            </Text>
            <Text style={styles.coordinates}>
              {pickupLocation.latitude.toFixed(4)}, {pickupLocation.longitude.toFixed(4)}
            </Text>
          </View>
        )}
      </View>

      {/* Navigation Helpers */}
      <View style={styles.helperSection}>
        <Text style={styles.helperTitle}>Navigation Tips:</Text>
        <Text style={styles.helperText}>
          • Open Google Maps for turn-by-turn directions
        </Text>
        <Text style={styles.helperText}>
          • Let passenger know your ETA
        </Text>
        <Text style={styles.helperText}>
          • Share vehicle details (color, plate)
        </Text>
      </View>

      {/* Tracking Timeline */}
      {trackingInfo && (
        <View style={styles.timeline}>
          <View style={[styles.timelineStep, styles.timelineStepActive]}>
            <View style={styles.timelineCircle} />
            <Text style={styles.timelineLabel}>Your Location</Text>
          </View>
          <View style={styles.timelineLine} />
          <View style={[styles.timelineStep, isApproaching && styles.timelineStepActive]}>
            <View style={[styles.timelineCircle, isApproaching && styles.timelineCircleApproaching]} />
            <Text style={styles.timelineLabel}>
              Pickup ({trackingInfo.distance} km)
            </Text>
          </View>
        </View>
      )}

      {/* Passenger Notification */}
      {status === 'driver_arrived' && (
        <View style={styles.notificationBanner}>
          <Text style={styles.notificationText}>
            ✓ Passenger has been notified that you have arrived
          </Text>
        </View>
      )}

      {isApproaching && (
        <View style={styles.approachingBannerLarge}>
          <Text style={styles.approachingBannerText}>
            📍 You are very close! Prepare for pickup
          </Text>
        </View>
      )}
    </View>
  );
}

function getDirection(lat1, lng1, lat2, lng2) {
  const dLng = lng2 - lng1;
  const angle = Math.atan2(dLng, lat2 - lat1) * 180 / Math.PI;

  if (angle >= -22.5 && angle < 22.5) return 'North';
  if (angle >= 22.5 && angle < 67.5) return 'NE';
  if (angle >= 67.5 && angle < 112.5) return 'East';
  if (angle >= 112.5 && angle < 157.5) return 'SE';
  if (angle >= 157.5 || angle < -157.5) return 'South';
  if (angle >= -157.5 && angle < -112.5) return 'SW';
  if (angle >= -112.5 && angle < -67.5) return 'West';
  return 'NW';
}

const styles = {
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statusBanner: {
    borderLeftWidth: 4,
    borderRadius: 8,
    backgroundColor: '#FFF',
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBannerApproaching: {
    backgroundColor: '#FEF3E2',
    borderLeftColor: '#FF9800',
  },
  statusContent: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  statusDetails: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  approachingBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  approachingText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  locationsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  locationCard: {
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
  },
  driverCard: {
    backgroundColor: '#E8F5E9',
    borderLeftColor: '#0B8F3A',
  },
  pickupCard: {
    backgroundColor: '#FFEBEE',
    borderLeftColor: '#E53935',
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  locationAddress: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
  },
  coordinates: {
    fontSize: 11,
    color: '#999',
    fontWeight: '400',
  },
  helperSection: {
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#FBC02D',
  },
  helperTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F57F17',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 11,
    color: '#F57F17',
    marginBottom: 4,
  },
  timeline: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  timelineStep: {
    alignItems: 'center',
    opacity: 0.5,
  },
  timelineStepActive: {
    opacity: 1,
  },
  timelineCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#BDBDBD',
    marginBottom: 8,
  },
  timelineCircleApproaching: {
    backgroundColor: '#FF9800',
  },
  timelineLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  timelineLine: {
    width: 2,
    height: 40,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 'auto',
  },
  notificationBanner: {
    backgroundColor: '#C8E6C9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  notificationText: {
    fontSize: 12,
    color: '#1B5E20',
    fontWeight: '600',
  },
  approachingBannerLarge: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 14,
  },
  approachingBannerText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '700',
    textAlign: 'center',
  },
};
