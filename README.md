# For Hiroshima Travelers - Knowledge Base

A modern, fast, and accessible travel knowledge base for international travelers visiting Hiroshima, powered by **Astro**, **Starlight**, and **Notion**.

## Features

- **Built with Starlight & Astro**: High-performance static site generation with built-in search (Pagefind), responsive design, and dark/light modes.
- **English by Default**: Tailored specifically for international and English-speaking tourists.
- **Notion as CMS**: Write and manage content directly in Notion. Articles are synchronized directly to Markdown with rich formatting and image handling.
- **Automatic Asset Management**: Handles temporary Notion S3 image URLs by caching them locally for zero broken links.

## Getting Started

### 1. Environment Setup

Configure your `.env` file (copied from `.env.example`):

```bash
NOTION_API_KEY=your_notion_api_key_here
NOTION_DATABASE_ID=your_database_id_here
NOTION_DATA_SOURCE_ID=your_data_source_id_here
```

### 2. Synchronize Content from Notion

Run the sync script to pull all `Published` pages from your Notion database:

```bash
npm run sync
```

This generates Markdown files in `src/content/docs/guides/` and downloads any necessary media into `public/notion-images/`.

### 3. Development Server

Start the background development server:

```bash
astro dev --background
```

Server management commands:
- `astro dev status` - Check server status
- `astro dev logs` - View server logs
- `astro dev stop` - Stop the dev server

Open [http://localhost:4321](http://localhost:4321) in your browser.

### 4. Production Build

```bash
npm run build
```

This runs `npm run sync` automatically before compiling the static site to the `dist/` directory.

## Notion Database Schema Support

| Property | Notion Type | Description |
| :--- | :--- | :--- |
| `Title` | Title | Page title (used for H1 and navigation) |
| `Slug` | Rich Text | Custom URL slug (e.g. `overview`) |
| `Status` | Status | Only pages marked as `Published` are synced |
| `Category` | Select | Target category folder (e.g. `itineraries`, `guides`) |
| `Description` | Rich Text | Meta description for SEO and cards |
| `PublishedDate` | Date | Optional publish date |
| `Tags` | Multi-select | Topics/Tags |
