const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/restocks.json');

class DataManager {
    constructor() {
        this.data = null;
        this.initialized = false;
    }

    // Initialize data manager
    async initialize() {
        try {
            await this.loadData();
            this.initialized = true;
            console.log('✅ Data manager initialized');
        } catch (error) {
            console.error('❌ Error initializing data manager:', error);
            throw error;
        }
    }

    // Load data from JSON file
    async loadData() {
        try {
            const data = await fs.readFile(DATA_FILE, 'utf8');
            const parsedData = JSON.parse(data);

            // Preserve existing data - never overwrite with empty arrays
            if (this.data && this.data.last_restocks && this.data.last_restocks.length > 0) {
                // If we already have history data loaded, preserve it
                if (!parsedData.last_restocks || parsedData.last_restocks.length === 0) {
                    console.log('⚠️ Warning: Loaded data has no restock history, preserving existing history');
                    parsedData.last_restocks = this.data.last_restocks;
                }
            }

            this.data = parsedData;

            // Migrate old data format to new format (if needed)
            this.migrateDataFormat();
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create default structure
                // Check if we already have data in memory (from previous load)
                if (this.data && this.data.last_restocks && this.data.last_restocks.length > 0) {
                    console.log('⚠️ Warning: Data file not found, but existing data in memory detected. Creating backup before initializing new file.');
                    // Try to backup existing data
                    try {
                        await this.backupData();
                    } catch (backupErr) {
                        console.error('❌ Failed to backup existing data:', backupErr);
                    }
                    // Keep existing last_restocks if we have them
                    const existingHistory = this.data.last_restocks || [];
                    this.data = {
                        restocks: [],
                        cooldowns: [],
                        last_restocks: existingHistory, // Preserve existing history
                        disabled_users: [],
                        settings: {
                            auto_cleanup_enabled: true,
                            last_cleanup: this.data?.settings?.last_cleanup || null,
                            last_weekly_report: this.data?.settings?.last_weekly_report || null
                        },
                        stores: [
                            "Target - Springfield, VA",
                            "Target - Woodbridge, VA",
                            "Target - Fairfax, VA",
                            "Target - Alexandria, VA",
                            "Target - Arlington, VA"
                        ]
                    };
                } else {
                    // No existing data, create fresh structure
                    this.data = {
                        restocks: [],
                        cooldowns: [],
                        last_restocks: [],
                        disabled_users: [],
                        settings: {
                            auto_cleanup_enabled: true,
                            last_cleanup: null,
                            last_weekly_report: null
                        },
                        stores: [
                            "Target - Springfield, VA",
                            "Target - Woodbridge, VA",
                            "Target - Fairfax, VA",
                            "Target - Alexandria, VA",
                            "Target - Arlington, VA"
                        ]
                    };
                }
                await this.saveData();
            } else if (error instanceof SyntaxError) {
                // JSON parse error - try to backup corrupted file and preserve what we can
                console.error('❌ JSON parse error in data file:', error.message);
                console.log('💾 Attempting to backup corrupted file...');
                try {
                    const backupPath = path.join(__dirname, '../../data/backups');
                    await fs.mkdir(backupPath, { recursive: true });
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const corruptedFile = path.join(backupPath, `corrupted-${timestamp}.json`);
                    await fs.copyFile(DATA_FILE, corruptedFile);
                    console.log(`✅ Corrupted file backed up to: ${corruptedFile}`);
                } catch (backupErr) {
                    console.error('❌ Failed to backup corrupted file:', backupErr);
                }

                // Try to preserve existing data if we have it
                if (this.data && this.data.last_restocks && this.data.last_restocks.length > 0) {
                    console.log('⚠️ Preserving existing restock history from memory');
                    const existingHistory = this.data.last_restocks;
                    this.data = {
                        restocks: [],
                        cooldowns: [],
                        last_restocks: existingHistory, // Preserve history
                        disabled_users: this.data.disabled_users || [],
                        settings: this.data.settings || {
                            auto_cleanup_enabled: true,
                            last_cleanup: null,
                            last_weekly_report: null
                        },
                        stores: this.data.stores || []
                    };
                    await this.saveData();
                    console.log('✅ Recovered data structure with preserved history');
                } else {
                    // No existing data to preserve, create fresh structure
                    console.log('⚠️ No existing data to preserve, creating fresh structure');
                    this.data = {
                        restocks: [],
                        cooldowns: [],
                        last_restocks: [],
                        disabled_users: [],
                        settings: {
                            auto_cleanup_enabled: true,
                            last_cleanup: null,
                            last_weekly_report: null
                        },
                        stores: []
                    };
                    await this.saveData();
                }
            } else {
                throw error;
            }
        }
    }

    // Migrate old data format to new format
    async migrateDataFormat() {
        if (!this.data.last_restocks || !Array.isArray(this.data.last_restocks)) {
            return;
        }

        let needsMigration = false;
        this.data.last_restocks.forEach(storeData => {
            // Check if old format exists (last_restock_date instead of current_week_restock_date)
            if (storeData.last_restock_date && !storeData.current_week_restock_date) {
                storeData.current_week_restock_date = storeData.last_restock_date;
                storeData.previous_week_restock_date = null; // Initialize as null for new stores
                delete storeData.last_restock_date; // Remove old field
                delete storeData.last_restock_item; // Remove if exists
                needsMigration = true;
            }

            // Ensure previous_week_restock_date exists (initialize as null if missing)
            if (storeData.previous_week_restock_date === undefined) {
                storeData.previous_week_restock_date = null;
                needsMigration = true;
            }
        });

        // Ensure settings.last_weekly_report exists
        if (!this.data.settings) {
            this.data.settings = {};
            needsMigration = true;
        }
        if (this.data.settings.last_weekly_report === undefined) {
            this.data.settings.last_weekly_report = null;
            needsMigration = true;
        }

        if (needsMigration) {
            console.log('🔄 Migrating data format to new weekly tracking system...');
            await this.saveData(); // Save migrated data
        }
    }

    // Save data to JSON file
    async saveData() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(DATA_FILE);
            await fs.mkdir(dataDir, { recursive: true });
            
            await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('❌ Error saving data:', error);
            throw error;
        }
    }

    // Reload data from disk (used when approval clicks reference fresh writes)
    async reload() {
        await this.loadData();
    }

    // Get all data
    getData() {
        return this.data;
    }

    // Get restocks
    getRestocks() {
        return this.data.restocks || [];
    }

    // Get cooldowns
    getCooldowns() {
        return this.data.cooldowns || [];
    }

    // Get last restocks
    getLastRestocks() {
        return this.data.last_restocks || [];
    }

    // Get stores
    getStores() {
        return this.data.stores || [];
    }

    // Add restock
    async addRestock(restock) {
        this.data.restocks.push(restock);
        await this.saveData();
    }

    // Add cooldown
    async addCooldown(cooldown) {
        this.data.cooldowns.push(cooldown);
        await this.saveData();
    }

    // Update last restock - now tracks current week restock date
    async updateLastRestock(store, restockData) {
        const existingIndex = this.data.last_restocks.findIndex(r => r.store === store);

        const updateData = {
            store: store,
            current_week_restock_date: restockData.last_restock_date || restockData.date,
            previous_week_restock_date: existingIndex >= 0 ? (this.data.last_restocks[existingIndex].previous_week_restock_date || null) : null,
            week_start: restockData.week_start,
            // Preserve last_checked fields if they exist
            last_checked_date: existingIndex >= 0 ? (this.data.last_restocks[existingIndex].last_checked_date || null) : null,
            last_checked_by: existingIndex >= 0 ? (this.data.last_restocks[existingIndex].last_checked_by || null) : null,
            last_checked_by_username: existingIndex >= 0 ? (this.data.last_restocks[existingIndex].last_checked_by_username || null) : null
        };

        if (existingIndex >= 0) {
            this.data.last_restocks[existingIndex] = updateData;
        } else {
            this.data.last_restocks.push(updateData);
        }

        await this.saveData();
    }

    // Update last checked - tracks when a store was checked (even if no restock)
    async updateLastChecked(store, userId, username, customDate = null) {
        const existingIndex = this.data.last_restocks.findIndex(r => r.store === store);
        const now = customDate || new Date();

        const updateData = {
            store: store,
            last_checked_date: now.toISOString(),
            last_checked_by: userId,
            last_checked_by_username: null, // Anonymous - don't store username
            // Preserve restock data if it exists
            current_week_restock_date: existingIndex >= 0 ? (this.data.last_restocks[existingIndex].current_week_restock_date || null) : null,
            previous_week_restock_date: existingIndex >= 0 ? (this.data.last_restocks[existingIndex].previous_week_restock_date || null) : null,
            week_start: existingIndex >= 0 ? (this.data.last_restocks[existingIndex].week_start || null) : null
        };

        if (existingIndex >= 0) {
            this.data.last_restocks[existingIndex] = updateData;
        } else {
            this.data.last_restocks.push(updateData);
        }

        await this.saveData();
    }

    // Clean up old data (weekly reset - runs on Sunday)
    async cleanupOldData() {
        const now = new Date();

        // Create backup before cleanup
        console.log('💾 Creating backup before weekly cleanup...');
        try {
            await this.backupData();
        } catch (backupErr) {
            console.error('⚠️ Failed to create backup before cleanup:', backupErr);
            // Continue anyway - backup failure shouldn't stop cleanup
        }

        // Clear current week restocks and cooldowns
        this.data.restocks = [];
        this.data.cooldowns = [];

        // Move current week restock dates to previous week for all stores
        // PRESERVE HISTORY - never clear last_restocks array
        if (this.data.last_restocks && Array.isArray(this.data.last_restocks)) {
            this.data.last_restocks.forEach(storeData => {
                // Move current week to previous week
                if (storeData.current_week_restock_date) {
                    storeData.previous_week_restock_date = storeData.current_week_restock_date;
                }
                // Reset current week to null (will show as "Not Restocked")
                storeData.current_week_restock_date = null;
            });
        }

        // Update last cleanup time
        this.data.settings.last_cleanup = now.toISOString();

        await this.saveData();
        console.log('🧹 Weekly data cleanup completed - moved current week to previous week (history preserved)');
    }

    // Get week start (Monday)
    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        return new Date(d.setDate(diff));
    }

    // Get disabled users
    getDisabledUsers() {
        if (!this.data.disabled_users) {
            this.data.disabled_users = [];
        }
        return this.data.disabled_users || [];
    }

    // Check if user is disabled
    isUserDisabled(userId) {
        const disabledUsers = this.getDisabledUsers();
        return disabledUsers.some(u => u.user_id === userId && u.enabled === false);
    }

    // Disable user
    async disableUser(userId, username, reason, disabledBy, disabledByUsername) {
        if (!this.data.disabled_users) {
            this.data.disabled_users = [];
        }
        
        const existingIndex = this.data.disabled_users.findIndex(u => u.user_id === userId);
        const disabledUser = {
            user_id: userId,
            username: username,
            enabled: false,
            reason: reason || 'No reason provided',
            disabled_at: new Date().toISOString(),
            disabled_by: disabledBy,
            disabled_by_username: disabledByUsername
        };

        if (existingIndex >= 0) {
            this.data.disabled_users[existingIndex] = disabledUser;
        } else {
            this.data.disabled_users.push(disabledUser);
        }

        await this.saveData();
    }

    // Enable user
    async enableUser(userId, enabledBy, enabledByUsername) {
        if (!this.data.disabled_users) {
            this.data.disabled_users = [];
        }
        
        const existingIndex = this.data.disabled_users.findIndex(u => u.user_id === userId);
        if (existingIndex >= 0) {
            this.data.disabled_users[existingIndex].enabled = true;
            this.data.disabled_users[existingIndex].enabled_at = new Date().toISOString();
            this.data.disabled_users[existingIndex].enabled_by = enabledBy;
            this.data.disabled_users[existingIndex].enabled_by_username = enabledByUsername;
        } else {
            // If user wasn't in disabled list, add them as enabled
            this.data.disabled_users.push({
                user_id: userId,
                enabled: true,
                enabled_at: new Date().toISOString(),
                enabled_by: enabledBy,
                enabled_by_username: enabledByUsername
            });
        }

        await this.saveData();
    }

    // Backup data
    async backupData() {
        const backupPath = path.join(__dirname, '../../data/backups');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupPath, `backup-${timestamp}.json`);

        try {
            await fs.mkdir(backupPath, { recursive: true });
            await fs.writeFile(backupFile, JSON.stringify(this.data, null, 2));
            console.log(`💾 Backup created: ${backupFile}`);
        } catch (error) {
            console.error('❌ Error creating backup:', error);
        }
    }

    // Shadow Realm functions
    getShadowRealmSnapshots() {
        if (!this.data.shadow_realm_snapshots) {
            this.data.shadow_realm_snapshots = [];
        }
        return this.data.shadow_realm_snapshots;
    }

    // Save role snapshot before sending to shadow realm
    async saveShadowRealmSnapshot(userId, username, roles, sentBy, sentByUsername) {
        if (!this.data.shadow_realm_snapshots) {
            this.data.shadow_realm_snapshots = [];
        }

        const snapshot = {
            user_id: userId,
            username: username,
            roles: roles, // Array of role IDs
            sent_at: new Date().toISOString(),
            sent_by: sentBy,
            sent_by_username: sentByUsername
        };

        // Remove existing snapshot if any
        const existingIndex = this.data.shadow_realm_snapshots.findIndex(s => s.user_id === userId);
        if (existingIndex >= 0) {
            this.data.shadow_realm_snapshots[existingIndex] = snapshot;
        } else {
            this.data.shadow_realm_snapshots.push(snapshot);
        }

        await this.saveData();
        return snapshot;
    }

    // Get role snapshot for a user
    getShadowRealmSnapshot(userId) {
        const snapshots = this.getShadowRealmSnapshots();
        return snapshots.find(s => s.user_id === userId);
    }

    // Remove shadow realm snapshot after restoring
    async removeShadowRealmSnapshot(userId, restoredBy, restoredByUsername) {
        if (!this.data.shadow_realm_snapshots) {
            return null;
        }

        const snapshot = this.getShadowRealmSnapshot(userId);
        if (snapshot) {
            snapshot.restored_at = new Date().toISOString();
            snapshot.restored_by = restoredBy;
            snapshot.restored_by_username = restoredByUsername;
            
            // Remove from active list (keep for history)
            const index = this.data.shadow_realm_snapshots.findIndex(s => s.user_id === userId);
            if (index >= 0) {
                this.data.shadow_realm_snapshots.splice(index, 1);
            }
            
            await this.saveData();
            return snapshot;
        }
        return null;
    }
}

// Create singleton instance
const dataManager = new DataManager();

module.exports = dataManager; 