const { SlashCommandBuilder } = require('discord.js');
const restockStatusModule = require('./restock_status');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lookup_va_restocks')
        .setDescription('View restock dates for Virginia stores (current and previous week)'),
    async execute(interaction) {
        const originalExecute = restockStatusModule.execute;
        await originalExecute.call(this, interaction);
    }
};

