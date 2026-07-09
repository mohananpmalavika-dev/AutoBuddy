"""
Internationalization (i18n) Utility
Translation functions for backend
"""
import json
import os
from typing import Dict, Any, Optional
from pathlib import Path

# Cache for translations
_translations_cache: Dict[str, Dict[str, str]] = {}

# Base directory for translations
TRANSLATIONS_DIR = Path(__file__).parent.parent / 'locales'


def load_translations(language: str) -> Dict[str, str]:
    """Load translations for a language"""
    if language in _translations_cache:
        return _translations_cache[language]
    
    translation_file = TRANSLATIONS_DIR / f'{language}.json'
    
    if not translation_file.exists():
        # Fall back to English
        translation_file = TRANSLATIONS_DIR / 'en.json'
    
    try:
        with open(translation_file, 'r', encoding='utf-8') as f:
            translations = json.load(f)
            _translations_cache[language] = translations
            return translations
    except Exception as e:
        print(f"Failed to load translations for {language}: {e}")
        return {}


def translate(key: str, language: str = 'en', **kwargs) -> str:
    """
    Translate a key to the target language
    
    Args:
        key: Translation key (e.g., 'error.invalid_credentials')
        language: Target language code
        **kwargs: Parameters for string formatting
    
    Returns:
        Translated string
    """
    translations = load_translations(language)
    
    # Get nested translation using dot notation
    keys = key.split('.')
    value = translations
    
    for k in keys:
        if isinstance(value, dict):
            value = value.get(k)
        else:
            value = None
            break
    
    if value is None:
        # Fall back to key itself
        value = key
    
    # Format with parameters
    if kwargs:
        try:
            value = value.format(**kwargs)
        except (KeyError, ValueError):
            pass
    
    return str(value)


def t(key: str, locale: str = 'en', **kwargs) -> str:
    """Shorthand for translate"""
    return translate(key, locale, **kwargs)


def get_currency_symbol(currency_code: str) -> str:
    """Get currency symbol for currency code"""
    symbols = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'INR': '₹',
        'JPY': '¥',
        'CNY': '¥',
        'AED': 'د.إ',
        'SAR': '﷼',
    }
    return symbols.get(currency_code.upper(), currency_code)


def format_currency(amount: float, currency: str, locale: str) -> str:
    """Format currency amount based on locale"""
    symbol = get_currency_symbol(currency)
    
    # Format based on locale conventions
    if locale == 'en':
        return f"{symbol}{amount:,.2f}"
    elif locale == 'hi' or locale == 'ta':
        # Indian numbering system (lakhs, crores)
        return f"{symbol}{amount:,.2f}".replace(',', '_')
    elif locale == 'es':
        return f"{amount:,.2f} {symbol}".replace(',', 'X').replace('.', ',').replace('X', '.')
    elif locale == 'ar':
        return f"{amount:,.2f} {symbol}"
    else:
        return f"{symbol}{amount:,.2f}"


def format_date(date_str: str, locale: str) -> str:
    """Format date string based on locale (basic implementation)"""
    # In production, use babel or similar library
    if locale == 'en':
        return date_str  # MM/DD/YYYY
    elif locale in ['hi', 'ta']:
        return date_str  # DD/MM/YYYY
    elif locale == 'es':
        return date_str  # DD/MM/YYYY
    elif locale == 'ar':
        return date_str  # DD/MM/YYYY (RTL)
    else:
        return date_str


def get_language_name(lang_code: str, in_language: str = 'en') -> str:
    """Get language name in specified language"""
    names = {
        'en': {
            'en': 'English',
            'hi': 'Hindi',
            'ta': 'Tamil',
            'es': 'Spanish',
            'ar': 'Arabic',
        },
        'hi': {
            'en': 'अंग्रेज़ी',
            'hi': 'हिन्दी',
            'ta': 'तमिल',
            'es': 'स्पेनिश',
            'ar': 'अरबी',
        },
        'ta': {
            'en': 'ஆங்கிலம்',
            'hi': 'இந்தி',
            'ta': 'தமிழ்',
            'es': 'ஸ்பானிஷ்',
            'ar': 'அரபு',
        },
        'es': {
            'en': 'Inglés',
            'hi': 'Hindi',
            'ta': 'Tamil',
            'es': 'Español',
            'ar': 'Árabe',
        },
        'ar': {
            'en': 'الإنجليزية',
            'hi': 'الهندية',
            'ta': 'التاميلية',
            'es': 'الإسبانية',
            'ar': 'العربية',
        },
    }
    
    return names.get(in_language, {}).get(lang_code, lang_code.upper())


def is_rtl_language(lang_code: str) -> bool:
    """Check if language is right-to-left"""
    return lang_code in ['ar', 'he', 'fa', 'ur']
