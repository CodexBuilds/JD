# JD

Job applications tracker website.

## Features

- Connects to Gmail using OAuth and reads job-application-related emails.
- Shows only **confirmed application emails** by matching explicit confirmation language (for example: `Thank you for applying`, `Thanks for applying to ...`, `Application received`, `Under review`, `Thanks for filling in this form`).
- Explicitly excludes non-application/career-tip content (for example: `top 1.0% applicant`, `ultimate guide to cold email`, newsletters).
- Extracts and displays:
  - company (editable)
  - role (editable)
  - current status (`applied`, `screening`, `selected`, `rejected`)
  - email subject
  - email date
- Saves your Google OAuth Client ID in the browser and supports URL prefill with `?client_id=YOUR_CLIENT_ID`.

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

## Notes on verification

- Local checks validate filtering/extraction logic with deterministic fixtures and verify app assets/server behavior.
- End-to-end Gmail fetching correctness still depends on your real Gmail data + OAuth configuration.
