const { EmbedBuilder } = require('discord.js');
const dataManager = require('./dataManager');
const config = require('../../config/config.json');

/**
 * Generate weekly report for a specific region
 * @param {string} region - 'va' or 'md'
 * @returns {Object} Embed object with report data
 */
function generateWeeklyReport(region) {
    const lastRestocks = dataManager.getLastRestocks();
    const now = new Date();
    const currentWeekStart = getWeekStart(now);

    // Filter to current week restocks for this region
    // A restock is "current week" if it has a current_week_restock_date
    let regionRestocks = [];
    if (region === 'va') {
        regionRestocks = lastRestocks.filter(r => {
            if (!r.current_week_restock_date) return false;
            return r.store.includes(', VA') || 
                   config.stores?.target?.va?.includes(r.store) || 
                   config.stores?.bestbuy?.va?.includes(r.store) ||
                   config.stores?.barnesandnoble?.va?.includes(r.store);
        });
    } else if (region === 'md') {
        regionRestocks = lastRestocks.filter(r => {
            if (!r.current_week_restock_date) return false;
            return r.store.includes(', MD') || 
                   config.stores?.target?.md?.includes(r.store) || 
                   config.stores?.bestbuy?.md?.includes(r.store) ||
                   config.stores?.barnesandnoble?.md?.includes(r.store);
        });
    }

    // Sort by date (most recent first)
    regionRestocks.sort((a, b) => {
        const dateA = new Date(a.current_week_restock_date);
        const dateB = new Date(b.current_week_restock_date);
        return dateB - dateA;
    });

    // Group by store type
    const targetRestocks = [];
    const bestbuyRestocks = [];
    const barnesandnobleRestocks = [];

    regionRestocks.forEach(restock => {
        if (restock.store.toLowerCase().includes('target')) {
            targetRestocks.push(restock);
        } else if (restock.store.toLowerCase().includes('best buy')) {
            bestbuyRestocks.push(restock);
        } else if (restock.store.toLowerCase().includes('barnes')) {
            barnesandnobleRestocks.push(restock);
        }
    });

    // Create embed
    const regionName = region === 'va' ? 'Virginia' : 'Maryland';
    const embed = new EmbedBuilder()
        .setColor(region === 'va' ? 0x5865F2 : 0xED4245) // Discord blue for VA, red for MD
        .setTitle(`📊 Weekly Restock Report - ${regionName}`)
        .setDescription(`Weekly summary of all stores that restocked during the week starting **${formatDate(currentWeekStart)}**`)
        .setTimestamp();

    // Add statistics
    embed.addFields({
        name: '📈 Statistics',
        value: `**Total Restocks:** ${regionRestocks.length}\n**Target:** ${targetRestocks.length}\n**Best Buy:** ${bestbuyRestocks.length}\n**Barnes & Noble:** ${barnesandnobleRestocks.length}`,
        inline: false
    });

    // Add Target restocks
    if (targetRestocks.length > 0) {
        const targetList = formatRestockList(targetRestocks);
        embed.addFields({
            name: '🎯 Target Restocks',
            value: targetList || 'No Target restocks this week',
            inline: false
        });
    }

    // Add Best Buy restocks
    if (bestbuyRestocks.length > 0) {
        const bestbuyList = formatRestockList(bestbuyRestocks);
        embed.addFields({
            name: '💻 Best Buy Restocks',
            value: bestbuyList || 'No Best Buy restocks this week',
            inline: false
        });
    }

    // Add Barnes & Noble restocks
    if (barnesandnobleRestocks.length > 0) {
        const bnList = formatRestockList(barnesandnobleRestocks);
        embed.addFields({
            name: '📚 Barnes & Noble Restocks',
            value: bnList || 'No Barnes & Noble restocks this week',
            inline: false
        });
    }

    // If no restocks at all
    if (regionRestocks.length === 0) {
        embed.addFields({
            name: '📭 No Restocks',
            value: `No ${regionName} stores restocked this week.`,
            inline: false
        });
    }

    embed.setFooter({ 
        text: `Week of ${formatDate(currentWeekStart)} • ${regionName} Region` 
    });

    return {
        embed,
        restockCount: regionRestocks.length
    };
}

/**
 * Format a list of restocks for display
 */
function formatRestockList(restocks) {
    let list = '';
    restocks.forEach((restock, index) => {
        const restockDate = new Date(restock.current_week_restock_date);
        const storeName = parseStoreName(restock.store);
        const address = parseAddress(restock.store);
        
        const dateStr = formatDate(restockDate);
        const timeStr = formatTime(restockDate);
        
        list += `**${index + 1}.** ${storeName}\n`;
        if (address) {
            list += `   📍 ${address}\n`;
        }
        list += `   📅 ${dateStr} at ${timeStr}\n\n`;
    });
    return list.trim();
}

/**
 * Send weekly reports to both VA and MD channels
 */
async function sendWeeklyReports(client) {
    try {
        console.log('📊 Generating weekly reports...');

        // Generate VA report
        const vaReport = generateWeeklyReport('va');
        const vaChannelId = config.channels.weeklyReportVA || config.channels.localRestockVA;
        const vaRoleId = config.roles.weeklyReportVA;
        
        if (vaChannelId) {
            let vaChannel = client.channels.cache.get(vaChannelId);
            if (!vaChannel && client.channels.fetch) {
                vaChannel = await client.channels.fetch(vaChannelId).catch(() => null);
            }
            if (vaChannel) {
                const vaRoleMention = vaRoleId && vaRoleId.length > 10 ? `<@&${vaRoleId}>` : '';
                const content = vaRoleMention ? `${vaRoleMention} Weekly VA Restock Recap!` : 'Weekly VA Restock Recap!';
                
                await vaChannel.send({ content, embeds: [vaReport.embed] });
                console.log(`✅ VA weekly report sent to ${vaChannelId} (${vaReport.restockCount} restocks)`);
            } else {
                console.log(`⚠️ VA channel ${vaChannelId} not found`);
            }
        }

        // Generate MD report
        const mdReport = generateWeeklyReport('md');
        const mdChannelId = config.channels.weeklyReportMD || config.channels.localRestockMD;
        const mdRoleId = config.roles.weeklyReportMD;
        
        if (mdChannelId) {
            let mdChannel = client.channels.cache.get(mdChannelId);
            if (!mdChannel && client.channels.fetch) {
                mdChannel = await client.channels.fetch(mdChannelId).catch(() => null);
            }
            if (mdChannel) {
                const mdRoleMention = mdRoleId && mdRoleId.length > 10 ? `<@&${mdRoleId}>` : '';
                const content = mdRoleMention ? `${mdRoleMention} Weekly MD Restock Recap!` : 'Weekly MD Restock Recap!';
                
                await mdChannel.send({ content, embeds: [mdReport.embed] });
                console.log(`✅ MD weekly report sent to ${mdChannelId} (${mdReport.restockCount} restocks)`);
            } else {
                console.log(`⚠️ MD channel ${mdChannelId} not found`);
            }
        }

        console.log('📊 Weekly reports completed');
    } catch (error) {
        console.error('❌ Error sending weekly reports:', error);
    }
}

// Helper function to get week start (Monday)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

// Helper function to format date
function formatDate(date) {
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Helper function to format time
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

// Helper function to parse store name from "Target - Store Name - Address"
function parseStoreName(storeString) {
    const parts = storeString.split(' - ');
    if (parts.length >= 2) {
        return parts.slice(0, 2).join(' - '); // "Target - Store Name"
    }
    return storeString;
}

// Helper function to parse address from "Target - Store Name - Address"
function parseAddress(storeString) {
    const lastDashIndex = storeString.lastIndexOf(' - ');
    if (lastDashIndex !== -1) {
        return storeString.substring(lastDashIndex + 3); // Everything after " - "
    }
    return null;
}

module.exports = {
    generateWeeklyReport,
    sendWeeklyReports
};

