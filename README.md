# Waypoint

Waypoint is a full-stack travel tracking platform that automatically builds a user's travel history from uploaded photos. It extracts GPS coordinates and timestamps from photo metadata, groups related photos into trips using DBSCAN clustering, refines detected trips with GPT, and displays saved travel histories on interactive Google Maps.

**Live Demo:** https://waypoint-madhu.vercel.app

## Features

* Upload multiple travel photos through a drag-and-drop interface
* Extract EXIF timestamps and GPS coordinates directly from photos
* Store uploaded images securely using Vercel Blob
* Detect duplicate uploads using SHA-256 file checksums
* Group photos into proposed trips using DBSCAN
* Run clustering through a Python and scikit-learn pipeline
* Refine ambiguous trip boundaries and titles using GPT
* Review detected and unassigned photos before saving
* Confirm proposed trips into a personal travel history
* Display trip locations and routes using Google Maps
* Authenticate users with Clerk
* Store trips, photos, and upload batches in PostgreSQL
* Support both photo-based and legacy CSV-based trip data

## How It Works

Waypoint processes uploaded photos through the following pipeline:

```text
Photo Upload
    ↓
EXIF Metadata Extraction
    ↓
Vercel Blob Storage
    ↓
Python + scikit-learn DBSCAN
    ↓
GPT Trip Refinement
    ↓
Trip Review
    ↓
PostgreSQL Storage
    ↓
Google Maps Visualization
```

### 1. Photo Upload

Users upload photos directly from the browser. Files are uploaded to Vercel Blob instead of passing through a Next.js server route, avoiding Vercel Function request-body limits.

### 2. Metadata Extraction

Waypoint uses `exifr` to extract:

* Latitude
* Longitude
* Date and time taken
* Camera metadata when available

Photos without sufficient GPS or timestamp metadata are marked as unassigned for review.

### 3. Duplicate Detection

Waypoint calculates a SHA-256 checksum for each uploaded file. A database constraint prevents the same user from storing an identical photo multiple times, even when the filename has changed.

### 4. Trip Detection

Valid photo coordinates and timestamps are sent to a Python Vercel Function. The function uses scikit-learn's DBSCAN implementation with the Haversine distance metric to group nearby photos.

Trip detection considers:

* Geographic distance
* Timestamp differences
* Minimum number of photos
* Maximum allowed time gaps

### 5. GPT Refinement

Detected DBSCAN clusters are sent to an OpenAI model for optional refinement. GPT can:

* Generate readable trip titles
* Identify likely cities or destinations
* Improve ambiguous cluster boundaries
* Create natural-language trip summaries
* Assign confidence scores

If GPT refinement is unavailable, Waypoint preserves the original DBSCAN results.

### 6. Trip Review

Before trips are saved, users can review:

* Proposed trips
* Assigned photos
* Unassigned photos
* Trip dates
* Detected locations
* Confidence scores

After confirmation, the proposed trips are converted into saved travel-history records.

### 7. Map Visualization

Saved trips are displayed using the Google Maps JavaScript API. Waypoint places markers for photo locations and draws routes between valid coordinates.

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Google Maps JavaScript API
* `@react-google-maps/api`
* `exifr`
* Lucide React

### Backend

* Next.js Route Handlers
* Python
* scikit-learn
* NumPy
* OpenAI API
* Prisma ORM

### Infrastructure

* PostgreSQL
* Vercel
* Vercel Blob
* Clerk Authentication

## Project Structure

```text
waypoint/
├── api/
│   └── cluster.py
├── ml/
│   └── cluster_trips.py
├── prisma/
│   └── schema.prisma
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── refine-trips/
│   │   │   ├── trips/
│   │   │   └── uploads/
│   │   ├── review/
│   │   ├── trips/
│   │   └── upload/
│   ├── components/
│   │   └── RouteMapPreview.tsx
│   └── lib/
│       ├── clientPhotoMetadata.ts
│       ├── dbscan.ts
│       └── prisma.ts
├── .env.example
├── package.json
├── requirements.txt
└── vercel.json
```

## Getting Started

### Prerequisites

Install the following before running Waypoint locally:

* Node.js 20 or later
* npm
* Python 3.12
* PostgreSQL database
* Vercel CLI

Install the Vercel CLI globally:

```bash
npm install -g vercel
```

### Clone the Repository

```bash
git clone https://github.com/madhus1218/waypoint.git
cd waypoint
```

### Install JavaScript Dependencies

```bash
npm install
```

### Install Python Dependencies

Create and activate a virtual environment:

#### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

#### macOS or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Configure Environment Variables

Create a `.env.local` file in the project root:

```env
DATABASE_URL="your-postgresql-connection-string"

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="your-clerk-publishable-key"
CLERK_SECRET_KEY="your-clerk-secret-key"

BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"

OPENAI_API_KEY="your-openai-api-key"

NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="your-google-maps-api-key"
```

Never commit `.env.local` or any production secrets to GitHub.

## Service Configuration

### PostgreSQL

Create a PostgreSQL database and set its connection string as `DATABASE_URL`.

Generate the Prisma client:

```bash
npx prisma generate
```

Apply the database schema:

```bash
npx prisma db push
```

For production projects using migrations:

```bash
npx prisma migrate deploy
```

### Clerk

Create a Clerk application and add the following variables:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

Ensure the upload, review, and trips pages are protected for signed-in users.

### Vercel Blob

Create or connect a Vercel Blob store to the project.

Add:

```env
BLOB_READ_WRITE_TOKEN=
```

The upload process uses direct client uploads. The browser first requests a temporary upload token from Waypoint's authenticated Blob authorization route.

### OpenAI

Create an OpenAI API key and add:

```env
OPENAI_API_KEY=
```

Waypoint uses the key only on the server. Do not prefix it with `NEXT_PUBLIC_`.

### Google Maps

In Google Cloud Console:

1. Create or select a Google Cloud project.
2. Enable the Maps JavaScript API.
3. Enable billing.
4. Create an API key.
5. Add website restrictions.
6. Restrict the key to the Maps JavaScript API.

Example allowed websites:

```text
http://localhost:3000/*
https://waypoint-madhu.vercel.app/*
https://*.vercel.app/*
```

Add the key as:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

## Running Locally

Because Waypoint includes a Python Vercel Function, use:

```bash
vercel dev
```

This runs both:

* The Next.js application
* The Python `/api/cluster` endpoint

For frontend-only development, you may also run:

```bash
npm run dev
```

However, the Python clustering endpoint may not behave exactly like it does under Vercel.

Open:

```text
http://localhost:3000
```

## Production Build

Run:

```bash
npm run build
```

Check formatting and linting:

```bash
npm run lint
```

## Deployment

Waypoint is designed to deploy on Vercel.

### Deploy with GitHub

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Connect a PostgreSQL database.
4. Connect a Vercel Blob store.
5. Add all required environment variables.
6. Redeploy the project.

### Deploy from the CLI

```bash
vercel
```

Deploy to production:

```bash
vercel --prod
```

## Main API Routes

### `POST /api/uploads`

Creates a new authenticated upload batch.

### `POST /api/uploads/blob`

Authorizes a direct client upload to Vercel Blob.

### `POST /api/uploads/[id]/process`

Validates uploaded metadata, stores photo records, triggers clustering, and creates proposed trips.

### `POST /api/cluster`

Runs the Python and scikit-learn DBSCAN pipeline.

### `POST /api/refine-trips`

Uses GPT to refine DBSCAN-generated trip clusters.

### `GET /api/trips`

Returns confirmed trips belonging to the current Clerk user.

## Database Models

Waypoint's primary database entities include:

### Upload Batch

Represents one photo-upload session and tracks processing state.

### Photo Asset

Stores:

* Owner
* Filename
* Blob URL
* Blob pathname
* File checksum
* Latitude
* Longitude
* Timestamp
* Metadata status
* Assigned trip

### Trip

Stores:

* Owner
* Title
* Start date
* End date
* City
* Country
* Notes
* Status
* Confidence score
* Center coordinates
* Associated photos

### Photo Point

Supports legacy CSV-generated trip coordinates.

## Trip Detection Behavior

A photo must normally include both:

* Valid GPS coordinates
* A valid timestamp

Photos may remain unassigned when:

* GPS metadata is missing
* Timestamp metadata is missing
* Photos are too geographically separated
* Time gaps exceed clustering limits
* There are not enough nearby photos to create a cluster
* The photo was detected as a duplicate

The review page allows users to inspect these results before saving trips.

## Supported Photo Formats

Waypoint supports common photo formats including:

```text
JPEG
JPG
PNG
WebP
HEIC
HEIF
```

Metadata availability depends on the original photo and whether another platform removed its EXIF data.

Photos downloaded from social media or sent through certain messaging platforms may no longer contain GPS or timestamp metadata.

## Privacy and Security

* Users must authenticate before uploading photos.
* Upload batches are associated with the current Clerk user.
* Blob upload paths are validated against the authenticated user.
* Trips are queried by Clerk user ID.
* Exact duplicate files are rejected per user.
* Secret API keys remain on the server.
* The OpenAI key is never exposed to the browser.
* Uploaded photos are not shared publicly by default.

## Limitations

* Trip detection depends on the availability and accuracy of EXIF metadata.
* Screenshots usually do not contain useful GPS metadata.
* Social media platforms may remove photo metadata.
* DBSCAN settings may need adjustment for unusually long or multi-city trips.
* GPT refinement requires an active OpenAI API key and available API quota.
* Google Maps requires billing to be enabled.
* HEIC metadata behavior may differ between browsers and devices.
* Python Vercel Functions may have cold-start latency.

## Future Improvements

Potential future additions include:

* Manual creation of trips from unassigned photos
* Drag-and-drop photo reassignment
* Editable trip dates and destinations
* Reverse geocoding for automatic city and country detection
* Public trip-sharing pages
* Photo galleries for each trip
* Timeline-based travel visualization
* Background processing for large uploads
* Support for Apple Photos and Google Takeout exports
* Improved multi-city trip detection
* Mobile-first map interactions
* Trip export to JSON, CSV, or GPX


## Author

**Madhumita “Madhu” Subbiah**

Georgia Institute of Technology
Computer Science

* GitHub: https://github.com/madhus1218
* Portfolio: https://madhusubbiah.tech
* Live Project: https://waypoint-madhu.vercel.app

## License

This project is available for educational and portfolio purposes. Add a formal open-source license before allowing unrestricted reuse or redistribution.
