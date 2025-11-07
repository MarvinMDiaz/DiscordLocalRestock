const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../config/config.json');

/**
 * Read config file
 */
async function readConfig() {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
}

/**
 * Write config file
 */
async function writeConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

module.exports = {
    readConfig,
    writeConfig
};
