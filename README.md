# Huis Hunters

**AI-powered Amsterdam property discovery platform**

Live at [huishunters.com](https://huishunters.com)

---

Huis Hunters is a full-stack property discovery platform built to improve how people find recently listed homes in Amsterdam's notoriously competitive housing market. It scrapes listings from local listing sites, enriches them with NLP and AI, and serves them through an intelligent search interface with interactive map views.

This is a personal project — built to learn full-stack development end-to-end and to help me find a house to buy. It is not intended for monetization of any kind.

## Why It's Better

Existing property platforms in the Netherlands leave a lot to be desired. Huis Hunters focuses on discoverability and information density:

- **Neighborhood selection on a map** — Amsterdam is split into manageable neighborhoods that you can select visually, making it easy to search broadly across areas you're interested in
- **Auto-scrolling image carousels** — see more of the property without clicking through images one by one
- **Key info surfaced upfront** — every listing card shows outdoor spaces, price per m², bathrooms, floor level, number of stories, neighborhood, and a truncated description before you even open it
- **Map view with your location** — particularly useful on mobile to see what's available around you right now
- **No ads** — just listings
- **Daily email alerts** — more images and more relevant information than what you'd get from typical listing alert emails
- **Persistent search preferences** — your filters (price range, neighborhoods, bedrooms, etc.) are saved to your account and restored every time you visit, and also used to tailor your daily email alerts — so the listings you see and receive are always recent and relevant to you

## Daily Pipeline

Three Cloud Run jobs run daily to keep listings fresh and users informed:

1. **Scraper Job** — triggers an Apify actor to scrape recently published listings from local listing sites. Raw listing data (address, price, images, specs) is written to Firestore in batch. Sends email alerts on failure or zero results.

2. **Processor Job** — picks up raw listings and enriches them: translates Dutch descriptions to English (Helsinki-NLP), generates a summary (DistilBART), creates Vertex AI text embeddings for semantic search, extracts coordinates, detects the Amsterdam neighborhood via KML boundary matching, and parses features like outdoor spaces and floor level. Listings are marked as processed and become searchable.

3. **Email Alerts Job** — queries each subscribed user's saved search preferences, filters the latest processed listings to match, and sends a formatted HTML email with multiple images per listing, key specs, and direct links.

These jobs are orchestrated via Cloud Workflows — the scraper runs first, then the processor and email alerts run in sequence.

## Architecture

```
Local Listing Sites
        │
        ▼
   Apify Scraper ──────► Firestore (raw listings)
                              │
                              ▼
                     NLP Processor
                   ┌─────────────────────┐
                   │ Dutch → English      │
                   │ Summarization        │
                   │ Embedding Generation │
                   │ Neighborhood Detection│
                   └─────────────────────┘
                              │
                              ▼
                    Firestore (enriched listings)
                              │
                              ▼
                    Search API (Flask)
                   ┌─────────────────────┐
                   │ Semantic search      │
                   │ Address lookup       │
                   │ Structured filters   │
                   └─────────────────────┘
                              │
                              ▼
                    React Frontend
                   ┌─────────────────────┐
                   │ Listing grid + map   │
                   │ Advanced filters     │
                   │ Saved properties     │
                   │ Email alert signup   │
                   └─────────────────────┘
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Google Maps API, Firebase Auth, Bootstrap |
| **Search API** | Python, Flask, Vertex AI text embeddings (768-dim), cosine similarity ranking |
| **Data Pipeline** | Apify web scraping, Cloud Workflows orchestration, batch Firestore writes |
| **NLP** | Helsinki-NLP Dutch→English translation, DistilBART summarization (Hugging Face) |
| **Geo** | Google Maps API, KML-based neighborhood detection (point-in-polygon) |
| **Infrastructure** | Google Cloud Run, Firestore, Cloud Build, Cloudflare |

## Technical Highlights

- **Hybrid search** — combines semantic AI search (Vertex AI embeddings) with fast address lookup and structured filters (price, bedrooms, floor level, outdoor spaces, size, neighborhoods, publish date)
- **Automated ETL pipeline** — scraping, NLP enrichment, and embedding generation run as orchestrated Cloud Workflows with error alerting via email
- **Dutch→English translation** — property descriptions are automatically translated so English-speaking expats can search and browse in English
- **Neighborhood detection** — listings are mapped to Amsterdam neighborhoods using KML boundary data and point-in-polygon algorithms
- **Mobile-optimized** — responsive design with scroll position restoration, touch-friendly filters, and location-aware map views
- **User accounts** — Firebase Auth with saved properties, status tracking, and email alert preferences

## Project Structure

```
house-hunters-amsterdam/
├── frontend/
│   └── huis-hunters-frontend/
│       ├── src/
│       │   ├── components/       # React components (listings, map, filters, auth)
│       │   ├── contexts/         # Auth and listings state management
│       │   ├── hooks/            # Custom hooks (saved properties, preferences)
│       │   ├── utils/            # Parsing, filtering, export utilities
│       │   ├── config/           # Google Maps configuration
│       │   └── firebase.ts       # Firestore init with local caching
│       ├── Dockerfile            # Multi-stage build (Node → Nginx)
│       └── cloudbuild.yaml       # GCP Cloud Build config
├── backend/
│   └── scrape-and-process-listings/
│       ├── scraper/              # Apify-based listing scraper
│       ├── processor/            # NLP enrichment + embedding generation
│       ├── search/               # Flask search API with hybrid search
│       ├── email-alerts/         # Daily email alert generation
│       ├── scraper-workflow.yaml # Cloud Workflow orchestration
│       └── processor-workflow.yaml
├── firestore.rules               # Database security rules
└── deploy-all.sh                 # Deployment orchestration
```
