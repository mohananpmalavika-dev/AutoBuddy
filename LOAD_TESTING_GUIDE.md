# AutoBuddy Load Testing - Complete Guide

**Date**: May 29, 2026  
**Objective**: Verify platform can handle production load  
**Status**: Ready for execution

---

## 📊 Load Testing Overview

Load testing validates that the AutoBuddy platform can:
- Handle concurrent users efficiently
- Maintain response times under load
- Prevent resource exhaustion
- Identify performance bottlenecks
- Verify graceful degradation

---

## 🎯 Load Test Scenarios

### Scenario 1: Ramp-Up Test (Gradual Load Increase)

**Purpose**: Baseline performance under gradually increasing load

**Configuration**:
```bash
locust -f load_test.py \
  --users=1000 \
  --spawn-rate=50 \
  --run-time=5m \
  --host=http://localhost:8000 \
  --csv=results/ramp_up
```

**Test Profile**:
- 50 new users every 2 seconds
- Reaches 1000 users in ~20 minutes
- Run sustained at 1000 users for 5 minutes
- Identifies linear performance degradation

**Expected Results**:
- Response time increases gradually
- Error rate remains <0.1%
- System remains stable throughout
- CPU usage <70%

**Success Criteria**:
✅ p95 response time <500ms at 1000 users
✅ Error rate <0.1%
✅ Memory stable (no leaks)
✅ Database connections pooled efficiently

---

### Scenario 2: Spike Test (Sudden Surge)

**Purpose**: Verify system handles traffic spikes

**Configuration**:
```bash
locust -f load_test.py \
  --users=5000 \
  --spawn-rate=500 \
  --run-time=2m \
  --host=http://localhost:8000 \
  --csv=results/spike
```

**Test Profile**:
- 500 new users every second
- Reaches 5000 users in ~10 seconds
- Monitor for 2 minutes
- Tests circuit breaker and queue mechanisms

**Expected Results**:
- Initial spike in response times
- Automatic scaling handles load
- Recovery to normal levels <30 seconds
- No cascading failures

**Success Criteria**:
✅ Peak response time <2 seconds
✅ Recovery time <30 seconds
✅ Error rate <1% during spike
✅ System stabilizes after spike

---

### Scenario 3: Sustained Load Test

**Purpose**: Verify stability over extended period

**Configuration**:
```bash
locust -f load_test.py \
  --users=500 \
  --spawn-rate=50 \
  --run-time=30m \
  --host=http://localhost:8000 \
  --csv=results/sustained
```

**Test Profile**:
- Constant 500 concurrent users
- 30-minute test duration
- Identifies memory leaks and degradation
- Tests database connection stability

**Expected Results**:
- Consistent response times throughout
- No memory leaks over 30 minutes
- Database connections remain stable
- Error rate minimal

**Success Criteria**:
✅ Average response time stable throughout
✅ Memory usage <500MB
✅ Database connections <50% of max
✅ Error rate <0.05%

---

### Scenario 4: Stress Test (Until Failure)

**Purpose**: Identify system breaking point

**Configuration**:
```bash
locust -f load_test.py \
  --users=10000 \
  --spawn-rate=200 \
  --host=http://localhost:8000 \
  --csv=results/stress \
  --headless
```

**Test Profile**:
- Continuous increase of users until failure
- 10,000+ concurrent users
- Monitor for failure points
- Identify resource limits

**Expected Results**:
- System starts failing after ~3000 users
- Clear error patterns emerge
- Graceful degradation observed
- Recovery possible after load reduction

**Success Criteria**:
✅ System handles up to 3000 concurrent users
✅ Graceful degradation after that point
✅ No cascading failures
✅ Recovery possible

---

### Scenario 5: Soak Test (Long Running)

**Purpose**: Identify long-term stability issues

**Configuration**:
```bash
locust -f load_test.py \
  --users=100 \
  --spawn-rate=10 \
  --run-time=8h \
  --host=http://localhost:8000 \
  --csv=results/soak \
  --headless
```

**Test Profile**:
- Realistic 100 concurrent users
- 8-hour test run (or until failure)
- Identifies memory leaks and connection issues
- Tests overnight stability

**Expected Results**:
- Consistent performance over 8 hours
- No memory leaks detected
- Connection pool remains healthy
- No gradual performance degradation

**Success Criteria**:
✅ No memory leaks over 8 hours
✅ Response times remain consistent
✅ <0.01% error rate
✅ Database connections stable

---

## 🚀 Setup & Execution

### Prerequisites

```bash
# 1. Install Locust in virtual environment
pip install locust locust[modern-ui]

# 2. Verify backend is running
cd backend
python start_dev.py  # In separate terminal

# 3. Create results directory
mkdir -p results
```

### Get Authentication Tokens

```bash
# 1. Get admin token
curl -X POST http://localhost:8000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@autobuddy.com","password":"admin_password"}'

# 2. Get driver token
curl -X POST http://localhost:8000/driver/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@autobuddy.com","password":"driver_password"}'

# 3. Get passenger token
curl -X POST http://localhost:8000/passenger/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"passenger@autobuddy.com","password":"passenger_password"}'
```

### Update load_test.py

Edit the token constants in load_test.py:

```python
ADMIN_TOKEN = "your_actual_admin_token"
DRIVER_TOKEN = "your_actual_driver_token"
PASSENGER_TOKEN = "your_actual_passenger_token"
BASE_URL = "http://localhost:8000"
```

### Run Load Tests

#### Option 1: Web UI (Interactive)

```bash
cd backend
locust -f load_test.py

# Open browser: http://localhost:8089
# Configure users, spawn rate, runtime in UI
# Click "Start swarming"
```

**Web UI Features**:
- Real-time metrics dashboard
- Per-endpoint statistics
- Charts and graphs
- Download results as CSV

#### Option 2: Command Line (Headless)

```bash
# Ramp-up test
locust -f load_test.py \
  --users=1000 \
  --spawn-rate=50 \
  --run-time=5m \
  --headless \
  --csv=results/ramp_up

# Spike test
locust -f load_test.py \
  --users=5000 \
  --spawn-rate=500 \
  --run-time=2m \
  --headless \
  --csv=results/spike

# Sustained test
locust -f load_test.py \
  --users=500 \
  --spawn-rate=50 \
  --run-time=30m \
  --headless \
  --csv=results/sustained

# Stress test
locust -f load_test.py \
  --users=10000 \
  --spawn-rate=200 \
  --headless \
  --csv=results/stress
```

---

## 📈 Performance Baselines

### Expected Performance Targets

| Metric | Target | Acceptable | Failing |
|--------|--------|-----------|---------|
| **Response Time (p95)** | <300ms | <500ms | >1000ms |
| **Response Time (p99)** | <500ms | <1000ms | >2000ms |
| **Error Rate** | <0.01% | <0.1% | >1% |
| **Throughput** | >1000 req/s | >500 req/s | <100 req/s |
| **Concurrent Users** | 1000+ | 500+ | <100 |
| **CPU Usage** | <50% | <70% | >90% |
| **Memory Usage** | <300MB | <500MB | >1000MB |
| **Database Connections** | <50 | <100 | >200 |

### Benchmark Results (Expected with Optimal Setup)

```
Scenario: 500 concurrent users, sustained for 10 minutes

Requests:
  Total: 250,000
  Per second: 416 req/s
  Success rate: 99.95%

Response Times (ms):
  Min: 10
  Max: 2,500
  Average: 150
  p50: 120
  p90: 250
  p95: 350
  p99: 800

Resource Usage:
  CPU: 45%
  Memory: 250MB
  Database Connections: 25/100
  WebSocket Connections: 500/5000
```

---

## 🔍 Key Performance Indicators (KPIs)

### 1. Response Time

**Measurement**: Time from request to response

```
Excellent:  <200ms average
Good:       200-500ms average
Acceptable: 500-1000ms average
Poor:       >1000ms average
```

**How to Improve**:
- Optimize database queries (add indexes)
- Implement caching (Redis)
- Use CDN for static content
- Optimize API payload size
- Implement pagination

### 2. Error Rate

**Measurement**: Percentage of failed requests

```
Excellent:  <0.01%
Good:       0.01-0.1%
Acceptable: 0.1-1%
Poor:       >1%
```

**How to Improve**:
- Increase database connection pool
- Add circuit breaker for external APIs
- Implement retry logic with backoff
- Add request queuing
- Increase server resources

### 3. Throughput

**Measurement**: Requests per second

```
Excellent:  >1000 req/s
Good:       500-1000 req/s
Acceptable: 100-500 req/s
Poor:       <100 req/s
```

**How to Improve**:
- Horizontal scaling (more instances)
- Load balancing
- Connection pooling
- Async/await optimization
- Database optimization

### 4. Resource Utilization

**Measurement**: CPU, Memory, Connections

```
CPU Usage:
  Optimal:    <50%
  Good:       50-70%
  Caution:    70-85%
  Overload:   >85%

Memory Usage:
  Optimal:    <300MB
  Good:       300-500MB
  Caution:    500-800MB
  Overload:   >800MB

Database Connections:
  Optimal:    <50/max
  Good:       50-75/max
  Caution:    75-90/max
  Overload:   >90/max
```

---

## 📊 Load Test Analysis

### Reading Results

After test completion, analyze:

1. **Response Time Trends**
   - Should be relatively flat during sustained load
   - Should return to baseline after load decrease
   - Spikes indicate bottlenecks

2. **Error Rate Patterns**
   - Should remain near zero
   - Spikes indicate resource exhaustion
   - Specific errors indicate bugs

3. **Resource Usage**
   - CPU should scale with users (roughly linear)
   - Memory should stabilize (not growing unbounded)
   - Connections should scale proportionally

4. **Endpoint Performance**
   - Compare performance across endpoints
   - Identify slowest endpoints
   - Investigate specific bottlenecks

### Example Results Analysis

```
RESULTS INTERPRETATION:

If response times are stable throughout:
✅ Good: System scales linearly
✅ Good: No resource limits hit
✅ Good: Database performing well

If response times increase gradually:
⚠️ Warning: Possible memory leak
⚠️ Warning: Database connections growing
✗ Action: Profile and optimize

If error rate spikes at specific user count:
✗ Critical: Resource exhaustion point found
✗ Action: Increase resources or optimize
✗ Action: Implement auto-scaling

If CPU stays low but response times high:
✗ Critical: I/O bound issue (database/network)
✗ Action: Optimize database queries
✗ Action: Add caching layer
```

---

## 🎯 Success Criteria

### Pass Requirements (All Must Pass)

✅ **Response Time**: p95 <500ms at 500 concurrent users
✅ **Error Rate**: <0.1% throughout all tests
✅ **Throughput**: >500 req/s maintained
✅ **Stability**: Performance consistent over 30 minutes
✅ **Recovery**: System recovers quickly after load decrease
✅ **Graceful Degradation**: Handles overload without crashing
✅ **No Memory Leaks**: Memory stable over extended test
✅ **Resource Usage**: CPU <70%, Memory <500MB

### Fail Criteria (Any Failure = Test Failed)

❌ Response time p95 >1000ms
❌ Error rate >1%
❌ System crash or hang
❌ Memory leak detected
❌ Database connection exhaustion
❌ Cascading failures observed
❌ Recovery >5 minutes after overload

---

## 🛠️ Troubleshooting

### Issue: "Connection refused"

```bash
# Check if backend is running
curl http://localhost:8000/docs

# If not, start backend
cd backend
python start_dev.py
```

### Issue: "Authentication failed"

```bash
# Verify tokens are correct
# Re-generate tokens using login endpoints
# Update tokens in load_test.py
```

### Issue: "High error rate"

```bash
# Check backend logs for errors
# Verify database connections
# Check system resources (CPU, Memory)
# Reduce concurrent users and retry
```

### Issue: "Response time very high"

```bash
# Profile slow endpoints
# Check database query performance
# Look for blocking operations
# Add logging to identify bottleneck
```

---

## 📝 Test Report Template

```
AUTOBUDDY LOAD TEST REPORT
==========================

Test Date: [DATE]
Test Duration: [DURATION]
Test Scenario: [SCENARIO NAME]

CONFIGURATION:
- Base URL: [URL]
- Concurrent Users: [N]
- Spawn Rate: [N] users/sec
- Test Duration: [TIME]
- User Distribution: [BREAKDOWN]

RESULTS SUMMARY:
- Total Requests: [N]
- Successful Requests: [N] ([%])
- Failed Requests: [N] ([%])
- Total Errors: [N]

RESPONSE TIME METRICS:
- Min: [Nms]
- Max: [Nms]
- Average: [Nms]
- p50: [Nms]
- p95: [Nms]
- p99: [Nms]

RESOURCE USAGE:
- Peak CPU: [N%]
- Peak Memory: [NMB]
- Peak DB Connections: [N/MAX]
- Peak WebSocket Connections: [N/MAX]

ENDPOINT BREAKDOWN:
[TABLE OF ENDPOINT PERFORMANCE]

OBSERVATIONS:
- [KEY FINDING 1]
- [KEY FINDING 2]
- [KEY FINDING 3]

BOTTLENECKS IDENTIFIED:
- [BOTTLENECK 1]
- [BOTTLENECK 2]

RECOMMENDATIONS:
- [RECOMMENDATION 1]
- [RECOMMENDATION 2]

PASS/FAIL: [PASS/FAIL]

NOTES:
[ADDITIONAL NOTES]
```

---

## 🔄 Continuous Load Testing

For production monitoring, consider:

1. **Scheduled Tests**
   - Daily smoke test: 100 users for 5 minutes
   - Weekly full test: 1000 users for 30 minutes
   - Monthly stress test: 5000 users

2. **Alerting**
   - Alert if response time >500ms (p95)
   - Alert if error rate >0.1%
   - Alert if throughput drops >20%

3. **Regression Detection**
   - Compare results against baseline
   - Detect performance regressions early
   - Trigger investigation if performance decreases

---

## ✅ Next Steps

1. ✅ Setup Locust environment
2. ✅ Obtain authentication tokens
3. ✅ Run Scenario 1: Ramp-up test
4. ✅ Analyze results
5. ✅ Run Scenario 2: Spike test
6. ✅ Run Scenario 3: Sustained test
7. ✅ Document findings
8. ✅ Optimize based on results
9. ✅ Re-run tests to verify improvements
10. ✅ Prepare for production deployment

---

## 📚 References

- **Locust Documentation**: https://docs.locust.io/
- **Load Testing Best Practices**: https://en.wikipedia.org/wiki/Load_testing
- **Performance Testing**: https://www.perfmatrix.com/performance-testing/
- **Load Testing Patterns**: https://martinfowler.com/articles/load-test-patterns.html

---

**Ready to start load testing? Begin with Scenario 1: Ramp-up Test** 🚀

