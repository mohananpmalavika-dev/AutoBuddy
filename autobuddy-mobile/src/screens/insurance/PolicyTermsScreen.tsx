import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useDriverInsurance } from '../../hooks/useDriverInsurance';

interface PolicyTermsScreenProps {
  userId: string;
  authToken: string;
  planType: string;
  onClose?: () => void;
}

export function PolicyTermsScreen({
  userId,
  authToken,
  planType,
  onClose,
}: PolicyTermsScreenProps) {
  const { policyTerms, isLoading, fetchPolicyTerms } = useDriverInsurance(userId, authToken);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));

  React.useEffect(() => {
    fetchPolicyTerms(planType);
  }, [planType]);

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  if (isLoading && !policyTerms) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading policy terms...</Text>
      </View>
    );
  }

  if (!policyTerms) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color="#F44336" />
        <Text style={styles.errorText}>Failed to load policy terms</Text>
      </View>
    );
  }

  const sections = [
    {
      title: 'Coverage Overview',
      icon: 'shield',
      content: `This ${policyTerms.plan_name} plan provides comprehensive coverage for your rides. Coverage includes protection against accidents, liability claims, personal injuries, and theft.`,
    },
    {
      title: 'What\'s Covered',
      icon: 'check-circle',
      items: policyTerms.what_covered,
    },
    {
      title: 'What\'s NOT Covered',
      icon: 'cancel',
      items: policyTerms.what_not_covered,
    },
    {
      title: 'Coverage Limits',
      icon: 'info',
      coverage: policyTerms.coverage_limits,
    },
    {
      title: 'Claim Process',
      icon: 'assignment',
      content: policyTerms.claim_process,
    },
    {
      title: 'Claim Details',
      icon: 'description',
      details: {
        'Deductible per Claim': `₹${policyTerms.deductible.toLocaleString('en-IN')}`,
        'Max Claims per Year': policyTerms.max_claims_per_year,
        'Document Upload Limit': `${policyTerms.document_upload_limit} files`,
        'Claim Processing Days': `${policyTerms.claim_processing_days} business days`,
      },
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.planNameHeader}>{policyTerms.plan_name} Plan</Text>
          <Text style={styles.headerSubtitle}>Policy Terms & Conditions</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Coverage Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Quick Summary</Text>
          <View style={styles.summaryGrid}>
            <SummaryItem
              label="Accident"
              value={`₹${(policyTerms.coverage_limits.accident || 0).toLocaleString('en-IN')}`}
            />
            <SummaryItem
              label="Liability"
              value={`₹${(policyTerms.coverage_limits.liability || 0).toLocaleString('en-IN')}`}
            />
            <SummaryItem
              label="Injury"
              value={`₹${(policyTerms.coverage_limits.injury || 0).toLocaleString('en-IN')}`}
            />
            <SummaryItem
              label="Theft"
              value={`₹${(policyTerms.coverage_limits.theft || 0).toLocaleString('en-IN')}`}
            />
          </View>
        </View>

        {/* Expandable Sections */}
        <View style={styles.sectionsContainer}>
          {sections.map((section, index) => (
            <ExpandableSection
              key={index}
              title={section.title}
              icon={section.icon as any}
              isExpanded={expandedSections.has(index)}
              onToggle={() => toggleSection(index)}
              content={section.content}
              items={section.items}
              coverage={section.coverage}
              details={section.details}
            />
          ))}
        </View>

        {/* Full Terms HTML */}
        {policyTerms.terms_html && (
          <View style={styles.fullTermsSection}>
            <Text style={styles.fullTermsTitle}>Full Terms & Conditions</Text>
            <View style={styles.termsBox}>
              <Text style={styles.termsText}>{policyTerms.terms_html}</Text>
            </View>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
}

interface ExpandableSectionProps {
  title: string;
  icon: string;
  isExpanded: boolean;
  onToggle: () => void;
  content?: string;
  items?: string[];
  coverage?: Record<string, number>;
  details?: Record<string, any>;
}

function ExpandableSection({
  title,
  icon,
  isExpanded,
  onToggle,
  content,
  items,
  coverage,
  details,
}: ExpandableSectionProps) {
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={onToggle}>
        <View style={styles.sectionTitleContainer}>
          <MaterialIcons name={icon} size={22} color="#2196F3" />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <MaterialIcons
          name={isExpanded ? 'expand-less' : 'expand-more'}
          size={24}
          color="#999"
        />
      </Pressable>

      {isExpanded && (
        <View style={styles.sectionContent}>
          {content && (
            <Text style={styles.contentText}>{content}</Text>
          )}

          {items && items.length > 0 && (
            <View>
              {items.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                  </View>
                  <Text style={styles.listItemText}>{item}</Text>
                </View>
              ))}
            </View>
          )}

          {coverage && (
            <View style={styles.coverageGrid}>
              {Object.entries(coverage).map(([key, value]) => (
                <View key={key} style={styles.coverageItem}>
                  <Text style={styles.coverageLabel}>{key}</Text>
                  <Text style={styles.coverageValue}>
                    ₹{(value as number).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {details && (
            <View style={styles.detailsGrid}>
              {Object.entries(details).map(([key, value]) => (
                <View key={key} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{key}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

interface SummaryItemProps {
  label: string;
  value: string;
}

function SummaryItem({ label, value }: SummaryItemProps) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryItemLabel}>{label}</Text>
      <Text style={styles.summaryItemValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  planNameHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#F44336',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginVertical: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  summaryItemLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 4,
  },
  summaryItemValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  sectionsContainer: {
    marginBottom: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  contentText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  bulletPoint: {
    width: 20,
    justifyContent: 'flex-start',
  },
  bullet: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: 'bold',
  },
  listItemText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  coverageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  coverageItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f0f7ff',
    borderRadius: 6,
    padding: 12,
  },
  coverageLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 4,
  },
  coverageValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  detailsGrid: {
    gap: 0,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  fullTermsSection: {
    marginVertical: 16,
  },
  fullTermsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  termsBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  termsText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  bottomSpacing: {
    height: 24,
  },
});
