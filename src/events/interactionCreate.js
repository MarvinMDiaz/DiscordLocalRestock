const { Events } = require('discord.js');
const interactionLogger = require('../utils/interactionLogger');

// Helper function to handle last checked store selection
async function handleLastCheckedStoreSelect(interaction, region) {
    console.log(`🔍 [handleLastCheckedStoreSelect] Starting for region: ${region}`);
    try {
        const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
        const config = require('../../config/config.json');

        const storeTypeSelect = new StringSelectMenuBuilder()
            .setCustomId(`last_checked_store_${region}_type`)
            .setPlaceholder('Select store type...')
            .addOptions(
                { label: 'Target', value: 'target', emoji: '🎯' },
                { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                { label: 'Walmart', value: 'walmart', emoji: '🛒' },
                { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' }
            );

        const row = new ActionRowBuilder().addComponents(storeTypeSelect);

        console.log(`🔍 [handleLastCheckedStoreSelect] Updating interaction for region: ${region}`);
        await interaction.update({
            content: '**Lookup Specific Store**\nSelect the store type:',
            components: [row]
        });
        console.log(`✅ [handleLastCheckedStoreSelect] Successfully updated for region: ${region}`);
    } catch (error) {
        console.error(`❌ [handleLastCheckedStoreSelect] Error for region ${region}:`, error);
        console.error(`❌ [handleLastCheckedStoreSelect] Error stack:`, error.stack);
        throw error;
    }
}

async function handleLastCheckedStoreLocation(interaction, region, storeType) {
    console.log(`🔍 [handleLastCheckedStoreLocation] Starting for region: ${region}, storeType: ${storeType}`);
    try {
        const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
        const config = require('../../config/config.json');
        const buttonHandlers = require('../utils/buttonRestockHandler');

        let stores = [];
        if (storeType === 'target') {
            stores = region === 'va'
                ? (config.stores?.target?.va || [])
                : (config.stores?.target?.md || []);
        } else if (storeType === 'bestbuy') {
            stores = region === 'va'
                ? (config.stores?.bestbuy?.va || [])
                : (config.stores?.bestbuy?.md || []);
        } else if (storeType === 'walmart') {
            stores = region === 'va'
                ? (config.stores?.walmart?.va || [])
                : (config.stores?.walmart?.md || []);
        } else if (storeType === 'barnesandnoble') {
            stores = region === 'va'
                ? (config.stores?.barnesandnoble?.va || [])
                : (config.stores?.barnesandnoble?.md || []);
        }

        console.log(`🔍 [handleLastCheckedStoreLocation] Found ${stores.length} stores for ${storeType} in ${region}`);

        if (stores.length === 0) {
            return await interaction.update({
                content: '❌ No stores found for this type.',
                components: []
            });
        }

        const locationOptions = stores.slice(0, 25).map(store => {
            const parts = store.split(' - ');
            const name = parts.length >= 2 ? parts.slice(1, 2).join(' - ') : parts[1];
            return {
                label: name.length > 100 ? name.substring(0, 97) + '...' : name,
                value: store,
                description: parts.length > 2 ? parts.slice(2).join(' - ') : undefined
            };
        });

        const locationSelect = new StringSelectMenuBuilder()
            .setCustomId(`last_checked_store_${region}_${storeType}`)
            .setPlaceholder('Select store location...')
            .addOptions(locationOptions);

        const row = new ActionRowBuilder().addComponents(locationSelect);

        console.log(`🔍 [handleLastCheckedStoreLocation] Updating interaction with ${locationOptions.length} store options`);
        await interaction.update({
            content: '**Lookup Specific Store**\nSelect the store location:',
            components: [row]
        });
        console.log(`✅ [handleLastCheckedStoreLocation] Successfully updated`);
    } catch (error) {
        console.error(`❌ [handleLastCheckedStoreLocation] Error for region ${region}, storeType ${storeType}:`, error);
        console.error(`❌ [handleLastCheckedStoreLocation] Error stack:`, error.stack);
        throw error;
    }
}

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
            // Log the command
            try {
                await interactionLogger.logCommand(interaction);
            } catch (logError) {
                console.error('❌ Error logging command:', logError);
            }

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
            void interactionLogger.logButton(interaction).catch((logError) => {
                console.error('❌ Error logging button:', logError);
            });

            try {
                const { customId } = interaction;

                const opensApproveNoteModal =
                    customId.startsWith('approve_note_') ||
                    customId.startsWith('rstk_apr_photo_note_') ||
                    customId.startsWith('rstk_apr_nophoto_note_');
                if (opensApproveNoteModal) {
                    const { showApproveWithNoteModal } = require('../utils/approvalManager');
                    await showApproveWithNoteModal(interaction);
                    return;
                }

                const isDirectApproval =
                    customId.startsWith('reject_') ||
                    (customId.startsWith('rstk_apr_photo_') && !customId.startsWith('rstk_apr_photo_note_')) ||
                    (customId.startsWith('rstk_apr_nophoto_') && !customId.startsWith('rstk_apr_nophoto_note_')) ||
                    (customId.startsWith('approve_') && !customId.startsWith('approve_note_'));

                if (isDirectApproval) {
                    const { handleApprovalButton } = require('../utils/approvalManager');
                    await handleApprovalButton(interaction);
                    return;
                }

                if (customId.startsWith('rstk_predict_')) {
                    const predictFlow = require('../utils/predictFlow');
                    await predictFlow.handlePredictButton(interaction);
                    return;
                }

                if (customId.startsWith('crowd_')) {
                    const crowdTracker = require('../utils/crowdTracker');
                    await crowdTracker.handleCrowdButton(interaction);
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

                if (customId === 'nl_btn_report_newlook') {
                    const newLookHandlers = require('../utils/newLookRestockHandler');
                    await newLookHandlers.handleNlReportButton(interaction);
                    return;
                }

                if (customId === 'nl_btn_lookup_newlook') {
                    const newLookHandlers = require('../utils/newLookRestockHandler');
                    await newLookHandlers.handleNlLookupButton(interaction);
                    return;
                }

                // Handle last checked button clicks
                if (customId === 'last_checked_button_va') {
                    console.log(`🔍 [InteractionCreate] Handling last_checked_button_va`);
                    try {
                        await buttonHandlers.handleLastCheckedButtonClick(interaction, 'va');
                    } catch (error) {
                        console.error(`❌ [InteractionCreate] Error in last_checked_button_va handler:`, error);
                        console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                    }
                    return;
                }

                if (customId === 'last_checked_button_md') {
                    console.log(`🔍 [InteractionCreate] Handling last_checked_button_md`);
                    try {
                        await buttonHandlers.handleLastCheckedButtonClick(interaction, 'md');
                    } catch (error) {
                        console.error(`❌ [InteractionCreate] Error in last_checked_button_md handler:`, error);
                        console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                    }
                    return;
                }

                // Handle check store button clicks
                if (customId === 'check_store_button_va') {
                    await buttonHandlers.handleCheckStoreButtonClick(interaction, 'va');
                    return;
                }

                if (customId === 'check_store_button_md') {
                    await buttonHandlers.handleCheckStoreButtonClick(interaction, 'md');
                    return;
                }

                // Handle check store current time button
                if (customId.startsWith('check_store_current_va_')) {
                    await buttonHandlers.handleCheckStoreCurrentTime(interaction, 'va');
                    return;
                }

                if (customId.startsWith('check_store_current_md_')) {
                    await buttonHandlers.handleCheckStoreCurrentTime(interaction, 'md');
                    return;
                }

                const reportReviewNextMatch = customId.match(/^report_review_next_(inprog|past|upcoming)_(va|md)_(.+)$/);
                if (reportReviewNextMatch) {
                    await buttonHandlers.handleReportReviewNext(
                        interaction,
                        reportReviewNextMatch[1],
                        reportReviewNextMatch[2],
                        reportReviewNextMatch[3]
                    );
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

                    // Handle clear restocks confirmation buttons
                    if (customId === 'admin_clear_restocks_confirm_all') {
                        await adminHandlers.handleConfirmClearAll(interaction);
                        return;
                    }

                    if (customId === 'admin_clear_restocks_cancel') {
                        await adminHandlers.handleCancelClearRestocks(interaction);
                        return;
                    }

                    await adminHandlers.handleAdminButtonClick(interaction);
                    return;
                }

                // Handle admin control panel buttons
                if (customId.startsWith('admin_')) {
                    const adminHandlers = require('../utils/adminButtonHandler');

                    if (customId === 'admin_remove_cooldown_store_type' || customId.startsWith('admin_remove_cooldown_location_')) {
                        // These are handled separately below
                        return;
                    }

                    // Handle clear restocks confirmation buttons
                    if (customId === 'admin_clear_restocks_confirm_all') {
                        await adminHandlers.handleConfirmClearAll(interaction);
                        return;
                    }

                    if (customId === 'admin_clear_restocks_cancel') {
                        await adminHandlers.handleCancelClearRestocks(interaction);
                        return;
                    }

                    await adminHandlers.handleAdminButtonClick(interaction);
                    return;
                }

                // Handle config setup buttons
                if (customId.startsWith('admin_config_')) {
                    const configHandlers = require('../utils/configSetupHandler');

                    if (customId === 'admin_config_quick_setup') {
                        await configHandlers.handleQuickSetupSelect(interaction);
                        return;
                    }

                    if (customId.startsWith('admin_config_channel_')) {
                        await configHandlers.handleConfigChannelSubmit(interaction);
                        return;
                    }

                    if (customId.startsWith('admin_config_role_')) {
                        await configHandlers.handleConfigRoleSubmit(interaction);
                        return;
                    }

                    if (customId === 'admin_config_essential_channels') {
                        await configHandlers.handleEssentialChannelsSubmit(interaction);
                        return;
                    }

                    if (customId === 'admin_config_essential_roles') {
                        await configHandlers.handleEssentialRolesSubmit(interaction);
                        return;
                    }
                }

                // If we get here, the button wasn't handled
                console.warn(`⚠️ Unhandled button interaction: ${customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ This button is not yet implemented or there was an error processing it.',
                        ephemeral: true
                    });
                }
            } catch (error) {
                console.error('❌ Error handling button interaction:', error);
                console.error('Button customId:', interaction.customId);
                console.error('Error stack:', error.stack);

                if (!interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({
                            content: '❌ There was an error processing this button. Please try again.',
                            ephemeral: true
                        });
                    } catch (replyError) {
                        console.error('❌ Error sending error reply:', replyError);
                    }
                } else if (interaction.deferred && !interaction.replied) {
                    try {
                        await interaction.editReply({
                            content: '❌ There was an error processing this button. Please try again.'
                        });
                    } catch (editError) {
                        console.error('❌ Error sending error edit:', editError);
                    }
                }
            }
            return;
        }

        // Handle select menu interactions (for button-based restock reporting)
        if (interaction.isStringSelectMenu()) {
            const { customId } = interaction;
            void interactionLogger.logSelectMenu(interaction).catch((logError) => {
                console.error('❌ Error logging select menu:', logError);
            });

            const buttonHandlers = require('../utils/buttonRestockHandler');
            const newLookHandlers = require('../utils/newLookRestockHandler');
            const adminHandlers = require('../utils/adminButtonHandler');

            console.log(`🔍 [InteractionCreate] Handling select menu with customId: ${customId}`);

            if (customId.startsWith('line_estimate_')) {
                await buttonHandlers.handleLineEstimateSelect(interaction);
                return;
            }

            // Handle last checked mode selection (all vs specific) - MUST BE FIRST
            if (customId === 'last_checked_mode_va') {
                console.log(`🔍 [InteractionCreate] Handling last_checked_mode_va, selected: ${interaction.values[0]}`);
                try {
                    const mode = interaction.values[0];
                    if (mode === 'all') {
                        await buttonHandlers.handleLastCheckedDisplay(interaction, 'va');
                    } else if (mode === 'specific') {
                        // Show store selection menu
                        await handleLastCheckedStoreSelect(interaction, 'va');
                    }
                } catch (error) {
                    console.error(`❌ [InteractionCreate] Error in last_checked_mode_va handler:`, error);
                    console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                }
                return;
            }

            if (customId === 'last_checked_mode_md') {
                console.log(`🔍 [InteractionCreate] Handling last_checked_mode_md, selected: ${interaction.values[0]}`);
                try {
                    const mode = interaction.values[0];
                    if (mode === 'all') {
                        await buttonHandlers.handleLastCheckedDisplay(interaction, 'md');
                    } else if (mode === 'specific') {
                        // Show store selection menu
                        await handleLastCheckedStoreSelect(interaction, 'md');
                    }
                } catch (error) {
                    console.error(`❌ [InteractionCreate] Error in last_checked_mode_md handler:`, error);
                    console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                }
                return;
            }

            // New Look (consolidated VA/MD)
            if (customId === 'nl_report_region_pick') {
                await newLookHandlers.handleNlReportRegionPick(interaction);
                return;
            }
            if (customId.startsWith('nl_restock_store_pick_')) {
                await newLookHandlers.handleNlReportStorePick(interaction);
                return;
            }
            if (customId.startsWith('nl_restock_location_')) {
                await newLookHandlers.handleNlReportLocationPick(interaction);
                return;
            }
            if (customId === 'nl_lookup_region_pick') {
                await newLookHandlers.handleNlLookupRegionPick(interaction);
                return;
            }
            if (customId.startsWith('nl_lookup_store_pick_')) {
                await newLookHandlers.handleNlLookupStorePick(interaction);
                return;
            }
            if (customId.startsWith('nl_lookup_scope_')) {
                await newLookHandlers.handleNlLookupScopePick(interaction);
                return;
            }
            if (customId.startsWith('nl_lookup_location_')) {
                await newLookHandlers.handleNlLookupLocationPick(interaction);
                return;
            }

            if (/^rstk_predict_cfgloc_(VA|MD)_/.test(customId)) {
                const predictFlow = require('../utils/predictFlow');
                await predictFlow.handlePredictConfigLocationSelect(interaction);
                return;
            }

            if (/^rstk_predict_pickret_(VA|MD)$/.test(customId)) {
                const predictFlow = require('../utils/predictFlow');
                await predictFlow.handlePredictRetailSelect(interaction);
                return;
            }

            if (customId.startsWith('rstk_predict_sel_')) {
                await interaction.reply({
                    content:
                        'That dropdown is from an older build — use **Pick store** on the newest prediction panel (opens the modal).',
                    ephemeral: true
                });
                return;
            }

            // Handle last checked store type selection
            if (customId === 'last_checked_store_va_type') {
                console.log(`🔍 [InteractionCreate] Handling last_checked_store_va_type, selected: ${interaction.values[0]}`);
                try {
                    const storeType = interaction.values[0];
                    await handleLastCheckedStoreLocation(interaction, 'va', storeType);
                } catch (error) {
                    console.error(`❌ [InteractionCreate] Error in last_checked_store_va_type handler:`, error);
                    console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                }
                return;
            }

            if (customId === 'last_checked_store_md_type') {
                console.log(`🔍 [InteractionCreate] Handling last_checked_store_md_type, selected: ${interaction.values[0]}`);
                try {
                    const storeType = interaction.values[0];
                    await handleLastCheckedStoreLocation(interaction, 'md', storeType);
                } catch (error) {
                    console.error(`❌ [InteractionCreate] Error in last_checked_store_md_type handler:`, error);
                    console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                }
                return;
            }

            // Handle last checked store location selection (final selection)
            if (customId.startsWith('last_checked_store_va_') && customId !== 'last_checked_store_va_type') {
                console.log(`🔍 [InteractionCreate] Handling last_checked_store_va location, customId: ${customId}`);
                try {
                    // Extract store type from customId (e.g., "last_checked_store_va_target" -> "target")
                    const parts = customId.split('_');
                    const storeType = parts[parts.length - 1];
                    console.log(`🔍 [InteractionCreate] Extracted storeType: ${storeType} from customId: ${customId}`);

                    if (storeType !== 'type' && storeType !== 'va' && storeType !== 'md') {
                        const storeName = interaction.values[0];
                        console.log(`🔍 [InteractionCreate] Selected store: ${storeName}`);
                        await buttonHandlers.handleLastCheckedDisplay(interaction, 'va', storeName);
                    } else {
                        console.warn(`⚠️ [InteractionCreate] Invalid storeType extracted: ${storeType}`);
                    }
                } catch (error) {
                    console.error(`❌ [InteractionCreate] Error in last_checked_store_va location handler:`, error);
                    console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                }
                return;
            }

            if (customId.startsWith('last_checked_store_md_') && customId !== 'last_checked_store_md_type') {
                console.log(`🔍 [InteractionCreate] Handling last_checked_store_md location, customId: ${customId}`);
                try {
                    // Extract store type from customId (e.g., "last_checked_store_md_target" -> "target")
                    const parts = customId.split('_');
                    const storeType = parts[parts.length - 1];
                    console.log(`🔍 [InteractionCreate] Extracted storeType: ${storeType} from customId: ${customId}`);

                    if (storeType !== 'type' && storeType !== 'va' && storeType !== 'md') {
                        const storeName = interaction.values[0];
                        console.log(`🔍 [InteractionCreate] Selected store: ${storeName}`);
                        await buttonHandlers.handleLastCheckedDisplay(interaction, 'md', storeName);
                    } else {
                        console.warn(`⚠️ [InteractionCreate] Invalid storeType extracted: ${storeType}`);
                    }
                } catch (error) {
                    console.error(`❌ [InteractionCreate] Error in last_checked_store_md location handler:`, error);
                    console.error(`❌ [InteractionCreate] Error stack:`, error.stack);
                }
                return;
            }

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

            // Handle admin clear restocks action selection
            if (customId === 'admin_clear_restocks_action') {
                await adminHandlers.handleClearRestocksAction(interaction);
                return;
            }

            // Handle admin clear restocks store type selection
            if (customId === 'admin_clear_restocks_store_type') {
                await adminHandlers.handleClearRestocksStoreType(interaction);
                return;
            }

            // Handle admin clear restocks store location selection
            if (customId.startsWith('admin_clear_restocks_store_') && !customId.includes('_time_')) {
                await adminHandlers.handleClearRestocksStoreLocation(interaction);
                return;
            }

            // Handle admin clear restocks store time period selection
            if (customId.startsWith('admin_clear_restocks_store_time_')) {
                await adminHandlers.handleClearRestocksStoreTime(interaction);
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

            // Handle check store type selection
            if (customId === 'check_store_type_va') {
                await buttonHandlers.handleCheckStoreTypeSelect(interaction, 'va');
                return;
            }

            if (customId === 'check_store_type_md') {
                await buttonHandlers.handleCheckStoreTypeSelect(interaction, 'md');
                return;
            }

            // Handle check store location selection
            if (customId.startsWith('check_store_location_va_')) {
                await buttonHandlers.handleCheckStoreLocation(interaction, 'va');
                return;
            }

            if (customId.startsWith('check_store_location_md_')) {
                await buttonHandlers.handleCheckStoreLocation(interaction, 'md');
                return;
            }

            // Handle check store hour selection
            if (customId.startsWith('check_store_hour_va_')) {
                await buttonHandlers.handleCheckStoreHour(interaction, 'va');
                return;
            }

            if (customId.startsWith('check_store_hour_md_')) {
                await buttonHandlers.handleCheckStoreHour(interaction, 'md');
                return;
            }

            // Handle check store minute selection
            if (customId.startsWith('check_store_minute_va_')) {
                await buttonHandlers.handleCheckStoreMinute(interaction, 'va');
                return;
            }

            if (customId.startsWith('check_store_minute_md_')) {
                await buttonHandlers.handleCheckStoreMinute(interaction, 'md');
                return;
            }

            // Handle check store AM/PM selection
            if (customId.startsWith('check_store_ampm_va_')) {
                await buttonHandlers.handleCheckStoreAmPm(interaction, 'va');
                return;
            }

            if (customId.startsWith('check_store_ampm_md_')) {
                await buttonHandlers.handleCheckStoreAmPm(interaction, 'md');
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
            // Log the modal submission
            try {
                await interactionLogger.logModal(interaction);
            } catch (logError) {
                console.error('❌ Error logging modal:', logError);
            }

            const { customId } = interaction;
            if (
                customId.startsWith('rstk_note_modal_photo_') ||
                customId.startsWith('rstk_note_modal_nophoto_') ||
                customId.startsWith('approve_note_modal_')
            ) {
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
            if (customId.startsWith('nl_custom_inprog_va_')) {
                const { handleNlCustomStoreInProgressSubmit } = require('../utils/buttonRestockHandler');
                await handleNlCustomStoreInProgressSubmit(interaction, 'va');
                return;
            }

            if (customId.startsWith('nl_custom_inprog_md_')) {
                const { handleNlCustomStoreInProgressSubmit } = require('../utils/buttonRestockHandler');
                await handleNlCustomStoreInProgressSubmit(interaction, 'md');
                return;
            }

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
