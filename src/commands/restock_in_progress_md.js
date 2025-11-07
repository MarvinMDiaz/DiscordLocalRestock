const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dataManager = require('../utils/dataManager');
const { gateChannel } = require('../utils/channelGate');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restock_in_progress_md')
        .setDescription('Report a restock currently in progress - Maryland (with photo support)')
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
            const gate = gateChannel('restock_in_progress_md', interaction.channelId);
            if (!gate.allowed) {
                return await interaction.reply({
                    content: `❌ This command can only be used in ${gate.channelName}. Please use this command in the correct channel.`,
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
            const weekStart = getWeekStart(now);

            const restockReport = {
                id: restockId,
                store,
                notes,
                date: now.toISOString(),
                reported_by: userId,
                reported_by_username: username,
                status: 'pending',
                week_start: weekStart.toISOString().split('T')[0],
                created_at: now.toISOString(),
                type: 'in_progress'
            };

            await dataManager.addRestock(restockReport);

            const approvalEmbed = new EmbedBuilder()
                .setColor(0xFF6B35)
                .setTitle('🚨 Restock IN PROGRESS - Pending Approval')
                .setDescription('A restock currently in progress has been reported and is awaiting approval.')
                .addFields(
                    { name: '🏪 Store', value: store, inline: true },
                    { name: '👤 Reported By', value: username, inline: true },
                    { name: '📅 Date', value: `<t:${Math.floor(now.getTime() / 1000)}:F>`, inline: true },
                    { name: '🆔 Report ID', value: restockId, inline: true }
                );

            if (notes) {
                approvalEmbed.addFields({ name: '📝 Notes', value: notes, inline: false });
            }

            approvalEmbed.setFooter({ text: 'Use the buttons below to approve or reject this alert' });

            const approveButtonId = `approve_${restockId}`;
            const rejectButtonId = `reject_${restockId}`;
            const approvalRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(approveButtonId).setLabel('✅ Approve Alert').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`approve_note_${restockId}`).setLabel('✅ Approve + Note').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(rejectButtonId).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
            );

            const approvalChannelId = config.channels.restockApprovalsMD;
            try {
                if (approvalChannelId && approvalChannelId !== interaction.channelId) {
                    const approvalChannel = interaction.client.channels.cache.get(approvalChannelId);
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
                        console.log(`✅ MD in-progress approval message sent to channel ${approvalChannelId}`);
                    } else {
                        console.log(`⚠️ MD approval channel ${approvalChannelId} not found in cache.`);
                    }
                } else {
                    console.log(`⚠️ Cannot send approval to same channel as command (${interaction.channelId}). Please configure a different channel for restockApprovalsMD.`);
                }
            } catch (err) {
                console.error('❌ Could not send MD approval embed:', err.message);
            }

            await interaction.editReply({
                content: `🚨 **Restock IN PROGRESS Alert Submitted!**\n\n🏪 **Store**: ${store}\n\nYour in-progress alert has been submitted and is awaiting approval. If approved, this will be sent as a public alert to all members.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('❌ Error in restock_in_progress_md command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ There was an error submitting your in-progress alert. Please try again.', ephemeral: true });
            }
        }
    }
};

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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

    // Check if store is on cooldown (from previous approval)
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
