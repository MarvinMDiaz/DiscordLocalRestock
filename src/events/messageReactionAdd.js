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

            console.log(`🔔 Reaction detected: ${emoji} from ${user.username} in channel ${reaction.message.channelId}`);

            // Handle different reactions
            if (emoji === '🚨') {
                // VA Alerts
                let vaRole = guild.roles.cache.get(vaRoleId);
                if (!vaRole) {
                    vaRole = await guild.roles.fetch(vaRoleId);
                }
                if (vaRole) {
                    // Check if bot's role is higher than the role being assigned
                    const botRole = botMember.roles.highest;
                    if (botRole.position <= vaRole.position && botRole.id !== guild.ownerId) {
                        console.error(`❌ Bot's role (${botRole.name}) is not higher than VA role (${vaRole.name}). Bot role position: ${botRole.position}, VA role position: ${vaRole.position}`);
                        return;
                    }
                    await member.roles.add(vaRole);
                    console.log(`✅ Added VA role to ${user.username}`);
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
                    const botRole = botMember.roles.highest;
                    if (botRole.position <= mdRole.position && botRole.id !== guild.ownerId) {
                        console.error(`❌ Bot's role (${botRole.name}) is not higher than MD role (${mdRole.name}). Bot role position: ${botRole.position}, MD role position: ${mdRole.position}`);
                        return;
                    }
                    await member.roles.add(mdRole);
                    console.log(`✅ Added MD role to ${user.username}`);
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
                    const botRole = botMember.roles.highest;
                    if (botRole.position <= weeklyVaRole.position && botRole.id !== guild.ownerId) {
                        console.error(`❌ Bot's role (${botRole.name}) is not higher than Weekly VA role (${weeklyVaRole.name}). Bot role position: ${botRole.position}, Weekly VA role position: ${weeklyVaRole.position}`);
                        return;
                    }
                    await member.roles.add(weeklyVaRole);
                    console.log(`✅ Added Weekly VA role to ${user.username}`);
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
                    const botRole = botMember.roles.highest;
                    if (botRole.position <= weeklyMdRole.position && botRole.id !== guild.ownerId) {
                        console.error(`❌ Bot's role (${botRole.name}) is not higher than Weekly MD role (${weeklyMdRole.name}). Bot role position: ${botRole.position}, Weekly MD role position: ${weeklyMdRole.position}`);
                        return;
                    }
                    await member.roles.add(weeklyMdRole);
                    console.log(`✅ Added Weekly MD role to ${user.username}`);
                } else {
                    console.error(`❌ Weekly MD role not found: ${weeklyMdRoleId}`);
                }
            } else {
                console.log(`⚠️ Unhandled emoji reaction: ${emoji}`);
            }
        } catch (error) {
            console.error('❌ Error handling reaction add:', error);
            console.error('Error details:', {
                userId: user.id,
                username: user.username,
                emoji: reaction.emoji.name,
                channelId: reaction.message.channelId
            });
        }
    }
};

