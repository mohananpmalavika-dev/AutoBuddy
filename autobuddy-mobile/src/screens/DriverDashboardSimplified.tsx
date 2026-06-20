import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { DriverDocumentStatus, DocumentStatus } from '../components/DriverDocumentStatus';
import { DriverEarningsWidget, EarningsData } from '../components/DriverEarningsWidget';
import { RideRequestCard, RideRequest } from '../components/DriverRideRequestCard';
import DriverRideManagement from '../components/DriverRideManagement';
import { DocumentExpiryAlertBanner, DocumentExpiryListScreen } from '../screens/document-expiry/DocumentExpiryScreens';
import { useDocumentExpiry } from '../hooks/useDocumentExpiry';

interface DriverDashboardSimplifiedProps {
  token: string;
  user: any;
  onLogout: () => void;
}

type TabType = 'map' | 'rides' | 'earnings' | 'profile' | 'documents-expiry';

export function DriverDashboardSimplified({
  token,
  user,
  onLogout,
}: DriverDashboardSimplifiedProps) {
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [rideRequest, setRideRequest] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<number>(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const { criticalAlertCount } = useDocumentExpiry(user?.id, token);

  useEffect(() => {
    loadDashboardData();
  }, [token]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // In a real app, these would be API calls
      await Promise.all([
        loadEarnings(),
        loadDocuments(),
        loadAlerts(),
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEarnings = async () => {
    // Mock data - replace with actual API call
    setEarnings({
      today: 2450,
      week: 15230,
      month: 45200,
      statistics: {
        ridesCount: 12,
        distance: 45,
        avgRating: 4.8,
        completionRate: 98,
      },
      nextPayoutDate: '2026-06-21',
      payoutAmount: 15000,
      comparison: {
        percentChange: 15,
        previousAmount: 2130,
      },
    });
    setTodayEarnings(2450);
  };

  const loadDocuments = async () => {
    // Mock data - replace with actual API call
    setDocuments([
      {
        name: 'driver_license',
        label: 'Driver License',
        status: 'verified',
        uploadedAt: new Date('2026-06-10'),
        expiresAt: new Date('2027-06-10'),
      },
      {
        name: 'insurance',
        label: 'Insurance Certificate',
        status: 'pending',
        uploadedAt: new Date('2026-06-18'),
      },
      {
        name: 'pollution_cert',
        label: 'Pollution Certificate',
        status: 'verified',
        uploadedAt: new Date('2026-06-15'),
        expiresAt: new Date('2027-06-15'),
      },
      {
        name: 'police_clearance',
        label: 'Police Clearance',
        status: 'pending',
      },
    ]);
  };

  const loadAlerts = async () => {
    // Mock data
    setAlerts(2);
  };

  const handleRideAccept = (rideId: string) => {
    Alert.alert('Ride Accepted', 'You have accepted the ride. Head to pickup location.');
    setRideRequest(null);
  };

  const handleRideDecline = (rideId: string) => {
    setRideRequest(null);
  };

  const toggleOnlineStatus = () => {
    setIsOnline(!isOnline);
    if (!isOnline) {
      Alert.alert('You are now online', 'You will start receiving ride requests.');
    } else {
      Alert.alert('You are now offline', 'You will no longer receive ride requests.');
    }
  };

  const handleUploadDocument = (docName: string) => {
    Alert.alert('Upload Document', `Upload ${docName} to continue`);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar with online status and quick info */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable
            style={[
              styles.onlineToggle,
              isOnline && styles.onlineToggleActive,
            ]}
            onPress={toggleOnlineStatus}
          >
            <MaterialIcons
              name={isOnline ? 'radio-button-on' : 'radio-button-off'}
              size={24}
              color={isOnline ? '#4CAF50' : '#999'}
            />
            <Text style={[
              styles.onlineToggleText,
              isOnline && styles.onlineToggleTextActive,
            ]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>Today</Text>
          <Text style={styles.todayEarnings}>₹{todayEarnings.toLocaleString('en-IN')}</Text>
        </View>

        <Pressable style={styles.alertButton}>
          <MaterialIcons name="notifications" size={24} color="#2196F3" />
          {alerts > 0 && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{alerts}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Main content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Document Expiry Alert Banner */}
        <DocumentExpiryAlertBanner
          driverId={user?.id}
          authToken={token}
          onViewAll={() => setActiveTab('documents-expiry')}
          onRenewNow={(docId) => setActiveTab('documents-expiry')}
        />

        {/* Show ride management when online */}
        {isOnline && (
          <DriverRideManagement
            token={token}
            driverId={user?.id}
            userId={user?.id}
            onRideAccepted={() => setActiveTab('map')}
            onRideCompleted={() => setActiveTab('rides')}
          />
        )}

        {/* Tab content */}
        {activeTab === 'map' && (
          <View style={styles.tabContent}>
            <View style={styles.mapPlaceholder}>
              <MaterialIcons name="map" size={64} color="#ccc" />
              <Text style={styles.placeholderText}>Live Map Coming Soon</Text>
              <Text style={styles.placeholderSubtext}>
                Your location and available rides will appear here
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'rides' && (
          <View style={styles.tabContent}>
            <RidesHistoryTab />
          </View>
        )}

        {activeTab === 'earnings' && (
          <View style={styles.tabContent}>
            {earnings && (
              <DriverEarningsWidget
                earnings={earnings}
                onViewDetails={() => setActiveTab('earnings')}
              />
            )}
            <DocumentsSection
              documents={documents}
              onUploadDocument={handleUploadDocument}
            />
          </View>
        )}

        {activeTab === 'documents-expiry' && (
          <View style={styles.tabContent}>
            <DocumentExpiryListScreen driverId={user?.id} authToken={token} />
          </View>
        )}

        {activeTab === 'profile' && (
          <View style={styles.tabContent}>
            <ProfileTab user={user} onLogout={onLogout} />
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <NavTab
          icon="map"
          label="Map"
          active={activeTab === 'map'}
          onPress={() => setActiveTab('map')}
        />
        <NavTab
          icon="history"
          label="Rides"
          active={activeTab === 'rides'}
          onPress={() => setActiveTab('rides')}
          badge={0}
        />
        <NavTab
          icon="money"
          label="Earnings"
          active={activeTab === 'earnings'}
          onPress={() => setActiveTab('earnings')}
        />
        <NavTab
          icon="person"
          label="Profile"
          active={activeTab === 'profile'}
          onPress={() => setActiveTab('profile')}
        />
      </View>
    </View>
  );
}

interface DocumentsSectionProps {
  documents: DocumentStatus[];
  onUploadDocument: (docName: string) => void;
}

function DocumentsSection({ documents, onUploadDocument }: DocumentsSectionProps) {
  const verified = documents.filter(d => d.status === 'verified').length;
  const total = documents.length;

  if (verified === total) {
    return null;
  }

  return (
    <View style={styles.documentsSection}>
      <DriverDocumentStatus
        documents={documents}
        onUploadDocument={onUploadDocument}
      />
    </View>
  );
}

function RidesHistoryTab() {
  return (
    <View style={styles.ridesHistoryContainer}>
      <View style={styles.emptyState}>
        <MaterialIcons name="history" size={48} color="#ccc" />
        <Text style={styles.emptyStateText}>No rides yet today</Text>
        <Text style={styles.emptyStateSubtext}>
          Go online to start accepting rides
        </Text>
      </View>
    </View>
  );
}

interface ProfileTabProps {
  user: any;
  onLogout: () => void;
}

function ProfileTab({ user, onLogout }: ProfileTabProps) {
  return (
    <View style={styles.profileContainer}>
      <View style={styles.profileHeader}>
        <View style={styles.profileAvatar}>
          <MaterialIcons name="person" size={48} color="#fff" />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name || 'Driver'}</Text>
          <Text style={styles.profileId}>ID: {user?.id}</Text>
        </View>
      </View>

      <View style={styles.profileSections}>
        <ProfileOption icon="phone" label="Phone" value={user?.phone} />
        <ProfileOption icon="email" label="Email" value={user?.email} />
        <ProfileOption icon="directions-car" label="Vehicle" value="Honda City" />
      </View>

      <Pressable
        style={styles.logoutButton}
        onPress={onLogout}
      >
        <MaterialIcons name="logout" size={20} color="#F44336" />
        <Text style={styles.logoutButtonText}>Logout</Text>
      </Pressable>
    </View>
  );
}

interface ProfileOptionProps {
  icon: string;
  label: string;
  value?: string;
}

function ProfileOption({ icon, label, value }: ProfileOptionProps) {
  return (
    <View style={styles.profileOption}>
      <MaterialIcons name={icon as any} size={20} color="#2196F3" />
      <View style={styles.profileOptionContent}>
        <Text style={styles.profileOptionLabel}>{label}</Text>
        <Text style={styles.profileOptionValue}>{value || 'Not set'}</Text>
      </View>
    </View>
  );
}

interface NavTabProps {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
}

function NavTab({ icon, label, active, onPress, badge }: NavTabProps) {
  return (
    <Pressable
      style={[styles.navTab, active && styles.navTabActive]}
      onPress={onPress}
    >
      <View style={styles.navTabIcon}>
        <MaterialIcons
          name={icon as any}
          size={24}
          color={active ? '#2196F3' : '#999'}
        />
        {badge !== undefined && badge > 0 && (
          <View style={styles.navBadge}>
            <Text style={styles.navBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.navTabLabel, active && styles.navTabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  topBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingTop: 16,
  },
  topBarLeft: {
    flex: 1,
  },
  topBarCenter: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  todayEarnings: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
    marginTop: 2,
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
  },
  onlineToggleActive: {
    backgroundColor: '#E8F5E9',
  },
  onlineToggleText: {
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 12,
    color: '#999',
  },
  onlineToggleTextActive: {
    color: '#4CAF50',
  },
  alertButton: {
    flex: 1,
    alignItems: 'flex-end',
  },
  alertBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rideRequestContainer: {
    marginBottom: 16,
  },
  tabContent: {
    marginBottom: 80,
  },
  mapPlaceholder: {
    height: 300,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  placeholderSubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  documentsSection: {
    marginVertical: 12,
  },
  ridesHistoryContainer: {
    marginVertical: 12,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
  profileContainer: {
    marginVertical: 12,
  },
  profileHeader: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  profileId: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  profileSections: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  profileOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  profileOptionContent: {
    marginLeft: 16,
    flex: 1,
  },
  profileOptionLabel: {
    fontSize: 12,
    color: '#999',
  },
  profileOptionValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#F44336',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  navTabActive: {
    borderTopWidth: 3,
    borderTopColor: '#2196F3',
  },
  navTabIcon: {
    position: 'relative',
  },
  navBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#F44336',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  navTabLabel: {
    fontSize: 10,
    marginTop: 4,
    color: '#999',
  },
  navTabLabelActive: {
    color: '#2196F3',
    fontWeight: '600',
  },
});

export default DriverDashboardSimplified;
