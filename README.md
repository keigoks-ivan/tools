# Malaysia Property Monitor

A static dashboard tracking Malaysia's residential property market — supply, demand, pricing, and regional comparisons.

**Live site:** [myproperty.investmquest.com](https://myproperty.investmquest.com)

## Features

- **Dashboard** — OPR rate, transaction volumes, overhang, and price trends
- **Supply Analysis** — Construction pipeline, completions by type, state-level overhang
- **Demand Analysis** — Transaction trends, loan approval vs OPR, affordability ratio
- **Regional Comparison** — KL, Selangor, Penang, Johor, Sabah side-by-side metrics

Data is refreshed monthly via GitHub Actions from BNM, DOSM, PropertyGuru, and iProperty.

## Setup Guide

### Step 1: Fork this repo

Click the **Fork** button at the top-right of this page to create your own copy.

### Step 2: Enable GitHub Actions write permissions

1. Go to your forked repo → **Settings** → **Actions** → **General**
2. Under "Workflow permissions", select **Read and write permissions**
3. Click **Save**

This allows the monthly scraper to commit updated data back to the repo.

### Step 3: Upload site files to a2hosting

1. Log in to your **a2hosting cPanel**
2. Open **File Manager** → navigate to `public_html/`
3. Create a folder called `myproperty`
4. Upload these files/folders into `public_html/myproperty/`:
   - `index.html`
   - `supply.html`
   - `demand.html`
   - `regions.html`
   - `css/` (folder)
   - `js/` (folder)

### Step 4: Configure subdomain in cPanel

1. In cPanel, go to **Domains** (or **Subdomains** in older cPanel)
2. Add a new subdomain: `myproperty`
3. Set **Document Root** to: `public_html/myproperty`
4. Make sure your DNS has a CNAME or A record pointing `myproperty.investmquest.com` to your server

## Data Sources

| Source | Type | Data |
|--------|------|------|
| [BNM API](https://api.bnm.gov.my/) | Official API | OPR rate, consumer credit |
| [DOSM Open Data](https://open.dosm.gov.my/) | Official API | Household income |
| [PropertyGuru](https://www.propertyguru.com.my/) | Web scraping | KL listing prices |
| [iProperty](https://www.iproperty.com.my/) | Web scraping | Multi-city listing prices |

## Tech Stack

- Pure HTML/CSS/JavaScript (no frameworks)
- Chart.js v4 (CDN)
- Python scraper + GitHub Actions for monthly data updates
- Data served as static JSON from GitHub raw content
