const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_button_md')
        .setDescription('Send combined button message in MD report channel (Restock In Progress + Past Restock) (Admin only)')
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('Channel ID where to send buttons (defaults to configured MD report channel)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const adminRoleId = config.roles.admin;
            const member = interaction.member;

            // Check if user has admin role or admin permissions
            const hasAdminRole = member.roles.cache.has(adminRoleId);
            const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPermission) {
                return await interaction.reply({
                    content: '❌ **Access Denied**: You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            // Only defer if not already deferred (check if it's a button interaction)
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }

            // Handle both slash command (has options) and button interaction (no options)
            const channelIdOption = interaction.options?.getString('channel_id');
            const mdReportChannelId = channelIdOption || config.commandChannels.restock_in_progress_md || interaction.channelId;
            
            if (!mdReportChannelId) {
                return await interaction.editReply({
                    content: '❌ No channel specified. Please provide a channel_id option or configure the MD report channel in config.json'
                });
            }

            // Try to get channel from cache or fetch it
            let channel = interaction.client.channels.cache.get(mdReportChannelId);
            
            // If channel not found in cache, it might be from a different server
            // Fall back to current channel if the configured channel doesn't exist
            if (!channel) {
                try {
                    channel = await interaction.client.channels.fetch(mdReportChannelId);
                } catch (error) {
                    // Channel doesn't exist in current server, use current channel instead
                    channel = interaction.channel;
                    console.log(`⚠️ Configured MD report channel ${mdReportChannelId} not found in current server. Using current channel ${interaction.channelId} instead.`);
                }
            }
            
            if (!channel) {
                return await interaction.editReply({
                    content: `❌ Channel not found. Using current channel instead.`
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2) // Discord blurple - nice blue
                .setTitle('📋 Report Restock')
                .setDescription('**Choose how you want to report a restock:**\n━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields(
                    { 
                        name: '🚨 Restock In Progress', 
                        value: 'Report a restock that is **currently happening** at a store location.', 
                        inline: false 
                    },
                    { 
                        name: '📋 Past Restock', 
                        value: 'Log a restock that **already occurred** (for historical tracking only).', 
                        inline: false 
                    },
                    { 
                        name: '📅 Upcoming Restock', 
                        value: 'Report a restock that is **scheduled to happen** in the future. Include what will be restocking and when.', 
                        inline: false 
                    },
                    { 
                        name: '✅ Mark Store as Checked', 
                        value: 'Let others know you checked a store (even if no restock). This helps track when stores were last visited.', 
                        inline: false 
                    },
                    { 
                        name: '📝 Quick Guide', 
                        value: '1️⃣ Click a button below\n2️⃣ Select store type (Target, Best Buy, or Barnes & Noble)\n3️⃣ Choose the location\n4️⃣ ⏰ For past/upcoming restocks: Select date\n5️⃣ 📝 For upcoming: Add note about what will restock\n6️⃣ ✅ Report submitted for approval!', 
                        inline: false 
                    }
                )
                .setTimestamp();

            // Create buttons - four buttons (Discord allows 5 per row)
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('report_restock_button_md')
                        .setLabel('Restock In Progress')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🚨'),
                    new ButtonBuilder()
                        .setCustomId('report_past_restock_button_md')
                        .setLabel('Past Restock')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('report_upcoming_restock_button_md')
                        .setLabel('Upcoming Restock')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📅'),
                    new ButtonBuilder()
                        .setCustomId('check_store_button_md')
                        .setLabel('Mark Store as Checked')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✅')
                );

            await channel.send({
                embeds: [embed],
                components: [buttonRow]
            });

            await interaction.editReply({
                content: `✅ Combined button message sent to <#${channel.id}>`
            });

            console.log(`✅ Admin ${interaction.user.username} set up combined buttons in MD report channel`);

        } catch (error) {
            console.error('❌ Error in admin_setup_button_md command:', error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error setting up the button. Please check the console for details.'
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error setting up the button. Please check the console for details.',
                    ephemeral: true
                });
            }
        }
    },
};

