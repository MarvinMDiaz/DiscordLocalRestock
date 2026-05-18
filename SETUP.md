# Discord Restock Bot - Setup Guide

This guide will help you deploy this bot to your Discord server.

## Prerequisites

- Node.js (v16 or higher)
- A Discord Bot Token
- Discord Developer Portal access
- Basic knowledge of Discord channels and roles

## Step 1: Bot Setup in Discord Developer Portal

1. Go to https://discord.com/developers/applications
2. Create a new application or select an existing one
3. Go to the "Bot" section
4. Create a bot and copy the **Bot Token**
5. Under "Privileged Gateway Intents", enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. Go to "OAuth2" > "URL Generator"
7. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
8. Select bot permissions:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
   - ✅ Use Slash Commands
   - ✅ Manage Messages (optional, for cleanup)
9. Copy the generated URL and invite the bot to your server

## Step 2: Get Discord IDs

To get Channel and Role IDs:

1. Enable Developer Mode in Discord:
   - User Settings → Advanced → Enable Developer Mode
2. Right-click on any channel → "Copy ID"
3. Right-click on any role → "Copy ID"

## Step 3: Configure the Bot

1. Copy `config/config.template.json` to `config/config.json`
2. Fill in all the IDs:

### Required Channel IDs:
- **restockApprovals**: Channel where approval messages will be posted
- **restockApprovalsMD**: Usually same as restockApprovals (or separate MD channel)
- **localRestockVA**: Channel for VA restock alerts
- **localRestockMD**: Channel for MD restock alerts

### Command Channel IDs (optional):
- Set specific channel IDs to restrict commands to those channels
- Leave as empty string `""` to allow commands anywhere
- Each command can have its own channel restriction

### Role IDs:
- **localRestockVA**: Role to mention for VA alerts
- **localRestockMD**: Role to mention for MD alerts
- **admin**: Role required for admin commands

### Store Lists:
- Update the `va` and `md` arrays with your store locations
- Format: `"Store Name - Address, City, State ZIP"`
- The address will be automatically extracted and displayed separately

## Step 4: Environment Variables

Create a `.env` file in the root directory:

```env
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=your_server_id_here
```

- **DISCORD_TOKEN**: Your bot token from Step 1
- **GUILD_ID**: Your Discord server ID (optional, for faster command deployment)

## Step 5: Install Dependencies

```bash
npm install
```

## Step 6: Deploy Commands

```bash
npm run deploy
```

Or deploy manually by running the deploy script:
```bash
node deploy-commands.js
```

## Step 7: Start the Bot

```bash
npm start
```

## Configuration Examples

### Single Approval Channel (All regions)
```json
{
  "channels": {
    "restockApprovals": "1234567890123456789",
    "restockApprovalsMD": "1234567890123456789",
    "localRestockVA": "9876543210987654321",
    "localRestockMD": "1111111111111111111"
  }
}
```

### Allow Commands Anywhere
```json
{
  "commandChannels": {
    "report_restock_va": "",
    "report_in_progress_va": "",
    "lookup_va_restocks": "",
    "report_restock_md": "",
    "restock_in_progress_md": "",
    "lookup_md_restocks": ""
  }
}
```

### Restrict Commands to Specific Channels
```json
{
  "commandChannels": {
    "report_restock_va": "1234567890123456789",
    "report_in_progress_va": "1234567890123456789",
    "lookup_va_restocks": "9876543210987654321",
    "report_restock_md": "1111111111111111111",
    "restock_in_progress_md": "1111111111111111111",
    "lookup_md_restocks": "2222222222222222222"
  }
}
```

## Troubleshooting

### Commands not appearing
- Make sure you ran `npm run deploy`
- Wait up to 1 hour for global command sync (or use GUILD_ID for instant)
- Re-invite the bot with `applications.commands` scope

### Channel/Role not found errors
- Verify all IDs in `config/config.json` are correct
- Make sure the bot has access to those channels/roles
- Check that IDs are strings (in quotes), not numbers

### Bot not responding
- Check `.env` file has correct `DISCORD_TOKEN`
- Verify bot is online in Discord
- Check console logs for errors

## Support

For issues or questions, check the bot logs in the console or review the configuration.

