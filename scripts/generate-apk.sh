#!/bin/bash

# AutoBuddy APK Generation Script
# Generates a preview APK for distribution during beta testing

set -e

echo "🚀 Starting AutoBuddy APK Build..."
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI not found. Installing..."
    npm install -g eas-cli
fi

# Navigate to mobile directory
cd "$(dirname "$0")/../autobuddy-mobile"

echo "📦 Building APK with EAS..."
echo "Profile: preview (for beta testing)"
echo ""

# Build APK for preview (beta testing)
eas build --platform android --profile preview

echo ""
echo "✅ APK build complete!"
echo ""
echo "📱 Next steps:"
echo "1. Download the APK from the EAS build link"
echo "2. Host it on auto-buddy.in or provide download link to testers"
echo "3. Users can scan QR code or click direct download link"
echo "4. Before June 1st: Testers use APK"
echo "5. After June 1st: Release on Play Store"
echo ""
