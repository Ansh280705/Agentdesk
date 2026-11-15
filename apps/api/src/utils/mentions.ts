/**
 * Shared mention resolution + inbox delivery.
 * Used by both channel messages and AI-conversation messages so tagging
 * works identically everywhere. Handles @handle, @all (Brain excluded —
 * it's not a workspace member).
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../database/pool';

export interface MentionRow { user_id: string; handle: string; name: string }
interface MemberRow { id: string; name: string; email: string }

function handleFor(m: MemberRow): string {
  const base = (m.name?.split(/\s+/)[0] || m.email.split('@')[0] || m.id.slice(0, 6)).toLowerCase();
  return base.replace(/[^a-z0-9_]/g, '') || m.id.slice(0, 6);
}

/** Resolve @handles + @all in `content` against workspace members (sender excluded). */
export async function resolveMentions(content: string, workspaceId: string, senderId: string): Promise<MentionRow[]> {
  const members = await query<MemberRow>(
    `SELECT u.id, u.name, u.email FROM users u
     JOIN workspace_members wm ON wm.user_id = u.id WHERE wm.workspace_id = $1`,
    [workspaceId]
  );

  const found = new Map<string, MentionRow>();
  for (const m of members) {
    if (m.id === senderId) continue;
    const handle = handleFor(m);
    if (new RegExp(`@${handle}\\b`, 'i').test(content)) {
      found.set(m.id, { user_id: m.id, handle, name: m.name });
    }
  }
  // @all → everyone in the workspace
  if (/@all\b/i.test(content)) {
    for (const m of members) {
      if (m.id !== senderId) found.set(m.id, { user_id: m.id, handle: handleFor(m), name: m.name });
    }
  }
  return Array.from(found.values());
}

/** Write mention inbox rows for a message (channel_id column holds any conversation id). */
export async function insertMentionRows(conversationId: string, messageId: string, mentions: MentionRow[]): Promise<void> {
  for (const m of mentions) {
    await query(
      `INSERT INTO message_mentions (id, message_id, channel_id, mentioned_user_id) VALUES ($1,$2,$3,$4)`,
      [uuidv4(), messageId, conversationId, m.user_id]
    );
  }
}
