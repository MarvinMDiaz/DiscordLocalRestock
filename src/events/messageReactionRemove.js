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
                console.error('❌ Error fetching reaction:', error);
                return;
            }
        }

        // Fetch the message if it's partial (for reactions on old messages)
        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                console.error('❌ Error fetching message:', error);
                return;
            }
        }

        // Only handle reactions in the specific channel
        const targetChannelId = '1381823226493272094';
        if (reaction.message.channelId !== targetChannelId) return;

        const guild = reaction.message.guild;
        if (!guild) {
            console.log('⚠️ No guild found for reaction');
            return;
        }

        try {
            const member = await guild.members.fetch(user.id);
            const emoji = reaction.emoji.name;

            // Check if bot has permission to manage roles
            const botMember = await guild.members.fetch(reaction.client.user.id);
            if (!botMember.permissions.has('ManageRoles')) {
                console.error('❌ Bot does not have "Manage Roles" permission!');
                return;
            }

            // Get role IDs from config
            const vaRoleId = config.roles.localRestockVA;
            const mdRoleId = config.roles.localRestockMD;
            const weeklyVaRoleId = config.roles.weeklyReportVA;
            const weeklyMdRoleId = config.roles.weeklyReportMD;

            console.log(`🔔 Reaction removed: ${emoji} from ${user.username} in channel ${reaction.message.channelId}`);

            // Handle different reactions
            if (emoji === '🚨') {
                // VA Alerts
                let vaRole = guild.roles.cache.get(vaRoleId);
                if (!vaRole) {
                    vaRole = await guild.roles.fetch(vaRoleId);
                }
                if (vaRole) {
                    await member.roles.remove(vaRole);
                    console.log(`✅ Removed VA role from ${user.username}`);
                } else {
                    console.error(`❌ VA role not found: ${vaRoleId}`);
                }
            } else if (emoji === '📋') {
                // MD Alerts
                let mdRole = guild.roles.cache.get(mdRoleId);
                if (!mdRole) {
                    mdRole = await guild.roles.fetch(mdRoleId);
                }
                if (mdRole) {
                    await member.roles.remove(mdRole);
                    console.log(`✅ Removed MD role from ${user.username}`);
                } else {
                    console.error(`❌ MD role not found: ${mdRoleId}`);
                }
            } else if (emoji === '📅') {
                // Weekly VA
                let weeklyVaRole = guild.roles.cache.get(weeklyVaRoleId);
                if (!weeklyVaRole) {
                    weeklyVaRole = await guild.roles.fetch(weeklyVaRoleId);
                }
                if (weeklyVaRole) {
                    await member.roles.remove(weeklyVaRole);
                    console.log(`✅ Removed Weekly VA role from ${user.username}`);
                } else {
                    console.error(`❌ Weekly VA role not found: ${weeklyVaRoleId}`);
                }
            } else if (emoji === '📊') {
                // Weekly MD
                let weeklyMdRole = guild.roles.cache.get(weeklyMdRoleId);
                if (!weeklyMdRole) {
                    weeklyMdRole = await guild.roles.fetch(weeklyMdRoleId);
                }
                if (weeklyMdRole) {
                    await member.roles.remove(weeklyMdRole);
                    console.log(`✅ Removed Weekly MD role from ${user.username}`);
                } else {
                    console.error(`❌ Weekly MD role not found: ${weeklyMdRoleId}`);
                }
            }
        } catch (error) {
            console.error('❌ Error handling reaction remove:', error);
            console.error('Error details:', {
                userId: user.id,
                username: user.username,
                emoji: reaction.emoji.name,
                channelId: reaction.message.channelId
            });
        }
    }
};

