import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSpinAndWin } from '../hooks/useSpinAndWin';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

interface SpinWheelScreenProps {
  token: string | null;
  userId: string;
  onRewardEarned?: (reward: any) => void;
}

export const SpinWheelScreen: React.FC<SpinWheelScreenProps> = ({
  token,
  userId,
  onRewardEarned,
}) => {
  const {
    spinWheel,
    redeemReward,
    getAvailableSpins,
    getActiveRewards,
    getTotalCreditValue,
    dailyStatus,
    lastWonPrize,
    loading,
    error,
  } = useSpinAndWin(token, userId);

  const [isSpinning, setIsSpinning] = useState(false);
  const [rewards, setRewards] = useState([]);
  const [totalCredit, setTotalCredit] = useState(0);
  const [showRewardsModal, setShowRewardsModal] = useState(false);
  const [spinRotation, setSpinRotation] = useState(0);

  useEffect(() => {
    const activeRewards = getActiveRewards();
    const creditValue = getTotalCreditValue();
    setRewards(activeRewards);
    setTotalCredit(creditValue);
  }, [getActiveRewards, getTotalCreditValue]);

  const handleSpin = async () => {
    if (getAvailableSpins() === 0) {
      Alert.alert('No Spins Available', 'Come back tomorrow for more spins!');
      return;
    }

    try {
      setIsSpinning(true);
      // Animate spin
      const rotation = Math.random() * 360 + 1080;
      setSpinRotation(rotation);

      const reward = await spinWheel();
      setRewards(prev => [reward, ...prev]);
      setTotalCredit(prev => prev + (reward.prize.type === 'credit' ? reward.prize.value : 0));

      if (onRewardEarned) {
        onRewardEarned(reward);
      }

      Alert.alert(
        'Congratulations! 🎉',
        `You won: ${reward.prize.name}`,
        [{ text: 'Awesome!', onPress: () => {} }]
      );
    } catch (err) {
      Alert.alert('Error', `${err}`);
    } finally {
      setIsSpinning(false);
    }
  };

  const handleRedeem = async (rewardId: string) => {
    try {
      await redeemReward(rewardId);
      setRewards(prev => prev.filter(r => r.id !== rewardId));
      Alert.alert('Success', 'Reward redeemed!');
    } catch (err) {
      Alert.alert('Error', `${err}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <MaterialIcons name="local_activity" size={32} color="#2196F3" />
            <Text style={styles.statValue}>{getAvailableSpins()}</Text>
            <Text style={styles.statLabel}>Spins Left</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="account_balance_wallet" size={32} color="#4CAF50" />
            <Text style={styles.statValue}>₹{totalCredit}</Text>
            <Text style={styles.statLabel}>Credits</Text>
          </View>

          <View style={styles.statCard}>
            <MaterialIcons name="card_giftcard" size={32} color="#FF9800" />
            <Text style={styles.statValue}>{rewards.length}</Text>
            <Text style={styles.statLabel}>Rewards</Text>
          </View>
        </View>

        {/* Spin Wheel Section */}
        <View style={styles.wheelSection}>
          <Text style={styles.sectionTitle}>Spin & Win</Text>

          <View style={styles.wheelContainer}>
            <View
              style={[
                styles.wheel,
                { transform: [{ rotate: `${spinRotation}deg` }] },
              ]}
            >
              <View style={styles.wheelSegment}>
                <Text style={styles.segmentText}>₹50</Text>
              </View>
              <View style={[styles.wheelSegment, { backgroundColor: '#FF9800' }]}>
                <Text style={styles.segmentText}>20%</Text>
              </View>
              <View style={[styles.wheelSegment, { backgroundColor: '#4CAF50' }]}>
                <Text style={styles.segmentText}>₹100</Text>
              </View>
              <View style={[styles.wheelSegment, { backgroundColor: '#F44336' }]}>
                <Text style={styles.segmentText}>Free</Text>
              </View>
              <View style={[styles.wheelSegment, { backgroundColor: '#FF9800' }]}>
                <Text style={styles.segmentText}>10%</Text>
              </View>
              <View style={[styles.wheelSegment, { backgroundColor: '#2196F3' }]}>
                <Text style={styles.segmentText}>₹200</Text>
              </View>
              <View style={[styles.wheelSegment, { backgroundColor: '#9C27B0' }]}>
                <Text style={styles.segmentText}>Badge</Text>
              </View>
              <View style={[styles.wheelSegment, { backgroundColor: '#795548' }]}>
                <Text style={styles.segmentText}>Retry</Text>
              </View>
            </View>

            <View style={styles.wheelPointer}>
              <MaterialIcons name="arrow_drop_down" size={32} color="#2196F3" />
            </View>
          </View>

          <Pressable
            onPress={handleSpin}
            disabled={isSpinning || getAvailableSpins() === 0}
            style={({ pressed }) => [
              styles.spinButton,
              {
                opacity: pressed ? 0.7 : 1,
                backgroundColor: getAvailableSpins() === 0 ? '#CCC' : '#2196F3',
              },
            ]}
          >
            <MaterialIcons name="casino" size={24} color="white" />
            <Text style={styles.spinButtonText}>
              {isSpinning ? 'SPINNING...' : 'SPIN NOW'}
            </Text>
          </Pressable>

          {lastWonPrize && (
            <View style={styles.lastWinCard}>
              <MaterialIcons name="celebration" size={24} color="#FFD700" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.lastWinLabel}>Last Prize</Text>
                <Text style={styles.lastWinValue}>{lastWonPrize.name}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Active Rewards */}
        <View style={styles.rewardsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Rewards</Text>
            <Pressable onPress={() => setShowRewardsModal(true)}>
              <MaterialIcons name="visibility" size={20} color="#2196F3" />
            </Pressable>
          </View>

          {rewards.length > 0 ? (
            <FlatList
              data={rewards.slice(0, 3)}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.rewardCard}>
                  <View style={styles.rewardInfo}>
                    <MaterialIcons
                      name={item.prize.icon}
                      size={24}
                      color="#2196F3"
                    />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={styles.rewardName}>{item.prize.name}</Text>
                      <Text style={styles.rewardDate}>
                        Expires: {formatDateSafely(item.expiresAt)}
                      </Text>
                    </View>
                  </View>

                  {!item.redeemed && (
                    <Pressable
                      onPress={() => handleRedeem(item.id)}
                      style={styles.redeemButton}
                    >
                      <Text style={styles.redeemButtonText}>Redeem</Text>
                    </Pressable>
                  )}
                </View>
              )}
            />
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="card_giftcard" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No active rewards</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Rewards Modal */}
      <Modal visible={showRewardsModal} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowRewardsModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </Pressable>
            <Text style={styles.modalTitle}>All Rewards</Text>
            <View style={{ width: 24 }} />
          </View>

          <FlatList
            data={rewards}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.modalRewardCard}>
                <View style={styles.rewardInfo}>
                  <MaterialIcons
                    name={item.prize.icon}
                    size={28}
                    color={item.redeemed ? '#CCC' : '#2196F3'}
                  />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text
                      style={[
                        styles.rewardName,
                        item.redeemed && { color: '#CCC' },
                      ]}
                    >
                      {item.prize.name}
                    </Text>
                    <Text style={styles.rewardDate}>
                      {item.redeemed ? 'Redeemed' : 'Expires:'}{' '}
                      {formatDateSafely(item.expiresAt)}
                    </Text>
                  </View>
                </View>

                {!item.redeemed && (
                  <Pressable
                    onPress={() => {
                      handleRedeem(item.id);
                      setShowRewardsModal(false);
                    }}
                    style={styles.redeemButton}
                  >
                    <Text style={styles.redeemButtonText}>Redeem</Text>
                  </Pressable>
                )}
              </View>
            )}
            contentContainerStyle={styles.modalContent}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  wheelSection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  wheelContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  wheel: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 8,
    borderColor: '#2196F3',
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  wheelSegment: {
    flex: 1,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: 'white',
  },
  segmentText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
    transform: [{ rotate: '22.5deg' }],
  },
  wheelPointer: {
    position: 'absolute',
    top: -16,
    alignItems: 'center',
  },
  spinButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  spinButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  lastWinCard: {
    backgroundColor: '#FFF8DC',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  lastWinLabel: {
    fontSize: 12,
    color: '#999',
  },
  lastWinValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  rewardsSection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rewardCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  rewardInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rewardName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  rewardDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  redeemButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  redeemButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    padding: 12,
  },
  modalRewardCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
});
