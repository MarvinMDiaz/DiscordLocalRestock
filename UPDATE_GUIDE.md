# 🔄 How to Update Your Deployed Bot

This guide explains how to make changes to your bot after it's been deployed.

## Quick Update Workflow

### 1. **Make Changes Locally**
```bash
# Make your code changes
# Test locally first!
npm start
```

### 2. **Commit & Push to GitHub**
```bash
git add .
git commit -m "Description of changes"
git push origin main
```

### 3. **Deploy Updates**

The method depends on your hosting platform:

---

## Platform-Specific Update Methods

### 🚂 Railway (Automatic Deployment)

**Railway auto-deploys when you push to GitHub!**

1. **Push to GitHub** → Railway detects changes
2. **Railway rebuilds** → Automatically restarts bot
3. **Done!** → Bot updates with ~30 seconds downtime

**Manual Redeploy (if needed):**
- Go to Railway dashboard
- Click your service → "Deployments" tab
- Click "Redeploy" on latest deployment

**Force Redeploy:**
```bash
# Trigger a redeploy by pushing an empty commit
git commit --allow-empty -m "Trigger redeploy"
git push
```

---

### 🎨 Render (Automatic Deployment)

**Render auto-deploys when you push to GitHub!**

1. **Push to GitHub** → Render detects changes
2. **Render rebuilds** → Automatically restarts bot
3. **Done!** → Bot updates with ~30 seconds downtime

**Manual Redeploy:**
- Go to Render dashboard
- Click your service → "Manual Deploy" → "Deploy latest commit"

---

### 🖥️ Self-Hosted (DigitalOcean, VPS, etc.)

**Update via SSH:**

```bash
# SSH into your server
ssh user@your-server-ip

# Navigate to bot directory
cd /path/to/LocalRestockApp-Discord

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Restart bot with PM2
pm2 restart restock-bot

# Check logs to verify it's working
pm2 logs restock-bot
```

**Or use PM2's auto-reload:**
```bash
# PM2 will watch for file changes and auto-restart
pm2 start src/index.js --name restock-bot --watch
```

---

### ☁️ Google Cloud Platform / AWS / Azure

**Container-based (Cloud Run, ECS, etc.):**
```bash
# Build and push new image
docker build -t gcr.io/your-project/restock-bot .
docker push gcr.io/your-project/restock-bot

# Deploy new version (zero downtime)
gcloud run deploy restock-bot --image gcr.io/your-project/restock-bot
```

**VM-based (Compute Engine, EC2):**
- Same as self-hosted (SSH + git pull + restart)

---

## When to Redeploy Commands

**You need to redeploy commands (`npm run deploy`) when:**

✅ **Adding new slash commands**
✅ **Modifying command names**
✅ **Changing command options/parameters**
✅ **Changing command descriptions**

**You DON'T need to redeploy commands for:**

❌ **Changing command logic/behavior**
❌ **Fixing bugs**
❌ **Updating config.json**
❌ **Changing button workflows**
❌ **Updating embeds/messages**

---

## Update Workflow Checklist

### Before Updating:

- [ ] Test changes locally first
- [ ] Check for syntax errors
- [ ] Verify environment variables are set
- [ ] Review your changes

### During Update:

- [ ] Push changes to GitHub
- [ ] Wait for platform to deploy (Railway/Render auto-deploys)
- [ ] Or manually redeploy if self-hosted
- [ ] Redeploy commands if you changed command structure

### After Update:

- [ ] Check bot logs for errors
- [ ] Test the new functionality
- [ ] Verify bot is online in Discord
- [ ] Monitor for any issues

---

## Best Practices

### 1. **Test Locally First**

Always test your changes before deploying:

```bash
# Test locally
npm start

# Check for errors
# Test the functionality
# Then deploy
```

### 2. **Use Git Branches for Major Changes**

For big updates, use branches:

```bash
# Create a feature branch
git checkout -b feature/new-feature

# Make changes
# Test locally

# Merge when ready
git checkout main
git merge feature/new-feature
git push
```

### 3. **Incremental Updates**

Make small, incremental changes rather than huge updates:

- ✅ Small changes = Easy to debug if something breaks
- ❌ Large changes = Hard to find what went wrong

### 4. **Monitor Logs After Updates**

After deploying, watch the logs:

**Railway/Render:**
- Dashboard → Logs tab

**Self-hosted (PM2):**
```bash
pm2 logs restock-bot --lines 50
```

### 5. **Keep Backup of Config**

Before updating `config.json`:
```bash
# Backup config
cp config/config.json config/config.json.backup

# Make changes
# Test
# If issues, restore backup
```

### 6. **Document Changes**

Keep a changelog or use commit messages:

```bash
git commit -m "feat: Add upcoming restock feature"
git commit -m "fix: Resolve custom store name error"
git commit -m "docs: Update README"
```

---

## Common Update Scenarios

### Scenario 1: Adding a New Feature

```bash
# 1. Make code changes
# 2. Test locally
npm start

# 3. Commit and push
git add .
git commit -m "Add new feature"
git push

# 4. Platform auto-deploys (Railway/Render)
# OR manually restart (self-hosted)
pm2 restart restock-bot

# 5. If you added new commands:
npm run deploy
```

### Scenario 2: Fixing a Bug

```bash
# 1. Fix the bug
# 2. Test locally
npm start

# 3. Commit and push
git add .
git commit -m "fix: Resolve issue with X"
git push

# 4. Platform auto-deploys
# No need to redeploy commands for bug fixes
```

### Scenario 3: Updating Config Only

```bash
# 1. Edit config/config.json
# 2. Commit and push
git add config/config.json
git commit -m "Update channel IDs"
git push

# 3. Platform auto-deploys
# Bot will reload config automatically
# No restart needed (config is read on startup)
```

### Scenario 4: Updating Dependencies

```bash
# 1. Update package.json
npm install new-package@latest

# 2. Commit package.json and package-lock.json
git add package.json package-lock.json
git commit -m "Update dependencies"
git push

# 3. Platform auto-deploys
# Will reinstall dependencies automatically
```

---

## Troubleshooting Updates

### Bot Not Updating

**Railway/Render:**
- Check deployment logs for errors
- Verify GitHub connection is working
- Try manual redeploy

**Self-hosted:**
```bash
# Check if git pull worked
git status

# Check if bot restarted
pm2 list

# Check logs for errors
pm2 logs restock-bot
```

### Bot Crashes After Update

**Rollback to previous version:**

**Railway/Render:**
- Dashboard → Deployments → Find previous working deployment → Redeploy

**Self-hosted:**
```bash
# Revert to previous commit
git log  # Find previous commit hash
git checkout <previous-commit-hash>
pm2 restart restock-bot

# Or use git revert
git revert HEAD
git push
pm2 restart restock-bot
```

### Commands Not Appearing

**After updating command structure:**
```bash
# Redeploy commands
npm run deploy

# Wait up to 1 hour for global commands
# Or use GUILD_ID for instant deployment
```

### Config Changes Not Taking Effect

**Config is loaded on startup:**
- Update config.json
- Restart bot (platform will auto-restart after deploy)
- Or manually restart: `pm2 restart restock-bot`

---

## Quick Reference

### Railway/Render Update:
```bash
git add .
git commit -m "Your changes"
git push
# Auto-deploys in ~30 seconds
```

### Self-Hosted Update:
```bash
ssh user@server
cd /path/to/bot
git pull
npm install  # If dependencies changed
pm2 restart restock-bot
```

### Redeploy Commands:
```bash
npm run deploy
```

### View Logs:
- **Railway:** Dashboard → Logs
- **Render:** Dashboard → Logs
- **PM2:** `pm2 logs restock-bot`

---

## Pro Tips

1. **Use Environment Variables for Secrets**
   - Never commit `.env` files
   - Use platform's env var settings

2. **Set Up Monitoring**
   - Use Uptime Robot or similar
   - Get alerts if bot goes down

3. **Keep a Staging Server**
   - Test changes on a test server first
   - Deploy to production when stable

4. **Use Version Tags**
   ```bash
   git tag -a v1.0.0 -m "Version 1.0.0"
   git push origin v1.0.0
   ```

5. **Automate Updates**
   - Railway/Render auto-deploy from GitHub
   - Set up CI/CD for advanced workflows

---

## Summary

**The simplest update process:**

1. Make changes locally
2. Test locally
3. Commit and push to GitHub
4. Platform auto-deploys (or manually restart)
5. Redeploy commands if needed
6. Monitor logs
7. Done! ✅

**Most common workflow:**
- Push to GitHub → Auto-deploys → Test → Done
- Takes ~30 seconds of downtime
- No manual intervention needed (Railway/Render)

