const { Events } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user) {
        // Ignore bot reactions
        if (user.bot) return;

        // Fetch the reaction if it's partial
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Error fetching reaction:', error);
                return;
            }
        }

        // Only handle reactions in the specific channel
        const targetChannelId = '1381823226493272094';
        if (reaction.message.channelId !== targetChannelId) return;

        const guild = reaction.message.guild;
        if (!guild) return;

        try {
            const member = await guild.members.fetch(user.id);
            const emoji = reaction.emoji.name;

            // Get role IDs from config
            const vaRoleId = config.roles.localRestockVA;
            const mdRoleId = config.roles.localRestockMD;
            const weeklyVaRoleId = config.roles.weeklyReportVA;
            const weeklyMdRoleId = config.roles.weeklyReportMD;

            // Handle different reactions
            if (emoji === '🚨') {
                // VA Alerts
                const vaRole = guild.roles.cache.get(vaRoleId);
                if (vaRole) {
                    await member.roles.remove(vaRole);
                    console.log(`✅ Removed VA role from ${user.username}`);
                }
            } else if (emoji === '📋') {
                // MD Alerts
                const mdRole = guild.roles.cache.get(mdRoleId);
                if (mdRole) {
                    await member.roles.remove(mdRole);
                    console.log(`✅ Removed MD role from ${user.username}`);
                }
            } else if (emoji === '📅') {
                // Weekly VA
                const weeklyVaRole = guild.roles.cache.get(weeklyVaRoleId);
                if (weeklyVaRole) {
                    await member.roles.remove(weeklyVaRole);
                    console.log(`✅ Removed Weekly VA role from ${user.username}`);
                }
            } else if (emoji === '📊') {
                // Weekly MD
                const weeklyMdRole = guild.roles.cache.get(weeklyMdRoleId);
                if (weeklyMdRole) {
                    await member.roles.remove(weeklyMdRole);
                    console.log(`✅ Removed Weekly MD role from ${user.username}`);
                }
            }
        } catch (error) {
            console.error('❌ Error handling reaction remove:', error);
        }
    }
};

