const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_list_reaction_users')
        .setDescription('List all users who reacted to the reaction role message')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('Message ID to check (optional, uses config if not provided)')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        // Defer immediately to avoid timeout
        await interaction.deferReply({ ephemeral: true });

        const messageId = interaction.options.getString('message_id') || config.channels.reactionRoleMessageId || '1434620131002159176';
        const channelId = config.channels.reactionRoles || '1346593375431954515';
        
        try {
            const channel = interaction.client.channels.cache.get(channelId) || await interaction.client.channels.fetch(channelId);
            if (!channel) {
                return await interaction.editReply({
                    content: `❌ Channel not found. Please check the channel ID: ${channelId}`
                });
            }

            // Fetch the message with timeout protection
            let message;
            try {
                message = await Promise.race([
                    channel.messages.fetch(messageId),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Message fetch timeout')), 10000))
                ]);
            } catch (error) {
                if (error.message === 'Message fetch timeout') {
                    return await interaction.editReply({
                        content: `❌ Timeout fetching message. The message might not exist or the channel is slow.`
                    });
                }
                throw error;
            }
            
            if (!message) {
                return await interaction.editReply({
                    content: `❌ Message not found. Please check the message ID: ${messageId}`
                });
            }

            // Send initial response to show we're working
            await interaction.editReply({
                content: `⏳ Fetching reactions... This may take a moment.`
            });

            // Map emojis to role names
            const emojiMap = {
                '🚨': { name: 'VA Alerts', roleId: config.roles.localRestockVA },
                'rotating_light': { name: 'VA Alerts', roleId: config.roles.localRestockVA },
                '📋': { name: 'MD Alerts', roleId: config.roles.localRestockMD },
                'clipboard': { name: 'MD Alerts', roleId: config.roles.localRestockMD },
                '📅': { name: 'Weekly VA Recap', roleId: config.roles.weeklyReportVA },
                'date': { name: 'Weekly VA Recap', roleId: config.roles.weeklyReportVA },
                '📊': { name: 'Weekly MD Recap', roleId: config.roles.weeklyReportMD },
                'bar_chart': { name: 'Weekly MD Recap', roleId: config.roles.weeklyReportMD }
            };

            const results = [];
            const guild = interaction.guild;

            // Fetch all reactions first
            await message.reactions.fetch();

            // Process each reaction (limit to avoid timeout)
            let processedCount = 0;
            const maxReactions = 10; // Limit to prevent timeout
            
            for (const [emojiKey, reaction] of message.reactions.cache) {
                if (processedCount >= maxReactions) {
                    console.log(`⚠️ Limiting to ${maxReactions} reactions to avoid timeout`);
                    break;
                }
                processedCount++;
                const emojiInfo = emojiMap[reaction.emoji.name] || emojiMap[reaction.emoji.toString()];
                
                if (!emojiInfo) {
                    continue; // Skip unhandled emojis
                }

                try {
                    // Fetch all users who reacted (paginate if needed, but limit to prevent timeout)
                    const users = [];
                    let lastUserId = null;
                    let fetchedCount = 0;
                    const expectedCount = reaction.count;
                    const maxUsersToFetch = 500; // Limit to prevent timeout

                    while (fetchedCount < expectedCount && fetchedCount < maxUsersToFetch) {
                        const fetchOptions = { limit: 100 };
                        if (lastUserId) {
                            fetchOptions.after = lastUserId;
                        }

                        const fetchedUsers = await reaction.users.fetch(fetchOptions);
                        if (fetchedUsers.size === 0) break;

                        for (const [userId, user] of fetchedUsers) {
                            if (!users.find(u => u.id === userId) && fetchedCount < maxUsersToFetch) {
                                users.push(user);
                                fetchedCount++;
                                lastUserId = userId;
                            }
                        }

                        if (fetchedUsers.size < 100) break;
                        await new Promise(resolve => setTimeout(resolve, 50)); // Rate limit delay
                    }
                    
                    if (fetchedCount >= maxUsersToFetch) {
                        console.log(`⚠️ Limited user fetch to ${maxUsersToFetch} users for ${emojiKey}`);
                    }

                    // Filter out bots and check who has the role (limit checks to prevent timeout)
                    const humanUsers = users.filter(u => !u.bot);
                    const usersWithRole = [];
                    const usersWithoutRole = [];
                    const maxRoleChecks = 200; // Limit role checks to prevent timeout
                    let roleChecksDone = 0;

                    for (const user of humanUsers.slice(0, maxRoleChecks)) {
                        try {
                            const member = await guild.members.fetch(user.id).catch(() => null);
                            if (member) {
                                const hasRole = member.roles.cache.has(emojiInfo.roleId);
                                if (hasRole) {
                                    usersWithRole.push(user);
                                } else {
                                    usersWithoutRole.push(user);
                                }
                            }
                            roleChecksDone++;
                            
                            // Small delay every 50 checks to avoid rate limits
                            if (roleChecksDone % 50 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                        } catch (error) {
                            // User might have left server
                            usersWithoutRole.push(user);
                        }
                    }
                    
                    if (humanUsers.length > maxRoleChecks) {
                        console.log(`⚠️ Limited role checks to ${maxRoleChecks} users for ${emojiKey} (${humanUsers.length} total)`);
                    }

                    results.push({
                        emoji: reaction.emoji.toString(),
                        emojiName: reaction.emoji.name,
                        roleName: emojiInfo.name,
                        totalReactions: reaction.count,
                        humanUsers: humanUsers.length,
                        usersWithRole: usersWithRole.length,
                        usersWithoutRole: usersWithoutRole.length,
                        usersWithRoleList: usersWithRole,
                        usersWithoutRoleList: usersWithoutRole
                    });
                } catch (error) {
                    console.error(`❌ Error processing reaction ${emojiKey}:`, error);
                    results.push({
                        emoji: reaction.emoji.toString(),
                        emojiName: reaction.emoji.name,
                        error: error.message
                    });
                }
            }

            // Build response embed
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📊 Reaction Role Analysis')
                .setDescription(`Message ID: \`${messageId}\`\nChannel: <#${channelId}>`)
                .setTimestamp();

            for (const result of results) {
                if (result.error) {
                    embed.addFields({
                        name: `${result.emoji} ${result.emojiName || 'Unknown'}`,
                        value: `❌ Error: ${result.error}`,
                        inline: false
                    });
                    continue;
                }

                let fieldValue = `**Role:** ${result.roleName}\n`;
                fieldValue += `**Total Reactions:** ${result.totalReactions}\n`;
                fieldValue += `**Human Users:** ${result.humanUsers}\n`;
                fieldValue += `**✅ Has Role:** ${result.usersWithRole}\n`;
                fieldValue += `**❌ Missing Role:** ${result.usersWithoutRole}\n\n`;

                if (result.usersWithoutRoleList.length > 0) {
                    fieldValue += `**Users Missing Role (first 10):**\n`;
                    result.usersWithoutRoleList.slice(0, 10).forEach(user => {
                        fieldValue += `• ${user.username} (${user.id})\n`;
                    });
                    if (result.usersWithoutRoleList.length > 10) {
                        fieldValue += `... and ${result.usersWithoutRoleList.length - 10} more\n`;
                    }
                }

                embed.addFields({
                    name: `${result.emoji} ${result.emojiName || 'Unknown'}`,
                    value: fieldValue.length > 1024 ? fieldValue.substring(0, 1021) + '...' : fieldValue,
                    inline: false
                });
            }

            if (results.length === 0) {
                embed.setDescription('No reactions found on this message.');
            }

            await interaction.editReply({ embeds: [embed] });

            console.log(`✅ Admin ${interaction.user.username} listed reaction users for message ${messageId}`);
        } catch (error) {
            console.error('❌ Error listing reaction users:', error);
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        }
    }
};

