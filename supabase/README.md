# TeeReady Supabase schema

Migrations here mirror the live TeeReady tables for disaster recovery and review.
Apply with the Supabase CLI against a fresh project, or use as reference when
recreating RLS / RPCs.

Remote history (already applied):
- `20260821070936_teeready_profiles`
- `20260821074347_teeready_multiplayer_groups` (+ game modes)
- Goal / questionnaire columns are included in the profiles migration snapshot

Dashboard follow-up (not SQL): enable Auth leaked-password protection —
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
