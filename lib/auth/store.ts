import prisma from '@/lib/prisma';
import bcrypt from 'bcrypt';
import type { User as AuthUser } from '@/types/auth';

// ─── Memory Database Fallback (for Vercel Demo without Database Connection) ───

interface MemoryUser {
  id: number;
  email: string;
  name: string | null;
  passwordHash: string;
  favoriteTeams: string | null;
  preferredLeague: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Global serverless-friendly memory store (holds registered users in server runtime memory)
const memoryUsers = new Map<string, MemoryUser>();

// Prepopulate standard demo users so the platform is immediately operational
const initMemoryDb = async () => {
  if (memoryUsers.size === 0) {
    const saltRounds = 10;
    const defaultPasswordHash = await bcrypt.hash('12345678', saltRounds);

    memoryUsers.set('demo@example.com', {
      id: 9991,
      email: 'demo@example.com',
      name: '探索家',
      passwordHash: defaultPasswordHash,
      favoriteTeams: 'LAL',
      preferredLeague: 'NBA',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    memoryUsers.set('sports-fan@example.com', {
      id: 9992,
      email: 'sports-fan@example.com',
      name: '狂熱體育迷',
      passwordHash: defaultPasswordHash,
      favoriteTeams: 'NYY',
      preferredLeague: 'MLB',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
};

// ─── Database Connection Helper ───

function hasRealDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  if (url.includes('placeholder') || url.includes('your-username') || url.includes('example.com')) {
    return false;
  }
  return true;
}

// ─── Unified Adaptive Authentication Store API ───

export const authStore = {
  /**
   * Register a new user. Supports database write with local memory fallback.
   */
  registerUser: async (
    email: string,
    password: string,
    name: string,
    preferredLeague?: string,
    favoriteTeams?: string
  ): Promise<AuthUser> => {
    await initMemoryDb();
    const emailLower = email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(password, 10);

    // Try PostgreSQL Database if URL is configured
    if (hasRealDatabase()) {
      try {
        const user = await prisma.user.create({
          data: {
            email: emailLower,
            password: passwordHash,
            name: name,
            preferredLeague: preferredLeague || null,
            favoriteTeams: favoriteTeams || null,
          },
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name || undefined,
          image: user.image || undefined,
          emailVerified: user.emailVerified || undefined,
          favoriteTeams: user.favoriteTeams || undefined,
          preferredLeague: user.preferredLeague || undefined,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      } catch (err) {
        console.warn('Database write failed, falling back to memory store:', err);
      }
    }

    // In-Memory Fallback Mode
    if (memoryUsers.has(emailLower)) {
      throw new Error('此電子信箱已被註冊');
    }

    const newUser: MemoryUser = {
      id: 1000 + memoryUsers.size,
      email: emailLower,
      name: name,
      passwordHash,
      favoriteTeams: favoriteTeams || null,
      preferredLeague: preferredLeague || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    memoryUsers.set(emailLower, newUser);

    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name || undefined,
      favoriteTeams: newUser.favoriteTeams || undefined,
      preferredLeague: newUser.preferredLeague || undefined,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    };
  },

  /**
   * Validates user credentials. Checks database, falls back to memory.
   * Returns AuthUser if valid, otherwise null.
   */
  validateUser: async (email: string, password: string): Promise<AuthUser | null> => {
    await initMemoryDb();
    const emailLower = email.toLowerCase().trim();

    // Try PostgreSQL Database first
    if (hasRealDatabase()) {
      try {
        const user = await prisma.user.findUnique({
          where: { email: emailLower },
        });

        if (user) {
          const isValid = await bcrypt.compare(password, user.password);
          if (isValid) {
            return {
              id: user.id,
              email: user.email,
              name: user.name || undefined,
              image: user.image || undefined,
              emailVerified: user.emailVerified || undefined,
              favoriteTeams: user.favoriteTeams || undefined,
              preferredLeague: user.preferredLeague || undefined,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            };
          }
          return null; // Password mismatch
        }
      } catch (err) {
        console.warn('Database read failed, checking memory store instead:', err);
      }
    }

    // In-Memory Fallback Mode
    const user = memoryUsers.get(emailLower);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (isValid) {
      return {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        favoriteTeams: user.favoriteTeams || undefined,
        preferredLeague: user.preferredLeague || undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }

    return null;
  },

  /**
   * Retrieve user profile by email address.
   */
  getUserByEmail: async (email: string): Promise<AuthUser | null> => {
    await initMemoryDb();
    const emailLower = email.toLowerCase().trim();

    // Try Database first
    if (hasRealDatabase()) {
      try {
        const user = await prisma.user.findUnique({
          where: { email: emailLower },
        });

        if (user) {
          return {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            image: user.image || undefined,
            emailVerified: user.emailVerified || undefined,
            favoriteTeams: user.favoriteTeams || undefined,
            preferredLeague: user.preferredLeague || undefined,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          };
        }
      } catch (err) {
        console.warn('Database getUserByEmail failed, falling back to memory:', err);
      }
    }

    // In-Memory Fallback
    const user = memoryUsers.get(emailLower);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      favoriteTeams: user.favoriteTeams || undefined,
      preferredLeague: user.preferredLeague || undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },
};
