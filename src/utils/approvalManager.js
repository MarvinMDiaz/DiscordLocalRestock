const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dataManager = require('./dataManager');
const configManager = require('./configManager');
const interactionLogger = require('./interactionLogger');

/**
 * Get admin role mentions for approval notifications
 * @param {string} region - 'va' or 'md' to determine which approval role to mention
 */
async function getAdminMentions(region = 'va') {
    try {
        const config = require('../../config/config.json');
        
        // Use region-specific approval role
        const roleId = region === 'md' 
            ? config.roles.restockApprovalMD 
            : config.roles.restockApprovalVA;
        
        if (roleId) {
            return `<@&${roleId}>`;
        }
        
        // Fallback to admin role if approval role not set
        if (config.roles.admin) {
            return `<@&${config.roles.admin}>`;
        }
        
        return '';
    } catch (error) {
        console.error('Error getting admin mentions:', error);
        return '';
    }
}

async function handleApprovalButton(interaction) {
    try {
        const { customId } = interaction;
        const isApproved = customId.startsWith('approve_');
        const restockId = customId.replace('approve_', '').replace('reject_', '');

        console.log('🔍 Looking for restock with ID:', restockId);

        // Get the restock report
        let restocks = dataManager.getRestocks();
        console.log('📋 Total restocks in database:', restocks.length);
        console.log('📋 Restock IDs:', restocks.map(r => r.id));

        let restock = restocks.find(r => r.id === restockId);
        if (!restock) {
            // Fallback: reload from disk in case memory is stale
            await dataManager.reload();
            restocks = dataManager.getRestocks();
            restock = restocks.find(r => r.id === restockId);
        }

        if (!restock) {
            console.log('❌ Restock not found!');
            return await interaction.reply({
                content: '❌ Restock report not found.',
                ephemeral: true
            });
        }

        console.log('✅ Found restock:', restock);

        // Prevent multiple approvals/rejections
        if (restock.status && restock.status !== 'pending') {
            return await interaction.reply({
                content: `⚠️ This report was already ${restock.status}.`,
                ephemeral: true
            });
        }

        // Update the restock status
        restock.status = isApproved ? 'approved' : 'rejected';
        restock.reviewed_by = interaction.user.id;
        restock.reviewed_at = new Date().toISOString();

        // Save the updated data
        await dataManager.saveData();

        // Update the original embed
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setColor(isApproved ? 0x00FF00 : 0xFF0000); // Green for approved, Red for rejected
        embed.setTitle(`🛍️ Restock Report - ${isApproved ? 'Approved' : 'Rejected'}`);
        embed.setDescription(`This restock report has been ${isApproved ? 'approved' : 'rejected'}.`);
        embed.addFields({
            name: `👤 ${isApproved ? 'Approved' : 'Rejected'} By`,
            value: interaction.user.username,
            inline: true
        });

        // Create new disabled buttons
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${restockId}`)
                    .setLabel('✅ Approve')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`approve_note_${restockId}`)
                    .setLabel('✅ Approve + Note')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`reject_${restockId}`)
                    .setLabel('❌ Reject')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

        // Update the message (with timeout handling)
        try {
            await interaction.update({
                embeds: [embed],
                components: [disabledRow]
            });
        } catch (error) {
            if (error.code === 10062) {
                console.log('⏱️ Button interaction timed out, continuing anyway...');
            } else {
                throw error;
            }
        }

        // If approved, check if this is a past restock (no alert) or regular restock (send alert)
        if (isApproved) {
            if (restock.is_past_restock || restock.is_upcoming_restock) {
                // Past/Upcoming restock - just log it, no alert
                const type = restock.is_past_restock ? 'Past' : 'Upcoming';
                console.log(`📋 ${type} restock approved, logging only (no alert)...`);
                await handleApprovedRegularRestock(restock);
                // Past/Upcoming restocks don't trigger store cooldowns
            } else {
                // Regular restock - send alert
                console.log('✅ Restock approved, sending public alert...');
                await handleApprovedRestock(restock, interaction.client);
                
                // Add 36-hour store cooldown after approval
                const now = new Date();
                const storeCooldown = {
                    store: restock.store,
                    expires_at: new Date(now.getTime() + (36 * 60 * 60 * 1000)).toISOString(), // 36 hours (1.5 days)
                    created_at: now.toISOString()
                    // Note: No user_id means this is a store-wide cooldown
                };
                await dataManager.addCooldown(storeCooldown);
                console.log(`⏰ Added 36-hour store cooldown for ${restock.store}`);
            }
        } else {
            // If rejected, remove the user's cooldown so they can report again immediately
            // since the rejection means the store could still restock
            const cooldowns = dataManager.getCooldowns();
            const userCooldownIndex = cooldowns.findIndex(c => 
                c.user_id === restock.reported_by && 
                c.store === restock.store
            );
            
            if (userCooldownIndex !== -1) {
                cooldowns.splice(userCooldownIndex, 1);
                await dataManager.saveData();
                console.log(`🔄 Removed user cooldown for ${restock.reported_by_username} on ${restock.store} after rejection`);
            }
        }

        // DM notifications disabled by request – do nothing here

    } catch (error) {
        console.error('❌ Error handling approval button:', error);
        
        // Handle timeout errors gracefully
        if (error.code === 10062 || error.code === 40060) {
            console.log('⏱️ Interaction timed out, but approval was processed');
            return;
        }
        
        // Only try to reply if interaction hasn't been acknowledged
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: '❌ There was an error processing this approval.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.log('Could not send error message (interaction timed out)');
            }
        }
    }
}

async function handleApprovedRestock(restock, client) {
    try {
        console.log('🔔 Processing in-progress restock alert...');
        console.log('📊 Restock data:', JSON.stringify(restock, null, 2));
        
        // Update last restock for this store
        const lastRestockData = {
            store: restock.store,
            last_restock_date: restock.date,
            last_restock_item: restock.item,
            week_start: restock.week_start
        };
        await dataManager.updateLastRestock(restock.store, lastRestockData);

        // Send to public channel (determine VA or MD based on store location)
        const config = require('../../config/config.json');
        const isMDStore = restock.store.includes(', MD');
        const isVAStore = restock.store.includes(', VA');
        
        const publicChannelId = isMDStore ? config.channels.localRestockMD : config.channels.localRestockVA;
        const roleId = isMDStore ? config.roles.localRestockMD : config.roles.localRestockVA;
        const region = isMDStore ? 'Maryland' : 'Virginia';
        
        console.log('🌎 Detected region:', region);
        console.log('📡 Public channel ID:', publicChannelId);
        console.log('🎭 Role ID:', roleId);

        if (publicChannelId && publicChannelId.trim() !== '') {
            const publicChannel = client.channels.cache.get(publicChannelId);
            console.log('📺 Channel found:', publicChannel ? 'YES' : 'NO');
            
            if (publicChannel) {
                // Parse store name and address from restock.store
                // Format: "Target - Store Name - Address"
                let storeName = restock.store;
                let address = '';
                
                const lastDashIndex = restock.store.lastIndexOf(' - ');
                if (lastDashIndex !== -1) {
                    storeName = restock.store.substring(0, lastDashIndex);
                    address = restock.store.substring(lastDashIndex + 3); // +3 to skip " - "
                }
                
                const publicEmbed = new EmbedBuilder()
                    .setColor(0x00FF00) // Green
                    .setDescription(`A restock has been confirmed at **${storeName}**!`)
                    .setTitle(`🛍️ Restock Alert! (${region})`)
                    .addFields(
                        { name: '🏪 Store', value: storeName, inline: true },
                        { name: '📅 Date', value: `<t:${Math.floor(new Date(restock.date).getTime() / 1000)}:F>`, inline: true }
                    );

                // Add address field if it exists
                if (address && address.trim().length > 0) {
                    publicEmbed.addFields({ name: '📍 Address', value: address, inline: false });
                }

                const moderatorNote = restock.review_note || restock.notes;
                if (moderatorNote && moderatorNote.trim().length > 0) {
                    publicEmbed.addFields({ name: '📝 Note', value: moderatorNote, inline: false });
                }

                // Tag the appropriate role if configured
                let roleMention = '';
                if (roleId && roleId.length > 10) {
                    // Verify role exists in the guild before mentioning
                    try {
                        const guild = publicChannel.guild;
                        const role = guild.roles.cache.get(roleId);
                        if (role) {
                            roleMention = `<@&${roleId}>`;
                            console.log('✅ Role found:', role.name);
                        } else {
                            console.log(`⚠️ Role ${roleId} not found in guild. Bot may need to restart or role doesn't exist.`);
                            // Still try to mention it - Discord will show "unknown role" if it doesn't exist
                            roleMention = `<@&${roleId}>`;
                        }
                    } catch (error) {
                        console.error('❌ Error checking role:', error);
                        // Fallback: just use the role ID
                        roleMention = `<@&${roleId}>`;
                    }
                }
                console.log('👥 Role mention:', roleMention);

                await publicChannel.send({
                    content: roleMention ? `${roleMention} New ${region} restock alert!` : `New ${region} restock alert!`,
                    embeds: [publicEmbed]
                });
                
                console.log(`✅ Public alert sent successfully to ${region} channel!`);
            } else {
                console.log('❌ Public channel not found in cache. Channel ID may be incorrect.');
            }
        } else {
            console.log('❌ Invalid public channel ID');
        }

    } catch (error) {
        console.error('❌ Error handling approved restock:', error);
    }
}

async function handleApprovedRegularRestock(restock) {
    try {
        // Update last restock for this store (no public alert)
        const lastRestockData = {
            store: restock.store,
            last_restock_date: restock.date,
            last_restock_item: restock.item,
            week_start: restock.week_start
        };
        await dataManager.updateLastRestock(restock.store, lastRestockData);
        console.log(`✅ Regular restock logged for ${restock.store}`);
    } catch (error) {
        console.error('❌ Error handling regular restock:', error);
    }
}

// Approve with note: show modal
async function showApproveWithNoteModal(interaction) {
    try {
        const restockId = interaction.customId.replace('approve_note_', '');
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`approve_note_modal_${restockId}`)
            .setTitle('Approve with Note');
        const noteInput = new TextInputBuilder()
            .setCustomId('moderator_note')
            .setLabel('Moderator Note')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);
        const row = new ActionRowBuilder().addComponents(noteInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
    } catch (error) {
        if (error.code === 10062) {
            // Interaction expired due to rapid switching or delay - ignore gracefully
            console.log('⏱️ approve_note interaction expired before showModal');
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'This approval interaction expired. Please click Approve + Note again.', ephemeral: true });
                }
            } catch (_) {}
            return;
        }
        console.error('❌ Error showing Approve + Note modal:', error);
    }
}

// Handle modal submission
async function handleApproveWithNoteSubmit(interaction) {
    try {
        const restockId = interaction.customId.replace('approve_note_modal_', '');
        const note = interaction.fields.getTextInputValue('moderator_note');
        const restocks = dataManager.getRestocks();
        const restock = restocks.find(r => r.id === restockId);
        if (!restock) {
            return await interaction.reply({ content: '❌ Restock report not found.', ephemeral: true });
        }

        if (restock.status && restock.status !== 'pending') {
            return await interaction.reply({ content: `⚠️ This report was already ${restock.status}.`, ephemeral: true });
        }

        restock.status = 'approved';
        restock.reviewed_by = interaction.user.id;
        restock.reviewed_at = new Date().toISOString();
        restock.review_note = note;
        await dataManager.saveData();

        // Try to disable original buttons via message reference if available; otherwise skip
        try {
            const message = await interaction.channel?.messages?.fetch(interaction.message?.id || '');
            if (message && message.edit) {
                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const embed = message.embeds?.[0] ? EmbedBuilder.from(message.embeds[0]) : null;
                if (embed) {
                    embed.setColor(0x00FF00);
                    embed.setTitle('🛍️ Restock Report - Approved');
                    embed.addFields({ name: '📝 Moderator Note', value: note, inline: false });
                }
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_${restockId}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success).setDisabled(true),
                    new ButtonBuilder().setCustomId(`approve_note_${restockId}`).setLabel('✅ Approve + Note').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId(`reject_${restockId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
                );
                await message.edit({ embeds: embed ? [embed] : message.embeds, components: [disabledRow] });
            }
        } catch (_) {
            // Non-fatal
        }

        // Always send public alert for regular restocks
        // Check if this is a past restock (no alert) or regular restock (send alert)
        if (restock.is_past_restock) {
            // Past restock - just log it, no alert
            console.log('📋 Past restock approved, logging only (no alert)...');
            await handleApprovedRegularRestock(restock);
            // Past restocks don't trigger store cooldowns
        } else {
            // Regular restock - send alert
            await handleApprovedRestock(restock, interaction.client);
            
            // Add 36-hour store cooldown after approval
            const now = new Date();
            const storeCooldown = {
                store: restock.store,
                expires_at: new Date(now.getTime() + (36 * 60 * 60 * 1000)).toISOString(), // 36 hours (1.5 days)
                created_at: now.toISOString()
                // Note: No user_id means this is a store-wide cooldown
            };
            await dataManager.addCooldown(storeCooldown);
            console.log(`⏰ Added 36-hour store cooldown for ${restock.store}`);
        }
        
        if (!interaction.replied) {
            await interaction.reply({ content: '✅ Approved with note.', ephemeral: true });
        }
    } catch (err) {
        console.error('❌ Error handling approve with note submit:', err);
        if (!interaction.replied) {
            await interaction.reply({ content: '❌ Error approving with note.', ephemeral: true });
        }
    }
}

module.exports = {
    handleApprovalButton,
    showApproveWithNoteModal,
    handleApproveWithNoteSubmit,
    getAdminMentions
};