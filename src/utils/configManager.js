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

/**
 * Get all stores organized by type and region
 */
async function getAllStores() {
    const config = await readConfig();
    return config.stores || {};
}

/**
 * Add store to config
 */
async function addStore(storeType, region, storeName) {
    const config = await readConfig();
    
    if (!config.stores) {
        config.stores = {};
    }
    if (!config.stores[storeType]) {
        config.stores[storeType] = {};
    }
    if (!config.stores[storeType][region]) {
        config.stores[storeType][region] = [];
    }
    
    if (!config.stores[storeType][region].includes(storeName)) {
        config.stores[storeType][region].push(storeName);
        await writeConfig(config);
        return true;
    }
    return false;
}

/**
 * Remove store from config
 */
async function removeStore(storeType, region, storeName) {
    const config = await readConfig();
    
    if (!config.stores || !config.stores[storeType] || !config.stores[storeType][region]) {
        return false;
    }
    
    const index = config.stores[storeType][region].indexOf(storeName);
    if (index > -1) {
        config.stores[storeType][region].splice(index, 1);
        await writeConfig(config);
        return true;
    }
    return false;
}

/**
 * Get admin roles
 */
async function getAdminRoles() {
    const config = await readConfig();
    return config.roles || {};
}

/**
 * Add admin role
 */
async function addAdminRole(roleId, roleName) {
    const config = await readConfig();
    
    if (!config.roles) {
        config.roles = {};
    }
    
    // Store custom admin roles
    if (!config.roles.custom_admins) {
        config.roles.custom_admins = [];
    }
    
    if (!config.roles.custom_admins.find(r => r.id === roleId)) {
        config.roles.custom_admins.push({
            id: roleId,
            name: roleName,
            added_at: new Date().toISOString()
        });
        await writeConfig(config);
        return true;
    }
    return false;
}

/**
 * Remove admin role
 */
async function removeAdminRole(roleId) {
    const config = await readConfig();
    
    if (!config.roles || !config.roles.custom_admins) {
        return false;
    }
    
    const index = config.roles.custom_admins.findIndex(r => r.id === roleId);
    if (index > -1) {
        config.roles.custom_admins.splice(index, 1);
        await writeConfig(config);
        return true;
    }
    return false;
}

module.exports = {
    readConfig,
    writeConfig,
    getAllStores,
    addStore,
    removeStore,
    getAdminRoles,
    addAdminRole,
    removeAdminRole
};

