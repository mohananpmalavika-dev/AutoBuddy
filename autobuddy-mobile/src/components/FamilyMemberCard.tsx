import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FamilyMember } from '../hooks/useFamilyAccounts';

interface FamilyMemberCardProps {
  member: FamilyMember;
  onPress?: () => void;
  onRemove?: () => void;
  onToggleEmergency?: () => void;
}

const relationEmoji: Record<string, string> = {
  parent: '👨‍👩‍👧',
  child: '👶',
  spouse: '💑',
  sibling: '👬',
  friend: '👫',
};

const relationLabel: Record<string, string> = {
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse',
  sibling: 'Sibling',
  friend: 'Friend',
};

const statusColor: Record<string, string> = {
  pending: '#FF9800',
  active: '#4CAF50',
  inactive: '#999',
};

export const FamilyMemberCard: React.FC<FamilyMemberCardProps> = ({
  member,
  onPress,
  onRemove,
  onToggleEmergency,
}) => {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
    >
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.emoji}>{relationEmoji[member.relation] || '👤'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{member.name}</Text>
            <Text style={styles.relation}>
              {relationLabel[member.relation]}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColor[member.status] },
          ]}
        >
          <Text style={styles.statusText}>{member.status}</Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailItem}>
          <MaterialIcons name="email" size={14} color="#666" />
          <Text style={styles.detailText} numberOfLines={1}>
            {member.email}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <MaterialIcons name="phone" size={14} color="#666" />
          <Text style={styles.detailText}>{member.phone}</Text>
        </View>
      </View>

      {member.emergencyAccess && (
        <View style={styles.emergencyBadge}>
          <MaterialIcons name="emergency" size={14} color="#F44336" />
          <Text style={styles.emergencyText}>Emergency Access Enabled</Text>
        </View>
      )}

      {member.sharedPayment && (
        <View style={styles.paymentBadge}>
          <MaterialIcons name="payment" size={14} color="#2196F3" />
          <Text style={styles.paymentText}>Shared Payment</Text>
        </View>
      )}

      <View style={styles.actions}>
        {onToggleEmergency && (
          <Pressable
            style={styles.actionBtn}
            onPress={onToggleEmergency}
          >
            <MaterialIcons
              name={member.emergencyAccess ? 'emergency' : 'emergency_share'}
              size={16}
              color="#F44336"
            />
            <Text style={styles.actionText}>
              {member.emergencyAccess ? 'Disable' : 'Enable'} Emergency
            </Text>
          </Pressable>
        )}
        {onRemove && (
          <Pressable
            style={[styles.actionBtn, { borderColor: '#F44336' }]}
            onPress={onRemove}
          >
            <MaterialIcons name="delete" size={16} color="#F44336" />
            <Text style={[styles.actionText, { color: '#F44336' }]}>Remove</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emoji: {
    fontSize: 28,
  },
  name: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  relation: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
    textTransform: 'uppercase',
  },
  details: {
    gap: 4,
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 11,
    color: '#666',
    flex: 1,
  },
  emergencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFEBEE',
    borderRadius: 4,
    marginBottom: 6,
  },
  emergencyText: {
    fontSize: 10,
    color: '#F44336',
    fontWeight: '600',
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E3F2FD',
    borderRadius: 4,
  },
  paymentText: {
    fontSize: 10,
    color: '#2196F3',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  actionText: {
    fontSize: 10,
    color: '#2196F3',
    fontWeight: '600',
  },
});
