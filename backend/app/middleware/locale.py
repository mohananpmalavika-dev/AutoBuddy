"""
Locale Middleware
Handles language detection and localization for API
"""
from fastapi import Request
from typing import Optional
import re

SUPPORTED_LANGUAGES = ['en', 'hi', 'ta', 'es', 'ar']
DEFAULT_LANGUAGE = 'en'


def parse_accept_language(accept_language: str) -> str:
    """Parse Accept-Language header and return best match"""
    if not accept_language:
        return DEFAULT_LANGUAGE
    
    # Parse Accept-Language header (e.g., "en-US,en;q=0.9,hi;q=0.8")
    languages = []
    for lang_spec in accept_language.split(','):
        parts = lang_spec.strip().split(';')
        lang = parts[0].split('-')[0].lower()  # Get language code only
        
        # Extract quality value (default 1.0)
        quality = 1.0
        if len(parts) > 1:
            q_match = re.search(r'q=([\d.]+)', parts[1])
            if q_match:
                quality = float(q_match.group(1))
        
        if lang in SUPPORTED_LANGUAGES:
            languages.append((quality, lang))
    
    # Sort by quality (descending)
    languages.sort(reverse=True)
    
    return languages[0][1] if languages else DEFAULT_LANGUAGE


def get_locale(request: Request) -> str:
    """Get user's preferred locale from request"""
    # 1. Check query parameter
    if 'lang' in request.query_params:
        lang = request.query_params['lang'].lower()
        if lang in SUPPORTED_LANGUAGES:
            return lang
    
    # 2. Check custom header
    custom_lang = request.headers.get('X-Language')
    if custom_lang and custom_lang.lower() in SUPPORTED_LANGUAGES:
        return custom_lang.lower()
    
    # 3. Check Accept-Language header
    accept_language = request.headers.get('Accept-Language', '')
    return parse_accept_language(accept_language)


async def locale_middleware(request: Request, call_next):
    """Middleware to set locale for each request"""
    locale = get_locale(request)
    request.state.locale = locale
    response = await call_next(request)
    response.headers['Content-Language'] = locale
    return response
