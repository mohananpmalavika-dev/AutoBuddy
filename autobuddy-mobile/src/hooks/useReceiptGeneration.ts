import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Receipt {
  id: string;
  rideId: string;
  date: Date;
  driverName: string;
  driverId: string;
  passengerName: string;
  pickupLocation: string;
  dropoffLocation: string;
  distance: number;
  duration: number;
  baseFare: number;
  taxes: number;
  discount: number;
  totalFare: number;
  paymentMethod: string;
  status: 'completed' | 'pending' | 'cancelled';
  rideType: 'economy' | 'comfort' | 'premium';
  vehicleInfo?: {
    make: string;
    model: string;
    licensePlate: string;
  };
}

export interface ReceiptDetails extends Receipt {
  rideNotes?: string;
  driverRating?: number;
  passengerRating?: number;
  taxNumber?: string;
  gstNumber?: string;
  breakdownDetails?: {
    baseFareBreakdown?: string;
    surgePricing?: number;
    tolls?: number;
    tips?: number;
  };
}

export interface PDFGenerationOptions {
  includeQRCode?: boolean;
  includeTaxInfo?: boolean;
  format?: 'receipt' | 'taxInvoice';
}

const RECEIPTS_STORAGE = 'receipts_storage';
const RECEIPT_SETTINGS_STORAGE = 'receipt_settings';

export const useReceiptGeneration = (token: string | null, userId: string) => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    autoEmailReceipts: false,
    emailAddress: '',
    includeQRCode: true,
    includeTaxInfo: true,
  });

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const savedReceipts = await AsyncStorage.getItem(RECEIPTS_STORAGE);
        const savedSettings = await AsyncStorage.getItem(RECEIPT_SETTINGS_STORAGE);

        if (savedReceipts) {
          const parsedReceipts = JSON.parse(savedReceipts).map((r: any) => ({
            ...r,
            date: new Date(r.date),
          }));
          setReceipts(parsedReceipts);
        }

        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    if (token && userId) initialize();
  }, [token, userId]);

  // Generate receipt from ride data
  const generateReceipt = useCallback(
    async (rideData: {
      rideId: string;
      driverName: string;
      driverId: string;
      passengerName: string;
      pickupLocation: string;
      dropoffLocation: string;
      distance: number;
      duration: number;
      baseFare: number;
      discount: number;
      totalFare: number;
      paymentMethod: string;
      rideType: 'economy' | 'comfort' | 'premium';
      vehicleInfo?: any;
    }): Promise<ReceiptDetails> => {
      try {
        const taxes = Math.round(rideData.baseFare * 0.05 * 100) / 100;
        const receipt: ReceiptDetails = {
          id: `receipt_${Date.now()}`,
          rideId: rideData.rideId,
          date: new Date(),
          driverName: rideData.driverName,
          driverId: rideData.driverId,
          passengerName: rideData.passengerName,
          pickupLocation: rideData.pickupLocation,
          dropoffLocation: rideData.dropoffLocation,
          distance: rideData.distance,
          duration: rideData.duration,
          baseFare: rideData.baseFare,
          taxes,
          discount: rideData.discount,
          totalFare: rideData.totalFare,
          paymentMethod: rideData.paymentMethod,
          status: 'completed',
          rideType: rideData.rideType,
          vehicleInfo: rideData.vehicleInfo,
          taxNumber: 'TAX123456789',
          gstNumber: 'GST12AB3456CD789',
          breakdownDetails: {
            baseFareBreakdown: `${rideData.distance}km @ ₹${(rideData.baseFare / rideData.distance).toFixed(2)}/km`,
            surgePricing: 0,
            tolls: 0,
            tips: 0,
          },
        };

        // Save receipt
        const updatedReceipts = [receipt, ...receipts];
        setReceipts(updatedReceipts);
        await AsyncStorage.setItem(RECEIPTS_STORAGE, JSON.stringify(updatedReceipts));

        return receipt;
      } catch (err) {
        const errorMsg = `Receipt generation failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [receipts]
  );

  // Generate PDF content (simulated - in production would use proper PDF library)
  const generatePDFContent = useCallback(
    (receipt: ReceiptDetails, options: PDFGenerationOptions = {}): string => {
      const format = options.format || 'receipt';
      const timestamp = receipt.date.toISOString().split('T')[0];

      let pdfContent = `
========================================
${format === 'taxInvoice' ? 'TAX INVOICE' : 'RIDE RECEIPT'}
========================================

RECEIPT #: ${receipt.id}
Date: ${timestamp}
Status: ${receipt.status.toUpperCase()}

RIDE DETAILS
--------
Ride Type: ${receipt.rideType.toUpperCase()}
Distance: ${receipt.distance} km
Duration: ${receipt.duration} mins
Date & Time: ${receipt.date.toLocaleString()}

LOCATIONS
--------
Pickup: ${receipt.pickupLocation}
Dropoff: ${receipt.dropoffLocation}

DRIVER INFO
--------
Driver Name: ${receipt.driverName}
Vehicle: ${receipt.vehicleInfo?.make} ${receipt.vehicleInfo?.model}
License Plate: ${receipt.vehicleInfo?.licensePlate}

PASSENGER INFO
--------
Passenger: ${receipt.passengerName}

FARE BREAKDOWN
--------
Base Fare: ₹${receipt.baseFare.toFixed(2)}
Taxes (5%): ₹${receipt.taxes.toFixed(2)}
Discount: -₹${receipt.discount.toFixed(2)}
--------
TOTAL FARE: ₹${receipt.totalFare.toFixed(2)}

Payment Method: ${receipt.paymentMethod}
`;

      if (options.includeTaxInfo && receipt.taxNumber) {
        pdfContent += `

TAX INFORMATION
--------
Tax Number: ${receipt.taxNumber}
GST Number: ${receipt.gstNumber}
`;
      }

      if (receipt.breakdownDetails) {
        pdfContent += `

FARE BREAKDOWN DETAILS
--------
${receipt.breakdownDetails.baseFareBreakdown}
${receipt.breakdownDetails.surgePricing > 0 ? `Surge Pricing: ₹${receipt.breakdownDetails.surgePricing.toFixed(2)}` : ''}
${receipt.breakdownDetails.tolls > 0 ? `Tolls: ₹${receipt.breakdownDetails.tolls.toFixed(2)}` : ''}
${receipt.breakdownDetails.tips > 0 ? `Tips: ₹${receipt.breakdownDetails.tips.toFixed(2)}` : ''}
`;
      }

      pdfContent += `

========================================
Thank you for riding with AutoBuddy!
========================================
      `;

      return pdfContent;
    },
    []
  );

  // Generate and download receipt
  const downloadReceipt = useCallback(
    async (receipt: ReceiptDetails, options: PDFGenerationOptions = {}): Promise<string> => {
      try {
        const pdfContent = generatePDFContent(receipt, options);
        const fileName = `receipt_${receipt.id}_${receipt.date.getTime()}.txt`;

        // In production, would use proper PDF library and file system
        // For now, simulate with filename and content
        const downloadInfo = {
          fileName,
          content: pdfContent,
          size: pdfContent.length,
          timestamp: Date.now(),
        };

        // Save download record
        const downloadRecord = {
          receiptId: receipt.id,
          fileName,
          downloadedAt: new Date(),
        };

        setError(null);
        return downloadInfo.fileName;
      } catch (err) {
        const errorMsg = `Download failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [generatePDFContent]
  );

  // Email receipt
  const emailReceipt = useCallback(
    async (receipt: ReceiptDetails, recipientEmail: string, options: PDFGenerationOptions = {}): Promise<void> => {
      try {
        const pdfContent = generatePDFContent(receipt, options);

        // In production, would call backend API to send email
        // For now, simulate email sending
        const emailPayload = {
          recipientEmail,
          subject: `Your AutoBuddy Receipt - ${receipt.date.toLocaleDateString()}`,
          body: pdfContent,
          receiptId: receipt.id,
          sentAt: new Date(),
        };

        // Log email action
        console.log('Email sent:', emailPayload);

        setError(null);
      } catch (err) {
        const errorMsg = `Email sending failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [generatePDFContent]
  );

  // Get receipt history
  const getReceiptHistory = useCallback(
    (filterByDate?: { from: Date; to: Date }): Receipt[] => {
      if (!filterByDate) return receipts;

      return receipts.filter(r => {
        const receiptDate = new Date(r.date);
        return receiptDate >= filterByDate.from && receiptDate <= filterByDate.to;
      });
    },
    [receipts]
  );

  // Get receipt by ID
  const getReceiptById = useCallback(
    (receiptId: string): Receipt | null => {
      return receipts.find(r => r.id === receiptId) || null;
    },
    [receipts]
  );

  // Get receipts by ride ID
  const getReceiptByRideId = useCallback(
    (rideId: string): Receipt | null => {
      return receipts.find(r => r.rideId === rideId) || null;
    },
    [receipts]
  );

  // Update receipt settings
  const updateReceiptSettings = useCallback(
    async (newSettings: Partial<typeof settings>): Promise<void> => {
      try {
        const updatedSettings = { ...settings, ...newSettings };
        setSettings(updatedSettings);
        await AsyncStorage.setItem(RECEIPT_SETTINGS_STORAGE, JSON.stringify(updatedSettings));
      } catch (err) {
        setError(`Settings update failed: ${err}`);
        throw err;
      }
    },
    [settings]
  );

  // Get receipt statistics
  const getReceiptStats = useCallback(() => {
    const totalReceipts = receipts.length;
    const totalAmount = receipts.reduce((sum, r) => sum + r.totalFare, 0);
    const averageAmount = totalReceipts > 0 ? totalAmount / totalReceipts : 0;
    const totalTaxes = receipts.reduce((sum, r) => sum + r.taxes, 0);
    const totalDiscounts = receipts.reduce((sum, r) => sum + r.discount, 0);

    return {
      totalReceipts,
      totalAmount,
      averageAmount,
      totalTaxes,
      totalDiscounts,
      dateRange: {
        earliest: receipts.length > 0 ? receipts[receipts.length - 1].date : null,
        latest: receipts.length > 0 ? receipts[0].date : null,
      },
    };
  }, [receipts]);

  // Export all receipts (bulk download)
  const exportAllReceipts = useCallback(
    async (format: 'csv' | 'json' = 'csv'): Promise<string> => {
      try {
        let exportContent = '';

        if (format === 'csv') {
          exportContent = 'Receipt ID,Ride ID,Date,Driver,Passenger,Pickup,Dropoff,Distance,Fare,Status\n';
          exportContent += receipts
            .map(
              r =>
                `${r.id},${r.rideId},${r.date.toISOString()},${r.driverName},${r.passengerName},${r.pickupLocation},${r.dropoffLocation},${r.distance},${r.totalFare},${r.status}`
            )
            .join('\n');
        } else {
          exportContent = JSON.stringify(receipts, null, 2);
        }

        return `receipts_export_${Date.now()}.${format === 'csv' ? 'csv' : 'json'}`;
      } catch (err) {
        setError(`Export failed: ${err}`);
        throw err;
      }
    },
    [receipts]
  );

  return {
    // Methods
    generateReceipt,
    generatePDFContent,
    downloadReceipt,
    emailReceipt,
    getReceiptHistory,
    getReceiptById,
    getReceiptByRideId,
    updateReceiptSettings,
    getReceiptStats,
    exportAllReceipts,

    // Data
    receipts,
    settings,

    // State
    loading,
    error,
  };
};
