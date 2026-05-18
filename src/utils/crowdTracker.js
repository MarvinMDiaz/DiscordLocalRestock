'use strict';

const { createClient } = require('@supabase/supabase-js');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const TRACKER_TTL_MS = 2 * 60 * 60 * 1000;
const INTERACTION_COOLDOWN_MS = 20 * 1000;
const DOWNGRADE_RECENT_MS = 45 * 60 * 1000;
const STATUS_FLIP_FLOP_GUARD_MS = 10 * 60 * 1000;
const TABLE_NAME = process.env.CROWD_TRACKERS_TABLE?.trim() || 'restock_crowd_trackers';

const ESTIMATES = {
    unknown: {
        key: 'unknown',
        rank: 0,
        emoji: '⚪',
        range: 'Gathering reports',
        title: 'Unknown',
        color: 0x95a5a6
    },
    low: {
        key: 'low',
        rank: 1,
        emoji: '🟢',
        range: '1–10 people',
        title: 'Light Line',
        color: 0x57f287
    },
    moderate: {
        key: 'moderate',
        rank: 2,
        emoji: '🟡',
        range: '10–20 people',
        title: 'Moderate Line',
        color: 0xfee75c
    },
    high: {
        key: 'high',
        rank: 3,
        emoji: '🔴',
        range: '20+ people',
        title: 'Heavy Line',
        color: 0xed4245
    }
};

const VALID_ESTIMATES = Object.keys(ESTIMATES);
const trackers = new Map();
const cooldowns = new Map();
const expirationTimers = new Map();
let supabase = null;
let supabaseWarned = false;

function nowIso() {
    return new Date().toISOString();
}

function normalizeEstimate(value) {
    if (!value) return 'unknown';
    const v = String(value).toLowerCase();
    if (v === 'unknown' || v === 'idk' || v === 'i_dont_know' || v === "i don't know") return 'unknown';
    if (v === 'green' || v === '1-10' || v === '1_10') return 'low';
    if (v === 'yellow' || v === '10-20' || v === '10_20') return 'moderate';
    if (v === 'red' || v === '20+' || v === '20_plus') return 'high';
    return VALID_ESTIMATES.includes(v) ? v : 'moderate';
}

function estimateMeta(value) {
    return ESTIMATES[normalizeEstimate(value)];
}

function estimateSelectOptions() {
    return [
        { label: '1–10 people', value: 'low', emoji: '🟢', description: 'Light line' },
        { label: '10–20 people', value: 'moderate', emoji: '🟡', description: 'Moderate line' },
        { label: '20+ people', value: 'high', emoji: '🔴', description: 'Heavy line' },
        { label: 'Unknown / I Don’t Know', value: 'unknown', emoji: '⚪', description: 'Continue without guessing' }
    ];
}

function formatEstimate(value) {
    const e = estimateMeta(value);
    if (e.key === 'unknown') return '⚪ Gathering Reports';
    return `${e.emoji} ${e.title}: ${e.range}`;
}

function crowdFieldValue(summary) {
    if (summary.status === 'unknown') {
        return '⚪ Gathering Reports...\nConfidence: Waiting for line reports';
    }
    return `${formatEstimate(summary.status)}\nConfidence: ${summary.confidence}`;
}

function hasExpired(state) {
    return !!state.expired_at || Date.now() >= new Date(state.expires_at).getTime();
}

function statusFloorFromCheckins(activeCheckIns) {
    if (activeCheckIns >= 21) return 'high';
    if (activeCheckIns >= 11) return 'moderate';
    return 'unknown';
}

function maxStatus(a, b) {
    return ESTIMATES[a].rank >= ESTIMATES[b].rank ? a : b;
}

function voteWeight(vote, nowMs = Date.now()) {
    const updatedAt = new Date(vote.updated_at || vote.checked_in_at || 0).getTime();
    const age = Number.isFinite(updatedAt) ? nowMs - updatedAt : Number.POSITIVE_INFINITY;
    if (age <= 30 * 60 * 1000) return 1;
    if (age <= 60 * 60 * 1000) return 0.75;
    if (age <= 2 * 60 * 60 * 1000) return 0.45;
    return 0.25;
}

function isCommunityVote(userId, vote) {
    return !String(userId).startsWith('system:') && vote?.source !== 'original_reporter';
}

function isRecentVote(vote, nowMs = Date.now()) {
    const updatedAt = new Date(vote?.updated_at || 0).getTime();
    return Number.isFinite(updatedAt) && nowMs - updatedAt <= DOWNGRADE_RECENT_MS;
}

function scheduleExpiration(client, state) {
    const existing = expirationTimers.get(state.alert_id);
    if (existing) clearTimeout(existing);
    const delay = Math.max(0, new Date(state.expires_at).getTime() - Date.now());
    const timer = setTimeout(() => {
        expireTracker(client, state.alert_id, 'ttl').catch((err) => {
            console.error('[crowd] auto-expire failed:', err);
        });
    }, delay);
    expirationTimers.set(state.alert_id, timer);
}

function minuteRelative(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'just now';
    const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
}

function parseStoreParts(store) {
    const raw = String(store || '').trim();
    const lastDash = raw.lastIndexOf(' - ');
    if (lastDash === -1) return { storeName: raw || 'Unknown Store', address: '' };
    return {
        storeName: raw.substring(0, lastDash),
        address: raw.substring(lastDash + 3)
    };
}

function computeSummary(state) {
    const previous = normalizeEstimate(state.computed_status || state.original_estimate);
    const nowMs = Date.now();
    const voteEntries = Object.entries(state.user_estimate_votes || {})
        .map(([userId, raw]) => {
            const vote = typeof raw === 'string' ? { estimate: raw, updated_at: state.created_at } : raw || {};
            return {
                userId,
                vote,
                estimate: normalizeEstimate(vote.estimate)
            };
        })
        .filter((x) => x.estimate !== 'unknown');
    const voteValues = voteEntries.map((x) => x.estimate);

    const original = normalizeEstimate(state.original_estimate);
    if (!voteValues.length && original !== 'unknown') voteValues.push(original);

    const counts = { low: 0, moderate: 0, high: 0 };
    for (const v of voteValues) counts[v] += 1;
    const weightedCounts = { low: 0, moderate: 0, high: 0 };
    for (const entry of voteEntries) {
        weightedCounts[entry.estimate] += voteWeight(entry.vote, nowMs);
    }

    const activeCheckIns = Object.keys(state.user_checkins || {}).length;
    if (!voteValues.length) {
        return {
            status: 'unknown',
            confidence: 'Waiting for reports',
            matchingVotes: 0,
            activeCheckIns,
            totalReports: 0,
            counts,
            expired: hasExpired(state)
        };
    }

    let status = previous;
    if (status === 'unknown') status = voteValues[voteValues.length - 1] || 'moderate';
    let bestVotes = -1;
    for (const key of VALID_ESTIMATES) {
        if (key === 'unknown') continue;
        const votes = weightedCounts[key] || counts[key];
        if (votes > bestVotes || (votes === bestVotes && ESTIMATES[key].rank > ESTIMATES[status].rank)) {
            status = key;
            bestVotes = votes;
        }
    }

    const checkinFloor = statusFloorFromCheckins(activeCheckIns);
    status = maxStatus(status, checkinFloor);

    const previousMeta = ESTIMATES[previous];
    const nextMeta = ESTIMATES[status];
    const previousConfidence = state.confidence || 'Initial Report';
    const previousConfident = previousConfidence === 'Medium' || previousConfidence === 'High';
    if (previous !== 'unknown' && nextMeta.rank < previousMeta.rank) {
        const recentCommunityForCandidate = voteEntries.filter(
            (x) => x.estimate === status && isCommunityVote(x.userId, x.vote) && isRecentVote(x.vote, nowMs)
        ).length;
        const recentHigherVotes = voteEntries.filter(
            (x) => ESTIMATES[x.estimate].rank > ESTIMATES[status].rank && isRecentVote(x.vote, nowMs)
        ).length;
        const canClearCheckinFloor = ESTIMATES[status].rank >= ESTIMATES[checkinFloor].rank;
        const changedAt = state.status_changed_at ? new Date(state.status_changed_at).getTime() : 0;
        const flipGuardOpen = !changedAt || nowMs - changedAt >= STATUS_FLIP_FLOP_GUARD_MS;
        const hasClearRecentMajority =
            recentCommunityForCandidate >= 3 && recentCommunityForCandidate >= recentHigherVotes + 2;

        if (previousConfident || previousMeta.rank > nextMeta.rank) {
            if (!hasClearRecentMajority || !canClearCheckinFloor || !flipGuardOpen) status = previous;
        }
    }

    const matchingVotes = counts[status] || 0;
    const totalReports = voteValues.length;
    const latestAt = state.last_updated_at || state.updated_at || state.created_at;
    const ageMins = latestAt ? Math.floor((Date.now() - new Date(latestAt).getTime()) / 60000) : 999;
    const recencyBoost = ageMins <= 30 ? 1 : ageMins <= 60 ? 0.5 : 0;

    let confidence = 'Initial Report';
    if (!(matchingVotes <= 1 && activeCheckIns === 0)) {
        const score = matchingVotes + activeCheckIns * 0.5 + recencyBoost;
        if (score >= 5) confidence = 'High';
        else if (score >= 3) confidence = 'Medium';
        else confidence = 'Low';
    }

    return {
        status,
        confidence,
        matchingVotes,
        activeCheckIns,
        totalReports,
        counts,
        expired: hasExpired(state)
    };
}

function applySummary(state) {
    const before = normalizeEstimate(state.computed_status || state.original_estimate);
    const summary = computeSummary(state);
    state.computed_status = summary.status;
    state.confidence = summary.expired ? 'Expired' : summary.confidence;
    if (before !== summary.status) state.status_changed_at = nowIso();
    state.updated_at = nowIso();
    return { state, summary: { ...summary, confidence: state.confidence } };
}

function getSupabase() {
    if (supabase) return supabase;
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url || !key) {
        if (!supabaseWarned) {
            console.warn('[crowd] Supabase env missing; tracker will run without remote persistence.');
            supabaseWarned = true;
        }
        return null;
    }
    supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    return supabase;
}

function toRow(state) {
    return {
        alert_id: state.alert_id,
        restock_id: state.restock_id || null,
        source_message_id: state.source_message_id,
        source_channel_id: state.source_channel_id,
        thread_id: state.thread_id || null,
        tracker_message_id: state.tracker_message_id || null,
        store_name: state.store_name,
        store_address: state.store_address || null,
        region: state.region,
        original_reporter_id: state.original_reporter_id || null,
        original_estimate: normalizeEstimate(state.original_estimate),
        user_checkins: state.user_checkins || {},
        user_estimate_votes: state.user_estimate_votes || {},
        computed_status: normalizeEstimate(state.computed_status || state.original_estimate),
        confidence: state.confidence || 'Initial Report',
        created_at: state.created_at,
        updated_at: state.updated_at,
        expires_at: state.expires_at,
        expired_at: state.expired_at || null
    };
}

async function persistState(state) {
    trackers.set(state.alert_id, state);
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from(TABLE_NAME).upsert(toRow(state), { onConflict: 'alert_id' });
    if (error) {
        console.error('[crowd] Supabase upsert failed:', error.message || error);
    }
}

async function loadState(alertId) {
    const cached = trackers.get(alertId);
    if (cached) return cached;

    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from(TABLE_NAME).select('*').eq('alert_id', alertId).maybeSingle();
    if (error) {
        console.error('[crowd] Supabase load failed:', error.message || error);
        return null;
    }
    if (!data) return null;
    const state = {
        alert_id: data.alert_id,
        restock_id: data.restock_id,
        source_message_id: data.source_message_id,
        source_channel_id: data.source_channel_id,
        thread_id: data.thread_id,
        tracker_message_id: data.tracker_message_id,
        store_name: data.store_name,
        store_address: data.store_address,
        region: data.region,
        original_reporter_id: data.original_reporter_id,
        original_estimate: normalizeEstimate(data.original_estimate),
        user_checkins: data.user_checkins || {},
        user_estimate_votes: data.user_estimate_votes || {},
        computed_status: normalizeEstimate(data.computed_status || data.original_estimate),
        confidence: data.confidence || 'Initial Report',
        created_at: data.created_at,
        updated_at: data.updated_at,
        expires_at: data.expires_at,
        expired_at: data.expired_at
    };
    trackers.set(alertId, state);
    return state;
}

function estimateFromTrackerDescription(description) {
    const text = String(description || '');
    if (/Gathering Reports|Waiting for reports|Unknown/i.test(text)) return 'unknown';
    if (text.includes('🔴') || /20\+/.test(text) || /Heavy Line/i.test(text)) return 'high';
    if (text.includes('🟡') || /10[–-]20/.test(text) || /Moderate Line/i.test(text)) return 'moderate';
    if (text.includes('🟢') || /1[–-]10/.test(text) || /Light Line/i.test(text)) return 'low';
    return 'moderate';
}

function storeNameFromTrackerDescription(description) {
    const text = String(description || '');
    const bold = text.match(/\*\*([^*]+)\*\*/);
    if (bold?.[1] && !bold[1].includes(':')) return bold[1].trim();
    const firstLine = text.split('\n').find((line) => line.trim());
    return firstLine?.replace(/\*/g, '').trim() || 'Unknown Store';
}

/**
 * Fallback for dev/test restarts before the Supabase table exists.
 * Rebuilds enough state from the persistent tracker message so buttons keep working.
 */
async function recoverStateFromTrackerMessage(interaction, alertId) {
    const embed = interaction.message?.embeds?.[0];
    const channel = interaction.channel;
    if (!embed || !channel) return null;

    const estimate = estimateFromTrackerDescription(embed.description);
    const ts = nowIso();
    const state = {
        alert_id: alertId,
        restock_id: null,
        source_message_id: alertId,
        source_channel_id: channel.parentId || channel.parent?.id || channel.id,
        thread_id: channel.id,
        tracker_message_id: interaction.message.id,
        store_name: storeNameFromTrackerDescription(embed.description),
        store_address: '',
        region: '',
        original_reporter_id: null,
        original_estimate: estimate,
        user_checkins: {},
        user_estimate_votes: estimate === 'unknown'
            ? {}
            : { 'system:restored': { estimate, updated_at: ts, source: 'recovered_from_message' } },
        computed_status: estimate,
        confidence: 'Initial Report',
        last_updated_at: ts,
        created_at: ts,
        updated_at: ts,
        expires_at: new Date(Date.now() + TRACKER_TTL_MS).toISOString(),
        expired_at: null
    };

    await persistState(state);
    scheduleExpiration(interaction.client, state);
    console.warn(`[crowd] Recovered tracker state from message for alert ${alertId}.`);
    return state;
}

async function fetchChannel(client, channelId) {
    return client.channels.cache.get(channelId) || client.channels.fetch(channelId).catch(() => null);
}

async function fetchMessage(client, channelId, messageId) {
    const channel = await fetchChannel(client, channelId);
    if (!channel?.messages?.fetch) return null;
    return channel.messages.fetch(messageId).catch(() => null);
}

function trackerButtons(state, summary) {
    const expired = summary.expired;
    const minRank = summary.confidence === 'Medium' || summary.confidence === 'High'
        ? ESTIMATES[summary.status].rank
        : 1;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`crowd_vote_low_${state.alert_id}`)
            .setLabel('1–10')
            .setEmoji('🟢')
            .setStyle(ButtonStyle.Success)
            .setDisabled(expired || ESTIMATES.low.rank < minRank),
        new ButtonBuilder()
            .setCustomId(`crowd_vote_moderate_${state.alert_id}`)
            .setLabel('10–20')
            .setEmoji('🟡')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(expired || ESTIMATES.moderate.rank < minRank),
        new ButtonBuilder()
            .setCustomId(`crowd_vote_high_${state.alert_id}`)
            .setLabel('20+')
            .setEmoji('🔴')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(expired)
    );
}

function trackerEmbed(state, summary) {
    const meta = estimateMeta(summary.status);
    const counts = summary.counts || { low: 0, moderate: 0, high: 0 };
    const updatedText = summary.expired
        ? 'Expired'
        : minuteRelative(state.last_updated_at || state.updated_at || state.created_at);
    const lineLabel = summary.status === 'unknown' ? '⚪ Waiting for reports' : `${meta.emoji} ${meta.range}`;
    const headline = summary.status === 'unknown' ? '⚪ Gathering Reports' : formatEstimate(summary.status);

    const embed = new EmbedBuilder()
        .setColor(summary.expired ? 0x95a5a6 : meta.color)
        .setTitle(summary.expired ? '👥 Live Crowd Tracker — Expired' : '👥 Live Crowd Tracker')
        .setDescription(
            `**${state.store_name}**\n\n` +
            `### ${headline}\n` +
            `_Updated ${updatedText}_`
        )
        .addFields(
            { name: 'Current Line', value: lineLabel, inline: true },
            { name: 'Confidence', value: summary.confidence, inline: true },
            { name: 'Line Votes', value: `${summary.totalReports}`, inline: true }
        )
        .addFields({
            name: 'How The Estimate Works',
            value:
                '🗳️ **Line votes** choose the current range: 🟢 1–10 people · 🟡 10–20 people · 🔴 20+ people\n' +
                '📈 **Confidence** rises when recent community votes support the same range.',
            inline: false
        })
        .addFields({
            name: 'Community Input',
            value: `Votes: 🟢 1–10 people: ${counts.low || 0} · 🟡 10–20 people: ${counts.moderate || 0} · 🔴 20+ people: ${counts.high || 0}`,
            inline: false
        })
        .setFooter({
            text: summary.expired
                ? 'Line data is expired. Start from a fresh restock alert.'
                : 'Live crowd data expires automatically.'
        });

    return embed;
}

async function syncTrackerMessage(client, state) {
    const { state: applied, summary } = applySummary(state);
    const thread = await fetchChannel(client, applied.thread_id);
    if (!thread) return;

    const payload = {
        embeds: [trackerEmbed(applied, summary)],
        components: [trackerButtons(applied, summary)]
    };

    let message = null;
    if (applied.tracker_message_id) {
        message = await thread.messages.fetch(applied.tracker_message_id).catch(() => null);
    }
    if (message) {
        await message.edit(payload);
    } else {
        message = await thread.send(payload);
        applied.tracker_message_id = message.id;
    }
    await persistState(applied);
}

function applyCrowdField(embed, summary) {
    const existing = embed.data.fields || [];
    const filtered = existing.filter((f) => f.name !== '👥 Crowd Status');
    embed.setFields(filtered);
    embed.addFields({
        name: '👥 Crowd Status',
        value: crowdFieldValue(summary),
        inline: false
    });
    embed.setColor(summary.expired ? 0x95a5a6 : estimateMeta(summary.status).color);
    return embed;
}

async function syncMainAlert(client, state) {
    const { state: applied, summary } = applySummary(state);
    const message = await fetchMessage(client, applied.source_channel_id, applied.source_message_id);
    if (!message?.embeds?.length) return;
    const embed = EmbedBuilder.from(message.embeds[0]);
    applyCrowdField(embed, summary);
    await message.edit({ embeds: [embed] });
    await persistState(applied);
}

function initialSummaryFromEstimate(estimate) {
    const status = normalizeEstimate(estimate);
    return {
        status,
        confidence: status === 'unknown' ? 'Waiting for reports' : 'Initial Report',
        expired: false
    };
}

function makeInitialState({ alertMessage, thread, restock, storeName, address, region }) {
    const initialEstimate = normalizeEstimate(restock.line_estimate);
    const now = nowIso();
    const votes = {};
    if (restock.reported_by && initialEstimate !== 'unknown') {
        votes[restock.reported_by] = { estimate: initialEstimate, updated_at: now, source: 'original_reporter' };
    }
    return {
        alert_id: alertMessage.id,
        restock_id: restock.id,
        source_message_id: alertMessage.id,
        source_channel_id: alertMessage.channelId || alertMessage.channel?.id,
        thread_id: thread?.id || null,
        tracker_message_id: null,
        store_name: storeName,
        store_address: address || '',
        region,
        original_reporter_id: restock.reported_by,
        original_estimate: initialEstimate,
        user_checkins: {},
        user_estimate_votes: votes,
        computed_status: initialEstimate,
        confidence: initialEstimate === 'unknown' ? 'Waiting for reports' : 'Initial Report',
        last_updated_at: now,
        created_at: now,
        updated_at: now,
        expires_at: new Date(Date.now() + TRACKER_TTL_MS).toISOString(),
        expired_at: null
    };
}

async function createTrackerForAlert({ client, alertMessage, thread, restock, storeName, address, region }) {
    if (!alertMessage || !thread || !restock?.line_estimate) return null;
    const state = makeInitialState({ alertMessage, thread, restock, storeName, address, region });
    await syncTrackerMessage(client, state);
    scheduleExpiration(client, state);
    return state;
}

function checkCooldown(userId, alertId, action) {
    const key = `${userId}:${alertId}:${action}`;
    const last = cooldowns.get(key) || 0;
    if (Date.now() - last < INTERACTION_COOLDOWN_MS) return false;
    cooldowns.set(key, Date.now());
    return true;
}

async function handleCrowdButton(interaction) {
    const customId = interaction.customId;
    const voteMatch = customId.match(/^crowd_vote_(low|moderate|high)_(\d+)$/);
    const checkInMatch = customId.match(/^crowd_checkin_(\d+)$/);
    if (!voteMatch && !checkInMatch) return false;

    const action = voteMatch ? 'vote' : 'checkin';
    const alertId = voteMatch ? voteMatch[2] : checkInMatch[1];
    let state = await loadState(alertId);
    if (!state) {
        state = await recoverStateFromTrackerMessage(interaction, alertId);
    }
    if (!state) {
        await interaction.reply({
            content: '❌ Crowd tracker data was not found for this alert. Create the Supabase tracker table or start from a fresh alert.',
            ephemeral: true
        });
        return true;
    }

    if (hasExpired(state)) {
        state.expired_at ||= nowIso();
        await interaction.deferUpdate().catch(() => {});
        await syncTrackerMessage(interaction.client, state).catch((err) => console.error('[crowd] expired sync failed:', err));
        await syncMainAlert(interaction.client, state).catch((err) => console.error('[crowd] expired alert sync failed:', err));
        await interaction.followUp({ content: '⌛ This crowd tracker has expired.', ephemeral: true }).catch(() => {});
        return true;
    }

    if (!checkCooldown(interaction.user.id, alertId, action)) {
        await interaction.reply({
            content: '⏳ Give it a few seconds before updating this tracker again.',
            ephemeral: true
        });
        return true;
    }

    const ts = nowIso();
    if (voteMatch) {
        const estimate = voteMatch[1];
        const currentSummary = computeSummary(state);
        const minRank = currentSummary.confidence === 'Medium' || currentSummary.confidence === 'High'
            ? ESTIMATES[currentSummary.status].rank
            : 1;
        if (ESTIMATES[estimate].rank < minRank) {
            await interaction.reply({
                content: '⚠️ That lower estimate is locked because the line is already confident at a higher level.',
                ephemeral: true
            });
            return true;
        }
        state.user_estimate_votes[interaction.user.id] = { estimate, updated_at: ts };
        state.last_updated_at = ts;
    } else {
        state.user_checkins[interaction.user.id] = { checked_in_at: ts };
        state.last_updated_at = ts;
    }

    await interaction.deferUpdate();
    await syncTrackerMessage(interaction.client, state);
    await syncMainAlert(interaction.client, state);
    return true;
}

function canModerate(member) {
    return !!member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
        !!member?.permissions?.has(PermissionFlagsBits.Administrator);
}

async function expireTracker(client, alertId, reason = 'manual_expire') {
    const state = await loadState(alertId);
    if (!state) return null;
    const timer = expirationTimers.get(alertId);
    if (timer) clearTimeout(timer);
    expirationTimers.delete(alertId);
    state.expired_at = nowIso();
    state.expire_reason = reason;
    await syncTrackerMessage(client, state).catch((err) => console.error('[crowd] tracker expire sync failed:', err));
    await syncMainAlert(client, state).catch((err) => console.error('[crowd] main expire sync failed:', err));
    await persistState(state);
    return state;
}

async function resetTracker(client, alertId) {
    const state = await loadState(alertId);
    if (!state) return null;
    const ts = nowIso();
    const initialEstimate = normalizeEstimate(state.original_estimate);
    state.user_checkins = {};
    state.user_estimate_votes = {};
    if (state.original_reporter_id && initialEstimate !== 'unknown') {
        state.user_estimate_votes[state.original_reporter_id] = {
            estimate: initialEstimate,
            updated_at: ts,
            source: 'original_reporter'
        };
    }
    state.computed_status = initialEstimate;
    state.confidence = initialEstimate === 'unknown' ? 'Waiting for reports' : 'Initial Report';
    state.last_updated_at = ts;
    state.updated_at = ts;
    state.expired_at = null;
    state.expires_at = new Date(Date.now() + TRACKER_TTL_MS).toISOString();
    await syncTrackerMessage(client, state);
    await syncMainAlert(client, state);
    scheduleExpiration(client, state);
    return state;
}

module.exports = {
    ESTIMATES,
    canModerate,
    createTrackerForAlert,
    estimateSelectOptions,
    expireTracker,
    formatEstimate,
    handleCrowdButton,
    initialSummaryFromEstimate,
    applyCrowdField,
    normalizeEstimate,
    resetTracker
};
