# Deployment Guide - Running Your Bot 24/7

This guide covers various options for deploying your Discord bot to run continuously.

## Option 1: Railway (Recommended for Beginners) ⭐

**Free tier available** • Easy setup • Great for Discord bots

### Steps:

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add environment variables:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
6. Railway will auto-detect Node.js and start your bot
7. The bot will restart automatically if it crashes

### Configuration:

- Railway will detect your `package.json` and run `npm start`
- Your `package.json` already has the `start` script configured ✅

### Pricing:

**Trial Period:**

- $5 free credit (one-time, valid for 30 days)
- Perfect for testing and setup

**After Trial:**

- **Hobby Plan:** $5/month
  - Includes $5 in usage credits per month
  - For a Discord bot (~512MB RAM), this usually covers 24/7 operation
  - If you exceed $5 in usage, you pay additional (rare for Discord bots)

**Important:** Railway is NOT free forever. After the 30-day trial:

- You need to add a payment method
- $5/month minimum (Hobby plan)
- Most Discord bots stay within the $5 credit limit

---

## Option 2: Render

**Free tier available** • Similar to Railway

### Steps:

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Environment:** Node
6. Add environment variables in the dashboard
7. Deploy!

**Cost:** Free tier (spins down after 15min inactivity), $7/month for always-on

---

## Option 3: Replit (Free but Limited)

**Free** • Easy but less reliable

### Steps:

1. Go to [replit.com](https://replit.com)
2. Create new Repl → "Import from GitHub"
3. Add your `.env` file (or use Secrets tab)
4. Click "Run"
5. Use "Always On" feature (requires Replit Hacker plan)

**Cost:** Free (but unreliable), $7/month for "Always On"

---

## Option 4: DigitalOcean Droplet (More Control)

**$6/month** • Full control • More technical

### Steps:

1. Create account at [digitalocean.com](https://digitalocean.com)
2. Create a Droplet (Ubuntu 22.04)
3. SSH into your server
4. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
5. Clone your repository:
   ```bash
   git clone <your-repo-url>
   cd LocalRestockApp-Discord
   ```
6. Install dependencies:
   ```bash
   npm install
   ```
7. Create `.env` file:
   ```bash
   nano .env
   # Add your tokens
   ```
8. Install PM2 (process manager):
   ```bash
   sudo npm install -g pm2
   ```
9. Start bot with PM2:
   ```bash
   pm2 start src/index.js --name restock-bot
   pm2 save
   pm2 startup  # Follow instructions to enable auto-start on reboot
   ```

**Cost:** $6/month for basic droplet

---

## Option 5: Google Cloud Platform (GCP)

**Pay-as-you-go** • Reliable • More complex setup

### Steps:

1. Go to [cloud.google.com](https://cloud.google.com)
2. Create account (get $300 free credit for 90 days)
3. Create a new project
4. Enable Cloud Run API
5. Deploy via Cloud Run (containerized) or Compute Engine (VM)

### Cloud Run (Recommended for GCP):

1. Create `Dockerfile`:

   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   CMD ["node", "src/index.js"]
   ```

2. Deploy:
   ```bash
   gcloud run deploy restock-bot \
     --source . \
     --platform managed \
     --region us-central1 \
     --set-env-vars DISCORD_TOKEN=xxx,CLIENT_ID=xxx,GUILD_ID=xxx
   ```

**Cost:** Pay-as-you-go (~$0-5/month for Discord bot)
**Complexity:** Medium-High (requires Docker knowledge)

### Compute Engine (VM):

Similar to DigitalOcean - you get a VM and manage it yourself.

**Verdict:** GCP is reliable but overkill for a Discord bot. Railway/Render are much easier.

---

## Option 6: AWS/Azure

**Pay-as-you-go** • Enterprise-grade • Most complex

Similar to GCP - reliable but complex setup. AWS Lambda or EC2, Azure App Service or VM.

**Verdict:** Overkill for a Discord bot unless you need enterprise features.

---

## Best Practices for 24/7 Operation

### 1. Use a Process Manager (PM2) - Required for self-hosting

PM2 keeps your bot running even if it crashes:

```bash
# Install PM2 globally
npm install -g pm2

# Start your bot
pm2 start src/index.js --name restock-bot

# Make it start on server reboot
pm2 startup
pm2 save

# Useful commands:
pm2 list          # View running processes
pm2 logs          # View logs
pm2 restart all    # Restart bot
pm2 stop all      # Stop bot
pm2 monit         # Monitor resources
```

### 2. Environment Variables

**Never commit your `.env` file!** Always use:

- Platform's environment variable settings (Railway, Render, etc.)
- Or `.env` file on your server (not in git)

### 3. Error Handling

Your bot already has error handling, but make sure:

- Bot restarts on crash (PM2 or platform handles this)
- Logs errors for debugging
- Handles Discord API disconnections gracefully

### 4. Monitoring

Set up monitoring to know if your bot goes down:

- **Uptime Robot** (free): [uptimerobot.com](https://uptimerobot.com)

  - Monitors a webhook or URL
  - Sends alerts if bot goes down

- **Discord Status**: You can create a simple health check endpoint

### 5. Logging

Keep logs for debugging:

- Railway/Render show logs in dashboard
- PM2 logs: `pm2 logs restock-bot`
- Save logs to file: `pm2 logs restock-bot --log-date-format="YYYY-MM-DD HH:mm:ss" > bot.log`

### 6. Update Your Bot

When you need to update:

**Railway/Render:**

- Push to GitHub
- Platform auto-deploys

**Self-hosted (PM2):**

```bash
cd /path/to/bot
git pull
npm install
pm2 restart restock-bot
```

---

## Ease of Deployment Ranking

**From easiest to hardest:**

1. ⭐⭐⭐⭐⭐ **Railway** - Click deploy, done (5 minutes)
2. ⭐⭐⭐⭐ **Render** - Similar to Railway, slightly more config (10 minutes)
3. ⭐⭐⭐ **Replit** - Easy but less reliable (15 minutes)
4. ⭐⭐⭐ **DigitalOcean** - Requires SSH and commands (30 minutes)
5. ⭐⭐ **Google Cloud** - Requires Docker/CLI knowledge (1+ hour)
6. ⭐⭐ **AWS/Azure** - Most complex, enterprise-focused (2+ hours)

---

## Recommended Setup for Your Bot

### Easiest Option (Recommended):

**Railway** ⭐⭐⭐⭐⭐

- Literally: Connect GitHub → Add env vars → Deploy
- Takes 5 minutes
- $5/month after trial
- Auto-restarts on crash
- Built-in logging

### Second Easiest:

**Render** ⭐⭐⭐⭐

- Similar to Railway
- Slightly more configuration needed
- $7/month for always-on

### If You Want More Control:

**DigitalOcean Droplet** ⭐⭐⭐

- Full server access
- Need to install Node.js, PM2 yourself
- $6/month
- More technical but flexible

### For Enterprise/Scalability:

**Google Cloud Platform** ⭐⭐

- Very reliable
- Complex setup (Docker, CLI commands)
- Pay-as-you-go (~$0-5/month)
- Overkill for a simple Discord bot

**AWS/Azure** ⭐⭐

- Enterprise-grade
- Most complex
- Overkill for Discord bots

---

## Quick Checklist Before Deploying

- [x] `.env` file is in `.gitignore` ✅
- [x] `package.json` has `start` script ✅
- [ ] All environment variables are documented
- [ ] Bot handles errors gracefully
- [ ] Commands are deployed (`node deploy-commands.js`)
- [ ] Config file is set up correctly

---

## Troubleshooting

### Bot keeps crashing:

- Check logs: `pm2 logs` or Railway/Render logs
- Verify environment variables are set
- Check Discord token is valid

### Bot goes offline:

- Check hosting platform status
- Verify billing (if using paid tier)
- Check for error messages in logs

### Commands not working:

- Re-run `node deploy-commands.js`
- Check bot has proper permissions in Discord
- Verify bot is in your server

---

## Cost Comparison

| Platform     | Free Tier             | Paid      | Reliability | Ease       | Best For               |
| ------------ | --------------------- | --------- | ----------- | ---------- | ---------------------- |
| Railway      | ✅ $5 trial (30 days) | $5/mo\*   | ⭐⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐ | **Easiest deployment** |
| Render       | ✅ (15min timeout)    | $7/mo     | ⭐⭐⭐⭐    | ⭐⭐⭐⭐   | Easy alternative       |
| Replit       | ✅ (unreliable)       | $7/mo     | ⭐⭐        | ⭐⭐⭐     | Learning/testing       |
| DigitalOcean | ❌                    | $6/mo     | ⭐⭐⭐⭐⭐  | ⭐⭐⭐     | More control           |
| Google Cloud | ✅ $300 (90 days)     | Pay-as-go | ⭐⭐⭐⭐⭐  | ⭐⭐       | Enterprise/scalable    |
| AWS/Azure    | ❌                    | Pay-as-go | ⭐⭐⭐⭐⭐  | ⭐⭐       | Enterprise only        |

\* Railway's $5/month includes $5 usage credits - usually enough for Discord bots

---

## Need Help?

If you run into issues:

1. Check the logs first
2. Verify environment variables
3. Test locally before deploying
4. Check Discord Developer Portal for token issues
