/**
 * Reads Cursor's agent transcript JSONL for this project and writes a ChatGPT-friendly .md file.
 * Run from repo root: node scripts/export-cursor-chat-to-markdown.js
 *
 * Redacts obvious Discord tokens and DISCORD_TOKEN* env lines so the export is safer to share.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TRANSCRIPT_GLOB_HINT = path.join(
    process.env.HOME || '',
    '.cursor/projects/Users-diazm-Desktop-DiazDevelopment-LocalRestockApp-Discord/agent-transcripts'
);

const DEFAULT_TRANSCRIPT = path.join(
    TRANSCRIPT_GLOB_HINT,
    '43c9e08b-cdcc-4587-88fb-1d705fee4bb6',
    '43c9e08b-cdcc-4587-88fb-1d705fee4bb6.jsonl'
);

const outPath = path.join(__dirname, '..', 'CURSOR_CHAT_EXPORT_FOR_CHATGPT.md');
const transcriptPath = process.argv[2] || DEFAULT_TRANSCRIPT;

function redactSecrets(text) {
    if (!text) return text;
    let s = text;
    s = s.replace(/DISCORD_TOKEN_V2\s*=\s*\S+/gi, 'DISCORD_TOKEN_V2=[REDACTED]');
    s = s.replace(/DISCORD_TOKEN\s*=\s*\S+/gi, 'DISCORD_TOKEN=[REDACTED]');
    s = s.replace(/Dev_Discord_Token\s*=\s*\S+/gi, 'Dev_Discord_Token=[REDACTED]');
    s = s.replace(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/gi, 'SUPABASE_SERVICE_ROLE_KEY=[REDACTED]');
    // Discord bot token shape (approximate)
    s = s.replace(/M[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/g, '[DISCORD_BOT_TOKEN_REDACTED]');
    s = s.replace(/N[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/g, '[DISCORD_BOT_TOKEN_REDACTED]');
    return s;
}

function extractTextFromMessage(msg) {
    const c = msg?.content;
    if (!c) return '';
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
        return c
            .map((part) => {
                if (part?.type === 'text' && typeof part.text === 'string') return part.text;
                return '';
            })
            .join('');
    }
    return '';
}

function stripUserQueryWrapper(t) {
    const m = t.match(/^<user_query>\s*([\s\S]*?)\s*<\/user_query>$/);
    return m ? m[1].trim() : t;
}

async function main() {
    if (!fs.existsSync(transcriptPath)) {
        console.error('Transcript not found:', transcriptPath);
        console.error('Pass path as first arg, or update DEFAULT_TRANSCRIPT in this script.');
        process.exit(1);
    }

    const lines = [];
    const rl = readline.createInterface({
        input: fs.createReadStream(transcriptPath, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    let n = 0;
    for await (const line of rl) {
        n += 1;
        if (!line.trim()) continue;
        let row;
        try {
            row = JSON.parse(line);
        } catch {
            lines.push(`\n---\n_(line ${n}: invalid JSON)_\n`);
            continue;
        }
        const role = row.role === 'user' ? 'User' : row.role === 'assistant' ? 'Assistant' : row.role;
        let text = extractTextFromMessage(row.message);
        text = redactSecrets(text);
        if (role === 'User') text = stripUserQueryWrapper(text);
        lines.push(`\n## ${role} (turn ${n})\n\n${text}\n`);
    }

    const header = `# Cursor chat export (redacted)

Source: \`${transcriptPath}\`
Generated: ${new Date().toISOString()}

**Notes:** Cursor stores many assistant message bodies as \`[REDACTED]\` in the JSONL — those turns are not recoverable from this file. Discord tokens and similar env-style secrets in user text are scrubbed below.

---

`;

    fs.writeFileSync(outPath, header + lines.join('\n'), 'utf8');
    console.log('Wrote', outPath, `(${lines.length} turns)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
