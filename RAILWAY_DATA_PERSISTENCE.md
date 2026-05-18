# Railway Data Persistence Setup

## ⚠️ Important: Railway Ephemeral Filesystem

Railway uses an **ephemeral filesystem** by default, which means:
- Files in your project directory are **reset on every deployment**
- Your `data/restocks.json` file gets wiped clean each time you deploy
- This is why restock history disappears after updates

## ✅ Solution: Persistent Volume

I've created a `railway.toml` file that configures a persistent volume for the `data/` directory.

### Setup Steps:

1. **In Railway Dashboard:**
   - Go to your project → Settings → Volumes
   - Click "Add Volume"
   - Name: `data-volume`
   - Mount Path: `/app/data`
   - Click "Add"

2. **Redeploy your service:**
   - Railway will automatically use the `railway.toml` configuration
   - The `data/` directory will now persist between deployments

### Alternative: Use Railway PostgreSQL (Recommended for Production)

For more reliable data persistence, consider using Railway's PostgreSQL database:

1. **Add PostgreSQL to your Railway project:**
   - Go to your project → "New" → "Database" → "Add PostgreSQL"
   - Railway will provide connection variables automatically

2. **Update the bot to use PostgreSQL:**
   - Install: `npm install pg`
   - Modify `dataManager.js` to use PostgreSQL instead of JSON files
   - This provides better reliability and doesn't require volume management

## 🔍 Current Status

The `railway.toml` file is configured, but you need to:
1. Create the volume in Railway dashboard
2. Redeploy your service

After this, your restock history will persist across deployments!

## 📝 Notes

- The volume persists data even when the service restarts
- Backups are still created in `data/backups/` directory
- If you switch to PostgreSQL later, you can keep the volume for backward compatibility


