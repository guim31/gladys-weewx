# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the MQTT password (a `secret` field of the configuration),
  and any user name and password written in the broker or file address. They
  are kept by Gladys, sent only to the broker or the web server they belong
  to, and never written to the logs (addresses are logged without
  credentials nor query string).
- **Storage**: nothing is written to `/data`; the latest measurement only
  lives in memory.
- **Network**: outgoing connections only, on the local network, to the MQTT
  broker and to the web server of WeeWX the user configured. No cloud service,
  no listening port. MQTT messages and JSON files are parsed as untrusted
  input (JSON only, files capped at 2 MB, unknown values dropped).

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
WeeWX, the MQTT broker and the weather station.
