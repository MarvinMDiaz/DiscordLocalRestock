const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ThreadAutoArchiveDuration,
    PermissionFlagsBits,
    OverwriteType
} = require('discord.js');
const dataManager = require('./dataManager');
const configManager = require('./configManager');
const interactionLogger = require('./interactionLogger');
const crowdTracker = require('./crowdTracker');

/** Pending approval message — moderator photo choice (5 buttons, max 5 per row → split 3 + 2) */
const APR_PREFIX_PHOTO = 'rstk_apr_photo_';
const APR_PREFIX_NOPHOTO = 'rstk_apr_nophoto_';
const APR_PREFIX_PHOTO_NOTE = 'rstk_apr_photo_note_';
const APR_PREFIX_NOPHOTO_NOTE = 'rstk_apr_nophoto_note_';
const NOTE_MODAL_PREFIX_PHOTO = 'rstk_note_modal_photo_';
const NOTE_MODAL_PREFIX_NOPHOTO = 'rstk_note_modal_nophoto_';

function buildApprovalButtonRows(restockId, { disabled = false } = {}) {
    const mk = (customId, label, style) =>
        new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);

    const row1 = new ActionRowBuilder().addComponents(
        mk(`${APR_PREFIX_PHOTO}${restockId}`, 'Approve With Photo', ButtonStyle.Success),
        mk(`${APR_PREFIX_NOPHOTO}${restockId}`, 'Approve without Photo', ButtonStyle.Secondary),
        mk(`${APR_PREFIX_PHOTO_NOTE}${restockId}`, 'Approve with photo + note', ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        mk(`${APR_PREFIX_NOPHOTO_NOTE}${restockId}`, 'Approve without photo + note', ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`reject_${restockId}`)
            .setLabel('Reject')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
    return [row1, row2];
}

function parseApprovalButtonCustomId(customId) {
    if (customId.startsWith('reject_')) {
        return { kind: 'reject', restockId: customId.slice('reject_'.length) };
    }
    if (customId.startsWith(APR_PREFIX_PHOTO_NOTE)) {
        return { kind: 'approve_modal', restockId: customId.slice(APR_PREFIX_PHOTO_NOTE.length), forwardProofPhoto: true };
    }
    if (customId.startsWith(APR_PREFIX_NOPHOTO_NOTE)) {
        return { kind: 'approve_modal', restockId: customId.slice(APR_PREFIX_NOPHOTO_NOTE.length), forwardProofPhoto: false };
    }
    if (customId.startsWith(APR_PREFIX_PHOTO)) {
        return { kind: 'approve', restockId: customId.slice(APR_PREFIX_PHOTO.length), forwardProofPhoto: true };
    }
    if (customId.startsWith(APR_PREFIX_NOPHOTO)) {
        return { kind: 'approve', restockId: customId.slice(APR_PREFIX_NOPHOTO.length), forwardProofPhoto: false };
    }
    if (customId.startsWith('approve_note_')) {
        return { kind: 'approve_modal', restockId: customId.slice('approve_note_'.length), forwardProofPhoto: true };
    }
    if (customId.startsWith('approve_')) {
        return { kind: 'approve', restockId: customId.slice('approve_'.length), forwardProofPhoto: true };
    }
    return null;
}

function parseApproveNoteModalCustomId(customId) {
    if (customId.startsWith(NOTE_MODAL_PREFIX_PHOTO)) {
        return { restockId: customId.slice(NOTE_MODAL_PREFIX_PHOTO.length), forwardProofPhoto: true };
    }
    if (customId.startsWith(NOTE_MODAL_PREFIX_NOPHOTO)) {
        return { restockId: customId.slice(NOTE_MODAL_PREFIX_NOPHOTO.length), forwardProofPhoto: false };
    }
    if (customId.startsWith('approve_note_modal_')) {
        return { restockId: customId.slice('approve_note_modal_'.length), forwardProofPhoto: true };
    }
    return null;
}

function imageAttachmentFromMessage(message) {
    const supportedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    return [...(message.attachments?.values?.() || [])].find((attachment) => {
        const name = String(attachment.name || attachment.url || '').split('?')[0].toLowerCase();
        const contentType = String(attachment.contentType || '').toLowerCase();
        return supportedExts.some((ext) => name.endsWith(ext)) || ['image/jpeg', 'image/png', 'image/webp'].includes(contentType);
    });
}

function removeProofPhotoMetadata(restock) {
    if (!restock) return false;
    let changed = false;
    for (const key of [
        'approval_thread_id',
        'approval_proof_channel_id',
        'approval_message_id',
        'approval_source_channel_id',
        'approval_review_thread_id',
        'approval_review_bridge_message_id',
        'approval_review_bridge_channel_id',
        'photo_url',
        'photo_message_id',
        'photo_uploaded_by',
        'temp_approvals_access_role_id',
        'temp_approvals_access_guild_id'
    ]) {
        if (restock[key] !== undefined) {
            delete restock[key];
            changed = true;
        }
    }
    return changed;
}

/**
 * Optional escape hatch when the bot cannot thread.members.add (e.g. missing Manage Threads):
 * grant a role that can see the approvals channel, then retry the add.
 * WARNING: that role must be scoped (channel overrides only); otherwise the reporter sees every pending approval.
 */
function getReporterTempApprovalsAccessRoleId(restock) {
    try {
        const config = require('../../config/config.json');
        const region = String(restock?.region || 'va').toLowerCase() === 'md' ? 'md' : 'va';
        const raw =
            region === 'md'
                ? config.roles?.reporterTempApprovalsAccessRoleMD
                : config.roles?.reporterTempApprovalsAccessRoleVA;
        const id = String(raw || '').trim();
        return id || null;
    } catch (_) {
        return null;
    }
}

async function grantReporterTempApprovalsAccessRoleIfConfigured(guild, restock) {
    const roleId = getReporterTempApprovalsAccessRoleId(restock);
    if (!guild || !restock?.reported_by || !roleId) return false;
    try {
        const member = await guild.members.fetch(restock.reported_by);
        await member.roles.add(roleId, 'Temporary access to reach proof thread (auto-revoked when report closes)');
        restock.temp_approvals_access_role_id = roleId;
        restock.temp_approvals_access_guild_id = guild.id;
        await dataManager.saveData();
        console.warn(
            `[PHOTO_PROOF] Granted temp approvals access role ${roleId} to reporter ${restock.reported_by}. ` +
                'Ensure that role only overrides the approvals channel (not full server visibility of all pending reports).'
        );
        return true;
    } catch (e) {
        console.warn('[PHOTO_PROOF] Could not grant temp approvals access role:', e.message || e);
        return false;
    }
}

async function revokeReporterTemporaryApprovalsAccess(client, restock) {
    const roleId = restock?.temp_approvals_access_role_id;
    const guildId = restock?.temp_approvals_access_guild_id;
    const userId = restock?.reported_by;
    if (!client) return;
    if (roleId && guildId && userId) {
        try {
            const guild =
                client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
            if (guild) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member?.roles?.cache?.has(roleId)) {
                    await member.roles.remove(roleId, 'Restock report finalized').catch(() => {});
                }
            }
        } catch (_) {
            /* non-fatal */
        }
    }
    delete restock.temp_approvals_access_role_id;
    delete restock.temp_approvals_access_guild_id;
}

function proofThreadName(store) {
    const raw = String(store || 'Restock').split(' - ').slice(0, 2).join(' - ') || 'Restock';
    return `Proof • ${raw}`.slice(0, 100);
}

/** Role IDs to allow pings in moderator proof threads (same region as report). */
function getApprovalPingRoleIds(region = 'va') {
    try {
        const config = require('../../config/config.json');
        const approvalRoleId = String(
            region === 'md' ? config.roles?.restockApprovalMD || '' : config.roles?.restockApprovalVA || ''
        ).trim();
        const adminRoleId = String(config.roles?.admin || '').trim();
        const ids = [];
        if (approvalRoleId) ids.push(approvalRoleId);
        if (adminRoleId && adminRoleId !== approvalRoleId) ids.push(adminRoleId);
        return ids;
    } catch (_) {
        return [];
    }
}

/** Mirror proof image into the moderator review thread + link reporter upload + this thread. */
async function forwardProofPhotoToModeratorReviewThread(client, restock) {
    if (!client || !restock?.approval_review_thread_id || !restock?.photo_url) return;
    try {
        const thread = await client.channels.fetch(restock.approval_review_thread_id).catch(() => null);
        if (!thread?.isThread?.()) return;

        const proofLocation = restock.approval_proof_channel_id
            ? `<#${restock.approval_proof_channel_id}>`
            : restock.approval_thread_id
              ? `<#${restock.approval_thread_id}>`
              : '—';

        const proofEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📷 Proof photo (mirror)')
            .setDescription(
                `**Reporter upload:** ${proofLocation}\n` + `**This moderator thread:** ${thread.url}\nReport ID: \`${restock.id}\``
            )
            .setImage(restock.photo_url);

        await thread.send({ embeds: [proofEmbed] });
        console.log(`[PHOTO_PROOF] Mirrored proof to moderator review thread for report ${restock.id}`);
    } catch (err) {
        console.warn(
            `[PHOTO_PROOF] Could not mirror proof to moderator thread (report ${restock?.id}):`,
            err.message || err
        );
    }
}

/** DM reporter: thanks + link to proof upload (channel or private thread). Safe if no proof area (missing guild or IDs). */
async function sendReporterReportSubmittedDm(client, { guildId, restock }) {
    if (!client || !restock?.reported_by) return;
    try {
        const user = await client.users.fetch(restock.reported_by).catch(() => null);
        if (!user) return;

        const store = restock.store || 'your store';
        const gid = guildId ? String(guildId) : '';
        let uploadHelp =
            'A dedicated proof upload area was not created (check approval channel setup). Moderators can still review your report.';

        if (gid && restock.approval_proof_channel_id) {
            const url = `https://discord.com/channels/${gid}/${restock.approval_proof_channel_id}`;
            uploadHelp =
                `Optional: upload a clear restock photo in your private upload channel:\n${url}\n\nIf the link does not open, open this server in the Discord app.`;
        } else if (gid && restock.approval_thread_id) {
            const url = `https://discord.com/channels/${gid}/${restock.approval_thread_id}`;
            uploadHelp =
                `Optional: upload a clear restock photo in your private proof thread:\n${url}\n\nIf the link does not open, open this server in the Discord app.`;
        }

        await user.send({
            content:
                `**Thanks for submitting your restock report.**\n\n` +
                `**Store:** ${store}\n` +
                `**Report ID:** \`${restock.id}\`\n\n` +
                uploadHelp
        });
    } catch (err) {
        if (err?.code !== 50007) {
            console.warn('[DM] Could not send submission confirmation to reporter:', err?.message || err);
        }
    }
}

/** DM reporter after approval (they lose proof channel/thread access). */
async function sendReporterReportApprovedDm(client, restock) {
    if (!client || !restock?.reported_by) return;
    try {
        const user = await client.users.fetch(restock.reported_by).catch(() => null);
        if (!user) return;

        const store = restock.store || 'the store you reported';
        await user.send({
            content:
                `**Congratulations — your restock report was approved.**\n\n` +
                `**Store:** ${store}\n` +
                `**Report ID:** \`${restock.id}\`\n\n` +
                `Your optional proof upload channel or thread has been closed. ` +
                `If moderators chose to include a proof photo, it may appear in this server’s **public restock alert** and discussion thread.`
        });
    } catch (err) {
        if (err?.code !== 50007) {
            console.warn('[DM] Could not send approval confirmation to reporter:', err?.message || err);
        }
    }
}

/** Delete moderator review thread (and bridge message on private path) before proof channel / legacy cleanup. */
async function cleanupModeratorReviewArtifacts(client, restock) {
    if (!client || !restock) return;
    const reviewId = restock.approval_review_thread_id;
    const bridgeMsgId = restock.approval_review_bridge_message_id;
    const parentChId = restock.approval_review_bridge_channel_id || restock.approval_source_channel_id;

    if (reviewId) {
        try {
            const th = await client.channels.fetch(reviewId).catch(() => null);
            if (th?.deletable) {
                await th.delete(`Restock proof resolved (${restock.id})`).catch(() => {});
                console.log(`[PHOTO_PROOF] Deleted moderator review thread for report ${restock.id}`);
            }
        } catch (err) {
            console.warn(
                `[PHOTO_PROOF] Could not delete moderator review thread (report ${restock?.id}):`,
                err.message || err
            );
        }
    }

    if (bridgeMsgId && parentChId) {
        try {
            const ch = await client.channels.fetch(parentChId).catch(() => null);
            if (ch?.messages?.delete) {
                await ch.messages.delete(bridgeMsgId).catch(() => {});
            }
        } catch (err) {
            console.warn(
                `[PHOTO_PROOF] Could not delete review bridge message (report ${restock?.id}):`,
                err.message || err
            );
        }
    }
}

/** Private thread under the approval message (legacy / fallback). */
async function createApprovalProofPrivateThread(approvalMessage, restock) {
    if (!approvalMessage || !restock?.reported_by) return null;

    try {
        console.log(`[PHOTO_PROOF] Creating private proof thread for report ${restock.id}`);
        const thread = await approvalMessage.startThread({
            name: proofThreadName(restock.store),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
            type: ChannelType.PrivateThread,
            invitable: true,
            reason: `Optional proof photo thread for restock report ${restock.id}`
        });

        restock.approval_thread_id = thread.id;
        await dataManager.saveData();
        console.log(`[PHOTO_PROOF] Private proof thread created for report ${restock.id}`);

        await approvalMessage.guild?.members.fetch({ user: restock.reported_by }).catch(() => null);

        let reporterInThread = false;
        try {
            console.log(`[PHOTO_PROOF] Adding reporter to proof thread for report ${restock.id}`);
            await thread.members.add(restock.reported_by);
            reporterInThread = true;
            console.log(`[PHOTO_PROOF] Reporter added to proof thread for report ${restock.id}`);
        } catch (addErr) {
            const code = addErr?.code;
            const msg = addErr?.message || addErr;
            console.warn(`[PHOTO_PROOF] Could not add reporter to proof thread for report ${restock.id}:`, msg);
            if (code === 50001 || String(msg).toLowerCase().includes('missing access')) {
                console.warn(
                    '[PHOTO_PROOF] Fix: On the **approvals parent channel**, grant the bot role: View Channel, Send Messages, Send Messages in Threads, and **Manage Threads** (required to add members to private threads).'
                );
            }

            const granted = await grantReporterTempApprovalsAccessRoleIfConfigured(approvalMessage.guild, restock);
            if (granted) {
                try {
                    await thread.members.add(restock.reported_by);
                    reporterInThread = true;
                    console.log(`[PHOTO_PROOF] Reporter added to proof thread after temp access role (report ${restock.id})`);
                } catch (retryErr) {
                    console.warn(
                        `[PHOTO_PROOF] Still could not add reporter after temp role for report ${restock.id}:`,
                        retryErr.message || retryErr
                    );
                }
            }

            if (!reporterInThread) {
                const region = String(restock.region || 'va').toLowerCase() === 'md' ? 'md' : 'va';
                try {
                    const modMention = await getAdminMentions(region);
                    if (modMention) {
                        await thread.send({
                            content:
                                `${modMention}\n\nThe bot could not **auto-add** the reporter to this private proof thread (often **Manage Threads** missing for the bot on this channel).\n\n` +
                                `Please **manually add** <@${restock.reported_by}> (thread menu → *Add to thread*).\n` +
                                `Report ID: \`${restock.id}\``
                        });
                    }
                } catch (pingErr) {
                    console.warn('[PHOTO_PROOF] Could not post moderator notice in proof thread:', pingErr.message || pingErr);
                }

                try {
                    const user = await approvalMessage.client.users.fetch(restock.reported_by).catch(() => null);
                    if (user) {
                        const threadUrl = `https://discord.com/channels/${approvalMessage.guildId}/${thread.id}`;
                        await user.send({
                            content:
                                '**Optional proof photo (private thread)**\n\n' +
                                'A private thread was created for your pending restock report, but the bot could not add you automatically (approvals channel permissions).\n\n' +
                                `**Thread link:** ${threadUrl}\n\n` +
                                'If the link does not open, wait for a moderator to add you, or ask in your server’s help channel.'
                        });
                    }
                } catch (_) {
                    /* DMs closed — non-fatal */
                }
            }
        }

        await thread.send(
            `<@${restock.reported_by}> Please upload a clear photo of the restock here. ` +
                'This is optional, but helps moderators verify the report before approval. ' +
                'If the report is approved, the photo may be shared in the public alert thread.'
        );

        try {
            const region = String(restock.region || 'va').toLowerCase() === 'md' ? 'md' : 'va';
            const modMention = await getAdminMentions(region);
            const pingRoleIds = getApprovalPingRoleIds(region);

            const bridge = await approvalMessage.reply({
                content:
                    `${modMention}\n📋 **Proof review** for report \`${restock.id}\` — use the **thread** on this message for mirrored uploads.\n**Reporter private proof:** <#${thread.id}>`,
                allowedMentions: pingRoleIds.length ? { roles: pingRoleIds } : {}
            });
            const reviewThread = await bridge.startThread({
                name: `Review • ${restock.id}`.slice(0, 100),
                autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
                reason: `Moderator proof review for ${restock.id}`
            });
            restock.approval_review_thread_id = reviewThread.id;
            restock.approval_review_bridge_message_id = bridge.id;
            restock.approval_review_bridge_channel_id = approvalMessage.channelId;
            await dataManager.saveData();

            await reviewThread.send({
                content:
                    `**Moderator thread:** ${reviewThread.url}\n**Reporter private proof:** <#${thread.id}>\nImages the reporter uploads will be **mirrored** here. If approved, the photo can be sent with the public alert (when using Approve With Photo).`
            });
        } catch (modThreadErr) {
            console.warn(
                '[PHOTO_PROOF] Could not create moderator review thread (private path):',
                modThreadErr.message || modThreadErr
            );
        }

        return thread;
    } catch (err) {
        console.warn(`[PHOTO_PROOF] Could not create proof photo thread for report ${restock.id}:`, err.message || err);
        return null;
    }
}

/**
 * Dedicated text channel under `channels.restockProofUploadCategoryId` — reporter + mods + bot only.
 * Edits the approval message embed to link <#channel>.
 */
async function createApprovalProofChannel(approvalMessage, restock, categoryId) {
    const guild = approvalMessage.guild;
    if (!guild || !restock?.reported_by) return null;

    const parent = await guild.channels.fetch(categoryId).catch(() => null);
    if (!parent || parent.type !== ChannelType.GuildCategory) {
        console.warn('[PHOTO_PROOF] restockProofUploadCategoryId invalid or not a category; falling back to private thread.');
        return createApprovalProofPrivateThread(approvalMessage, restock);
    }

    const config = require('../../config/config.json');
    const region = String(restock.region || 'va').toLowerCase() === 'md' ? 'md' : 'va';
    const approvalRoleId = String(
        region === 'md' ? config.roles?.restockApprovalMD || '' : config.roles?.restockApprovalVA || ''
    ).trim();
    const adminRoleId = String(config.roles?.admin || '').trim();

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: restock.reported_by,
            type: OverwriteType.Member,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        {
            id: approvalMessage.client.user.id,
            type: OverwriteType.Member,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ReadMessageHistory
            ]
        }
    ];

    const pushRole = (rid) => {
        if (!rid) return;
        if (overwrites.some((o) => String(o.id) === String(rid))) return;
        overwrites.push({
            id: rid,
            type: OverwriteType.Role,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ManageMessages
            ]
        });
    };
    pushRole(approvalRoleId);
    if (adminRoleId && adminRoleId !== approvalRoleId) {
        pushRole(adminRoleId);
    }

    const rawName = `proof-${restock.id}`;
    const name =
        rawName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 100) || 'proof-upload';

    try {
        console.log(`[PHOTO_PROOF] Creating proof upload text channel for report ${restock.id}`);
        const channel = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: parent.id,
            permissionOverwrites: overwrites,
            reason: `Proof upload for restock report ${restock.id}`
        });

        restock.approval_proof_channel_id = channel.id;
        restock.approval_message_id = approvalMessage.id;
        restock.approval_source_channel_id = approvalMessage.channelId;

        let reviewThread = null;
        try {
            reviewThread = await approvalMessage.startThread({
                name: `Review • ${restock.id}`.slice(0, 100),
                autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
                type: ChannelType.PublicThread,
                reason: `Moderator proof review for ${restock.id}`
            });
            restock.approval_review_thread_id = reviewThread.id;
        } catch (rtErr) {
            console.warn('[PHOTO_PROOF] Could not create moderator review thread:', rtErr.message || rtErr);
        }

        await dataManager.saveData();

        try {
            if (approvalMessage.embeds?.[0]) {
                const embed = EmbedBuilder.from(approvalMessage.embeds[0]);
                const fields = [...(embed.data.fields || [])];
                const dup = fields.findIndex((f) => String(f.name || '').toLowerCase().includes('proof upload'));
                const proofField = {
                    name: '📷 Proof upload',
                    value: `Reporter: <@${restock.reported_by}>\nOptional photo: <#${channel.id}>${reviewThread ? `\n**Moderator review:** <#${reviewThread.id}>` : ''}`,
                    inline: false
                };
                if (dup >= 0) fields[dup] = proofField;
                else fields.push(proofField);
                embed.setFields(fields);
                await approvalMessage.edit({ embeds: [embed], components: approvalMessage.components });
            } else {
                await approvalMessage.reply({
                    content: `📷 **Proof upload** (report \`${restock.id}\`): <#${channel.id}>${reviewThread ? ` · **Mod review:** <#${reviewThread.id}>` : ''}`,
                    allowedMentions: { users: [restock.reported_by] }
                });
            }
        } catch (editErr) {
            console.warn('[PHOTO_PROOF] Could not add proof link to approval message:', editErr.message || editErr);
        }

        await channel.send(
            `<@${restock.reported_by}> Upload an optional **clear photo** of the restock here.\n` +
                'Moderators will see it when reviewing your pending report. If the report is approved, the photo may be shared in the public alert thread.'
        );

        if (reviewThread) {
            try {
                const modMention = await getAdminMentions(region);
                const pingRoleIds = getApprovalPingRoleIds(region);
                await reviewThread.send({
                    content:
                        `${modMention}\n**Reporter photo upload:** <#${channel.id}>\n**This moderator thread:** ${reviewThread.url}\nWhen the reporter uploads a proof image, the bot will **mirror** it here. If the report is approved, use **Approve With Photo** to include it in the public alert.`,
                    allowedMentions: pingRoleIds.length ? { roles: pingRoleIds } : {}
                });
            } catch (introErr) {
                console.warn('[PHOTO_PROOF] Could not post moderator review thread intro:', introErr.message || introErr);
            }
        }

        console.log(`[PHOTO_PROOF] Proof upload channel ${channel.id} created for report ${restock.id}`);
        return channel;
    } catch (err) {
        console.warn(`[PHOTO_PROOF] Could not create proof channel for report ${restock.id}:`, err.message || err);
        return createApprovalProofPrivateThread(approvalMessage, restock);
    }
}

/** When `restockProofUploadCategoryId` is set, creates a private proof channel; otherwise a private thread on the approval message. */
async function createApprovalProofThread(approvalMessage, restock) {
    const config = require('../../config/config.json');
    const categoryId = String(config.channels?.restockProofUploadCategoryId || '').trim();
    const result = categoryId
        ? await createApprovalProofChannel(approvalMessage, restock, categoryId)
        : await createApprovalProofPrivateThread(approvalMessage, restock);

    await sendReporterReportSubmittedDm(approvalMessage.client, {
        guildId: approvalMessage.guildId,
        restock
    });
    return result;
}

async function updateApprovalPhotoStatus(client, restock, statusText, legacyThreadChannel = null) {
    if (client && restock?.approval_message_id && restock?.approval_source_channel_id) {
        try {
            const ch = await client.channels.fetch(restock.approval_source_channel_id).catch(() => null);
            if (ch?.isTextBased?.()) {
                const msg = await ch.messages.fetch(restock.approval_message_id).catch(() => null);
                if (msg?.embeds?.[0]) {
                    const embed = EmbedBuilder.from(msg.embeds[0]);
                    const fields = embed.data.fields || [];
                    const idx = fields.findIndex((field) => String(field.name || '').includes('Photo'));
                    if (idx >= 0) fields[idx] = { ...fields[idx], value: statusText };
                    else fields.push({ name: '📷 Photo', value: statusText, inline: true });
                    embed.setFields(fields);
                    await msg.edit({ embeds: [embed], components: msg.components });
                    return;
                }
            }
        } catch (err) {
            console.warn('[proof-photo] Could not update approval embed for photo status:', err.message || err);
        }
    }

    if (legacyThreadChannel?.isThread?.()) {
        try {
            const starter = await legacyThreadChannel.fetchStarterMessage().catch(() => null);
            if (!starter?.embeds?.length) return;

            const embed = EmbedBuilder.from(starter.embeds[0]);
            const fields = embed.data.fields || [];
            const idx = fields.findIndex((field) => String(field.name || '').includes('Photo'));
            if (idx >= 0) fields[idx] = { ...fields[idx], value: statusText };
            else fields.push({ name: '📷 Photo', value: statusText, inline: true });
            embed.setFields(fields);

            await starter.edit({ embeds: [embed], components: starter.components });
        } catch (err) {
            console.warn('[proof-photo] Could not update approval photo status (thread):', err.message || err);
        }
    }
}

async function handleProofPhotoMessage(message) {
    if (message.author?.bot) return false;
    const ch = message.channel;
    if (!ch) return false;

    const isThread = typeof ch.isThread === 'function' && ch.isThread();
    const isGuildTextProof =
        ch.type === ChannelType.GuildText &&
        typeof ch.isTextBased === 'function' &&
        ch.isTextBased();

    let restock;
    if (isThread) {
        restock = dataManager.getRestocks().find(
            (r) => r.status === 'pending' && r.approval_thread_id === ch.id
        );
    } else if (isGuildTextProof) {
        restock = dataManager.getRestocks().find(
            (r) => r.status === 'pending' && r.approval_proof_channel_id === ch.id
        );
    } else {
        return false;
    }

    if (!restock) return false;
    if (String(message.author.id) !== String(restock.reported_by)) return true;

    const where = isThread ? 'thread' : 'proof channel';
    console.log(`[PHOTO_PROOF] Checking proof upload in ${where} for report ${restock.id}`);
    const photo = imageAttachmentFromMessage(message);
    if (!photo) {
        console.log(`[PHOTO_PROOF] No supported image found for report ${restock.id}`);
        return true;
    }

    restock.photo_url = photo.url;
    restock.photo_message_id = message.id;
    restock.photo_uploaded_by = message.author.id;
    await dataManager.saveData();
    console.log(`[PHOTO_PROOF] Photo attached to pending report ${restock.id}`);

    await message.reply('Photo received and attached to this pending report.').catch(() => {});
    await updateApprovalPhotoStatus(message.client, restock, 'Submitted', isThread ? ch : null);
    await forwardProofPhotoToModeratorReviewThread(message.client, restock);
    return true;
}

async function postProofPhotoToAlertThread(thread, restock) {
    if (!thread || !restock?.photo_url) return;
    try {
        console.log(`[PHOTO_PROOF] Forwarding proof photo to public alert thread for report ${restock.id}`);
        // Use embed image so Discord does not show the attachment filename link (raw URL in content unfurls that way).
        const proofEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setDescription('Photo submitted with this report.')
            .setImage(restock.photo_url);
        await thread.send({ embeds: [proofEmbed] });
        console.log(`[PHOTO_PROOF] Proof photo forwarded for report ${restock.id}`);
    } catch (err) {
        console.warn(`[PHOTO_PROOF] Could not forward proof photo for report ${restock.id}:`, err.message || err);
    }
}

/**
 * After approval/reject: delete dedicated proof channel if present, else remove reporter from private proof thread.
 */
async function removeReporterFromProofThread(client, restock) {
    await cleanupModeratorReviewArtifacts(client, restock);

    const proofChannelId = restock?.approval_proof_channel_id;
    if (client && proofChannelId) {
        try {
            const channel = await client.channels.fetch(proofChannelId).catch(() => null);
            if (channel?.deletable) {
                await channel.delete(`Restock proof resolved (${restock.id})`);
                console.log(`[PHOTO_PROOF] Deleted proof upload channel for report ${restock.id}`);
            }
        } catch (err) {
            console.warn(
                `[PHOTO_PROOF] Could not delete proof upload channel (report ${restock?.id}):`,
                err.message || err
            );
        }
        return;
    }

    const threadId = restock?.approval_thread_id;
    const userId = restock?.reported_by;
    if (!client || !threadId || !userId) return;
    try {
        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread?.isThread?.()) return;
        try {
            await thread.members.remove(String(userId));
            console.log(`[PHOTO_PROOF] Removed reporter from proof thread for report ${restock.id}`);
        } catch (err) {
            console.warn(
                `[PHOTO_PROOF] Could not remove reporter from proof thread (report ${restock.id}):`,
                err.message || err
            );
        }
    } catch (err) {
        console.warn(`[PHOTO_PROOF] removeReporterFromProofThread failed for report ${restock?.id}:`, err.message || err);
    }
}

/**
 * Get admin role mentions for approval notifications
 * @param {string} region - 'va' or 'md' to determine which approval role to mention
 */
async function getAdminMentions(region = 'va') {
    try {
        const config = require('../../config/config.json');
        
        // Use region-specific approval role
        const roleId = region === 'md' 
            ? config.roles.restockApprovalMD 
            : config.roles.restockApprovalVA;
        
        if (roleId) {
            return `<@&${roleId}>`;
        }
        
        // Fallback to admin role if approval role not set
        if (config.roles.admin) {
            return `<@&${config.roles.admin}>`;
        }
        
        return '';
    } catch (error) {
        console.error('Error getting admin mentions:', error);
        return '';
    }
}

async function handleApprovalButton(interaction) {
    try {
        const { customId } = interaction;
        const parsed = parseApprovalButtonCustomId(customId);
        if (!parsed) {
            console.error('❌ Unknown customId format:', customId);
            return await interaction.reply({
                content: '❌ Invalid button action.',
                ephemeral: true
            });
        }
        if (parsed.kind === 'approve_modal') {
            return await interaction.reply({
                content: '❌ Invalid approval action.',
                ephemeral: true
            });
        }

        const { restockId, kind } = parsed;
        const isApproved = kind === 'approve';

        console.log('🔍 Looking for restock with ID:', restockId);
        console.log('🔍 CustomId:', customId);
        console.log('🔍 Is approved:', isApproved);

        // Get the restock report
        let restocks = dataManager.getRestocks();
        console.log('📋 Total restocks in database:', restocks.length);
        console.log('📋 Restock IDs:', restocks.map(r => r.id));

        let restock = restocks.find(r => r.id === restockId);
        if (!restock) {
            // Fallback: reload from disk in case memory is stale
            await dataManager.reload();
            restocks = dataManager.getRestocks();
            restock = restocks.find(r => r.id === restockId);
        }

        if (!restock) {
            console.log('❌ Restock not found!');
            return await interaction.reply({
                content: '❌ Restock report not found.',
                ephemeral: true
            });
        }

        console.log('✅ Found restock:', restock);

        // Prevent multiple approvals/rejections
        if (restock.status && restock.status !== 'pending') {
            return await interaction.reply({
                content: `⚠️ This report was already ${restock.status}.`,
                ephemeral: true
            });
        }

        // Update the restock status
        restock.status = isApproved ? 'approved' : 'rejected';
        restock.reviewed_by = interaction.user.id;
        restock.reviewed_at = new Date().toISOString();

        // Save the updated data
        await dataManager.saveData();

        // Update the original embed
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setColor(isApproved ? 0x00FF00 : 0xFF0000); // Green for approved, Red for rejected
        embed.setTitle(`🛍️ Restock Report - ${isApproved ? 'Approved' : 'Rejected'}`);
        embed.setDescription(`This restock report has been ${isApproved ? 'approved' : 'rejected'}.`);
        embed.addFields({
            name: `👤 ${isApproved ? 'Approved' : 'Rejected'} By`,
            value: interaction.user.username,
            inline: true
        });

        const disabledRows = buildApprovalButtonRows(restockId, { disabled: true });

        // Update the message (with timeout handling)
        try {
            // Check if interaction was already replied/deferred
            if (interaction.replied || interaction.deferred) {
                console.log('⚠️ Interaction already replied/deferred, using editReply instead');
                await interaction.editReply({
                    embeds: [embed],
                    components: disabledRows
                });
            } else {
                await interaction.update({
                    embeds: [embed],
                    components: disabledRows
                });
            }
        } catch (error) {
            if (error.code === 10062 || error.code === 40060) {
                console.log('⏱️ Button interaction timed out, continuing anyway...');
                // Try to edit the message directly if update fails
                try {
                    if (interaction.message && interaction.message.editable) {
                        await interaction.message.edit({
                            embeds: [embed],
                            components: disabledRows
                        });
                    }
                } catch (editError) {
                    console.error('❌ Could not edit message after timeout:', editError);
                }
            } else {
                console.error('❌ Error updating interaction:', error);
                // Try to reply if update fails
                if (!interaction.replied && !interaction.deferred) {
                    try {
                        await interaction.reply({
                            content: `✅ Restock ${isApproved ? 'approved' : 'rejected'} successfully!`,
                            ephemeral: true
                        });
                    } catch (replyError) {
                        console.error('❌ Could not reply either:', replyError);
                    }
                }
            }
        }

        // If approved, check if this is a past restock (no alert) or regular restock (send alert)
        if (isApproved) {
            // Log admin action
            try {
                await interactionLogger.logAdminAction(interaction.client, {
                    admin: `${interaction.user.tag} (${interaction.user.id})`,
                    action: 'Approve Restock',
                    details: `Restock ID: ${restockId}\nStore: ${restock.store}\nType: ${restock.is_past_restock ? 'Past' : restock.is_upcoming_restock ? 'Upcoming' : 'In Progress'}`
                });
            } catch (logError) {
                console.error('❌ Error logging admin action:', logError);
            }

            if (restock.is_past_restock || restock.is_upcoming_restock) {
                // Past/Upcoming restock - just log it, no alert
                const type = restock.is_past_restock ? 'Past' : 'Upcoming';
                console.log(`📋 ${type} restock approved, logging only (no alert)...`);
                await handleApprovedRegularRestock(restock);
                await removeReporterFromProofThread(interaction.client, restock);
                await revokeReporterTemporaryApprovalsAccess(interaction.client, restock);
                if (removeProofPhotoMetadata(restock)) await dataManager.saveData();
                await sendReporterReportApprovedDm(interaction.client, restock);
                // Past/Upcoming restocks don't trigger store cooldowns
            } else {
                // Regular restock - send alert
                console.log('✅ Restock approved, sending public alert...');
                const hadProofPhoto = !!restock.photo_url;
                const forwardProofPhoto = parsed.forwardProofPhoto === true;
                await handleApprovedRestock(restock, interaction.client, { forwardProofPhoto });
                if (parsed.forwardProofPhoto === true && !hadProofPhoto) {
                    try {
                        await interaction.followUp({
                            content: 'No proof photo was on file. The alert was posted without a photo link.',
                            ephemeral: true
                        });
                    } catch (_) {
                        /* non-fatal */
                    }
                }

                // Add 36-hour store cooldown after approval
                const now = new Date();
                const storeCooldown = {
                    store: restock.store,
                    expires_at: new Date(now.getTime() + (36 * 60 * 60 * 1000)).toISOString(), // 36 hours (1.5 days)
                    created_at: now.toISOString()
                    // Note: No user_id means this is a store-wide cooldown
                };
                await dataManager.addCooldown(storeCooldown);
                console.log(`⏰ Added 36-hour store cooldown for ${restock.store}`);
                await removeReporterFromProofThread(interaction.client, restock);
                await revokeReporterTemporaryApprovalsAccess(interaction.client, restock);
                if (removeProofPhotoMetadata(restock)) await dataManager.saveData();
                await sendReporterReportApprovedDm(interaction.client, restock);
            }
        } else {
            // Log admin action for rejection
            try {
                await interactionLogger.logAdminAction(interaction.client, {
                    admin: `${interaction.user.tag} (${interaction.user.id})`,
                    action: 'Reject Restock',
                    details: `Restock ID: ${restockId}\nStore: ${restock.store}`
                });
            } catch (logError) {
                console.error('❌ Error logging admin action:', logError);
            }

            // If rejected, remove the user's cooldown so they can report again immediately
            // since the rejection means the store could still restock
            const cooldowns = dataManager.getCooldowns();
            const userCooldownIndex = cooldowns.findIndex(c => 
                c.user_id === restock.reported_by && 
                c.store === restock.store
            );
            
            if (userCooldownIndex !== -1) {
                cooldowns.splice(userCooldownIndex, 1);
                await dataManager.saveData();
                console.log(`🔄 Removed user cooldown for ${restock.reported_by_username} on ${restock.store} after rejection`);
            }
            await removeReporterFromProofThread(interaction.client, restock);
            await revokeReporterTemporaryApprovalsAccess(interaction.client, restock);
            if (removeProofPhotoMetadata(restock)) await dataManager.saveData();
        }

    } catch (error) {
        console.error('❌ Error handling approval button:', error);
        
        // Handle timeout errors gracefully
        if (error.code === 10062 || error.code === 40060) {
            console.log('⏱️ Interaction timed out, but approval was processed');
            return;
        }
        
        // Only try to reply if interaction hasn't been acknowledged
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: '❌ There was an error processing this approval.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.log('Could not send error message (interaction timed out)');
            }
        }
    }
}

async function handleApprovedRestock(restock, client, options = {}) {
    try {
        console.log('🔔 Processing in-progress restock alert...');
        console.log('📊 Restock data:', JSON.stringify(restock, null, 2));
        
        // Update last restock for this store
        const lastRestockData = {
            store: restock.store,
            last_restock_date: restock.date,
            last_restock_item: restock.item,
            week_start: restock.week_start
        };
        await dataManager.updateLastRestock(restock.store, lastRestockData);

        // Send to public channel (determine VA or MD based on region field or store location)
        const config = require('../../config/config.json');
        
        // Use region field if available, otherwise fall back to parsing store string
        let isMDStore = false;
        let isVAStore = false;
        
        if (restock.region) {
            // Use stored region field (preferred method)
            isMDStore = restock.region.toLowerCase() === 'md';
            isVAStore = restock.region.toLowerCase() === 'va';
        } else {
            // Fallback: parse from store string for backwards compatibility
            isMDStore = restock.store.includes(', MD');
            isVAStore = restock.store.includes(', VA');
        }
        
        const useNewlook = restock.newlook_alerts === true;
        let publicChannelId;
        if (useNewlook) {
            publicChannelId = isMDStore
                ? config.channels.newlookMdRestockAlert
                : config.channels.newlookVaRestockAlert;
            if (!publicChannelId || publicChannelId.trim() === '') {
                publicChannelId = isMDStore ? config.channels.localRestockMD : config.channels.localRestockVA;
            }
        } else {
            publicChannelId = isMDStore ? config.channels.localRestockMD : config.channels.localRestockVA;
        }
        const roleId = isMDStore ? config.roles.localRestockMD : config.roles.localRestockVA;
        const region = isMDStore ? 'Maryland' : 'Virginia';
        
        console.log('🌎 Detected region:', region);
        console.log('📡 Public channel ID:', publicChannelId);
        console.log('🎭 Role ID:', roleId);

        if (publicChannelId && publicChannelId.trim() !== '') {
            const publicChannel = client.channels.cache.get(publicChannelId);
            console.log('📺 Channel found:', publicChannel ? 'YES' : 'NO');
            
            if (publicChannel) {
                // Parse store name and address from restock.store
                // Format: "Target - Store Name - Address"
                let storeName = restock.store;
                let address = '';
                
                const lastDashIndex = restock.store.lastIndexOf(' - ');
                if (lastDashIndex !== -1) {
                    storeName = restock.store.substring(0, lastDashIndex);
                    address = restock.store.substring(lastDashIndex + 3); // +3 to skip " - "
                }
                
                const initialCrowdSummary = restock.line_estimate
                    ? crowdTracker.initialSummaryFromEstimate(restock.line_estimate)
                    : null;

                const publicEmbed = new EmbedBuilder()
                    .setColor(initialCrowdSummary ? crowdTracker.ESTIMATES[initialCrowdSummary.status].color : 0x00FF00) // Green
                    .setDescription(`A restock has been confirmed at **${storeName}**!`)
                    .setTitle(`🛍️ Restock Alert! (${region})`)
                    .addFields(
                        { name: '🏪 Store', value: storeName, inline: true },
                        { name: '📅 Date', value: `<t:${Math.floor(new Date(restock.date).getTime() / 1000)}:F>`, inline: true }
                    );

                if (initialCrowdSummary) {
                    crowdTracker.applyCrowdField(publicEmbed, initialCrowdSummary);
                }

                // Add address field if it exists
                if (address && address.trim().length > 0) {
                    publicEmbed.addFields({ name: '📍 Address', value: address, inline: false });
                }

                const moderatorNote = restock.review_note || restock.notes;
                if (moderatorNote && moderatorNote.trim().length > 0) {
                    publicEmbed.addFields({ name: '📝 Note', value: moderatorNote, inline: false });
                }

                // Tag the appropriate role if configured
                let roleMention = '';
                if (roleId && roleId.length > 10) {
                    // Verify role exists in the guild before mentioning
                    try {
                        const guild = publicChannel.guild;
                        const role = guild.roles.cache.get(roleId);
                        if (role) {
                            roleMention = `<@&${roleId}>`;
                            console.log('✅ Role found:', role.name);
                        } else {
                            console.log(`⚠️ Role ${roleId} not found in guild. Bot may need to restart or role doesn't exist.`);
                            // Still try to mention it - Discord will show "unknown role" if it doesn't exist
                            roleMention = `<@&${roleId}>`;
                        }
                    } catch (error) {
                        console.error('❌ Error checking role:', error);
                        // Fallback: just use the role ID
                        roleMention = `<@&${roleId}>`;
                    }
                }
                console.log('👥 Role mention:', roleMention);

                const alertMessage = await publicChannel.send({
                    content: roleMention ? `${roleMention} New ${region} restock alert!` : `New ${region} restock alert!`,
                    embeds: [publicEmbed]
                });

                try {
                    const { syncRestockAlertToSupabase } = require('./restockHistorySync');
                    await syncRestockAlertToSupabase(alertMessage, restock, {
                        regionLetter: isMDStore ? 'MD' : 'VA',
                        location: address && address.trim().length > 0 ? address.trim() : null
                    });
                } catch (syncErr) {
                    console.warn('[restock_history] Sync error (non-fatal):', syncErr.message || syncErr);
                }

                const threadTitle = `🛍️ Restock Alert! (${region})`.slice(0, 100);
                let alertThread = null;
                try {
                    alertThread = await alertMessage.startThread({
                        name: threadTitle,
                        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay
                    });
                    console.log(`✅ Discussion thread "${threadTitle}" created for alert message`);
                } catch (threadErr) {
                    console.error('⚠️ Could not create thread on alert (missing permissions or channel type):', threadErr.message || threadErr);
                }

                if (alertThread && restock.line_estimate) {
                    try {
                        await crowdTracker.createTrackerForAlert({
                            client,
                            alertMessage,
                            thread: alertThread,
                            restock,
                            storeName,
                            address,
                            region
                        });
                    } catch (crowdErr) {
                        console.error('⚠️ Could not create live crowd tracker:', crowdErr.message || crowdErr);
                    }
                }

                const forwardProofPhoto = options.forwardProofPhoto !== false;
                if (alertThread && restock.photo_url && forwardProofPhoto) {
                    await postProofPhotoToAlertThread(alertThread, restock);
                }

                console.log(`✅ Public alert sent successfully to ${region} channel!`);
            } else {
                console.log('❌ Public channel not found in cache. Channel ID may be incorrect.');
            }
        } else {
            console.log('❌ Invalid public channel ID');
        }

    } catch (error) {
        console.error('❌ Error handling approved restock:', error);
    }
}

async function handleApprovedRegularRestock(restock) {
    try {
        // Update last restock for this store (no public alert)
        const lastRestockData = {
            store: restock.store,
            last_restock_date: restock.date,
            last_restock_item: restock.item,
            week_start: restock.week_start
        };
        await dataManager.updateLastRestock(restock.store, lastRestockData);
        console.log(`✅ Regular restock logged for ${restock.store}`);
    } catch (error) {
        console.error('❌ Error handling regular restock:', error);
    }
}

// Approve with note: show modal (photo in alert or not, depending on button)
async function showApproveWithNoteModal(interaction) {
    try {
        const id = interaction.customId;
        let restockId;
        let forwardPhotoInAlert = true;
        if (id.startsWith(APR_PREFIX_PHOTO_NOTE)) {
            restockId = id.slice(APR_PREFIX_PHOTO_NOTE.length);
            forwardPhotoInAlert = true;
        } else if (id.startsWith(APR_PREFIX_NOPHOTO_NOTE)) {
            restockId = id.slice(APR_PREFIX_NOPHOTO_NOTE.length);
            forwardPhotoInAlert = false;
        } else if (id.startsWith('approve_note_')) {
            restockId = id.replace('approve_note_', '');
            forwardPhotoInAlert = true;
        } else {
            return await interaction.reply({ content: '❌ Invalid approval action.', ephemeral: true });
        }

        const modalCustomId = forwardPhotoInAlert
            ? `${NOTE_MODAL_PREFIX_PHOTO}${restockId}`
            : `${NOTE_MODAL_PREFIX_NOPHOTO}${restockId}`;

        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('Approve with moderator note');
        const noteInput = new TextInputBuilder()
            .setCustomId('moderator_note')
            .setLabel('Moderator Note')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);
        const row = new ActionRowBuilder().addComponents(noteInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
    } catch (error) {
        if (error.code === 10062) {
            // Interaction expired due to rapid switching or delay - ignore gracefully
            console.log('⏱️ approve_note interaction expired before showModal');
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'This approval interaction expired. Please open the approval message and try again.', ephemeral: true });
                }
            } catch (_) {}
            return;
        }
        console.error('❌ Error showing Approve + Note modal:', error);
    }
}

// Handle modal submission
async function handleApproveWithNoteSubmit(interaction) {
    try {
        const parsedModal = parseApproveNoteModalCustomId(interaction.customId);
        if (!parsedModal) {
            return await interaction.reply({ content: '❌ Invalid modal submission.', ephemeral: true });
        }
        const { restockId, forwardProofPhoto } = parsedModal;
        const note = interaction.fields.getTextInputValue('moderator_note');
        const restocks = dataManager.getRestocks();
        const restock = restocks.find(r => r.id === restockId);
        if (!restock) {
            return await interaction.reply({ content: '❌ Restock report not found.', ephemeral: true });
        }

        if (restock.status && restock.status !== 'pending') {
            return await interaction.reply({ content: `⚠️ This report was already ${restock.status}.`, ephemeral: true });
        }

        const hadProofPhoto = !!restock.photo_url;

        restock.status = 'approved';
        restock.reviewed_by = interaction.user.id;
        restock.reviewed_at = new Date().toISOString();
        restock.review_note = note;
        await dataManager.saveData();

        // Try to disable original buttons via message reference if available; otherwise skip
        try {
            const message = await interaction.channel?.messages?.fetch(interaction.message?.id || '');
            if (message && message.edit) {
                const embed = message.embeds?.[0] ? EmbedBuilder.from(message.embeds[0]) : null;
                if (embed) {
                    embed.setColor(0x00ff00);
                    embed.setTitle('🛍️ Restock Report - Approved');
                    embed.addFields({ name: '📝 Moderator Note', value: note, inline: false });
                }
                const disabledRows = buildApprovalButtonRows(restockId, { disabled: true });
                await message.edit({ embeds: embed ? [embed] : message.embeds, components: disabledRows });
            }
        } catch (_) {
            // Non-fatal
        }

        // Always send public alert for regular restocks
        // Check if this is a past restock (no alert) or regular restock (send alert)
        if (restock.is_past_restock) {
            // Past restock - just log it, no alert
            console.log('📋 Past restock approved, logging only (no alert)...');
            await handleApprovedRegularRestock(restock);
            await removeReporterFromProofThread(interaction.client, restock);
            await revokeReporterTemporaryApprovalsAccess(interaction.client, restock);
            if (removeProofPhotoMetadata(restock)) await dataManager.saveData();
            await sendReporterReportApprovedDm(interaction.client, restock);
            // Past restocks don't trigger store cooldowns
        } else {
            // Regular restock - send alert
            await handleApprovedRestock(restock, interaction.client, { forwardProofPhoto });

            // Add 36-hour store cooldown after approval
            const now = new Date();
            const storeCooldown = {
                store: restock.store,
                expires_at: new Date(now.getTime() + (36 * 60 * 60 * 1000)).toISOString(), // 36 hours (1.5 days)
                created_at: now.toISOString()
                // Note: No user_id means this is a store-wide cooldown
            };
            await dataManager.addCooldown(storeCooldown);
            console.log(`⏰ Added 36-hour store cooldown for ${restock.store}`);
            await removeReporterFromProofThread(interaction.client, restock);
            await revokeReporterTemporaryApprovalsAccess(interaction.client, restock);
            if (removeProofPhotoMetadata(restock)) await dataManager.saveData();
            await sendReporterReportApprovedDm(interaction.client, restock);
        }

        let replyMsg = '✅ Approved with note.';
        if (!restock.is_past_restock && forwardProofPhoto === true && !hadProofPhoto) {
            replyMsg += '\n\nNo proof photo was on file. The alert was posted without a photo link.';
        }
        if (!interaction.replied) {
            await interaction.reply({ content: replyMsg, ephemeral: true });
        }
    } catch (err) {
        console.error('❌ Error handling approve with note submit:', err);
        if (!interaction.replied) {
            await interaction.reply({ content: '❌ Error approving with note.', ephemeral: true });
        }
    }
}

module.exports = {
    handleApprovalButton,
    showApproveWithNoteModal,
    handleApproveWithNoteSubmit,
    getAdminMentions,
    createApprovalProofThread,
    handleProofPhotoMessage,
    buildApprovalButtonRows,
    sendReporterReportSubmittedDm,
    sendReporterReportApprovedDm
};