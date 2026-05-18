/**
 * Round-trip test: insert one synthetic row into RESTOCK_ALERTS_TABLE, then delete it.
 * Same column set as live alert sync + backfill (no pollution if delete succeeds).
 *
 * Run: npm run test:supabase-connection
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY), optional RESTOCK_ALERTS_TABLE
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

    const marker = `connection-test-${Date.now()}`;
    const now = new Date().toISOString();

    const row = {
        region: 'VA',
        store: '[CONNECTION_TEST] synthetic row — safe to delete',
        location: null,
        approved_at: now,
        source_channel_id: '0',
        source_message_id: marker,
        raw_message: JSON.stringify({
            content: '[CONNECTION_TEST]',
            embeds: [],
            author: { id: null, username: 'script', bot: true }
        }),
        created_at: now
    };

    console.log(`Inserting test row into "${table}" (source_message_id=${marker})…`);
    const { error: insErr } = await sb.from(table).insert(row);

    if (insErr) {
        throw new Error(`Insert failed: ${insErr.message} (code ${insErr.code || 'n/a'})`);
    }
    console.log('Insert OK.');

    console.log('Deleting test row…');
    const { error: delErr } = await sb.from(table).delete().eq('source_message_id', marker);

    if (delErr) {
        console.error(`Delete failed: ${delErr.message}`);
        console.error(`Remove manually: DELETE FROM ${table} WHERE source_message_id = '${marker}';`);
        process.exit(1);
    }

    console.log('Delete OK. No lasting test data (unless insert succeeded and delete did not match — check table).');
}

main().catch((err) => {
    console.error('Test aborted:', err.message || err);
    process.exit(1);
});
