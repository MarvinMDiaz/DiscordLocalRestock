const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { sendWeeklyReports } = require('../utils/weeklyReportGenerator');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_test_weekly_report')
        .setDescription('Test weekly report - sends VA and MD recap reports (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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

            await interaction.deferReply({ ephemeral: true });

            // Get channel IDs
            const vaChannelId = config.channels.weeklyReportVA || config.channels.localRestockVA;
            const mdChannelId = config.channels.weeklyReportMD || config.channels.localRestockMD;

            // Send reports
            await sendWeeklyReports(interaction.client);

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0x4CAF50) // Green
                .setTitle('✅ Weekly Reports Sent')
                .setDescription('Weekly recap reports have been sent to their respective channels.')
                .addFields(
                    { name: '🛍️ VA Report', value: `<#${vaChannelId}>`, inline: true },
                    { name: '🛍️ MD Report', value: `<#${mdChannelId}>`, inline: true },
                    { name: '👤 Tested By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(`✅ Admin ${interaction.user.username} tested weekly reports`);

        } catch (error) {
            console.error('❌ Error in admin_test_weekly_report command:', error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error sending the weekly reports. Please check the console for details.'
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error sending the weekly reports. Please check the console for details.',
                    ephemeral: true
                });
            }
        }
    },
};


