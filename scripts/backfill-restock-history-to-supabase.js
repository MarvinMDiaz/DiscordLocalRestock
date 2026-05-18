/**
 * Local-only one-off backfill: production PokéVerse restock alert channel history → Supabase.
 * Does not run with the bot, change prod behavior, or deploy anything.
 *
 * Prerequisites:
 * - Bot token must belong to a bot that can read message history in both channels (same intents as prod).
 * - Table RESTOCK_ALERTS_TABLE should exist; duplicates skipped by prefetch on source_message_id.
 *   Insert payload uses only columns used by prediction reads (store, location, region, timestamps)
 *   plus backfill fields (source_*, raw_message). Add DB columns before sending more keys from this script.
 * Recommended: UNIQUE constraint on source_message_id in Postgres.
 */

require('dotenv').config({ quiet: true });

const { Client, GatewayIntentBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

/** @type {const} PokéVerse prod alert channels (hardcoded per project request) */
const VA_RESTOCK_ALERT_CHANNEL_ID = '1434306702416674816';
const MD_RESTOCK_ALERT_CHANNEL_ID = '1434306760268714146';

const FETCH_BATCH = 100;
const DUPLICATE_CHECK_CHUNK = 1000;
const INSERT_BATCH = 200;

function requireEnv(name) {
    const v = process.env[name];
    if (!v || String(v).trim() === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return v.trim();
}

/** Confirm we are using the service_role JWT, not anon (common misconfiguration). */
function assertSupabaseServiceRoleKey(jwtSecret) {
    const parts = jwtSecret.split('.');
    if (parts.length < 2) {
        console.warn(
            '[warn] SUPABASE_SERVICE_ROLE_KEY does not look like a JWT. Expected the long `service_role` secret from Dashboard → Settings → API.'
        );
        return;
    }
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    let payload;
    try {
        payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
        console.warn('[warn] Could not decode SUPABASE_SERVICE_ROLE_KEY payload.');
        return;
    }
    if (payload.role && payload.role !== 'service_role') {
        throw new Error(
            `SUPABASE_SERVICE_ROLE_KEY is role "${payload.role}" but must be the **service_role** JWT ` +
                `(Dashboard → Settings → Project API → Project API keys → service_role · secret — not anon or publishable key).`
        );
    }
}

function permissionDeniedHelp(tableName) {
    return [
        '',
        'Postgres denied access on this table. If you ARE using service_role:',
        '  • Open Supabase → SQL Editor and run (adjust schema if needed):',
        '',
        `  grant usage on schema public to service_role;`,
        `  grant select, insert, update, delete on table public.${tableName} to service_role;`,
        '',
        'If the table lives in another schema (not public), substitute that schema/name.',
        'If you use anon key by mistake → switch .env to the service_role JWT.',
        ''
    ].join('\n');
}

/**
 * Discord returns newest-first; paginate backward with `before`.
 * @param {import('discord.js').TextChannel} channel
 */
async function fetchAllMessages(channel) {
    const out = [];
    let before = undefined;
    for (;;) {
        const batch = await channel.messages.fetch({ limit: FETCH_BATCH, before });
        if (batch.size === 0) break;
        out.push(...batch.values());
        before = batch.lastKey();
        if (batch.size < FETCH_BATCH) break;
    }
    return out;
}

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

/** Best-effort match to bot alerts from approvalManager embed shape. */
function parseStoreLocation(message) {
    let store = null;
    let location = null;

    for (const embed of message.embeds) {
        const json = embed.toJSON?.() ?? {};
        const fields = json.fields || [];
        for (const f of fields) {
            const name = String(f.name || '')
                .replace(/\s+/g, ' ')
                .trim();
            const value = typeof f.value === 'string' ? f.value.trim() : f.value ?? null;

            if (name === '🏪 Store' || /\bstore\b/i.test(name)) {
                store = value || store;
            }
            if (name === '📍 Address' || /\baddress\b/i.test(name)) {
                location = value || location;
            }
        }
        const desc = json.description;
        if (!store && desc && typeof desc === 'string') {
            const m = desc.match(/confirmed\s+at\s*\*\*(.+?)\*\*/i);
            if (m) store = m[1].trim();
        }
    }

    return { store, location };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} tableName
 */
async function fetchExistingMessageIds(supabase, tableName, ids) {
    const existing = new Set();
    for (let i = 0; i < ids.length; i += DUPLICATE_CHECK_CHUNK) {
        const slice = ids.slice(i, i + DUPLICATE_CHECK_CHUNK);
        const { data, error } = await supabase
            .from(tableName)
            .select('source_message_id')
            .in('source_message_id', slice);
        if (error) {
            let msg = `Supabase duplicate check failed: ${error.message}`;
            if (/permission denied|42501/i.test(String(error.message) + String(error.code || ''))) {
                msg += permissionDeniedHelp(tableName);
            }
            throw new Error(msg);
        }
        for (const row of data || []) {
            if (row?.source_message_id != null) existing.add(String(row.source_message_id));
        }
    }
    return existing;
}

async function insertRows(supabase, tableName, rows) {
    let failed = 0;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const slice = rows.slice(i, i + INSERT_BATCH);
        const { error } = await supabase.from(tableName).insert(slice);
        if (error) {
            console.error(`Insert batch failed at offset ${i}: ${error.message}`);
            if (/permission denied|42501/i.test(String(error.message) + String(error.code || ''))) {
                console.error(permissionDeniedHelp(tableName));
            }
            failed += slice.length;
        }
    }
    return failed;
}

async function main() {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const tableName = requireEnv('RESTOCK_ALERTS_TABLE');
    assertSupabaseServiceRoleKey(supabaseKey);
    const token =
        process.env.DISCORD_TOKEN_V2?.trim() ||
        process.env.DISCORD_TOKEN?.trim() ||
        process.env.Dev_Discord_Token?.trim();
    if (!token) {
        throw new Error('Missing DISCORD_TOKEN_V2, DISCORD_TOKEN, or Dev_Discord_Token');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    try {
        await client.login(token);

        /** @returns {Promise<import('discord.js').GuildTextBasedChannel>} */
        const asTextChannel = async (id) => {
            const ch = await client.channels.fetch(id);
            if (!ch?.isTextBased()) {
                throw new Error(`Channel ${id} missing or not text-based`);
            }
            return /** @type {import('discord.js').GuildTextBasedChannel} */ (ch);
        };

        console.log('Fetching VA channel messages…');
        const vaCh = await asTextChannel(VA_RESTOCK_ALERT_CHANNEL_ID);
        const vaMessages = await fetchAllMessages(vaCh);

        console.log('Fetching MD channel messages…');
        const mdCh = await asTextChannel(MD_RESTOCK_ALERT_CHANNEL_ID);
        const mdMessages = await fetchAllMessages(mdCh);

        const labelled = [
            ...vaMessages.map((m) => ({ m, region: 'VA' })),
            ...mdMessages.map((m) => ({ m, region: 'MD' }))
        ];

        const totalFound = labelled.length;
        console.log(`Total messages found (VA + MD): ${totalFound}`);

        const allIds = labelled.map(({ m }) => String(m.id));
        const existingIds = await fetchExistingMessageIds(supabase, tableName, allIds);

        /** @type {any[]} */
        const toInsert = [];
        let skippedDup = 0;

        for (const { m, region } of labelled) {
            if (existingIds.has(String(m.id))) {
                skippedDup++;
                continue;
            }
            const { store, location } = parseStoreLocation(m);
            const createdTs = new Date(m.createdTimestamp).toISOString();

            toInsert.push({
                region,
                store,
                location,
                approved_at: createdTs,
                source_channel_id: String(m.channelId),
                source_message_id: String(m.id),
                raw_message: rawMessagePayload(m),
                created_at: createdTs
            });
        }

        console.log(`New rows to insert (non-duplicate): ${toInsert.length}`);
        const failed = await insertRows(supabase, tableName, toInsert);
        const imported = toInsert.length - failed;

        console.log('—— Summary ——');
        console.log(`total messages scanned: ${totalFound}`);
        console.log(`imported:              ${imported}`);
        console.log(`skipped duplicate:      ${skippedDup}`);
        console.log(`failed inserts:        ${failed}`);
    } finally {
        client.destroy().catch(() => {});
    }
}

main().catch((err) => {
    console.error('Backfill aborted:', err);
    process.exit(1);
});
