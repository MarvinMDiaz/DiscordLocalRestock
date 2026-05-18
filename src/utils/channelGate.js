const config = require('../../config/config.json');

/**
 * Gate channel access for commands
 * @param {string} commandName - The command name (e.g., 'lookup_va_restocks')
 * @param {string} channelId - The channel ID where the command was used
 * @returns {Object} { allowed: boolean, channelName?: string }
 */
function gateChannel(commandName, channelId) {
    const allowedChannelId = config.commandChannels?.[commandName];
    
    // If no channel restriction is set (empty string), allow anywhere
    if (!allowedChannelId || allowedChannelId.trim() === '') {
        return { allowed: true };
    }
    
    // Check if command is used in the allowed channel
    if (channelId === allowedChannelId) {
        return { allowed: true };
    }
    
    // Not allowed - get friendly channel name for error message
    const channelName = config.channelNames?.[allowedChannelId] || `<#${allowedChannelId}>`;
    return { 
        allowed: false, 
        channelName 
    };
}

module.exports = { gateChannel };


