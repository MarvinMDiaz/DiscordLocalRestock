const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`❌ No command matching ${interaction.commandName} was found for autocomplete.`);
                return;
            }

            if (command.autocomplete) {
                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    console.error(`❌ Error handling autocomplete for ${interaction.commandName}:`, error);
                }
            }
            return;
        }

        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`❌ No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                // Check if error is related to interaction timing out
                if (error.code === 10062 || error.code === 40060) {
                    console.log(`⏱️ Interaction timed out for ${interaction.commandName} (this is normal for old interactions)`);
                    return;
                }

                console.error(`❌ Error executing ${interaction.commandName}:`, error);

                const errorMessage = 'There was an error while executing this command!';

                if (!interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({ content: errorMessage, ephemeral: true });
                    } catch (replyError) {
                        // If we can't reply (likely timed out), just log it
                        console.log('Could not send error message to user');
                    }
                } else if (interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                }
            }
        }

        // Handle button interactions (for approval workflow)
        if (interaction.isButton()) {
            const { customId } = interaction;

            // Approve with note MUST be checked first so it doesn't fall into the generic approve_ handler
            if (customId.startsWith('approve_note_')) {
                const { showApproveWithNoteModal } = require('../utils/approvalManager');
                await showApproveWithNoteModal(interaction);
                return;
            }

            if (customId.startsWith('approve_') || customId.startsWith('reject_')) {
                // This will be handled by the approval manager
                const { handleApprovalButton } = require('../utils/approvalManager');
                await handleApprovalButton(interaction);
                return;
            }

            // Handle button-based restock reporting
            const buttonHandlers = require('../utils/buttonRestockHandler');
            
            if (customId === 'report_restock_button_va') {
                await buttonHandlers.handleRestockButtonClick(interaction, 'va');
                return;
            }
            
            if (customId === 'report_restock_button_md') {
                await buttonHandlers.handleRestockButtonClick(interaction, 'md');
                return;
            }
            
            if (customId === 'report_past_restock_button_va') {
                await buttonHandlers.handlePastRestockButtonClick(interaction, 'va');
                return;
            }
            
            if (customId === 'report_past_restock_button_md') {
                await buttonHandlers.handlePastRestockButtonClick(interaction, 'md');
                return;
            }
            
            if (customId === 'report_upcoming_restock_button_va') {
                await buttonHandlers.handleUpcomingRestockButtonClick(interaction, 'va');
                return;
            }
            
            if (customId === 'report_upcoming_restock_button_md') {
                await buttonHandlers.handleUpcomingRestockButtonClick(interaction, 'md');
                return;
            }
            
            // Handle lookup button clicks
            if (customId === 'lookup_restocks_button_va') {
                await buttonHandlers.handleLookupButtonClick(interaction, 'va');
                return;
            }
            
            if (customId === 'lookup_restocks_button_md') {
                await buttonHandlers.handleLookupButtonClick(interaction, 'md');
                return;
            }

            // Handle confirmation buttons
            if (customId.startsWith('confirm_in_progress_va_')) {
                await buttonHandlers.handleConfirmInProgress(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('confirm_in_progress_md_')) {
                await buttonHandlers.handleConfirmInProgress(interaction, 'md');
                return;
            }

            if (customId.startsWith('confirm_past_va_')) {
                await buttonHandlers.handleConfirmPast(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('confirm_past_md_')) {
                await buttonHandlers.handleConfirmPast(interaction, 'md');
                return;
            }

            if (customId.startsWith('confirm_upcoming_va_')) {
                await buttonHandlers.handleConfirmUpcoming(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('confirm_upcoming_md_')) {
                await buttonHandlers.handleConfirmUpcoming(interaction, 'md');
                return;
            }

            // Handle cancel button
            if (customId.startsWith('cancel_report_')) {
                await buttonHandlers.handleCancelReport(interaction);
                return;
            }
            
            // Handle admin control panel buttons
            if (customId.startsWith('admin_')) {
                const adminHandlers = require('../utils/adminButtonHandler');
                
                if (customId === 'admin_remove_cooldown_store_type' || customId.startsWith('admin_remove_cooldown_location_')) {
                    // These are handled separately below
                    return;
                }
                
                await adminHandlers.handleAdminButtonClick(interaction);
                return;
            }
        }

        // Handle select menu interactions (for button-based restock reporting)
        if (interaction.isStringSelectMenu()) {
            const { customId } = interaction;
            const buttonHandlers = require('../utils/buttonRestockHandler');
            const adminHandlers = require('../utils/adminButtonHandler');

            // Handle admin remove cooldown store type selection
            if (customId === 'admin_remove_cooldown_store_type') {
                await adminHandlers.handleRemoveCooldownStoreType(interaction);
                return;
            }

            // Handle admin remove cooldown location selection
            if (customId.startsWith('admin_remove_cooldown_location_')) {
                await adminHandlers.handleRemoveCooldownLocation(interaction);
                return;
            }

            // Handle store type selection (in-progress)
            if (customId === 'restock_store_type_va') {
                await buttonHandlers.handleStoreTypeSelect(interaction, 'va');
                return;
            }
            
            if (customId === 'restock_store_type_md') {
                await buttonHandlers.handleStoreTypeSelect(interaction, 'md');
                return;
            }

            // Handle location selection (in-progress)
            if (customId.startsWith('restock_location_va_')) {
                await buttonHandlers.handleLocationSelect(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('restock_location_md_')) {
                await buttonHandlers.handleLocationSelect(interaction, 'md');
                return;
            }

            // Handle store type selection (past restock)
            if (customId === 'past_restock_store_type_va') {
                await buttonHandlers.handlePastRestockStoreTypeSelect(interaction, 'va');
                return;
            }
            
            if (customId === 'past_restock_store_type_md') {
                await buttonHandlers.handlePastRestockStoreTypeSelect(interaction, 'md');
                return;
            }

            // Handle location selection (past restock)
            if (customId.startsWith('past_restock_location_va_')) {
                await buttonHandlers.handlePastRestockLocationSelect(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('past_restock_location_md_')) {
                await buttonHandlers.handlePastRestockLocationSelect(interaction, 'md');
                return;
            }

            // Handle date selection (past restock dropdown)
            if (customId.startsWith('past_restock_date_select_va_')) {
                await buttonHandlers.handlePastRestockDateSelect(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('past_restock_date_select_md_')) {
                await buttonHandlers.handlePastRestockDateSelect(interaction, 'md');
                return;
            }

            // Handle store type selection (upcoming restock)
            if (customId === 'upcoming_restock_store_type_va') {
                await buttonHandlers.handleUpcomingRestockStoreTypeSelect(interaction, 'va');
                return;
            }
            
            if (customId === 'upcoming_restock_store_type_md') {
                await buttonHandlers.handleUpcomingRestockStoreTypeSelect(interaction, 'md');
                return;
            }

            // Handle location selection (upcoming restock)
            if (customId.startsWith('upcoming_restock_location_va_')) {
                await buttonHandlers.handleUpcomingRestockLocationSelect(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('upcoming_restock_location_md_')) {
                await buttonHandlers.handleUpcomingRestockLocationSelect(interaction, 'md');
                return;
            }

            // Handle date selection (upcoming restock dropdown)
            if (customId.startsWith('upcoming_restock_date_select_va_')) {
                await buttonHandlers.handleUpcomingRestockDateSelect(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('upcoming_restock_date_select_md_')) {
                await buttonHandlers.handleUpcomingRestockDateSelect(interaction, 'md');
                return;
            }

            // Handle admin store management select menus
            if (customId === 'admin_store_action') {
                await adminHandlers.handleStoreAction(interaction);
                return;
            }

            if (customId === 'admin_store_add_type') {
                await handleStoreAddType(interaction);
                return;
            }

            if (customId.startsWith('admin_store_add_region_')) {
                await adminHandlers.handleStoreAdd(interaction);
                return;
            }

            if (customId === 'admin_store_remove_type') {
                await handleStoreRemoveType(interaction);
                return;
            }

            if (customId.startsWith('admin_store_remove_region_')) {
                await handleStoreRemoveRegion(interaction);
                return;
            }

            if (customId.startsWith('admin_store_remove_location_')) {
                await adminHandlers.handleStoreRemove(interaction);
                return;
            }

            // Handle admin role management select menus
            if (customId === 'admin_role_action') {
                await adminHandlers.handleRoleAction(interaction);
                return;
            }

            if (customId === 'admin_role_remove_select') {
                await adminHandlers.handleRoleRemove(interaction);
                return;
            }

            // Handle config setup selects
            if (customId === 'admin_config_channel_select') {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleConfigChannelSelect(interaction);
                return;
            }

            if (customId === 'admin_config_role_select') {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleConfigRoleSelect(interaction);
                return;
            }

            if (customId === 'admin_config_quick_setup_select') {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleQuickSetupSelect(interaction);
                return;
            }

        }

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            const { customId } = interaction;
            if (customId.startsWith('approve_note_modal_')) {
                const { handleApproveWithNoteSubmit } = require('../utils/approvalManager');
                await handleApproveWithNoteSubmit(interaction);
                return;
            }
            
            // Handle past restock date modal submissions
            if (customId.startsWith('past_restock_date_va_')) {
                const { handlePastRestockDateSubmit } = require('../utils/buttonRestockHandler');
                await handlePastRestockDateSubmit(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('past_restock_date_md_')) {
                const { handlePastRestockDateSubmit } = require('../utils/buttonRestockHandler');
                await handlePastRestockDateSubmit(interaction, 'md');
                return;
            }

            // Handle upcoming restock note modal submissions
            if (customId.startsWith('upcoming_restock_note_va_')) {
                const { handleUpcomingRestockNoteSubmit } = require('../utils/buttonRestockHandler');
                await handleUpcomingRestockNoteSubmit(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('upcoming_restock_note_md_')) {
                const { handleUpcomingRestockNoteSubmit } = require('../utils/buttonRestockHandler');
                await handleUpcomingRestockNoteSubmit(interaction, 'md');
                return;
            }

            // Handle custom store name modal submissions (in-progress)
            if (customId.startsWith('custom_store_name_in_progress_va_')) {
                const { handleCustomStoreNameInProgress } = require('../utils/buttonRestockHandler');
                await handleCustomStoreNameInProgress(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('custom_store_name_in_progress_md_')) {
                const { handleCustomStoreNameInProgress } = require('../utils/buttonRestockHandler');
                await handleCustomStoreNameInProgress(interaction, 'md');
                return;
            }

            // Handle custom store name modal submissions (upcoming)
            if (customId.startsWith('custom_store_name_upcoming_va_')) {
                const { handleCustomStoreNameUpcoming } = require('../utils/buttonRestockHandler');
                await handleCustomStoreNameUpcoming(interaction, 'va');
                return;
            }
            
            if (customId.startsWith('custom_store_name_upcoming_md_')) {
                const { handleCustomStoreNameUpcoming } = require('../utils/buttonRestockHandler');
                await handleCustomStoreNameUpcoming(interaction, 'md');
                return;
            }


            // Handle admin store add modal
            if (customId.startsWith('admin_store_add_modal_')) {
                await handleStoreAddModal(interaction);
                return;
            }

            // Handle admin role add modal
            if (customId === 'admin_role_add_modal') {
                const adminHandlers = require('../utils/adminButtonHandler');
                await adminHandlers.handleRoleAdd(interaction);
                return;
            }

            // Handle config setup modals
            if (customId === 'admin_config_quick_setup') {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleQuickSetupSubmit(interaction);
                return;
            }

            if (customId.startsWith('admin_config_channel_')) {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleConfigChannelSubmit(interaction);
                return;
            }

            if (customId.startsWith('admin_config_role_')) {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleConfigRoleSubmit(interaction);
                return;
            }

            if (customId === 'admin_config_essential_channels') {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleEssentialChannelsSubmit(interaction);
                return;
            }

            if (customId === 'admin_config_essential_roles') {
                const configHandlers = require('../utils/configSetupHandler');
                await configHandlers.handleEssentialRolesSubmit(interaction);
                return;
            }
        }
    },
};

// Helper functions for store management
async function handleStoreAddType(interaction) {
    const storeType = interaction.values[0];
    
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
    const regionSelect = new StringSelectMenuBuilder()
        .setCustomId(`admin_store_add_region_${storeType}_`)
        .setPlaceholder('Select region...')
        .addOptions(
            { label: 'Virginia (VA)', value: 'va', emoji: '🔵' },
            { label: 'Maryland (MD)', value: 'md', emoji: '🔴' }
        );

    const row = new ActionRowBuilder().addComponents(regionSelect);
    await interaction.update({
        content: '**Add Store**\nSelect region:',
        components: [row]
    });
}

async function handleStoreRemoveType(interaction) {
    const storeType = interaction.values[0];
    
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
    const regionSelect = new StringSelectMenuBuilder()
        .setCustomId(`admin_store_remove_region_${storeType}_`)
        .setPlaceholder('Select region...')
        .addOptions(
            { label: 'Virginia (VA)', value: 'va', emoji: '🔵' },
            { label: 'Maryland (MD)', value: 'md', emoji: '🔴' }
        );

    const row = new ActionRowBuilder().addComponents(regionSelect);
    await interaction.update({
        content: '**Remove Store**\nSelect region:',
        components: [row]
    });
}

async function handleStoreRemoveRegion(interaction) {
    const customId = interaction.customId;
    const parts = customId.replace('admin_store_remove_region_', '').split('_');
    const storeType = parts[0];
    const region = interaction.values[0];

    const configManager = require('../utils/configManager');
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
    
    const stores = await configManager.getAllStores();
    const regionStores = stores[storeType]?.[region] || [];

    if (regionStores.length === 0) {
        return await interaction.update({
            content: '❌ No stores found for this region.',
            components: []
        });
    }

    const locationSelect = new StringSelectMenuBuilder()
        .setCustomId(`admin_store_remove_location_${storeType}_${region}`)
        .setPlaceholder('Select store to remove...')
        .addOptions(regionStores.slice(0, 25).map(store => {
            const parts = store.split(' - ');
            const name = parts.length >= 2 ? parts.slice(1, 2).join(' - ') : parts[1];
            return {
                label: name.length > 100 ? name.substring(0, 97) + '...' : name,
                value: store,
                description: parts.length > 2 ? parts.slice(2).join(' - ').substring(0, 100) : undefined
            };
        }));

    const row = new ActionRowBuilder().addComponents(locationSelect);
    await interaction.update({
        content: '**Remove Store**\nSelect store to remove:',
        components: [row]
    });
}

async function handleStoreAddModal(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const customId = interaction.customId;
    const parts = customId.replace('admin_store_add_modal_', '').split('_');
    const storeType = parts[0];
    const region = parts[1];
    const storeName = interaction.fields.getTextInputValue('store_name');

    const configManager = require('../utils/configManager');
    const { EmbedBuilder } = require('discord.js');
    const added = await configManager.addStore(storeType, region, storeName);

    if (added) {
        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Store Added')
            .setDescription(`**${storeName}** has been added to the ${storeType} ${region} list.`)
            .addFields(
                { name: '🏪 Store', value: storeName, inline: false },
                { name: '👤 Added By', value: interaction.user.username, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply({
            content: '❌ Store already exists in the list.'
        });
    }
}
