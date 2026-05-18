const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.json');
const predictFlow = require('../utils/predictFlow');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_predict')
        .setDescription(
            'Post the public Restock Prediction panel (embed + VA/MD buttons) in the prediction channel (Admin)'
        )
        .addStringOption((option) =>
            option
                .setName('channel_id')
                .setDescription('Override channel ID (default: prediction channel from config/env)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const adminRoleId = config.roles.admin;
            const member = interaction.member;
            const hasAdminRole = member.roles.cache.has(adminRoleId);
            const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasAdminRole && !hasAdminPermission) {
                return interaction.reply({
                    content: '❌ **Access Denied**: You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const defaultCh = predictFlow.resolvePredictChannelId();
            const channelId =
                interaction.options.getString('channel_id')?.trim()?.replace(/^<#[^>]+>$/, '').replace(/\D/g, '') ||
                defaultCh;

            if (!channelId) {
                return interaction.editReply({
                    content: '❌ No prediction channel configured. Set `channels.predictRestocks` or `PREDICT_CHANNEL_ID`.'
                });
            }

            let channel = interaction.client.channels.cache.get(channelId);
            if (!channel) {
                channel = await interaction.client.channels.fetch(channelId).catch(() => null);
            }

            if (!channel || !channel.send) {
                return interaction.editReply({
                    content: `❌ Could not access channel \`${channelId}\`. Bot needs **View / Send Messages** there.`
                });
            }

            const payload = predictFlow.getPublicPanelPayload();
            await channel.send(payload);

            return interaction.editReply({
                content: `✅ Prediction panel posted in ${channelPing(channelId)}.\n_Re-run this anytime to drop another copy._`
            });
        } catch (error) {
            console.error('[admin_setup_predict]', error);
            try {
                if (interaction.deferred) {
                    return interaction.editReply({ content: `❌ ${error.message || 'Unexpected error.'}` });
                }
                return interaction.reply({ content: `❌ ${error.message || 'Unexpected error.'}`, ephemeral: true });
            } catch (_) {
                /* ignore */
            }
        }
    }
};

function channelPing(channelId) {
    return `<#${channelId}>`;
}
