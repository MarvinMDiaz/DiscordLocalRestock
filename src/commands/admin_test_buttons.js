const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_test_buttons')
        .setDescription('Send restock reporting buttons to a specific channel for testing (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('The ID of the channel where buttons will be sent')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channelId = interaction.options.getString('channel_id');
        const channel = interaction.client.channels.cache.get(channelId);

        if (!channel) {
            return await interaction.editReply({
                content: `❌ Channel not found. Please check the channel ID: ${channelId}`
            });
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x00BFFF) // Blue
            .setTitle('🚨 Restock Reporting - Test Channel')
            .setDescription('Use the buttons below to report restocks for testing purposes.')
            .addFields(
                {
                    name: '🚨 Restock In Progress',
                    value: 'Report a restock that is **currently happening** at a store location.',
                    inline: false
                },
                {
                    name: '📋 Past Restock',
                    value: 'Log a restock that **already occurred** (for historical tracking only).',
                    inline: false
                },
                {
                    name: '📅 Upcoming Restock',
                    value: 'Report a restock that is **scheduled to happen** in the future. Include what will be restocking and when.',
                    inline: false
                },
                {
                    name: '📝 Quick Guide',
                    value: '1️⃣ Click a button below\n2️⃣ Select store type (Target, Best Buy, or Barnes & Noble)\n3️⃣ Choose the location\n4️⃣ ⏰ For past/upcoming restocks: Select date\n5️⃣ 📝 For upcoming: Add note about what will restock\n6️⃣ ⚠️ **Confirm** your submission\n7️⃣ ✅ Report submitted for approval!',
                    inline: false
                },
                {
                    name: '⚠️ Important',
                    value: '**This is a test channel.** All reports will still go through the normal approval process.',
                    inline: false
                }
            )
            .setTimestamp();

        // Create buttons - three buttons side by side
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('report_restock_button_va')
                    .setLabel('Restock In Progress')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🚨'),
                new ButtonBuilder()
                    .setCustomId('report_past_restock_button_va')
                    .setLabel('Past Restock')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋'),
                new ButtonBuilder()
                    .setCustomId('report_upcoming_restock_button_va')
                    .setLabel('Upcoming Restock')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📅')
            );

        try {
            await channel.send({
                embeds: [embed],
                components: [buttonRow]
            });

            await interaction.editReply({
                content: `✅ **Restock buttons sent successfully!**\n\n📍 **Channel**: ${channel}\n\nYou can now test the restock reporting workflow in that channel.`
            });

            console.log(`✅ Admin ${interaction.user.username} sent test buttons to channel ${channelId}`);
        } catch (error) {
            console.error('❌ Error sending test buttons:', error);
            await interaction.editReply({
                content: `❌ There was an error sending buttons to that channel:\n\`\`\`${error.message}\`\`\``
            });
        }
    },
};


