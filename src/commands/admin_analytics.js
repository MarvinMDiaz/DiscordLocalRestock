const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dataManager = require('../utils/dataManager');
const config = require('../../config/config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_analytics')
        .setDescription('View bot usage analytics and statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const restocks = dataManager.getRestocks();
            const cooldowns = dataManager.getCooldowns();
            const lastRestocks = dataManager.getLastRestocks();

            // Time filters
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
            weekStart.setHours(0, 0, 0, 0);

            // Filter restocks by time periods
            const allTime = restocks;
            const thisWeek = restocks.filter(r => new Date(r.created_at) >= weekStart);
            const today = restocks.filter(r => new Date(r.created_at) >= todayStart);

            // Filter by status
            const pending = restocks.filter(r => r.status === 'pending');
            const approved = restocks.filter(r => r.status === 'approved');
            const rejected = restocks.filter(r => r.status === 'rejected');

            // Filter by type
            const inProgress = restocks.filter(r => r.type === 'in_progress');
            const pastRestocks = restocks.filter(r => r.is_past_restock);
            const upcomingRestocks = restocks.filter(r => r.is_upcoming_restock);

            // Filter by region (VA vs MD)
            const vaStores = [
                ...(config.stores?.target?.va || []),
                ...(config.stores?.bestbuy?.va || []),
                ...(config.stores?.barnesandnoble?.va || [])
            ];
            const mdStores = [
                ...(config.stores?.target?.md || []),
                ...(config.stores?.bestbuy?.md || []),
                ...(config.stores?.barnesandnoble?.md || [])
            ];

            const vaReports = restocks.filter(r => vaStores.includes(r.store));
            const mdReports = restocks.filter(r => mdStores.includes(r.store));

            // Filter by store type
            const targetReports = restocks.filter(r => 
                r.store.toLowerCase().includes('target')
            );
            const bestBuyReports = restocks.filter(r => 
                r.store.toLowerCase().includes('best buy')
            );
            const barnesReports = restocks.filter(r => 
                r.store.toLowerCase().includes('barnes')
            );

            // Filter by source
            const buttonReports = restocks.filter(r => r.source === 'button');
            const commandReports = restocks.filter(r => !r.source || r.source !== 'button');

            // Most reported stores
            const storeCounts = {};
            restocks.forEach(r => {
                storeCounts[r.store] = (storeCounts[r.store] || 0) + 1;
            });
            const topStores = Object.entries(storeCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            // Most active users
            const userCounts = {};
            restocks.forEach(r => {
                const userId = r.reported_by;
                userCounts[userId] = userCounts[userId] || { count: 0, username: r.reported_by_username || 'Unknown' };
                userCounts[userId].count++;
            });
            const topUsers = Object.entries(userCounts)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 10);

            // Active cooldowns
            const activeCooldowns = cooldowns.filter(c => {
                const expiresAt = new Date(c.expires_at);
                return expiresAt > now;
            });

            // Create analytics embed
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📊 Bot Analytics & Statistics')
                .setDescription('Comprehensive usage statistics for the restock bot')
                .addFields(
                    {
                        name: '📈 Report Overview',
                        value: `**All Time:** ${allTime.length}\n**This Week:** ${thisWeek.length}\n**Today:** ${today.length}`,
                        inline: true
                    },
                    {
                        name: '✅ Status Breakdown',
                        value: `**Approved:** ${approved.length}\n**Rejected:** ${rejected.length}\n**Pending:** ${pending.length}`,
                        inline: true
                    },
                    {
                        name: '📋 Report Types',
                        value: `**In Progress:** ${inProgress.length}\n**Past:** ${pastRestocks.length}\n**Upcoming:** ${upcomingRestocks.length}`,
                        inline: true
                    },
                    {
                        name: '🗺️ Regional Usage',
                        value: `**Virginia:** ${vaReports.length}\n**Maryland:** ${mdReports.length}`,
                        inline: true
                    },
                    {
                        name: '🏪 Store Type Usage',
                        value: `**Target:** ${targetReports.length}\n**Best Buy:** ${bestBuyReports.length}\n**Barnes & Noble:** ${barnesReports.length}`,
                        inline: true
                    },
                    {
                        name: '📱 Source Usage',
                        value: `**Buttons:** ${buttonReports.length}\n**Commands:** ${commandReports.length}`,
                        inline: true
                    }
                )
                .setTimestamp();

            // Add top stores field
            if (topStores.length > 0) {
                const topStoresText = topStores
                    .map(([store, count], idx) => `${idx + 1}. ${store.split(' - ')[1] || store}: **${count}**`)
                    .slice(0, 5)
                    .join('\n');
                embed.addFields({
                    name: '🏆 Top 5 Most Reported Stores',
                    value: topStoresText || 'None',
                    inline: false
                });
            }

            // Add top users field
            if (topUsers.length > 0) {
                const topUsersText = topUsers
                    .map(([userId, data], idx) => `${idx + 1}. ${data.username}: **${data.count}** reports`)
                    .slice(0, 5)
                    .join('\n');
                embed.addFields({
                    name: '👥 Top 5 Most Active Users',
                    value: topUsersText || 'None',
                    inline: false
                });
            }

            // Add cooldown info
            embed.addFields({
                name: '⏰ Cooldowns',
                value: `**Active:** ${activeCooldowns.length}\n**Total:** ${cooldowns.length}\n**Stores with Restocks:** ${lastRestocks.length}`,
                inline: false
            });

            // Add approval rate
            const totalProcessed = approved.length + rejected.length;
            const approvalRate = totalProcessed > 0 
                ? ((approved.length / totalProcessed) * 100).toFixed(1) 
                : '0';
            embed.addFields({
                name: '📊 Approval Rate',
                value: `${approvalRate}% (${approved.length}/${totalProcessed} processed)`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });
            console.log(`✅ Admin ${interaction.user.username} viewed analytics`);
        } catch (error) {
            console.error('❌ Error generating analytics:', error);
            await interaction.editReply({
                content: `❌ Error generating analytics: ${error.message}`
            });
        }
    }
};

