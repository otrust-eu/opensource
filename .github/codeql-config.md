# CodeQL notes for OTRUST

SQLite query values are always passed as bound parameters. Collection names,
field names, sort fields, and generated index names are accepted only when they
match strict application-controlled identifier patterns before being included
in SQL. Public request values never become SQL identifiers or fragments.

The `insecure-helmet-configuration` finding is a false positive: Helmet's CSP
is disabled because OTRUST installs its own per-request nonce CSP middleware.

Email HTML uses application-owned templates. User-controlled values are escaped
with `validator.escape()` before insertion into those templates.
