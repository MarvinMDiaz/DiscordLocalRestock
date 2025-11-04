const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dataManager = require('./dataManager');
const config = require('../../config/config.json');

// Temporary storage for modal data (since customId has 100 char limit)
const modalDataCache = new Map();

/**
 * Generate a short ID for modal customId
 */
function generateModalId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Send a message that auto-deletes after 10 seconds
 */
async function sendAutoDeleteMessage(interaction, content, ephemeral = false) {
    try {
        let message;
        if (interaction.deferred) {
            message = await interaction.editReply({ content });
        } else if (interaction.replied) {
            message = await interaction.followUp({ content, ephemeral });
        } else {
            message = await interaction.reply({ content, ephemeral });
        }

        // Delete after 10 seconds if not ephemeral (ephemeral messages can't be deleted)
        if (!ephemeral && message) {
            setTimeout(async () => {
                try {
                    await message.delete().catch(() => {});
                } catch (error) {
                    // Silently fail - message might already be deleted
                }
            }, 10000);
        }
    } catch (error) {
        console.error('Error sending auto-delete message:', error);
    }
}

/**
 * Handle button click for reporting restock in progress (VA)
 */
async function handleRestockButtonClick(interaction, region) {
    try {
        const channelId = region === 'va' 
            ? config.commandChannels.restock_in_progress_va
            : config.commandChannels.restock_in_progress_md;
        
        // Test channel exception: 1435130632320712844
        const testChannelId = '1435130632320712844';
        if (interaction.channelId !== channelId && interaction.channelId !== testChannelId) {
            return await interaction.reply({
                content: `❌ This button can only be used in <#${channelId}>`,
                ephemeral: true
            });
        }

        const storeTypeSelect = new StringSelectMenuBuilder()
            .setCustomId(`restock_store_type_${region}`)
            .setPlaceholder('Select store type...')
            .addOptions(
                { label: 'Target', value: 'target', emoji: '🎯' },
                { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' },
                { label: 'Other', value: 'other', emoji: '❓', description: 'Enter a custom store name' }
            );

        const row = new ActionRowBuilder().addComponents(storeTypeSelect);

        await interaction.reply({
            content: '**Step 1 of 2**: Select the store type',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling restock button click (${region}):`, error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle button click for reporting past restock (VA/MD)
 */
async function handlePastRestockButtonClick(interaction, region) {
    try {
        const channelId = region === 'va' 
            ? config.commandChannels.report_past_restock_va
            : config.commandChannels.report_past_restock_md;
        
        // Test channel exception: 1435130632320712844
        const testChannelId = '1435130632320712844';
        if (interaction.channelId !== channelId && interaction.channelId !== testChannelId) {
            return await interaction.reply({
                content: `❌ This button can only be used in <#${channelId}>`,
                ephemeral: true
            });
        }

        const storeTypeSelect = new StringSelectMenuBuilder()
            .setCustomId(`past_restock_store_type_${region}`)
            .setPlaceholder('Select store type...')
            .addOptions(
                { label: 'Target', value: 'target', emoji: '🎯' },
                { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' }
            );

        const row = new ActionRowBuilder().addComponents(storeTypeSelect);

        await interaction.reply({
            content: '**Step 1 of 3**: Select the store type',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling past restock button click (${region}):`, error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle store type selection (for in-progress restocks)
 */
async function handleStoreTypeSelect(interaction, region) {
    try {
        const storeType = interaction.values[0];
        
        // Handle "Other" option - show modal for custom store name and location
        if (storeType === 'other') {
            const sessionId = generateModalId();
            
            // Store session data
            modalDataCache.set(sessionId, {
                userId: interaction.user.id,
                region: region,
                reportType: 'in_progress',
                storeType: 'other',
                timestamp: Date.now()
            });
            
            // Show modal for custom store name and location
            const modal = new ModalBuilder()
                .setCustomId(`custom_store_name_in_progress_${region}_${sessionId}`)
                .setTitle('Enter Custom Store Details');

            const storeNameInput = new TextInputBuilder()
                .setCustomId('custom_store_name')
                .setLabel('Store Name')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Walmart, Local Card Shop, etc.')
                .setRequired(true)
                .setMaxLength(100);

            const storeLocationInput = new TextInputBuilder()
                .setCustomId('custom_store_location')
                .setLabel('Store Location/Address')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., City, State or Full Address')
                .setRequired(true)
                .setMaxLength(200);

            modal.addComponents(
                new ActionRowBuilder().addComponents(storeNameInput),
                new ActionRowBuilder().addComponents(storeLocationInput)
            );

            await interaction.showModal(modal);
            return;
        }
        
        let stores = [];
        if (storeType === 'target') {
            stores = config.stores.target[region] || [];
        } else if (storeType === 'bestbuy') {
            stores = config.stores.bestbuy[region] || [];
        } else if (storeType === 'barnesandnoble') {
            stores = config.stores.barnesandnoble[region] || [];
        }

        if (stores.length === 0) {
            return await interaction.update({
                content: '❌ No stores found for this type.',
                components: [],
                ephemeral: true
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
            .setCustomId(`restock_location_${region}_${storeType}`)
            .setPlaceholder('Select store location...')
            .addOptions(locationOptions);

        const row = new ActionRowBuilder().addComponents(locationSelect);

        await interaction.update({
            content: '**Step 2 of 2**: Select the store location',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling store type select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error. Please try again.',
                components: []
            });
        }
    }
}

/**
 * Handle store type selection (for past restocks)
 */
async function handlePastRestockStoreTypeSelect(interaction, region) {
    try {
        const storeType = interaction.values[0];
        
        let stores = [];
        if (storeType === 'target') {
            stores = config.stores.target[region] || [];
        } else if (storeType === 'bestbuy') {
            stores = config.stores.bestbuy[region] || [];
        } else if (storeType === 'barnesandnoble') {
            stores = config.stores.barnesandnoble[region] || [];
        }

        if (stores.length === 0) {
            return await interaction.update({
                content: '❌ No stores found for this type.',
                components: [],
                ephemeral: true
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
            .setCustomId(`past_restock_location_${region}_${storeType}`)
            .setPlaceholder('Select store location...')
            .addOptions(locationOptions);

        const row = new ActionRowBuilder().addComponents(locationSelect);

        await interaction.update({
            content: '**Step 2 of 3**: Select the store location',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling past restock store type select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error. Please try again.',
                components: []
            });
        }
    }
}

/**
 * Handle location selection and show confirmation (in-progress)
 */
async function handleLocationSelect(interaction, region) {
    try {
        const customId = interaction.customId;
        const storeType = customId.replace(`restock_location_${region}_`, '');
        const store = interaction.values[0];
        
        const userId = interaction.user.id;
        const username = interaction.user.username;

        const cooldownCheck = await checkCooldowns(userId, store);
        if (!cooldownCheck.allowed) {
            const response = await interaction.update({
                content: `⏰ **Cooldown Active**: ${cooldownCheck.reason}`,
                components: [],
                ephemeral: true
            });
            return response;
        }

        // Generate session ID and store data temporarily
        const sessionId = generateModalId();
        modalDataCache.set(sessionId, {
            store: store,
            storeType: storeType,
            region: region,
            userId: userId,
            username: username,
            reportType: 'in_progress',
            timestamp: Date.now()
        });

        // Show confirmation screen with warning
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFF6B35)
            .setTitle('⚠️ Confirm Restock Report')
            .setDescription('**Please confirm this is an actual restock before submitting.**')
            .addFields(
                { name: '🏪 Store', value: formattedStore, inline: false },
                { name: '📅 Type', value: 'Restock In Progress', inline: true },
                { name: '📍 Region', value: region.toUpperCase(), inline: true },
                { 
                    name: '🚨 Warning', 
                    value: '**Submitting false restock reports can result in a ban or other disciplinary action.**\n\nOnly submit if this is a genuine restock event.', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Click "Confirm & Submit" to send for approval, or "Cancel" to go back' });

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_in_progress_${region}_${sessionId}`)
                    .setLabel('✅ Confirm & Submit')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`cancel_report_${sessionId}`)
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.update({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling location select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error. Please try again.',
                components: []
            });
        }
    }
}

/**
 * Handle location selection for past restocks (show date dropdown)
 */
async function handlePastRestockLocationSelect(interaction, region) {
    try {
        const customId = interaction.customId;
        const storeType = customId.replace(`past_restock_location_${region}_`, '');
        const store = interaction.values[0];

        // Generate a short ID for tracking (Discord customId limit is 100 chars)
        const sessionId = generateModalId();
        
        // Store the store info temporarily in cache (expires after 5 minutes)
        modalDataCache.set(sessionId, {
            store: store,
            storeType: storeType,
            region: region,
            userId: interaction.user.id,
            timestamp: Date.now()
        });

        // Clean up old cache entries (older than 5 minutes)
        const now = Date.now();
        for (const [id, data] of modalDataCache.entries()) {
            if (now - data.timestamp > 5 * 60 * 1000) {
                modalDataCache.delete(id);
            }
        }

        // Create date select menu with dropdown options
        const dateSelect = new StringSelectMenuBuilder()
            .setCustomId(`past_restock_date_select_${region}_${sessionId}`)
            .setPlaceholder('Select when this restock occurred...')
            .addOptions(
                { label: 'Today', value: '0', emoji: '📅', description: 'Restock happened today' },
                { label: 'Yesterday', value: '1', emoji: '📅', description: '1 day ago' },
                { label: '2 Days Ago', value: '2', emoji: '📅', description: '2 days ago' },
                { label: '3 Days Ago', value: '3', emoji: '📅', description: '3 days ago' },
                { label: '4 Days Ago', value: '4', emoji: '📅', description: '4 days ago' },
                { label: '5 Days Ago', value: '5', emoji: '📅', description: '5 days ago' }
            );

        const row = new ActionRowBuilder().addComponents(dateSelect);

        await interaction.update({
            content: '**Step 3 of 3**: Select when this restock occurred',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling past restock location select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle date selection and show confirmation (past restocks)
 */
async function handlePastRestockDateSelect(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.replace(`past_restock_date_select_${region}_`, '');
        const daysAgo = interaction.values[0];

        // Retrieve store info from cache
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData) {
            return await interaction.update({
                content: '❌ Session expired. Please start over by clicking the button again.',
                components: [],
                ephemeral: true
            });
        }

        // Verify it's the same user
        if (cachedData.userId !== interaction.user.id) {
            return await interaction.update({
                content: '❌ This form was started by a different user. Please start over.',
                components: [],
                ephemeral: true
            });
        }

        const store = cachedData.store;
        const days = parseInt(daysAgo);
        const now = new Date();
        const restockDate = new Date(now);
        restockDate.setDate(restockDate.getDate() - days);
        restockDate.setHours(0, 0, 0, 0);

        const dateInput = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;

        // Update cache with date info
        cachedData.restockDate = restockDate;
        cachedData.dateInput = dateInput;
        cachedData.reportType = 'past';
        cachedData.username = interaction.user.username;
        modalDataCache.set(sessionId, cachedData);

        // Show confirmation screen with warning
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ Confirm Past Restock Report')
            .setDescription('**Please confirm this is an actual restock before submitting.**')
            .addFields(
                { name: '🏪 Store', value: formattedStore, inline: false },
                { name: '📅 Restock Date', value: `<t:${Math.floor(restockDate.getTime() / 1000)}:F>`, inline: true },
                { name: '📝 Date Input', value: dateInput, inline: true },
                { name: '📍 Region', value: region.toUpperCase(), inline: true },
                { name: 'ℹ️ Note', value: 'This will be logged only (no public alert)', inline: false },
                { 
                    name: '🚨 Warning', 
                    value: '**Submitting false restock reports can result in a ban or other disciplinary action.**\n\nOnly submit if this is a genuine restock event.', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Click "Confirm & Submit" to send for approval, or "Cancel" to go back' });

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_past_${region}_${sessionId}`)
                    .setLabel('✅ Confirm & Submit')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`cancel_report_${sessionId}`)
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.update({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling past restock date select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error. Please try again.'
            });
        }
    }
}

/**
 * Process past restock submission (shared logic)
 */
async function processPastRestockSubmission(interaction, region, store, storeType, restockDate, dateInput, sessionId) {
    try {
        const userId = interaction.user.id;
        const username = interaction.user.username;

        // Clean up cache
        if (sessionId) {
            modalDataCache.delete(sessionId);
        }

        const cooldownCheck = await checkCooldowns(userId, store);
        if (!cooldownCheck.allowed) {
            await interaction.editReply({
                content: `⏰ **Cooldown Active**: ${cooldownCheck.reason}`,
                ephemeral: true
            });
            return;
        }

        const restockId = generateId();
        const now = new Date();
        const weekStart = getWeekStart(restockDate);

        const restockReport = {
            id: restockId,
            store: store,
            notes: '',
            date: restockDate.toISOString(),
            reported_by: userId,
            reported_by_username: username,
            status: 'pending',
            week_start: weekStart.toISOString().split('T')[0],
            created_at: now.toISOString(),
            is_past_restock: true,
            restock_date_input: dateInput,
            source: 'button'
        };

        await dataManager.addRestock(restockReport);
        console.log('💾 Saved past restock to database with ID:', restockId);

        const cooldown = {
            user_id: userId,
            store: store,
            last_report: now.toISOString(),
            expires_at: new Date(now.getTime() + (36 * 60 * 60 * 1000)).toISOString()
        };
        await dataManager.addCooldown(cooldown);

        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const approvalEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('📋 Past Restock Report - Pending Approval')
            .setDescription('A past restock has been reported and is awaiting approval. This will be logged only (no alert).')
            .addFields(
                { name: '🏪 Store', value: store, inline: true },
                { name: '👤 Reported By', value: username, inline: true },
                { name: '📅 Restock Date', value: `<t:${Math.floor(restockDate.getTime() / 1000)}:F>`, inline: true },
                { name: '📝 Date Input', value: dateInput, inline: true },
                { name: '🆔 Report ID', value: restockId, inline: true },
                { name: '📱 Source', value: 'Button Workflow', inline: true }
            );

        approvalEmbed.setFooter({ text: 'Use the buttons below to approve or reject this report' });

        const approveButtonId = `approve_${restockId}`;
        const rejectButtonId = `reject_${restockId}`;
        
        const approvalRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(approveButtonId)
                    .setLabel('✅ Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`approve_note_${restockId}`)
                    .setLabel('✅ Approve + Note')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(rejectButtonId)
                    .setLabel('❌ Reject')
                    .setStyle(ButtonStyle.Danger)
            );

        // Determine approval channel based on region
        const approvalChannelId = region === 'md' 
            ? config.channels.restockApprovalsMD 
            : config.channels.restockApprovals;

        try {
            if (approvalChannelId && approvalChannelId.trim() !== '') {
                const approvalChannel = interaction.client.channels.cache.get(approvalChannelId);
                if (approvalChannel) {
                    // Get admin mentions with region
                    const { getAdminMentions } = require('./approvalManager');
                    const adminMentions = await getAdminMentions(region);
                    const mentionText = adminMentions ? `${adminMentions} New approval request!` : 'New approval request!';
                    
                    await approvalChannel.send({
                        content: mentionText,
                        embeds: [approvalEmbed],
                        components: [approvalRow]
                    });
                }
            }
        } catch (sendErr) {
            console.error('⚠️ Could not send to approval channel:', sendErr.message);
        }

        await interaction.editReply({
            content: `✅ **Past Restock Report Submitted!**\n\n🏪 **Store**: ${store}\n📅 **Date**: ${dateInput}\n\nYour report has been submitted and is awaiting approval. This will be logged for historical tracking only (no alert will be sent).`,
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error processing past restock submission (${region}):`, error);
        throw error;
    }
}

/**
 * Handle modal submission for past restock date
 */
async function handlePastRestockDateSubmit(interaction, region) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const customId = interaction.customId;
        const sessionId = customId.replace(`past_restock_date_${region}_`, '');
        
        // Retrieve store info from cache
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData) {
            return await interaction.editReply({
                content: '❌ Session expired. Please start over by clicking the button again.',
                ephemeral: true
            });
        }

        // Verify it's the same user
        if (cachedData.userId !== interaction.user.id) {
            return await interaction.editReply({
                content: '❌ This form was started by a different user. Please start over.',
                ephemeral: true
            });
        }

        const store = cachedData.store;
        const storeType = cachedData.storeType;
        
        const dateInput = interaction.fields.getTextInputValue('restock_date');
        const userId = interaction.user.id;
        const username = interaction.user.username;

        // Parse date input
        let restockDate;
        try {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
                restockDate = new Date(dateInput.trim() + 'T00:00:00');
            } else {
                const lowerInput = dateInput.toLowerCase().trim();
                const now = new Date();
                if (lowerInput === 'yesterday' || lowerInput === '1 day ago') {
                    restockDate = new Date(now);
                    restockDate.setDate(restockDate.getDate() - 1);
                } else if (lowerInput === 'today') {
                    restockDate = new Date(now);
                } else {
                    restockDate = new Date(dateInput);
                    if (isNaN(restockDate.getTime())) {
                        throw new Error('Invalid date format');
                    }
                }
            }
            restockDate.setHours(0, 0, 0, 0); // Set to start of day
        } catch (error) {
            return await interaction.editReply({
                content: '❌ Invalid date format. Please use a date like "2024-01-15", "Yesterday", or "2 days ago".',
                ephemeral: true
            });
        }

        await processPastRestockSubmission(interaction, region, store, storeType, restockDate, dateInput, sessionId);

    } catch (error) {
        console.error(`❌ Error handling past restock date submit (${region}):`, error);
        if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error submitting your report. Please try again.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❌ There was an error submitting your report. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle button click for reporting upcoming restock (VA/MD)
 */
async function handleUpcomingRestockButtonClick(interaction, region) {
    try {
        const channelId = region === 'va' 
            ? config.commandChannels.restock_in_progress_va
            : config.commandChannels.restock_in_progress_md;
        
        // Test channel exception: 1435130632320712844
        const testChannelId = '1435130632320712844';
        if (interaction.channelId !== channelId && interaction.channelId !== testChannelId) {
            return await interaction.reply({
                content: `❌ This button can only be used in <#${channelId}>`,
                ephemeral: true
            });
        }

        const storeTypeSelect = new StringSelectMenuBuilder()
            .setCustomId(`upcoming_restock_store_type_${region}`)
            .setPlaceholder('Select store type...')
            .addOptions(
                { label: 'Target', value: 'target', emoji: '🎯' },
                { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' },
                { label: 'Other', value: 'other', emoji: '❓', description: 'Enter a custom store name' }
            );

        const row = new ActionRowBuilder().addComponents(storeTypeSelect);

        await interaction.reply({
            content: '**Step 1 of 4**: Select the store type',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling upcoming restock button click (${region}):`, error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle store type selection (for upcoming restocks)
 */
async function handleUpcomingRestockStoreTypeSelect(interaction, region) {
    try {
        const storeType = interaction.values[0];
        
        // Handle "Other" option - show modal for custom store name and location
        if (storeType === 'other') {
            const sessionId = generateModalId();
            
            // Store session data
            modalDataCache.set(sessionId, {
                userId: interaction.user.id,
                region: region,
                reportType: 'upcoming',
                storeType: 'other',
                timestamp: Date.now()
            });
            
            // Show modal for custom store name and location
            const modal = new ModalBuilder()
                .setCustomId(`custom_store_name_upcoming_${region}_${sessionId}`)
                .setTitle('Enter Custom Store Details');

            const storeNameInput = new TextInputBuilder()
                .setCustomId('custom_store_name')
                .setLabel('Store Name')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Walmart, Local Card Shop, etc.')
                .setRequired(true)
                .setMaxLength(100);

            const storeLocationInput = new TextInputBuilder()
                .setCustomId('custom_store_location')
                .setLabel('Store Location/Address')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., City, State or Full Address')
                .setRequired(true)
                .setMaxLength(200);

            modal.addComponents(
                new ActionRowBuilder().addComponents(storeNameInput),
                new ActionRowBuilder().addComponents(storeLocationInput)
            );

            await interaction.showModal(modal);
            return;
        }
        
        let stores = [];
        if (storeType === 'target') {
            stores = config.stores.target[region] || [];
        } else if (storeType === 'bestbuy') {
            stores = config.stores.bestbuy[region] || [];
        } else if (storeType === 'barnesandnoble') {
            stores = config.stores.barnesandnoble[region] || [];
        }

        if (stores.length === 0) {
            return await interaction.update({
                content: '❌ No stores found for this type.',
                components: [],
                ephemeral: true
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
            .setCustomId(`upcoming_restock_location_${region}_${storeType}`)
            .setPlaceholder('Select store location...')
            .addOptions(locationOptions);

        const row = new ActionRowBuilder().addComponents(locationSelect);

        await interaction.update({
            content: '**Step 2 of 4**: Select the store location',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling upcoming restock store type select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error. Please try again.',
                components: []
            });
        }
    }
}

/**
 * Handle location selection for upcoming restocks (show date dropdown)
 */
async function handleUpcomingRestockLocationSelect(interaction, region) {
    try {
        const customId = interaction.customId;
        const storeType = customId.replace(`upcoming_restock_location_${region}_`, '');
        const store = interaction.values[0];

        // Generate a short ID for tracking (Discord customId limit is 100 chars)
        const sessionId = generateModalId();
        
        // Store the store info temporarily in cache (expires after 5 minutes)
        modalDataCache.set(sessionId, {
            store: store,
            storeType: storeType,
            region: region,
            userId: interaction.user.id,
            timestamp: Date.now()
        });

        // Clean up old cache entries (older than 5 minutes)
        const now = Date.now();
        for (const [id, data] of modalDataCache.entries()) {
            if (now - data.timestamp > 5 * 60 * 1000) {
                modalDataCache.delete(id);
            }
        }

        // Create date select menu with dropdown options (for future dates)
        const dateSelect = new StringSelectMenuBuilder()
            .setCustomId(`upcoming_restock_date_select_${region}_${sessionId}`)
            .setPlaceholder('Select when this restock will occur...')
            .addOptions(
                { label: 'Today', value: '0', emoji: '📅', description: 'Restock happening today' },
                { label: 'Tomorrow', value: '1', emoji: '📅', description: '1 day from now' },
                { label: '2 Days From Now', value: '2', emoji: '📅', description: '2 days from now' },
                { label: '3 Days From Now', value: '3', emoji: '📅', description: '3 days from now' },
                { label: '4 Days From Now', value: '4', emoji: '📅', description: '4 days from now' },
                { label: '5 Days From Now', value: '5', emoji: '📅', description: '5 days from now' },
                { label: '1 Week From Now', value: '7', emoji: '📅', description: '7 days from now' },
                { label: '2 Weeks From Now', value: '14', emoji: '📅', description: '14 days from now' }
            );

        const row = new ActionRowBuilder().addComponents(dateSelect);

        await interaction.update({
            content: '**Step 3 of 4**: Select when this restock will occur',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling upcoming restock location select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle date selection from dropdown (for upcoming restocks)
 */
async function handleUpcomingRestockDateSelect(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.replace(`upcoming_restock_date_select_${region}_`, '');
        const daysFromNow = interaction.values[0];

        // Retrieve store info from cache
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData) {
            return await interaction.update({
                content: '❌ Session expired. Please start over by clicking the button again.',
                components: [],
                ephemeral: true
            });
        }

        // Verify it's the same user
        if (cachedData.userId !== interaction.user.id) {
            return await interaction.update({
                content: '❌ This form was started by a different user. Please start over.',
                components: [],
                ephemeral: true
            });
        }

        // Calculate the future date
        const days = parseInt(daysFromNow);
        const now = new Date();
        const restockDate = new Date(now);
        restockDate.setDate(restockDate.getDate() + days);
        restockDate.setHours(0, 0, 0, 0); // Set to start of day

        // Update cache with the date
        cachedData.restockDate = restockDate;
        cachedData.dateInput = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === 7 ? '1 Week From Now' : days === 14 ? '2 Weeks From Now' : `${days} Days From Now`;
        modalDataCache.set(sessionId, cachedData);

        // Show modal for note input
        const modal = new ModalBuilder()
            .setCustomId(`upcoming_restock_note_${region}_${sessionId}`)
            .setTitle('Upcoming Restock Details');

        const noteInput = new TextInputBuilder()
            .setCustomId('restock_note')
            .setLabel('What will be restocking?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g., Pokemon cards, trading cards, specific items...')
            .setRequired(true)
            .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(noteInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);

    } catch (error) {
        console.error(`❌ Error handling upcoming restock date select (${region}):`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error submitting your report. Please try again.'
            });
        }
    }
}

/**
 * Handle note modal submission and show confirmation (for upcoming restocks)
 */
async function handleUpcomingRestockNoteSubmit(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.replace(`upcoming_restock_note_${region}_`, '');
        
        // Retrieve store info from cache
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData) {
            return await interaction.reply({
                content: '❌ Session expired. Please start over by clicking the button again.',
                ephemeral: true
            });
        }

        // Verify it's the same user
        if (cachedData.userId !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ This form was started by a different user. Please start over.',
                ephemeral: true
            });
        }

        const store = cachedData.store;
        const restockDate = cachedData.restockDate;
        const dateInput = cachedData.dateInput;
        const note = interaction.fields.getTextInputValue('restock_note');

        // Update cache with note
        cachedData.note = note;
        cachedData.reportType = 'upcoming';
        cachedData.username = interaction.user.username;
        modalDataCache.set(sessionId, cachedData);

        // Show confirmation screen with warning
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const confirmEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('⚠️ Confirm Upcoming Restock Report')
            .setDescription('**Please confirm this is an actual restock before submitting.**')
            .addFields(
                { name: '🏪 Store', value: formattedStore, inline: false },
                { name: '📅 Restock Date', value: `<t:${Math.floor(restockDate.getTime() / 1000)}:F>`, inline: true },
                { name: '📝 Date Input', value: dateInput, inline: true },
                { name: '📍 Region', value: region.toUpperCase(), inline: true },
                { name: '📋 What Will Restock', value: note || 'No note provided', inline: false },
                { name: 'ℹ️ Note', value: 'This will be logged only (no public alert)', inline: false },
                { 
                    name: '🚨 Warning', 
                    value: '**Submitting false restock reports can result in a ban or other disciplinary action.**\n\nOnly submit if this is a genuine restock event.', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Click "Confirm & Submit" to send for approval, or "Cancel" to go back' });

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_upcoming_${region}_${sessionId}`)
                    .setLabel('✅ Confirm & Submit')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`cancel_report_${sessionId}`)
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.reply({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling upcoming restock note submit (${region}):`, error);
        if (interaction.replied) {
            await interaction.followUp({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Process upcoming restock submission (shared logic)
 */
async function processUpcomingRestockSubmission(interaction, region, store, storeType, restockDate, dateInput, note, sessionId) {
    try {
        const userId = interaction.user.id;
        const username = interaction.user.username;

        // Clean up cache
        if (sessionId) {
            modalDataCache.delete(sessionId);
        }

        const cooldownCheck = await checkCooldowns(userId, store);
        if (!cooldownCheck.allowed) {
            await interaction.editReply({
                content: `⏰ **Cooldown Active**: ${cooldownCheck.reason}`,
                ephemeral: true
            });
            return;
        }

        const restockId = generateId();
        const now = new Date();
        const weekStart = getWeekStart(restockDate);

        const restockReport = {
            id: restockId,
            store: store,
            notes: note,
            date: restockDate.toISOString(),
            reported_by: userId,
            reported_by_username: username,
            status: 'pending',
            week_start: weekStart.toISOString().split('T')[0],
            created_at: now.toISOString(),
            is_upcoming_restock: true,
            restock_date_input: dateInput,
            source: 'button'
        };

        await dataManager.addRestock(restockReport);
        console.log('💾 Saved upcoming restock to database with ID:', restockId);

        const cooldown = {
            user_id: userId,
            store: store,
            last_report: now.toISOString(),
            expires_at: new Date(now.getTime() + (36 * 60 * 60 * 1000)).toISOString()
        };
        await dataManager.addCooldown(cooldown);

        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const approvalEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📅 Upcoming Restock Report - Pending Approval')
            .setDescription('An upcoming restock has been reported and is awaiting approval. This will be logged only (no alert will be sent).')
            .addFields(
                { name: '🏪 Store', value: store, inline: true },
                { name: '👤 Reported By', value: username, inline: true },
                { name: '📅 Restock Date', value: `<t:${Math.floor(restockDate.getTime() / 1000)}:F>`, inline: true },
                { name: '📝 Date Input', value: dateInput, inline: true },
                { name: '📋 What Will Restock', value: note || 'No note provided', inline: false },
                { name: '🆔 Report ID', value: restockId, inline: true },
                { name: '📱 Source', value: 'Button Workflow', inline: true }
            );

        approvalEmbed.setFooter({ text: 'Use the buttons below to approve or reject this report' });

        const approveButtonId = `approve_${restockId}`;
        const rejectButtonId = `reject_${restockId}`;
        
        const approvalRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(approveButtonId)
                    .setLabel('✅ Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`approve_note_${restockId}`)
                    .setLabel('✅ Approve + Note')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(rejectButtonId)
                    .setLabel('❌ Reject')
                    .setStyle(ButtonStyle.Danger)
            );

        // Determine approval channel based on region
        const approvalChannelId = region === 'md' 
            ? config.channels.restockApprovalsMD 
            : config.channels.restockApprovals;

        try {
            if (approvalChannelId && approvalChannelId.trim() !== '') {
                const approvalChannel = interaction.client.channels.cache.get(approvalChannelId);
                if (approvalChannel) {
                    // Get admin mentions with region
                    const { getAdminMentions } = require('./approvalManager');
                    const adminMentions = await getAdminMentions(region);
                    const mentionText = adminMentions ? `${adminMentions} New approval request!` : 'New approval request!';
                    
                    await approvalChannel.send({
                        content: mentionText,
                        embeds: [approvalEmbed],
                        components: [approvalRow]
                    });
                }
            }
        } catch (sendErr) {
            console.error('⚠️ Could not send to approval channel:', sendErr.message);
        }

        await interaction.editReply({
            content: `✅ **Upcoming Restock Report Submitted!**\n\n🏪 **Store**: ${store}\n📅 **Date**: ${dateInput}\n📋 **Note**: ${note}\n\nYour report has been submitted and is awaiting approval. This will be logged for tracking only (no alert will be sent).`,
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error processing upcoming restock submission (${region}):`, error);
        throw error;
    }
}

/**
 * Handle custom store name modal submission (for in-progress restocks)
 */
async function handleCustomStoreNameInProgress(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.split('_').pop();
        
        // Retrieve session data from cache
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData) {
            return await interaction.reply({
                content: '❌ Session expired. Please start over by clicking the button again.',
                ephemeral: true
            });
        }

        // Verify it's the same user
        if (cachedData.userId !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ This form was started by a different user. Please start over.',
                ephemeral: true
            });
        }

        const storeName = interaction.fields.getTextInputValue('custom_store_name').trim();
        const storeLocation = interaction.fields.getTextInputValue('custom_store_location').trim();
        
        if (!storeName) {
            return await interaction.reply({
                content: '❌ Store name cannot be empty.',
                ephemeral: true
            });
        }
        
        if (!storeLocation) {
            return await interaction.reply({
                content: '❌ Store location cannot be empty.',
                ephemeral: true
            });
        }

        // Format store: "Other - Store Name - Location"
        const formattedStore = `Other - ${storeName} - ${storeLocation}`;

        // Update cache with the formatted store
        cachedData.store = formattedStore;
        cachedData.username = interaction.user.username;
        cachedData.reportType = 'in_progress';
        modalDataCache.set(sessionId, cachedData);

        // Show confirmation screen with warning
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFF6B35)
            .setTitle('⚠️ Confirm Restock Report')
            .setDescription('**Please confirm this is an actual restock before submitting.**')
            .addFields(
                { name: '🏪 Store', value: formattedStore, inline: false },
                { name: '📅 Type', value: 'Restock In Progress', inline: true },
                { name: '📍 Region', value: region.toUpperCase(), inline: true },
                { 
                    name: '🚨 Warning', 
                    value: '**Submitting false restock reports can result in a ban or other disciplinary action.**\n\nOnly submit if this is a genuine restock event.', 
                    inline: false 
                }
            )
            .setFooter({ text: 'Click "Confirm & Submit" to send for approval, or "Cancel" to go back' });

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_in_progress_${region}_${sessionId}`)
                    .setLabel('✅ Confirm & Submit')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`cancel_report_${sessionId}`)
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.reply({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling custom store name (in-progress) (${region}):`, error);
        if (interaction.replied) {
            await interaction.followUp({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle custom store name modal submission (for upcoming restocks)
 */
async function handleCustomStoreNameUpcoming(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.split('_').pop();
        
        // Retrieve session data from cache
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData) {
            return await interaction.reply({
                content: '❌ Session expired. Please start over by clicking the button again.',
                ephemeral: true
            });
        }

        // Verify it's the same user
        if (cachedData.userId !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ This form was started by a different user. Please start over.',
                ephemeral: true
            });
        }

        const storeName = interaction.fields.getTextInputValue('custom_store_name').trim();
        const storeLocation = interaction.fields.getTextInputValue('custom_store_location').trim();
        
        if (!storeName) {
            return await interaction.reply({
                content: '❌ Store name cannot be empty.',
                ephemeral: true
            });
        }
        
        if (!storeLocation) {
            return await interaction.reply({
                content: '❌ Store location cannot be empty.',
                ephemeral: true
            });
        }

        // Format store: "Other - Store Name - Location"
        const formattedStore = `Other - ${storeName} - ${storeLocation}`;

        // Update cache with formatted store
        cachedData.store = formattedStore;
        modalDataCache.set(sessionId, cachedData);

        // Show date selection dropdown (same as regular upcoming restock flow)
        const dateSelect = new StringSelectMenuBuilder()
            .setCustomId(`upcoming_restock_date_select_${region}_${sessionId}`)
            .setPlaceholder('Select when this restock will occur...')
            .addOptions(
                { label: 'Today', value: '0', emoji: '📅', description: 'Restock happening today' },
                { label: 'Tomorrow', value: '1', emoji: '📅', description: '1 day from now' },
                { label: '2 Days From Now', value: '2', emoji: '📅', description: '2 days from now' },
                { label: '3 Days From Now', value: '3', emoji: '📅', description: '3 days from now' },
                { label: '4 Days From Now', value: '4', emoji: '📅', description: '4 days from now' },
                { label: '5 Days From Now', value: '5', emoji: '📅', description: '5 days from now' },
                { label: '1 Week From Now', value: '7', emoji: '📅', description: '7 days from now' },
                { label: '2 Weeks From Now', value: '14', emoji: '📅', description: '14 days from now' }
            );

        const row = new ActionRowBuilder().addComponents(dateSelect);

        await interaction.reply({
            content: `**Step 2 of 4**: Select when this restock will occur at **${formattedStore}**`,
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling custom store name (upcoming) (${region}):`, error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

// Helper function to check cooldowns
async function checkCooldowns(userId, store) {
    // Check if user is disabled
    if (dataManager.isUserDisabled(userId)) {
        const disabledUser = dataManager.getDisabledUsers().find(u => u.user_id === userId);
        return {
            allowed: false,
            reason: `❌ Your reporting has been disabled. Reason: ${disabledUser?.reason || 'No reason provided'}. Please contact an admin.`
        };
    }

    const cooldowns = dataManager.getCooldowns();
    const now = new Date();

    const restocks = dataManager.getRestocks();
    const pendingReport = restocks.find(r => 
        r.store === store && 
        r.status === 'pending'
    );
    
    if (pendingReport) {
        return {
            allowed: false,
            reason: `${store} already has a pending restock report. Please wait for it to be approved or rejected.`
        };
    }

    const storeCooldown = cooldowns.find(c => c.store === store && !c.user_id);
    if (storeCooldown) {
        const expiresAt = new Date(storeCooldown.expires_at);
        if (now < expiresAt) {
            const timeLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
            return {
                allowed: false,
                reason: `${store} is on cooldown for ${timeLeft} day(s) after being restocked.`
            };
        }
    }

    const userCooldown = cooldowns.find(c => c.user_id === userId && c.store === store);
    if (userCooldown) {
        const expiresAt = new Date(userCooldown.expires_at);
        if (now < expiresAt) {
            const timeLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
            return {
                allowed: false,
                reason: `You can report for ${store} again in ${timeLeft} day(s)`
            };
        }
    }

    return { allowed: true };
}

// Helper function to get week start (Monday)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// Helper function to generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Handle lookup button click (VA/MD)
 */
async function handleLookupButtonClick(interaction, region) {
    try {
        // Defer reply immediately to prevent timeout
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        // Don't restrict channel - allow lookup from anywhere
        // Reuse the logic from restock_status.js
        const isVA = region === 'va';
        const isMD = region === 'md';

        // Get store restock history from last_restocks
        const lastRestocks = dataManager.getLastRestocks();

        // Build allowed stores list
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
            if (interaction.deferred) {
                return await interaction.editReply({
                    content: '📭 **No stores have reported restocks this week.**'
                });
            } else {
                return await interaction.reply({
                    content: '📭 **No stores have reported restocks this week.**',
                    ephemeral: true
                });
            }
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x00BFFF) // Blue
            .setTitle('📊 Restock Status - Weekly Overview')
            .setDescription(isVA ? 'Showing restock dates for Virginia stores' : 'Showing restock dates for Maryland stores')
            .setTimestamp();

        // Add fields for each store showing current and previous week dates
        // Discord limit: 25 fields per embed, 6000 characters total
        let fieldCount = 0;
        for (const storeData of regionRestocks) {
            if (fieldCount >= 25) break; // Discord limit
            
            try {
                let currentWeekDate = 'Not Restocked';
                if (storeData.current_week_restock_date) {
                    const date = new Date(storeData.current_week_restock_date);
                    if (!isNaN(date.getTime())) {
                        currentWeekDate = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
                    }
                }
                
                let previousWeekDate = 'N/A';
                if (storeData.previous_week_restock_date) {
                    const date = new Date(storeData.previous_week_restock_date);
                    if (!isNaN(date.getTime())) {
                        previousWeekDate = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
                    }
                }

                const storeName = storeData.store || 'Unknown Store';
                const fieldValue = `**Current Week Restock Date:** ${currentWeekDate}\n**Previous Week Restock Date:** ${previousWeekDate}`;

                embed.addFields({
                    name: `🏪 ${storeName}`,
                    value: fieldValue,
                    inline: false
                });
                fieldCount++;
            } catch (fieldError) {
                console.error(`Error processing store ${storeData.store}:`, fieldError);
                // Skip this store if there's an error
                continue;
            }
        }

        // Add footer
        embed.setFooter({
            text: `Data resets weekly on ${config.settings?.cleanupDay || 'Sunday'}`
        });

        if (interaction.deferred) {
            await interaction.editReply({
                embeds: [embed]
            });
        } else {
            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

    } catch (error) {
        console.error(`❌ Error handling lookup button click (${region}):`, error);
        console.error('Error stack:', error.stack);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error retrieving restock status. Please try again.',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error retrieving restock status. Please check the console for details.'
            });
        }
    }
}

/**
 * Handle confirmation for in-progress restock
 */
async function handleConfirmInProgress(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.replace(`confirm_in_progress_${region}_`, '');
        
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData || cachedData.userId !== interaction.user.id) {
            return await interaction.update({
                content: '❌ Session expired or invalid. Please start over.',
                components: [],
                ephemeral: true
            });
        }

        const store = cachedData.store;
        const userId = cachedData.userId;
        const username = cachedData.username;

        // Clean up cache
        modalDataCache.delete(sessionId);

        const cooldownCheck = await checkCooldowns(userId, store);
        if (!cooldownCheck.allowed) {
            return await interaction.update({
                content: `⏰ **Cooldown Active**: ${cooldownCheck.reason}`,
                components: [],
                ephemeral: true
            });
        }

        // Process the submission
        const restockId = generateId();
        console.log('🆔 Generated restock ID:', restockId);
        const now = new Date();
        const weekStart = getWeekStart(now);

        const restockReport = {
            id: restockId,
            store: store,
            notes: '',
            date: now.toISOString(),
            reported_by: userId,
            reported_by_username: username,
            status: 'pending',
            week_start: weekStart.toISOString().split('T')[0],
            created_at: now.toISOString(),
            type: 'in_progress',
            source: 'button'
        };

        await dataManager.addRestock(restockReport);
        console.log('💾 Saved restock to database with ID:', restockId);

        const cooldown = {
            user_id: userId,
            store: store,
            last_report: now.toISOString(),
            expires_at: new Date(now.getTime() + (36 * 60 * 60 * 1000)).toISOString()
        };
        await dataManager.addCooldown(cooldown);

        // Send to approval channel
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const approvalEmbed = new EmbedBuilder()
            .setColor(0xFF6B35)
            .setTitle('🚨 Restock IN PROGRESS - Pending Approval')
            .setDescription(`A restock currently in progress has been reported and is awaiting approval.`)
            .addFields(
                { name: '🏪 Store', value: store, inline: true },
                { name: '👤 Reported By', value: username, inline: true },
                { name: '📅 Date', value: `<t:${Math.floor(now.getTime() / 1000)}:F>`, inline: true },
                { name: '🆔 Report ID', value: restockId, inline: true },
                { name: '📱 Source', value: 'Button Workflow', inline: true }
            );

        approvalEmbed.setFooter({ text: 'Use the buttons below to approve or reject this report' });

        const approveButtonId = `approve_${restockId}`;
        const rejectButtonId = `reject_${restockId}`;
        
        const approvalRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(approveButtonId)
                    .setLabel('✅ Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`approve_note_${restockId}`)
                    .setLabel('✅ Approve + Note')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(rejectButtonId)
                    .setLabel('❌ Reject')
                    .setStyle(ButtonStyle.Danger)
            );

        // Determine approval channel based on region
        const approvalChannelId = region === 'md' 
            ? config.channels.restockApprovalsMD 
            : config.channels.restockApprovals;

        try {
            if (approvalChannelId && approvalChannelId.trim() !== '') {
                const approvalChannel = interaction.client.channels.cache.get(approvalChannelId);
                if (approvalChannel) {
                    // Get admin mentions with region
                    const { getAdminMentions } = require('./approvalManager');
                    const adminMentions = await getAdminMentions(region);
                    const mentionText = adminMentions ? `${adminMentions} New approval request!` : 'New approval request!';
                    
                    await approvalChannel.send({
                        content: mentionText,
                        embeds: [approvalEmbed],
                        components: [approvalRow]
                    });
                }
            }
        } catch (sendErr) {
            console.error('⚠️ Could not send to approval channel:', sendErr.message);
        }

    } catch (error) {
        console.error('❌ Error confirming in-progress restock:', error);
        await interaction.update({
            content: '❌ There was an error submitting your report. Please try again.',
            components: [],
            ephemeral: true
        });
    }
}

/**
 * Handle confirmation for past restock
 */
async function handleConfirmPast(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.replace(`confirm_past_${region}_`, '');
        
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData || cachedData.userId !== interaction.user.id) {
            return await interaction.update({
                content: '❌ Session expired or invalid. Please start over.',
                components: [],
                ephemeral: true
            });
        }

        const store = cachedData.store;
        const storeType = cachedData.storeType;
        const restockDate = cachedData.restockDate;
        const dateInput = cachedData.dateInput;

        // Clean up cache
        modalDataCache.delete(sessionId);

        await interaction.deferReply({ ephemeral: true });
        await processPastRestockSubmission(interaction, region, store, storeType, restockDate, dateInput, sessionId);

    } catch (error) {
        console.error('❌ Error confirming past restock:', error);
        await interaction.update({
            content: '❌ There was an error submitting your report. Please try again.',
            components: [],
            ephemeral: true
        });
    }
}

/**
 * Handle confirmation for upcoming restock
 */
async function handleConfirmUpcoming(interaction, region) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.replace(`confirm_upcoming_${region}_`, '');
        
        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData || cachedData.userId !== interaction.user.id) {
            return await interaction.update({
                content: '❌ Session expired or invalid. Please start over.',
                components: [],
                ephemeral: true
            });
        }

        const store = cachedData.store;
        const storeType = cachedData.storeType;
        const restockDate = cachedData.restockDate;
        const dateInput = cachedData.dateInput;
        const note = cachedData.note;

        // Clean up cache
        modalDataCache.delete(sessionId);

        await interaction.deferReply({ ephemeral: true });
        await processUpcomingRestockSubmission(interaction, region, store, storeType, restockDate, dateInput, note, sessionId);

    } catch (error) {
        console.error('❌ Error confirming upcoming restock:', error);
        await interaction.update({
            content: '❌ There was an error submitting your report. Please try again.',
            components: [],
            ephemeral: true
        });
    }
}

/**
 * Handle cancel button
 */
async function handleCancelReport(interaction) {
    try {
        const customId = interaction.customId;
        const sessionId = customId.replace('cancel_report_', '');
        
        // Clean up cache
        modalDataCache.delete(sessionId);

        await interaction.update({
            content: '❌ **Report Cancelled**\n\nYour report has been cancelled. Click the button again if you want to start over.',
            components: [],
            ephemeral: true
        });
    } catch (error) {
        console.error('❌ Error cancelling report:', error);
        await interaction.update({
            content: '❌ There was an error cancelling your report.',
            components: [],
            ephemeral: true
        });
    }
}

module.exports = {
    handleRestockButtonClick,
    handlePastRestockButtonClick,
    handleUpcomingRestockButtonClick,
    handleStoreTypeSelect,
    handlePastRestockStoreTypeSelect,
    handleUpcomingRestockStoreTypeSelect,
    handleLocationSelect,
    handlePastRestockLocationSelect,
    handleUpcomingRestockLocationSelect,
    handlePastRestockDateSelect,
    handlePastRestockDateSubmit,
    handleUpcomingRestockDateSelect,
    handleUpcomingRestockNoteSubmit,
    handleCustomStoreNameInProgress,
    handleCustomStoreNameUpcoming,
    handleLookupButtonClick,
    handleConfirmInProgress,
    handleConfirmPast,
    handleConfirmUpcoming,
    handleCancelReport
};
