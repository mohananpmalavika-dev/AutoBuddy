import React from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { InsuranceClaim } from "../hooks/useInsuranceCoverage";

interface ClaimCardProps {
  claim: InsuranceClaim;
  onPress: (claim: InsuranceClaim) => void;
}

export const InsuranceClaimCard: React.FC<ClaimCardProps> = ({ claim, onPress }) => {
  const getColor = (status: string) => {
    const map: Record<string, string> = { "approved": "#4caf50", "rejected": "#f44336", "under_review": "#ff9800", "settled": "#2196f3", "filed": "#999" };
    return map[status] || "#999";
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(claim)}>
      <View style={styles.header}>
        <View>
          <Text style={styles.type}>{claim.claimType}</Text>
          <Text style={styles.date}>{claim.date}</Text>
        </View>
        <Text style={styles.amount}>${claim.amount}</Text>
      </View>
      <Text style={styles.desc} numberOfLines={2}>{claim.description}</Text>
      <View style={styles.footer}>
        <View style={[styles.dot, { backgroundColor: getColor(claim.status) }]} />
        <Text style={[styles.status, { color: getColor(claim.status) }]}>{claim.status}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", padding: 12, marginBottom: 8, borderRadius: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  type: { fontSize: 14, fontWeight: "600", color: "#333" },
  date: { fontSize: 12, color: "#999", marginTop: 2 },
  amount: { fontSize: 14, fontWeight: "bold", color: "#2196F3" },
  desc: { fontSize: 12, color: "#666", marginBottom: 8 },
  footer: { flexDirection: "row", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  status: { fontSize: 11, fontWeight: "600" },
});
