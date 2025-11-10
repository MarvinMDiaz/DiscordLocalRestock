const { Events } = require('discord.js');
const { startWeeklyScheduler } = require('../utils/weeklyScheduler');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ ${client.user.tag} is online and ready!`);
        console.log(`🤖 Bot is serving ${client.guilds.cache.size} guilds`);
        console.log(`👥 Bot is serving ${client.users.cache.size} users`);

        // Set bot status
        client.user.setActivity('restock reports', { type: 'WATCHING' });

        // Start weekly scheduler for automated Sunday reports
        startWeeklyScheduler(client);
    },
}; 