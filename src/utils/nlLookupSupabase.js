'use strict';

const { getSupabaseClientIfConfigured, getRestockHistoryTableName } = require('./restockHistorySync');

/**
 * New Look lookup: read restock week summaries from Supabase `restock_history`
 * (same table as approval sync / backfill / predictions).
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY), RESTOCK_ALERTS_TABLE.
 * Opt-out: NL_LOOKUP_USE_JSON=true → skip DB and let caller use JSON.
 *
 * **Matching:** `restock_history` uses short `store` + separate `location` (address). Catalog lines are
 * `Chain - Nickname - Address`. We match `region` + `location` first (exact, then normalized in-memory),
 * then short `store`, then full catalog string as `store`. No fuzzy auto-match.
 */

function shouldUseSupabaseForNlLookup() {
    const forceJson = process.env.NL_LOOKUP_USE_JSON?.trim();
    if (forceJson === '1' || forceJson?.toLowerCase() === 'true') return false;
    return getSupabaseClientIfConfigured() != null;
}

/**
 * @param {string[]} approvedAtIso
 * @returns {{ last_reported_restock_date: string|null, last_checked_date: null, approvalCount: number }}
 */
function aggregateApprovalTimestamps(approvedAtIso) {
    let bestIso = null;
    let bestT = null;
    for (const iso of approvedAtIso) {
        const t = new Date(iso);
        if (Number.isNaN(t.getTime())) continue;
        if (!bestT || t > bestT) {
            bestT = t;
            bestIso = iso;
        }
    }
    return {
        last_reported_restock_date: bestIso,
        last_checked_date: null,
        approvalCount: approvedAtIso.length
    };
}

function debugLookupEnabled() {
    const v = process.env.DEBUG_LOOKUP?.trim();
    return v === '1' || v?.toLowerCase() === 'true';
}

/** Normalize en/em dashes to spaced hyphen for consistent ` - ` splitting. */
function normalizeCatalogSeparators(line) {
    return String(line || '')
        .replace(/\s*[\u2013\u2014]\s*/g, ' - ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Address = portion after the second ` - ` segment (chain, nickname, … address). */
function catalogAddressFromFullLine(catalogLine) {
    const n = normalizeCatalogSeparators(catalogLine);
    const parts = n.split(' - ').map((p) => p.trim());
    if (parts.length < 3) return '';
    return parts.slice(2).join(' - ').trim();
}

/** e.g. `Target - Chantilly` from `Target - Chantilly - 123 Main…` */
function catalogShortStoreFromFullLine(catalogLine) {
    const n = normalizeCatalogSeparators(catalogLine);
    const parts = n.split(' - ').map((p) => p.trim());
    if (parts.length < 2) return '';
    return `${parts[0]} - ${parts[1]}`;
}

function normalizeAddr(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** @param {import('@supabase/supabase-js').SupabaseClient} sb */
function rowsToApprovedIsoList(rows) {
    const out = [];
    for (const row of rows || []) {
        const ts = row.approved_at || row.created_at;
        if (ts) out.push(ts);
    }
    return out;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} table
 * @param {'VA'|'MD'} letter
 * @param {string} method
 * @param {object[]} rows
 */
function debugLookupMatch(letter, method, parsedAddress, shortStore, rowCount) {
    if (!debugLookupEnabled()) return;
    console.log('[nl_lookup]', JSON.stringify({
        region: letter,
        parsedAddress: parsedAddress || null,
        shortStore: shortStore || null,
        method,
        rowCount
    }));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
async function fetchApprovedAtList(sb, table, regionLower, storeCanonical) {
    const letter = regionLower === 'md' ? 'MD' : 'VA';
    const full = String(storeCanonical || '').trim();
    const address = catalogAddressFromFullLine(full);
    const shortStore = catalogShortStoreFromFullLine(full);

    // (a) Exact region + location
    if (address) {
        const { data, error } = await sb
            .from(table)
            .select('approved_at, created_at')
            .eq('region', letter)
            .eq('location', address)
            .order('approved_at', { ascending: false, nullsFirst: false })
            .limit(500);
        if (error) throw error;
        if (data && data.length > 0) {
            debugLookupMatch(letter, 'a_exact_location', address, shortStore, data.length);
            return rowsToApprovedIsoList(data);
        }
    }

    // (b) Normalized location — scan recent rows for this region only (no fuzzy token match)
    if (address) {
        const normA = normalizeAddr(address);
        if (normA.length > 5) {
            const { data, error } = await sb
                .from(table)
                .select('approved_at, created_at, location')
                .eq('region', letter)
                .order('approved_at', { ascending: false, nullsFirst: false })
                .limit(2500);
            if (error) throw error;
            const matched = (data || []).filter((r) => normalizeAddr(r.location) === normA);
            matched.sort((a, b) => {
                const ta = new Date(a.approved_at || a.created_at).getTime();
                const tb = new Date(b.approved_at || b.created_at).getTime();
                return tb - ta;
            });
            if (matched.length > 0) {
                debugLookupMatch(letter, 'b_normalized_location', address, shortStore, matched.length);
                return rowsToApprovedIsoList(matched);
            }
        }
    }

    // (c) Short store label
    if (shortStore) {
        const { data, error } = await sb
            .from(table)
            .select('approved_at, created_at')
            .eq('region', letter)
            .eq('store', shortStore)
            .order('approved_at', { ascending: false, nullsFirst: false })
            .limit(500);
        if (error) throw error;
        if (data && data.length > 0) {
            debugLookupMatch(letter, 'c_short_store', address, shortStore, data.length);
            return rowsToApprovedIsoList(data);
        }
    }

    // (d) Full catalog string as store (legacy / rare)
    const { data, error } = await sb
        .from(table)
        .select('approved_at, created_at')
        .eq('region', letter)
        .eq('store', full)
        .order('approved_at', { ascending: false, nullsFirst: false })
        .limit(500);
    if (error) throw error;
    debugLookupMatch(letter, 'd_full_catalog_store', address, shortStore, data?.length || 0);
    return rowsToApprovedIsoList(data);
}

/**
 * @param {string} regionLower 'va' | 'md'
 * @param {string} storeCanonical full store string from config
 */
async function lookupSingleStoreFromDb(regionLower, storeCanonical) {
    const sb = getSupabaseClientIfConfigured();
    if (!sb) return null;
    const table = getRestockHistoryTableName();
    const approvedAtIso = await fetchApprovedAtList(sb, table, regionLower, storeCanonical);
    return {
        store: storeCanonical,
        ...aggregateApprovalTimestamps(approvedAtIso)
    };
}

/**
 * @param {string} regionLower
 * @param {string[]} catalogStores
 * @returns {Promise<Map<string, { store: string, current_week_restock_date: string|null, previous_week_restock_date: string|null, last_checked_date: null }>>}
 */
async function lookupStoresBatchFromDb(regionLower, catalogStores) {
    const sb = getSupabaseClientIfConfigured();
    if (!sb) return null;
    const table = getRestockHistoryTableName();

    const concurrency = 12;
    /** @type {Map<string, ReturnType<typeof aggregateApprovalTimestamps> & { store: string }>} */
    const map = new Map();

    for (let i = 0; i < catalogStores.length; i += concurrency) {
        const slice = catalogStores.slice(i, i + concurrency);
        const results = await Promise.all(
            slice.map(async (store) => {
                const approvedAtIso = await fetchApprovedAtList(sb, table, regionLower, store);
                return { store, ...aggregateApprovalTimestamps(approvedAtIso) };
            })
        );
        for (const row of results) {
            map.set(row.store, row);
        }
    }

    return map;
}

module.exports = {
    shouldUseSupabaseForNlLookup,
    lookupSingleStoreFromDb,
    lookupStoresBatchFromDb
};
