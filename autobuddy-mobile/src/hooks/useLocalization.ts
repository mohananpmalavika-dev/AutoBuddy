import { useState, useCallback, useContext, createContext, ReactNode } from 'react';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'zh' | 'ja' | 'ar' | 'hi';

export interface LocalizationStrings {
  [key: string]: string | LocalizationStrings;
}

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  direction: 'ltr' | 'rtl';
  locale: string;
}

const languageConfigs: { [key in SupportedLanguage]: LanguageConfig } = {
  en: { code: 'en', name: 'English', direction: 'ltr', locale: 'en-US' },
  es: { code: 'es', name: 'Español', direction: 'ltr', locale: 'es-ES' },
  fr: { code: 'fr', name: 'Français', direction: 'ltr', locale: 'fr-FR' },
  de: { code: 'de', name: 'Deutsch', direction: 'ltr', locale: 'de-DE' },
  pt: { code: 'pt', name: 'Português', direction: 'ltr', locale: 'pt-BR' },
  zh: { code: 'zh', name: '中文', direction: 'ltr', locale: 'zh-CN' },
  ja: { code: 'ja', name: '日本語', direction: 'ltr', locale: 'ja-JP' },
  ar: { code: 'ar', name: 'العربية', direction: 'rtl', locale: 'ar-SA' },
  hi: { code: 'hi', name: 'हिन्दी', direction: 'ltr', locale: 'hi-IN' },
};

const translations: { [key in SupportedLanguage]: LocalizationStrings } = {
  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      back: 'Back',
      next: 'Next',
    },
    screen: {
      dashboard: 'Dashboard',
      profile: 'Profile',
      settings: 'Settings',
      help: 'Help',
      logout: 'Logout',
    },
  },
  es: {
    common: {
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      close: 'Cerrar',
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
      back: 'Atrás',
      next: 'Siguiente',
    },
    screen: {
      dashboard: 'Panel de Control',
      profile: 'Perfil',
      settings: 'Configuración',
      help: 'Ayuda',
      logout: 'Cerrar Sesión',
    },
  },
  fr: {
    common: {
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      close: 'Fermer',
      loading: 'Chargement...',
      error: 'Erreur',
      success: 'Succès',
      back: 'Retour',
      next: 'Suivant',
    },
    screen: {
      dashboard: 'Tableau de Bord',
      profile: 'Profil',
      settings: 'Paramètres',
      help: 'Aide',
      logout: 'Déconnexion',
    },
  },
  de: {
    common: {
      save: 'Speichern',
      cancel: 'Abbrechen',
      delete: 'Löschen',
      edit: 'Bearbeiten',
      close: 'Schließen',
      loading: 'Wird geladen...',
      error: 'Fehler',
      success: 'Erfolg',
      back: 'Zurück',
      next: 'Weiter',
    },
    screen: {
      dashboard: 'Instrumententafel',
      profile: 'Profil',
      settings: 'Einstellungen',
      help: 'Hilfe',
      logout: 'Abmelden',
    },
  },
  pt: {
    common: {
      save: 'Salvar',
      cancel: 'Cancelar',
      delete: 'Excluir',
      edit: 'Editar',
      close: 'Fechar',
      loading: 'Carregando...',
      error: 'Erro',
      success: 'Sucesso',
      back: 'Voltar',
      next: 'Próximo',
    },
    screen: {
      dashboard: 'Painel',
      profile: 'Perfil',
      settings: 'Configurações',
      help: 'Ajuda',
      logout: 'Sair',
    },
  },
  zh: {
    common: {
      save: '保存',
      cancel: '取消',
      delete: '删除',
      edit: '编辑',
      close: '关闭',
      loading: '加载中...',
      error: '错误',
      success: '成功',
      back: '返回',
      next: '下一步',
    },
    screen: {
      dashboard: '仪表板',
      profile: '个人资料',
      settings: '设置',
      help: '帮助',
      logout: '登出',
    },
  },
  ja: {
    common: {
      save: '保存',
      cancel: 'キャンセル',
      delete: '削除',
      edit: '編集',
      close: '閉じる',
      loading: '読み込み中...',
      error: 'エラー',
      success: '成功',
      back: '戻る',
      next: '次へ',
    },
    screen: {
      dashboard: 'ダッシュボード',
      profile: 'プロフィール',
      settings: '設定',
      help: 'ヘルプ',
      logout: 'ログアウト',
    },
  },
  ar: {
    common: {
      save: 'حفظ',
      cancel: 'إلغاء',
      delete: 'حذف',
      edit: 'تعديل',
      close: 'إغلاق',
      loading: 'جاري التحميل...',
      error: 'خطأ',
      success: 'نجاح',
      back: 'رجوع',
      next: 'التالي',
    },
    screen: {
      dashboard: 'لوحة التحكم',
      profile: 'الملف الشخصي',
      settings: 'الإعدادات',
      help: 'مساعدة',
      logout: 'تسجيل الخروج',
    },
  },
  hi: {
    common: {
      save: 'सहेजें',
      cancel: 'रद्द करें',
      delete: 'हटाएं',
      edit: 'संपादित करें',
      close: 'बंद करें',
      loading: 'लोड हो रहा है...',
      error: 'त्रुटि',
      success: 'सफलता',
      back: 'वापस',
      next: 'अगला',
    },
    screen: {
      dashboard: 'डैशबोर्ड',
      profile: 'प्रोफ़ाइल',
      settings: 'सेटिंग्स',
      help: 'सहायता',
      logout: 'लॉग आउट',
    },
  },
};

interface UseLocalizationReturn {
  currentLanguage: SupportedLanguage;
  availableLanguages: SupportedLanguage[];
  languageConfig: LanguageConfig;
  t: (key: string, defaultValue?: string) => string;
  setLanguage: (language: SupportedLanguage) => void;
  formatDate: (date: Date, format?: string) => string;
  formatCurrency: (amount: number, currencyCode?: string) => string;
  formatNumber: (number: number, decimals?: number) => string;
  getDirection: () => 'ltr' | 'rtl';
  getAvailableLanguages: () => Array<{ code: SupportedLanguage; name: string }>;
}

export const useLocalization = (defaultLanguage: SupportedLanguage = 'en'): UseLocalizationReturn => {
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(defaultLanguage);

  const languageConfig = languageConfigs[currentLanguage];

  const t = useCallback(
    (key: string, defaultValue?: string): string => {
      const keys = key.split('.');
      let value: any = translations[currentLanguage];

      for (const k of keys) {
        value = value?.[k];
        if (!value) return defaultValue || key;
      }

      return typeof value === 'string' ? value : defaultValue || key;
    },
    [currentLanguage]
  );

  const formatDate = useCallback(
    (date: Date, format?: string): string => {
      const locale = languageConfig.locale;
      if (format === 'short') {
        return date.toLocaleDateString(locale);
      } else if (format === 'long') {
        return date.toLocaleDateString(locale, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } else if (format === 'time') {
        return date.toLocaleTimeString(locale);
      }
      return date.toLocaleString(locale);
    },
    [languageConfig.locale]
  );

  const formatCurrency = useCallback(
    (amount: number, currencyCode: string = 'USD'): string => {
      const locale = languageConfig.locale;
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
      }).format(amount);
    },
    [languageConfig.locale]
  );

  const formatNumber = useCallback(
    (number: number, decimals: number = 2): string => {
      const locale = languageConfig.locale;
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(number);
    },
    [languageConfig.locale]
  );

  const getDirection = useCallback(
    (): 'ltr' | 'rtl' => languageConfig.direction,
    [languageConfig.direction]
  );

  const getAvailableLanguages = useCallback(
    (): Array<{ code: SupportedLanguage; name: string }> => {
      return (Object.keys(languageConfigs) as SupportedLanguage[]).map((code) => ({
        code,
        name: languageConfigs[code].name,
      }));
    },
    []
  );

  return {
    currentLanguage,
    availableLanguages: Object.keys(languageConfigs) as SupportedLanguage[],
    languageConfig,
    t,
    setLanguage: setCurrentLanguage,
    formatDate,
    formatCurrency,
    formatNumber,
    getDirection,
    getAvailableLanguages,
  };
};

export const LocalizationContext = createContext<UseLocalizationReturn | undefined>(
  undefined
);

export const useLocalizationContext = (): UseLocalizationReturn => {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalizationContext must be used within LocalizationProvider');
  }
  return context;
};
