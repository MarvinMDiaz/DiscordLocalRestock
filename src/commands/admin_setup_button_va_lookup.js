const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_button_va_lookup')
        .setDescription('Send a button message in VA lookup channel for restock status lookup (Admin only)')
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('Channel ID where to send button (defaults to configured VA lookup channel)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const adminRoleId = config.roles.admin;
            const member = interaction.member;

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
            const vaLookupChannelId = channelIdOption || config.commandChannels.lookup_va_restocks || interaction.channelId;
            
            if (!vaLookupChannelId) {
                return await interaction.editReply({
                    content: '❌ No channel specified. Please provide a channel_id option or configure the VA lookup channel in config.json'
                });
            }

            // Try to get channel from cache or fetch it
            let channel = interaction.client.channels.cache.get(vaLookupChannelId);
            
            // If channel not found in cache, it might be from a different server
            // Fall back to current channel if the configured channel doesn't exist
            if (!channel) {
                try {
                    channel = await interaction.client.channels.fetch(vaLookupChannelId);
                } catch (error) {
                    // Channel doesn't exist in current server, use current channel instead
                    channel = interaction.channel;
                    console.log(`⚠️ Configured VA lookup channel ${vaLookupChannelId} not found in current server. Using current channel ${interaction.channelId} instead.`);
                }
            }
            
            if (!channel) {
                return await interaction.editReply({
                    content: `❌ Channel not found. Using current channel instead.`
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2) // Discord blurple - nice blue
                .setTitle('📊 Restock Status Lookup')
                .setDescription('**View restock dates for Virginia stores**\n━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields(
                    { 
                        name: '📋 What You\'ll See', 
                        value: '• 📅 **Current Week** restock dates\n• 📅 **Previous Week** restock dates\n• 🏪 All VA stores (Target, Best Buy, Barnes & Noble)\n• ⏰ Relative timestamps (e.g., "2 hours ago")', 
                        inline: false 
                    },
                    { 
                        name: '💡 Quick Access', 
                        value: 'Click the button below to instantly view all restock status information!', 
                        inline: false 
                    }
                )
                .setTimestamp();

            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('lookup_restocks_button_va')
                        .setLabel('View Restock Status')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📊')
                );

            await channel.send({
                embeds: [embed],
                components: [buttonRow]
            });

            await interaction.editReply({
                content: `✅ Button message sent to <#${channel.id}>`
            });

            console.log(`✅ Admin ${interaction.user.username} set up lookup button in VA lookup channel`);

        } catch (error) {
            console.error('❌ Error in admin_setup_button_va_lookup command:', error);
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

