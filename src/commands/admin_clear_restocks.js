const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const dataManager = require('../utils/dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_clear_restocks')
        .setDescription('Clear all restock data (Admin only)')
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

            await interaction.deferReply({ ephemeral: true });

            // Get current data for summary
            const allData = dataManager.getData();
            const restockCount = allData.restocks ? allData.restocks.length : 0;
            const cooldownCount = allData.cooldowns ? allData.cooldowns.length : 0;
            const historyCount = allData.last_restocks ? allData.last_restocks.length : 0;

            // Clear the data
            allData.restocks = [];
            allData.cooldowns = [];
            allData.last_restocks = []; // Clear weekly restock history

            // Save the cleared data
            await dataManager.saveData();
            
            // Reload to verify it was saved
            await dataManager.reload();
            const verifyData = dataManager.getData();
            const verifyRestocks = verifyData.restocks ? verifyData.restocks.length : 0;
            const verifyCooldowns = verifyData.cooldowns ? verifyData.cooldowns.length : 0;
            const verifyHistory = verifyData.last_restocks ? verifyData.last_restocks.length : 0;

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B) // Red
                .setTitle('🗑️ Restock Data Cleared')
                .setDescription('All restock data has been cleared from the database.')
                .addFields(
                    { name: '📊 Restocks Removed', value: `${restockCount} restock reports`, inline: true },
                    { name: '⏰ Cooldowns Removed', value: `${cooldownCount} cooldown entries`, inline: true },
                    { name: '📅 History Cleared', value: `${historyCount} store history entries`, inline: true },
                    { name: '✅ Verified', value: `Restocks: ${verifyRestocks}, Cooldowns: ${verifyCooldowns}, History: ${verifyHistory}`, inline: false },
                    { name: '👤 Cleared By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(`✅ Admin ${interaction.user.username} cleared ${restockCount} restocks, ${cooldownCount} cooldowns, and ${historyCount} history entries`);
            console.log(`🔍 Verification: ${verifyRestocks} restocks, ${verifyCooldowns} cooldowns, ${verifyHistory} history entries remaining`);

        } catch (error) {
            console.error('❌ Error in admin_clear_restocks command:', error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error clearing restock data. Please try again.'
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error clearing restock data. Please try again.',
                    ephemeral: true
                });
            }
        }
    },
};

