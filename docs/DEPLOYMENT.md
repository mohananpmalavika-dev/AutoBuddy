Deploying AutoBuddy to free hosting (summary)

Overview
- Backend: build Docker image and deploy to a free container host (Fly.io recommended).
- Database: MongoDB Atlas free tier.
- Frontend: Cloudflare Pages (free) serving from repo; domain `auto-buddy.in` via Cloudflare.

Required accounts
- GitHub (repo + Actions)
- MongoDB Atlas (free cluster)
- Cloudflare (for DNS + Pages)
- Fly.io (or Railway/Render) for backend container (optional)
- Docker Hub (optional, for image storage)

High-level steps

1) Create MongoDB Atlas free cluster
- Sign in to https://cloud.mongodb.com and create a free shared cluster.
- Create a database user and copy the connection string.
- Allow access from your hosting IPs or temporarily allow 0.0.0.0/0 while testing.
- Set `DB_NAME=autorickshaw_db` (or your preferred name) and note the `MONGO_URL`.

2) Configure GitHub secrets
- Go to your repo Settings → Secrets → Actions and add:
  - `MONGO_URL` (Atlas connection string)
  - `DB_NAME` (optional, defaults to `autorickshaw_db`)
  - `JWT_SECRET` (secure random string)
  - `STRIPE_SECRET_KEY` (if you use Stripe)
  - `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (optional)
  - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME` (for Pages)

3) Backend deployment (suggested: Fly.io)
- Install `flyctl` locally and run `flyctl launch` in the repo root to create an app.
- Configure `MONGO_URL` and other env vars in Fly: `flyctl secrets set MONGO_URL="<uri>" DB_NAME="autorickshaw_db" JWT_SECRET="..."`
- Deploy with `flyctl deploy --config fly.toml`.

4) Frontend deployment (Cloudflare Pages)
- Create a Pages project in Cloudflare and connect to your GitHub repo.
- Set the build command to `npm run build` (run in `autobuddy-mobile`) and set output directory to the built public folder (for many Expo/Next setups this may vary).
- Add your domain `auto-buddy.in` to Cloudflare Pages and follow the domain verification steps.

5) DNS
- Point `auto-buddy.in` to Cloudflare nameservers (at the registrar).
- Configure a CNAME from `www` to your Pages subdomain (e.g. `your-project.pages.dev`) and create a Pages custom domain for the root (Cloudflare will guide you).

6) Final checks
- Ensure CORS: set `CORS_ORIGINS` in backend `.env` or GitHub secrets to include your frontend origin.
- Verify `MONGO_URL` and `DB_NAME` are present in runtime env for the backend.

Notes & next actions I can do
- I can create a `fly.toml` and a small GitHub Action to deploy with `flyctl` if you give me permission to add Fly secrets.
- I can provision step-by-step commands and exact Cloudflare Pages build output path after we confirm the frontend build output directory.

If you want, I can now:
- Create a `fly.toml` template and GitHub Action that runs `flyctl deploy` (you'll need to add `FLY_API_TOKEN` and `FLY_APP_NAME` to secrets).
- Or I can modify the Cloudflare Pages workflow to match the exact frontend build output once you confirm how the project builds (Expo Web, Next, or static). 
