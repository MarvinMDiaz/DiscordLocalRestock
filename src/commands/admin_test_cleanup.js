const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const dataManager = require('../utils/dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_test_cleanup')
        .setDescription('Test weekly cleanup - moves current week to previous week (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            // Get config to check admin role
            const config = require('../../config/config.json');
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

            // Get current data before cleanup
            const allData = dataManager.getData();
            const restockCount = allData.restocks.length;
            const cooldownCount = allData.cooldowns.length;
            const storesWithCurrentWeek = allData.last_restocks.filter(s => s.current_week_restock_date).length;
            const storesWithPreviousWeek = allData.last_restocks.filter(s => s.previous_week_restock_date).length;

            // Run cleanup
            await dataManager.cleanupOldData();

            // Get data after cleanup
            const afterData = dataManager.getData();
            const storesWithCurrentWeekAfter = afterData.last_restocks.filter(s => s.current_week_restock_date).length;
            const storesWithPreviousWeekAfter = afterData.last_restocks.filter(s => s.previous_week_restock_date).length;

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // Green
                .setTitle('🧹 Weekly Cleanup Test Completed')
                .setDescription('Weekly cleanup has been executed. Current week data moved to previous week.')
                .addFields(
                    { name: '📊 Restocks Cleared', value: `${restockCount} restock reports`, inline: true },
                    { name: '⏰ Cooldowns Cleared', value: `${cooldownCount} cooldown entries`, inline: true },
                    { name: '📅 Week Migration', value: `${storesWithCurrentWeek} → ${storesWithPreviousWeekAfter} stores with previous week data`, inline: false },
                    { name: '🔄 Current Week Reset', value: `${storesWithCurrentWeek} stores → ${storesWithCurrentWeekAfter} stores (now null)`, inline: false },
                    { name: '👤 Executed By', value: interaction.user.username, inline: true }
                )
                .setFooter({ text: 'Use /lookup_va_restocks or /lookup_md_restocks to verify changes' })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            console.log(`✅ Admin ${interaction.user.username} tested weekly cleanup`);

        } catch (error) {
            console.error('❌ Error in admin_test_cleanup command:', error);
            await interaction.reply({
                content: '❌ There was an error testing cleanup. Please try again.',
                ephemeral: true
            });
        }
    },
};

