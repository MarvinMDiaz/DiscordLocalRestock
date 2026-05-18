const { Events } = require('discord.js');
const { handleProofPhotoMessage } = require('../utils/approvalManager');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        try {
            await handleProofPhotoMessage(message);
        } catch (error) {
            console.error('[proof-photo] Error handling proof photo message:', error);
        }
    }
};
