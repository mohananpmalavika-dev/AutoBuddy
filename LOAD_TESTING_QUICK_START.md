# AutoBuddy Load Testing - Quick Start Guide

**Last Updated**: May 29, 2026

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Install Locust

```bash
# Install in virtual environment
cd backend
pip install locust locust[modern-ui]
```

### Step 2: Get Tokens (Copy these from login responses)

```bash
# Terminal 1 - Start backend
cd backend
python start_dev.py

# Terminal 2 - Get admin token
curl -X POST http://localhost:8000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@autobuddy.com","password":"admin_pass"}'

# Copy the token and add to load_test.py line 28
```

### Step 3: Update Tokens

Edit `backend/load_test.py`:
```python
ADMIN_TOKEN = "your_token_here"
DRIVER_TOKEN = "your_token_here"
PASSENGER_TOKEN = "your_token_here"
```

### Step 4: Run Load Test (Web UI - Easiest)

```bash
cd backend
locust -f load_test.py

# Open browser: http://localhost:8089
# Enter:
#   Number of users: 100
#   Spawn rate: 10
#   Run time: 5m
# Click "Start swarming"
```

### Step 5: Monitor Results

- **Response Time**: Should stay <500ms
- **Failure Rate**: Should stay near 0%
- **Requests/sec**: Increases initially, stabilizes

---

## 📊 Quick Load Test Results

### Baseline Test (100 Users, 5 Minutes)

```
Expected Results:
✅ Total Requests: ~25,000
✅ Success Rate: >99.9%
✅ Response Time (p95): <300ms
✅ Throughput: ~80 req/sec
✅ Error Rate: <0.1%
```

### Moderate Load (500 Users, 10 Minutes)

```
Expected Results:
✅ Total Requests: ~150,000
✅ Success Rate: >99%
✅ Response Time (p95): <500ms
✅ Throughput: ~250 req/sec
✅ Error Rate: <0.5%
```

### Heavy Load (1000+ Users)

```
Expected Results:
⚠️ Total Requests: ~400,000+
⚠️ Success Rate: >95%
⚠️ Response Time (p95): <1000ms
⚠️ Throughput: >500 req/sec
⚠️ System may show degradation
```

---

## 🎯 Load Test Profiles

### Profile 1: Lightweight (Baseline)
```bash
locust -f load_test.py \
  --users=100 \
  --spawn-rate=10 \
  --run-time=5m
```
**Duration**: 5 minutes | **Users**: 100 | **Use Case**: Daily sanity check

### Profile 2: Standard (Typical)
```bash
locust -f load_test.py \
  --users=500 \
  --spawn-rate=50 \
  --run-time=10m
```
**Duration**: 10 minutes | **Users**: 500 | **Use Case**: Pre-deployment verification

### Profile 3: Heavy (Stress)
```bash
locust -f load_test.py \
  --users=1000 \
  --spawn-rate=100 \
  --run-time=5m
```
**Duration**: 5 minutes | **Users**: 1000 | **Use Case**: Peak hour simulation

### Profile 4: Extreme (Breaking Point)
```bash
locust -f load_test.py \
  --users=5000 \
  --spawn-rate=500 \
  --run-time=2m
```
**Duration**: 2 minutes | **Users**: 5000 | **Use Case**: Find breaking point

---

## 📈 Reading the Web UI Dashboard

### Main Metrics

1. **Users**: Current number of active users
2. **Requests/sec**: Throughput (requests per second)
3. **Failures/sec**: Error rate
4. **Response times**: Min/Max/Average/p50/p95/p99

### Interpreting Charts

**Chart 1: Requests/Second**
- Should show gradual ramp-up to target
- Should plateau at sustained load
- Should drop when users disconnect

**Chart 2: Response Time**
- Should remain relatively flat
- Sharp increases = bottleneck
- Spikes = resource contention

**Chart 3: Number of Users**
- Should follow spawn rate
- Should reach target and plateau
- Should show decline at end

### Per-Endpoint View

Shows performance for each API endpoint:
- **Endpoint**: API path
- **Count**: Number of requests
- **Average**: Average response time (ms)
- **Min**: Minimum response time (ms)
- **Max**: Maximum response time (ms)
- **Median**: Median response time (ms)
- **p95**: 95th percentile response time (ms)
- **p99**: 99th percentile response time (ms)
- **Error**: Number of errors
- **Failure %**: Error rate percentage

---

## 🔍 Analyzing Results

### If Response Time is HIGH

**Symptoms**:
- Response time increasing linearly
- p95 > 500ms, p99 > 1000ms

**Causes**:
- Database bottleneck
- Slow queries
- Insufficient connection pool
- CPU/Memory exhaustion

**Solutions**:
```bash
# Check database performance
EXPLAIN ANALYZE SELECT ...

# Check connection pool
SELECT count(*) FROM pg_stat_activity

# Monitor system resources
top  # Linux
Get-Process | Select-Object -First 5  # PowerShell
```

### If Error Rate is HIGH

**Symptoms**:
- Failure % > 1%
- Specific endpoints failing

**Causes**:
- Resource exhaustion
- Database connection limit
- Application bug
- External service timeout

**Solutions**:
```bash
# Check backend logs
tail -f backend.log

# Verify database is accessible
psql -U user -d database -h localhost

# Check resource usage
free -h  # Memory
df -h    # Disk
```

### If Throughput is LOW

**Symptoms**:
- Requests/sec not increasing
- System using low CPU/Memory

**Causes**:
- I/O bound (network/disk)
- Single-threaded bottleneck
- Rate limiting
- External API latency

**Solutions**:
```bash
# Add caching
# Optimize queries
# Increase worker processes
# Implement async operations
```

---

## ✅ Load Test Checklist

Before deployment, run:

- [ ] **Baseline Test** (100 users, 5 min)
  - Expected: <300ms p95 response time
  - Baseline for future comparisons

- [ ] **Standard Load** (500 users, 10 min)
  - Expected: <500ms p95 response time
  - Typical production load

- [ ] **Peak Load** (1000 users, 5 min)
  - Expected: <1000ms p95 response time
  - Handle spike during peak hours

- [ ] **Soak Test** (300 users, 30 min)
  - Expected: Stable response times
  - Memory not leaking

- [ ] **WebSocket Test** (500 connections, 1 min)
  - Expected: >99% connection success
  - <200ms p95 latency

All tests passing? ✅ Ready for production!

---

## 📊 Sample Results

### ✅ PASS - Good Performance

```
Test: 500 users, 10 minutes

Metrics:
✅ Total Requests: 125,000
✅ Success Rate: 99.95%
✅ Error Rate: 0.05%
✅ Average Response Time: 125ms
✅ p95 Response Time: 275ms
✅ p99 Response Time: 650ms
✅ Requests/sec: 208
✅ Peak CPU: 45%
✅ Peak Memory: 300MB

Endpoints Performance:
  POST /passenger/ride/search:    avg=89ms   p95=150ms
  POST /passenger/ride/book:      avg=150ms  p95=350ms
  GET /driver/ride/requests:      avg=75ms   p95=120ms
  POST /driver/ride/accept:       avg=200ms  p95=450ms
  GET /admin/analytics:           avg=500ms  p95=1000ms

Status: ✅ PASS
Recommendation: Ready for production
```

### ⚠️ CAUTION - Acceptable but Monitor

```
Test: 500 users, 10 minutes

Metrics:
⚠️ Total Requests: 110,000
⚠️ Success Rate: 99.0%
⚠️ Error Rate: 1.0%
⚠️ Average Response Time: 250ms
⚠️ p95 Response Time: 600ms
⚠️ p99 Response Time: 1500ms
⚠️ Requests/sec: 183
⚠️ Peak CPU: 70%
⚠️ Peak Memory: 450MB

Status: ⚠️ CAUTION
Recommendation: 
- Optimize slow endpoints
- Increase server resources
- Monitor in production closely
```

### ❌ FAIL - Critical Issues

```
Test: 500 users, 10 minutes

Metrics:
❌ Total Requests: 75,000
❌ Success Rate: 85.0%
❌ Error Rate: 15.0%
❌ Average Response Time: 800ms
❌ p95 Response Time: 2500ms
❌ p99 Response Time: 5000ms
❌ Requests/sec: 125
❌ Peak CPU: 95%
❌ Peak Memory: 900MB

Errors:
- Connection timeout: 45%
- Database timeout: 30%
- Resource exhausted: 25%

Status: ❌ FAIL
Recommendation: 
- STOP: Do not deploy
- Debug: Check database performance
- Optimize: Queries and resource usage
- Re-test: After fixes
```

---

## 🛠️ Common Issues & Fixes

### Issue: "Connection refused"

```bash
# Check if backend running
curl http://localhost:8000/docs

# If not:
cd backend
python start_dev.py
```

### Issue: "Authentication failed"

```bash
# Regenerate tokens
# Update load_test.py with new tokens
# Restart test
```

### Issue: "Very high latency (>5 seconds)"

```bash
# Check database
psql -c "SELECT * FROM pg_stat_statements 
         ORDER BY mean_exec_time DESC LIMIT 5"

# Check system resources
free -h
top
```

### Issue: "Test stops unexpectedly"

```bash
# Check for memory issues
dmesg | grep "killed"

# Check backend logs
tail -f backend.log

# Reduce user count and retry
```

---

## 📈 Performance Improvement Tips

1. **Database Optimization**
   - Add indexes on frequently queried columns
   - Use EXPLAIN ANALYZE to find slow queries
   - Implement query caching

2. **Caching Layer**
   - Add Redis for session/data caching
   - Cache frequently accessed endpoints
   - Implement cache invalidation strategy

3. **Horizontal Scaling**
   - Run multiple backend instances
   - Use load balancer (NGINX, HAProxy)
   - Enable auto-scaling based on load

4. **Code Optimization**
   - Profile hot paths
   - Remove N+1 queries
   - Use async operations
   - Optimize JSON serialization

5. **Infrastructure**
   - Increase server resources (CPU, RAM)
   - Use SSD instead of HDD
   - Improve network bandwidth
   - Deploy closer to users (CDN)

---

## 🚀 Next Steps

1. ✅ Run baseline test (100 users, 5 min)
2. ✅ Document baseline metrics
3. ✅ Run standard load test (500 users, 10 min)
4. ✅ Identify bottlenecks
5. ✅ Optimize identified issues
6. ✅ Re-run tests to verify improvements
7. ✅ Document final metrics
8. ✅ Prepare for production deployment

---

## 📞 Support

**Need Help?**

1. Check [LOAD_TESTING_GUIDE.md](LOAD_TESTING_GUIDE.md) for detailed guide
2. Review [Locust Documentation](https://docs.locust.io/)
3. Check backend logs: `tail -f backend/logs/*.log`
4. Monitor system resources: `htop` or Task Manager

---

**Ready? Start with Profile 1 (Lightweight) → Then Profile 2 (Standard) 🚀**

