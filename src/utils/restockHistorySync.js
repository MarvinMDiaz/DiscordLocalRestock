/**
 * When a public restock alert is posted, mirror it into Supabase for predictions / history.
 * Uses the same row shape as scripts/backfill-restock-history-to-supabase.js (no optional Discord id columns).
 *
 * Env (same as backfill / crowd tracker):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 * - RESTOCK_ALERTS_TABLE (defaults to restock_history)
 *
 * If URL/key missing, sync is a no-op (no throw).
 */

const { createClient } = require('@supabase/supabase-js');

function tableName() {
    return process.env.RESTOCK_ALERTS_TABLE?.trim() || 'restock_history';
}

function getClient() {
    const url = process.env.SUPABASE_URL?.trim();
    const key =
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url || !key) return null;
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

/** @param {import('discord.js').Message} message */
function rawMessagePayload(message) {
    return JSON.stringify({
        content: message.content ?? '',
        embeds: message.embeds.map((e) => e.toJSON()),
        author: {
            id: message.author?.id ?? null,
            username: message.author?.username ?? null,
            bot: message.author?.bot ?? null
        }
    });
}

/**
 * Insert one row for the alert message. Duplicate `source_message_id` logs and skips (unique index optional).
 *
 * @param {import('discord.js').Message} alertMessage
 * @param {object} restock
 * @param {{ regionLetter: 'VA' | 'MD', location?: string | null }} opts
 */
async function syncRestockAlertToSupabase(alertMessage, restock, opts) {
    const sb = getClient();
    if (!sb || !alertMessage?.id) return;

    const tbl = tableName();
    const createdTs = new Date(alertMessage.createdTimestamp).toISOString();
    const approvedAt = restock.reviewed_at || createdTs;

    const row = {
        region: opts.regionLetter,
        store: restock.store ?? null,
        location: opts.location != null && String(opts.location).trim() !== '' ? String(opts.location).trim() : null,
        approved_at: approvedAt,
        source_channel_id: String(alertMessage.channelId),
        source_message_id: String(alertMessage.id),
        raw_message: rawMessagePayload(alertMessage),
        created_at: createdTs
    };

    const { error } = await sb.from(tbl).insert(row);
    if (error) {
        if (String(error.code) === '23505' || /duplicate|unique/i.test(String(error.message))) {
            console.log(`[restock_history] Row already exists for message ${alertMessage.id}; skipping.`);
            return;
        }
        console.warn('[restock_history] Supabase insert failed:', error.message || error);
        return;
    }
    console.log(`[restock_history] Synced alert message ${alertMessage.id} → ${tbl}`);
}

module.exports = {
    syncRestockAlertToSupabase,
    getSupabaseClientIfConfigured: getClient,
    getRestockHistoryTableName: tableName
};
