const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dataManager = require('./dataManager');
const configManager = require('./configManager');
const config = require('../../config/config.json');

/**
 * Handle admin button clicks
 */
async function handleAdminButtonClick(interaction) {
    try {
        const { customId } = interaction;
        const adminRoleId = config.roles.admin;
        const member = interaction.member;

        // Check admin permissions
        const hasAdminRole = member.roles.cache.has(adminRoleId);
        const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasAdminRole && !hasAdminPermission) {
            return await interaction.reply({
                content: '❌ **Access Denied**: You do not have permission to use this button.',
                ephemeral: true
            });
        }

        // Handle different admin actions
        switch (customId) {
            case 'admin_clear_restocks':
                await handleClearRestocks(interaction);
                break;
            case 'admin_remove_cooldown_start':
                await handleRemoveCooldownStart(interaction);
                break;
            case 'admin_test_weekly_report':
                await handleTestWeeklyReport(interaction);
                break;
            case 'admin_test_cleanup':
                await handleTestCleanup(interaction);
                break;
            case 'admin_setup_va_buttons':
                await handleSetupVAButtons(interaction);
                break;
            case 'admin_setup_md_buttons':
                await handleSetupMDButtons(interaction);
                break;
            case 'admin_setup_va_lookup':
                await handleSetupVALookup(interaction);
                break;
            case 'admin_setup_md_lookup':
                await handleSetupMDLookup(interaction);
                break;
            case 'admin_manage_stores':
                await handleManageStores(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown admin action.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('❌ Error handling admin button click:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ There was an error processing your request. Please try again.',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle clear restocks button
 */
async function handleClearRestocks(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const allData = dataManager.getData();
    const restockCount = allData.restocks ? allData.restocks.length : 0;
    const cooldownCount = allData.cooldowns ? allData.cooldowns.length : 0;
    const historyCount = allData.last_restocks ? allData.last_restocks.length : 0;

    allData.restocks = [];
    allData.cooldowns = [];
    allData.last_restocks = [];

    await dataManager.saveData();
    await dataManager.reload();

    const verifyData = dataManager.getData();
    const verifyRestocks = verifyData.restocks ? verifyData.restocks.length : 0;
    const verifyCooldowns = verifyData.cooldowns ? verifyData.cooldowns.length : 0;
    const verifyHistory = verifyData.last_restocks ? verifyData.last_restocks.length : 0;

    const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('🗑️ Restock Data Cleared')
        .setDescription('All restock data has been cleared from the database.')
        .addFields(
            { name: '📊 Restocks Removed', value: `${restockCount} restock reports`, inline: true },
            { name: '⏰ Cooldowns Removed', value: `${cooldownCount} cooldown entries`, inline: true },
            { name: '📅 History Cleared', value: `${historyCount} store history entries`, inline: true },
            { name: '✅ Verified', value: `Restocks: ${verifyRestocks}, Cooldowns: ${verifyCooldowns}, History: ${verifyHistory}`, inline: false },
            { name: '👤 Cleared By', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`✅ Admin ${interaction.user.username} cleared restock data via button`);
}

/**
 * Handle remove cooldown start (show store type selection)
 */
async function handleRemoveCooldownStart(interaction) {
    const storeTypeSelect = new StringSelectMenuBuilder()
        .setCustomId('admin_remove_cooldown_store_type')
        .setPlaceholder('Select store type...')
        .addOptions(
            { label: 'Target', value: 'target', emoji: '🎯' },
            { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
            { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' }
        );

    const row = new ActionRowBuilder().addComponents(storeTypeSelect);

    await interaction.reply({
        content: '**Step 1 of 2**: Select the store type',
        components: [row],
        ephemeral: true
    });
}

/**
 * Handle store type selection for remove cooldown
 */
async function handleRemoveCooldownStoreType(interaction) {
    const storeType = interaction.values[0];
    
    let stores = [];
    if (storeType === 'target') {
        stores = [
            ...(config.stores.target.va || []),
            ...(config.stores.target.md || [])
        ];
    } else if (storeType === 'bestbuy') {
        stores = [
            ...(config.stores.bestbuy.va || []),
            ...(config.stores.bestbuy.md || [])
        ];
    } else if (storeType === 'barnesandnoble') {
        stores = [
            ...(config.stores.barnesandnoble.va || []),
            ...(config.stores.barnesandnoble.md || [])
        ];
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
        .setCustomId(`admin_remove_cooldown_location_${storeType}`)
        .setPlaceholder('Select store location...')
        .addOptions(locationOptions);

    const row = new ActionRowBuilder().addComponents(locationSelect);

    await interaction.update({
        content: '**Step 2 of 2**: Select the store location',
        components: [row],
        ephemeral: true
    });
}

/**
 * Handle location selection and remove cooldown
 */
async function handleRemoveCooldownLocation(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const customId = interaction.customId;
    const storeType = customId.replace('admin_remove_cooldown_location_', '');
    const store = interaction.values[0];

    const cooldowns = dataManager.getCooldowns();
    const initialCount = cooldowns.length;
    const filteredCooldowns = cooldowns.filter(c => c.store !== store);
    const removedCount = initialCount - filteredCooldowns.length;

    dataManager.data.cooldowns = filteredCooldowns;
    await dataManager.saveData();
    await dataManager.reload();

    const verifyCooldowns = dataManager.getCooldowns();
    const verifyCount = verifyCooldowns.filter(c => c.store === store).length;

    const embed = new EmbedBuilder()
        .setColor(0x4CAF50)
        .setTitle('✅ Cooldown Removed')
        .setDescription(`Cooldown has been removed for the specified store.`)
        .addFields(
            { name: '🏪 Store', value: store, inline: false },
            { name: '📊 Cooldowns Removed', value: `${removedCount} cooldown entry/entries`, inline: true },
            { name: '✅ Verified', value: verifyCount === 0 ? 'No cooldowns remaining' : `⚠️ ${verifyCount} cooldown(s) still exist`, inline: true },
            { name: '👤 Removed By', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`✅ Admin ${interaction.user.username} removed cooldown via button for ${store}`);
}

/**
 * Handle test weekly report button
 */
async function handleTestWeeklyReport(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const { sendWeeklyReports } = require('./weeklyReportGenerator');
    const vaChannelId = config.channels.weeklyReportVA || config.channels.localRestockVA;
    const mdChannelId = config.channels.weeklyReportMD || config.channels.localRestockMD;

    await sendWeeklyReports(interaction.client);

    const embed = new EmbedBuilder()
        .setColor(0x4CAF50)
        .setTitle('✅ Weekly Reports Sent')
        .setDescription('Weekly recap reports have been sent to their respective channels.')
        .addFields(
            { name: '🛍️ VA Report', value: `<#${vaChannelId}>`, inline: true },
            { name: '🛍️ MD Report', value: `<#${mdChannelId}>`, inline: true },
            { name: '👤 Tested By', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`✅ Admin ${interaction.user.username} tested weekly reports via button`);
}

/**
 * Handle test cleanup button
 */
async function handleTestCleanup(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const allData = dataManager.getData();
    const restockCount = allData.restocks.length;
    const cooldownCount = allData.cooldowns.length;
    const storesWithCurrentWeek = allData.last_restocks.filter(s => s.current_week_restock_date).length;
    const storesWithPreviousWeek = allData.last_restocks.filter(s => s.previous_week_restock_date).length;

    await dataManager.cleanupOldData();

    const afterData = dataManager.getData();
    const storesWithCurrentWeekAfter = afterData.last_restocks.filter(s => s.current_week_restock_date).length;
    const storesWithPreviousWeekAfter = afterData.last_restocks.filter(s => s.previous_week_restock_date).length;

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🧹 Weekly Cleanup Test Completed')
        .setDescription('Weekly cleanup has been executed. Current week data moved to previous week.')
        .addFields(
            { name: '📊 Restocks Cleared', value: `${restockCount} restock reports`, inline: true },
            { name: '⏰ Cooldowns Cleared', value: `${cooldownCount} cooldown entries`, inline: true },
            { name: '📅 Week Migration', value: `${storesWithCurrentWeek} → ${storesWithPreviousWeekAfter} stores with previous week data`, inline: false },
            { name: '🔄 Current Week Reset', value: `${storesWithCurrentWeek} stores → ${storesWithCurrentWeekAfter} stores (now null)`, inline: false },
            { name: '👤 Executed By', value: interaction.user.username, inline: true }
        )
        .setFooter({ text: 'Use /lookup_va_restocks or /lookup_md_restocks to verify changes' })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`✅ Admin ${interaction.user.username} tested cleanup via button`);
}

/**
 * Handle setup VA buttons
 */
async function handleSetupVAButtons(interaction) {
    // Defer the button interaction first
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const adminSetupVA = require('../commands/admin_setup_button_va');
    await adminSetupVA.execute(interaction);
}

/**
 * Handle setup MD buttons
 */
async function handleSetupMDButtons(interaction) {
    // Defer the button interaction first
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const adminSetupMD = require('../commands/admin_setup_button_md');
    await adminSetupMD.execute(interaction);
}

/**
 * Handle setup VA lookup
 */
async function handleSetupVALookup(interaction) {
    // Defer the button interaction first
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const adminSetupVALookup = require('../commands/admin_setup_button_va_lookup');
    await adminSetupVALookup.execute(interaction);
}

/**
 * Handle setup MD lookup
 */
async function handleSetupMDLookup(interaction) {
    // Defer the button interaction first
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    const adminSetupMDLookup = require('../commands/admin_setup_button_md_lookup');
    await adminSetupMDLookup.execute(interaction);
}

/**
 * Handle manage stores button
 */
async function handleManageStores(interaction) {
    // Show action selection dropdown
    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId('admin_store_action')
        .setPlaceholder('Select action...')
        .addOptions(
            { label: 'Add Store', value: 'add', emoji: '➕', description: 'Add a new store to the list' },
            { label: 'Remove Store', value: 'remove', emoji: '➖', description: 'Remove a store from the list' },
            { label: 'View All Stores', value: 'view', emoji: '📋', description: 'View all stores by type and region' }
        );

    const row = new ActionRowBuilder().addComponents(actionSelect);

    await interaction.reply({
        content: '**Store Management**\nSelect an action to manage stores:',
        components: [row],
        ephemeral: true
    });
}

/**
 * Handle manage roles button
 */
async function handleManageRoles(interaction) {
    // Show action selection dropdown
    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId('admin_role_action')
        .setPlaceholder('Select action...')
        .addOptions(
            { label: 'Add Admin Role', value: 'add', emoji: '➕', description: 'Add a role as admin' },
            { label: 'Remove Admin Role', value: 'remove', emoji: '➖', description: 'Remove admin role' },
            { label: 'View Admin Roles', value: 'view', emoji: '📋', description: 'View all admin roles' }
        );

    const row = new ActionRowBuilder().addComponents(actionSelect);

    await interaction.reply({
        content: '**Role Management**\nSelect an action to manage admin roles:',
        components: [row],
        ephemeral: true
    });
}

/**
 * Handle store action selection
 */
async function handleStoreAction(interaction) {
    const action = interaction.values[0];
    
    if (action === 'add') {
        // Show store type selection
        const storeTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('admin_store_add_type')
            .setPlaceholder('Select store type...')
            .addOptions(
                { label: 'Target', value: 'target', emoji: '🎯' },
                { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' }
            );

        const row = new ActionRowBuilder().addComponents(storeTypeSelect);
        await interaction.update({
            content: '**Add Store**\nSelect store type:',
            components: [row]
        });
    } else if (action === 'remove') {
        // Show store type selection for removal
        const storeTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('admin_store_remove_type')
            .setPlaceholder('Select store type...')
            .addOptions(
                { label: 'Target', value: 'target', emoji: '🎯' },
                { label: 'Best Buy', value: 'bestbuy', emoji: '💻' },
                { label: 'Barnes & Noble', value: 'barnesandnoble', emoji: '📚' }
            );

        const row = new ActionRowBuilder().addComponents(storeTypeSelect);
        await interaction.update({
            content: '**Remove Store**\nSelect store type:',
            components: [row]
        });
    } else if (action === 'view') {
        await handleStoreView(interaction);
    }
}

/**
 * Handle store view
 */
async function handleStoreView(interaction) {
    try {
        await interaction.deferUpdate();
        
        const stores = await configManager.getAllStores();
        let storeList = '';

        if (!stores || Object.keys(stores).length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('📋 All Stores')
                .setDescription('No stores found in the configuration.')
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed], components: [] });
        }

        for (const [storeType, regions] of Object.entries(stores)) {
            if (!regions || typeof regions !== 'object') continue;
            
            for (const [region, storeList_arr] of Object.entries(regions)) {
                if (!Array.isArray(storeList_arr)) continue;
                
                storeList += `**${storeType.toUpperCase()} - ${region.toUpperCase()}** (${storeList_arr.length} stores)\n`;
                storeList_arr.forEach((store, idx) => {
                    if (store && typeof store === 'string') {
                        storeList += `${idx + 1}. ${store}\n`;
                    }
                });
                storeList += '\n';
            }
        }

        if (storeList.trim().length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('📋 All Stores')
                .setDescription('No stores found in the configuration.')
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed], components: [] });
        }

        // Discord embed description limit is 4096 characters, truncate if needed
        const maxLength = 4096;
        const truncated = storeList.length > maxLength;
        const displayList = truncated ? storeList.substring(0, maxLength - 10) + '...' : storeList;

        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('📋 All Stores')
            .setDescription(displayList)
            .setTimestamp();

        if (truncated) {
            embed.setFooter({ text: 'List truncated due to length limit' });
        }

        await interaction.editReply({ embeds: [embed], components: [] });
    } catch (error) {
        console.error('Error in handleStoreView:', error);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Error')
            .setDescription('There was an error retrieving the store list. Please check the console for details.')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
}

async function handleStoreAdd(interaction) {
    const customId = interaction.customId;
    const parts = customId.replace('admin_store_add_region_', '').split('_');
    const storeType = parts[0];
    const region = interaction.values[0];
    
    const modal = new ModalBuilder()
        .setCustomId(`admin_store_add_modal_${storeType}_${region}`)
        .setTitle('Add Store');

    const storeInput = new TextInputBuilder()
        .setCustomId('store_name')
        .setLabel('Store Name')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g., Target - Alexandria - 3101 Richmond Hwy, Alexandria, VA 22305')
        .setRequired(true)
        .setMaxLength(200);

    const storeRow = new ActionRowBuilder().addComponents(storeInput);
    modal.addComponents(storeRow);

    await interaction.showModal(modal);
}

/**
 * Handle store remove
 */
async function handleStoreRemove(interaction) {
    const customId = interaction.customId;
    const storeType = customId.replace('admin_store_remove_location_', '').split('_')[0];
    const region = customId.replace(`admin_store_remove_location_${storeType}_`, '');
    const store = interaction.values[0];

    await interaction.deferUpdate();

    const removed = await configManager.removeStore(storeType, region, store);

    if (removed) {
        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Store Removed')
            .setDescription(`**${store}** has been removed from the ${storeType} ${region} list.`)
            .addFields(
                { name: '🏪 Store', value: store, inline: false },
                { name: '👤 Removed By', value: interaction.user.username, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [] });
    } else {
        await interaction.editReply({
            content: '❌ Store not found or already removed.',
            components: []
        });
    }
}

/**
 * Handle role action selection
 */
async function handleRoleAction(interaction) {
    const action = interaction.values[0];
    
    if (action === 'add') {
        const modal = new ModalBuilder()
            .setCustomId('admin_role_add_modal')
            .setTitle('Add Admin Role');

        const roleInput = new TextInputBuilder()
            .setCustomId('role_id')
            .setLabel('Role ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Discord role ID...')
            .setRequired(true)
            .setMaxLength(20);

        const roleNameInput = new TextInputBuilder()
            .setCustomId('role_name')
            .setLabel('Role Name (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter role name for reference...')
            .setRequired(false)
            .setMaxLength(100);

        const roleRow = new ActionRowBuilder().addComponents(roleInput);
        const nameRow = new ActionRowBuilder().addComponents(roleNameInput);
        modal.addComponents(roleRow, nameRow);

        await interaction.showModal(modal);
    } else if (action === 'remove') {
        const roles = await configManager.getAdminRoles();
        const customRoles = roles.custom_admins || [];

        if (customRoles.length === 0) {
            return await interaction.update({
                content: '❌ No custom admin roles found.',
                components: []
            });
        }

        const roleSelect = new StringSelectMenuBuilder()
            .setCustomId('admin_role_remove_select')
            .setPlaceholder('Select role to remove...')
            .addOptions(customRoles.slice(0, 25).map(role => ({
                label: role.name || `Role ${role.id}`,
                value: role.id,
                description: `ID: ${role.id}`
            })));

        const row = new ActionRowBuilder().addComponents(roleSelect);
        await interaction.update({
            content: '**Remove Admin Role**\nSelect a role to remove:',
            components: [row]
        });
    } else if (action === 'view') {
        await handleRoleView(interaction);
    }
}

/**
 * Handle role view
 */
async function handleRoleView(interaction) {
    await interaction.deferUpdate();
    
    const roles = await configManager.getAdminRoles();
    const mainAdminRole = roles.admin;
    const customRoles = roles.custom_admins || [];

    let roleList = `**Main Admin Role:**\n<@&${mainAdminRole}> (ID: ${mainAdminRole})\n\n`;
    
    if (customRoles.length > 0) {
        roleList += '**Custom Admin Roles:**\n';
        customRoles.forEach((role, idx) => {
            roleList += `${idx + 1}. ${role.name || 'Unnamed'} - <@&${role.id}> (ID: ${role.id})\n`;
        });
    } else {
        roleList += '**Custom Admin Roles:** None';
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👥 Admin Roles')
        .setDescription(roleList)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
}

/**
 * Handle role add
 */
async function handleRoleAdd(interaction) {
    const roleId = interaction.fields.getTextInputValue('role_id');
    const roleName = interaction.fields.getTextInputValue('role_name') || `Role ${roleId}`;

    await interaction.deferReply({ ephemeral: true });

    try {
        const role = await interaction.guild.roles.fetch(roleId);
        const added = await configManager.addAdminRole(roleId, roleName);

        if (added) {
            const embed = new EmbedBuilder()
                .setColor(0x4CAF50)
                .setTitle('✅ Admin Role Added')
                .setDescription(`**${role.name}** has been added as an admin role.`)
                .addFields(
                    { name: '👥 Role', value: `${role} (${roleId})`, inline: false },
                    { name: '👤 Added By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({
                content: '❌ Role is already in the admin list.'
            });
        }
    } catch (error) {
        await interaction.editReply({
            content: '❌ Invalid role ID or role not found. Please check the role ID and try again.'
        });
    }
}

/**
 * Handle role remove
 */
async function handleRoleRemove(interaction) {
    const roleId = interaction.values[0];

    await interaction.deferUpdate();

    const removed = await configManager.removeAdminRole(roleId);

    if (removed) {
        const embed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle('✅ Admin Role Removed')
            .setDescription(`Role ID **${roleId}** has been removed from admin roles.`)
            .addFields(
                { name: '👤 Removed By', value: interaction.user.username, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [] });
    } else {
        await interaction.editReply({
            content: '❌ Role not found in admin list.',
            components: []
        });
    }
}

module.exports = {
    handleAdminButtonClick,
    handleRemoveCooldownStoreType,
    handleRemoveCooldownLocation,
    handleStoreAction,
    handleStoreAdd,
    handleStoreRemove,
    handleRoleAction,
    handleRoleAdd,
    handleRoleRemove
};

