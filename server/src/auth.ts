import { Router, type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import {
  pool,
  q,
  findOrCreateUserByGoogle,
  backfillOrphanWorkspaces,
  type UserRow,
} from './db.js';

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-only-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
// e.g. http://localhost:5174 (dev) or https://channeled.onrender.com (prod)
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';
// Where to send the browser after a successful login. Defaults to BASE_URL so
// production (single-origin) works; in dev set CLIENT_URL=http://localhost:5173.
const CLIENT_URL = process.env.CLIENT_URL ?? BASE_URL;
// Optional: when this email logs in for the first time, all workspaces with
// NULL user_id are reassigned to them. Used to migrate pre-auth data.
const BACKFILL_EMAIL = (process.env.BACKFILL_USER_EMAIL ?? '').trim().toLowerCase();

const oauthConfigured = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

const PgSession = connectPgSimple(session);

export function buildSessionMiddleware() {
  return session({
    store: new PgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    name: 'channeled.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      // In production we serve UI + API from the same origin; in dev the client
      // is on :5173 and the server on :5174 (same host, different port) which
      // browsers treat the same for cookie scope. `lax` is correct in both.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  });
}

export function configurePassport() {
  if (!oauthConfigured) {
    console.warn(
      '[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — /api/auth/* will return 503.'
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? '';
          if (!email) return done(new Error('Google account has no email'));
          const user = await findOrCreateUserByGoogle({
            googleId: profile.id,
            email,
            name: profile.displayName ?? '',
            picture: profile.photos?.[0]?.value ?? '',
          });
          // One-shot backfill for the designated owner of pre-auth data.
          if (BACKFILL_EMAIL && email.toLowerCase() === BACKFILL_EMAIL) {
            const n = await backfillOrphanWorkspaces(user.id);
            if (n > 0) console.log(`[auth] backfilled ${n} workspace(s) to ${email}`);
          }
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, (user as UserRow).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const row = (await q<UserRow>(`SELECT * FROM users WHERE id = $1`, [id])).rows[0];
      done(null, row ?? false);
    } catch (err) {
      done(err as Error);
    }
  });
}

/** 401 if no authenticated user on the request. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

export const authRouter = Router();

authRouter.get('/google', (req, res, next) => {
  if (!oauthConfigured) return res.status(503).json({ error: 'oauth_not_configured' });
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })(req, res, next);
});

authRouter.get('/google/callback', (req, res, next) => {
  if (!oauthConfigured) return res.status(503).json({ error: 'oauth_not_configured' });
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}/?login=failed`,
  })(req, res, () => {
    res.redirect(CLIENT_URL || '/');
  });
});

authRouter.get('/me', (req, res) => {
  if (req.isAuthenticated?.() && req.user) {
    const u = req.user as UserRow;
    return res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      picture: u.picture,
    });
  }
  return res.status(401).json({ error: 'unauthorized' });
});

authRouter.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('channeled.sid');
      res.status(204).end();
    });
  });
});

// Express's Request.user is `Express.User` (an open interface).
// Augment it so route handlers can read `req.user.id` without casts.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends UserRow {}
  }
}
