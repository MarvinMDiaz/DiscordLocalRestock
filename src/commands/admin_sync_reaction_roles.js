const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_sync_reaction_roles')
        .setDescription('Sync all reactions on the reaction role message with user roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

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

            // Process each emoji reaction
            for (const [emojiName, roleInfo] of Object.entries(emojiToRole)) {
                const reaction = message.reactions.cache.get(emojiName);
                if (!reaction) {
                    console.log(`⚠️ No reaction found for ${emojiName}`);
                    continue;
                }

                // Fetch all users who reacted
                let users;
                try {
                    users = await reaction.users.fetch();
                } catch (error) {
                    console.error(`❌ Error fetching users for ${emojiName}:`, error);
                    continue;
                }

                // Process each user
                for (const [userId, user] of users) {
                    // Skip bots
                    if (user.bot) continue;

                    try {
                        const member = await guild.members.fetch(userId);
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

            // Also check for users who have roles but didn't react (cleanup)
            // This is optional - you might want to keep roles even if they unreacted
            // For now, we'll skip this to avoid removing roles unintentionally

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

