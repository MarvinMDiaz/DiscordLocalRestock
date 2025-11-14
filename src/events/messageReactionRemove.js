const { Events } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user) {
        console.log(`🔔 MessageReactionRemove event fired - User: ${user.username} (${user.id}), Bot: ${user.bot}`);
        
        // Ignore bot reactions
        if (user.bot) {
            console.log(`⚠️ Ignoring bot reaction removal from ${user.username}`);
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
        
        console.log(`🔍 Reaction remove check - Channel: ${messageChannelId} (expected: ${targetChannelId}), Message: ${messageId} (expected: ${targetMessageId})`);
        
        if (messageChannelId !== String(targetChannelId)) {
            console.log(`⚠️ Reaction remove on wrong channel: ${messageChannelId} !== ${targetChannelId}`);
            return;
        }
        if (messageId !== String(targetMessageId)) {
            console.log(`⚠️ Reaction remove on wrong message: ${messageId} !== ${targetMessageId}`);
            return;
        }
        
        console.log(`✅ Reaction remove matches target message! Processing...`);

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
            
            console.log(`📋 Processing reaction remove - Emoji: ${emoji}, User: ${user.username} (${user.id})`);
            
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
            console.log(`📋 Role IDs - VA: ${vaRoleId}, MD: ${mdRoleId}, Weekly VA: ${weeklyVaRoleId}, Weekly MD: ${weeklyMdRoleId}`);

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
                    console.log(`🔄 Refreshed member ${user.username} - Current roles: ${member.roles.cache.map(r => r.name).join(', ')}`);
                    console.log(`🔍 User is admin: ${member.permissions.has('Administrator')}`);
                    console.log(`🔍 User's highest role: ${member.roles.highest.name} (position: ${member.roles.highest.position})`);
                } catch (error) {
                    console.error(`❌ Error refreshing member ${user.username}:`, error.message);
                    return false;
                }

                // Check bot role hierarchy
                const botRole = botMember.roles.highest;
                const isBotOwner = guild.ownerId === reaction.client.user.id;
                const userHighestRole = member.roles.highest;
                
                console.log(`🔍 Bot role: ${botRole.name} (position: ${botRole.position})`);
                console.log(`🔍 Target role: ${role.name} (position: ${role.position})`);
                console.log(`🔍 User highest role: ${userHighestRole.name} (position: ${userHighestRole.position})`);
                
                // Check if bot can manage this role
                if (!isBotOwner && botRole.position <= role.position) {
                    console.error(`❌ Bot's role (${botRole.name}) is not higher than ${roleName} role (${role.name}). Bot role position: ${botRole.position}, ${roleName} role position: ${role.position}`);
                    return false;
                }
                
                // Check if user's highest role is higher than bot's role (this can prevent role changes)
                if (!isBotOwner && userHighestRole.position >= botRole.position && userHighestRole.id !== guild.id) {
                    console.warn(`⚠️ User ${user.username} has role ${userHighestRole.name} (position: ${userHighestRole.position}) which is >= bot's role (position: ${botRole.position}). This may prevent role changes.`);
                }

                // Check if user has the role
                const hasRole = member.roles.cache.has(roleId);
                console.log(`🔍 User ${user.username} has ${roleName} role (${roleId}): ${hasRole}`);
                
                if (!hasRole) {
                    console.log(`ℹ️ User ${user.username} doesn't have ${roleName} role - nothing to remove`);
                    return true;
                }

                // Note: By the time this event fires, Discord has already removed the reaction
                // So we can trust the event and proceed with role removal

                console.log(`🗑️ Attempting to remove ${roleName} role (${roleId}) from ${user.username}...`);
                try {
                    await member.roles.remove(role);
                    console.log(`✅ Successfully removed ${roleName} role from ${user.username} (${user.id})`);
                    
                    // Verify removal
                    await member.fetch(true);
                    const stillHasRole = member.roles.cache.has(roleId);
                    console.log(`🔍 Verification - User ${user.username} still has ${roleName} role: ${stillHasRole}`);
                    
                    if (stillHasRole) {
                        console.error(`❌ Role removal failed - user still has the role! This may be due to role hierarchy or permissions.`);
                    }
                    
                    return true;
                } catch (error) {
                    console.error(`❌ Error removing ${roleName} role from ${user.username}:`, error.message);
                    console.error(`❌ Error code: ${error.code}, Error details:`, error);
                    
                    // Check for specific Discord error codes
                    if (error.code === 50013) {
                        console.error(`❌ Missing Permissions: Bot doesn't have permission to manage roles`);
                    } else if (error.code === 50035) {
                        console.error(`❌ Invalid Form Body: Role hierarchy issue`);
                    }
                    
                    return false;
                }
            };

            // Handle different reactions
            console.log(`🔍 Checking emoji: "${emoji}"`);
            if (emoji === '🚨') {
                console.log(`✅ Matched 🚨 - Removing VA Alerts role`);
                await removeRole(vaRoleId, 'VA Alerts');
            } else if (emoji === '📋') {
                console.log(`✅ Matched 📋 - Removing MD Alerts role`);
                await removeRole(mdRoleId, 'MD Alerts');
            } else if (emoji === '📅') {
                console.log(`✅ Matched 📅 - Removing Weekly VA Recap role`);
                await removeRole(weeklyVaRoleId, 'Weekly VA Recap');
            } else if (emoji === '📊') {
                console.log(`✅ Matched 📊 - Removing Weekly MD Recap role`);
                await removeRole(weeklyMdRoleId, 'Weekly MD Recap');
            } else {
                console.log(`⚠️ Unhandled emoji for removal: "${emoji}"`);
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

