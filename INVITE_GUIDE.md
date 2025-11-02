# 🤖 How to Invite Your Bot to a New Discord Server

Follow these steps to invite your bot to a new Discord server.

## Step 1: Go to Discord Developer Portal

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Log in with your Discord account
3. Select your bot application (or create a new one if you haven't already)

## Step 2: Get Your Bot's Client ID

1. In your application dashboard, go to the **"General Information"** tab (or "OAuth2" → "General")
2. Copy your **Client ID** (you'll need this)
3. Your Client ID is a long number (17-19 digits)

## Step 3: Generate Invite URL

### Option A: Using URL Generator (Recommended)

1. Go to **"OAuth2"** → **"URL Generator"** in the left sidebar
2. Under **"SCOPES"**, select:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Under **"BOT PERMISSIONS"**, select these permissions:
   - ✅ **Send Messages**
   - ✅ **Embed Links**
   - ✅ **Read Message History**
   - ✅ **Use Slash Commands**
   - ✅ **Attach Files** (for photos)
   - ✅ **Manage Messages** (optional, for cleanup)
   - ✅ **Mention Everyone** (for role mentions)
4. Copy the generated URL at the bottom (it will look like: `https://discord.com/api/oauth2/authorize?client_id=...`)

### Option B: Manual URL (Quick Method)

If you know your Client ID, you can use this URL format:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025508416&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your actual Client ID.

**Permission Value Explanation:**
- `277025508416` includes: Send Messages, Embed Links, Read History, Use Slash Commands, Attach Files, Mention Everyone

## Step 4: Enable Required Intents

**Important:** Before inviting, make sure your bot has the required intents enabled:

1. Go to **"Bot"** section in the left sidebar
2. Scroll down to **"Privileged Gateway Intents"**
3. Enable:
   - ✅ **Server Members Intent** (required for user lookups and member fetching)
   - ✅ **Message Content Intent** (required for reading messages)

**Note:** These are privileged intents that require verification for bots in 100+ servers, but they're needed for the bot to work properly.

## Step 5: Invite the Bot

1. Copy the invite URL from Step 3
2. Paste it into your browser
3. Select the Discord server you want to invite the bot to
4. Click **"Authorize"**
5. Complete any CAPTCHA if prompted

## Step 6: Verify Bot Permissions

After inviting:

1. Go to your Discord server
2. Go to **Server Settings** → **Integrations** → **Bots**
3. Find your bot and click on it
4. Verify it has the correct permissions:
   - Send Messages
   - Embed Links
   - Read Message History
   - Use Slash Commands
   - Attach Files
   - Mention Everyone

## Step 7: Configure Bot Settings

Once the bot is in your server:

1. **Set up roles:**
   - Create or identify your admin role
   - Make sure the bot can mention roles (check role permissions)

2. **Update configuration:**
   - Use `/admin_setup_config quick_setup` to configure all channel and role IDs
   - Or manually edit `config/config.json`

3. **Deploy commands:**
   ```bash
   npm run deploy
   ```
   Or if you have a new GUILD_ID:
   ```bash
   node deploy-commands.js
   ```

## Troubleshooting

### Bot doesn't appear in server:
- Check if you completed the authorization
- Verify the bot was invited successfully
- Check Server Settings → Members to see if bot is there

### Commands not showing up:
- Wait 1-2 minutes for Discord to sync commands
- Run `npm run deploy` to deploy commands
- Try restarting Discord app
- Check bot has "Use Slash Commands" permission

### Bot can't send messages:
- Check channel permissions
- Verify bot has "Send Messages" permission
- Check if bot role is above the channel's permission settings

### Bot can't mention roles:
- Make sure bot role is above the role it's trying to mention
- Verify "Mention Everyone" permission is enabled
- Check role hierarchy in Server Settings → Roles

## Quick Invite URL Template

If you know your Client ID, use this URL (replace `YOUR_CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025508416&scope=bot%20applications.commands
```

This includes all necessary permissions:
- Send Messages
- Embed Links  
- Read Message History
- Use Slash Commands
- Attach Files
- Mention Everyone

## After Inviting

1. ✅ Bot should appear in your server's member list
2. ✅ Update your `.env` file with new `GUILD_ID` (if different)
3. ✅ Run `/admin_setup_config quick_setup` to configure IDs
4. ✅ Deploy commands: `npm run deploy`
5. ✅ Test with `/admin_setup_config view` to verify setup

---

**Need Help?** Check the bot logs or verify all IDs are correct in `config/config.json`.

