const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_sync_reaction_roles')
        .setDescription('Sync all reactions on the reaction role message with user roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channelId = config.channels.reactionRoles || '1381823226493272094';
        const messageId = config.channels.reactionRoleMessageId || '1434620131002159176';
        
        const channel = interaction.client.channels.cache.get(channelId);
        if (!channel) {
            return await interaction.editReply({
                content: `❌ Channel not found. Please check the channel ID: ${channelId}`
            });
        }

        try {
            // Fetch the message
            const message = await channel.messages.fetch(messageId);
            
            if (!message) {
                return await interaction.editReply({
                    content: `❌ Message not found. Please check the message ID: ${messageId}`
                });
            }

            const guild = interaction.guild;
            if (!guild) {
                return await interaction.editReply({
                    content: `❌ Guild not found.`
                });
            }

            // Check bot permissions
            const botMember = await guild.members.fetch(interaction.client.user.id);
            if (!botMember.permissions.has('ManageRoles')) {
                return await interaction.editReply({
                    content: `❌ Bot does not have "Manage Roles" permission!`
                });
            }

            // Get role IDs from config
            const vaRoleId = config.roles.localRestockVA;
            const mdRoleId = config.roles.localRestockMD;
            const weeklyVaRoleId = config.roles.weeklyReportVA;
            const weeklyMdRoleId = config.roles.weeklyReportMD;

            // Fetch all roles
            const vaRole = await guild.roles.fetch(vaRoleId).catch(() => null);
            const mdRole = await guild.roles.fetch(mdRoleId).catch(() => null);
            const weeklyVaRole = await guild.roles.fetch(weeklyVaRoleId).catch(() => null);
            const weeklyMdRole = await guild.roles.fetch(weeklyMdRoleId).catch(() => null);

            if (!vaRole || !mdRole || !weeklyVaRole || !weeklyMdRole) {
                return await interaction.editReply({
                    content: `❌ One or more roles not found. Please check your config.`
                });
            }

            // Check bot role position
            const botRole = botMember.roles.highest;
            const roles = [
                { role: vaRole, emoji: '🚨', name: 'VA Alerts' },
                { role: mdRole, emoji: '📋', name: 'MD Alerts' },
                { role: weeklyVaRole, emoji: '📅', name: 'Weekly VA Recap' },
                { role: weeklyMdRole, emoji: '📊', name: 'Weekly MD Recap' }
            ];

            for (const roleInfo of roles) {
                if (botRole.position <= roleInfo.role.position && botRole.id !== guild.ownerId) {
                    return await interaction.editReply({
                        content: `❌ Bot's role (${botRole.name}) is not higher than ${roleInfo.name} role (${roleInfo.role.name}). Please adjust role hierarchy.`
                    });
                }
            }

            // Map emojis to roles
            const emojiToRole = {
                '🚨': { role: vaRole, name: 'VA Alerts' },
                '📋': { role: mdRole, name: 'MD Alerts' },
                '📅': { role: weeklyVaRole, name: 'Weekly VA Recap' },
                '📊': { role: weeklyMdRole, name: 'Weekly MD Recap' }
            };

            let synced = 0;
            let errors = 0;
            const results = {
                added: [],
                removed: [],
                errors: []
            };

            // Store all users who reacted (for cleanup phase)
            const allReactedUserIds = new Map(); // emoji -> Set of user IDs

            // Process each emoji reaction
            for (const [emojiName, roleInfo] of Object.entries(emojiToRole)) {
                const reaction = message.reactions.cache.get(emojiName);
                if (!reaction) {
                    console.log(`⚠️ No reaction found for ${emojiName}`);
                    continue;
                }

                // Fetch ALL users who reacted
                // Discord API limits to 100 users per fetch, so we need to paginate
                let allUsers = new Map();
                let reactedUserIds = new Set();
                try {
                    const expectedCount = reaction.count; // Total reactions (includes bots)
                    const batchSize = 100;
                    let lastUserId = null;
                    let fetchedCount = 0;
                    
                    // Fetch users in batches until we get all of them
                    while (fetchedCount < expectedCount) {
                        const fetchOptions = { limit: batchSize };
                        if (lastUserId) {
                            fetchOptions.after = lastUserId;
                        }
                        
                        const fetchedUsers = await reaction.users.fetch(fetchOptions);
                        
                        if (fetchedUsers.size === 0) break; // No more users
                        
                        // Add users to our collection
                        for (const [userId, user] of fetchedUsers) {
                            if (!allUsers.has(userId)) { // Avoid duplicates
                                allUsers.set(userId, user);
                                if (!user.bot) {
                                    reactedUserIds.add(userId);
                                }
                                fetchedCount++;
                                lastUserId = userId; // Track last user for pagination
                            }
                        }
                        
                        // If we got fewer than batchSize, we've reached the end
                        if (fetchedUsers.size < batchSize) {
                            break;
                        }
                        
                        // Small delay to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    const botCount = Array.from(allUsers.values()).filter(u => u.bot).length;
                    const humanCount = allUsers.size - botCount;
                    
                    console.log(`📊 Found ${humanCount} human users (${allUsers.size} total) who reacted with ${emojiName} (reaction count: ${expectedCount})`);
                    
                    // Store reacted user IDs for cleanup phase
                    allReactedUserIds.set(emojiName, reactedUserIds);
                    
                    if (allUsers.size < expectedCount - 2) {
                        console.warn(`⚠️ Still missing some users: fetched ${allUsers.size} but expected ${expectedCount}`);
                        // If we didn't get all users, don't do cleanup for this emoji (safety)
                        console.warn(`⚠️ Skipping cleanup for ${emojiName} due to incomplete user fetch`);
                    }
                } catch (error) {
                    console.error(`❌ Error fetching users for ${emojiName}:`, error);
                    results.errors.push(`Failed to fetch users for ${emojiName}: ${error.message}`);
                    continue;
                }

                // Process each user
                for (const [userId, user] of allUsers) {
                    // Skip bots
                    if (user.bot) continue;

                    try {
                        const member = await guild.members.fetch(userId).catch(err => {
                            if (err.code === 10007) {
                                // User left the server - skip
                                return null;
                            }
                            throw err;
                        });
                        
                        if (!member) {
                            // User left server, skip
                            continue;
                        }
                        
                        const hasRole = member.roles.cache.has(roleInfo.role.id);

                        if (!hasRole) {
                            // User reacted but doesn't have the role - add it
                            await member.roles.add(roleInfo.role);
                            results.added.push(`${user.username} (${user.id}) - ${roleInfo.name}`);
                            synced++;
                            console.log(`✅ Added ${roleInfo.name} role to ${user.username}`);
                        }
                    } catch (error) {
                        errors++;
                        const errorMsg = `${user.username || userId} - ${roleInfo.name}: ${error.message}`;
                        results.errors.push(errorMsg);
                        console.error(`❌ Error processing ${user.username || userId} for ${roleInfo.name}:`, error);
                    }
                }
            }
            
            // Also check for users who have roles but didn't react (cleanup orphaned roles)
            // ONLY if we successfully fetched all users for that emoji
            // Use the data we already fetched above to avoid double-fetching
            for (const [emojiName, roleInfo] of Object.entries(emojiToRole)) {
                // Only do cleanup if we successfully fetched all users for this emoji
                const reactedUserIds = allReactedUserIds.get(emojiName);
                if (!reactedUserIds) {
                    console.log(`⚠️ Skipping cleanup for ${emojiName} - user fetch was incomplete or failed`);
                    continue;
                }
                
                const reaction = message.reactions.cache.get(emojiName);
                if (!reaction) continue;
                
                // Safety check: only cleanup if we fetched close to the expected count
                const expectedCount = reaction.count;
                const fetchedCount = reactedUserIds.size;
                if (fetchedCount < expectedCount - 5) {
                    console.warn(`⚠️ Skipping cleanup for ${emojiName} - fetched ${fetchedCount} but expected ${expectedCount} (too many missing)`);
                    continue;
                }
                
                // Get all members with this role
                // Use role.members which is already cached and efficient
                try {
                    const membersWithRole = roleInfo.role.members;
                    console.log(`📋 Found ${membersWithRole.size} members with ${roleInfo.name} role`);
                    
                    for (const [memberId, member] of membersWithRole) {
                        // If member has role but didn't react, remove the role
                        if (!reactedUserIds.has(memberId)) {
                            try {
                                await member.roles.remove(roleInfo.role);
                                results.removed.push(`${member.user.username} (${memberId}) - ${roleInfo.name}`);
                                synced++;
                                console.log(`✅ Removed ${roleInfo.name} role from ${member.user.username} (no reaction)`);
                            } catch (error) {
                                errors++;
                                results.errors.push(`${member.user.username} - ${roleInfo.name} removal: ${error.message}`);
                                console.error(`❌ Error removing ${roleInfo.name} role from ${member.user.username}:`, error);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error processing members with ${roleInfo.name} role:`, error);
                    results.errors.push(`Error processing ${roleInfo.name} role members: ${error.message}`);
                }
            }

            // Build response
            let response = `✅ **Reaction Role Sync Complete**\n\n`;
            response += `**Message:** ${messageId}\n`;
            response += `**Channel:** <#${channelId}>\n\n`;

            if (results.added.length > 0) {
                response += `**✅ Added Roles (${results.added.length}):**\n`;
                results.added.slice(0, 20).forEach(item => {
                    response += `• ${item}\n`;
                });
                if (results.added.length > 20) {
                    response += `... and ${results.added.length - 20} more\n`;
                }
                response += `\n`;
            }

            if (results.removed.length > 0) {
                response += `**🗑️ Removed Orphaned Roles (${results.removed.length}):**\n`;
                results.removed.slice(0, 20).forEach(item => {
                    response += `• ${item}\n`;
                });
                if (results.removed.length > 20) {
                    response += `... and ${results.removed.length - 20} more\n`;
                }
                response += `\n`;
            }

            if (results.errors.length > 0) {
                response += `**❌ Errors (${results.errors.length}):**\n`;
                results.errors.slice(0, 10).forEach(error => {
                    response += `• ${error}\n`;
                });
                if (results.errors.length > 10) {
                    response += `... and ${results.errors.length - 10} more\n`;
                }
                response += `\n`;
            }

            if (results.added.length === 0 && results.errors.length === 0) {
                response += `✨ All users already have the correct roles!\n`;
            }

            response += `\n**Total synced:** ${synced}\n`;
            response += `**Errors:** ${errors}`;

            await interaction.editReply({
                content: response.length > 2000 ? response.substring(0, 1997) + '...' : response
            });

            console.log(`✅ Admin ${interaction.user.username} synced reaction roles. Added: ${synced}, Errors: ${errors}`);
        } catch (error) {
            console.error('❌ Error syncing reaction roles:', error);
            await interaction.editReply({
                content: `❌ Error syncing reaction roles: ${error.message}`
            });
        }
    }
};

