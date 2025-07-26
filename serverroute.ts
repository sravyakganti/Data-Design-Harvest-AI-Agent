server/route.ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScrapingSessionSchema, type ScrapedResults } from "@shared/schema";
import { z } from "zod";
import * as cheerio from "cheerio";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Get all scraping sessions
  app.get("/api/scraping-sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllScrapingSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scraping sessions" });
    }
  });

  // Get recent scraping sessions
  app.get("/api/scraping-sessions/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const sessions = await storage.getRecentScrapingSessions(limit);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent sessions" });
    }
  });

  // Get scraping statistics
  app.get("/api/scraping-sessions/statistics", async (req, res) => {
    try {
      const stats = await storage.getScrapingStatistics();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });

  // Create new scraping session
  app.post("/api/scraping-sessions", async (req, res) => {
    try {
      const validatedData = insertScrapingSessionSchema.parse(req.body);
      const session = await storage.createScrapingSession(validatedData);
      
      // Start scraping process in background
      scrapeWebsite(session.id, session.url, session.options as any);
      
      res.json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid request data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create scraping session" });
      }
    }
  });

  // Export data endpoint
  app.post("/api/export", async (req, res) => {
    try {
      const { format, sessionIds } = req.body;
      
      let sessions;
      if (sessionIds && sessionIds.length > 0) {
        sessions = await Promise.all(
          sessionIds.map((id: number) => storage.getScrapingSession(id))
        );
        sessions = sessions.filter(Boolean);
      } else {
        sessions = await storage.getAllScrapingSessions();
      }

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="scraped-data.json"');
        res.json(sessions);
      } else if (format === 'csv') {
        const csvData = convertToCSV(sessions);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="scraped-data.csv"');
        res.send(csvData);
      } else {
        res.status(400).json({ message: "Invalid export format" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Background scraping function - Core web scraping logic
async function scrapeWebsite(sessionId: number, url: string, options: any) {
  try {
    await storage.updateScrapingSession(sessionId, { status: 'pending' });
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const results: ScrapedResults = {};
    
    // Scrape images
    if (options.images) {
      results.images = [];
      $('img').each((_, element) => {
        const src = $(element).attr('src');
        const alt = $(element).attr('alt');
        const width = $(element).attr('width');
        const height = $(element).attr('height');
        
        if (src) {
          results.images.push({
            src: src.startsWith('http') ? src : new URL(src, url).href,
            alt: alt || '',
            width: width ? parseInt(width) : undefined,
            height: height ? parseInt(height) : undefined,
          });
        }
      });
    }
    
    // Scrape colors
    if (options.colors) {
      results.colors = [];
      const colorRegex = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\([^)]+\)|rgba\([^)]+\)/g;
      const styles = $('style').text() + $('[style]').map((_, el) => $(el).attr('style')).get().join(' ');
      const matches = styles.match(colorRegex) || [];
      
      const uniqueColors = [...new Set(matches)];
      uniqueColors.forEach(color => {
        results.colors.push({
          hex: color.startsWith('#') ? color : '',
          rgb: color.startsWith('rgb') ? color : '',
          usage: 'unknown',
        });
      });
    }
    
    // Scrape typography
    if (options.typography) {
      results.typography = [];
      $('h1, h2, h3, h4, h5, h6, p, span').each((_, element) => {
        const $el = $(element);
        const computedStyle = $el.attr('style') || '';
        
        results.typography.push({
          fontFamily: extractFontFamily(computedStyle) || 'inherit',
          fontSize: extractFontSize(computedStyle) || 'inherit',
          fontWeight: extractFontWeight(computedStyle) || 'normal',
          element: element.tagName.toLowerCase(),
        });
      });
    }
    
    // Scrape content
    if (options.content) {
      results.content = [];
      $('h1, h2, h3, h4, h5, h6, p').each((_, element) => {
        const $el = $(element);
        const text = $el.text().trim();
        const tagName = element.tagName.toLowerCase();
        
        if (text) {
          results.content.push({
            text,
            element: tagName,
            hierarchy: tagName.startsWith('h') ? parseInt(tagName[1]) : 7,
          });
        }
      });
    }
    
    await storage.updateScrapingSession(sessionId, {
      status: 'completed',
      results: results as any,
    });
    
  } catch (error) {
    await storage.updateScrapingSession(sessionId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

// Helper functions for CSS parsing
function extractFontFamily(style: string): string | null {
  const match = style.match(/font-family:\s*([^;]+)/i);
  return match ? match[1].trim() : null;
}

function extractFontSize(style: string): string | null {
  const match = style.match(/font-size:\s*([^;]+)/i);
  return match ? match[1].trim() : null;
}

function extractFontWeight(style: string): string | null {
  const match = style.match(/font-weight:\s*([^;]+)/i);
  return match ? match[1].trim() : null;
}

function convertToCSV(sessions: any[]): string {
  const headers = ['ID', 'URL', 'Domain', 'Status', 'Scraped At', 'Images Count', 'Colors Count'];
  const rows = sessions.map(session => [
    session.id,
    session.url,
    session.domain,
    session.status,
    session.scrapedAt,
    session.results?.images?.length || 0,
    session.results?.colors?.length || 0,
  ]);
  
  return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
}
