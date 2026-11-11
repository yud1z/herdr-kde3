# Publication privacy

Only theme source, tests, local artwork, layout/profile definitions, scoped
keybindings and intentionally synthetic demonstration imagery belong here.

Do not commit Herdr runtime state, terminal/session exports, diagnostics, real
terminal screenshots, credentials, private keys, environment files, personal
settings, machine IDs, private email addresses or local home paths.

The screenshot is rendered from isolated demo content: its prompts, hostname,
file lists and build output are invented. It is not a capture of real work.
Artwork embedded in the static layout preview comes from the bundled assets.

Run `python3 scripts/check-publication.py` before committing. It checks forbidden
file categories, common credential patterns, local identity strings, PNG metadata,
and embedded preview images. This is a safeguard, not a guarantee; visually review
any new screenshot and review the staged diff too.

The installer is local-only and preserves unrelated keybindings. Backups created
by installation stay in the destination Herdr home, never in the repository.
