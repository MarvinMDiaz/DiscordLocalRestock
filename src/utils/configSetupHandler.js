const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const configManager = require('./configManager');

/**
 * Handle config channel select
 */
async function handleConfigChannelSelect(interaction) {
    const channelKey = interaction.values[0];
    const config = await configManager.readConfig();
    
    const currentValue = channelKey.startsWith('restock') || channelKey.startsWith('local') || channelKey.startsWith('weekly')
        ? config.channels[channelKey] || ''
        : config.commandChannels[channelKey] || '';

    const modal = new ModalBuilder()
        .setCustomId(`admin_config_channel_${channelKey}`)
        .setTitle(`Update ${channelKey}`);

    const channelIdInput = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Channel ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter channel ID (or leave empty to allow anywhere)')
        .setRequired(false)
        .setValue(currentValue)
        .setMaxLength(20);

    const channelRow = new ActionRowBuilder().addComponents(channelIdInput);
    modal.addComponents(channelRow);

    await interaction.showModal(modal);
}

/**
 * Handle config role select
 */
async function handleConfigRoleSelect(interaction) {
    const roleKey = interaction.values[0];
    const config = await configManager.readConfig();
    const currentValue = config.roles[roleKey] || '';

    const modal = new ModalBuilder()
        .setCustomId(`admin_config_role_${roleKey}`)
        .setTitle(`Update ${roleKey}`);

    const roleIdInput = new TextInputBuilder()
        .setCustomId('role_id')
        .setLabel('Role ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter role ID')
        .setRequired(true)
        .setValue(currentValue)
        .setMaxLength(20);

    const roleRow = new ActionRowBuilder().addComponents(roleIdInput);
    modal.addComponents(roleRow);

    await interaction.showModal(modal);
}

/**
 * Handle config channel modal submit
 */
async function handleConfigChannelSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const customId = interaction.customId;
    const channelKey = customId.replace('admin_config_channel_', '');
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();

    try {
        const config = await configManager.readConfig();
        
        // Determine if it's a main channel or command channel
        if (channelKey.startsWith('restock') || channelKey.startsWith('local') || channelKey.startsWith('weekly')) {
            if (!config.channels) config.channels = {};
            config.channels[channelKey] = channelId;
        } else {
            if (!config.commandChannels) config.commandChannels = {};
            config.commandChannels[channelKey] = channelId;
        }

        await configManager.writeConfig(config);

        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Channel Updated')
            .setDescription(`**${channelKey}** has been updated.`)
            .addFields(
                { name: 'Channel', value: channelId ? `<#${channelId}> (${channelId})` : 'Unset (allows anywhere)', inline: false },
                { name: 'Updated By', value: interaction.user.username, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ Admin ${interaction.user.username} updated channel ${channelKey} to ${channelId}`);
    } catch (error) {
        console.error('Error updating channel:', error);
        await interaction.editReply({
            content: '❌ There was an error updating the channel ID. Please check the console for details.'
        });
    }
}

/**
 * Handle config role modal submit
 */
async function handleConfigRoleSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const customId = interaction.customId;
    const roleKey = customId.replace('admin_config_role_', '');
    const roleId = interaction.fields.getTextInputValue('role_id').trim();

    if (!roleId || !/^\d{17,19}$/.test(roleId)) {
        return await interaction.editReply({
            content: '❌ Invalid role ID. Please enter a valid Discord role ID (17-19 digits).'
        });
    }

    try {
        const config = await configManager.readConfig();
        
        if (!config.roles) config.roles = {};
        config.roles[roleKey] = roleId;

        await configManager.writeConfig(config);

        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Role Updated')
            .setDescription(`**${roleKey}** has been updated.`)
            .addFields(
                { name: 'Role', value: `<@&${roleId}> (${roleId})`, inline: false },
                { name: 'Updated By', value: interaction.user.username, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ Admin ${interaction.user.username} updated role ${roleKey} to ${roleId}`);
    } catch (error) {
        console.error('Error updating role:', error);
        await interaction.editReply({
            content: '❌ There was an error updating the role ID. Please check the console for details.'
        });
    }
}

/**
 * Handle quick setup select menu
 */
async function handleQuickSetupSelect(interaction) {
    const option = interaction.values[0];
    const config = await configManager.readConfig();

    if (option === 'essential_channels') {
        // Show modal with 5 essential channel IDs
        const modal = new ModalBuilder()
            .setCustomId('admin_config_essential_channels')
            .setTitle('Essential Channels Setup');

        const restockApprovalsInput = new TextInputBuilder()
            .setCustomId('restockApprovals')
            .setLabel('Restock Approvals Channel')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Channel for approval messages (VA+MD)')
            .setRequired(true)
            .setValue(config.channels?.restockApprovals || '')
            .setMaxLength(20);

        const vaAlertsInput = new TextInputBuilder()
            .setCustomId('localRestockVA')
            .setLabel('VA Alerts Channel')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Public VA restock alerts channel')
            .setRequired(true)
            .setValue(config.channels?.localRestockVA || '')
            .setMaxLength(20);

        const mdAlertsInput = new TextInputBuilder()
            .setCustomId('localRestockMD')
            .setLabel('MD Alerts Channel')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Public MD restock alerts channel')
            .setRequired(true)
            .setValue(config.channels?.localRestockMD || '')
            .setMaxLength(20);

        const vaReportsInput = new TextInputBuilder()
            .setCustomId('weeklyReportVA')
            .setLabel('VA Weekly Reports Channel')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('VA weekly recap reports channel')
            .setRequired(true)
            .setValue(config.channels?.weeklyReportVA || '')
            .setMaxLength(20);

        const mdReportsInput = new TextInputBuilder()
            .setCustomId('weeklyReportMD')
            .setLabel('MD Weekly Reports Channel')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('MD weekly recap reports channel')
            .setRequired(true)
            .setValue(config.channels?.weeklyReportMD || '')
            .setMaxLength(20);

        modal.addComponents(
            new ActionRowBuilder().addComponents(restockApprovalsInput),
            new ActionRowBuilder().addComponents(vaAlertsInput),
            new ActionRowBuilder().addComponents(mdAlertsInput),
            new ActionRowBuilder().addComponents(vaReportsInput),
            new ActionRowBuilder().addComponents(mdReportsInput)
        );

        await interaction.showModal(modal);
    } else if (option === 'essential_roles') {
        // Show modal with 5 essential role IDs
        const modal = new ModalBuilder()
            .setCustomId('admin_config_essential_roles')
            .setTitle('Essential Roles Setup');

        const adminRoleInput = new TextInputBuilder()
            .setCustomId('admin')
            .setLabel('Admin Role')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Main admin role (required for admin commands)')
            .setRequired(true)
            .setValue(config.roles?.admin || '')
            .setMaxLength(20);

        const vaAlertsRoleInput = new TextInputBuilder()
            .setCustomId('localRestockVA')
            .setLabel('VA Alerts Role')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Role mentioned in VA alerts')
            .setRequired(true)
            .setValue(config.roles?.localRestockVA || '')
            .setMaxLength(20);

        const mdAlertsRoleInput = new TextInputBuilder()
            .setCustomId('localRestockMD')
            .setLabel('MD Alerts Role')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Role mentioned in MD alerts')
            .setRequired(true)
            .setValue(config.roles?.localRestockMD || '')
            .setMaxLength(20);

        const vaReportsRoleInput = new TextInputBuilder()
            .setCustomId('weeklyReportVA')
            .setLabel('VA Reports Role')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Role mentioned in VA weekly reports')
            .setRequired(true)
            .setValue(config.roles?.weeklyReportVA || '')
            .setMaxLength(20);

        const mdReportsRoleInput = new TextInputBuilder()
            .setCustomId('weeklyReportMD')
            .setLabel('MD Reports Role')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Role mentioned in MD weekly reports')
            .setRequired(true)
            .setValue(config.roles?.weeklyReportMD || '')
            .setMaxLength(20);

        modal.addComponents(
            new ActionRowBuilder().addComponents(adminRoleInput),
            new ActionRowBuilder().addComponents(vaAlertsRoleInput),
            new ActionRowBuilder().addComponents(mdAlertsRoleInput),
            new ActionRowBuilder().addComponents(vaReportsRoleInput),
            new ActionRowBuilder().addComponents(mdReportsRoleInput)
        );

        await interaction.showModal(modal);
    } else if (option === 'all_channels') {
        // Redirect to channel setup - show select menu
        const { StringSelectMenuBuilder } = require('discord.js');
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_config_channel_select')
            .setPlaceholder('Select channel to update...')
            .addOptions(
                { label: 'Restock Approvals (VA+MD)', value: 'restockApprovals', description: 'Channel for approval messages' },
                { label: 'Restock Approvals (MD only)', value: 'restockApprovalsMD', description: 'MD approval channel' },
                { label: 'Local Restock VA', value: 'localRestockVA', description: 'Public VA alerts channel' },
                { label: 'Local Restock MD', value: 'localRestockMD', description: 'Public MD alerts channel' },
                { label: 'Weekly Report VA', value: 'weeklyReportVA', description: 'Weekly VA recap channel' },
                { label: 'Weekly Report MD', value: 'weeklyReportMD', description: 'Weekly MD recap channel' },
                { label: 'Report Past Restock VA', value: 'report_past_restock_va', description: 'Command channel' },
                { label: 'Restock In Progress VA', value: 'restock_in_progress_va', description: 'Command channel' },
                { label: 'Lookup VA Restocks', value: 'lookup_va_restocks', description: 'Command channel' },
                { label: 'Report Past Restock MD', value: 'report_past_restock_md', description: 'Command channel' },
                { label: 'Restock In Progress MD', value: 'restock_in_progress_md', description: 'Command channel' },
                { label: 'Lookup MD Restocks', value: 'lookup_md_restocks', description: 'Command channel' }
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.update({
            content: '**Channel Setup**\nSelect which channel ID you want to update:',
            components: [row]
        });
    } else if (option === 'all_roles') {
        // Redirect to role setup
        const { StringSelectMenuBuilder } = require('discord.js');
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_config_role_select')
            .setPlaceholder('Select role to update...')
            .addOptions(
                { label: 'Admin Role', value: 'admin', description: 'Main admin role' },
                { label: 'Local Restock VA Role', value: 'localRestockVA', description: 'VA alerts mention role' },
                { label: 'Local Restock MD Role', value: 'localRestockMD', description: 'MD alerts mention role' },
                { label: 'Weekly Report VA Role', value: 'weeklyReportVA', description: 'VA recap mention role' },
                { label: 'Weekly Report MD Role', value: 'weeklyReportMD', description: 'MD recap mention role' }
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.update({
            content: '**Role Setup**\nSelect which role ID you want to update:',
            components: [row]
        });
    }
}

/**
 * Handle essential channels submit
 */
async function handleEssentialChannelsSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const config = await configManager.readConfig();
        if (!config.channels) config.channels = {};

        const updates = {
            restockApprovals: interaction.fields.getTextInputValue('restockApprovals').trim(),
            localRestockVA: interaction.fields.getTextInputValue('localRestockVA').trim(),
            localRestockMD: interaction.fields.getTextInputValue('localRestockMD').trim(),
            weeklyReportVA: interaction.fields.getTextInputValue('weeklyReportVA').trim(),
            weeklyReportMD: interaction.fields.getTextInputValue('weeklyReportMD').trim()
        };

        // Validate all IDs are provided
        for (const [key, value] of Object.entries(updates)) {
            if (!value || !/^\d{17,19}$/.test(value)) {
                return await interaction.editReply({
                    content: `❌ Invalid channel ID for ${key}. Please enter a valid Discord channel ID (17-19 digits).`
                });
            }
        }

        // Update config
        Object.assign(config.channels, updates);
        await configManager.writeConfig(config);

        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Essential Channels Updated!')
            .setDescription('All 5 essential channel IDs have been updated successfully.')
            .addFields(
                { name: '📢 Restock Approvals', value: `<#${updates.restockApprovals}>`, inline: true },
                { name: '🔵 VA Alerts', value: `<#${updates.localRestockVA}>`, inline: true },
                { name: '🔴 MD Alerts', value: `<#${updates.localRestockMD}>`, inline: true },
                { name: '📊 VA Reports', value: `<#${updates.weeklyReportVA}>`, inline: true },
                { name: '📊 MD Reports', value: `<#${updates.weeklyReportMD}>`, inline: true },
                { name: '👤 Updated By', value: interaction.user.username, inline: true }
            )
            .setFooter({ text: 'Use /admin_setup_config view to see all IDs' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ Admin ${interaction.user.username} updated essential channels via quick setup`);
    } catch (error) {
        console.error('Error updating essential channels:', error);
        await interaction.editReply({
            content: '❌ There was an error updating the channels. Please check the console for details.'
        });
    }
}

/**
 * Handle essential roles submit
 */
async function handleEssentialRolesSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const config = await configManager.readConfig();
        if (!config.roles) config.roles = {};

        const updates = {
            admin: interaction.fields.getTextInputValue('admin').trim(),
            localRestockVA: interaction.fields.getTextInputValue('localRestockVA').trim(),
            localRestockMD: interaction.fields.getTextInputValue('localRestockMD').trim(),
            weeklyReportVA: interaction.fields.getTextInputValue('weeklyReportVA').trim(),
            weeklyReportMD: interaction.fields.getTextInputValue('weeklyReportMD').trim()
        };

        // Validate all IDs are provided
        for (const [key, value] of Object.entries(updates)) {
            if (!value || !/^\d{17,19}$/.test(value)) {
                return await interaction.editReply({
                    content: `❌ Invalid role ID for ${key}. Please enter a valid Discord role ID (17-19 digits).`
                });
            }
        }

        // Update config
        Object.assign(config.roles, updates);
        await configManager.writeConfig(config);

        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Essential Roles Updated!')
            .setDescription('All 5 essential role IDs have been updated successfully.')
            .addFields(
                { name: '🔐 Admin Role', value: `<@&${updates.admin}>`, inline: true },
                { name: '🔵 VA Alerts Role', value: `<@&${updates.localRestockVA}>`, inline: true },
                { name: '🔴 MD Alerts Role', value: `<@&${updates.localRestockMD}>`, inline: true },
                { name: '📊 VA Reports Role', value: `<@&${updates.weeklyReportVA}>`, inline: true },
                { name: '📊 MD Reports Role', value: `<@&${updates.weeklyReportMD}>`, inline: true },
                { name: '👤 Updated By', value: interaction.user.username, inline: true }
            )
            .setFooter({ text: 'Use /admin_setup_config view to see all IDs' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ Admin ${interaction.user.username} updated essential roles via quick setup`);
    } catch (error) {
        console.error('Error updating essential roles:', error);
        await interaction.editReply({
            content: '❌ There was an error updating the roles. Please check the console for details.'
        });
    }
}

/**
 * Handle quick setup modal submit (legacy - kept for compatibility)
 */
async function handleQuickSetupSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const channelsJson = interaction.fields.getTextInputValue('channels').trim();
        const rolesJson = interaction.fields.getTextInputValue('roles').trim();
        const commandChannelsJson = interaction.fields.getTextInputValue('command_channels').trim();

        const config = await configManager.readConfig();
        
        if (channelsJson) {
            try {
                const channels = JSON.parse(channelsJson);
                // Merge with existing config, preserving comments
                config.channels = { ...config.channels, ...channels };
            } catch (e) {
                return await interaction.editReply({
                    content: '❌ Invalid JSON format for channels. Please check your JSON syntax.'
                });
            }
        }

        if (rolesJson) {
            try {
                const roles = JSON.parse(rolesJson);
                config.roles = { ...config.roles, ...roles };
            } catch (e) {
                return await interaction.editReply({
                    content: '❌ Invalid JSON format for roles. Please check your JSON syntax.'
                });
            }
        }

        if (commandChannelsJson) {
            try {
                const commandChannels = JSON.parse(commandChannelsJson);
                config.commandChannels = { ...config.commandChannels, ...commandChannels };
            } catch (e) {
                return await interaction.editReply({
                    content: '❌ Invalid JSON format for command channels. Please check your JSON syntax.'
                });
            }
        }

        await configManager.writeConfig(config);

        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Configuration Updated')
            .setDescription('All IDs have been updated successfully!')
            .addFields(
                { name: 'Channels Updated', value: channelsJson ? '✅' : '⏭️ Skipped', inline: true },
                { name: 'Roles Updated', value: rolesJson ? '✅' : '⏭️ Skipped', inline: true },
                { name: 'Command Channels Updated', value: commandChannelsJson ? '✅' : '⏭️ Skipped', inline: true },
                { name: 'Updated By', value: interaction.user.username, inline: true }
            )
            .setFooter({ text: 'Use /admin_setup_config view to verify your changes' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ Admin ${interaction.user.username} updated configuration via quick setup`);
    } catch (error) {
        console.error('Error in quick setup:', error);
        await interaction.editReply({
            content: '❌ There was an error updating the configuration. Please check the console for details.'
        });
    }
}

module.exports = {
    handleQuickSetupSelect,
    handleEssentialChannelsSubmit,
    handleEssentialRolesSubmit,
    handleConfigChannelSelect,
    handleConfigRoleSelect,
    handleConfigChannelSubmit,
    handleConfigRoleSubmit,
    handleQuickSetupSubmit
};

