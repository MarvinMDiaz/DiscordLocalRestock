const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
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
        ),

    async execute(interaction) {
        try {
            const adminRoleId = config.roles.admin;
            const member = interaction.member;

            const hasAdminRole = member.roles.cache.has(adminRoleId);
            const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPermission) {
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
    await interaction.deferReply({ ephemeral: true });

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('shadow_realm_send_user')
        .setPlaceholder('Select user to send to Shadow Realm...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);

    await interaction.editReply({
        content: '**🔮 Send to Shadow Realm**\n\nSelect the user you want to send to Shadow Realm. They will lose all roles and only be able to see the Shadow Realm channel.',
        components: [row]
    });
}

async function handleRestoreFromShadowRealm(interaction) {
    await interaction.deferReply({ ephemeral: true });

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
    await interaction.deferReply({ ephemeral: true });

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
        value: `Sent: <t:${Math.floor(new Date(snapshot.sent_at).getTime() / 1000)}:R>\nBy: ${snapshot.sent_by_username || 'Unknown'}\nRoles saved: ${snapshot.roles?.length || 0}`,
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

        const guild = interaction.guild;
        const targetMember = await guild.members.fetch(selectedUser.id);
        const shadowRealmRoleId = config.roles.shadowRealmRole;

        if (!shadowRealmRoleId) {
            return await interaction.reply({
                content: '❌ Shadow Realm role not configured. Please set it in config.',
                ephemeral: true
            });
        }

        const shadowRealmRole = await guild.roles.fetch(shadowRealmRoleId);
        if (!shadowRealmRole) {
            return await interaction.reply({
                content: '❌ Shadow Realm role not found. Please check the role ID.',
                ephemeral: true
            });
        }

        // Check if user is already in shadow realm
        if (targetMember.roles.cache.has(shadowRealmRoleId)) {
            return await interaction.reply({
                content: `⚠️ ${selectedUser.username} is already in Shadow Realm.`,
                ephemeral: true
            });
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
            interaction.user.username
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
                details: `User: ${selectedUser.tag} (${selectedUser.id})\nRoles removed: ${userRoles.length}`
            });
        } catch (logError) {
            console.error('❌ Error logging admin action:', logError);
        }

        await interaction.reply({
            content: `✅ **${selectedUser.username}** has been sent to Shadow Realm.\n\n**Roles removed:** ${userRoles.length}\n**Roles saved for restoration.**`,
            ephemeral: true
        });

        // Send message to shadow realm channel
        const shadowRealmChannelId = config.channels.shadowRealm;
        if (shadowRealmChannelId) {
            try {
                const shadowRealmChannel = await guild.channels.fetch(shadowRealmChannelId);
                if (shadowRealmChannel) {
                    await shadowRealmChannel.send({
                        content: `🔮 **${selectedUser.username}** has been sent to Shadow Realm.\n\nYou can only see this channel. Use \`/admin_shadow_realm restore\` to restore your roles.`
                    });
                }
            } catch (error) {
                console.error('❌ Error sending message to Shadow Realm channel:', error);
            }
        }
    } catch (error) {
        console.error('❌ Error handling shadow realm send select:', error);
        await interaction.reply({
            content: `❌ Error: ${error.message}`,
            ephemeral: true
        });
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

        // Check if user is in shadow realm
        if (!targetMember.roles.cache.has(shadowRealmRoleId)) {
            return await interaction.reply({
                content: `⚠️ ${selectedUser.username} is not in Shadow Realm.`,
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

        // Remove Shadow Realm role
        await targetMember.roles.remove(shadowRealmRoleId);

        // Restore all saved roles
        const rolesToRestore = snapshot.roles.filter(roleId => {
            const role = guild.roles.cache.get(roleId);
            return role && role.id !== guild.id; // Exclude @everyone and deleted roles
        });

        if (rolesToRestore.length > 0) {
            await targetMember.roles.add(rolesToRestore);
        }

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
            content: `✅ **${selectedUser.username}** has been restored from Shadow Realm.\n\n**Roles restored:** ${rolesToRestore.length}`,
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

module.exports.handleShadowRealmSendSelect = handleShadowRealmSendSelect;
module.exports.handleShadowRealmRestoreSelect = handleShadowRealmRestoreSelect;

