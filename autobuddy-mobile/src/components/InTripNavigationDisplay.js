import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

/**
 * In-Trip Navigation Display Component
 * Shows turn-by-turn navigation info with ETA and distance
 * 
 * Props:
 *   - origin: { latitude, longitude, address }
 *   - destination: { latitude, longitude, address }
 *   - currentLocation: { latitude, longitude }
 *   - estimatedDistance: number - in km
 *   - estimatedTime: number - in minutes
 *   - nextInstruction: string - e.g., "Turn right on Main St"
 *   - distanceToNextTurn: number - in meters
 *   - rideStatus: string - 'accepted', 'driver_arrived', 'in_progress'
 *   - onOpenFullMap: () => void
 */
export default function InTripNavigationDisplay({
  origin = null,
  destination = null,
  currentLocation = null,
  estimatedDistance = 0,
  estimatedTime = 0,
  nextInstruction = 'Follow GPS directions',
  distanceToNextTurn = 0,
  rideStatus = 'in_progress',
  onOpenFullMap = () => null,
}) {
  const navigationData = useMemo(() => {
    if (!origin || !destination) return null;

    const oLat = origin.latitude;
    const oLng = origin.longitude;
    const dLat = destination.latitude;
    const dLng = destination.longitude;

    // Simple distance calculation
    const R = 6371;
    const dLat_rad = (dLat - oLat) * Math.PI / 180;
    const dLng_rad = (dLng - oLng) * Math.PI / 180;
    const a =
      Math.sin(dLat_rad / 2) * Math.sin(dLat_rad / 2) +
      Math.cos(oLat * Math.PI / 180) * Math.cos(dLat * Math.PI / 180) *
      Math.sin(dLng_rad / 2) * Math.sin(dLng_rad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return {
      distance: distance.toFixed(1),
      estimatedMinutes: Math.max(1, Math.round((distance / 40) * 60)), // Assume 40 km/h avg
    };
  }, [origin, destination]);

  const getProgressPercentage = () => {
    if (!navigationData || estimatedDistance === 0) return 0;
    return Math.min(100, ((estimatedDistance - navigationData.distance) / estimatedDistance) * 100);
  };

  const getStatusColor = (status) => {
    switch (status) {
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

  const getStatusMessage = (status) => {
    switch (status) {
      case 'accepted':
        return 'Heading to pickup';
      case 'driver_arrived':
        return 'Ready for pickup';
      case 'in_progress':
        return 'On trip to destination';
      default:
        return 'Route available';
    }
  };

  return (
    <View style={styles.container}>
      {/* Main Navigation Card */}
      <View style={styles.navCard}>
        {/* ETA Section */}
        <View style={styles.etaSection}>
          <View style={styles.etaContent}>
            <Text style={styles.etaLabel}>Estimated arrival</Text>
            <Text style={styles.etaTime}>
              {navigationData ? `${navigationData.estimatedMinutes}` : '--'} min
            </Text>
            <Text style={styles.etaDistance}>
              {navigationData ? `${navigationData.distance} km` : '--'}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(rideStatus) }]} />
        </View>

        {/* Next Turn Instruction */}
        <View style={[styles.instructionBanner, { borderLeftColor: getStatusColor(rideStatus) }]}>
          <Text style={styles.instructionLabel}>Next:</Text>
          <Text style={styles.instructionText} numberOfLines={2}>
            {nextInstruction || 'Follow GPS directions'}
          </Text>
          {distanceToNextTurn > 0 && (
            <Text style={styles.distanceToTurn}>
              in {distanceToNextTurn < 1000 ? `${distanceToNextTurn}m` : `${(distanceToNextTurn / 1000).toFixed(1)}km`}
            </Text>
          )}
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabel}>
            <Text style={styles.progressText}>{getStatusMessage(rideStatus)}</Text>
            <Text style={styles.progressPercent}>{Math.round(getProgressPercentage())}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${getProgressPercentage()}%`,
                  backgroundColor: getStatusColor(rideStatus),
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Location Details */}
      <View style={styles.locationsSection}>
        {rideStatus !== 'accepted' && origin && (
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>📍 From:</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {origin.address || 'Pickup location'}
            </Text>
          </View>
        )}

        {destination && (
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>📍 To:</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {destination.address || 'Destination'}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.openMapButton}
          onPress={onOpenFullMap}
        >
          <Text style={styles.openMapText}>🗺 Open Full Map</Text>
        </TouchableOpacity>

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsLabel}>Tips:</Text>
          <Text style={styles.tip}>• Keep your phone visible for directions</Text>
          <Text style={styles.tip}>• Use voice guidance if available</Text>
        </View>
      </View>

      {/* Speed Advisory */}
      {rideStatus === 'in_progress' && (
        <View style={styles.speedAdvisory}>
          <Text style={styles.speedLabel}>Follow speed limits and traffic rules</Text>
          <Text style={styles.speedHint}>Safe driving = Happy passengers = Better ratings</Text>
        </View>
      )}
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    paddingBottom: 16,
  },
  navCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  etaSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  etaContent: {
    flex: 1,
  },
  etaLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  etaTime: {
    fontSize: 32,
    fontWeight: '700',
    color: '#212121',
    lineHeight: 36,
  },
  etaDistance: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  instructionBanner: {
    borderLeftWidth: 4,
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
    padding: 12,
    marginBottom: 16,
  },
  instructionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  distanceToTurn: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  progressSection: {
    gap: 8,
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#212121',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  locationsSection: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    minWidth: 40,
  },
  locationText: {
    fontSize: 12,
    color: '#212121',
    fontWeight: '500',
    flex: 1,
  },
  actionsSection: {
    gap: 12,
    marginBottom: 16,
  },
  openMapButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openMapText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tipsContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FFA500',
  },
  tipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B26A00',
    marginBottom: 6,
  },
  tip: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  speedAdvisory: {
    backgroundColor: '#FCE4EC',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#E91E63',
  },
  speedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#880E4F',
    marginBottom: 4,
  },
  speedHint: {
    fontSize: 11,
    color: '#C2185B',
    fontWeight: '500',
  },
};
