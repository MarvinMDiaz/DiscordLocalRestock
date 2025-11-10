const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dataManager = require('../utils/dataManager');
const { gateChannel } = require('../utils/channelGate');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report_past_restock_md')
        .setDescription('Report a past restock at a specific store (Maryland) - logs only, no alert')
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
        )
        .addStringOption(option =>
            option.setName('date')
                .setDescription('When did this restock occur? (e.g., "2024-01-15" or "Yesterday" or "2 days ago")')
                .setRequired(true)
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
                stores = config.stores.target.md || [];
            } else if (storeType === 'bestbuy') {
                stores = config.stores.bestbuy.md || [];
            } else if (storeType === 'barnesandnoble') {
                stores = config.stores.barnesandnoble.md || [];
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
            // Gate channel access
            const gate = gateChannel('report_past_restock_md', interaction.channelId);
            if (!gate.allowed) {
                return await interaction.reply({
                    content: `❌ This command can only be used in ${gate.channelName}. Please use this command in the correct channel.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });
            
            const storeType = interaction.options.getString('store_type');
            const store = interaction.options.getString('location');
            const dateInput = interaction.options.getString('date');
            
            if (!store || !storeType || !dateInput) {
                return await interaction.editReply({
                    content: '❌ Please select store type, location, and provide a date.',
                    ephemeral: true
                });
            }

            // Parse date input
            let restockDate;
            try {
                // Try parsing as ISO date (YYYY-MM-DD)
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
                    restockDate = new Date(dateInput.trim() + 'T00:00:00');
                } else {
                    // Try parsing relative dates like "yesterday", "2 days ago", etc.
                    const lowerInput = dateInput.toLowerCase().trim();
                    const now = new Date();
                    if (lowerInput === 'yesterday' || lowerInput === '1 day ago') {
                        restockDate = new Date(now);
                        restockDate.setDate(restockDate.getDate() - 1);
                    } else if (lowerInput === 'today') {
                        restockDate = new Date(now);
                    } else {
                        // Try to parse as date string
                        restockDate = new Date(dateInput);
                        if (isNaN(restockDate.getTime())) {
                            throw new Error('Invalid date format');
                        }
                    }
                }
            } catch (error) {
                return await interaction.editReply({
                    content: '❌ Invalid date format. Please use a date like "2024-01-15", "Yesterday", or "2 days ago".',
                    ephemeral: true
                });
            }
            
            const notes = '';
            const userId = interaction.user.id;
            const username = interaction.user.username;

            const cooldownCheck = await checkCooldowns(userId, store);
            if (!cooldownCheck.allowed) {
                await interaction.editReply({ content: `⏰ **Cooldown Active**: ${cooldownCheck.reason}`, ephemeral: true });
                return;
            }

            const restockId = generateId();
            const now = new Date();
            const weekStart = getWeekStart(restockDate); // Use restock date for week calculation

            const restockReport = {
                id: restockId,
                store,
                notes,
                date: restockDate.toISOString(),
                reported_by: userId,
                reported_by_username: username,
                status: 'pending',
                week_start: weekStart.toISOString().split('T')[0],
                created_at: now.toISOString(),
                is_past_restock: true, // Flag to indicate this is a past restock (no alert)
                restock_date_input: dateInput // Store original input for reference
            };

            await dataManager.addRestock(restockReport);

            const approvalEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('📋 Past Restock Report - Pending Approval')
                .setDescription('A past restock has been reported and is awaiting approval. This will be logged only (no alert).')
                .addFields(
                    { name: '🏪 Store', value: store, inline: true },
                    { name: '👤 Reported By', value: username, inline: true },
                    { name: '📅 Restock Date', value: `<t:${Math.floor(restockDate.getTime() / 1000)}:F>`, inline: true },
                    { name: '📝 Date Input', value: dateInput, inline: true },
                    { name: '🆔 Report ID', value: restockId, inline: true }
                );
            approvalEmbed.setFooter({ text: 'Use the buttons below to approve or reject this report' });

            const approveButtonId = `approve_${restockId}`;
            const rejectButtonId = `reject_${restockId}`;
            const approvalRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(approveButtonId).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`approve_note_${restockId}`).setLabel('✅ Approve + Note').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(rejectButtonId).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
            );

            // Route MD approvals to MD-specific channel
            const approvalChannelId = config.channels.restockApprovalsMD;
            try {
                if (approvalChannelId && approvalChannelId !== interaction.channelId) {
                    let approvalChannel = interaction.client.channels.cache.get(approvalChannelId);
                    if (!approvalChannel && interaction.client.channels.fetch) {
                        approvalChannel = await interaction.client.channels.fetch(approvalChannelId).catch(() => null);
                    }
                    if (approvalChannel) {
                        // Get admin mentions
                        const { getAdminMentions } = require('../utils/approvalManager');
                        const adminMentions = await getAdminMentions();
                        const mentionText = adminMentions ? `${adminMentions} New approval request!` : 'New approval request!';
                        
                        await approvalChannel.send({ 
                            content: mentionText,
                            embeds: [approvalEmbed], 
                            components: [approvalRow] 
                        });
                        console.log(`✅ MD approval message sent to channel ${approvalChannelId}`);
                    } else {
                        console.log(`⚠️ MD approval channel ${approvalChannelId} not found (cache/fetch failed).`);
                    }
                } else {
                    console.log(`⚠️ Cannot send approval to same channel as command (${interaction.channelId}). Please configure a different channel for restockApprovalsMD.`);
                }
            } catch (err) {
                console.error('❌ Could not send MD approval embed:', err.message);
            }

            await interaction.editReply({
                content: `✅ **Past Restock Report Submitted!**\n\n🏪 **Store**: ${store}\n📅 **Date**: ${dateInput}\n\nYour report has been submitted and is awaiting approval. This will be logged for historical tracking only (no alert will be sent).`,
                ephemeral: true
            });
        } catch (error) {
            console.error('❌ Error in report_past_restock_md command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ There was an error submitting your past restock report. Please try again.', ephemeral: true });
            }
        }
    },
};

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

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

    // Check if there's already a pending report for this store
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

    // Check user cooldown for this store
    const userCooldown = cooldowns.find(c => c.user_id === userId && c.store === store);
    if (userCooldown) {
        const expiresAt = new Date(userCooldown.expires_at);
        if (now < expiresAt) {
            const timeLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
            return { allowed: false, reason: `You can report for ${store} again in ${timeLeft} day(s)` };
        }
    }
    
    return { allowed: true };
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}


