# 🛍️ Discord Restock Tracker Bot

A Discord bot that allows community members to report store restocks with approval workflows, cooldown systems, and historical lookup capabilities.

## 🚀 Features

- **`/report_restock`** - Submit restock reports with approval workflow
- **`/restock_in_progress`** - Real-time alerts with photo support
- **`/restock_status`** - View all restocks from last 7 days
- **`/restock_store`** - Look up specific store with historical data
- **Weekly cooldown resets** - Fresh start every Monday
- **Admin approval system** - All reports require admin approval
- **Abuse protection** - Cooldowns and duplicate detection

## 📋 Prerequisites

- Node.js 16+ installed
- Discord Bot Token
- Discord Application ID
- Discord Guild (Server) ID

## 🛠️ Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/MarvinMDiaz/DiscordLocalRestock.git
cd DiscordLocalRestock
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_discord_guild_id_here

# Channel IDs
RESTOCK_APPROVALS_CHANNEL_ID=your_approvals_channel_id_here
LOCAL_RESTOCK_CHANNEL_ID=your_public_channel_id_here

# Role IDs
LOCAL_RESTOCK_ROLE_ID=your_role_id_here
ADMIN_ROLE_ID=your_admin_role_id_here

# Bot Settings
NODE_ENV=development
```

### 4. Configure Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token to your `.env` file
5. Go to "OAuth2" → "URL Generator"
6. Select scopes: `bot`, `applications.commands`
7. Select bot permissions: `Send Messages`, `Use Slash Commands`, `Attach Files`
8. Use the generated URL to invite the bot to your server

### 5. Deploy Commands

```bash
npm run deploy
```

### 6. Start the Bot

```bash
npm start
```

## 📁 Project Structure

```
DiscordLocalRestock/
├── src/
│   ├── commands/          # Slash commands
│   ├── events/            # Discord event handlers
│   ├── utils/             # Utility functions
│   └── index.js           # Main bot file
├── data/
│   ├── restocks.json      # Data storage
│   └── backups/           # Backup files
├── config/
│   └── config.json        # Configuration
├── deploy-commands.js     # Command deployment
└── package.json
```

## 🎯 Commands

### `/report_restock`

Submit a restock report for approval.

**Inputs:**

- `store` (dropdown) - Select from predefined Target locations
- `item` (text) - Product name (e.g., "Pokémon TCG")
- `date` (required) - Date of restock

**Cooldowns:**

- Store: 3 unique user reports/24h → 3-day lock
- User: 1 report per store every 3 days

### `/restock_in_progress`

Submit a real-time restock alert.

**Inputs:**

- `store` (dropdown) - Select from predefined Target locations
- `photo` (optional) - Photo attachment

**Cooldowns:**

- Store lockout: 3 days after approval
- 24h limit: Only one alert per store per day

### `/restock_status`

View all restocks from the last 7 days.

### `/restock_store`

Look up specific store with historical data.

**Inputs:**

- `store` (dropdown) - Select specific store

## 🔄 Weekly Reset

Every Monday at 12:00 AM UTC:

- All cooldowns are reset
- Current week data is cleared
- Historical data is preserved for lookups

## 🛡️ Protection Features

- **Duplicate Detection** - Prevents spam reports
- **Profanity Filter** - Blocks inappropriate content
- **Cooldown Systems** - Prevents abuse
- **Admin Approval** - All reports require approval

## 💾 Data Storage

Data is stored in JSON files:

- `restocks.json` - Main data file
- Automatic backups in `data/backups/`
- Weekly cleanup of old data

## 🚀 Deployment

### Railway (Recommended)

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push

### Local Development

```bash
npm run dev  # Uses nodemon for auto-restart
```

## 📝 License

ISC License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

_Built with Discord.js v14 and Node.js_
