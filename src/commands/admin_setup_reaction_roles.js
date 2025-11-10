const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.json');
const configManager = require('../utils/configManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_reaction_roles')
        .setDescription('Set up reaction role message for alert roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channelId = config.channels.reactionRoles || '1381823226493272094';
        const channel = interaction.client.channels.cache.get(channelId);

        if (!channel) {
            return await interaction.editReply({
                content: `❌ Channel not found. Please check the channel ID: ${channelId}`
            });
        }

        // Get role IDs from config
        const vaRole = config.roles.localRestockVA;
        const mdRole = config.roles.localRestockMD;
        const weeklyVaRole = config.roles.weeklyReportVA;
        const weeklyMdRole = config.roles.weeklyReportMD;

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔔 Alert Roles')
            .setDescription('React to this message to get your roles!')
            .addFields(
                {
                    name: '🚨 VA Alerts',
                    value: 'Get notified for **Virginia** restock alerts!\nReact with 🚨 to receive VA restock notifications.',
                    inline: false
                },
                {
                    name: '📋 MD Alerts',
                    value: 'Get notified for **Maryland** restock alerts!\nReact with 📋 to receive MD restock notifications.',
                    inline: false
                },
                {
                    name: '📅 Weekly VA Recap',
                    value: 'Get notified when **Weekly Virginia** restock reports are posted every Sunday!\nReact with 📅 to receive weekly VA recaps.',
                    inline: false
                },
                {
                    name: '📊 Weekly MD Recap',
                    value: 'Get notified when **Weekly Maryland** restock reports are posted every Sunday!\nReact with 📊 to receive weekly MD recaps.',
                    inline: false
                }
            )
            .setTimestamp();

        try {
            const message = await channel.send({ embeds: [embed] });
            
            // Add reactions
            await message.react('🚨'); // VA Alerts
            await message.react('📋'); // MD Alerts
            await message.react('📅'); // Weekly VA
            await message.react('📊'); // Weekly MD

            // Save message ID to config
            const currentConfig = await configManager.readConfig();
            if (!currentConfig.channels) {
                currentConfig.channels = {};
            }
            currentConfig.channels.reactionRoleMessageId = message.id;
            await configManager.writeConfig(currentConfig);

            await interaction.editReply({
                content: `✅ Reaction role message created in ${channel}!\n\n**Message ID:** ${message.id}\n**Reactions:** 🚨 (VA), 📋 (MD), 📅 (Weekly VA), 📊 (Weekly MD)\n\n⚠️ **Note:** Message ID has been saved to config. The bot will now only process reactions on this specific message.`
            });

            console.log(`✅ Admin ${interaction.user.username} set up reaction roles in channel ${channelId}. Message ID: ${message.id}`);
        } catch (error) {
            console.error('❌ Error setting up reaction roles:', error);
            await interaction.editReply({
                content: `❌ Error setting up reaction roles: ${error.message}`
            });
        }
    }
};

