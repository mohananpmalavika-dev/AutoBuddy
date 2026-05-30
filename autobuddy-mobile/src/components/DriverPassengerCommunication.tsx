import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';

interface DriverPassengerCommunicationProps {
  passengerId: string;
  passengerPhone: string;
  rideId: string;
  disabled?: boolean;
}

/**
 * DriverPassengerCommunication - Voice/video call support with passengers
 * Enables real-time communication (voice, video, messaging) during rides
 * Integrates with Twilio or similar VoIP provider
 */

export default function DriverPassengerCommunication({
  passengerId,
  passengerPhone,
  rideId,
  disabled = false,
}: DriverPassengerCommunicationProps) {
  const [callActive, setCallActive] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video' | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (callActive) {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }

    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callActive]);

  const formatCallDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVoiceCall = async () => {
    setLoading(true);
    setError('');
    try {
      // TODO: Integrate with Twilio/Vonage for real VoIP
      // const response = await driverCommunicationAPI.initiateVoiceCall({
      //   passenger_id: passengerId,
      //   ride_id: rideId,
      // });

      setCallActive(true);
      setCallType('voice');

      // Mock call initiated
      Alert.alert('📞 Call Initiated', `Connecting to passenger...`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initiate call';
      setError(errorMessage);
      Alert.alert('Error', 'Failed to start voice call');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoCall = async () => {
    setLoading(true);
    setError('');
    try {
      // TODO: Integrate with Twilio/Vonage for real video
      // const response = await driverCommunicationAPI.initiateVideoCall({
      //   passenger_id: passengerId,
      //   ride_id: rideId,
      // });

      setCallActive(true);
      setCallType('video');

      Alert.alert('📹 Video Call Initiated', `Connecting to passenger...`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initiate call';
      setError(errorMessage);
      Alert.alert('Error', 'Failed to start video call');
    } finally {
      setLoading(false);
    }
  };

  const handleEndCall = async () => {
    setLoading(true);
    try {
      // TODO: Call API to end call
      // await driverCommunicationAPI.endCall(rideId);

      setCallActive(false);
      setCallType(null);

      Alert.alert(
        '📞 Call Ended',
        `Call duration: ${formatCallDuration(callDuration)}`
      );
    } catch (err) {
      setError(err?.message || 'Failed to end call');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectCall = () => {
    if (passengerPhone) {
      Linking.openURL(`tel:${passengerPhone}`);
    }
  };

  if (callActive) {
    return (
      <View style={[styles.container, styles.callActiveContainer, SHADOWS.card]}>
        <View style={styles.callHeader}>
          <Text style={styles.callTitle}>
            {callType === 'video' ? '📹 Video Call Active' : '📞 Voice Call Active'}
          </Text>
          <TouchableOpacity onPress={handleEndCall} disabled={loading}>
            <Text style={styles.endCallButton}>End Call</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.callDurationContainer}>
          <Text style={styles.callDuration}>{formatCallDuration(callDuration)}</Text>
        </View>

        {callType === 'video' && (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoPlaceholderEmoji}>📹</Text>
            <Text style={styles.videoPlaceholderText}>Passenger Video Stream</Text>
            <Text style={styles.videoPlaceholderSubtext}>
              (Integration with Twilio Video/Vonage)
            </Text>
          </View>
        )}

        {callType === 'voice' && (
          <View style={styles.voiceCallContainer}>
            <Text style={styles.voiceCallEmoji}>🎤</Text>
            <Text style={styles.voiceCallText}>Passenger listening...</Text>
          </View>
        )}

        <View style={styles.callControls}>
          <TouchableOpacity style={styles.muteButton} disabled={loading}>
            <Text style={styles.muteButtonEmoji}>🔇</Text>
            <Text style={styles.muteButtonText}>Mute</Text>
          </TouchableOpacity>

          {callType === 'voice' && (
            <TouchableOpacity style={styles.switchButton} onPress={handleVideoCall} disabled={loading}>
              <Text style={styles.switchButtonEmoji}>📹</Text>
              <Text style={styles.switchButtonText}>Video</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.speakerButton} disabled={loading}>
            <Text style={styles.speakerButtonEmoji}>📢</Text>
            <Text style={styles.speakerButtonText}>Speaker</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, SHADOWS.card]}>
      <Text style={styles.title}>🎤 Communication with Passenger</Text>

      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={[styles.option, styles.voiceOption]}
          onPress={handleVoiceCall}
          disabled={disabled || loading}
        >
          {loading && callType === 'voice' ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Text style={styles.optionEmoji}>📞</Text>
              <Text style={styles.optionTitle}>Voice Call</Text>
              <Text style={styles.optionDescription}>Direct voice communication</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, styles.videoOption]}
          onPress={handleVideoCall}
          disabled={disabled || loading}
        >
          {loading && callType === 'video' ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Text style={styles.optionEmoji}>📹</Text>
              <Text style={styles.optionTitle}>Video Call</Text>
              <Text style={styles.optionDescription}>Face-to-face connection</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, styles.directCallOption]}
          onPress={handleDirectCall}
          disabled={disabled || !passengerPhone}
        >
          <Text style={styles.optionEmoji}>☎️</Text>
          <Text style={styles.optionTitle}>Direct Call</Text>
          <Text style={styles.optionDescription}>Native phone call</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 Why Use In-App Calls?</Text>
        <Text style={styles.infoText}>• Keep phone numbers private</Text>
        <Text style={styles.infoText}>• Better call quality over data</Text>
        <Text style={styles.infoText}>• Recorded for safety & support</Text>
        <Text style={styles.infoText}>• Share location during call</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  callActiveContainer: {
    backgroundColor: '#1a1a1a',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  callTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  endCallButton: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  callDurationContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  callDuration: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFF',
    fontFamily: 'monospace',
  },
  videoPlaceholder: {
    backgroundColor: '#000',
    borderRadius: 8,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  videoPlaceholderEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  videoPlaceholderText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  videoPlaceholderSubtext: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 4,
  },
  voiceCallContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    marginBottom: 16,
  },
  voiceCallEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  voiceCallText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  callControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  muteButton: {
    backgroundColor: '#444',
    borderRadius: 50,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteButtonEmoji: {
    fontSize: 24,
  },
  muteButtonText: {
    fontSize: 10,
    color: '#FFF',
  },
  switchButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 50,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchButtonEmoji: {
    fontSize: 24,
  },
  switchButtonText: {
    fontSize: 10,
    color: '#FFF',
  },
  speakerButton: {
    backgroundColor: '#444',
    borderRadius: 50,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speakerButtonEmoji: {
    fontSize: 24,
  },
  speakerButtonText: {
    fontSize: 10,
    color: '#FFF',
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  option: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceOption: {
    backgroundColor: '#4CAF50',
  },
  videoOption: {
    backgroundColor: '#2196F3',
  },
  directCallOption: {
    backgroundColor: '#FF9800',
  },
  optionEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  infoBox: {
    backgroundColor: '#F0F7FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 11,
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 14,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#C41C00',
    fontSize: 12,
  },
});
