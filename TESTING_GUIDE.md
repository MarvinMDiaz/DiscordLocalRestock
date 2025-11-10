# Testing Environment Setup Guide

This guide explains how to set up a testing environment to test bot features without affecting the production bot.

## Overview

The testing environment uses:

- **Separate Discord Server** - Your own test server
- **Separate Config File** - `config/config.test.json` (test configuration)
- **Separate Data File** - `data/restocks.test.json` (test data, won't affect production)
- **Environment Variable** - `NODE_ENV=test` to switch modes

## Step 1: Create a Test Discord Server

1. Create a new Discord server (or use an existing one for testing)
2. Create the following channels:

   - `#test-approvals` - For approval requests
   - `#test-va-alerts` - For VA restock alerts
   - `#test-md-alerts` - For MD restock alerts
   - `#test-va-reports` - For VA reporting commands
   - `#test-md-reports` - For MD reporting commands
   - `#test-va-lookup` - For VA lookup commands
   - `#test-md-lookup` - For MD lookup commands
   - `#test-weekly-va` - For weekly VA reports
   - `#test-weekly-md` - For weekly MD reports
   - `#test-admin` - For admin commands

3. Create roles:

   - `Test Admin` - For admin commands
   - `Test VA Alerts` - For VA alert mentions
   - `Test MD Alerts` - For MD alert mentions
   - `Test Weekly VA` - For weekly VA recap mentions
   - `Test Weekly MD` - For weekly MD recap mentions

4. Enable Developer Mode in Discord:
   - Settings → Advanced → Developer Mode
   - Right-click channels/roles → "Copy ID"

## Step 2: Create a Test Bot Application (Optional but Recommended)

**Option A: Use Same Bot (Easier)**

- Use the same bot token but different channels
- Commands will be visible in both servers
- Data is separate (test vs production)

**Option B: Create Separate Test Bot (Recommended)**

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it "LocalRestock Test Bot"
4. Go to "Bot" section → Add Bot
5. Copy the token
6. Go to "OAuth2" → "URL Generator"
7. Select `bot` scope and permissions:
   - Send Messages
   - Embed Links
   - Read Message History
   - Manage Messages
   - Manage Roles
   - Add Reactions
8. Copy the invite URL and invite the bot to your test server

## Step 3: Configure Test Environment

1. **Create `.env.test` file** (copy from `.env`):

   ```bash
   cp .env .env.test
   ```

2. **Update `.env.test`**:

   - If using a separate test bot, update `DISCORD_TOKEN` with test bot token
   - Update `CLIENT_ID` with test bot's client ID
   - Update `GUILD_ID` with your test server's ID

3. **Update `config/config.test.json`**:
   - Replace all `TEST_CHANNEL_ID` placeholders with your test server channel IDs
   - Replace all `TEST_ROLE_ID` placeholders with your test server role IDs
   - Add some test stores (3-5 stores is enough for testing)

## Step 4: Running the Bot in Test Mode

### Local Development (Test Mode)

```bash
# Run bot in test mode
npm run test

# Run bot in test mode with auto-reload (nodemon)
npm run test:dev
```

### Deploy Commands to Test Server

```bash
# Deploy commands to test server
npm run deploy:test
```

**Important:** Make sure your `.env.test` has the correct `GUILD_ID` for your test server before deploying commands.

## Step 5: Testing Workflow

1. **Start test bot:**

   ```bash
   npm run test:dev
   ```

2. **Test features in your test Discord server:**

   - Use the `/admin_setup_button_va` command to create test buttons
   - Test restock reporting workflows
   - Test approval/rejection flows
   - Test weekly reports (use `/admin_test_weekly_report`)

3. **Verify data separation:**

   - Check `data/restocks.test.json` - contains test data
   - Check `data/restocks.json` - contains production data (should be unchanged)

4. **When ready to deploy:**
   - Stop test bot
   - Run production bot: `npm start`
   - Or deploy to Railway (production will use regular config)

## Environment Variables

The bot checks for test mode using:

- `NODE_ENV=test` OR
- `BOT_MODE=test`

When test mode is enabled:

- Config: Uses `config/config.test.json`
- Data: Uses `data/restocks.test.json`
- Console: Shows "🧪 TEST MODE" messages

## Quick Reference

| Command               | Description                          |
| --------------------- | ------------------------------------ |
| `npm start`           | Run production bot                   |
| `npm run dev`         | Run production bot with auto-reload  |
| `npm run test`        | Run test bot                         |
| `npm run test:dev`    | Run test bot with auto-reload        |
| `npm run deploy`      | Deploy commands to production server |
| `npm run deploy:test` | Deploy commands to test server       |

## Safety Features

✅ **Complete Data Separation**

- Test data in `data/restocks.test.json`
- Production data in `data/restocks.json`
- Never mix or overwrite

✅ **Config Separation**

- Test config in `config/config.test.json`
- Production config in `config/config.json`
- Different channels/roles

✅ **Visual Indicators**

- Test mode shows "🧪 TEST MODE" in console
- Easy to identify which mode is running

## Troubleshooting

**Bot using wrong config?**

- Check `NODE_ENV` environment variable
- Verify `config/config.test.json` exists
- Check console for "TEST MODE" message

**Commands not working?**

- Make sure you deployed commands to test server: `npm run deploy:test`
- Verify `.env.test` has correct `GUILD_ID`
- Check bot has required permissions in test server

**Can't see test data?**

- Check `data/restocks.test.json` exists
- Verify bot is running in test mode (check console)
- Restart bot after switching modes

## Best Practices

1. **Always test in test mode first** before deploying to production
2. **Use separate test bot** if possible (prevents accidental production actions)
3. **Keep test server minimal** - Only add what you need for testing
4. **Regular backups** - Backup production data before major changes
5. **Code review** - Test thoroughly before merging to main branch

## Next Steps

After setting up your test environment:

1. Test all reporting workflows
2. Test admin commands
3. Test weekly reports
4. Test error handling
5. Once confident, deploy to production
