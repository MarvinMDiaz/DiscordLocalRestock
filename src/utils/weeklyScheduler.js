const dataManager = require('./dataManager');
const config = require('../../config/config.json');

const DAY_NAME_TO_INDEX = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};

function getCleanupDayIndex() {
    const raw = (config.settings && config.settings.cleanupDay) || 'sunday';
    const key = String(raw).toLowerCase();
    return DAY_NAME_TO_INDEX[key] !== undefined ? DAY_NAME_TO_INDEX[key] : 0;
}

function getCleanupHour() {
    const t = (config.settings && config.settings.cleanupTime) || '00:00';
    const parts = String(t).split(':');
    const h = parseInt(parts[0], 10);
    return Number.isFinite(h) ? h : 0;
}

/**
 * True during the scheduled cleanup hour (local server/system time).
 */
function isCleanupScheduledHour() {
    const now = new Date();
    if (now.getDay() !== getCleanupDayIndex()) {
        return false;
    }
    return now.getHours() === getCleanupHour();
}

async function checkAndRunScheduledTasks() {
    const now = new Date();
    const lastCleanup = dataManager.getData().settings?.last_cleanup
        ? new Date(dataManager.getData().settings.last_cleanup)
        : null;

    if (!isCleanupScheduledHour()) {
        return;
    }

    if (!lastCleanup || lastCleanup.toDateString() !== now.toDateString()) {
        console.log('🧹 Running scheduled data cleanup (config settings.cleanupDay / cleanupTime)...');
        await dataManager.cleanupOldData();
        console.log('✅ Scheduled cleanup completed');
    }
}

/**
 * Hourly check for automated cleanup (no weekly Discord recap posts).
 */
function startWeeklyScheduler(client) {
    console.log('📅 Cleanup scheduler — hourly check using settings.cleanupDay + settings.cleanupTime');

    checkAndRunScheduledTasks();

    setInterval(() => {
        checkAndRunScheduledTasks();
    }, 60 * 60 * 1000);
}

module.exports = {
    startWeeklyScheduler,
    isCleanupScheduledHour,
};
