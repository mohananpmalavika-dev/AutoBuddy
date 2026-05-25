# 🚀 AutoBuddy Deployment Setup Guide

Your repos is ready for auto-deployment. Follow these steps to connect your hosting providers and enable CI/CD.

## ✅ What's Ready
- ✓ GitHub repo: https://github.com/mohananpmalavika-dev/AutoBuddy
- ✓ Deployment workflows created in `.github/workflows/`
- ✓ `vercel.json` + `backend/.env.example` committed
- ✓ Your domain: `auto-buddy.in`

---

## 📋 Step-by-Step Setup

### **1️⃣ Setup Vercel (Frontend @ auto-buddy.in)**

1. Go to https://vercel.com and sign in
2. Create a new project:
   - Click "Add New..." → "Project"
   - Select `mohananpmalavika-dev/AutoBuddy` repo
   - **Root Directory:** `autobuddy-mobile/`
   - **Build Command:** `node ./node_modules/expo/bin/cli export --platform web`
   - **Output Directory:** `dist`
   - Click **Deploy**
3. After deploy, copy the **Project ID** and **Org ID**:
   - Go to Project Settings → General
   - Copy `projectId` and account name (Org ID)
4. Add GitHub Secrets to your repo:
   - Go to GitHub repo → Settings → Secrets and variables → Actions
   - Click "New repository secret" and add:
     ```
     VERCEL_TOKEN: vcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (get from Vercel account settings)
     VERCEL_ORG_ID: mgrad
     VERCEL_PROJECT_ID: <paste from Vercel>
     ```

**DNS Setup for Vercel:**
- In Vercel Project Settings → Domains
- Add domain `auto-buddy.in`
- Follow the CNAME/DNS steps to point your registrar

---

### **2️⃣ Setup Render (Backend @ api.auto-buddy.in)**

1. Go to https://render.com and sign in
2. Create a new **Web Service**:
   - Connect your GitHub repo
   - Select `mohananpmalavika-dev/AutoBuddy`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Free
   - **Environment Variables:** Add all from `.env.example`:
     ```
     MONGO_URL=<your-mongodb-atlas-url>
     DB_NAME=autobuddy_db
     JWT_SECRET=<generate-a-random-string-min-32-chars>
     JWT_REFRESH_SECRET=<generate-second-random-string-min-32-chars>
     FERNET_SECRET=<python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
     ENVIRONMENT=production
     DEFAULT_CITY_SPEED_KMPH=22
     AUTO_ASSIGN_MAX_RADIUS_KM=7
     OSRM_BASE_URL=https://router.project-osrm.org
     STRIPE_SECRET_KEY=sk_live_...
     UPI_PAYEE_VPA=autobuddy@upi
     UPI_PAYEE_NAME=AutoBuddy
     ALLOWED_ORIGINS=https://auto-buddy.in,https://www.auto-buddy.in
     # Optional but recommended for multi-instance reliability
     REDIS_URL=redis://<host>:<port>/0
     # Optional strict mode (fail startup when Redis is unavailable)
     # REQUIRE_REDIS_IN_PRODUCTION=true
     ```
3. After deployment, get the **Deploy Hook URL**:
   - Settings → Deploy Hook
   - Copy the URL
4. Add to GitHub Secrets:
   ```
   RENDER_DEPLOY_URL=<paste-your-deploy-hook-url>
   DOCKERHUB_USERNAME=<your-docker-username>
   DOCKERHUB_TOKEN=<your-docker-token>
   ```

**DNS Setup for Render:**
- In Render Service → Settings → Custom Domain
- Add `api.auto-buddy.in`
- Point CNAME to the Render service URL

---

### **3️⃣ Setup MongoDB Atlas (Database)**

1. Go to https://cloud.mongodb.com
2. Create a free **M0 cluster**:
   - Choose region (nearest to you)
   - Create
3. Create a **Database User**:
   - Security → Database Access → Add User
   - Username: `autobuddy_user`
   - Auto-generate password
4. Get **Connection String**:
   - Databases → Connect → Drivers → Copy connection string
   - Replace `<username>` and `<password>` with your DB user creds
5. Copy this as `MONGO_URL` in your Render environment

---

### **4️⃣ Setup Docker Hub (Optional, for image storage)**

1. Go to https://hub.docker.com and sign up
2. Create a new **Personal Access Token**:
   - Settings → Security → New Access Token
   - Copy token
3. Add to GitHub Secrets:
   ```
   DOCKERHUB_USERNAME=<your-username>
   DOCKERHUB_TOKEN=<your-token>
   ```

---

### **5️⃣ Configure DNS @ auto-buddy.in Registrar**

Log in to your domain registrar and add these DNS records:

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `<vercel-deployment-url>` |
| CNAME | `api` | `<render-service-url>` |

Or point nameservers to Cloudflare for easier management:
1. Create Cloudflare account
2. Add site `auto-buddy.in`
3. Copy Cloudflare nameservers to your registrar
4. Add DNS records in Cloudflare dashboard

---

### **6️⃣ GitHub Secrets Summary**

Add all these to **Settings → Secrets and variables → Actions:**

```yaml
# Vercel
VERCEL_TOKEN: vcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (get from Vercel account settings)
VERCEL_ORG_ID: mgrad
VERCEL_PROJECT_ID: <from-vercel>

# Render
RENDER_DEPLOY_URL: <your-render-deploy-hook>

# Docker
DOCKERHUB_USERNAME: <your-username>
DOCKERHUB_TOKEN: <your-token>

# Backend (optional in secrets if not in Render env vars)
MONGO_URL: mongodb+srv://...
JWT_SECRET: <generate-random>
```

---

## 🔄 Auto-Deploy Flow

Once configured, every push to `main` will:
1. **Frontend:** Trigger `.github/workflows/deploy-frontend.yml` → Deploy to Vercel
2. **Backend:** Trigger `.github/workflows/deploy-backend.yml` → Build Docker image + Deploy to Render

---

## 🧪 Test Your Deployment

```bash
# Test frontend
curl https://auto-buddy.in

# Test backend API
curl https://api.auto-buddy.in/docs
```

---

## 📝 Next Steps

- [ ] Create Vercel project & add secrets
- [ ] Create Render service & add deploy hook
- [ ] Create MongoDB Atlas cluster
- [ ] Configure DNS
- [ ] Push a test commit to trigger workflows
- [ ] Monitor deployment status in GitHub Actions & provider dashboards

---

## 🆘 Troubleshooting

**Workflow not triggering?**
- Check GitHub Secrets are set correctly
- Verify push is to `main` branch
- Check workflows paths (e.g., only frontend changes trigger frontend workflow)

**Deploy fails?**
- Check logs in Vercel / Render dashboards
- Verify environment variables are set
- Ensure DB connection string is correct

**DNS not resolving?**
- Wait 24-48 hours for propagation
- Verify CNAME records with: `nslookup auto-buddy.in`

---

Let me know when you've completed each step!
