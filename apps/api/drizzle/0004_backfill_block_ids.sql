-- §11E.6 — assign a stable blockId to every existing top-level block, using
-- its own row id. Without this, the first save after upgrading to the
-- upsert-by-id blocks endpoint would treat every existing block as new and
-- rewrite the whole page, destroying the identity the migration just built.
--
-- Nested blocks (inside columns/toggles/tables) get their blockId lazily,
-- assigned by the editor's BlockId Tiptap plugin on first edit — there is no
-- way to backfill those from SQL alone since they aren't addressable rows.
update "blocks"
   set "content" = jsonb_set(
         "content",
         '{attrs}',
         coalesce("content" -> 'attrs', '{}'::jsonb) || jsonb_build_object('blockId', "id"::text)
       )
 where "content" is not null
   and coalesce("content" -> 'attrs' ->> 'blockId', '') = '';
