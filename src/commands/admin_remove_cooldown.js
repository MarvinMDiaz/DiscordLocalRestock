const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const dataManager = require('../utils/dataManager');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_remove_cooldown')
        .setDescription('Remove cooldown for a specific store (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('store_type')
                .setDescription('Select the store type')
                .setRequired(true)
                .addChoices(
                    { name: 'Target', value: 'target' },
                    { name: 'Best Buy', value: 'bestbuy' },
                    { name: 'Barnes & Noble', value: 'barnesandnoble' }
                )
        )
        .addStringOption(option =>
            option.setName('location')
                .setDescription('Select the store location')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        
        if (focusedOption.name === 'location') {
            const storeType = interaction.options.getString('store_type');
            
            if (!storeType) {
                return interaction.respond([]);
            }

            let stores = [];
            if (storeType === 'target') {
                stores = [
                    ...(config.stores.target.va || []),
                    ...(config.stores.target.md || [])
                ];
            } else if (storeType === 'bestbuy') {
                stores = [
                    ...(config.stores.bestbuy.va || []),
                    ...(config.stores.bestbuy.md || [])
                ];
            } else if (storeType === 'barnesandnoble') {
                stores = [
                    ...(config.stores.barnesandnoble.va || []),
                    ...(config.stores.barnesandnoble.md || [])
                ];
            }

            // Filter stores based on user input
            const filtered = stores
                .filter(store => {
                    const searchValue = focusedOption.value.toLowerCase();
                    const storeName = store.toLowerCase();
                    return storeName.includes(searchValue);
                })
                .slice(0, 25) // Discord limit is 25 choices
                .map(store => {
                    const parts = store.split(' - ');
                    const name = parts.length >= 2 ? parts.slice(1, 2).join(' - ') : parts[1];
                    return {
                        name: name.length > 100 ? name.substring(0, 97) + '...' : name,
                        value: store
                    };
                });

            await interaction.respond(filtered);
        }
    },

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

            const storeType = interaction.options.getString('store_type');
            const store = interaction.options.getString('location');
            
            if (!store || !storeType) {
                return await interaction.editReply({
                    content: '❌ Please select both store type and location.',
                    ephemeral: true
                });
            }

            // Get all cooldowns
            const cooldowns = dataManager.getCooldowns();
            const initialCount = cooldowns.length;

            // Remove all cooldowns for this store (both user-specific and store-wide)
            const filteredCooldowns = cooldowns.filter(c => c.store !== store);
            const removedCount = initialCount - filteredCooldowns.length;

            // Update data
            dataManager.data.cooldowns = filteredCooldowns;
            await dataManager.saveData();

            // Reload to verify
            await dataManager.reload();
            const verifyCooldowns = dataManager.getCooldowns();
            const verifyCount = verifyCooldowns.filter(c => c.store === store).length;

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor(0x4CAF50) // Green
                .setTitle('✅ Cooldown Removed')
                .setDescription(`Cooldown has been removed for the specified store.`)
                .addFields(
                    { name: '🏪 Store', value: store, inline: false },
                    { name: '📊 Cooldowns Removed', value: `${removedCount} cooldown entry/entries`, inline: true },
                    { name: '✅ Verified', value: verifyCount === 0 ? 'No cooldowns remaining' : `⚠️ ${verifyCount} cooldown(s) still exist`, inline: true },
                    { name: '👤 Removed By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(`✅ Admin ${interaction.user.username} removed ${removedCount} cooldown(s) for ${store}`);

        } catch (error) {
            console.error('❌ Error in admin_remove_cooldown command:', error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error removing the cooldown. Please try again.'
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error removing the cooldown. Please try again.',
                    ephemeral: true
                });
            }
        }
    },
};


