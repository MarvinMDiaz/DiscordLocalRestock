const { Events } = require('discord.js');
const { startWeeklyScheduler } = require('../utils/weeklyScheduler');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ ${client.user.tag} is online and ready!`);
        console.log(`🤖 Bot is serving ${client.guilds.cache.size} guilds`);
        console.log(`👥 Bot is serving ${client.users.cache.size} users`);

        // Verify reaction events are registered
        const reactionAddListeners = client.listenerCount('messageReactionAdd');
        const reactionRemoveListeners = client.listenerCount('messageReactionRemove');
        console.log(`\n📊 Event Listeners:`);
        console.log(`   messageReactionAdd listeners: ${reactionAddListeners}`);
        console.log(`   messageReactionRemove listeners: ${reactionRemoveListeners}`);
        
        if (reactionAddListeners === 0) {
            console.error(`❌ WARNING: No messageReactionAdd listeners registered!`);
        }
        if (reactionRemoveListeners === 0) {
            console.error(`❌ WARNING: No messageReactionRemove listeners registered!`);
        }

        // Set bot status
        client.user.setActivity('restock reports', { type: 'WATCHING' });

        // Start weekly scheduler for automated Sunday reports
        startWeeklyScheduler(client);
    },
}; 