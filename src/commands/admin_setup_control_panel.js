const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_control_panel')
        .setDescription('Send admin control panel with all admin buttons (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('Channel ID where to send the panel (defaults to configured admin channel)')
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

            await interaction.deferReply({ ephemeral: true });

            // Get channel ID from option or use current channel
            const channelIdOption = interaction.options.getString('channel_id');
            const adminChannelId = channelIdOption || interaction.channelId;
            
            const channel = interaction.client.channels.cache.get(adminChannelId);
            
            if (!channel) {
                return await interaction.editReply({
                    content: `❌ Channel not found. Please check the channel ID: ${adminChannelId}\n\n💡 **Tip:** If you didn't specify a channel ID, the panel will be sent to the current channel.`
                });
            }

            // Create main embed
            const embed = new EmbedBuilder()
                .setColor(0x5865F2) // Discord blurple
                .setTitle('⚙️ Admin Control Panel')
                .setDescription('**Quick access to all admin functions**\n━━━━━━━━━━━━━━━━━━━━━━━━')
                .addFields(
                    { 
                        name: '🗑️ Data Management', 
                        value: '**Clear Restocks** - Clear all restock data, cooldowns, and history\n**Remove Cooldown** - Remove cooldown for a specific store', 
                        inline: false 
                    },
                    { 
                        name: '📊 Reports & Testing', 
                        value: '**Test Weekly Report** - Send test weekly reports\n**Test Cleanup** - Test weekly cleanup process', 
                        inline: false 
                    },
                    { 
                        name: '🔧 Button Setup', 
                        value: '**Setup VA Buttons** - Create report buttons for VA channel\n**Setup MD Buttons** - Create report buttons for MD channel\n**Setup Lookup Buttons** - Create lookup buttons for VA & MD', 
                        inline: false 
                    },
                    { 
                        name: '🏪 Store Management', 
                        value: '**Manage Stores** - Add/remove stores from lists', 
                        inline: false 
                    }
                )
                .setFooter({ text: '💡 Click the buttons below to perform admin actions' })
                .setTimestamp();

            // Create button rows (max 5 buttons per row, Discord limit)
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('admin_clear_restocks')
                        .setLabel('Clear Restocks')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️'),
                    new ButtonBuilder()
                        .setCustomId('admin_remove_cooldown_start')
                        .setLabel('Remove Cooldown')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⏰'),
                    new ButtonBuilder()
                        .setCustomId('admin_test_weekly_report')
                        .setLabel('Test Weekly Report')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📊'),
                    new ButtonBuilder()
                        .setCustomId('admin_test_cleanup')
                        .setLabel('Test Cleanup')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🧹')
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('admin_setup_va_buttons')
                        .setLabel('Setup VA Buttons')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔵'),
                    new ButtonBuilder()
                        .setCustomId('admin_setup_md_buttons')
                        .setLabel('Setup MD Buttons')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔵'),
                    new ButtonBuilder()
                        .setCustomId('admin_setup_va_lookup')
                        .setLabel('Setup VA Lookup')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔍'),
                    new ButtonBuilder()
                        .setCustomId('admin_setup_md_lookup')
                        .setLabel('Setup MD Lookup')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔍')
                );

            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('admin_manage_stores')
                        .setLabel('Manage Stores')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏪')
                );

            await channel.send({
                embeds: [embed],
                components: [row1, row2, row3]
            });

            await interaction.editReply({
                content: `✅ Admin control panel sent to <#${adminChannelId}>`
            });

            console.log(`✅ Admin ${interaction.user.username} set up admin control panel in channel ${adminChannelId}`);

        } catch (error) {
            console.error('❌ Error in admin_setup_control_panel command:', error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error setting up the control panel. Please check the console for details.'
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error setting up the control panel. Please check the console for details.',
                    ephemeral: true
                });
            }
        }
    },
};

