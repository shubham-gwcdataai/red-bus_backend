import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue }  from 'zod';

// Validates req.body against a Zod schema
// Compatible with both Zod v3 and v4
export const validate = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Zod v3 uses .errors, Zod v4 uses .issues — handle both
        const issueList: ZodIssue[] = (err as any).issues ?? (err as any).errors ?? [];
        const errors = issueList.map((issue: ZodIssue) => ({
          field:   issue.path.join('.'),
          message: issue.message,
        }));
        res.status(400).json({
          success: false,
          error:   'Validation failed',
          details: errors,
        });
        return;
      }
      next(err);
    }
  };
