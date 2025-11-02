const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const configManager = require('../utils/configManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_config')
        .setDescription('Interactive setup wizard to configure all channel and role IDs (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('channels')
                .setDescription('Update channel IDs')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('Update role IDs')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current configuration')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('quick_setup')
                .setDescription('Quick setup wizard for all IDs')
        ),

    async execute(interaction) {
        try {
            const adminRoleId = (await configManager.getAdminRoles()).admin;
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

            if (subcommand === 'quick_setup') {
                await handleQuickSetup(interaction);
            } else if (subcommand === 'channels') {
                await handleChannelSetup(interaction);
            } else if (subcommand === 'roles') {
                await handleRoleSetup(interaction);
            } else if (subcommand === 'view') {
                await handleViewConfig(interaction);
            }
        } catch (error) {
            console.error('❌ Error in admin_setup_config command:', error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ There was an error processing your request. Please check the console for details.'
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error processing your request. Please check the console for details.',
                    ephemeral: true
                });
            }
        }
    },
};

/**
 * Quick setup wizard - interactive step-by-step
 */
async function handleQuickSetup(interaction) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('admin_config_quick_setup_select')
        .setPlaceholder('What would you like to configure?')
        .addOptions(
            { 
                label: 'Essential Channels (5 most important)', 
                value: 'essential_channels', 
                description: 'Quick setup for main channels',
                emoji: '📢'
            },
            { 
                label: 'Essential Roles (5 most important)', 
                value: 'essential_roles', 
                description: 'Quick setup for main roles',
                emoji: '👥'
            },
            { 
                label: 'All Channels (Step-by-step)', 
                value: 'all_channels', 
                description: 'Configure all channels individually',
                emoji: '📋'
            },
            { 
                label: 'All Roles (Step-by-step)', 
                value: 'all_roles', 
                description: 'Configure all roles individually',
                emoji: '🔐'
            }
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        content: '**🚀 Quick Setup Wizard**\n\nChoose what you want to configure:\n\n**💡 Tip:** Essential options let you configure the 5 most important IDs at once!',
        components: [row],
        ephemeral: true
    });
}

/**
 * Channel setup - step by step
 */
async function handleChannelSetup(interaction) {
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

    await interaction.reply({
        content: '**Channel Setup**\nSelect which channel ID you want to update:',
        components: [row],
        ephemeral: true
    });
}

/**
 * Role setup - step by step
 */
async function handleRoleSetup(interaction) {
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

    await interaction.reply({
        content: '**Role Setup**\nSelect which role ID you want to update:',
        components: [row],
        ephemeral: true
    });
}

/**
 * View current configuration
 */
async function handleViewConfig(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const config = await configManager.readConfig();
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Current Configuration')
        .setDescription('Here are your current channel and role IDs:')
        .addFields(
            {
                name: '📢 Main Channels',
                value: `**Approvals:** <#${config.channels.restockApprovals}> (${config.channels.restockApprovals})\n` +
                       `**Approvals MD:** <#${config.channels.restockApprovalsMD}> (${config.channels.restockApprovalsMD})\n` +
                       `**VA Alerts:** <#${config.channels.localRestockVA}> (${config.channels.localRestockVA})\n` +
                       `**MD Alerts:** <#${config.channels.localRestockMD}> (${config.channels.localRestockMD})\n` +
                       `**VA Reports:** <#${config.channels.weeklyReportVA}> (${config.channels.weeklyReportVA})\n` +
                       `**MD Reports:** <#${config.channels.weeklyReportMD}> (${config.channels.weeklyReportMD})`,
                inline: false
            },
            {
                name: '👥 Roles',
                value: `**Admin:** <@&${config.roles.admin}> (${config.roles.admin})\n` +
                       `**VA Alerts:** <@&${config.roles.localRestockVA}> (${config.roles.localRestockVA})\n` +
                       `**MD Alerts:** <@&${config.roles.localRestockMD}> (${config.roles.localRestockMD})\n` +
                       `**VA Reports:** <@&${config.roles.weeklyReportVA}> (${config.roles.weeklyReportVA})\n` +
                       `**MD Reports:** <@&${config.roles.weeklyReportMD}> (${config.roles.weeklyReportMD})`,
                inline: false
            }
        )
        .setFooter({ text: 'Use /admin_setup_config channels or roles to update IDs' })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

