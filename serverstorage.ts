server/storage.ts
 import { scrapingSessions, type ScrapingSession, type InsertScrapingSession } from "@shared/schema";

export interface IStorage {
  createScrapingSession(session: InsertScrapingSession): Promise<ScrapingSession>;
  getScrapingSession(id: number): Promise<ScrapingSession | undefined>;
  getAllScrapingSessions(): Promise<ScrapingSession[]>;
  updateScrapingSession(id: number, updates: Partial<ScrapingSession>): Promise<ScrapingSession | undefined>;
  deleteScrapingSession(id: number): Promise<boolean>;
  getRecentScrapingSessions(limit?: number): Promise<ScrapingSession[]>;
  getScrapingStatistics(): Promise<{
    totalScrapes: number;
    totalImages: number;
    totalColors: number;
    totalTypography: number;
    successRate: number;
  }>;
}

export class MemStorage implements IStorage {
  private scrapingSessions: Map<number, ScrapingSession>;
  private currentId: number;

  constructor() {
    this.scrapingSessions = new Map();
    this.currentId = 1;
  }

  async createScrapingSession(session: InsertScrapingSession): Promise<ScrapingSession> {
    const id = this.currentId++;
    const newSession: ScrapingSession = {
      ...session,
      id,
      scrapedAt: new Date(),
    };
    this.scrapingSessions.set(id, newSession);
    return newSession;
  }

  async getScrapingSession(id: number): Promise<ScrapingSession | undefined> {
    return this.scrapingSessions.get(id);
  }

  async getAllScrapingSessions(): Promise<ScrapingSession[]> {
    return Array.from(this.scrapingSessions.values()).sort(
      (a, b) => (b.scrapedAt?.getTime() || 0) - (a.scrapedAt?.getTime() || 0)
    );
  }

  async updateScrapingSession(id: number, updates: Partial<ScrapingSession>): Promise<ScrapingSession | undefined> {
    const existing = this.scrapingSessions.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.scrapingSessions.set(id, updated);
    return updated;
  }

  async deleteScrapingSession(id: number): Promise<boolean> {
    return this.scrapingSessions.delete(id);
  }

  async getRecentScrapingSessions(limit: number = 10): Promise<ScrapingSession[]> {
    const sessions = await this.getAllScrapingSessions();
    return sessions.slice(0, limit);
  }

  async getScrapingStatistics(): Promise<{
    totalScrapes: number;
    totalImages: number;
    totalColors: number;
    totalTypography: number;
    successRate: number;
  }> {
    const sessions = Array.from(this.scrapingSessions.values());
    const completedSessions = sessions.filter(s => s.status === 'completed');
    
    let totalImages = 0;
    let totalColors = 0;
    let totalTypography = 0;

    completedSessions.forEach(session => {
      if (session.results && typeof session.results === 'object') {
        const results = session.results as any;
        totalImages += results.images?.length || 0;
        totalColors += results.colors?.length || 0;
        totalTypography += results.typography?.length || 0;
      }
    });

    return {
      totalScrapes: sessions.length,
      totalImages,
      totalColors,
      totalTypography,
      successRate: sessions.length > 0 ? (completedSessions.length / sessions.length) * 100 : 0,
    };
  }
}

export const storage = new MemStorage();
