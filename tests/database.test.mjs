import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('schema installs from scratch and isolates profiles and group membership', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    }
    const alice = '00000000-0000-0000-0000-000000000001';
    const bob = '00000000-0000-0000-0000-000000000002';
    await db.exec(`INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      SET ROLE authenticated; SET request.jwt.claim.sub = '${alice}';
      INSERT INTO public.teeready_profiles (id, display_name) VALUES ('${alice}', 'Alice');`);
    const { rows: [group] } = await db.query(`INSERT INTO public.teeready_groups (name, invite_code, created_by) VALUES ('Test', 'ABCDEFGH', '${alice}') RETURNING id`);
    await db.exec(`INSERT INTO public.teeready_group_members (group_id, user_id) VALUES ('${group.id}', '${alice}'); SET request.jwt.claim.sub = '${bob}';`);
    assert.equal((await db.query('SELECT * FROM public.teeready_profiles')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.teeready_groups')).rows.length, 0);
    await assert.rejects(db.exec(`INSERT INTO public.teeready_group_members (group_id, user_id) VALUES ('${group.id}', '${bob}')`));
    await assert.rejects(db.query("SELECT public.teeready_join_group('WRONG')"));
    await db.query("SELECT public.teeready_join_group('abcdefgh')");
    assert.equal((await db.query('SELECT * FROM public.teeready_groups')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM public.teeready_group_members')).rows.length, 2);
    const changed = await db.query(`UPDATE public.teeready_groups SET created_by = '${bob}' WHERE id = '${group.id}' RETURNING id`);
    assert.equal(changed.rows.length, 0, 'members cannot take ownership of a group');
    await db.exec(`SET request.jwt.claim.sub = '${alice}';`);
    const { rows: [other] } = await db.query(`INSERT INTO public.teeready_groups (name, invite_code, created_by) VALUES ('Private', 'PRIVATE1', '${alice}') RETURNING id`);
    await db.exec(`SET request.jwt.claim.sub = '${bob}';`);
    await assert.rejects(db.exec(`UPDATE public.teeready_group_members SET group_id = '${other.id}' WHERE group_id = '${group.id}' AND user_id = '${bob}'`), 'members cannot move themselves into an uninvited group');
    await assert.rejects(db.exec(`INSERT INTO public.teeready_profiles (id) VALUES ('${alice}')`));
  } finally { await db.close(); }
});
