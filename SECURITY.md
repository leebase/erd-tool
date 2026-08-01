# Security Policy

## Supported versions

Security fixes currently target the latest source on `main`. Version 0.1.x is
an alpha release and is not code signed or notarized.

## Reporting a vulnerability

Please do not open a public issue for an undisclosed vulnerability. Email
`lee@leebase.com` with a description, reproduction steps, affected versions,
and any suggested mitigation. You should receive an acknowledgement within
five business days.

Do not include real Snowflake credentials, private keys, tokens, or customer
data in a report. Use synthetic fixtures whenever possible.

## Connection safety

Use a least-privileged Snowflake role. ERD Tool project files are designed not
to contain connection secrets, but users are responsible for protecting local
application data and private-key files. Review generated DDL before executing
it against any database.
