# Account export

`GET /api/account/export` returns a zip for the signed-in account. The response is `Cache-Control: private, no-store`. The owner is the server session. Every row is read with that id, and a file is packed only when its row and its storage path both belong to that id.

`README.txt` in the zip says the same thing the person downloading sees.

`account.json` contains:

- profile: id, email, sign-in provider, registration time, accepted consent version
- portfolios this account owns
- library rows this account owns, and which portfolio they sit on
- contacts this account added by hand, including their text and the files it owns

`files/` holds portfolio and library originals. `contacts/` holds originals uploaded for a hand-added contact. A file that belongs to someone else is left out of both folders. A contact can still name that file with `included: false`.

Other people's portfolios, including cards saved in Network, are not queried and are not in the zip.

Deleting the account is a separate request and does not run this export.

This file is the portable copy described in GDPR article 20. A request for access under article 15 can ask for more than this zip. Those requests go to support@adedme.com, are checked for identity, and are answered within one month.
