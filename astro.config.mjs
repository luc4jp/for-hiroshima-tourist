// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import * as fs from 'fs';
import * as path from 'path';

// Load category labels discovered during Notion sync
/** @type {Array<{ slug: string; label: string }>} */
let categories = [];
const categoriesFilePath = path.resolve('./src/content/categories.json');
if (fs.existsSync(categoriesFilePath)) {
	try {
		categories = JSON.parse(fs.readFileSync(categoriesFilePath, 'utf-8'));
	} catch (e) {
		console.warn('Failed to parse categories.json:', e);
	}
}

// Build sidebar groups with original Notion category titles
const categorySidebar = categories.map((cat) => ({
	label: cat.label,
	items: [{ autogenerate: { directory: cat.slug } }],
}));

// https://astro.build/config
export default defineConfig({
	// Smooth instant navigation without blinking
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'hover',
	},
	integrations: [
		starlight({
			title: 'Hiroshima Travel Guide',
			components: {
				Head: './src/components/Head.astro',
				PageFrame: './src/components/PageFrame.astro',
			},
			defaultLocale: 'root',
			locales: {
				root: {
					label: 'English',
					lang: 'en',
				},
			},
			tableOfContents: {
				minHeadingLevel: 2,
				maxHeadingLevel: 4,
			},
			head: [
				// Prevent white flash / FOUC when navigating pages in dark mode
				{
					tag: 'style',
					content: `
						:root { color-scheme: dark; background-color: #121417; }
						html, body {
							background-color: #121417;
						}
						html[data-theme='light'], html[data-theme='light'] body {
							color-scheme: light;
							background-color: #ffffff;
						}
					`,
				},
			],
			sidebar: [
				...categorySidebar,
			],
		}),
	],
});
