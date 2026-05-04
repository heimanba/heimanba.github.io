import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
		}),
});

const works = defineCollection({
	loader: glob({ base: './src/content/works', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			coverImage: z.optional(image()),
			tags: z.array(z.string()).default([]),
			role: z.string().optional(),
			status: z.string().optional(),
			featured: z.boolean().default(false),
			links: z
				.object({
					demo: z.string().url().optional(),
					repo: z.string().url().optional(),
					article: z.string().url().optional(),
				})
				.optional(),
		}),
});

export const collections = { blog, works };
