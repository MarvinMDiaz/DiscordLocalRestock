const { Events } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        console.log(`🔔 MessageReactionAdd event fired - User: ${user.username} (${user.id}), Bot: ${user.bot}`);
        
        // Ignore bot reactions
        if (user.bot) {
            console.log(`⚠️ Ignoring bot reaction from ${user.username}`);
            return;
        }

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
        
        // Convert to strings for comparison (Discord IDs can be strings or BigInt)
        const messageChannelId = String(reaction.message.channelId);
        const messageId = String(reaction.message.id);
        
        console.log(`🔍 Reaction check - Channel: ${messageChannelId} (expected: ${targetChannelId}), Message: ${messageId} (expected: ${targetMessageId})`);
        
        if (messageChannelId !== String(targetChannelId)) {
            console.log(`⚠️ Reaction on wrong channel: ${messageChannelId} !== ${targetChannelId}`);
            return;
        }
        if (messageId !== String(targetMessageId)) {
            console.log(`⚠️ Reaction on wrong message: ${messageId} !== ${targetMessageId}`);
            return;
        }
        
        console.log(`✅ Reaction matches target message! Processing...`);

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
                    console.log(`⚠️ User ${user.username} (${user.id}) is not in the server, skipping role assignment`);
                    return;
                }
                throw error;
            }

            const emoji = reaction.emoji.name;

            // Get role IDs from config
            const vaRoleId = config.roles.localRestockVA;
            const mdRoleId = config.roles.localRestockMD;
            const weeklyVaRoleId = config.roles.weeklyReportVA;
            const weeklyMdRoleId = config.roles.weeklyReportMD;

            console.log(`🔔 Reaction detected: ${emoji} from ${user.username} (${user.id}) on message ${reaction.message.id}`);

            // Helper function to add role with proper checks
            const addRole = async (roleId, roleName) => {
                let role = guild.roles.cache.get(roleId);
                if (!role) {
                    role = await guild.roles.fetch(roleId).catch(() => null);
                }
                if (!role) {
                    console.error(`❌ ${roleName} role not found: ${roleId}`);
                    return false;
                }

                // Check if bot's role is higher than the role being assigned
                // Bot can manage roles if it's the guild owner OR if its highest role is above the target role
                const botRole = botMember.roles.highest;
                const isBotOwner = guild.ownerId === reaction.client.user.id;
                
                if (!isBotOwner && botRole.position <= role.position) {
                    console.error(`❌ Bot's role (${botRole.name}) is not higher than ${roleName} role (${role.name}). Bot role position: ${botRole.position}, ${roleName} role position: ${role.position}`);
                    return false;
                }

                // Check if user already has the role
                if (member.roles.cache.has(roleId)) {
                    console.log(`ℹ️ User ${user.username} already has ${roleName} role`);
                    return true;
                }

                try {
                    await member.roles.add(role);
                    console.log(`✅ Added ${roleName} role to ${user.username}`);
                    return true;
                } catch (error) {
                    console.error(`❌ Error adding ${roleName} role to ${user.username}:`, error.message);
                    return false;
                }
            };

            // Handle different reactions
            if (emoji === '🚨') {
                await addRole(vaRoleId, 'VA Alerts');
            } else if (emoji === '📋') {
                await addRole(mdRoleId, 'MD Alerts');
            } else if (emoji === '📅') {
                await addRole(weeklyVaRoleId, 'Weekly VA Recap');
            } else if (emoji === '📊') {
                await addRole(weeklyMdRoleId, 'Weekly MD Recap');
            } else {
                console.log(`⚠️ Unhandled emoji reaction: ${emoji}`);
            }
        } catch (error) {
            console.error('❌ Error handling reaction add:', error);
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

