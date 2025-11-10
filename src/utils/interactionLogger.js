const { EmbedBuilder } = require('discord.js');
const config = require('../../config/config.json');

// Log channel ID - where all interaction logs are sent
const LOG_CHANNEL_ID = '1436399300551643349';

/**
 * Send a log message to the logging channel
 */
async function logInteraction(client, logData) {
    try {
        if (!client || !client.isReady()) {
            console.log('⚠️ [Logger] Client not ready, skipping log');
            return;
        }

        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) {
            console.log(`⚠️ [Logger] Log channel ${LOG_CHANNEL_ID} not found in cache`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(logData.color || 0x5865F2)
            .setTitle(logData.title || '📝 Bot Interaction Log')
            .setTimestamp()
            .setFooter({ text: `Interaction ID: ${logData.interactionId || 'N/A'}` });

        if (logData.description) {
            embed.setDescription(logData.description);
        }

        if (logData.fields && logData.fields.length > 0) {
            embed.addFields(logData.fields);
        }

        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('❌ [Logger] Error sending log:', error);
    }
}

/**
 * Log a slash command interaction
 */
async function logCommand(interaction) {
    const commandName = interaction.commandName;
    const user = interaction.user;
    const channel = interaction.channel;
    const options = interaction.options;

    const fields = [
        { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
        { name: '📝 Command', value: `\`/${commandName}\``, inline: true },
        { name: '📍 Channel', value: channel ? `<#${channel.id}>` : 'DM', inline: true }
    ];

    // Add command options if any
    if (options && options.data && options.data.length > 0) {
        const optionsText = options.data.map(opt => {
            const value = opt.value?.toString() || 'N/A';
            return `**${opt.name}**: ${value.length > 100 ? value.substring(0, 97) + '...' : value}`;
        }).join('\n');
        fields.push({ name: '⚙️ Options', value: optionsText, inline: false });
    }

    await logInteraction(interaction.client, {
        title: '🔵 Slash Command',
        color: 0x5865F2,
        description: `**${commandName}** executed`,
        fields: fields,
        interactionId: interaction.id
    });
}

/**
 * Log a button interaction
 */
async function logButton(interaction) {
    const customId = interaction.customId;
    const user = interaction.user;
    const channel = interaction.channel;

    await logInteraction(interaction.client, {
        title: '🔘 Button Click',
        color: 0x00D9FF,
        description: `Button **${customId}** clicked`,
        fields: [
            { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
            { name: '🔘 Button', value: `\`${customId}\``, inline: true },
            { name: '📍 Channel', value: channel ? `<#${channel.id}>` : 'DM', inline: true }
        ],
        interactionId: interaction.id
    });
}

/**
 * Log a select menu interaction
 */
async function logSelectMenu(interaction) {
    const customId = interaction.customId;
    const values = interaction.values;
    const user = interaction.user;
    const channel = interaction.channel;

    await logInteraction(interaction.client, {
        title: '📋 Select Menu',
        color: 0xFFD700,
        description: `Select menu **${customId}** used`,
        fields: [
            { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
            { name: '📋 Menu', value: `\`${customId}\``, inline: true },
            { name: '📍 Channel', value: channel ? `<#${channel.id}>` : 'DM', inline: true },
            { name: '✅ Selected', value: values.map(v => `\`${v}\``).join(', ') || 'None', inline: false }
        ],
        interactionId: interaction.id
    });
}

/**
 * Log a modal submission
 */
async function logModal(interaction) {
    const customId = interaction.customId;
    const user = interaction.user;
    const channel = interaction.channel;
    const fields = interaction.fields;

    const fieldData = fields.fields.map(field => {
        const value = field.value?.toString() || '';
        return `**${field.customId}**: ${value.length > 100 ? value.substring(0, 97) + '...' : value}`;
    }).join('\n');

    await logInteraction(interaction.client, {
        title: '📝 Modal Submission',
        color: 0x9B59B6,
        description: `Modal **${customId}** submitted`,
        fields: [
            { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
            { name: '📝 Modal', value: `\`${customId}\``, inline: true },
            { name: '📍 Channel', value: channel ? `<#${channel.id}>` : 'DM', inline: true },
            { name: '📄 Fields', value: fieldData || 'None', inline: false }
        ],
        interactionId: interaction.id
    });
}

/**
 * Log a restock report
 */
async function logRestockReport(client, restockData) {
    await logInteraction(client, {
        title: '🚨 Restock Reported',
        color: 0xFF0000,
        description: `New restock report submitted`,
        fields: [
            { name: '🏪 Store', value: restockData.store || 'N/A', inline: true },
            { name: '📍 Region', value: restockData.region?.toUpperCase() || 'N/A', inline: true },
            { name: '📅 Date', value: restockData.date || 'N/A', inline: true },
            { name: '⏰ Time', value: restockData.time || 'N/A', inline: true },
            { name: '📝 Type', value: restockData.type || 'N/A', inline: true },
            { name: '👤 Reporter', value: restockData.reporter || 'Anonymous', inline: true }
        ]
    });
}

/**
 * Log a store check
 */
async function logStoreCheck(client, checkData) {
    await logInteraction(client, {
        title: '✅ Store Checked',
        color: 0x4CAF50,
        description: `Store marked as checked`,
        fields: [
            { name: '🏪 Store', value: checkData.store || 'N/A', inline: true },
            { name: '📍 Region', value: checkData.region?.toUpperCase() || 'N/A', inline: true },
            { name: '⏰ Checked At', value: checkData.time || 'N/A', inline: true }
        ]
    });
}

/**
 * Log an admin action
 */
async function logAdminAction(client, actionData) {
    await logInteraction(client, {
        title: '🛡️ Admin Action',
        color: 0xFF6B6B,
        description: `Admin action performed`,
        fields: [
            { name: '👤 Admin', value: actionData.admin || 'N/A', inline: true },
            { name: '⚙️ Action', value: actionData.action || 'N/A', inline: true },
            { name: '📝 Details', value: actionData.details || 'N/A', inline: false }
        ]
    });
}

module.exports = {
    logInteraction,
    logCommand,
    logButton,
    logSelectMenu,
    logModal,
    logRestockReport,
    logStoreCheck,
    logAdminAction
};

