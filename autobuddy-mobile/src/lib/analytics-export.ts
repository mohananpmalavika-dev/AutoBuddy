import { AlertIOS, Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { apiRequest } from './api-client';

export interface ExportData {
  title: string;
  period: string;
  generatedAt: Date;
  metrics: Record<string, any>;
  details?: Record<string, any>;
}

/**
 * Generate CSV export from analytics data
 */
export const generateCSVExport = (data: ExportData): string => {
  const rows: string[] = [];

  // Header
  rows.push(`Report: ${data.title}`);
  rows.push(`Period: ${data.period}`);
  rows.push(`Generated: ${data.generatedAt.toISOString()}`);
  rows.push('');

  // Main metrics
  rows.push('Metric,Value');
  Object.entries(data.metrics).forEach(([key, value]) => {
    const displayKey = key.replace(/_/g, ' ').toUpperCase();
    rows.push(`"${displayKey}","${value}"`);
  });

  rows.push('');

  // Details if available
  if (data.details) {
    rows.push('Details');
    rows.push('');

    Object.entries(data.details).forEach(([section, items]: [string, any]) => {
      rows.push(`[${section}]`);

      if (Array.isArray(items)) {
        items.forEach((item) => {
          rows.push(`"${JSON.stringify(item)}"`);
        });
      } else if (typeof items === 'object') {
        Object.entries(items).forEach(([key, value]) => {
          rows.push(`"${key}","${value}"`);
        });
      }

      rows.push('');
    });
  }

  return rows.join('\n');
};

/**
 * Generate JSON export from analytics data
 */
export const generateJSONExport = (data: ExportData): string => {
  return JSON.stringify(
    {
      report: {
        title: data.title,
        period: data.period,
        generatedAt: data.generatedAt.toISOString(),
      },
      metrics: data.metrics,
      details: data.details || {},
    },
    null,
    2
  );
};

/**
 * Generate HTML export from analytics data
 */
export const generateHTMLExport = (data: ExportData): string => {
  const styles = `
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
      .header { background-color: #2196F3; color: white; padding: 20px; border-radius: 4px; }
      .header h1 { margin: 0; font-size: 24px; }
      .header p { margin: 5px 0; font-size: 14px; }
      .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; }
      .metric-card { background: white; padding: 15px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .metric-card .label { color: #666; font-size: 12px; text-transform: uppercase; }
      .metric-card .value { font-size: 24px; font-weight: bold; color: #000; margin-top: 5px; }
      .section { background: white; margin-top: 20px; padding: 15px; border-radius: 4px; }
      .section h3 { margin-top: 0; color: #2196F3; }
      table { width: 100%; border-collapse: collapse; }
      table th { background-color: #f0f0f0; padding: 10px; text-align: left; font-weight: 600; }
      table td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
      table tr:hover { background-color: #f9f9f9; }
      footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; }
    </style>
  `;

  let metricsHTML = '<div class="metrics">';
  Object.entries(data.metrics).forEach(([key, value]) => {
    const displayKey = key.replace(/_/g, ' ').toUpperCase();
    metricsHTML += `
      <div class="metric-card">
        <div class="label">${displayKey}</div>
        <div class="value">${value}</div>
      </div>
    `;
  });
  metricsHTML += '</div>';

  let detailsHTML = '';
  if (data.details) {
    Object.entries(data.details).forEach(([section, items]: [string, any]) => {
      detailsHTML += `<div class="section">`;
      detailsHTML += `<h3>${section}</h3>`;

      if (Array.isArray(items) && items.length > 0) {
        detailsHTML += '<table>';
        // Get keys from first item
        const keys = Object.keys(items[0]);
        detailsHTML += '<thead><tr>';
        keys.forEach((key) => {
          detailsHTML += `<th>${key.replace(/_/g, ' ').toUpperCase()}</th>`;
        });
        detailsHTML += '</tr></thead><tbody>';

        // Add rows
        items.forEach((item: any) => {
          detailsHTML += '<tr>';
          keys.forEach((key) => {
            detailsHTML += `<td>${item[key]}</td>`;
          });
          detailsHTML += '</tr>';
        });

        detailsHTML += '</tbody></table>';
      } else if (typeof items === 'object') {
        detailsHTML += '<table>';
        Object.entries(items).forEach(([key, value]) => {
          detailsHTML += `
            <tr>
              <td><strong>${key}</strong></td>
              <td>${value}</td>
            </tr>
          `;
        });
        detailsHTML += '</table>';
      }

      detailsHTML += '</div>';
    });
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${data.title}</title>
      ${styles}
    </head>
    <body>
      <div class="header">
        <h1>${data.title}</h1>
        <p>Period: ${data.period}</p>
        <p>Generated: ${data.generatedAt.toLocaleString()}</p>
      </div>
      ${metricsHTML}
      ${detailsHTML}
      <footer>
        <p>This report was automatically generated by AutoBuddy Analytics System</p>
      </footer>
    </body>
    </html>
  `;
};

/**
 * Save and share exported file
 */
export const saveAndShareExport = async (
  filename: string,
  content: string,
  format: 'csv' | 'json' | 'html' | 'pdf'
): Promise<boolean> => {
  try {
    const fileExtension = format === 'pdf' ? 'pdf' : format;
    const fullFilename = `${filename}.${fileExtension}`;
    const fileUri = `${FileSystem.documentDirectory}${fullFilename}`;

    // Write file
    await FileSystem.writeAsStringAsync(fileUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    console.log(`[Export] File saved: ${fileUri}`);

    // Share file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: getMimeType(format),
        dialogTitle: `Share ${fullFilename}`,
      });
      return true;
    } else {
      console.warn('[Export] Sharing not available on this platform');
      // Fallback: alert user about file location
      if (Platform.OS === 'ios') {
        AlertIOS.alert(`File saved`, `File available at: ${fileUri}`);
      }
      return false;
    }
  } catch (error) {
    console.error('[Export] Error saving/sharing file:', error);
    throw error;
  }
};

/**
 * Export to multiple formats simultaneously
 */
export const exportToMultipleFormats = async (
  data: ExportData,
  formats: Array<'csv' | 'json' | 'html'> = ['csv', 'json', 'html']
): Promise<Record<string, string>> => {
  const exports: Record<string, string> = {};

  for (const format of formats) {
    try {
      let content: string;

      switch (format) {
        case 'csv':
          content = generateCSVExport(data);
          break;
        case 'json':
          content = generateJSONExport(data);
          break;
        case 'html':
          content = generateHTMLExport(data);
          break;
        default:
          continue;
      }

      exports[format] = content;
    } catch (error) {
      console.error(`[Export] Error generating ${format}:`, error);
    }
  }

  return exports;
};

/**
 * Fetch analytics data and prepare for export
 */
export const fetchAnalyticsForExport = async (
  token: string | null,
  reportId: string,
  format: 'csv' | 'json' | 'html'
): Promise<ExportData | null> => {
  if (!token) return null;

  try {
    const response = await apiRequest(`/reports/${reportId}/export`, {
      method: 'GET',
      token,
      headers: {
        'Accept': getMimeType(format),
      },
    });

    if (!response) return null;

    return {
      title: response.title || 'Analytics Report',
      period: response.period || 'Custom',
      generatedAt: new Date(response.generatedAt || Date.now()),
      metrics: response.metrics || {},
      details: response.details,
    };
  } catch (error) {
    console.error('[Export] Error fetching analytics data:', error);
    throw error;
  }
};

/**
 * Generate batch exports with progress tracking
 */
export const generateBatchExports = async (
  token: string | null,
  reportIds: string[],
  formats: Array<'csv' | 'json' | 'html'>,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> => {
  const exportedFiles: string[] = [];
  const total = reportIds.length;

  for (let i = 0; i < reportIds.length; i++) {
    const reportId = reportIds[i];

    try {
      const data = await fetchAnalyticsForExport(token, reportId, 'json');

      if (data) {
        const exports = await exportToMultipleFormats(data, formats);

        for (const [format, content] of Object.entries(exports)) {
          const filename = `Report_${reportId}_${Date.now()}`;
          const fileUri = await saveAndShareExport(
            filename,
            content,
            format as 'csv' | 'json' | 'html'
          );
          if (fileUri) {
            exportedFiles.push(`${filename}.${format}`);
          }
        }
      }
    } catch (error) {
      console.error(`[Export] Error processing report ${reportId}:`, error);
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return exportedFiles;
};

const getMimeType = (format: string): string => {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'html':
      return 'text/html';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'text/plain';
  }
};

export default {
  generateCSVExport,
  generateJSONExport,
  generateHTMLExport,
  saveAndShareExport,
  exportToMultipleFormats,
  fetchAnalyticsForExport,
  generateBatchExports,
};
