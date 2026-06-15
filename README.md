# Waypoint

Waypoint is a full-stack travel tracking platform that converts timestamped GPS photo metadata into interactive travel histories.

Users can upload a CSV export containing photo coordinates and timestamps, and Waypoint automatically validates the data, detects trips using DBSCAN-based geospatial clustering, refines ambiguous trip boundaries with GPT, and saves the resulting travel timeline to PostgreSQL.

## Live Demo

[View Waypoint](https://waypoint-madhu.vercel.app/)

## Features

* Upload photo metadata through CSV files
* Validate malformed coordinates, timestamps, and missing values
* Detect and remove duplicate photo records
* Cluster nearby GPS points using DBSCAN-based geospatial inference
* Separate repeat visits using timestamp-gap segmentation
* Refine ambiguous trip boundaries using GPT structured outputs
* Generate readable trip titles and natural-language summaries
* Fall back to DBSCAN-generated trips when GPT is unavailable
* Persist generated trips and photo points in PostgreSQL
* View saved trips, dates, coordinates, photo counts, and route details
* Support anonymous users through browser-based owner IDs
* Responsive UI built with Tailwind CSS

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Lucide React

### Backend

* Next.js API Routes
* Prisma ORM
* PostgreSQL
* OpenAI API
* Zod

### Data Processing

* DBSCAN-based geospatial clustering
* Haversine distance calculations
* Timestamp-gap segmentation
* CSV parsing with Papa Parse
* Metadata validation and duplicate filtering

## How It Works

### 1. Upload metadata

Users upload a CSV containing:

```csv
filename,latitude,longitude,timestamp
photo1.jpg,48.8566,2.3522,2026-01-12T10:00:00
photo2.jpg,48.8606,2.3376,2026-01-12T14:30:00
photo3.jpg,49.1193,6.1757,2026-01-15T09:15:00
```

### 2. Validate and normalize

Waypoint checks each row for:

* Missing required values
* Invalid latitude or longitude
* Invalid timestamps
* Duplicate records

Invalid rows are rejected while valid records continue through the pipeline.

### 3. Detect trips with DBSCAN

Waypoint groups geographically dense photo points using DBSCAN-style clustering.

The current defaults are:

* Maximum cluster distance: 75 miles
* Minimum points per cluster: 2
* Maximum time gap within a visit: 72 hours

Haversine distance is used to calculate the distance between GPS coordinates.

### 4. Refine ambiguous boundaries with GPT

Detected DBSCAN clusters are sent to a server-side GPT refinement route.

GPT reviews:

* Cluster coordinates
* Start and end timestamps
* Average cluster location
* Photo count
* Nearby or consecutive clusters

It then determines whether ambiguous clusters should remain separate or be merged into one continuous trip.

The response is validated using structured outputs and Zod.

If the OpenAI API is unavailable, missing, or over quota, Waypoint automatically returns the original DBSCAN trips instead of breaking the upload flow.

### 5. Save and display trips

Generated trips and their photo points are saved in PostgreSQL through Prisma.

Users can then view:

* Trip title
* City and country
* Start and end dates
* Photo count
* Average coordinates
* Generated summary
* Trip detail page
* Route visualization

## Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── refine-trips/
│   │   │   └── route.ts
│   │   └── trips/
│   │       └── route.ts
│   ├── trips/
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── page.tsx
│   ├── upload/
│   │   └── page.tsx
│   └── page.tsx
├── components/
├── lib/
│   ├── anonymousUser.ts
│   ├── dbscan.ts
│   └── prisma.ts
prisma/
├── schema.prisma
public/
└── sample-waypoint-data.csv
```

## Database Models

Waypoint stores two main entities.

### Trip

```prisma
model Trip {
  id          String       @id @default(cuid())
  ownerId     String?
  title       String
  startDate   DateTime
  endDate     DateTime
  city        String?
  country     String?
  notes       String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  photoPoints PhotoPoint[]
}
```

### PhotoPoint

```prisma
model PhotoPoint {
  id        String   @id @default(cuid())
  tripId    String
  filename  String?
  latitude  Float
  longitude Float
  takenAt   DateTime
  createdAt DateTime @default(now())
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
}
```

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/madhus1218/waypoint.git
cd waypoint
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file:

```env
DATABASE_URL=your_postgresql_connection_string
OPENAI_API_KEY=your_openai_api_key
```

Do not expose the OpenAI key using a `NEXT_PUBLIC_` prefix.

### 4. Generate the Prisma client

```bash
npx prisma generate
```

### 5. Apply database migrations

```bash
npx prisma migrate dev
```

### 6. Start the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Testing the Demo Flow

1. Open the upload page.
2. Download the sample CSV.
3. Upload the sample file.
4. Review the validation summary.
5. Click **Generate trips**.
6. Wait for DBSCAN clustering and GPT refinement.
7. Open the generated trips from the dashboard.

The sample CSV includes:

* Multiple geographic clusters
* Repeat visits
* Duplicate records
* Invalid coordinates
* Invalid timestamps
* Missing required values

## Build

Run:

```bash
npm run build
```

The production build runs Prisma generation followed by the Next.js build.

## Deployment

Waypoint is deployed with Vercel.

Required production environment variables:

```env
DATABASE_URL=your_production_postgresql_connection_string
OPENAI_API_KEY=your_openai_api_key
```

After updating environment variables, redeploy the project so the values are available to the production build and server routes.

## Future Improvements

* Support direct Apple Photos and Google Photos metadata exports
* Add photo previews and image uploads
* Add reverse geocoding for more accurate city and country detection
* Add editable trip boundaries
* Add public sharing pages
* Support multiple file uploads
* Add route animations and travel statistics
* Move clustering into a scalable background processing pipeline
* Add authenticated user accounts
* Add trip export and deletion controls

## Author

**Madhumita Subbiah**

* GitHub: [madhus1218](https://github.com/madhus1218)
* Live Demo: [Waypoint](https://waypoint-madhu.vercel.app/)
