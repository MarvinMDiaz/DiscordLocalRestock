const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const crowdTracker = require('../utils/crowdTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_crowd_tracker')
        .setDescription('Reset or expire a live crowd tracker (Admin/Mods)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption((option) =>
            option
                .setName('action')
                .setDescription('What to do with this tracker')
                .setRequired(true)
                .addChoices(
                    { name: 'Expire tracker', value: 'expire' },
                    { name: 'Reset tracker', value: 'reset' }
                )
        )
        .addStringOption((option) =>
            option
                .setName('alert_message_id')
                .setDescription('The public restock alert message ID')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!crowdTracker.canModerate(interaction.member)) {
            return interaction.reply({
                content: '❌ You need Manage Messages or Administrator to manage crowd trackers.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const action = interaction.options.getString('action');
        const alertId = interaction.options.getString('alert_message_id')?.trim();

        try {
            const state =
                action === 'reset'
                    ? await crowdTracker.resetTracker(interaction.client, alertId)
                    : await crowdTracker.expireTracker(interaction.client, alertId, `admin:${interaction.user.id}`);

            if (!state) {
                return interaction.editReply({
                    content: '❌ No crowd tracker found for that alert message ID.'
                });
            }

            const embed = new EmbedBuilder()
                .setColor(action === 'reset' ? 0x57f287 : 0x95a5a6)
                .setTitle(action === 'reset' ? '✅ Crowd Tracker Reset' : '⌛ Crowd Tracker Expired')
                .addFields(
                    { name: 'Alert Message ID', value: alertId, inline: false },
                    { name: 'Store', value: state.store_name || 'Unknown', inline: false },
                    { name: 'Updated By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ Error managing crowd tracker:', error);
            return interaction.editReply({
                content: '❌ There was an error managing that crowd tracker. Check logs for details.'
            });
        }
    }
};
