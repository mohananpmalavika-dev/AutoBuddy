# PRODUCTION DEPLOYMENT GUIDE

## Pre-Deployment Checklist

### Configuration
- [ ] `ENVIRONMENT` set to "production"
- [ ] `DEBUG` set to "false"
- [ ] `JWT_SECRET_KEY` set (minimum 32 characters)
- [ ] `DATABASE_URL` properly configured
- [ ] All environment variables exported to `.env.production`

### Security
- [ ] JWT token expiration configured (recommend 24 hours)
- [ ] Database credentials stored in secure vault (not in code)
- [ ] API keys and secrets not in version control
- [ ] HTTPS enforced on all endpoints
- [ ] CORS properly configured for production domains
- [ ] Rate limiting enabled on sensitive endpoints

### Database
- [ ] PostgreSQL instance created and configured
- [ ] Database backups automated (daily minimum)
- [ ] Connection pool configured (recommend 20-40 connections)
- [ ] All migration scripts tested and applied
- [ ] Database indexes created:
  ```sql
  CREATE INDEX idx_rides_driver_id_created_at ON rides(driver_id, created_at);
  CREATE INDEX idx_bookings_passenger_id_created_at ON bookings(passenger_id, created_at);
  CREATE INDEX idx_support_tickets_status_assigned_to ON support_tickets(status, assigned_to);
  CREATE INDEX idx_ratings_user_id_created_at ON ratings(user_id, created_at);
  CREATE INDEX idx_audit_logs_user_id_action_type ON audit_logs(user_id, action_type);
  ```

### Backend Services
- [ ] Backend server running with production configuration
- [ ] Redis instance configured for caching and rate limiting
- [ ] Error tracking (Sentry) configured
- [ ] Structured logging enabled (JSON format)
- [ ] Health check endpoint responding
- [ ] API documentation generated (Swagger/OpenAPI)

### Monitoring & Logging
- [ ] Application monitoring set up (APM)
- [ ] Error tracking integration tested
- [ ] Log aggregation configured
- [ ] Health check alerts configured
- [ ] Performance baseline metrics captured

### Frontend
- [ ] Mobile app built for production (APK/IPA)
- [ ] Web app built with production optimizations
- [ ] TypeScript strict mode enabled
- [ ] No console errors or warnings
- [ ] Offline detection implemented
- [ ] Network error recovery tested

### Testing
- [ ] All critical endpoints tested in staging
- [ ] Payment flow tested end-to-end
- [ ] Authentication and authorization tested
- [ ] Real-time features tested
- [ ] Load test completed (minimum 100 concurrent users)
- [ ] Security audit completed

### DevOps
- [ ] Docker images built and tagged with version
- [ ] CI/CD pipeline configured
- [ ] Rollback procedure documented and tested
- [ ] Disaster recovery plan documented
- [ ] Scaling configuration set up

## Deployment Steps

### 1. Database Setup
```bash
# Create production database
createdb autobuddy_production

# Run migrations
alembic upgrade head

# Verify connection
psql -d autobuddy_production -c "SELECT 1"
```

### 2. Environment Configuration
Create `.env.production`:
```bash
# Server
ENVIRONMENT=production
DEBUG=false
HOST=0.0.0.0
PORT=8000

# Database
DATABASE_URL=postgresql://user:password@host:5432/autobuddy_production
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=40

# Security
JWT_SECRET_KEY=<generate-32-character-key>
JWT_EXPIRATION_HOURS=24

# Redis (for caching and rate limiting)
REDIS_URL=redis://:password@host:6379/0

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE=5
RATE_LIMIT_PAYMENT_REQUESTS_PER_MINUTE=10
RATE_LIMIT_API_REQUESTS_PER_MINUTE=100

# File Upload
MAX_UPLOAD_SIZE_MB=50
UPLOAD_DIRECTORY=/var/uploads

# Monitoring
SENTRY_DSN=<your-sentry-dsn>
ENABLE_METRICS=true
ENABLE_TRACING=false

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# API
API_TIMEOUT_SECONDS=30
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Payment
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Backend Deployment
```bash
# Using Docker
docker build -t autobuddy-backend:v1.0.0 .
docker tag autobuddy-backend:v1.0.0 your-registry/autobuddy-backend:v1.0.0
docker push your-registry/autobuddy-backend:v1.0.0

# Deploy to Kubernetes (example)
kubectl apply -f deployment.yaml
kubectl rollout status deployment/autobuddy-backend

# Or run directly
cd backend
pip install -r requirements.txt
gunicorn -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 server:app
```

### 4. Verification
```bash
# Check health endpoints
curl https://api.yourdomain.com/api/health/live
curl https://api.yourdomain.com/api/health/ready
curl https://api.yourdomain.com/api/health/production-checklist

# Test authentication
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Test key endpoints
curl https://api.yourdomain.com/api/admin/audit-log \
  -H "Authorization: Bearer <token>"
```

### 5. Mobile App Deployment

#### Android (Google Play Store)
```bash
# Build release APK
cd autobuddy-mobile
eas build --platform android --release

# Upload to Play Store
# Use Google Play Console
```

#### iOS (Apple App Store)
```bash
# Build release IPA
eas build --platform ios --release

# Upload to App Store
# Use Apple App Store Connect or Transporter
```

#### Web (Firebase Hosting)
```bash
# Build for production
npm run build:web

# Deploy
firebase deploy
```

## Post-Deployment Monitoring

### Daily Checks
- [ ] Monitor error rate (should be < 1%)
- [ ] Check API response times (should be < 500ms p95)
- [ ] Verify backup jobs completed
- [ ] Review audit logs for suspicious activity
- [ ] Monitor database performance
- [ ] Check error tracking for new issues

### Weekly Checks
- [ ] Review application logs
- [ ] Analyze performance metrics
- [ ] Check security alerts
- [ ] Verify scaling behavior
- [ ] Review user feedback

### Monthly Checks
- [ ] Database optimization
- [ ] Security audit
- [ ] Performance analysis
- [ ] Capacity planning
- [ ] Cost analysis

## Rollback Procedure

If deployment fails:

```bash
# Kubernetes rollback
kubectl rollout undo deployment/autobuddy-backend

# Or manual deployment of previous version
docker pull your-registry/autobuddy-backend:v0.9.0
# Update deployment to use previous image
kubectl set image deployment/autobuddy-backend \
  autobuddy=your-registry/autobuddy-backend:v0.9.0

# Verify rollback
kubectl rollout status deployment/autobuddy-backend
```

## Troubleshooting

### Database Connection Issues
```bash
# Test connection
psql -d autobuddy_production -c "SELECT 1"

# Check pool configuration
# Ensure DATABASE_POOL_SIZE is not too high
# Recommend: min=5, default=20, max=40
```

### High Memory Usage
```bash
# Reduce pool size
DATABASE_MAX_OVERFLOW=20
DATABASE_POOL_SIZE=10

# Enable memory monitoring
ENABLE_METRICS=true
```

### Slow API Responses
```bash
# Check database indexes
SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';

# Add missing indexes if needed
```

### Rate Limit Issues
```bash
# Adjust limits if needed
RATE_LIMIT_API_REQUESTS_PER_MINUTE=150
RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE=10

# Verify Redis connectivity
redis-cli PING
```

## Performance Optimization

### Database Query Optimization
```bash
# Enable query logging
# Check slow queries in postgres.log

# Run EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM rides WHERE driver_id = 'x';
```

### Cache Configuration
```bash
# Set appropriate TTLs
# Short-lived: 5-15 minutes
# Medium-lived: 1-24 hours
# Long-lived: 7+ days
```

### Load Balancing
```bash
# Use nginx as reverse proxy
# Configure upstream servers
upstream backend {
    server backend1:8000;
    server backend2:8000;
    server backend3:8000;
}
```

## Security Hardening

### SSL/TLS Configuration
```bash
# Generate certificate
certbot certonly --standalone -d api.yourdomain.com

# Configure nginx with SSL
listen 443 ssl http2;
ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
```

### API Key Rotation
- Implement quarterly key rotation
- Use secrets management (Vault, AWS Secrets Manager)
- Monitor API key usage

### Database Security
- Enable encrypted connections
- Use IAM authentication if available
- Restrict network access with firewall rules

## Support

For deployment issues:
1. Check health endpoints
2. Review application logs
3. Check error tracking (Sentry)
4. Review database performance
5. Contact DevOps team if critical

---

**Last Updated:** 2026-05-29  
**Version:** 1.0.0
