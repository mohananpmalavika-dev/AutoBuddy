# Security Configuration Guide

## Table of Contents
- [Quick Start](#quick-start)
- [Generating Secrets](#generating-secrets)
- [Environment Setup](#environment-setup)
- [Production Checklist](#production-checklist)
- [Secret Rotation](#secret-rotation)
- [AWS Secrets Manager Setup](#aws-secrets-manager-setup)
- [Security Best Practices](#security-best-practices)

---

## Quick Start

### Step 1: Generate Secure Secrets

```bash
cd backend
python scripts/generate_secrets.py --output .env.generated
```

This generates:
- `JWT_SECRET` - Access token signing key
- `JWT_REFRESH_SECRET` - Refresh token signing key
- `FERNET_SECRET` - Data encryption key
- `ADMIN_API_KEY` - Admin API access key

### Step 2: Copy to .env Files

```bash
# Backend
cp .env.example .env
# Manually add generated secrets to .env

# Frontend
cd ../autobuddy-mobile
cp .env.example .env
# Add your API URL and Google Maps key
```

### Step 3: Secure Cleanup

```bash
# Securely delete generated secrets file
del /P backend\.env.generated  # Windows
# or
shred -u backend/.env.generated  # Linux/Mac
```

### Step 4: Verify Configuration

```bash
cd backend
python -c "from dotenv import load_dotenv; import os; load_dotenv(); print('JWT_SECRET length:', len(os.getenv('JWT_SECRET', '')))"
# Should print: JWT_SECRET length: 43+ characters
```

---

## Generating Secrets

### Method 1: Using Python Script (Recommended)

```bash
cd backend
python scripts/generate_secrets.py
```

### Method 2: Manual Generation

#### JWT Secrets (Python)

```python
import secrets
jwt_secret = secrets.token_urlsafe(32)
jwt_refresh_secret = secrets.token_urlsafe(32)
print(f"JWT_SECRET={jwt_secret}")
print(f"JWT_REFRESH_SECRET={jwt_refresh_secret}")
```

#### Fernet Key (Python)

```python
from cryptography.fernet import Fernet
fernet_secret = Fernet.generate_key().decode()
print(f"FERNET_SECRET={fernet_secret}")
```

#### Using OpenSSL (Linux/Mac)

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate hex key
openssl rand -hex 32
```

#### Using PowerShell (Windows)

```powershell
# Generate secure random string
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

---

## Environment Setup

### Development Environment

```bash
# backend/.env
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=DEBUG
MONGO_URL=mongodb://localhost:27017/autobuddy_db
FEATURE_DATABASE_URL=postgresql://postgres:password@localhost:5432/autobuddy_features
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<generated-secret>
FERNET_SECRET=<generated-key>
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
```

### Staging Environment

```bash
# backend/.env (staging)
ENVIRONMENT=staging
DEBUG=false
LOG_LEVEL=INFO
LOG_JSON=true
MONGO_URL=mongodb+srv://user:pass@staging-cluster.mongodb.net/autobuddy_staging
FEATURE_DATABASE_URL=postgresql://user:pass@staging-db.region.rds.amazonaws.com:5432/autobuddy_staging
REDIS_URL=redis://staging-redis.cache.amazonaws.com:6379/0
JWT_SECRET=<strong-production-secret>
JWT_REFRESH_SECRET=<different-strong-secret>
FERNET_SECRET=<strong-fernet-key>
ALLOWED_ORIGINS=https://staging.autobuddy.app
SENTRY_DSN=<your-sentry-dsn>
SENTRY_ENVIRONMENT=staging
```

### Production Environment

**⚠️ CRITICAL: Use AWS Secrets Manager or HashiCorp Vault in production**

```bash
# backend/.env (production)
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=WARNING
LOG_JSON=true

# Use AWS Secrets Manager
USE_AWS_SECRETS_MANAGER=true
AWS_REGION=us-east-1

# Database URLs (can also be in Secrets Manager)
MONGO_URL=mongodb+srv://user:pass@prod-cluster.mongodb.net/autobuddy_prod
FEATURE_DATABASE_URL=postgresql://user:pass@prod-db.region.rds.amazonaws.com:5432/autobuddy_prod
REDIS_URL=redis://prod-redis.cache.amazonaws.com:6379/0

# Production safety flags
REQUIRE_REFRESH_SECRET_IN_PRODUCTION=true
REQUIRE_FERNET_SECRET_IN_PRODUCTION=true
REQUIRE_REDIS_IN_PRODUCTION=true

# CORS (HTTPS only!)
ALLOWED_ORIGINS=https://autobuddy.app,https://www.autobuddy.app,https://app.autobuddy.app

# Monitoring
SENTRY_DSN=<your-sentry-dsn>
SENTRY_ENVIRONMENT=production
SENTRY_TRACE_SAMPLE_RATE=0.1
ENABLE_METRICS=true
```

---

## Production Checklist

Before deploying to production, verify:

### ✅ Secrets
- [ ] All secrets are 32+ characters
- [ ] JWT_SECRET and JWT_REFRESH_SECRET are different
- [ ] FERNET_SECRET is generated with Fernet.generate_key()
- [ ] No development/test secrets in production
- [ ] Secrets are stored in AWS Secrets Manager (not in .env)

### ✅ Environment Configuration
- [ ] `ENVIRONMENT=production`
- [ ] `DEBUG=false`
- [ ] `LOG_LEVEL=WARNING` or `ERROR`
- [ ] `LOG_JSON=true` for structured logging

### ✅ Database
- [ ] Using managed MongoDB (Atlas) with authentication
- [ ] Using managed PostgreSQL (RDS) with SSL
- [ ] Using managed Redis (ElastiCache) with encryption
- [ ] All database connections use SSL/TLS
- [ ] Database backups are automated

### ✅ CORS Configuration
- [ ] Only HTTPS origins in `ALLOWED_ORIGINS`
- [ ] No `localhost` or `127.0.0.1` in production CORS
- [ ] `ALLOW_CREDENTIALS=true` only if needed

### ✅ Security Headers
- [ ] HSTS enabled
- [ ] CSP configured
- [ ] X-Frame-Options set
- [ ] X-Content-Type-Options set

### ✅ Rate Limiting
- [ ] `ENABLE_RATE_LIMITING=true`
- [ ] Per-endpoint rate limits configured
- [ ] Redis-backed rate limiting for distributed systems

### ✅ Monitoring
- [ ] Sentry DSN configured
- [ ] Prometheus metrics enabled
- [ ] CloudWatch/ELK logging configured
- [ ] Alert rules created in Grafana/CloudWatch

### ✅ File Storage
- [ ] Using S3 for uploads (not local filesystem)
- [ ] S3 bucket has proper IAM policies
- [ ] S3 bucket encryption enabled

### ✅ Payment
- [ ] Using live Stripe keys (sk_live_..., pk_live_...)
- [ ] Stripe webhook secret configured
- [ ] Testing payment flows in Stripe test mode first

---

## Secret Rotation

### Rotation Schedule

| Secret | Frequency | Priority | Requires Downtime |
|--------|-----------|----------|-------------------|
| JWT_SECRET | Every 90 days | High | No* |
| JWT_REFRESH_SECRET | Every 90 days | High | No* |
| FERNET_SECRET | Every 180 days | Critical | Yes** |
| API Keys | Every 30 days | Medium | No |
| Database Passwords | Every 180 days | Critical | Yes |

*Requires careful planning to invalidate old tokens gracefully  
**Requires re-encryption of existing data

### JWT Secret Rotation Procedure

**Step 1: Add New Secret (No Downtime)**

```bash
# Add new secret alongside old one
JWT_SECRET=<old-secret>
JWT_SECRET_NEW=<new-secret>
```

**Step 2: Update Token Verification**

```python
# backend/app/core/auth.py
def verify_token(token: str):
    try:
        # Try new secret first
        return jwt.decode(token, JWT_SECRET_NEW, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        try:
            # Fall back to old secret
            return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            raise AuthenticationError("Invalid token")
```

**Step 3: Issue New Tokens with New Secret**

```python
# Use JWT_SECRET_NEW for all new tokens
def create_access_token(data: dict):
    return jwt.encode(data, JWT_SECRET_NEW, algorithm="HS256")
```

**Step 4: Wait for Old Tokens to Expire**

```bash
# Wait for JWT_ACCESS_TOKEN_EXPIRE_MINUTES (default: 60 minutes)
# Monitor metrics to ensure no authentication errors spike
```

**Step 5: Remove Old Secret**

```bash
# Replace JWT_SECRET with JWT_SECRET_NEW
JWT_SECRET=<new-secret>
# Remove JWT_SECRET_NEW
```

### Fernet Key Rotation (Data Re-encryption)

**⚠️ WARNING: This requires downtime and careful execution**

```bash
# Step 1: Backup database
mongodump --uri="<your-mongo-url>" --out=/backup/pre-rotation

# Step 2: Generate new Fernet key
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Step 3: Run data re-encryption script
python scripts/rotate_fernet_key.py \
  --old-key="<old-fernet-key>" \
  --new-key="<new-fernet-key>" \
  --batch-size=1000

# Step 4: Update environment variable
# FERNET_SECRET=<new-fernet-key>

# Step 5: Restart application

# Step 6: Verify re-encryption
python scripts/verify_encryption.py --key="<new-fernet-key>"
```

---

## AWS Secrets Manager Setup

### Step 1: Install AWS CLI

```bash
# Windows (PowerShell)
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Mac
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### Step 2: Configure AWS Credentials

```bash
aws configure
# AWS Access Key ID: <your-key>
# AWS Secret Access Key: <your-secret>
# Default region name: us-east-1
# Default output format: json
```

### Step 3: Create Secrets

```bash
# JWT Secret
aws secretsmanager create-secret \
  --name autobuddy/production/jwt-secret \
  --description "JWT access token signing key" \
  --secret-string "<your-jwt-secret>"

# JWT Refresh Secret
aws secretsmanager create-secret \
  --name autobuddy/production/jwt-refresh-secret \
  --description "JWT refresh token signing key" \
  --secret-string "<your-jwt-refresh-secret>"

# Fernet Key
aws secretsmanager create-secret \
  --name autobuddy/production/fernet-secret \
  --description "Fernet encryption key for sensitive data" \
  --secret-string "<your-fernet-key>"

# MongoDB URL
aws secretsmanager create-secret \
  --name autobuddy/production/mongodb-url \
  --description "MongoDB Atlas connection string" \
  --secret-string "<your-mongo-url>"

# PostgreSQL URL
aws secretsmanager create-secret \
  --name autobuddy/production/postgresql-url \
  --description "PostgreSQL RDS connection string" \
  --secret-string "<your-postgres-url>"

# Stripe Secret Key
aws secretsmanager create-secret \
  --name autobuddy/production/stripe-secret-key \
  --description "Stripe live secret key" \
  --secret-string "<your-stripe-key>"
```

### Step 4: Create IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:autobuddy/production/*"
      ]
    }
  ]
}
```

### Step 5: Attach Policy to EC2/ECS Role

```bash
aws iam attach-role-policy \
  --role-name AutoBuddyBackendRole \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/AutoBuddySecretsAccess
```

### Step 6: Update Backend Code

Create `backend/app/core/secrets.py`:

```python
import os
import boto3
import json
from functools import lru_cache
from typing import Optional

@lru_cache()
def get_secret(secret_name: str, default: Optional[str] = None) -> str:
    """Fetch secret from AWS Secrets Manager or environment variable."""
    
    # In development, use environment variables
    if os.getenv("ENVIRONMENT") != "production" or not os.getenv("USE_AWS_SECRETS_MANAGER"):
        value = os.getenv(secret_name)
        if value:
            return value
        if default:
            return default
        raise ValueError(f"Secret {secret_name} not found in environment")
    
    # In production, use AWS Secrets Manager
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=os.getenv("AWS_REGION", "us-east-1")
    )
    
    try:
        response = client.get_secret_value(SecretId=f"autobuddy/production/{secret_name}")
        return response['SecretString']
    except Exception as e:
        if default:
            return default
        raise RuntimeError(f"Failed to fetch secret {secret_name}: {e}")

# Usage in config
JWT_SECRET = get_secret("jwt-secret")
JWT_REFRESH_SECRET = get_secret("jwt-refresh-secret")
FERNET_SECRET = get_secret("fernet-secret")
MONGO_URL = get_secret("mongodb-url")
FEATURE_DATABASE_URL = get_secret("postgresql-url")
STRIPE_SECRET_KEY = get_secret("stripe-secret-key")
```

---

## Security Best Practices

### 1. Never Commit Secrets to Git

```bash
# Check for secrets before committing
git diff --staged | grep -i "secret\|password\|key\|token"

# Use git-secrets to prevent accidental commits
git secrets --install
git secrets --register-aws
```

### 2. Use Different Secrets Per Environment

| Environment | Secret Source |
|-------------|---------------|
| Development | Local .env file (developer-specific) |
| Staging | AWS Secrets Manager (staging namespace) |
| Production | AWS Secrets Manager (production namespace) |

### 3. Implement Secret Scanning

```bash
# Install truffleHog for secret scanning
pip install truffleHog

# Scan repository for secrets
trufflehog --regex --entropy=True .
```

### 4. Minimum Secret Length

| Secret Type | Minimum Length |
|-------------|----------------|
| JWT Secrets | 32 characters (256 bits) |
| API Keys | 32 characters |
| Passwords | 16 characters (for automated systems) |
| Fernet Keys | 44 characters (Fernet generates 32 bytes base64) |

### 5. Secret Storage

✅ **DO:**
- Use AWS Secrets Manager or HashiCorp Vault
- Encrypt secrets at rest
- Use IAM roles for secret access
- Audit secret access logs
- Rotate secrets regularly

❌ **DON'T:**
- Store secrets in .env files in production
- Commit secrets to git
- Share secrets via email/Slack
- Hardcode secrets in application code
- Reuse secrets across environments

### 6. Access Control

```bash
# Principle of least privilege
# Only production instances should access production secrets

# Example IAM policy
{
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::ACCOUNT_ID:role/AutoBuddyProductionRole"
  },
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:autobuddy/production/*"
}
```

### 7. Monitoring and Alerts

Set up alerts for:
- Unauthorized secret access attempts
- Secret rotation failures
- Secrets nearing expiration
- Multiple failed authentication attempts

---

## Troubleshooting

### Issue: "JWT_SECRET is too short"

**Solution:**
```python
# Generate a new secret with proper length
import secrets
print(secrets.token_urlsafe(32))  # Generates 43-character string
```

### Issue: "Cannot connect to MongoDB"

**Solution:**
```bash
# Check MONGO_URL format
mongodb://username:password@host:port/database

# For MongoDB Atlas
mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Test connection
python -c "from pymongo import MongoClient; client = MongoClient('your-mongo-url'); print(client.server_info())"
```

### Issue: "Fernet decryption failed"

**Solution:**
```python
# Verify Fernet key is valid
from cryptography.fernet import Fernet
try:
    f = Fernet(b'your-fernet-key')
    print("Valid Fernet key")
except:
    print("Invalid Fernet key - regenerate with Fernet.generate_key()")
```

### Issue: "AWS Secrets Manager access denied"

**Solution:**
```bash
# Check IAM role has proper permissions
aws iam get-role-policy --role-name AutoBuddyBackendRole --policy-name SecretsAccess

# Verify secret exists
aws secretsmanager describe-secret --secret-id autobuddy/production/jwt-secret

# Test retrieval
aws secretsmanager get-secret-value --secret-id autobuddy/production/jwt-secret
```

---

## Additional Resources

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [Python cryptography library](https://cryptography.io/en/latest/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

**Last Updated:** July 9, 2026  
**Maintainer:** AutoBuddy DevOps Team
