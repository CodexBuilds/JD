# JD

Job applications tracker website.

## Features

- Connects to Gmail using OAuth and reads job-application-related emails.
- Extracts and displays:
  - company
  - role
  - current status
  - email subject
  - email date
- Status dropdown values: `applied`, `screening`, `selected`, `rejected`.
- Improved connection flow with readiness/error messages if Google Identity fails to load.

## Run locally

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Gmail setup

1. Create a Google Cloud project.
2. Enable **Gmail API**.
3. Configure OAuth consent screen.
4. Create an OAuth **Web application** client ID.
5. Add `http://localhost:4173` as an allowed JavaScript origin.
6. Paste the client ID into the app and click **Connect Gmail**.
7. The app saves the Client ID in your browser for next time (or you can prefill with `?client_id=YOUR_CLIENT_ID` in the URL).

## Troubleshooting

- If Connect Gmail stays disabled or fails immediately, refresh and ensure Google Identity script is not blocked by an ad blocker/privacy extension.
- If OAuth opens but Gmail data fails, confirm Gmail API is enabled and consent screen/app permissions are configured.

> This version extracts data from Gmail email subjects/snippets with lightweight heuristics.
