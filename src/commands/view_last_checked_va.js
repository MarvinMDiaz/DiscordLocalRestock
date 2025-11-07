const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { handleLastCheckedButtonClick } = require('../utils/buttonRestockHandler');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view_last_checked_va')
        .setDescription('View last checked times for Virginia stores')
        .addStringOption(option =>
            option.setName('store')
                .setDescription('Specific store to check (optional - leave blank to see all)')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const allStores = [
            ...(config.stores?.target?.va || []),
            ...(config.stores?.bestbuy?.va || []),
            ...(config.stores?.barnesandnoble?.va || [])
        ];
        
        const filtered = allStores
            .filter(store => store.toLowerCase().includes(focusedValue.toLowerCase()))
            .slice(0, 25);
        
        await interaction.respond(
            filtered.map(store => ({
                name: store.length > 100 ? store.substring(0, 97) + '...' : store,
                value: store
            }))
        );
    },

    async execute(interaction) {
        const storeOption = interaction.options.getString('store');
        
        if (storeOption) {
            // Show specific store
            await handleLastCheckedSpecificStore(interaction, 'va', storeOption);
        } else {
            // Show select menu to choose between all or specific store
            await handleLastCheckedMenu(interaction, 'va');
        }
    }
};

async function handleLastCheckedMenu(interaction, region) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`last_checked_mode_${region}`)
        .setPlaceholder('Choose how to view last checked stores...')
        .addOptions(
            { label: 'View All Last Checked Stores', value: 'all', emoji: '📋', description: 'Show all stores that have been checked' },
            { label: 'Lookup Specific Store', value: 'specific', emoji: '🔍', description: 'Search for a specific store' }
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        content: '**View Last Checked Stores**\n\nChoose an option:',
        components: [row],
        ephemeral: true
    });
}

async function handleLastCheckedSpecificStore(interaction, region, storeName) {
    await handleLastCheckedButtonClick(interaction, region, storeName);
}

