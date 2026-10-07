# Fare Watch
GitHub Actions checks fares twice a day, commits prices to `data/history.json`, and emails you when a fare drops (ntfy phone alerts are optional). GitHub Pages serves `index.html`.

## Setup
1. Create a repo, upload these files, push.
2. Get an API key at https://ignav.com/signup (1,000 free requests, then $2 per 1,000).
3. Repo > Settings > Secrets and variables > Actions: add `IGNAV_API_KEY`, and `RESEND_API_KEY` (free at resend.com), and `EMAIL_TO` (the email you signed up to Resend with; the free sender can only deliver there). Optional: `NTFY_TOPIC` for phone push.
4. Create a fine-grained GitHub token for this repo only: Contents (read/write) and Actions (read/write). Paste it into the dashboard's GitHub connection card.
5. Settings > Pages: deploy from branch `main`, folder `/ (root)`.
6. Actions tab > "Track fares" > Run workflow to test.

Add and remove routes from the dashboard (it commits to `config.json`). Each route costs 1 request per run (about 60 per month at twice daily).

https://dfvit.github.io/airfare_tracker/
