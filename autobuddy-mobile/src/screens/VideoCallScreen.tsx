import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useVideoCall } from '../hooks/useVideoCall';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatDateTimeSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Unknown';
};

interface VideoCallScreenProps {
  token: string | null;
  userId: string;
  recipientId?: string;
  visible: boolean;
  onClose: () => void;
}

export const VideoCallScreen: React.FC<VideoCallScreenProps> = ({
  token,
  userId,
  recipientId,
  visible,
  onClose,
}) => {
  const {
    currentCall,
    callHistory,
    isConnected,
    isMuted,
    isVideoEnabled,
    loading,
    error,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    startRecording,
    stopRecording,
    getCallHistory,
    switchCamera,
    enableScreenShare,
    disableScreenShare,
  } = useVideoCall(token, userId);

  const [callDuration, setCallDuration] = useState(0);
  const [showRecordingIndicator, setShowRecordingIndicator] = useState(false);
  const [callHistoryModal, setCallHistoryModal] = useState(false);

  useEffect(() => {
    if (visible) {
      getCallHistory(userId, 10);
    }
  }, [visible]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected && currentCall) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected, currentCall]);

  useEffect(() => {
    if (currentCall?.isRecording) {
      setShowRecordingIndicator(true);
    } else {
      setShowRecordingIndicator(false);
    }
  }, [currentCall?.isRecording]);

  const handleInitiateCall = async () => {
    if (!recipientId) {
      Alert.alert('Error', 'No recipient specified');
      return;
    }
    const success = await initiateCall(recipientId, 'video');
    if (!success) {
      Alert.alert('Error', 'Failed to initiate call');
    }
  };

  const handleAnswerCall = async () => {
    if (!currentCall) {return;}
    const success = await answerCall(currentCall.id);
    if (!success) {
      Alert.alert('Error', 'Failed to answer call');
    }
  };

  const handleRejectCall = async () => {
    if (!currentCall) {return;}
    const success = await rejectCall(currentCall.id);
    if (success) {
      setCallDuration(0);
    }
  };

  const handleEndCall = async () => {
    if (!currentCall) {return;}
    const success = await endCall(currentCall.id);
    if (success) {
      setCallDuration(0);
    }
  };

  const handleStartRecording = async () => {
    const success = await startRecording();
    if (success) {
      Alert.alert('Success', 'Recording started');
    }
  };

  const handleStopRecording = async () => {
    const success = await stopRecording();
    if (success) {
      Alert.alert('Success', 'Recording saved');
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const isIncomingCall = currentCall && currentCall.status === 'ringing' && currentCall.recipientId === userId;
  const isOutgoingCall = currentCall && currentCall.status === 'ringing' && currentCall.initiatorId === userId;

  if (loading && !currentCall) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>Initializing call...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Background */}
        <View style={styles.background} />

        {/* Active Call View */}
        {isConnected && currentCall && (
          <View style={styles.callContainer}>
            {/* Call Duration */}
            <View style={styles.durationBar}>
              {showRecordingIndicator && (
                <View style={styles.recordingIndicator}>
                  <MaterialIcons name="fiber-manual-record" size={12} color="#F44336" />
                  <Text style={styles.recordingText}>Recording</Text>
                </View>
              )}
              <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
            </View>

            {/* Video View Placeholder */}
            <View style={styles.videoContainer}>
              <MaterialIcons name="videocam" size={64} color="rgba(255, 255, 255, 0.5)" />
              <Text style={styles.videoPlaceholder}>Video Stream</Text>
            </View>

            {/* Controls */}
            <View style={styles.controlsContainer}>
              <ControlButton
                icon={isMuted ? 'mic-off' : 'mic'}
                label="Mute"
                color={isMuted ? '#F44336' : '#4CAF50'}
                onPress={toggleMute}
              />
              <ControlButton
                icon={isVideoEnabled ? 'videocam' : 'videocam-off'}
                label="Video"
                color={isVideoEnabled ? '#4CAF50' : '#F44336'}
                onPress={toggleVideo}
              />
              <ControlButton
                icon="switch-camera"
                label="Camera"
                color="#2196F3"
                onPress={switchCamera}
              />
              <ControlButton
                icon={currentCall.isRecording ? 'stop' : 'fiber-manual-record'}
                label={currentCall.isRecording ? 'Stop' : 'Record'}
                color={currentCall.isRecording ? '#F44336' : '#FF9800'}
                onPress={
                  currentCall.isRecording ? handleStopRecording : handleStartRecording
                }
              />
            </View>

            {/* End Call Button */}
            <Pressable style={styles.endCallButton} onPress={handleEndCall}>
              <MaterialIcons name="call-end" size={28} color="#fff" />
              <Text style={styles.endCallText}>End Call</Text>
            </Pressable>
          </View>
        )}

        {/* Incoming Call View */}
        {isIncomingCall && (
          <View style={styles.callContainer}>
            <View style={styles.incomingCallContainer}>
              <View style={styles.callerInfo}>
                <View style={styles.callerAvatar}>
                  <MaterialIcons name="person" size={40} color="#fff" />
                </View>
                <Text style={styles.callerName}>Incoming Call</Text>
                <Text style={styles.callerStatus}>from {currentCall.initiatorId}</Text>
              </View>

              <View style={styles.incomingActions}>
                <Pressable style={styles.rejectButton} onPress={handleRejectCall}>
                  <MaterialIcons name="call-end" size={28} color="#fff" />
                </Pressable>
                <Pressable style={styles.acceptButton} onPress={handleAnswerCall}>
                  <MaterialIcons name="call" size={28} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Outgoing Call View */}
        {isOutgoingCall && (
          <View style={styles.callContainer}>
            <View style={styles.outgoingCallContainer}>
              <View style={styles.callerInfo}>
                <View style={styles.callerAvatar}>
                  <MaterialIcons name="person" size={40} color="#fff" />
                </View>
                <Text style={styles.callerName}>Calling...</Text>
                <Text style={styles.callerStatus}>{currentCall.recipientId}</Text>
              </View>

              <View style={styles.outgoingActions}>
                <Pressable style={styles.cancelButton} onPress={handleRejectCall}>
                  <MaterialIcons name="call-end" size={28} color="#fff" />
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* No Active Call View */}
        {!currentCall && (
          <View style={styles.callContainer}>
            <View style={styles.noCallContainer}>
              <MaterialIcons name="phone-disabled" size={64} color="rgba(255, 255, 255, 0.5)" />
              <Text style={styles.noCallText}>No Active Call</Text>

              {recipientId && (
                <Pressable style={styles.startCallButton} onPress={handleInitiateCall}>
                  <MaterialIcons name="call" size={28} color="#fff" />
                  <Text style={styles.startCallText}>Start Call</Text>
                </Pressable>
              )}

              <Pressable
                style={styles.historyButton}
                onPress={() => setCallHistoryModal(true)}
              >
                <MaterialIcons name="history" size={20} color="#fff" />
                <Text style={styles.historyButtonText}>Call History</Text>
              </Pressable>

              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Call History Modal */}
        <Modal
          visible={callHistoryModal}
          animationType="slide"
          transparent
          onRequestClose={() => setCallHistoryModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Call History</Text>
                <Pressable onPress={() => setCallHistoryModal(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
              </View>

              {callHistory.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="phone" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>No call history</Text>
                </View>
              ) : (
                callHistory.map((call) => (
                  <View key={call.id} style={styles.callHistoryItem}>
                    <View style={styles.callHistoryLeft}>
                      <MaterialIcons
                        name={call.callType === 'video' ? 'videocam' : 'call'}
                        size={20}
                        color={call.status === 'active' ? '#4CAF50' : '#999'}
                      />
                      <View style={styles.callHistoryInfo}>
                        <Text style={styles.callHistoryName}>
                          {call.initiatorId === userId ? 'Outgoing' : 'Incoming'} (
                          {call.callType})
                        </Text>
                        <Text style={styles.callHistoryTime}>
                          {call.startTime && formatDateTimeSafely(call.startTime)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.callHistoryDuration}>
                      {call.duration ? `${call.duration}s` : 'Missed'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const ControlButton: React.FC<{
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}> = ({ icon, label, color, onPress }) => {
  return (
    <Pressable style={[styles.controlButton, { backgroundColor: color }]} onPress={onPress}>
      <MaterialIcons name={icon as any} size={24} color="#fff" />
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 16,
  },
  callContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
  },
  durationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    marginBottom: 16,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244, 67, 54, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  recordingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F44336',
  },
  durationText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  videoPlaceholder: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 12,
  },
  controlsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  controlButton: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  controlLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    marginTop: 4,
  },
  endCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F44336',
    paddingVertical: 12,
    borderRadius: 8,
  },
  endCallText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  incomingCallContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callerInfo: {
    alignItems: 'center',
  },
  callerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  callerName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  callerStatus: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 32,
  },
  rejectButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outgoingCallContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  outgoingActions: {
    width: '100%',
    alignItems: 'center',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: 120,
    height: 50,
    backgroundColor: '#F44336',
    borderRadius: 25,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  noCallContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCallText: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 16,
    marginBottom: 32,
  },
  startCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 16,
  },
  startCallText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    marginBottom: 16,
  },
  historyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
  },
  closeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
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
  callHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  callHistoryLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callHistoryInfo: {
    flex: 1,
  },
  callHistoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  callHistoryTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  callHistoryDuration: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
});

export default VideoCallScreen;
