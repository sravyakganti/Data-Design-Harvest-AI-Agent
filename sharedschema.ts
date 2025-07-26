shared/schema.ts 
import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const scrapingSessions = pgTable("scraping_sessions", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull(), // 'pending', 'completed', 'failed'
  scrapedAt: timestamp("scraped_at").defaultNow(),
  options: jsonb("options").notNull(), // { images: boolean, colors: boolean, typography: boolean, content: boolean }
  results: jsonb("results"), // scraped data
  errorMessage: text("error_message"),
});

export const insertScrapingSessionSchema = createInsertSchema(scrapingSessions).omit({
  id: true,
  scrapedAt: true,
});

export type InsertScrapingSession = z.infer<typeof insertScrapingSessionSchema>;
export type ScrapingSession = typeof scrapingSessions.$inferSelect;

// Define the structure of scraped results
export const scrapedResultsSchema = z.object({
  images: z.array(z.object({
    src: z.string(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).optional(),
  colors: z.array(z.object({
    hex: z.string(),
    rgb: z.string(),
    usage: z.string(), // 'background', 'text', 'accent', etc.
  })).optional(),
  typography: z.array(z.object({
    fontFamily: z.string(),
    fontSize: z.string(),
    fontWeight: z.string(),
    element: z.string(), // 'h1', 'p', 'span', etc.
  })).optional(),
  content: z.array(z.object({
    text: z.string(),
    element: z.string(),
    hierarchy: z.number(), // heading level or importance
  })).optional(),
});

export type ScrapedResults = z.infer<typeof scrapedResultsSchema>;

// Scraping options schema
export const scrapingOptionsSchema = z.object({
  images: z.boolean().default(true),
  colors: z.boolean().default(true),
  typography: z.boolean().default(false),
  content: z.boolean().default(false),
});

export type ScrapingOptions = z.infer<typeof scrapingOptionsSchema>;
