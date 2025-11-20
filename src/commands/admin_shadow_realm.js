const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const config = require('../../config/config.json');
const dataManager = require('../utils/dataManager');
const interactionLogger = require('../utils/interactionLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_shadow_realm')
        .setDescription('Manage Shadow Realm - send users to shadow realm or restore them (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Send a user to Shadow Realm')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for sending to Shadow Realm (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Restore a user from Shadow Realm')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check Shadow Realm status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup_buttons')
                .setDescription('Create Shadow Realm control buttons in the Shadow Realm channel')
        ),

    async execute(interaction) {
        try {
            const adminRoleId = config.roles.admin;
            const shadowRealmModRoleId = '1378557248296587357';
            const member = interaction.member;

            const hasAdminRole = member.roles.cache.has(adminRoleId);
            const hasShadowRealmModRole = member.roles.cache.has(shadowRealmModRoleId);
            const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasShadowRealmModRole && !hasAdminPermission) {
                return await interaction.reply({
                    content: '❌ **Access Denied**: You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'send') {
                await handleSendToShadowRealm(interaction);
            } else if (subcommand === 'restore') {
                await handleRestoreFromShadowRealm(interaction);
            } else if (subcommand === 'status') {
                await handleShadowRealmStatus(interaction);
            } else if (subcommand === 'setup_buttons') {
                await handleSetupShadowRealmButtons(interaction);
            }
        } catch (error) {
            console.error('❌ Error in admin_shadow_realm:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ There was an error processing this command.',
                    ephemeral: true
                });
            }
        }
    }
};

async function handleSendToShadowRealm(interaction) {
    // Check permissions for button interactions
    if (interaction.isButton()) {
        const adminRoleId = config.roles.admin;
        const shadowRealmModRoleId = '1378557248296587357';
        const member = interaction.member;
        const hasAdminRole = member.roles.cache.has(adminRoleId);
        const hasShadowRealmModRole = member.roles.cache.has(shadowRealmModRoleId);
        const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasAdminRole && !hasShadowRealmModRole && !hasAdminPermission) {
            return await interaction.reply({
                content: '❌ **Access Denied**: You do not have permission to use this.',
                ephemeral: true
            });
        }
        await interaction.deferReply({ ephemeral: true });
    } else {
        // Slash command - defer reply
        await interaction.deferReply({ ephemeral: true });
    }

    // Get reason from slash command option (if provided)
    const reason = interaction.isCommand() ? interaction.options.getString('reason') : null;
    
    // Encode reason in customId if provided (max customId length is 100, so we'll truncate if needed)
    const customId = reason 
        ? `shadow_realm_send_user_${Buffer.from(reason.substring(0, 80)).toString('base64')}` 
        : 'shadow_realm_send_user';

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('Select user to send to Shadow Realm...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);

    await interaction.editReply({
        content: '**🔮 Send to Shadow Realm**\n\nSelect the user you want to send to Shadow Realm. They will lose all roles and only be able to see the Shadow Realm channel.' + (reason ? `\n\n**Reason:** ${reason}` : ''),
        components: [row]
    });
}

async function handleRestoreFromShadowRealm(interaction) {
    // Check permissions for button interactions
    if (interaction.isButton()) {
        const adminRoleId = config.roles.admin;
        const shadowRealmModRoleId = '1378557248296587357';
        const member = interaction.member;
        const hasAdminRole = member.roles.cache.has(adminRoleId);
        const hasShadowRealmModRole = member.roles.cache.has(shadowRealmModRoleId);
        const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasAdminRole && !hasShadowRealmModRole && !hasAdminPermission) {
            return await interaction.reply({
                content: '❌ **Access Denied**: You do not have permission to use this.',
                ephemeral: true
            });
        }
        await interaction.deferReply({ ephemeral: true });
    } else {
        // Slash command - already deferred in main handler
    }

    // Get all users currently in shadow realm
    const snapshots = dataManager.getShadowRealmSnapshots();
    
    if (snapshots.length === 0) {
        return await interaction.editReply({
            content: '✅ No users are currently in Shadow Realm.'
        });
    }

    // Create user select menu with users in shadow realm
    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('shadow_realm_restore_user')
        .setPlaceholder('Select user to restore from Shadow Realm...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);

    await interaction.editReply({
        content: `**🔮 Restore from Shadow Realm**\n\nSelect the user you want to restore. They will get all their roles back.\n\n**Users in Shadow Realm:** ${snapshots.length}`,
        components: [row]
    });
}

async function handleShadowRealmStatus(interaction) {
    // Check permissions for button interactions
    if (interaction.isButton()) {
        const adminRoleId = config.roles.admin;
        const shadowRealmModRoleId = '1378557248296587357';
        const member = interaction.member;
        const hasAdminRole = member.roles.cache.has(adminRoleId);
        const hasShadowRealmModRole = member.roles.cache.has(shadowRealmModRoleId);
        const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasAdminRole && !hasShadowRealmModRole && !hasAdminPermission) {
            return await interaction.reply({
                content: '❌ **Access Denied**: You do not have permission to use this.',
                ephemeral: true
            });
        }
        await interaction.deferReply({ ephemeral: true });
    } else {
        // Slash command - already deferred in main handler
    }

    const snapshots = dataManager.getShadowRealmSnapshots();
    
    if (snapshots.length === 0) {
        return await interaction.editReply({
            content: '✅ **Shadow Realm Status**\n\nNo users are currently in Shadow Realm.'
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x2F3136)
        .setTitle('🔮 Shadow Realm Status')
        .setDescription(`**${snapshots.length}** user(s) currently in Shadow Realm`);

        const fields = snapshots.slice(0, 10).map(snapshot => ({
            name: snapshot.username || `User ${snapshot.user_id}`,
            value: `Sent: <t:${Math.floor(new Date(snapshot.sent_at).getTime() / 1000)}:R>\nBy: ${snapshot.sent_by_username || 'Unknown'}\nRoles saved: ${snapshot.roles?.length || 0}${snapshot.reason ? `\nReason: ${snapshot.reason}` : ''}`,
            inline: true
        }));

    embed.addFields(fields);

    if (snapshots.length > 10) {
        embed.setFooter({ text: `... and ${snapshots.length - 10} more` });
    }

    await interaction.editReply({ embeds: [embed] });
}

// Handle user selection for sending to shadow realm
async function handleShadowRealmSendSelect(interaction) {
    try {
        const selectedUser = interaction.users.first();
        if (!selectedUser) {
            return await interaction.reply({
                content: '❌ No user selected.',
                ephemeral: true
            });
        }

        // Check if reason is already encoded in customId (from slash command)
        let reason = null;
        const customId = interaction.customId;
        if (customId.startsWith('shadow_realm_send_user_')) {
            try {
                const encodedReason = customId.replace('shadow_realm_send_user_', '');
                if (encodedReason) {
                    reason = Buffer.from(encodedReason, 'base64').toString('utf-8');
                }
            } catch (error) {
                console.error('❌ Error decoding reason from customId:', error);
            }
        }

        // If reason is already provided (from slash command), proceed directly
        if (reason !== null) {
            await processShadowRealmSend(interaction, selectedUser, reason);
            return;
        }

        // If no reason provided (button flow), show modal to get reason
        const modal = new ModalBuilder()
            .setCustomId(`shadow_realm_reason_modal_${selectedUser.id}`)
            .setTitle('Send to Shadow Realm - Reason');

        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason (Optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Enter reason for sending to Shadow Realm...')
            .setRequired(false)
            .setMaxLength(500);

        const reasonRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(reasonRow);

        await interaction.showModal(modal);
    } catch (error) {
        console.error('❌ Error handling shadow realm send select:', error);
        await interaction.reply({
            content: `❌ Error: ${error.message}`,
            ephemeral: true
        });
    }
}

// Process the actual Shadow Realm send
async function processShadowRealmSend(interaction, selectedUser, reason = null) {
    try {
        const guild = interaction.guild;
        const targetMember = await guild.members.fetch(selectedUser.id);
        const shadowRealmRoleId = config.roles.shadowRealmRole;

        if (!shadowRealmRoleId) {
            if (interaction.deferred) {
                return await interaction.editReply({
                    content: '❌ Shadow Realm role not configured. Please set it in config.'
                });
            } else {
                return await interaction.reply({
                    content: '❌ Shadow Realm role not configured. Please set it in config.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        const shadowRealmRole = await guild.roles.fetch(shadowRealmRoleId);
        if (!shadowRealmRole) {
            if (interaction.deferred) {
                return await interaction.editReply({
                    content: '❌ Shadow Realm role not found. Please check the role ID.'
                });
            } else {
                return await interaction.reply({
                    content: '❌ Shadow Realm role not found. Please check the role ID.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Refresh member to ensure we have latest role state
        await targetMember.fetch(true);

        // Check if user is already in shadow realm (has the role)
        const hasShadowRealmRole = targetMember.roles.cache.has(shadowRealmRoleId);
        
        // Also check snapshot to see if they're tracked as being in Shadow Realm
        const existingSnapshot = dataManager.getShadowRealmSnapshot(selectedUser.id);
        
        if (hasShadowRealmRole) {
            // User has the role - they're in Shadow Realm
            if (!existingSnapshot) {
                // They have the role but no snapshot - this is an edge case
                // Remove the role and allow sending them again
                console.log(`⚠️ User ${selectedUser.username} has Shadow Realm role but no snapshot. Removing role and allowing re-send.`);
                await targetMember.roles.remove(shadowRealmRoleId);
                await targetMember.fetch(true);
            } else {
                // They have both role and snapshot - they're legitimately in Shadow Realm
                if (interaction.deferred) {
                    return await interaction.editReply({
                        content: `⚠️ ${selectedUser.username} is already in Shadow Realm.`
                    });
                } else {
                    return await interaction.reply({
                        content: `⚠️ ${selectedUser.username} is already in Shadow Realm.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        }
        
        // If there's a stale snapshot (user was restored but snapshot wasn't cleared)
        if (existingSnapshot && !hasShadowRealmRole) {
            // User was restored but snapshot still exists - clear it
            console.log(`🧹 Clearing stale snapshot for ${selectedUser.username}`);
            await dataManager.removeShadowRealmSnapshot(
                selectedUser.id,
                interaction.user.id,
                interaction.user.username
            );
        }

        // Get all user's roles (excluding @everyone)
        const userRoles = targetMember.roles.cache
            .filter(role => role.id !== guild.id) // Exclude @everyone
            .map(role => role.id);

        // Save role snapshot
        await dataManager.saveShadowRealmSnapshot(
            selectedUser.id,
            selectedUser.username,
            userRoles,
            interaction.user.id,
            interaction.user.username,
            reason
        );

        // Remove all roles except @everyone
        await targetMember.roles.set([]);

        // Add Shadow Realm role
        await targetMember.roles.add(shadowRealmRole);

        // Log admin action
        try {
            await interactionLogger.logAdminAction(interaction.client, {
                admin: `${interaction.user.tag} (${interaction.user.id})`,
                action: 'Send to Shadow Realm',
                details: `User: ${selectedUser.tag} (${selectedUser.id})\nRoles removed: ${userRoles.length}${reason ? `\nReason: ${reason}` : ''}`
            });
        } catch (logError) {
            console.error('❌ Error logging admin action:', logError);
        }

        // Reply or edit reply depending on interaction state
        if (interaction.deferred) {
            await interaction.editReply({
                content: `✅ **${selectedUser.username}** has been sent to Shadow Realm.\n\n**Roles removed:** ${userRoles.length}\n**Roles saved for restoration.**${reason ? `\n\n**Reason:** ${reason}` : ''}`
            });
        } else if (!interaction.replied) {
            await interaction.reply({
                content: `✅ **${selectedUser.username}** has been sent to Shadow Realm.\n\n**Roles removed:** ${userRoles.length}\n**Roles saved for restoration.**${reason ? `\n\n**Reason:** ${reason}` : ''}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Notification to Shadow Realm notifications channel disabled per request
        // (Previously sent notifications but was causing unwanted warnings/alerts)
    } catch (error) {
        console.error('❌ Error processing shadow realm send:', error);
        if (interaction.deferred) {
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        } else if (!interaction.replied) {
            await interaction.reply({
                content: `❌ Error: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

// Handle user selection for restoring from shadow realm
async function handleShadowRealmRestoreSelect(interaction) {
    try {
        const selectedUser = interaction.users.first();
        if (!selectedUser) {
            return await interaction.reply({
                content: '❌ No user selected.',
                ephemeral: true
            });
        }

        const guild = interaction.guild;
        const targetMember = await guild.members.fetch(selectedUser.id);
        const shadowRealmRoleId = config.roles.shadowRealmRole;

        // Refresh member to get latest state
        await targetMember.fetch(true);

        // Check if user is in shadow realm (must have the role)
        const hasShadowRealmRole = targetMember.roles.cache.has(shadowRealmRoleId);
        if (!hasShadowRealmRole) {
            return await interaction.reply({
                content: `⚠️ ${selectedUser.username} is not in Shadow Realm (does not have Shadow Realm role).`,
                ephemeral: true
            });
        }

        // Get role snapshot
        const snapshot = dataManager.getShadowRealmSnapshot(selectedUser.id);
        if (!snapshot) {
            return await interaction.reply({
                content: `❌ No role snapshot found for ${selectedUser.username}. They may have been sent to Shadow Realm before this feature was added.`,
                ephemeral: true
            });
        }

        // Remove Shadow Realm role first (before restoring other roles)
        await targetMember.roles.remove(shadowRealmRoleId);
        
        // Refresh member to ensure role was removed
        await targetMember.fetch(true);
        
        // Verify role was removed - if still present, try again
        if (targetMember.roles.cache.has(shadowRealmRoleId)) {
            console.warn(`⚠️ Shadow Realm role still present after removal attempt for ${selectedUser.username}, retrying...`);
            await targetMember.roles.remove(shadowRealmRoleId);
            await targetMember.fetch(true);
            
            // Final check
            if (targetMember.roles.cache.has(shadowRealmRoleId)) {
                console.error(`❌ Failed to remove Shadow Realm role for ${selectedUser.username} after multiple attempts`);
                return await interaction.reply({
                    content: `❌ Error: Could not remove Shadow Realm role. Please check bot permissions and role hierarchy.`,
                    ephemeral: true
                });
            }
        }

        // Restore all saved roles
        const rolesToRestore = snapshot.roles.filter(roleId => {
            const role = guild.roles.cache.get(roleId);
            return role && role.id !== guild.id; // Exclude @everyone and deleted roles
        });

        if (rolesToRestore.length > 0) {
            await targetMember.roles.add(rolesToRestore);
        }

        // Add trainer role (required role for restored users)
        const trainerRoleId = '1346598292192231485';
        const trainerRole = await guild.roles.fetch(trainerRoleId).catch(() => null);
        if (trainerRole && !targetMember.roles.cache.has(trainerRoleId)) {
            await targetMember.roles.add(trainerRole);
            console.log(`✅ Added trainer role to ${selectedUser.username} after Shadow Realm restoration`);
        }
        
        // Final refresh to ensure all roles are applied
        await targetMember.fetch(true);

        // Remove snapshot
        await dataManager.removeShadowRealmSnapshot(
            selectedUser.id,
            interaction.user.id,
            interaction.user.username
        );

        // Log admin action
        try {
            await interactionLogger.logAdminAction(interaction.client, {
                admin: `${interaction.user.tag} (${interaction.user.id})`,
                action: 'Restore from Shadow Realm',
                details: `User: ${selectedUser.tag} (${selectedUser.id})\nRoles restored: ${rolesToRestore.length}`
            });
        } catch (logError) {
            console.error('❌ Error logging admin action:', logError);
        }

        await interaction.reply({
            content: `✅ **${selectedUser.username}** has been restored from Shadow Realm.\n\n**Roles restored:** ${rolesToRestore.length}\n**Trainer role added.**`,
            ephemeral: true
        });
    } catch (error) {
        console.error('❌ Error handling shadow realm restore select:', error);
        await interaction.reply({
            content: `❌ Error: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleSetupShadowRealmButtons(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const shadowRealmChannelId = config.channels.shadowRealm;
    if (!shadowRealmChannelId) {
        return await interaction.editReply({
            content: '❌ Shadow Realm channel not configured. Please set it in config.'
        });
    }

    const guild = interaction.guild;
    const channel = await guild.channels.fetch(shadowRealmChannelId);
    
    if (!channel) {
        return await interaction.editReply({
            content: `❌ Shadow Realm channel not found. Please check the channel ID: ${shadowRealmChannelId}`
        });
    }

    const embed = new EmbedBuilder()
        .setColor(0x2F3136)
        .setTitle('🔮 Shadow Realm Control Panel')
        .setDescription('Use the buttons below to manage Shadow Realm users.\n\n**Send to Shadow Realm:** Remove all roles and restrict to this channel\n**Restore from Shadow Realm:** Restore all saved roles\n**Status:** View who is currently in Shadow Realm')
        .setFooter({ text: 'Only admins can use these controls' })
        .setTimestamp();

    const buttonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('shadow_realm_button_send')
                .setLabel('Send to Shadow Realm')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔮'),
            new ButtonBuilder()
                .setCustomId('shadow_realm_button_restore')
                .setLabel('Restore from Shadow Realm')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✨'),
            new ButtonBuilder()
                .setCustomId('shadow_realm_button_status')
                .setLabel('View Status')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊')
        );

    try {
        await channel.send({
            embeds: [embed],
            components: [buttonRow]
        });

        await interaction.editReply({
            content: `✅ Shadow Realm control panel created in <#${shadowRealmChannelId}>`
        });

        console.log(`✅ Admin ${interaction.user.username} set up Shadow Realm buttons in channel ${shadowRealmChannelId}`);
    } catch (error) {
        console.error('❌ Error setting up Shadow Realm buttons:', error);
        await interaction.editReply({
            content: `❌ Error: ${error.message}`
        });
    }
}

module.exports.handleShadowRealmSendSelect = handleShadowRealmSendSelect;
module.exports.handleShadowRealmRestoreSelect = handleShadowRealmRestoreSelect;
module.exports.handleSendToShadowRealm = handleSendToShadowRealm;
module.exports.handleRestoreFromShadowRealm = handleRestoreFromShadowRealm;
module.exports.handleShadowRealmStatus = handleShadowRealmStatus;

// Handle modal submission for Shadow Realm reason
async function handleShadowRealmSendModal(interaction) {
    try {
        const customId = interaction.customId;
        // Extract user ID from customId: shadow_realm_reason_modal_<userId>
        const userId = customId.replace('shadow_realm_reason_modal_', '');
        
        if (!userId) {
            return await interaction.reply({
                content: '❌ Error: Could not identify user.',
                ephemeral: true
            });
        }

        const reason = interaction.fields.getTextInputValue('reason') || null;
        
        // Fetch the user
        const guild = interaction.guild;
        const selectedUser = await guild.client.users.fetch(userId);
        
        if (!selectedUser) {
            return await interaction.reply({
                content: '❌ User not found.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });
        
        // Process the Shadow Realm send with the reason
        await processShadowRealmSend(interaction, selectedUser, reason);
    } catch (error) {
        console.error('❌ Error handling Shadow Realm send modal:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Error: ${error.message}`,
                ephemeral: true
            });
        }
    }
}

module.exports.handleShadowRealmSendModal = handleShadowRealmSendModal;

