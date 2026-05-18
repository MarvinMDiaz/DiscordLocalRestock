/**
 * Delete one row from RESTOCK_ALERTS_TABLE by source_message_id (the public alert message snowflake).
 *
 * Usage:
 *   node scripts/delete-restock-history-by-message-id.js 1234567890123456789
 *   SOURCE_MESSAGE_ID=1234567890123456789 node scripts/delete-restock-history-by-message-id.js
 *
 * Get the ID: Discord (Developer Mode) → right‑click the alert message → Copy Message ID,
 * or from a message link: .../channels/<guild>/<channel>/<MESSAGE_ID>
 */

require('dotenv').config({ quiet: true });

const { createClient } = require('@supabase/supabase-js');

function requireEnv(name) {
    const v = process.env[name];
    if (!v || String(v).trim() === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return v.trim();
}

async function main() {
    const raw = process.argv[2] || process.env.SOURCE_MESSAGE_ID;
    if (!raw || String(raw).trim() === '') {
        console.error('Usage: node scripts/delete-restock-history-by-message-id.js <source_message_id>');
        console.error('   or: SOURCE_MESSAGE_ID=<id> node scripts/delete-restock-history-by-message-id.js');
        process.exit(1);
    }
    const sourceMessageId = String(raw).trim();

    const url = requireEnv('SUPABASE_URL');
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.SUPABASE_SECRET_KEY?.trim() ||
        (() => {
            throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY');
        })();
    const table = process.env.RESTOCK_ALERTS_TABLE?.trim() || 'restock_history';

    const sb = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await sb.from(table).delete().eq('source_message_id', sourceMessageId).select('source_message_id, store');

    if (error) {
        console.error('Delete failed:', error.message);
        process.exit(1);
    }

    const rows = data || [];
    if (rows.length === 0) {
        console.log(`No row found with source_message_id=${sourceMessageId} in "${table}".`);
        process.exit(0);
    }

    console.log(`Deleted ${rows.length} row(s) from "${table}":`, rows);
}

main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
});
