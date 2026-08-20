import type { AuthPayload } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export {};
