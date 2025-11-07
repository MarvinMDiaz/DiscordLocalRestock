const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_button_va')
        .setDescription('Send combined button message in VA report channel (Restock In Progress + Past Restock) (Admin only)')
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('Channel ID where to send buttons (defaults to configured VA report channel)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Get config to check admin role
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

            // Get VA report channel - use option or config or current channel
            // Handle both slash command (has options) and button interaction (no options)
            const channelIdOption = interaction.options?.getString('channel_id');
            const vaReportChannelId = channelIdOption || config.commandChannels.restock_in_progress_va || interaction.channelId;
            
            if (!vaReportChannelId) {
                return await interaction.editReply({
                    content: '❌ No channel specified. Please provide a channel_id option or configure the VA report channel in config.json'
                });
            }

            // Try to get channel from cache or fetch it
            let channel = interaction.client.channels.cache.get(vaReportChannelId);
            
            // If channel not found in cache, it might be from a different server
            // Fall back to current channel if the configured channel doesn't exist
            if (!channel) {
                // Try fetching the channel (will fail if it's in a different server)
                try {
                    channel = await interaction.client.channels.fetch(vaReportChannelId);
                } catch (error) {
                    // Channel doesn't exist in current server, use current channel instead
                    channel = interaction.channel;
                    console.log(`⚠️ Configured VA report channel ${vaReportChannelId} not found in current server. Using current channel ${interaction.channelId} instead.`);
                }
            }
            
            if (!channel) {
                return await interaction.editReply({
                    content: `❌ Channel not found. Using current channel instead.`
                });
            }

            // Create embed for the button message
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
                        name: '📝 Quick Guide', 
                        value: '1️⃣ Click a button below\n2️⃣ Select store type (Target, Best Buy, or Barnes & Noble)\n3️⃣ Choose the location\n4️⃣ ⏰ For past/upcoming restocks: Select date\n5️⃣ 📝 For upcoming: Add note about what will restock\n6️⃣ ✅ Report submitted for approval!', 
                        inline: false 
                    }
                )
                .setTimestamp();

            // Create buttons - three buttons side by side
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('report_restock_button_va')
                        .setLabel('Restock In Progress')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🚨'),
                    new ButtonBuilder()
                        .setCustomId('report_past_restock_button_va')
                        .setLabel('Past Restock')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('report_upcoming_restock_button_va')
                        .setLabel('Upcoming Restock')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📅')
                );

            // Send message to channel
            await channel.send({
                embeds: [embed],
                components: [buttonRow]
            });

            await interaction.editReply({
                content: `✅ Combined button message sent to <#${channel.id}>`
            });

            console.log(`✅ Admin ${interaction.user.username} set up combined buttons in VA report channel`);

        } catch (error) {
            console.error('❌ Error in admin_setup_button_va command:', error);
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

