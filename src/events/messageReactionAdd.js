const { Events } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    name: Events.MessageReactionAdd,
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
                    await member.roles.add(vaRole);
                    console.log(`✅ Added VA role to ${user.username}`);
                }
            } else if (emoji === '📋') {
                // MD Alerts
                const mdRole = guild.roles.cache.get(mdRoleId);
                if (mdRole) {
                    await member.roles.add(mdRole);
                    console.log(`✅ Added MD role to ${user.username}`);
                }
            } else if (emoji === '📅') {
                // Weekly VA
                const weeklyVaRole = guild.roles.cache.get(weeklyVaRoleId);
                if (weeklyVaRole) {
                    await member.roles.add(weeklyVaRole);
                    console.log(`✅ Added Weekly VA role to ${user.username}`);
                }
            } else if (emoji === '📊') {
                // Weekly MD
                const weeklyMdRole = guild.roles.cache.get(weeklyMdRoleId);
                if (weeklyMdRole) {
                    await member.roles.add(weeklyMdRole);
                    console.log(`✅ Added Weekly MD role to ${user.username}`);
                }
            }
        } catch (error) {
            console.error('❌ Error handling reaction add:', error);
        }
    }
};

