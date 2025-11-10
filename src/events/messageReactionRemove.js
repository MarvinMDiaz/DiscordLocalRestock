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

        // Only handle reactions on the specific reaction role message
        const targetChannelId = config.channels.reactionRoles || '1381823226493272094';
        const targetMessageId = config.channels.reactionRoleMessageId || '1434620131002159176';
        
        if (reaction.message.channelId !== targetChannelId) return;
        if (reaction.message.id !== targetMessageId) return;

        const guild = reaction.message.guild;
        if (!guild) {
            console.log('⚠️ No guild found for reaction');
            return;
        }

        try {
            // Check if bot has permission to manage roles
            const botMember = await guild.members.fetch(reaction.client.user.id);
            if (!botMember.permissions.has('ManageRoles')) {
                console.error('❌ Bot does not have "Manage Roles" permission!');
                return;
            }

            // Try to fetch the member - they might have left the server
            let member;
            try {
                member = await guild.members.fetch(user.id);
            } catch (error) {
                if (error.code === 10007) {
                    // Unknown member - they left the server
                    console.log(`⚠️ User ${user.username} (${user.id}) is not in the server, skipping role removal`);
                    return;
                }
                throw error;
            }

            // Get emoji name - handle both unicode and custom emojis
            const emoji = reaction.emoji.name || reaction.emoji.identifier;
            
            // Double-check we're on the right message
            if (reaction.message.id !== targetMessageId) {
                console.log(`⚠️ Reaction remove on wrong message: ${reaction.message.id} (expected ${targetMessageId})`);
                return;
            }

            // Get role IDs from config
            const vaRoleId = config.roles.localRestockVA;
            const mdRoleId = config.roles.localRestockMD;
            const weeklyVaRoleId = config.roles.weeklyReportVA;
            const weeklyMdRoleId = config.roles.weeklyReportMD;

            console.log(`🔔 Reaction removed: ${emoji} from ${user.username} (${user.id}) on message ${reaction.message.id}`);

            // Helper function to remove role with proper checks
            const removeRole = async (roleId, roleName) => {
                let role = guild.roles.cache.get(roleId);
                if (!role) {
                    role = await guild.roles.fetch(roleId).catch(() => null);
                }
                if (!role) {
                    console.error(`❌ ${roleName} role not found: ${roleId}`);
                    return false;
                }

                // Refresh member to get latest role state
                try {
                    member = await guild.members.fetch(user.id);
                } catch (error) {
                    console.error(`❌ Error refreshing member ${user.username}:`, error.message);
                    return false;
                }

                // Check if user has the role
                if (!member.roles.cache.has(roleId)) {
                    console.log(`ℹ️ User ${user.username} doesn't have ${roleName} role`);
                    return true;
                }

                // Note: By the time this event fires, Discord has already removed the reaction
                // So we can trust the event and proceed with role removal

                try {
                    await member.roles.remove(role);
                    console.log(`✅ Removed ${roleName} role from ${user.username} (${user.id})`);
                    return true;
                } catch (error) {
                    console.error(`❌ Error removing ${roleName} role from ${user.username}:`, error.message);
                    return false;
                }
            };

            // Handle different reactions
            if (emoji === '🚨') {
                await removeRole(vaRoleId, 'VA Alerts');
            } else if (emoji === '📋') {
                await removeRole(mdRoleId, 'MD Alerts');
            } else if (emoji === '📅') {
                await removeRole(weeklyVaRoleId, 'Weekly VA Recap');
            } else if (emoji === '📊') {
                await removeRole(weeklyMdRoleId, 'Weekly MD Recap');
            }
        } catch (error) {
            console.error('❌ Error handling reaction remove:', error);
            console.error('Error details:', {
                userId: user.id,
                username: user.username,
                emoji: reaction.emoji.name,
                messageId: reaction.message.id,
                channelId: reaction.message.channelId
            });
        }
    }
};

