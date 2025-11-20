const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_test_reaction_roles')
        .setDescription('Create a test reaction role message in a specific channel (for testing)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to create test message in')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const testChannel = interaction.options.getChannel('channel');
        
        if (!testChannel) {
            return await interaction.editReply({
                content: `❌ Channel not found.`
            });
        }

        // Get role IDs from config
        const vaRoleId = config.roles.localRestockVA;
        const mdRoleId = config.roles.localRestockMD;
        const weeklyVaRoleId = config.roles.weeklyReportVA;
        const weeklyMdRoleId = config.roles.weeklyReportMD;

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔔 Test Alert Roles')
            .setDescription('React to this message to test role assignment!\n\n**This is a TEST message.**')
            .addFields(
                {
                    name: '🚨 VA Alerts',
                    value: 'React with 🚨 to test VA Alerts role assignment.',
                    inline: false
                },
                {
                    name: '📋 MD Alerts',
                    value: 'React with 📋 to test MD Alerts role assignment.',
                    inline: false
                },
                {
                    name: '📅 Weekly VA Recap',
                    value: 'React with 📅 to test Weekly VA Recap role assignment.',
                    inline: false
                },
                {
                    name: '📊 Weekly MD Recap',
                    value: 'React with 📊 to test Weekly MD Recap role assignment.',
                    inline: false
                }
            )
            .setFooter({ text: 'TEST MESSAGE - Check console logs when reacting' })
            .setTimestamp();

        try {
            const message = await testChannel.send({ embeds: [embed] });
            
            // Add reactions with small delays to avoid rate limits
            await message.react('🚨'); // VA Alerts (rotating_light)
            await new Promise(resolve => setTimeout(resolve, 500));
            await message.react('📋'); // MD Alerts (clipboard)
            await new Promise(resolve => setTimeout(resolve, 500));
            await message.react('📅'); // Weekly VA (date)
            await new Promise(resolve => setTimeout(resolve, 500));
            await message.react('📊'); // Weekly MD (bar_chart)

            await interaction.editReply({
                content: `✅ **Test reaction role message created!**\n\n**Channel:** ${testChannel}\n**Message ID:** ${message.id}\n**Message Link:** ${message.url}\n\n**Role IDs:**\n- VA Alerts: ${vaRoleId}\n- MD Alerts: ${mdRoleId}\n- Weekly VA: ${weeklyVaRoleId}\n- Weekly MD: ${weeklyMdRoleId}\n\n**To test:**\n1. React to the message with 🚨, 📋, 📅, or 📊\n2. Check console logs for event firing\n3. Verify roles are added/removed\n\n**Note:** This is a TEST message. The bot will process reactions on this message but won't save it to config.`
            });

            console.log(`✅ Test reaction role message created in channel ${testChannel.id}. Message ID: ${message.id}`);
            console.log(`📋 Test message will trigger reaction handlers - check logs when users react`);
        } catch (error) {
            console.error('❌ Error creating test reaction role message:', error);
            await interaction.editReply({
                content: `❌ Error creating test message: ${error.message}`
            });
        }
    }
};

