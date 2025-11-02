const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const configManager = require('../utils/configManager');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_manage_stores')
        .setDescription('Add or remove stores from the list (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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

            // Show action selection
            const actionSelect = new StringSelectMenuBuilder()
                .setCustomId('admin_store_action')
                .setPlaceholder('Select action...')
                .addOptions(
                    { label: 'Add Store', value: 'add', emoji: '➕', description: 'Add a new store to the list' },
                    { label: 'Remove Store', value: 'remove', emoji: '➖', description: 'Remove a store from the list' },
                    { label: 'View All Stores', value: 'view', emoji: '📋', description: 'View all stores by type and region' }
                );

            const row = new ActionRowBuilder().addComponents(actionSelect);

            await interaction.editReply({
                content: '**Store Management**\nSelect an action to manage stores:',
                components: [row]
            });

        } catch (error) {
            console.error('❌ Error in admin_manage_stores command:', error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error. Please check the console for details.'
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error. Please check the console for details.',
                    ephemeral: true
                });
            }
        }
    },
};

