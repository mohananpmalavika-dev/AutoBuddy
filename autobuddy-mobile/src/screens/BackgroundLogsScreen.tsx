import React, {useCallback, useEffect, useState} from 'react';
import {View, Text, FlatList, StyleSheet, Button} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_KEY = 'autobuddy_bg_emit_logs_v1';

type BackgroundLogEntry = {
  ts?: string | number;
  type?: string;
  rideId?: string;
  [key: string]: unknown;
};

type BackgroundLogsScreenProps = {
  navigation?: {
    addListener?: (event: 'focus', callback: () => void) => () => void;
  };
};

export default function BackgroundLogsScreen({ navigation }: BackgroundLogsScreenProps) {
  const [logs, setLogs] = useState<BackgroundLogEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      // newest first
      setLogs(arr.slice().reverse());
    } catch {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', () => {
      void load();
    });
    void Promise.resolve().then(load);
    return unsub || undefined;
  }, [load, navigation]);

  const clear = async () => {
    await AsyncStorage.removeItem(LOG_KEY);
    setLogs([]);
  };

  const renderItem = ({item}: { item: BackgroundLogEntry }) => (
    <View style={styles.item}>
      <Text style={styles.ts}>{item.ts ? new Date(item.ts).toLocaleString() : ''}</Text>
      <Text style={styles.line}>{item.type} {item.rideId ? `ride:${item.rideId}` : ''}</Text>
      <Text style={styles.json}>{JSON.stringify(item)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Background Emit Logs</Text>
        <Button title="Refresh" onPress={load} />
        <Button title="Clear" onPress={clear} />
      </View>
      <FlatList data={logs} keyExtractor={(it, idx) => String(idx)} renderItem={renderItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 12},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8},
  title: {fontSize: 18, fontWeight: '600'},
  item: {padding: 8, borderBottomWidth: 1, borderColor: '#eee'},
  ts: {fontSize: 12, color: '#666'},
  line: {fontSize: 14, marginTop: 2},
  json: {fontSize: 11, color: '#333', marginTop: 6},
});
