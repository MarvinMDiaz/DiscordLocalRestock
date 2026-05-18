require('dotenv').config({ quiet: true });

console.log('Loading discord.js (first run can take ~10–30s)...');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dataManager = require('./utils/dataManager');

// V2 prod app wins when set (see .env CLIENT_ID_V2 / DISCORD_TOKEN_V2 / GUILD_ID_V2); else dev, else legacy DISCORD_TOKEN.
const discordToken =
    process.env.DISCORD_TOKEN_V2?.trim() ||
    process.env.Dev_Discord_Token?.trim() ||
    process.env.DISCORD_TOKEN?.trim();

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Member lookups for approvals, cooldowns, etc.
    ]
});

// Collections for commands and events
client.commands = new Collection();
client.events = new Collection();

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }

    console.log(`✅ Loaded event: ${event.name}`);
}

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property`);
    }
}

// Initialize data manager and login to Discord
async function startBot() {
    try {
        await dataManager.initialize();
        if (!discordToken) {
            console.error('❌ Set DISCORD_TOKEN_V2, or Dev_Discord_Token, or DISCORD_TOKEN in .env');
            process.exit(1);
        }
        await client.login(discordToken);
    } catch (error) {
        console.error('❌ Error starting bot:', error);
        process.exit(1);
    }
}

startBot(); 