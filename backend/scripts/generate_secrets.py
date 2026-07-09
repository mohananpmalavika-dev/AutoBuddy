#!/usr/bin/env python3
"""
Generate secure secrets for AutoBuddy configuration.

Usage:
    python generate_secrets.py
    python generate_secrets.py --output .env.generated
"""

import argparse
import secrets
from cryptography.fernet import Fernet


def generate_jwt_secret(length: int = 32) -> str:
    """Generate a secure JWT secret."""
    return secrets.token_urlsafe(length)


def generate_fernet_key() -> str:
    """Generate a Fernet encryption key."""
    return Fernet.generate_key().decode()


def generate_api_key(length: int = 32) -> str:
    """Generate a secure API key."""
    return secrets.token_hex(length)


def main():
    parser = argparse.ArgumentParser(description="Generate secure secrets for AutoBuddy")
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Output file path (default: print to stdout)"
    )
    args = parser.parse_args()

    # Generate secrets
    jwt_secret = generate_jwt_secret(32)
    jwt_refresh_secret = generate_jwt_secret(32)
    fernet_secret = generate_fernet_key()
    admin_api_key = generate_api_key(32)

    # Create output content
    output = f"""# ============================================================================
# Auto-generated Secrets for AutoBuddy
# Generated on: {__import__('datetime').datetime.now().isoformat()}
# ============================================================================
# IMPORTANT: 
#   1. Copy these values to your .env file
#   2. Delete this file after copying
#   3. NEVER commit this file to version control
# ============================================================================

# JWT Authentication Secrets
JWT_SECRET={jwt_secret}
JWT_REFRESH_SECRET={jwt_refresh_secret}

# Encryption Key (for sensitive data at rest)
FERNET_SECRET={fernet_secret}

# Admin API Key
ADMIN_API_KEY={admin_api_key}

# ============================================================================
# HOW TO USE:
# ============================================================================
# 1. Copy the values above to your backend/.env file
# 2. Update any other required environment variables in .env
# 3. Securely delete this file:
#    - Windows: del /P {args.output or '.env.generated'}
#    - Linux/Mac: shred -u {args.output or '.env.generated'}
# 4. In production, use AWS Secrets Manager or HashiCorp Vault instead
# ============================================================================

# SECURITY NOTES:
# ============================================================================
# - JWT_SECRET: Used to sign access tokens (30+ chars minimum)
# - JWT_REFRESH_SECRET: Used to sign refresh tokens (should be different)
# - FERNET_SECRET: Used to encrypt sensitive data like payment info
# - ADMIN_API_KEY: Used for internal admin API access
# 
# ROTATION SCHEDULE:
# - JWT secrets: Rotate every 90 days
# - FERNET_SECRET: Rotate every 180 days (requires data re-encryption)
# - API keys: Rotate every 30 days or immediately if compromised
# ============================================================================
"""

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"✅ Secrets generated and saved to: {args.output}")
        print(f"⚠️  IMPORTANT: Copy to .env and then securely delete {args.output}")
    else:
        print(output)
        print("\n✅ Secrets generated successfully!")
        print("⚠️  IMPORTANT: Copy these values to your .env file")
        print("🔒 NEVER commit these secrets to version control")


if __name__ == "__main__":
    main()
