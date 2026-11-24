-- 1. Fix user names so handles and avatars work properly
UPDATE users SET name = 'Ifrah Qureshi' WHERE email = 'ifrahqureshi27@gmail.com';
UPDATE users SET name = 'Eklavya Jangid' WHERE email = 'eklavya305@gmail.com';

-- 2. Redirect mentions from dummy local users to real users
UPDATE message_mentions
SET mentioned_user_id = (SELECT id FROM users WHERE email = 'ifrahqureshi27@gmail.com')
WHERE mentioned_user_id = (SELECT id FROM users WHERE email = 'ifrahqureshi@agentdesk.local');

UPDATE message_mentions
SET mentioned_user_id = (SELECT id FROM users WHERE email = 'eklavya305@gmail.com')
WHERE mentioned_user_id = (SELECT id FROM users WHERE email = 'eklavyajangid@agentdesk.local');

-- 3. Remove dummy users from workspace_members and channel_members
DELETE FROM channel_members
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE '%@agentdesk.local'
);

DELETE FROM workspace_members
WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE '%@agentdesk.local'
);

-- 4. Ensure anshrathore2807@gmail.com is in ansh.rathoer's Workspace (4aab8669-02a4-440e-b95c-b349f016c977)
INSERT INTO workspace_members (id, workspace_id, user_id, role)
SELECT gen_random_uuid(), '4aab8669-02a4-440e-b95c-b349f016c977', id, 'member'
FROM users WHERE email = 'anshrathore2807@gmail.com'
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- 5. Ensure all real team members are in all channels in ansh.rathoer's Workspace
INSERT INTO channel_members (id, conversation_id, user_id, role, last_read_at)
SELECT gen_random_uuid(), c.id, u.id, 'member', '1970-01-01'
FROM conversations c
CROSS JOIN users u
WHERE c.workspace_id = '4aab8669-02a4-440e-b95c-b349f016c977'
  AND c.kind = 'channel'
  AND u.email IN ('eklavya305@gmail.com', 'ifrahqureshi27@gmail.com', 'anshrathore028@gmail.com', 'anshrathore2807@gmail.com', 'anshrathore12@gmail.com', 'dishaasija315@gmail.com')
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- 6. Clean up testmate DM: remove Eklavya and Ifrah from old testmate DM
DELETE FROM channel_members
WHERE conversation_id = '01165626-4121-4a44-aeb5-8852aeb96d89'
  AND user_id IN (SELECT id FROM users WHERE email IN ('eklavya305@gmail.com', 'ifrahqureshi27@gmail.com'));

-- 7. Fix NULL user_id on recent user messages
UPDATE messages
SET user_id = (SELECT id FROM users WHERE email = 'anshrathore028@gmail.com')
WHERE user_id IS NULL AND role = 'user' AND conversation_id IN (
  '4daa1df3-285d-4c91-a00f-d21a74cd4158',
  '908440f1-6c6c-46bc-bf83-ac7a17c6ef51'
);

-- 8. Add mention rows for Ifrah on @ifrah messages if missing
INSERT INTO message_mentions (id, message_id, channel_id, mentioned_user_id, created_at)
SELECT gen_random_uuid(), m.id, m.conversation_id, u.id, m.created_at
FROM messages m
CROSS JOIN users u
WHERE u.email = 'ifrahqureshi27@gmail.com'
  AND m.content ILIKE '%@ifrah%'
  AND NOT EXISTS (
    SELECT 1 FROM message_mentions mm WHERE mm.message_id = m.id AND mm.mentioned_user_id = u.id
  );

-- 9. Add mention rows for Eklavya on @eklavya messages if missing
INSERT INTO message_mentions (id, message_id, channel_id, mentioned_user_id, created_at)
SELECT gen_random_uuid(), m.id, m.conversation_id, u.id, m.created_at
FROM messages m
CROSS JOIN users u
WHERE u.email = 'eklavya305@gmail.com'
  AND m.content ILIKE '%@eklavya%'
  AND NOT EXISTS (
    SELECT 1 FROM message_mentions mm WHERE mm.message_id = m.id AND mm.mentioned_user_id = u.id
  );

-- 10. Ensure DM channels exist between Ansh and Ifrah, Ansh and Eklavya, Eklavya and Ifrah
-- DM: Ansh <-> Ifrah
DO $$
DECLARE
  v_ansh_id UUID;
  v_ifrah_id UUID;
  v_eklavya_id UUID;
  v_ws_id UUID := '4aab8669-02a4-440e-b95c-b349f016c977';
  v_dm_ai UUID;
  v_dm_ae UUID;
  v_dm_ei UUID;
BEGIN
  SELECT id INTO v_ansh_id FROM users WHERE email = 'anshrathore028@gmail.com';
  SELECT id INTO v_ifrah_id FROM users WHERE email = 'ifrahqureshi27@gmail.com';
  SELECT id INTO v_eklavya_id FROM users WHERE email = 'eklavya305@gmail.com';

  -- Check or create Ansh <-> Ifrah DM
  SELECT c.id INTO v_dm_ai
  FROM conversations c
  WHERE c.workspace_id = v_ws_id AND c.kind = 'dm'
    AND EXISTS (SELECT 1 FROM channel_members a WHERE a.conversation_id = c.id AND a.user_id = v_ansh_id)
    AND EXISTS (SELECT 1 FROM channel_members b WHERE b.conversation_id = c.id AND b.user_id = v_ifrah_id);

  IF v_dm_ai IS NULL THEN
    v_dm_ai := gen_random_uuid();
    INSERT INTO conversations (id, workspace_id, user_id, title, kind, name, visibility, created_by)
    VALUES (v_dm_ai, v_ws_id, v_ansh_id, 'DM Ifrah Qureshi', 'dm', NULL, 'private', v_ansh_id);
    INSERT INTO channel_members (id, conversation_id, user_id)
    VALUES (gen_random_uuid(), v_dm_ai, v_ansh_id), (gen_random_uuid(), v_dm_ai, v_ifrah_id);
  END IF;

  -- Check or create Ansh <-> Eklavya DM
  SELECT c.id INTO v_dm_ae
  FROM conversations c
  WHERE c.workspace_id = v_ws_id AND c.kind = 'dm'
    AND EXISTS (SELECT 1 FROM channel_members a WHERE a.conversation_id = c.id AND a.user_id = v_ansh_id)
    AND EXISTS (SELECT 1 FROM channel_members b WHERE b.conversation_id = c.id AND b.user_id = v_eklavya_id);

  IF v_dm_ae IS NULL THEN
    v_dm_ae := gen_random_uuid();
    INSERT INTO conversations (id, workspace_id, user_id, title, kind, name, visibility, created_by)
    VALUES (v_dm_ae, v_ws_id, v_ansh_id, 'DM Eklavya Jangid', 'dm', NULL, 'private', v_ansh_id);
    INSERT INTO channel_members (id, conversation_id, user_id)
    VALUES (gen_random_uuid(), v_dm_ae, v_ansh_id), (gen_random_uuid(), v_dm_ae, v_eklavya_id);
  END IF;

  -- Check or create Eklavya <-> Ifrah DM
  SELECT c.id INTO v_dm_ei
  FROM conversations c
  WHERE c.workspace_id = v_ws_id AND c.kind = 'dm'
    AND EXISTS (SELECT 1 FROM channel_members a WHERE a.conversation_id = c.id AND a.user_id = v_eklavya_id)
    AND EXISTS (SELECT 1 FROM channel_members b WHERE b.conversation_id = c.id AND b.user_id = v_ifrah_id);

  IF v_dm_ei IS NULL THEN
    v_dm_ei := gen_random_uuid();
    INSERT INTO conversations (id, workspace_id, user_id, title, kind, name, visibility, created_by)
    VALUES (v_dm_ei, v_ws_id, v_eklavya_id, 'DM Ifrah Qureshi', 'dm', NULL, 'private', v_eklavya_id);
    INSERT INTO channel_members (id, conversation_id, user_id)
    VALUES (gen_random_uuid(), v_dm_ei, v_eklavya_id), (gen_random_uuid(), v_dm_ei, v_ifrah_id);
  END IF;
END $$;
