/**
 * Short-lived ephemeral mapping so StringSelect values stay under Discord's 100-char limit.
 * NEVER stores secrets — only hashed store identifiers → display names.
 */
const TTL_MS = 15 * 60 * 1000;
const bucket = new Map();

function prune() {
    const now = Date.now();
    for (const [k, v] of bucket) {
        if (v.expiry < now) bucket.delete(k);
    }
}

/**
 * @param {string} userId
 * @param {string} slug max ~24 chars recommended
 * @param {string} displayName canonical store grouping key shown to users
 */
function remember(userId, region, slug, displayName) {
    prune();
    const key = `${userId}:${region}:${slug}`;
    bucket.set(key, { displayName, expiry: Date.now() + TTL_MS });
}

/**
 * @returns {string | null}
 */
function resolve(userId, region, slug) {
    prune();
    const key = `${userId}:${region}:${slug}`;
    const v = bucket.get(key);
    return v?.displayName ?? null;
}

module.exports = { remember, resolve };
