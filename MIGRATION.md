# 🚀 Discord Bot Migration Guide

This guide will help you transfer this bot to a new Discord server with new channel IDs and role IDs.

## Quick Setup Options

### Option 1: Interactive Setup Command (Recommended)

Use the `/admin_setup_config` command with different subcommands:

1. **Quick Setup (All IDs at once):**
   ```
   /admin_setup_config quick_setup
   ```
   - Opens a modal with all channel and role IDs
   - Paste your new IDs in JSON format
   - Updates everything at once

2. **Step-by-Step Channel Setup:**
   ```
   /admin_setup_config channels
   ```
   - Select which channel to update from dropdown
   - Enter the new channel ID
   - Repeat for each channel

3. **Step-by-Step Role Setup:**
   ```
   /admin_setup_config roles
   ```
   - Select which role to update from dropdown
   - Enter the new role ID
   - Repeat for each role

4. **View Current Configuration:**
   ```
   /admin_setup_config view
   ```
   - Shows all current channel and role IDs
   - Useful for verification

### Option 2: Manual Config File Edit

1. Open `config/config.json`
2. Update the following IDs:

#### Main Channels:
- `channels.restockApprovals` - Channel for approval messages (VA + MD)
- `channels.restockApprovalsMD` - MD approval channel (can be same as above)
- `channels.localRestockVA` - Public VA restock alerts channel
- `channels.localRestockMD` - Public MD restock alerts channel
- `channels.weeklyReportVA` - Weekly VA recap reports channel
- `channels.weeklyReportMD` - Weekly MD recap reports channel

#### Command Channels (optional - leave empty string "" to allow anywhere):
- `commandChannels.report_past_restock_va`
- `commandChannels.restock_in_progress_va`
- `commandChannels.lookup_va_restocks`
- `commandChannels.report_past_restock_md`
- `commandChannels.restock_in_progress_md`
- `commandChannels.lookup_md_restocks`

#### Roles:
- `roles.admin` - Main admin role (required for admin commands)
- `roles.localRestockVA` - Role mentioned in VA alerts
- `roles.localRestockMD` - Role mentioned in MD alerts
- `roles.weeklyReportVA` - Role mentioned in VA weekly reports
- `roles.weeklyReportMD` - Role mentioned in MD weekly reports

## How to Get Discord IDs

1. **Enable Developer Mode:**
   - Discord Settings → Advanced → Enable Developer Mode

2. **Copy Channel ID:**
   - Right-click channel → Copy ID

3. **Copy Role ID:**
   - Right-click role → Copy ID
   - Or Server Settings → Roles → Right-click role → Copy ID

## Migration Checklist

- [ ] Update all channel IDs in `config/config.json`
- [ ] Update all role IDs in `config/config.json`
- [ ] Update command channel IDs (if restricting commands)
- [ ] Update channel names in `channelNames` object (optional, for error messages)
- [ ] Restart bot to load new configuration
- [ ] Test admin commands to verify permissions
- [ ] Test restock reporting to verify channels
- [ ] Test weekly reports to verify report channels

## Important Notes

- **Channel IDs:** Must be 17-19 digit numbers
- **Role IDs:** Must be 17-19 digit numbers
- **Empty Strings:** Set command channels to `""` to allow commands anywhere
- **Backup:** Always backup your `config.json` before making changes
- **Restart Required:** Bot must be restarted after config changes

## Troubleshooting

**Bot not responding:**
- Check if bot has proper permissions in new channels
- Verify channel IDs are correct
- Check bot is online and restarted

**Commands not working:**
- Verify command channels are set correctly
- Check if bot has "Use Slash Commands" permission
- Redeploy commands: `npm run deploy`

**Roles not mentioned:**
- Verify role IDs are correct
- Check bot has permission to mention roles
- Ensure roles exist in the server

## Support

If you encounter issues:
1. Check console logs for errors
2. Verify all IDs are correct format (17-19 digits)
3. Ensure bot has necessary permissions
4. Restart bot after making changes

