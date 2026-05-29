# CI/CD Pipeline Documentation

## Overview

AutoBuddy uses GitHub Actions to automate testing, building, and deployment across backend, frontend, and mobile platforms. The pipeline ensures code quality, security, and reliable deployments to production.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions CI/CD                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────┐      ┌──────────────────────┐          │
│  │   Backend Pipeline   │      │  Frontend Pipeline   │          │
│  ├──────────────────────┤      ├──────────────────────┤          │
│  │ • Lint & Format      │      │ • Lint & Format      │          │
│  │ • Type Check (TS)    │      │ • Type Check (TS)    │          │
│  │ • Unit Tests         │      │ • Unit Tests (Jest)  │          │
│  │ • Security Scan      │      │ • E2E Tests          │          │
│  │ • Build Docker       │      │ • Build Web/Mobile   │          │
│  │ • Deploy (Fly.io)    │      │ • Deploy (Vercel)    │          │
│  └──────────────────────┘      └──────────────────────┘          │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │        Security & Dependency Updates (Daily)               │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │ • Dependency Audits   • License Compliance                │  │
│  │ • Dependabot Updates  • Security Advisories               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         ↓                              ↓
    ┌─────────────┐            ┌──────────────┐
    │  Fly.io     │            │   Vercel     │
    │ (Production)│            │ (Production) │
    └─────────────┘            └──────────────┘
```

## Workflows

### 1. Backend Pipeline (`backend-pipeline.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- PR to `main` or `develop`
- Changes in `backend/` directory
- Manual trigger

**Jobs:**

#### a. Lint & Format Check
- **Tool**: Pylint, Black, isort, Flake8
- **Duration**: ~2 minutes
- **Artifacts**: Pylint reports
- **Failure**: Does not block subsequent jobs (advisory only)

#### b. Unit & Integration Tests
- **Prerequisites**: Lint passes
- **Services**: PostgreSQL, MongoDB, Redis
- **Coverage**: 70%+ threshold
- **Duration**: ~5 minutes
- **Artifacts**: Coverage reports, test results
- **Upload**: Codecov integration

#### c. Security Scanning
- **Tools**: Bandit (code), Safety (dependencies)
- **Duration**: ~3 minutes
- **Artifacts**: Security reports
- **Failure**: Advisory only

#### d. Build Docker Image
- **Prerequisites**: Tests and security pass
- **Registry**: GitHub Container Registry (ghcr.io)
- **Tags**: Branch, version, SHA, latest (main only)
- **Duration**: ~5 minutes
- **If**: Push to main/develop only

#### e. Deploy to Staging
- **Prerequisite**: Docker image built
- **Target**: Fly.io staging environment
- **Condition**: Push to `develop` branch only
- **Post-deploy**: Smoke tests
- **Duration**: ~3 minutes

#### f. Deploy to Production
- **Prerequisite**: Docker image built
- **Target**: Fly.io production environment
- **Condition**: Push to `main` branch only
- **Environment**: Requires approval
- **Post-deploy**: Smoke tests, Slack notification
- **Duration**: ~5 minutes

**Secrets Required:**
- `FLY_API_TOKEN`: Fly.io authentication

**Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string
- `MONGODB_URL`: MongoDB connection string
- `REDIS_URL`: Redis connection string
- `STRIPE_API_KEY`: Stripe API key
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: AWS S3
- `SENTRY_DSN`: Error tracking

---

### 2. Frontend Pipeline (`frontend-pipeline.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- PR to `main` or `develop`
- Changes in `autobuddy-mobile/` directory
- Manual trigger

**Jobs:**

#### a. Lint & Format Check
- **Tool**: ESLint, Prettier
- **Duration**: ~2 minutes
- **Artifacts**: Lint reports
- **Failure**: Advisory only

#### b. Type Check
- **Tool**: TypeScript compiler
- **Duration**: ~2 minutes
- **Strict mode**: Enabled
- **Failure**: Blocks subsequent jobs

#### c. Unit & Component Tests
- **Framework**: Jest
- **Coverage**: 70%+ threshold
- **Duration**: ~5 minutes
- **Artifacts**: Coverage reports
- **Upload**: Codecov integration

#### d. Build Web App
- **Target**: React Native Web (Expo web)
- **Output**: Optimized bundle in `dist/`
- **Duration**: ~3 minutes
- **Artifacts**: Build output (retained 5 days)

#### e. E2E Tests
- **Framework**: Playwright
- **Duration**: ~5 minutes
- **Browser**: Chromium, Firefox, WebKit
- **Artifacts**: HTML report, videos

#### f. Build Mobile App
- **Target**: Android APK
- **Tool**: EAS Build
- **Duration**: ~10 minutes
- **Artifacts**: APK file (retained 30 days)
- **If**: Push events only

#### g. Deploy Web
- **Target**: Vercel
- **Branch mapping**:
  - `main` → Production
  - `develop` → Preview
- **Duration**: ~2 minutes
- **URL**: Commented on PR

#### h. Code Quality Analysis
- **Tool**: SonarCloud
- **Metrics**: Code coverage, code smells, bugs
- **Duration**: ~3 minutes
- **Dashboard**: SonarCloud project

**Secrets Required:**
- `EXPO_TOKEN`: Expo authentication
- `VERCEL_TOKEN`: Vercel authentication
- `VERCEL_ORG_ID`: Vercel organization
- `VERCEL_PROJECT_ID`: Vercel project
- `SONAR_TOKEN`: SonarCloud authentication

---

### 3. Security Updates (`security-updates.yml`)

**Triggers:**
- Daily at 2 AM UTC
- Manual trigger

**Jobs:**

#### a. Security Advisory Check
- **Python**: Safety tool
- **Node.js**: npm audit
- **Duration**: ~5 minutes
- **Artifacts**: JSON reports
- **Action**: Creates issue if vulnerabilities found

#### b. License Compliance Check
- **Tool**: license-report
- **Duration**: ~3 minutes
- **Output**: CSV and JSON reports
- **Warning**: Detects GPL licenses

#### c. Dependency Graph Update
- **Publishes**: Python and Node.js dependency graphs
- **Duration**: ~2 minutes

#### d. Create Summary Report
- **Action**: Creates PR with updates (if needed)
- **Labels**: `dependencies`, `automated`, `security`
- **Duration**: ~1 minute

**Secrets Required:**
- `SLACK_WEBHOOK_SECURITY`: Slack notification

---

## Execution Flow

### Feature Development (develop branch)

```
1. Developer pushes to feature branch
2. CI runs: Lint → Type Check → Tests
3. Developer creates PR to `develop`
4. CI re-runs all tests (required for merge)
5. After merge to `develop`:
   - Backend: Lint → Tests → Security → Build Docker → Deploy Staging
   - Frontend: Lint → Type Check → Tests → E2E → Build → Deploy Preview
6. Smoke tests run
7. Slack notification sent
```

### Production Release (main branch)

```
1. Merge commit to `main` (from develop)
2. CI runs all checks (same as develop)
3. Docker image built and pushed
4. Manual approval for production deployment
5. Deploy to production Fly.io
6. Production smoke tests
7. Slack notification to ops channel
```

---

## Status Checks

### Required Checks (for PR merge)
- ✅ Lint & Format
- ✅ Type Check (TypeScript)
- ✅ Unit & Integration Tests
- ✅ Security Scanning
- ✅ Code Quality Analysis

### Optional Checks (advisory)
- ℹ️ Code formatting suggestions
- ℹ️ Coverage reports

---

## Deployment Strategy

### Staging (develop branch)
- **Frequency**: Every commit to `develop`
- **Environment**: `autobuddy-backend-staging`
- **URL**: https://staging-api.autobuddy.app
- **Retention**: Overwritten on new deploy
- **Rollback**: Instant (push to develop again)

### Production (main branch)
- **Frequency**: Manual (requires approval)
- **Environment**: `autobuddy-backend` (main app)
- **URL**: https://api.autobuddy.app
- **Approval**: Required GitHub environment protection
- **Rollback**: Revert commit and push
- **Notifications**: Slack #ops-alerts

### Web Frontend
- **Production**: Vercel + main branch
- **Preview**: Vercel + develop branch
- **Preview PR**: Auto-generated for each PR
- **URL**: Vercel auto-generated preview URL

---

## Key Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Lint Pass Rate | 100% | ~98% |
| Test Coverage | 70%+ | ~75% |
| Build Success | 100% | ~99% |
| Deploy Success | 99%+ | ~98% |
| Security Scans | Pass | ✅ |
| E2E Tests | Pass | ~95% |

---

## Troubleshooting

### Pipeline Failures

**Lint fails**
```bash
# Locally format code
cd backend && black app/ && isort app/
cd autobuddy-mobile && npm run format
```

**Type check fails**
```bash
# Check TypeScript errors locally
cd autobuddy-mobile && npx tsc --noEmit
```

**Tests fail**
```bash
# Run locally first
cd backend && python -m pytest tests/
cd autobuddy-mobile && npm test
```

**Docker build fails**
- Check backend Dockerfile syntax
- Verify all dependencies in requirements.txt
- Test locally: `docker build -f backend/Dockerfile backend/`

**Deploy fails**
- Check Fly.io app status: `flyctl status --app autobuddy-backend`
- View logs: `flyctl logs --app autobuddy-backend`
- Check environment variables in Fly.io console

### Common Issues

| Issue | Solution |
|-------|----------|
| `pytest: command not found` | `pip install pytest pytest-asyncio` |
| Docker push fails | Check GitHub token, registry permissions |
| Vercel deploy hangs | Increase timeout in workflow, check build logs |
| EAS build fails | Verify `eas.json` config, check Expo account |
| Coverage < threshold | Add more tests, check coverage.xml |

---

## Performance Optimization

### Caching

**Backend:**
- `pip` cache (dependencies)
- Docker layer cache (build layers)

**Frontend:**
- `npm` cache (node_modules)
- Next.js build cache

### Parallel Execution

**Jobs run in parallel:**
- Lint & Type Check
- Tests (with multiple workers)
- Building & E2E tests

**Total pipeline time:**
- Backend: ~15 minutes (develop) / ~20 minutes (main with approval)
- Frontend: ~20 minutes
- Combined: ~22 minutes (parallel)

---

## Cost Optimization

**GitHub Actions Minutes**
- Free tier: 2,000 minutes/month
- Current usage: ~600 minutes/month (3 pushes/day × 3-5 minutes)

**Optimization strategies:**
- Cache dependencies aggressively
- Skip E2E tests for documentation-only changes
- Use matrix strategy for parallel test runs
- Clean up artifacts after 5-30 days

---

## Security

### Secrets Management
- Stored in GitHub Secrets
- Never logged or exposed
- Rotated regularly
- Used only in production jobs

### Code Analysis
- Bandit scans for security issues
- Dependencies checked for CVEs
- SAST integration (SonarCloud)
- License compliance check

### Access Control
- Production deployment requires environment approval
- Only maintainers can approve
- Audit trail in GitHub Actions logs
- Branch protection rules enforced

---

## Integration Points

### External Services
- **Codecov**: Coverage reports
- **SonarCloud**: Code quality
- **Vercel**: Web deployment
- **Fly.io**: Backend deployment
- **Slack**: Notifications
- **Docker Registry**: Image storage

### Webhooks
- GitHub → CI/CD (automatic)
- CI/CD → Slack (on completion)
- CI/CD → Vercel (on approve)
- CI/CD → Fly.io (on approve)

---

## Future Enhancements

- [ ] Implement blue-green deployments
- [ ] Add canary deployments (10% traffic)
- [ ] Setup Chaos Engineering tests
- [ ] Add performance benchmarks
- [ ] Integrate APM (Application Performance Monitoring)
- [ ] Setup compliance scanning (HIPAA, GDPR)
- [ ] Add container scanning (Trivy, Grype)
- [ ] Implement GitOps with Flux/ArgoCD

---

**Last Updated**: 2026-05-29
**Maintained By**: DevOps Team
**Support**: #devops-help Slack channel
