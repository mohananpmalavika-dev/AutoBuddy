import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Text, TouchableOpacity, Modal, Alert, FlatList } from 'react-native';
import { useExpenseCategories, ExpenseCategory } from '../hooks/useExpenseCategories';
import { MaterialIcons } from '@expo/vector-icons';

interface Props {
  token: string | null;
  userId: string;
  userType: string;
}

export const ExpenseCategoryScreen: React.FC<Props> = ({ token, userId }) => {
  const { expenses, categories, loading, error, getExpensesByCategory, assignCategory, getTotalByPeriod, getExpenseStats } = useExpenseCategories(token, userId);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [assignModal, setAssignModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [newCategory, setNewCategory] = useState<ExpenseCategory | null>(null);

  const getCategoryColor = (category: ExpenseCategory): string => {
    const map: Record<ExpenseCategory, string> = {
      commute: '#2196F3',
      business: '#FF9800',
      social: '#4CAF50',
      personal: '#9C27B0',
      medical: '#F44336',
      shopping: '#E91E63',
      entertainment: '#00BCD4',
      food: '#FFC107',
      other: '#999',
    };
    return map[category];
  };

  const stats = getExpenseStats();
  const categoryExpenses = selectedCategory ? getExpensesByCategory(selectedCategory) : [];

  const handleAssign = async () => {
    if (!selectedExpense || !newCategory) {return;}
    const ok = await assignCategory(selectedExpense.id, newCategory);
    if (ok) {
      Alert.alert('Success', 'Category assigned');
      setAssignModal(false);
      setSelectedExpense(null);
      setNewCategory(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Expenses</Text>
      </View>

      {loading && !expenses.length ? (
        <View style={styles.center}>
          <Text>Loading...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>${stats.total.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>${getTotalByPeriod(period).toFixed(2)}</Text>
                <Text style={styles.statLabel}>{period}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>${stats.average.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Avg</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['week', 'month', 'year'] as const).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={period === p ? styles.periodBtnTxtActive : styles.periodBtnTxt}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>Categories</Text>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.category}
                style={styles.categoryItem}
                onPress={() => setSelectedCategory(cat.category)}
              >
                <View style={[styles.colorDot, { backgroundColor: getCategoryColor(cat.category) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryName}>{cat.category}</Text>
                  <Text style={styles.categoryDesc}>{cat.count} expenses</Text>
                </View>
                <Text style={styles.categoryAmount}>${cat.totalAmount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedCategory && (
            <View>
              <Text style={styles.sectionTitle}>{selectedCategory}</Text>
              <FlatList
                scrollEnabled={false}
                data={categoryExpenses}
                keyExtractor={e => e.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.expenseItem}
                    onPress={() => {
                      setSelectedExpense(item);
                      setAssignModal(true);
                    }}
                  >
                    <Text style={styles.expenseDesc}>{item.description}</Text>
                    <Text style={styles.expenseAmount}>${item.amount.toFixed(2)}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={assignModal} transparent onRequestClose={() => setAssignModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Change Category</Text>
            <View style={{ maxHeight: 200, marginBottom: 12 }}>
              {Object.values(ExpenseCategory).map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryOption, newCategory === cat && styles.categoryOptionSelected]}
                  onPress={() => setNewCategory(cat)}
                >
                  <View style={[styles.optionDot, { backgroundColor: getCategoryColor(cat) }]} />
                  <Text>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setAssignModal(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={newCategory ? styles.btnOk : styles.btnDisabled}
                onPress={handleAssign}
                disabled={!newCategory}
              >
                <Text style={styles.btnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#2196F3', paddingTop: 40, paddingBottom: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#f44336' },
  card: { backgroundColor: '#fff', padding: 12, marginBottom: 12, borderRadius: 8 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#2196F3' },
  statLabel: { fontSize: 11, color: '#999', marginTop: 4 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 4, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  periodBtnActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  periodBtnTxt: { fontSize: 12, color: '#666' },
  periodBtnTxtActive: { fontSize: 12, color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  categoryItem: { backgroundColor: '#fff', padding: 12, marginBottom: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  categoryName: { fontSize: 14, fontWeight: '600', color: '#333' },
  categoryDesc: { fontSize: 12, color: '#999', marginTop: 2 },
  categoryAmount: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  expenseItem: { backgroundColor: '#fff', padding: 12, marginBottom: 4, borderRadius: 4, flexDirection: 'row', justifyContent: 'space-between' },
  expenseDesc: { fontSize: 12, color: '#333' },
  expenseAmount: { fontSize: 13, fontWeight: 'bold', color: '#2196F3' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#fff', borderRadius: 8, padding: 16, width: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#333' },
  categoryOption: { padding: 8, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  categoryOptionSelected: { backgroundColor: '#f0f0f0', borderRadius: 4 },
  optionDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  btnCancel: { flex: 1, backgroundColor: '#999', paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
  btnOk: { flex: 1, backgroundColor: '#2196F3', paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
  btnDisabled: { flex: 1, backgroundColor: '#ccc', paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
});
