const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dataManager = require('./dataManager');
const config = require('../../config/config.json');

// Temporary storage for modal data (since customId has 100 char limit)
const modalDataCache = new Map();

/**
 * Format date as "Day MM/DD/YY" (e.g., "Saturday 11/01/25")
 */
function formatRestockDate(dateString) {
    if (!dateString) return null;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);

    return `${dayName} ${month}/${day}/${year}`;
}

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
                    await message.delete().catch(() => { });
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
                { name: '🏪 Store', value: store, inline: false },
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
                { name: '🏪 Store', value: store, inline: false },
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

        // Auto-dismiss after 3 seconds
        setTimeout(async () => {
            try {
                await interaction.editReply({
                    content: '✅ **Submitted!**',
                    components: []
                });
            } catch (error) {
                // Silently fail - interaction might be expired
            }
        }, 3000);

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
                { name: '🏪 Store', value: store, inline: false },
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

        // Auto-dismiss after 3 seconds
        setTimeout(async () => {
            try {
                await interaction.editReply({
                    content: '✅ **Submitted!**',
                    components: []
                });
            } catch (error) {
                // Silently fail - interaction might be expired
            }
        }, 3000);

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
 * Get store type from store name
 */
function getStoreType(storeName) {
    if (!storeName) return 'other';
    const name = storeName.toLowerCase();
    if (name.startsWith('target')) return 'target';
    if (name.startsWith('best buy')) return 'bestbuy';
    if (name.startsWith('barnes') || name.startsWith('b&n')) return 'barnesandnoble';
    return 'other';
}

/**
 * Get store type display name and emoji
 */
function getStoreTypeDisplay(storeType) {
    const types = {
        'target': { name: 'Target', emoji: '🎯', color: 0xCC0000 },
        'bestbuy': { name: 'Best Buy', emoji: '💻', color: 0xFFFF00 },
        'barnesandnoble': { name: 'Barnes & Noble', emoji: '📚', color: 0x0066CC },
        'other': { name: 'Other Stores', emoji: '🏪', color: 0x808080 }
    };
    return types[storeType] || types['other'];
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

        // Group stores by store type
        const storesByType = {
            'target': [],
            'bestbuy': [],
            'barnesandnoble': [],
            'other': []
        };

        for (const storeData of regionRestocks) {
            const storeType = getStoreType(storeData.store);
            storesByType[storeType] = storesByType[storeType] || [];
            storesByType[storeType].push(storeData);
        }

        // Create embeds for each store type (only if they have stores)
        const embeds = [];
        const storeTypeOrder = ['target', 'bestbuy', 'barnesandnoble', 'other'];

        for (const storeType of storeTypeOrder) {
            const stores = storesByType[storeType];
            if (!stores || stores.length === 0) continue;

            const typeDisplay = getStoreTypeDisplay(storeType);
            const embed = new EmbedBuilder()
                .setColor(typeDisplay.color)
                .setTitle(`${typeDisplay.emoji} ${typeDisplay.name} - Restock Status`)
                .setDescription(isVA ? `Showing restock dates for ${typeDisplay.name} stores in Virginia` : `Showing restock dates for ${typeDisplay.name} stores in Maryland`)
                .setTimestamp();

            // Add fields for each store showing current and previous week dates
            // Discord limit: 25 fields per embed, 6000 characters total
            let fieldCount = 0;
            for (const storeData of stores) {
                if (fieldCount >= 25) break; // Discord limit

                try {
                    const currentWeekDate = storeData.current_week_restock_date
                        ? formatRestockDate(storeData.current_week_restock_date)
                        : 'Not Restocked';

                    const previousWeekDate = storeData.previous_week_restock_date
                        ? formatRestockDate(storeData.previous_week_restock_date)
                        : 'N/A';

                    // Extract store name without the store type prefix for cleaner display
                    const storeName = storeData.store || 'Unknown Store';
                    let displayName = storeName;
                    
                    // Remove store type prefix if present
                    if (storeType === 'target' && displayName.toLowerCase().startsWith('target - ')) {
                        displayName = displayName.substring(9);
                    } else if (storeType === 'bestbuy' && displayName.toLowerCase().startsWith('best buy - ')) {
                        displayName = displayName.substring(12);
                    } else if (storeType === 'barnesandnoble' && displayName.toLowerCase().startsWith('barnes & noble - ')) {
                        displayName = displayName.substring(18);
                    }

                    const fieldValue = `**Current Week:** ${currentWeekDate}\n**Previous Week:** ${previousWeekDate}${storeData.last_checked_date ? `\n**Last Checked:** ${formatRestockDate(storeData.last_checked_date)} (${getRelativeTime(new Date(storeData.last_checked_date))})` : ''}`;

                    embed.addFields({
                        name: `🏪 ${displayName}`,
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

            embeds.push(embed);
        }

        // Add footer to the last embed
        if (embeds.length > 0) {
            embeds[embeds.length - 1].setFooter({
                text: `Data resets weekly on ${config.settings?.cleanupDay || 'Sunday'}`
            });
        }

        // Discord allows up to 10 embeds per message
        if (embeds.length === 0) {
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

        // Split embeds into chunks of 10 if needed (Discord limit)
        const embedChunks = [];
        for (let i = 0; i < embeds.length; i += 10) {
            embedChunks.push(embeds.slice(i, i + 10));
        }

        // Send first chunk
        if (interaction.deferred) {
            await interaction.editReply({
                embeds: embedChunks[0]
            });
        } else {
            await interaction.reply({
                embeds: embedChunks[0],
                ephemeral: true
            });
        }

        // Send remaining chunks as follow-ups if needed
        for (let i = 1; i < embedChunks.length; i++) {
            await interaction.followUp({
                embeds: embedChunks[i],
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
 * Handle check store button click (VA/MD) - mark store as checked without restock
 */
async function handleCheckStoreButtonClick(interaction, region) {
    try {
        const storeTypeSelect = new StringSelectMenuBuilder()
            .setCustomId(`check_store_type_${region}`)
            .setPlaceholder('Select store type...')
            .addOptions(
                { label: 'Target', value: 'target', emoji: '🎯' },
                { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' }
            );

        const row = new ActionRowBuilder().addComponents(storeTypeSelect);

        await interaction.reply({
            content: '**Mark Store as Checked**\nSelect the store type:',
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error(`❌ Error handling check store button click (${region}):`, error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ There was an error. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle check store type selection
 */
async function handleCheckStoreTypeSelect(interaction, region) {
    try {
        const storeType = interaction.values[0];
        
        let stores = [];
        if (storeType === 'target') {
            stores = region === 'va' 
                ? (config.stores?.target?.va || [])
                : (config.stores?.target?.md || []);
        } else if (storeType === 'bestbuy') {
            stores = region === 'va'
                ? (config.stores?.bestbuy?.va || [])
                : (config.stores?.bestbuy?.md || []);
        } else if (storeType === 'barnesandnoble') {
            stores = region === 'va'
                ? (config.stores?.barnesandnoble?.va || [])
                : (config.stores?.barnesandnoble?.md || []);
        }

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
            .setCustomId(`check_store_location_${region}_${storeType}`)
            .setPlaceholder('Select store location...')
            .addOptions(locationOptions);

        const row = new ActionRowBuilder().addComponents(locationSelect);

        await interaction.update({
            content: '**Mark Store as Checked**\nSelect the store location:',
            components: [row]
        });

    } catch (error) {
        console.error(`❌ Error handling check store type select (${region}):`, error);
        await interaction.update({
            content: '❌ There was an error. Please try again.',
            components: []
        });
    }
}

/**
 * Handle check store location selection - show time selection menus
 */
async function handleCheckStoreLocation(interaction, region) {
    try {
        await interaction.deferUpdate();

        const customId = interaction.customId;
        const storeType = customId.replace(`check_store_location_${region}_`, '');
        const store = interaction.values[0];

        // Generate session ID and store store info temporarily
        const sessionId = generateModalId();
        modalDataCache.set(sessionId, {
            store: store,
            storeType: storeType,
            region: region,
            userId: interaction.user.id,
            username: interaction.user.username,
            reportType: 'check_store',
            timestamp: Date.now()
        });

        // Create hour select menu (1-12)
        const hourOptions = [];
        for (let i = 1; i <= 12; i++) {
            hourOptions.push({
                label: `${i}`,
                value: i.toString(),
                description: i === 1 ? '1 hour' : `${i} hours`
            });
        }

        const hourSelect = new StringSelectMenuBuilder()
            .setCustomId(`check_store_hour_${region}_${sessionId}`)
            .setPlaceholder('Select hour...')
            .addOptions(hourOptions);

        // Create minute select menu (00-59 in 5-minute increments)
        const minuteOptions = [];
        for (let i = 0; i < 60; i += 5) {
            const minuteStr = i.toString().padStart(2, '0');
            minuteOptions.push({
                label: `:${minuteStr}`,
                value: minuteStr,
                description: `${minuteStr} minutes`
            });
        }

        const minuteSelect = new StringSelectMenuBuilder()
            .setCustomId(`check_store_minute_${region}_${sessionId}`)
            .setPlaceholder('Select minutes...')
            .addOptions(minuteOptions);

        // Create AM/PM select menu
        const amPmSelect = new StringSelectMenuBuilder()
            .setCustomId(`check_store_ampm_${region}_${sessionId}`)
            .setPlaceholder('Select AM or PM...')
            .addOptions(
                { label: 'AM', value: 'AM', emoji: '🌅', description: 'Morning' },
                { label: 'PM', value: 'PM', emoji: '🌆', description: 'Afternoon/Evening' }
            );

        // Create "Use Current Time" button
        const useCurrentButton = new ButtonBuilder()
            .setCustomId(`check_store_current_${region}_${sessionId}`)
            .setLabel('Use Current Time')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏰');

        const row1 = new ActionRowBuilder().addComponents(hourSelect);
        const row2 = new ActionRowBuilder().addComponents(minuteSelect);
        const row3 = new ActionRowBuilder().addComponents(amPmSelect);
        const row4 = new ActionRowBuilder().addComponents(useCurrentButton);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏰ Set Check Time')
            .setDescription(`**${store}**\n\nSelect the time when this store was checked, or use current time.`)
            .setFooter({ text: 'You can select hour, minute, and AM/PM, or click "Use Current Time"' })
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: [row1, row2, row3, row4]
        });

    } catch (error) {
        console.error(`❌ Error handling check store location (${region}):`, error);
        await interaction.editReply({
            content: '❌ There was an error. Please try again.',
            components: []
        });
    }
}

/**
 * Handle check store hour selection
 */
async function handleCheckStoreHour(interaction, region) {
    try {
        await interaction.deferUpdate();

        const customId = interaction.customId;
        const sessionId = customId.replace(`check_store_hour_${region}_`, '');
        const hour = interaction.values[0];

        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData || cachedData.userId !== interaction.user.id) {
            return await interaction.editReply({
                content: '❌ Session expired. Please start over.',
                components: []
            });
        }

        cachedData.hour = hour;
        modalDataCache.set(sessionId, cachedData);

        // Check if we have all time components
        if (cachedData.hour && cachedData.minute && cachedData.amPm) {
            await finalizeCheckStoreTime(interaction, region, sessionId, cachedData);
        } else {
            // Update the embed to show selected hour
            await updateCheckStoreTimeEmbed(interaction, region, sessionId, cachedData);
        }

    } catch (error) {
        console.error(`❌ Error handling check store hour (${region}):`, error);
        await interaction.editReply({
            content: '❌ There was an error. Please try again.',
            components: []
        });
    }
}

/**
 * Handle check store minute selection
 */
async function handleCheckStoreMinute(interaction, region) {
    try {
        await interaction.deferUpdate();

        const customId = interaction.customId;
        const sessionId = customId.replace(`check_store_minute_${region}_`, '');
        const minute = interaction.values[0];

        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData || cachedData.userId !== interaction.user.id) {
            return await interaction.editReply({
                content: '❌ Session expired. Please start over.',
                components: []
            });
        }

        cachedData.minute = minute;
        modalDataCache.set(sessionId, cachedData);

        // Check if we have all time components
        if (cachedData.hour && cachedData.minute && cachedData.amPm) {
            await finalizeCheckStoreTime(interaction, region, sessionId, cachedData);
        } else {
            // Update the embed to show selected minute
            await updateCheckStoreTimeEmbed(interaction, region, sessionId, cachedData);
        }

    } catch (error) {
        console.error(`❌ Error handling check store minute (${region}):`, error);
        await interaction.editReply({
            content: '❌ There was an error. Please try again.',
            components: []
        });
    }
}

/**
 * Handle check store AM/PM selection
 */
async function handleCheckStoreAmPm(interaction, region) {
    try {
        await interaction.deferUpdate();

        const customId = interaction.customId;
        const sessionId = customId.replace(`check_store_ampm_${region}_`, '');
        const amPm = interaction.values[0];

        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData || cachedData.userId !== interaction.user.id) {
            return await interaction.editReply({
                content: '❌ Session expired. Please start over.',
                components: []
            });
        }

        cachedData.amPm = amPm;
        modalDataCache.set(sessionId, cachedData);

        // Check if we have all time components
        if (cachedData.hour && cachedData.minute && cachedData.amPm) {
            await finalizeCheckStoreTime(interaction, region, sessionId, cachedData);
        } else {
            // Update the embed to show selected AM/PM
            await updateCheckStoreTimeEmbed(interaction, region, sessionId, cachedData);
        }

    } catch (error) {
        console.error(`❌ Error handling check store AM/PM (${region}):`, error);
        await interaction.editReply({
            content: '❌ There was an error. Please try again.',
            components: []
        });
    }
}

/**
 * Handle "Use Current Time" button
 */
async function handleCheckStoreCurrentTime(interaction, region) {
    try {
        await interaction.deferUpdate();

        const customId = interaction.customId;
        const sessionId = customId.replace(`check_store_current_${region}_`, '');

        const cachedData = modalDataCache.get(sessionId);
        if (!cachedData || cachedData.userId !== interaction.user.id) {
            return await interaction.editReply({
                content: '❌ Session expired. Please start over.',
                components: []
            });
        }

        // Use current time
        const now = new Date();
        await finalizeCheckStoreTime(interaction, region, sessionId, cachedData, now);

    } catch (error) {
        console.error(`❌ Error handling check store current time (${region}):`, error);
        await interaction.editReply({
            content: '❌ There was an error. Please try again.',
            components: []
        });
    }
}

/**
 * Update the check store time embed with current selections
 */
async function updateCheckStoreTimeEmbed(interaction, region, sessionId, cachedData) {
    const store = cachedData.store;
    let statusText = '**Selected:** ';
    
    if (cachedData.hour) statusText += `${cachedData.hour}`;
    if (cachedData.minute) statusText += `:${cachedData.minute}`;
    if (cachedData.amPm) statusText += ` ${cachedData.amPm}`;
    
    if (!cachedData.hour && !cachedData.minute && !cachedData.amPm) {
        statusText = '**Select hour, minute, and AM/PM, or use current time**';
    }

    // Recreate select menus with current selections
    const hourOptions = [];
    for (let i = 1; i <= 12; i++) {
        const isSelected = cachedData.hour === i.toString();
        hourOptions.push({
            label: `${isSelected ? '✓ ' : ''}${i}`,
            value: i.toString(),
            description: isSelected ? 'Selected' : (i === 1 ? '1 hour' : `${i} hours`)
        });
    }

    const hourSelect = new StringSelectMenuBuilder()
        .setCustomId(`check_store_hour_${region}_${sessionId}`)
        .setPlaceholder(cachedData.hour ? `Hour: ${cachedData.hour}` : 'Select hour...')
        .addOptions(hourOptions);

    const minuteOptions = [];
    for (let i = 0; i < 60; i += 5) {
        const minuteStr = i.toString().padStart(2, '0');
        const isSelected = cachedData.minute === minuteStr;
        minuteOptions.push({
            label: `${isSelected ? '✓ ' : ''}:${minuteStr}`,
            value: minuteStr,
            description: isSelected ? 'Selected' : `${minuteStr} minutes`
        });
    }

    const minuteSelect = new StringSelectMenuBuilder()
        .setCustomId(`check_store_minute_${region}_${sessionId}`)
        .setPlaceholder(cachedData.minute ? `Minute: ${cachedData.minute}` : 'Select minutes...')
        .addOptions(minuteOptions);

    const amPmSelect = new StringSelectMenuBuilder()
        .setCustomId(`check_store_ampm_${region}_${sessionId}`)
        .setPlaceholder(cachedData.amPm ? `Time: ${cachedData.amPm}` : 'Select AM or PM...')
        .addOptions(
            { 
                label: cachedData.amPm === 'AM' ? '✓ AM' : 'AM', 
                value: 'AM', 
                emoji: '🌅', 
                description: cachedData.amPm === 'AM' ? 'Selected' : 'Morning' 
            },
            { 
                label: cachedData.amPm === 'PM' ? '✓ PM' : 'PM', 
                value: 'PM', 
                emoji: '🌆', 
                description: cachedData.amPm === 'PM' ? 'Selected' : 'Afternoon/Evening' 
            }
        );

    const useCurrentButton = new ButtonBuilder()
        .setCustomId(`check_store_current_${region}_${sessionId}`)
        .setLabel('Use Current Time')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏰');

    const row1 = new ActionRowBuilder().addComponents(hourSelect);
    const row2 = new ActionRowBuilder().addComponents(minuteSelect);
    const row3 = new ActionRowBuilder().addComponents(amPmSelect);
    const row4 = new ActionRowBuilder().addComponents(useCurrentButton);

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⏰ Set Check Time')
        .setDescription(`**${store}**\n\n${statusText}`)
        .setFooter({ text: 'Select hour, minute, and AM/PM, or click "Use Current Time"' })
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed],
        components: [row1, row2, row3, row4]
    });
}

/**
 * Finalize check store time and mark as checked
 */
async function finalizeCheckStoreTime(interaction, region, sessionId, cachedData, customDate = null) {
    try {
        const store = cachedData.store;
        const userId = cachedData.userId;

        let checkedDate = customDate || new Date();

        // If we have hour, minute, and AM/PM, construct the date
        if (!customDate && cachedData.hour && cachedData.minute && cachedData.amPm) {
            let hours = parseInt(cachedData.hour);
            const minutes = parseInt(cachedData.minute);
            
            // Convert to 24-hour format
            if (cachedData.amPm === 'PM' && hours !== 12) {
                hours += 12;
            } else if (cachedData.amPm === 'AM' && hours === 12) {
                hours = 0;
            }
            
            checkedDate = new Date();
            checkedDate.setHours(hours, minutes, 0, 0);
        }

        // Update last checked with custom time (but don't store username for anonymity)
        await dataManager.updateLastChecked(store, userId, null, checkedDate);

        const checkedTime = formatRestockDate(checkedDate.toISOString());
        const checkedTimeRelative = getRelativeTime(checkedDate);

        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Store Marked as Checked')
            .setDescription(`**${store}** has been marked as checked.`)
            .addFields(
                { name: '🏪 Store', value: store, inline: false },
                { name: '⏰ Checked At', value: `${checkedTime} (${checkedTimeRelative})`, inline: true }
            )
            .setFooter({ text: 'This helps others know when the store was last visited' })
            .setTimestamp();

        // Clean up cache
        modalDataCache.delete(sessionId);

        await interaction.editReply({ embeds: [embed], components: [] });
        console.log(`✅ Anonymous user marked ${store} as checked at ${checkedTime}`);

    } catch (error) {
        console.error(`❌ Error finalizing check store time (${region}):`, error);
        await interaction.editReply({
            content: '❌ There was an error marking the store as checked. Please try again.',
            components: []
        });
    }
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
function getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return formatRestockDate(date.toISOString());
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

        // Update interaction with success message (always update, even if approval channel send failed)
        let approvalSent = false;
        try {
            if (approvalChannelId && approvalChannelId.trim() !== '') {
                const approvalChannel = interaction.client.channels.cache.get(approvalChannelId);
                if (approvalChannel) {
                    approvalSent = true;
                }
            }
        } catch (checkErr) {
            console.error('⚠️ Error checking approval channel:', checkErr.message);
        }

        try {
            await interaction.update({
                content: `✅ **Restock Report Submitted!**\n\n🏪 **Store**: ${store}\n\nYour report has been submitted${approvalSent ? ' and is awaiting moderator approval' : ' (approval channel may be misconfigured)'}.`,
                components: [],
                ephemeral: true
            });

            // Auto-dismiss after 3 seconds - minimize to just checkmark
            setTimeout(async () => {
                try {
                    // Use editReply since we already updated
                    await interaction.editReply({
                        content: '✅ **Submitted!**',
                        components: []
                    });
                } catch (error) {
                    // Silently fail - interaction might be expired or already updated
                }
            }, 3000);
        } catch (updateError) {
            console.error('❌ Error updating interaction:', updateError);
            // If update fails, try to reply instead
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: `✅ **Restock Report Submitted!**\n\n🏪 **Store**: ${store}\n\nYour report has been submitted and is awaiting moderator approval.`,
                        ephemeral: true
                    });
                } catch (replyError) {
                    console.error('❌ Error replying to interaction:', replyError);
                }
            }
        }

    } catch (error) {
        console.error('❌ Error confirming in-progress restock:', error);
        console.error('Error stack:', error.stack);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.update({
                    content: '❌ There was an error submitting your report. Please try again.',
                    components: [],
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error submitting your report. Please try again.'
                });
            }
        } catch (updateError) {
            console.error('❌ Error updating interaction in error handler:', updateError);
        }
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
    handleCheckStoreButtonClick,
    handleCheckStoreTypeSelect,
    handleCheckStoreLocation,
    handleCheckStoreHour,
    handleCheckStoreMinute,
    handleCheckStoreAmPm,
    handleCheckStoreCurrentTime,
    handleConfirmInProgress,
    handleConfirmPast,
    handleConfirmUpcoming,
    handleCancelReport
};
