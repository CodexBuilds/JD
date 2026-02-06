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

> This version extracts data from Gmail email subjects/snippets with lightweight heuristics.
