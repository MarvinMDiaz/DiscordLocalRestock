const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_setup_newlook')
        .setDescription('Post New Look consolidated Report + Lookup buttons (Admin only)')
        .addStringOption((option) =>
            option
                .setName('report_channel_id')
                .setDescription('Override #report-restocks channel ID (default: config.channels.newlookReportRestocks)')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('lookup_channel_id')
                .setDescription('Override #lookup-restocks channel ID (default: config.channels.newlookLookupRestocks)')
                .setRequired(false)
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

            await interaction.deferReply({ ephemeral: true });

            const reportChannelId =
                interaction.options.getString('report_channel_id') || config.channels?.newlookReportRestocks;
            const lookupChannelId =
                interaction.options.getString('lookup_channel_id') || config.channels?.newlookLookupRestocks;

            if (!reportChannelId?.trim()) {
                return interaction.editReply({ content: '❌ Missing `channels.newlookReportRestocks` in config.' });
            }
            if (!lookupChannelId?.trim()) {
                return interaction.editReply({ content: '❌ Missing `channels.newlookLookupRestocks` in config.' });
            }

            let reportChannel = interaction.client.channels.cache.get(reportChannelId);
            let lookupChannel = interaction.client.channels.cache.get(lookupChannelId);
            if (!reportChannel) reportChannel = await interaction.client.channels.fetch(reportChannelId).catch(() => null);
            if (!lookupChannel) lookupChannel = await interaction.client.channels.fetch(lookupChannelId).catch(() => null);

            if (!reportChannel || !lookupChannel) {
                return interaction.editReply({
                    content: '❌ Could not fetch one or both channels. Verify IDs and bot access.'
                });
            }

            const reportEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🚨 Live Restock Report')
                .setDescription(
                    '**Spot product on shelves right now?**\n' +
                    'Send a live restock report for moderator approval.\n\n' +
                    'Approved reports automatically post to the correct VA or MD alert channel.'
                )
                .addFields(
                    {
                        name: '📋 How It Works',
                        value:
                            '1️⃣ Choose **Virginia** or **Maryland**\n' +
                            '2️⃣ Select the **store chain**\n' +
                            '3️⃣ Pick the **exact location**\n' +
                            '4️⃣ Add current **line size** for crowd tracking',
                        inline: false
                    },
                    {
                        name: '✅ Before You Submit',
                        value:
                            '• Only report active/live restocks\n' +
                            '• Product should be confirmed on-site\n' +
                            '• False reports may be removed',
                        inline: false
                    },
                    {
                        name: '📡 Alert Channels',
                        value: 'VA → **#va-restock-alert**\nMD → **#md-restock-alert**',
                        inline: false
                    }
                )
                .setFooter({ text: 'Moderator approval required before alerts go live • Crowd tracking activates after approval' })
                .setTimestamp();

            const lookupEmbed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🔍 Look Up Store Restocks')
                .setDescription(
                    '**Want to check recent restock activity?** Use this tool to look up a store and see its current week restock status.'
                )
                .addFields(
                    {
                        name: 'How It Works',
                        value:
                            '1. Pick **Virginia** or **Maryland**\n' +
                            '2. Choose the **store chain**\n' +
                            '3. Select a **location**\n' +
                            '4. View recent restock info for that store',
                        inline: false
                    },
                    {
                        name: 'Available Stores',
                        value: '**Target** · **Best Buy** · **Walmart** · **Barnes & Noble**',
                        inline: false
                    },
                    {
                        name: 'Good To Know',
                        value: 'Lookup data is based on reports already submitted to the bot. If something looks outdated, use the report flow when you confirm a live restock.',
                        inline: false
                    }
                )
                .setFooter({ text: 'Lookup is read-only · Reporting a restock uses the report button' })
                .setTimestamp();

            const reportRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('nl_btn_report_newlook')
                    .setLabel('Start Live Report')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🚨')
            );

            const lookupRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('nl_btn_lookup_newlook')
                    .setLabel('Look Up Restocks')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔍')
            );

            await reportChannel.send({ embeds: [reportEmbed], components: [reportRow] });
            await lookupChannel.send({ embeds: [lookupEmbed], components: [lookupRow] });

            await interaction.editReply({
                content: `✅ New Look panels sent.\n• Report: ${reportChannel}\n• Lookup: ${lookupChannel}`
            });
        } catch (error) {
            console.error('❌ admin_setup_newlook:', error);
            if (interaction.deferred) {
                await interaction.editReply({ content: '❌ Error setting up New Look. Check console.' });
            } else {
                await interaction.reply({ content: '❌ Error setting up New Look.', ephemeral: true });
            }
        }
    }
};
