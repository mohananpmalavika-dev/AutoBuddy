import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const LANGUAGES = [
  { code: 'en', label: 'English', speech: 'en-IN' },
  { code: 'ml', label: '\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02', speech: 'ml-IN' },
  { code: 'hi', label: '\u0939\u093f\u0928\u094d\u0926\u0940', speech: 'hi-IN' },
  { code: 'ta', label: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd', speech: 'ta-IN' },
  { code: 'te', label: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41', speech: 'te-IN' },
  { code: 'kn', label: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1', speech: 'kn-IN' },
];

const TEXT_TRANSLATIONS = {
  'Welcome Back': {
    hi: '\u0935\u093e\u092a\u0938 \u0938\u094d\u0935\u093e\u0917\u0924',
    ta: '\u0bae\u0bc0\u0ba3\u0bcd\u0b9f\u0bc1\u0bae\u0bcd \u0bb5\u0bb0\u0bb5\u0bc7\u0bb1\u0bcd\u0b95\u0bbf\u0bb1\u0bcb\u0bae\u0bcd',
    te: '\u0c2e\u0cb3\u0ccd\u0cb3\u0cc0 \u0cb8\u0ccd\u0cb5\u0cbe\u0c17\u0ca4\u0c02',
    kn: '\u0cae\u0ca4\u0ccd\u0ca4\u0cc6 \u0cb8\u0ccd\u0cb5\u0cbe\u0c97\u0ca4',
    ml: '\u0d35\u0d40\u0d23\u0d4d\u0d1f\u0d41\u0d02 \u0d38\u0d4d\u0d35\u0d3e\u0d17\u0d24\u0d02',
  },
  'Create Account': {
    hi: '\u0916\u093e\u0924\u093e \u092c\u0928\u093e\u090f\u0902',
    ta: '\u0b95\u0ba3\u0b95\u0bcd\u0b95\u0bc1 \u0b89\u0bb0\u0bc1\u0bb5\u0bbe\u0b95\u0bcd\u0b95\u0bb5\u0bc1\u0bae\u0bcd',
    te: '\u0c16\u0c3e\u0c24\u0c3e \u0c38\u0c43\u0c37\u0c4d\u0c1f\u0c3f\u0c02\u0c1a\u0c02\u0c21\u0c3f',
    kn: '\u0c96\u0c3e\u0ca4\u0cc6 \u0cb0\u0c9a\u0cbf\u0cb8\u0cbf',
    ml: '\u0d05\u0d15\u0d4d\u0d15\u0d4c\u0d23\u0d4d\u0d1f\u0d4d \u0d38\u0d43\u0d37\u0d4d\u0d1f\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d15',
  },
  Login: {
    hi: '\u0932\u0949\u0917\u093f\u0928',
    ta: '\u0b89\u0bb3\u0bcd\u0ba8\u0bc1\u0bb4\u0bc8',
    te: '\u0c32\u0c3e\u0c17\u0c3f\u0c28\u0c4d',
    kn: '\u0cb2\u0cbe\u0c97\u0cbf\u0ca8\u0ccd',
    ml: '\u0d32\u0d4b\u0d17\u0d3f\u0d7b',
  },
  Register: {
    hi: '\u0930\u091c\u093f\u0938\u094d\u091f\u0930',
    ta: '\u0baa\u0ba4\u0bbf\u0bb5\u0bc1',
    te: '\u0c30\u0c3f\u0c1c\u0c3f\u0c38\u0c4d\u0c1f\u0c30\u0c4d',
    kn: '\u0ca8\u0ccb\u0c82\u0ca6\u0ca3\u0cbf',
    ml: '\u0d30\u0d1c\u0d3f\u0d38\u0d4d\u0d31\u0d7c',
  },
  Password: {
    hi: '\u092a\u093e\u0938\u0935\u0930\u094d\u0921',
    ta: '\u0b95\u0b9f\u0bb5\u0bc1\u0b9a\u0bcd\u0b9a\u0bca\u0bb2\u0bcd',
    te: '\u0c2a\u0c3e\u0c38\u0c4d\u0c35\u0c30\u0c4d\u0c21\u0c4d',
    kn: '\u0caa\u0cbe\u0cb8\u0ccd\u0cb5\u0cb0\u0ccd\u0ca1\u0ccd',
    ml: '\u0d2a\u0d3e\u0d38\u0d4d\u0d35\u0d47\u0d7c\u0d21\u0d4d',
  },
  OTP: {
    hi: '\u0913\u091f\u0940\u092a\u0940',
    ta: '\u0b92\u0b9f\u0bbf\u0baa\u0bbf',
    te: '\u0c12\u0c1f\u0c3f\u0c2a\u0c3f',
    kn: '\u0c92\u0c9f\u0cbf\u0caa\u0cbf',
    ml: '\u0d12\u0d1f\u0d3f\u0d2a\u0d3f',
  },
  Google: { hi: '\u0917\u0942\u0917\u0932', ta: '\u0b95\u0bc2\u0b95\u0bc1\u0bb3\u0bcd', te: '\u0c17\u0c42\u0c17\u0c41\u0c32\u0c4d', kn: '\u0c97\u0cc2\u0c97\u0cb2\u0ccd', ml: '\u0d17\u0d42\u0d17\u0d3f\u0d7d' },
  Email: { hi: '\u0908\u092e\u0947\u0932', ta: '\u0bae\u0bbf\u0ba9\u0bcd\u0ba9\u0b9e\u0bcd\u0b9a\u0bb2\u0bcd', te: '\u0c07\u0c2e\u0c47\u0c2f\u0c3f\u0cb2\u0ccd', kn: '\u0c87\u0cae\u0cc7\u0cb2\u0ccd', ml: '\u0d07\u0d2e\u0d47\u0d2f\u0d3f\u0d7d' },
  'Full name': { hi: '\u092a\u0942\u0930\u093e \u0928\u093e\u092e', ta: '\u0bae\u0bc1\u0bb4\u0bc1\u0baa\u0bcd\u0baa\u0bc6\u0baf\u0bb0\u0bcd', te: '\u0c2a\u0c42\u0cb0\u0ccd\u0ca4\u0cbf \u0c2a\u0c47\u0cb0\u0cc1', kn: '\u0caa\u0cc2\u0cb0\u0ccd\u0ca3 \u0cb9\u0cc6\u0cb8\u0cb0\u0cc1', ml: '\u0d2a\u0d42\u0d7c\u0d23\u0d4d\u0d23 \u0d2a\u0d47\u0d30\u0d4d' },
  Phone: { hi: '\u092b\u094b\u0928', ta: '\u0ba4\u0bca\u0bb2\u0bc8\u0baa\u0bc7\u0b9a\u0bbf', te: '\u0c2b\u0c4b\u0ca8\u0ccd', kn: '\u0cab\u0ccb\u0ca8\u0ccd', ml: '\u0d2b\u0d4b\u0d7a' },
  Logout: { hi: '\u0932\u0949\u0917\u0906\u0909\u091f', ta: '\u0bb5\u0bc6\u0bb3\u0bbf\u0baf\u0bc7\u0bb1\u0bc1', te: '\u0c32\u0c3e\u0c17\u0c4d\u0c06\u0c09\u0c1f\u0c4d', kn: '\u0cb2\u0cbe\u0c97\u0ccd\u0c86\u0c89\u0c9f\u0ccd', ml: '\u0d32\u0d4b\u0d17\u0d4c\u0d1f\u0d4d' },
  Refresh: { hi: '\u0930\u093f\u092b\u094d\u0930\u0947\u0936', ta: '\u0baa\u0bc1\u0ba4\u0bc1\u0baa\u0bcd\u0baa\u0bbf', te: '\u0c30\u0cbf\u0cab\u0ccd\u0cb0\u0cc6\u0c37\u0ccd', kn: '\u0cb0\u0cbf\u0cab\u0ccd\u0cb0\u0cc6\u0cb6\u0ccd', ml: '\u0d31\u0d3f\u0d2b\u0d4d\u0d30\u0d46\u0d37\u0d4d' },
  Estimate: { hi: '\u0905\u0928\u0941\u092e\u093e\u0928', ta: '\u0bae\u0ba4\u0bbf\u0baa\u0bcd\u0baa\u0bc0\u0b9f\u0bc1', te: '\u0c05\u0c02\u0c1a\u0ca8\u0c3e', kn: '\u0c85\u0c82\u0ca6\u0cbe\u0c9c\u0cc1', ml: '\u0d05\u0d28\u0d41\u0d2e\u0d3e\u0d28\u0d02' },
  Nearby: { hi: '\u0928\u091c\u0926\u0940\u0915', ta: '\u0b85\u0bb0\u0bc1\u0b95\u0bbf\u0bb2\u0bcd', te: '\u0c38\u0cae\u0cc0\u0caa', kn: '\u0cb9\u0ca4\u0ccd\u0ca4\u0cbf\u0cb0', ml: '\u0d38\u0d2e\u0d40\u0d2a\u0d02' },
  Book: { hi: '\u092c\u0941\u0915', ta: '\u0bae\u0bc1\u0ba9\u0bcd\u0baa\u0ba4\u0bbf\u0bb5\u0bc1', te: '\u0c2c\u0c41\u0c15\u0c4d', kn: '\u0cac\u0cc1\u0c95\u0ccd', ml: '\u0d2c\u0d41\u0d15\u0d4d' },
  'Passenger Dashboard': {
    hi: '\u092f\u093e\u0924\u094d\u0930\u0940 \u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921',
    ta: '\u0baa\u0baf\u0ba3\u0bbf \u0b9f\u0bbe\u0bb7\u0bcd\u0baa\u0bcb\u0bb0\u0bcd\u0b9f\u0bcd',
    te: '\u0c2a\u0c4d\u0cb0\u0cb5\u0c3e\u0ca3\u0cbf\u0c15\u0cc1\u0ca1\u0cbf \u0ca1\u0c3e\u0cb6\u0ccd\u0cac\u0ccb\u0cb0\u0ccd\u0ca1\u0ccd',
    kn: '\u0caa\u0ccd\u0cb0\u0caf\u0cbe\u0ca3\u0cbf\u0c95 \u0ca1\u0ccd\u0caf\u0cbe\u0cb7\u0ccd\u0cac\u0ccb\u0cb0\u0ccd\u0ca1\u0ccd',
    ml: '\u0d2f\u0d3e\u0d24\u0d4d\u0d30\u0d15\u0d4d\u0d15\u0d3e\u0d30\u0d28\u0d4d \u0d21\u0d3e\u0d37\u0d4d\u0d2c\u0d4b\u0d7c\u0d21\u0d4d',
  },
  'Driver Dashboard': {
    hi: '\u0921\u094d\u0930\u093e\u0907\u0935\u0930 \u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921',
    ta: '\u0b93\u0b9f\u0bcd\u0b9f\u0bc1\u0ba8\u0bb0\u0bcd \u0b9f\u0bbe\u0bb7\u0bcd\u0baa\u0bcb\u0bb0\u0bcd\u0b9f\u0bcd',
    te: '\u0c21\u0c4d\u0cb0\u0c48\u0cb5\u0c30\u0c4d \u0ca1\u0c3e\u0cb6\u0ccd\u0cac\u0ccb\u0cb0\u0ccd\u0ca1\u0ccd',
    kn: '\u0c9a\u0cbe\u0cb2\u0c95 \u0ca1\u0ccd\u0caf\u0cbe\u0cb7\u0ccd\u0cac\u0ccb\u0cb0\u0ccd\u0ca1\u0ccd',
    ml: '\u0d21\u0d4d\u0d30\u0d48\u0d35\u0d7c \u0d21\u0d3e\u0d37\u0d4d\u0d2c\u0d4b\u0d7c\u0d21\u0d4d',
  },
  'Admin Dashboard': {
    hi: '\u090f\u0921\u092e\u093f\u0928 \u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921',
    ta: '\u0ba8\u0bbf\u0bb0\u0bcd\u0bb5\u0bbe\u0b95 \u0b9f\u0bbe\u0bb7\u0bcd\u0baa\u0bcb\u0bb0\u0bcd\u0b9f\u0bcd',
    te: '\u0c05\u0c21\u0c4d\u0cae\u0cbf\u0ca8\u0ccd \u0ca1\u0c3e\u0cb6\u0ccd\u0cac\u0ccb\u0cb0\u0ccd\u0ca1\u0ccd',
    kn: '\u0ca8\u0cbf\u0cb0\u0ccd\u0cb5\u0cb9\u0c95 \u0ca1\u0ccd\u0caf\u0cbe\u0cb7\u0ccd\u0cac\u0ccb\u0cb0\u0ccd\u0ca1\u0ccd',
    ml: '\u0d05\u0d21\u0d4d\u0d2e\u0d3f\u0d7b \u0d21\u0d3e\u0d37\u0d4d\u0d2c\u0d4b\u0d7c\u0d21\u0d4d',
  },
  'Admin Control': {
    hi: '\u090f\u0921\u092e\u093f\u0928 \u0915\u0902\u091f\u094d\u0930\u094b\u0932',
    ta: '\u0ba8\u0bbf\u0bb0\u0bcd\u0bb5\u0bbe\u0b95 \u0b95\u0b9f\u0bcd\u0b9f\u0bc1\u0baa\u0bbe\u0b9f\u0bc1',
    te: '\u0c05\u0c21\u0c4d\u0cae\u0cbf\u0ca8\u0ccd \u0c15\u0c28\u0ccd\u0c1f\u0c4d\u0c30\u0c4b\u0cb2\u0ccd',
    kn: '\u0ca8\u0cbf\u0cb0\u0ccd\u0cb5\u0cb9\u0c95 \u0ca8\u0cbf\u0caf\u0c82\u0ca4\u0ccd\u0cb0\u0ca3',
    ml: '\u0d05\u0d21\u0d4d\u0d2e\u0d3f\u0d7b \u0d15\u0d23\u0d4d\u0d1f\u0d4d\u0d30\u0d4b\u0d7e',
  },
  Approve: { hi: '\u092e\u0902\u091c\u0942\u0930', ta: '\u0b92\u0baa\u0bcd\u0baa\u0bc1\u0ba4\u0bb2\u0bcd', te: '\u0c06\u0cae\u0ccb\u0ca6\u0cbf\u0c02\u0c1a\u0c41', kn: '\u0c85\u0ca8\u0cc1\u0cae\u0ccb\u0ca6\u0cbf\u0cb8\u0cc1', ml: '\u0d05\u0d02\u0d17\u0d40\u0d15\u0d30\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d15' },
  Reject: { hi: '\u0905\u0938\u094d\u0935\u0940\u0915\u093e\u0930', ta: '\u0ba8\u0bbf\u0bb0\u0bbe\u0b95\u0bb0\u0bbf', te: '\u0c24\u0cbf\u0cb0\u0cb8\u0ccd\u0c15\u0cb0\u0cbf\u0c02\u0c1a\u0c41', kn: '\u0ca4\u0cbf\u0cb0\u0cb8\u0ccd\u0c95\u0cb0\u0cbf\u0cb8\u0cc1', ml: '\u0d28\u0d3f\u0d30\u0d38\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d15' },
};

const PREFIX_TRANSLATIONS = [
  ['Language', /^Language:\s*(.+)$/],
  ['API', /^API:\s*(.+)$/],
  ['Hi', /^Hi,\s*(.+)$/],
  ['Status', /^Status:\s*(.+)$/],
  ['Driver ID', /^Driver ID:\s*(.+)$/],
  ['Submitted', /^Submitted:\s*(.+)$/],
];

const RUNTIME_TRANSLATIONS = {
  Language: { hi: '\u092d\u093e\u0937\u093e', ta: '\u0bae\u0bca\u0bb4\u0bbf', te: '\u0cad\u0c3e\u0c37', kn: '\u0cad\u0cbe\u0cb7\u0cc6', ml: '\u0d2d\u0d3e\u0d37' },
  API: { hi: '\u090f\u092a\u0940\u0906\u0908', ta: '\u0b8f\u0baa\u0bbf\u0b90', te: '\u0c0e\u0c2a\u0c3f\u0c10', kn: '\u0c8e\u0caa\u0cbf\u0c90', ml: '\u0d0e\u0d2a\u0d3f\u0d10' },
  Hi: { hi: '\u0928\u092e\u0938\u094d\u0924\u0947', ta: '\u0bb5\u0ba3\u0b95\u0bcd\u0b95\u0bae\u0bcd', te: '\u0c28\u0c2e\u0c38\u0c4d\u0c15\u0c3e\u0c30\u0c02', kn: '\u0ca8\u0cae\u0cb8\u0ccd\u0c95\u0cbe\u0cb0', ml: '\u0d28\u0d2e\u0d38\u0d4d\u0d15\u0d3e\u0d30\u0d02' },
  Status: { hi: '\u0938\u094d\u0925\u093f\u0924\u093f', ta: '\u0ba8\u0bbf\u0bb2\u0bc8', te: '\u0c38\u0ccd\u0ca5\u0cbf\u0ca4\u0cbf', kn: '\u0cb8\u0ccd\u0ca5\u0cbf\u0ca4\u0cbf', ml: '\u0d38\u0d4d\u0d25\u0d3f\u0d24\u0d3f' },
  'Driver ID': { hi: '\u0921\u094d\u0930\u093e\u0907\u0935\u0930 \u0906\u0908\u0921\u0940', ta: '\u0b93\u0b9f\u0bcd\u0b9f\u0bc1\u0ba8\u0bb0\u0bcd \u0b90\u0b9f\u0bbf', te: '\u0c21\u0c4d\u0cb0\u0c48\u0cb5\u0c30\u0c4d \u0c10\u0c21\u0c3f', kn: '\u0c9a\u0cbe\u0cb2\u0c95 \u0c90\u0ca1\u0cbf', ml: '\u0d21\u0d4d\u0d30\u0d48\u0d35\u0d7c \u0d10\u0d21\u0d3f' },
  Submitted: { hi: '\u091c\u092e\u093e', ta: '\u0b9a\u0bae\u0bb0\u0bcd\u0baa\u0bcd\u0baa\u0bbf\u0b95\u0bcd\u0b95\u0baa\u0bcd\u0baa\u0b9f\u0bcd\u0b9f\u0ba4\u0bc1', te: '\u0c38\u0c2e\u0cb0\u0ccd\u0c2a\u0c3f\u0c02\u0c1a\u0c2c\u0c21\u0cbf\u0c02\u0ca6\u0cbf', kn: '\u0cb8\u0cb2\u0ccd\u0cb2\u0cbf\u0cb8\u0cbf\u0ca6', ml: '\u0d38\u0d2e\u0d7c\u0d2a\u0d4d\u0d2a\u0d3f\u0d1a\u0d4d\u0d1a\u0d41' },
};

const ORIGINAL_TEXT = new WeakMap();
const ORIGINAL_PLACEHOLDER = new WeakMap();

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u0d7f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function t(key, lang) {
  if (!key || !lang || lang === 'en') return key;
  if (TEXT_TRANSLATIONS[key]?.[lang]) return TEXT_TRANSLATIONS[key][lang];
  if (RUNTIME_TRANSLATIONS[key]?.[lang]) return RUNTIME_TRANSLATIONS[key][lang];
  return key;
}

function translateDisplayText(value, lang) {
  if (!value || lang === 'en') return value;
  const raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const exact = t(trimmed, lang);
  if (exact !== trimmed) {
    return raw.replace(trimmed, exact);
  }

  for (const [prefixKey, pattern] of PREFIX_TRANSLATIONS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const translatedPrefix = t(prefixKey, lang);
    if (match[1]) {
      return raw.replace(trimmed, `${translatedPrefix}: ${match[1]}`);
    }
    return raw.replace(trimmed, translatedPrefix);
  }

  return raw;
}

function applyDomLanguage(lang) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (!document.body) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const parent = textNode.parentElement;
    const shouldSkip =
      !parent ||
      parent.closest('[data-no-translate="true"]') ||
      parent.tagName === 'SCRIPT' ||
      parent.tagName === 'STYLE';
    if (!shouldSkip) {
      if (!ORIGINAL_TEXT.has(textNode)) {
        ORIGINAL_TEXT.set(textNode, textNode.nodeValue || '');
      }
      const original = ORIGINAL_TEXT.get(textNode) || '';
      const translated = translateDisplayText(original, lang);
      if (textNode.nodeValue !== translated) {
        textNode.nodeValue = translated;
      }
    }
    textNode = walker.nextNode();
  }

  const placeholderNodes = document.querySelectorAll('input[placeholder], textarea[placeholder]');
  placeholderNodes.forEach((element) => {
    if (element.closest('[data-no-translate="true"]')) return;
    if (!ORIGINAL_PLACEHOLDER.has(element)) {
      ORIGINAL_PLACEHOLDER.set(element, element.getAttribute('placeholder') || '');
    }
    const original = ORIGINAL_PLACEHOLDER.get(element) || '';
    const translated = translateDisplayText(original, lang);
    if (element.getAttribute('placeholder') !== translated) {
      element.setAttribute('placeholder', translated);
    }
  });
}

function languageFromCommand(command) {
  if (command.includes('hindi')) return 'hi';
  if (command.includes('tamil')) return 'ta';
  if (command.includes('telugu')) return 'te';
  if (command.includes('kannada')) return 'kn';
  if (command.includes('malayalam')) return 'ml';
  if (command.includes('english')) return 'en';
  return null;
}

function clickButtonByLabels(labels) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const wanted = labels.map(normalize);
  const nodes = Array.from(document.querySelectorAll('[role="button"],button'));
  for (const node of nodes) {
    const text = normalize(node.textContent || '');
    if (!text) continue;
    if (wanted.some((label) => text.includes(label))) {
      node.click();
      return true;
    }
  }
  return false;
}

function runVoiceAction(command, setLanguageCode) {
  if (!command) return false;
  if (command.includes('stop voice') || command.includes('stop listening')) return 'stop';

  const langCode = languageFromCommand(command);
  if (langCode && command.includes('language')) {
    setLanguageCode(langCode);
    return true;
  }

  const intents = [
    { keys: ['login'], labels: ['login'] },
    { keys: ['register', 'sign up'], labels: ['register'] },
    { keys: ['password'], labels: ['password'] },
    { keys: ['otp'], labels: ['otp'] },
    { keys: ['google'], labels: ['google'] },
    { keys: ['send otp'], labels: ['send otp'] },
    { keys: ['verify otp'], labels: ['verify otp'] },
    { keys: ['resend otp'], labels: ['resend otp'] },
    { keys: ['refresh'], labels: ['refresh'] },
    { keys: ['logout', 'log out'], labels: ['logout'] },
    { keys: ['book ride', 'book now', 'create booking'], labels: ['book'] },
    { keys: ['estimate fare', 'estimate'], labels: ['estimate'] },
    { keys: ['nearby drivers', 'nearby'], labels: ['nearby'] },
    { keys: ['cancel ride'], labels: ['cancel ride', 'cancel'] },
    { keys: ['accept request', 'accept'], labels: ['accept'] },
    { keys: ['mark arrived'], labels: ['mark arrived'] },
    { keys: ['start ride'], labels: ['start trip', 'start ride'] },
    { keys: ['complete ride', 'end ride'], labels: ['complete trip', 'complete ride'] },
    { keys: ['approve'], labels: ['approve'] },
    { keys: ['reject'], labels: ['reject'] },
  ];

  for (const intent of intents) {
    if (intent.keys.some((key) => command.includes(key))) {
      return clickButtonByLabels(intent.labels);
    }
  }

  return false;
}

export default function WebCommandBar() {
  const isWeb = Platform.OS === 'web';
  const recognitionRef = useRef(null);
  const observerRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('');
  const [languageCode, setLanguageCode] = useState(() => {
    if (!isWeb || typeof window === 'undefined') return 'en';
    return window.localStorage.getItem('autobuddy_lang') || 'en';
  });

  const currentLanguage = useMemo(
    () => LANGUAGES.find((item) => item.code === languageCode) || LANGUAGES[0],
    [languageCode],
  );

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    window.localStorage.setItem('autobuddy_lang', languageCode);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', languageCode);
    }
    applyDomLanguage(languageCode);
  }, [isWeb, languageCode]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
    applyDomLanguage(languageCode);
    const observer = new MutationObserver(() => {
      applyDomLanguage(languageCode);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [isWeb, languageCode]);

  useEffect(() => {
    if (!isWeb || listening || typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = currentLanguage.speech;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = String(result?.[0]?.transcript || '');
      const command = normalize(transcript);
      const actionResult = runVoiceAction(command, setLanguageCode);
      if (actionResult === 'stop') {
        setListening(false);
        recognition.stop();
        setStatus('Voice stopped.');
        return;
      }
      if (actionResult) {
        setStatus(`Heard: "${transcript}"`);
      } else {
        setStatus(`No action for: "${transcript}"`);
      }
    };
    recognition.onerror = () => {
      setStatus('Voice error. Try again.');
    };
    recognition.onend = () => {
      if (!listening) return;
      try {
        recognition.lang = currentLanguage.speech;
        recognition.start();
      } catch {
        setListening(false);
      }
    };
    recognitionRef.current = recognition;
  }, [currentLanguage.speech, isWeb, listening]);

  useEffect(() => {
    if (!isWeb) return () => {};
    const recognition = recognitionRef.current;
    if (!recognition) return () => {};
    if (listening) {
      try {
        recognition.lang = currentLanguage.speech;
        recognition.start();
      } catch {
        // handled by toggle + onerror
      }
    } else {
      try {
        recognition.stop();
      } catch {
        // no-op
      }
    }
    return () => {
      try {
        recognition.stop();
      } catch {
        // no-op
      }
    };
  }, [currentLanguage.speech, isWeb, listening]);

  if (!isWeb) return null;

  const cycleLanguage = () => {
    const currentIndex = LANGUAGES.findIndex((item) => item.code === languageCode);
    const next = LANGUAGES[(currentIndex + 1) % LANGUAGES.length];
    setLanguageCode(next.code);
    setStatus(`Language: ${next.label}`);
  };

  const toggleListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus('Voice is not supported in this browser.');
      return;
    }
    if (listening) {
      setListening(false);
      setStatus('Voice stopped.');
      return;
    }
    setListening(true);
    setStatus('Voice listening...');
  };

  return (
    <View style={styles.wrap} dataSet={{ noTranslate: 'true' }}>
      <TouchableOpacity style={styles.btn} onPress={cycleLanguage}>
        <Text style={styles.btnText}>Language: {currentLanguage.label}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={toggleListening}>
        <Text style={styles.btnText}>{listening ? 'Stop Voice' : 'Start Voice'}</Text>
      </TouchableOpacity>
      {!!status && <Text style={styles.status}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8FB996',
    backgroundColor: '#E8F4EA',
    paddingVertical: 9,
    paddingHorizontal: 14,
    shadowColor: '#0A3D22',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  btnText: { color: '#195A2B', fontWeight: '800', fontSize: 14 },
  status: { color: '#5E6A5F', fontSize: 12, width: '100%', marginTop: 2 },
});
