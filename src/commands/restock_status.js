const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dataManager = require('../utils/dataManager');
const { gateChannel } = require('../utils/channelGate');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lookup_va_restocks')
        .setDescription('View restock dates for Virginia stores (current and previous week)'),

    async execute(interaction) {
        try {
            const config = require('../../config/config.json');
            const cmd = interaction.commandName || '';
            
            // Gate channel access
            const gate = gateChannel(cmd, interaction.channelId);
            if (!gate.allowed) {
                return await interaction.reply({
                    content: `❌ This command can only be used in ${gate.channelName}. Please use this command in the correct channel.`,
                    ephemeral: true
                });
            }
            
            const isVA = cmd.includes('_va_') || cmd.endsWith('_va_restocks');
            const isMD = cmd.includes('_md_') || cmd.endsWith('_md_restocks');
            
            // Get store restock history from last_restocks
            const lastRestocks = dataManager.getLastRestocks();
            
            // Build allowed stores list from new structure (target + bestbuy + barnesandnoble)
            let allowedStores = [];
            if (isVA) {
                allowedStores = [
                    ...(config.stores?.target?.va || []),
                    ...(config.stores?.bestbuy?.va || []),
                    ...(config.stores?.barnesandnoble?.va || [])
                ];
            } else if (isMD) {
                allowedStores = [
                    ...(config.stores?.target?.md || []),
                    ...(config.stores?.bestbuy?.md || []),
                    ...(config.stores?.barnesandnoble?.md || [])
                ];
            }

            // Filter to only show stores from the allowed region
            const regionRestocks = lastRestocks.filter(storeData => {
                if (allowedStores.length === 0) return true;
                return allowedStores.includes(storeData.store);
            });

            if (regionRestocks.length === 0) {
                return await interaction.reply({
                    content: '📭 **No stores have reported restocks this week.**',
                    ephemeral: true
                });
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x00BFFF) // Blue
                .setTitle('📊 Restock Status - Weekly Overview')
                .setDescription(isVA ? 'Showing restock dates for Virginia stores' : (isMD ? 'Showing restock dates for Maryland stores' : 'Showing restock dates for each store'))
                .setTimestamp();

            // Add fields for each store showing current and previous week dates
            for (const storeData of regionRestocks) {
                const currentWeekDate = storeData.current_week_restock_date 
                    ? `<t:${Math.floor(new Date(storeData.current_week_restock_date).getTime() / 1000)}:R>`
                    : 'Not Restocked';
                
                const previousWeekDate = storeData.previous_week_restock_date 
                    ? `<t:${Math.floor(new Date(storeData.previous_week_restock_date).getTime() / 1000)}:R>`
                    : 'N/A';

                embed.addFields({
                    name: `🏪 ${storeData.store}`,
                    value: `**Current Week Restock Date:** ${currentWeekDate}\n**Previous Week Restock Date:** ${previousWeekDate}`,
                    inline: false
                });
            }

            // Add footer
            embed.setFooter({
                text: `Data resets weekly on ${config.settings?.cleanupDay || 'Sunday'}`
            });

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('❌ Error in restock_status command:', error);
            await interaction.reply({
                content: '❌ There was an error retrieving restock status. Please try again.',
                ephemeral: true
            });
        }
    },
}; 