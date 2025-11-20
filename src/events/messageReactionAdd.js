const { Events } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        console.log(`\n🔔 ========== MessageReactionAdd EVENT FIRED ==========`);
        console.log(`👤 User: ${user.username} (${user.id})`);
        console.log(`🤖 Is Bot: ${user.bot}`);
        console.log(`😀 Emoji: ${reaction.emoji.name || reaction.emoji.identifier || 'unknown'}`);
        console.log(`📝 Message ID: ${reaction.message.id || 'unknown'}`);
        console.log(`📝 Message Partial: ${reaction.message.partial}`);
        console.log(`📝 Channel ID: ${reaction.message.channelId || 'unknown'}`);
        
        // Ignore bot reactions
        if (user.bot) {
            console.log(`⚠️ Ignoring bot reaction from ${user.username}`);
            return;
        }

        // Always fetch the message and reaction to ensure we have the latest data
        try {
            if (reaction.message.partial) {
                console.log(`📥 Fetching partial message...`);
                await reaction.message.fetch();
            }
            if (reaction.partial) {
                console.log(`📥 Fetching partial reaction...`);
                await reaction.fetch();
            }
            
            // Ensure we have the guild
            if (!reaction.message.guild) {
                console.log(`⚠️ Message has no guild, fetching...`);
                const channel = await reaction.client.channels.fetch(reaction.message.channelId).catch(() => null);
                if (channel && channel.guild) {
                    reaction.message.guild = channel.guild;
                }
            }
        } catch (error) {
            console.error('❌ Error fetching reaction/message:', error);
            return;
        }

        // Only handle reactions on the specific reaction role message
        const targetChannelId = config.channels.reactionRoles || '1381823226493272094';
        const targetMessageId = config.channels.reactionRoleMessageId || '1434620131002159176';
        
        console.log(`\n📋 Config Check:`);
        console.log(`   Target Channel: ${targetChannelId}`);
        console.log(`   Target Message: ${targetMessageId}`);
        
        // Convert to strings for comparison (Discord IDs can be strings or BigInt)
        const messageChannelId = String(reaction.message.channelId);
        const messageId = String(reaction.message.id);
        
        console.log(`\n🔍 Reaction Check:`);
        console.log(`   Actual Channel: ${messageChannelId}`);
        console.log(`   Actual Message: ${messageId}`);
        console.log(`   Channel Match: ${messageChannelId === String(targetChannelId)}`);
        console.log(`   Message Match: ${messageId === String(targetMessageId)}`);
        
        if (messageChannelId !== String(targetChannelId)) {
            console.log(`⚠️ Reaction on wrong channel: ${messageChannelId} !== ${targetChannelId}`);
            return;
        }
        if (messageId !== String(targetMessageId)) {
            console.log(`⚠️ Reaction on wrong message: ${messageId} !== ${targetMessageId}`);
            return;
        }
        
        console.log(`\n✅ ✅ ✅ MATCH FOUND! Processing reaction role assignment... ✅ ✅ ✅\n`);

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

            // Get emoji name - handle both unicode and custom emojis
            const emoji = reaction.emoji.name || reaction.emoji.identifier;
            
            if (!emoji) {
                console.error(`❌ Could not determine emoji name/identifier`);
                return;
            }

            // Get role IDs from config
            const vaRoleId = config.roles.localRestockVA;
            const mdRoleId = config.roles.localRestockMD;
            const weeklyVaRoleId = config.roles.weeklyReportVA;
            const weeklyMdRoleId = config.roles.weeklyReportMD;

            console.log(`🔔 Reaction detected: ${emoji} from ${user.username} (${user.id}) on message ${reaction.message.id}`);
            console.log(`📋 Role IDs - VA: ${vaRoleId}, MD: ${mdRoleId}, Weekly VA: ${weeklyVaRoleId}, Weekly MD: ${weeklyMdRoleId}`);
            console.log(`📋 Emoji details - name: ${reaction.emoji.name}, identifier: ${reaction.emoji.identifier}, id: ${reaction.emoji.id}`);

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

                // Check bot role hierarchy
                const botRole = botMember.roles.highest;
                const isBotOwner = guild.ownerId === reaction.client.user.id;
                const userHighestRole = member.roles.highest;
                
                console.log(`🔍 Bot role: ${botRole.name} (position: ${botRole.position})`);
                console.log(`🔍 Target role: ${role.name} (position: ${role.position})`);
                console.log(`🔍 User highest role: ${userHighestRole.name} (position: ${userHighestRole.position})`);
                console.log(`🔍 User is admin: ${member.permissions.has('Administrator')}`);
                
                // Check if bot's role is higher than the role being assigned
                // Bot can manage roles if it's the guild owner OR if its highest role is above the target role
                if (!isBotOwner && botRole.position <= role.position) {
                    console.error(`❌ Bot's role (${botRole.name}) is not higher than ${roleName} role (${role.name}). Bot role position: ${botRole.position}, ${roleName} role position: ${role.position}`);
                    return false;
                }
                
                // Check if user's highest role is higher than bot's role (this can prevent role changes)
                if (!isBotOwner && userHighestRole.position >= botRole.position && userHighestRole.id !== guild.id) {
                    console.warn(`⚠️ User ${user.username} has role ${userHighestRole.name} (position: ${userHighestRole.position}) which is >= bot's role (position: ${botRole.position}). This may prevent role changes.`);
                }

                // Check if user already has the role
                const hasRole = member.roles.cache.has(roleId);
                console.log(`🔍 User ${user.username} has ${roleName} role (${roleId}): ${hasRole}`);
                
                if (hasRole) {
                    console.log(`ℹ️ User ${user.username} already has ${roleName} role - skipping`);
                    return true;
                }

                console.log(`➕ Attempting to add ${roleName} role (${roleId}) to ${user.username}...`);
                try {
                    await member.roles.add(role);
                    console.log(`✅ Successfully added ${roleName} role to ${user.username}`);
                    
                    // Verify addition
                    await member.fetch(true);
                    const nowHasRole = member.roles.cache.has(roleId);
                    console.log(`🔍 Verification - User ${user.username} now has ${roleName} role: ${nowHasRole}`);
                    
                    if (!nowHasRole) {
                        console.error(`❌ Role addition failed - user doesn't have the role! This may be due to role hierarchy or permissions.`);
                    }
                    
                    return true;
                } catch (error) {
                    console.error(`❌ Error adding ${roleName} role to ${user.username}:`, error.message);
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
            if (emoji === '💥') {
                console.log(`✅ Matched 💥 - Adding VA Alerts role`);
                await addRole(vaRoleId, 'VA Alerts');
            } else if (emoji === '🗄️') {
                console.log(`✅ Matched 🗄️ - Adding MD Alerts role`);
                await addRole(mdRoleId, 'MD Alerts');
            } else if (emoji === '📅') {
                console.log(`✅ Matched 📅 - Adding Weekly VA Recap role`);
                await addRole(weeklyVaRoleId, 'Weekly VA Recap');
            } else if (emoji === '📊') {
                console.log(`✅ Matched 📊 - Adding Weekly MD Recap role`);
                await addRole(weeklyMdRoleId, 'Weekly MD Recap');
            } else {
                console.log(`⚠️ Unhandled emoji reaction: "${emoji}"`);
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

