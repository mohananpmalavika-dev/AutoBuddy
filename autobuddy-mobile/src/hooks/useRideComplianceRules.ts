import { useState, useCallback, useEffect } from 'react';

export interface ComplianceRule {
  id: string;
  title: string;
  description: string;
  category: 'passenger' | 'driver' | 'general';
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  details?: string[];
}

export interface SafetyGuideline {
  id: string;
  title: string;
  content: string;
  tips: string[];
  icon: string;
  priority: number;
}

export interface ComplianceAlert {
  id: string;
  type: 'rule_violation' | 'guideline_reminder' | 'policy_update';
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  acknowledged: boolean;
  actionRequired: boolean;
}

const PASSENGER_RULES: ComplianceRule[] = [
  {
    id: 'p1',
    title: 'Seat Belt Requirement',
    description: 'All passengers must wear seat belts at all times during the ride',
    category: 'passenger',
    severity: 'critical',
    icon: 'security',
    details: [
      'Fasten seat belt before vehicle moves',
      'Keep seat belt fastened throughout journey',
      'Children must use appropriate child seats',
      'Report if seat belt is malfunctioning',
    ],
  },
  {
    id: 'p2',
    title: 'Behavior & Conduct',
    description: 'Maintain respectful and appropriate behavior during rides',
    category: 'passenger',
    severity: 'warning',
    icon: 'how_to_reg',
    details: [
      'Be respectful to driver and other passengers',
      'No smoking, vaping, or drinking alcohol',
      'Keep noise levels reasonable',
      'No eating or drinking (except water)',
      'Do not engage in disruptive behavior',
    ],
  },
  {
    id: 'p3',
    title: 'Door Safety',
    description: 'Use doors safely and only when vehicle is stopped',
    category: 'passenger',
    severity: 'critical',
    icon: 'door_front',
    details: [
      'Wait for driver to unlock doors',
      'Exit only when vehicle is fully stopped',
      'Close doors gently and completely',
      'Do not lean out of windows',
      'Keep hands and head inside vehicle',
    ],
  },
  {
    id: 'p4',
    title: 'Item Security',
    description: 'Keep personal items secure and do not leave belongings in vehicle',
    category: 'passenger',
    severity: 'info',
    icon: 'security_check',
    details: [
      'Keep valuables with you at all times',
      'Do not leave items in the vehicle',
      'Check all pockets before exiting',
      'Report lost items immediately',
      'Take photos of valuable items',
    ],
  },
  {
    id: 'p5',
    title: 'Emergency Procedures',
    description: 'Know and follow emergency procedures in case of accidents',
    category: 'passenger',
    severity: 'critical',
    icon: 'emergency',
    details: [
      'Follow driver instructions in emergencies',
      'Exit vehicle only when safe',
      'Call emergency services if needed',
      'Exchange information after accidents',
      'Use SOS button in app if needed',
    ],
  },
];

const DRIVER_RULES: ComplianceRule[] = [
  {
    id: 'd1',
    title: 'Vehicle Maintenance',
    description: 'Maintain vehicle in safe operating condition',
    category: 'driver',
    severity: 'critical',
    icon: 'build',
    details: [
      'Regular maintenance checks',
      'Tire pressure and tread inspection',
      'Brake and light functionality',
      'Windshield and wipers in good condition',
      'Submit vehicle inspection reports',
    ],
  },
  {
    id: 'd2',
    title: 'Driving Standards',
    description: 'Follow all traffic laws and safe driving practices',
    category: 'driver',
    severity: 'critical',
    icon: 'directions_car',
    details: [
      'Follow speed limits',
      'Obey all traffic signals',
      'Maintain safe following distance',
      'Use turn signals',
      'Never use phone while driving',
      'Avoid aggressive driving',
    ],
  },
  {
    id: 'd3',
    title: 'Professional Conduct',
    description: 'Maintain professional and respectful behavior',
    category: 'driver',
    severity: 'warning',
    icon: 'person_outline',
    details: [
      'Be courteous to all passengers',
      'Maintain clean vehicle interior',
      'Dress appropriately and professionally',
      'No smoking while passengers present',
      'Respect passenger privacy',
    ],
  },
  {
    id: 'd4',
    title: 'Documentation & Compliance',
    description: 'Keep all required documents current and valid',
    category: 'driver',
    severity: 'critical',
    icon: 'description',
    details: [
      'Valid driver license',
      'Vehicle registration up-to-date',
      'Insurance documentation valid',
      'Background check current',
      'Training certifications current',
    ],
  },
  {
    id: 'd5',
    title: 'Route & Navigation',
    description: 'Choose safe and efficient routes',
    category: 'driver',
    severity: 'info',
    icon: 'map',
    details: [
      'Use app navigation system',
      'Avoid hazardous routes',
      'Inform passenger of route changes',
      'Minimize driving time',
      'Report hazardous conditions',
    ],
  },
];

const GENERAL_RULES: ComplianceRule[] = [
  {
    id: 'g1',
    title: 'Payment Compliance',
    description: 'Complete payment for all rides taken',
    category: 'general',
    severity: 'critical',
    icon: 'payment',
    details: [
      'Pay full ride fare',
      'Use accepted payment methods',
      'Keep payment information updated',
      'Report billing discrepancies',
      'No cash-only arrangements',
    ],
  },
  {
    id: 'g2',
    title: 'Rating & Feedback',
    description: 'Provide honest ratings and feedback',
    category: 'general',
    severity: 'info',
    icon: 'star_rate',
    details: [
      'Rate drivers/passengers honestly',
      'Provide constructive feedback',
      'Do not rate based on personal preferences',
      'Report safety concerns',
      'Help improve service quality',
    ],
  },
];

const SAFETY_GUIDELINES: SafetyGuideline[] = [
  {
    id: 'sg1',
    title: 'Before You Ride',
    content: 'Prepare for a safe and comfortable ride experience',
    priority: 1,
    icon: 'check_circle',
    tips: [
      'Verify driver details before boarding',
      'Share trip details with trusted contact',
      'Keep your phone charged',
      'Have emergency contacts readily available',
      'Avoid rides late at night when possible',
    ],
  },
  {
    id: 'sg2',
    title: 'During Your Ride',
    content: 'Stay alert and follow safety practices throughout your journey',
    priority: 2,
    icon: 'directions_car',
    tips: [
      'Sit in back seat (passengers)',
      'Keep doors locked',
      'Stay aware of surroundings',
      'Keep phone accessible',
      'Trust your instincts',
    ],
  },
  {
    id: 'sg3',
    title: 'Emergency Situations',
    content: 'Know how to respond if something goes wrong',
    priority: 3,
    icon: 'warning',
    tips: [
      'Use SOS button in app immediately',
      'Call 911 if in immediate danger',
      'Exit vehicle only when safe',
      'Go to well-lit public area',
      'Take photos/video for evidence',
    ],
  },
  {
    id: 'sg4',
    title: 'Personal Security',
    content: 'Protect your personal information and belongings',
    priority: 4,
    icon: 'lock',
    tips: [
      'Do not share personal details',
      'Keep valuables hidden',
      'Do not accept rides from unknown persons',
      'Verify vehicle before entering',
      'Report suspicious behavior',
    ],
  },
];

export const useRideComplianceRules = (token: string | null, userType: 'passenger' | 'driver' | 'both' = 'passenger') => {
  const [complianceRules, setComplianceRules] = useState<ComplianceRule[]>([]);
  const [safetyGuidelines, setSafetyGuidelines] = useState<SafetyGuideline[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

  const loadRules = useCallback(() => {
    try {
      setLoading(true);
      const rules: ComplianceRule[] = [];

      if (userType === 'passenger' || userType === 'both') {
        rules.push(...PASSENGER_RULES);
      }
      if (userType === 'driver' || userType === 'both') {
        rules.push(...DRIVER_RULES);
      }
      rules.push(...GENERAL_RULES);

      setComplianceRules(rules);
    } finally {
      setLoading(false);
    }
  }, [userType]);

  const loadSafetyGuidelines = useCallback(() => {
    setSafetyGuidelines(SAFETY_GUIDELINES.sort((a, b) => a.priority - b.priority));
  }, []);

  const generateComplianceAlerts = useCallback(() => {
    const newAlerts: ComplianceAlert[] = [];

    // Simulate policy update alerts
    newAlerts.push({
      id: 'alert1',
      type: 'policy_update',
      title: 'New Safety Policy Updated',
      message: 'Please review the updated safety guidelines for rides',
      severity: 'info',
      timestamp: new Date().toISOString(),
      acknowledged: false,
      actionRequired: false,
    });

    // Add guideline reminders
    newAlerts.push({
      id: 'alert2',
      type: 'guideline_reminder',
      title: 'Safety Reminder',
      message: 'Always verify driver details before boarding',
      severity: 'warning',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      acknowledged: false,
      actionRequired: false,
    });

    setAlerts(newAlerts);
    setUnacknowledgedCount(newAlerts.filter(a => !a.acknowledged).length);
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev =>
      prev.map(a =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      )
    );
    setUnacknowledgedCount(prev => Math.max(0, prev - 1));
  }, []);

  const acknowledgeAllAlerts = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
    setUnacknowledgedCount(0);
  }, []);

  const getRulesByCategory = useCallback((category: 'passenger' | 'driver' | 'general') => {
    return complianceRules.filter(r => r.category === category);
  }, [complianceRules]);

  const getRulesBySeverity = useCallback((severity: 'critical' | 'warning' | 'info') => {
    return complianceRules.filter(r => r.severity === severity);
  }, [complianceRules]);

  const getUnacknowledgedAlerts = useCallback(() => {
    return alerts.filter(a => !a.acknowledged);
  }, [alerts]);

  const getCriticalRules = useCallback(() => {
    return complianceRules.filter(r => r.severity === 'critical');
  }, [complianceRules]);

  useEffect(() => {
    loadRules();
    loadSafetyGuidelines();
    generateComplianceAlerts();
  }, [loadRules, loadSafetyGuidelines, generateComplianceAlerts]);

  return {
    complianceRules,
    safetyGuidelines,
    alerts,
    loading,
    unacknowledgedCount,
    loadRules,
    loadSafetyGuidelines,
    generateComplianceAlerts,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    getRulesByCategory,
    getRulesBySeverity,
    getUnacknowledgedAlerts,
    getCriticalRules,
  };
};
