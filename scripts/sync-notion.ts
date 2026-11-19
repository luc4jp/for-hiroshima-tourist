import notionPkg from '@notionhq/client';
const { Client } = notionPkg;
import { NotionToMarkdown } from 'notion-to-md';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

if (!NOTION_API_KEY) {
  console.log('ℹ️ NOTION_API_KEY is not set. Skipping Notion sync and building with existing committed docs.');
  process.exit(0);
}

const notion = new Client({ auth: NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

const PUBLIC_IMAGES_DIR = path.resolve(process.cwd(), 'public/notion-images');
const DOCS_DIR = path.resolve(process.cwd(), 'src/content/docs');

// Ensure image directory exists
if (!fs.existsSync(PUBLIC_IMAGES_DIR)) {
  fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
}

// Download image and return local public path
async function downloadImage(url: string): Promise<string> {
  try {
    const urlObj = new URL(url);
    const extMatch = urlObj.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : '.png';
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filename = `${hash}${ext}`;
    const filePath = path.join(PUBLIC_IMAGES_DIR, filename);

    if (!fs.existsSync(filePath)) {
      console.log(`  Downloading image: ${url.slice(0, 80)}...`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    }

    return `/notion-images/${filename}`;
  } catch (err) {
    console.warn(`  Warning: Failed to download image ${url}, falling back to original URL.`, err);
    return url;
  }
}

// Custom transformer: Image (ensures Notion S3 images don't expire)
n2m.setCustomTransformer('image', async (block: any) => {
  const { image } = block;
  let url = '';
  if (image.type === 'external') {
    url = image.external?.url || '';
  } else if (image.type === 'file') {
    url = image.file?.url || '';
  }

  if (!url) return '';

  const caption = image.caption?.map((c: any) => c.plain_text).join('') || 'image';

  if (url.includes('amazonaws.com') || url.includes('notion-static') || image.type === 'file') {
    const localPath = await downloadImage(url);
    return `![${caption}](${localPath})`;
  }

  return `![${caption}](${url})`;
});

// Custom transformer: Callout -> Starlight Aside (:::note, :::tip, :::caution, :::danger)
n2m.setCustomTransformer('callout', async (block: any) => {
  const { callout } = block;
  const icon = callout?.icon?.emoji || '';
  const text = callout?.rich_text?.map((t: any) => t.plain_text).join('') || '';

  let type = 'note';
  if (['💡', '🚀', '⭐', '✨', 'Tip', 'TIP'].some(e => icon.includes(e))) {
    type = 'tip';
  } else if (['⚠️', '⚡', '🔔', '🚧', 'Caution', 'Warning'].some(e => icon.includes(e))) {
    type = 'caution';
  } else if (['🚨', '❌', '🛑', '⛔', 'Danger'].some(e => icon.includes(e))) {
    type = 'danger';
  }

  let childrenText = '';
  if (block.has_children) {
    const childBlocks = await n2m.pageToMarkdown(block.id);
    const childMd = n2m.toMarkdownString(childBlocks);
    if (childMd.parent) {
      childrenText = '\n\n' + childMd.parent;
    }
  }

  return `:::${type}\n${text}${childrenText}\n:::`;
});

// Custom transformer: Code blocks with language 'component', 'jsx', 'astro', or 'html'
n2m.setCustomTransformer('code', async (block: any) => {
  const { code } = block;
  const lang = (code.language || '').toLowerCase();
  const content = code.rich_text?.map((t: any) => t.plain_text).join('') || '';

  if (['component', 'jsx', 'astro', 'html'].includes(lang)) {
    return content;
  }

  return `\`\`\`${code.language || ''}\n${content}\n\`\`\``;
});

// Custom transformer: Toggle list -> <details><summary>...</summary>...</details>
n2m.setCustomTransformer('toggle', async (block: any) => {
  const { toggle } = block;
  const summaryText = toggle?.rich_text?.map((t: any) => t.plain_text).join('') || 'Details';

  let childrenText = '';
  if (block.has_children) {
    const childBlocks = await n2m.pageToMarkdown(block.id);
    const childMd = n2m.toMarkdownString(childBlocks);
    if (childMd.parent) {
      childrenText = '\n' + childMd.parent;
    }
  }

  return `<details>\n<summary><strong>${summaryText}</strong></summary>\n${childrenText}\n</details>`;
});

// Helper to convert heading levels (shift down by 1 so doc title is the single H1)
function adjustHeadingLevels(markdown: string): string {
  const lines = markdown.split('\n');
  const converted = lines.map(line => {
    const match = line.match(/^(#{1,5})\s+(.*)$/);
    if (match) {
      return `#${match[1]} ${match[2]}`;
    }
    return line;
  });
  return converted.join('\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Built-in Starlight components import statement
const STARLIGHT_COMPONENTS_IMPORT = `import { Tabs, TabItem, Card, CardGrid, LinkCard, Icon, Badge, Steps, FileTree, Aside } from '@astrojs/starlight/components';\n`;

// Recursively find all .md and .mdx files in a directory
function getAllDocFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  let files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllDocFiles(fullPath));
    } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Remove empty directories recursively
function removeEmptyDirs(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(dir, entry.name);
      removeEmptyDirs(subDir);
      if (fs.readdirSync(subDir).length === 0) {
        fs.rmdirSync(subDir);
        console.log(`  🗑️ Removed empty folder: ${path.relative(DOCS_DIR, subDir)}`);
      }
    }
  }
}

async function fetchAllPages(): Promise<any[]> {
  let allPages: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    let response: any;
    if (NOTION_DATA_SOURCE_ID && notion.dataSources?.query) {
      response = await notion.dataSources.query({
        data_source_id: NOTION_DATA_SOURCE_ID,
        start_cursor: startCursor,
      });
    } else {
      response = await notion.request({
        path: `databases/${NOTION_DATABASE_ID}/query`,
        method: 'post',
        body: startCursor ? { start_cursor: startCursor } : {},
      });
    }

    allPages = allPages.concat(response.results || []);
    hasMore = response.has_more || false;
    startCursor = response.next_cursor || undefined;
  }

  return allPages;
}

async function sync() {
  console.log('🚀 Fetching all pages from Notion database...');

  let rawPages: any[] = [];
  try {
    rawPages = await fetchAllPages();
  } catch (err: any) {
    console.error('Failed to query Notion:', err.message);
    process.exit(1);
  }

  // Filter only Published pages that are not in trash or archived
  const publishedPages = rawPages.filter(page => {
    if (page.archived || page.in_trash) return false;
    const props = page.properties as Record<string, any>;
    const statusName = (props.Status?.status?.name || '').trim().toLowerCase();
    // Allow if status is explicitly "published" or has no status configured
    return statusName === 'published' || !props.Status?.status;
  });

  console.log(`Found ${publishedPages.length} active published pages in Notion.`);

  const validTargetFiles = new Set<string>();
  const categoryMap = new Map<string, string>();

  for (const page of publishedPages) {
    if (!('properties' in page)) continue;

    const props = page.properties as Record<string, any>;

    // Title
    const title = props.Title?.title?.map((t: any) => t.plain_text).join('') || 'Untitled';

    // Slug
    let slug = props.Slug?.rich_text?.map((t: any) => t.plain_text).join('')?.trim();
    if (!slug) {
      slug = slugify(title) || page.id;
    }

    // Category
    const rawCategory = props.Category?.select?.name?.trim();
    const category = rawCategory ? slugify(rawCategory) : '';
    if (rawCategory && category) {
      categoryMap.set(category, rawCategory);
    }

    // Description
    const description = props.Description?.rich_text?.map((t: any) => t.plain_text).join('') || '';

    console.log(`\n📄 Processing: "${title}" (Slug: ${slug}, Category: ${category || '(root)'})`);

    // Fetch and convert blocks to Markdown
    const mdblocks = await n2m.pageToMarkdown(page.id);
    const mdStringObj = n2m.toMarkdownString(mdblocks);
    let content = mdStringObj.parent || '';

    // Adjust headings so that page title remains the only top-level H1
    content = adjustHeadingLevels(content);

    // Prepare frontmatter
    const frontmatterLines = [
      '---',
      `title: ${JSON.stringify(title)}`,
    ];
    if (description) {
      frontmatterLines.push(`description: ${JSON.stringify(description)}`);
    }
    frontmatterLines.push('---', '');

    // Combine frontmatter + component imports + content
    const fullContent = frontmatterLines.join('\n') + STARLIGHT_COMPONENTS_IMPORT + '\n' + content;

    // Target directory: if category is present, docs/[category]/, otherwise docs/ directly
    const targetDir = category ? path.join(DOCS_DIR, category) : DOCS_DIR;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFilePath = path.join(targetDir, `${slug}.mdx`);
    fs.writeFileSync(targetFilePath, fullContent, 'utf-8');
    validTargetFiles.add(path.resolve(targetFilePath));

    console.log(`  ✅ Saved to: ${path.relative(process.cwd(), targetFilePath)}`);
  }

  // Save discovered categories with their original display labels
  const categoriesList = Array.from(categoryMap.entries()).map(([slug, label]) => ({
    slug,
    label,
  }));
  const categoriesFilePath = path.resolve(process.cwd(), 'src/content/categories.json');
  fs.writeFileSync(categoriesFilePath, JSON.stringify(categoriesList, null, 2), 'utf-8');
  console.log(`\n📋 Saved category labels to: ${path.relative(process.cwd(), categoriesFilePath)}`);

  // --- CLEANUP DELETED / MOVED PAGES ---
  console.log('\n🧹 Checking for deleted or moved pages to clean up...');
  const existingFiles = getAllDocFiles(DOCS_DIR);
  let removedCount = 0;

  for (const file of existingFiles) {
    const resolvedPath = path.resolve(file);
    if (!validTargetFiles.has(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
      console.log(`  🗑️ Deleted old/removed file: ${path.relative(process.cwd(), resolvedPath)}`);
      removedCount++;
    }
  }

  // Clean up any empty category directories
  removeEmptyDirs(DOCS_DIR);

  if (removedCount === 0) {
    console.log('  ✨ No outdated files found.');
  }

  console.log('\n✨ Notion sync completed successfully!');
}

sync().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
