const { sendWeeklyReports } = require('../utils/weeklyReportGenerator');
const dataManager = require('../utils/dataManager');
const config = require('../../config/config.json');

/**
 * Check if it's Sunday and time to send weekly report
 * @returns {boolean}
 */
function isSundayReportTime() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const hour = now.getHours();
    
    // Run on Sunday at the configured hour (default: 20 = 8pm EST)
    const reportHour = config.weeklyReportHour || 20;
    
    return day === 0 && hour === reportHour;
}

/**
 * Check if cleanup should run (Sunday, after report)
 * @returns {boolean}
 */
function isCleanupTime() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    
    // Run cleanup on Sunday, 1 hour after report (default: 21 = 9pm EST)
    const reportHour = config.weeklyReportHour || 20;
    const cleanupHour = reportHour + 1;
    
    return day === 0 && hour === cleanupHour;
}

/**
 * Start the weekly scheduler
 * Checks every hour for Sunday report/cleanup time
 */
function startWeeklyScheduler(client) {
    console.log('📅 Weekly scheduler started - checking every hour for Sunday reports/cleanup');
    
    // Check immediately on startup (in case bot was restarted during the scheduled time)
    checkAndRunScheduledTasks(client);
    
    // Check every hour
    setInterval(() => {
        checkAndRunScheduledTasks(client);
    }, 60 * 60 * 1000); // 60 minutes * 60 seconds * 1000 ms = 1 hour
}

/**
 * Check if scheduled tasks need to run
 */
async function checkAndRunScheduledTasks(client) {
    const now = new Date();
    const lastCleanup = dataManager.getData().settings?.last_cleanup 
        ? new Date(dataManager.getData().settings.last_cleanup)
        : null;
    const lastReport = dataManager.getData().settings?.last_weekly_report 
        ? new Date(dataManager.getData().settings.last_weekly_report)
        : null;
    
    // Check if we need to send weekly report
    if (isSundayReportTime()) {
        // Only send if we haven't sent one today
        if (!lastReport || lastReport.toDateString() !== now.toDateString()) {
            console.log('📊 Time to send weekly reports!');
            await sendWeeklyReports(client);
            
            // Update last report time
            dataManager.getData().settings.last_weekly_report = now.toISOString();
            await dataManager.saveData();
            console.log('✅ Weekly report sent and timestamp saved');
        }
    }
    
    // Check if we need to run cleanup (after report)
    if (isCleanupTime()) {
        // Only run if we haven't cleaned up today
        if (!lastCleanup || lastCleanup.toDateString() !== now.toDateString()) {
            console.log('🧹 Time to run weekly cleanup!');
            await dataManager.cleanupOldData();
            console.log('✅ Weekly cleanup completed');
        }
    }
}

module.exports = {
    startWeeklyScheduler,
    isSundayReportTime,
    isCleanupTime
};


