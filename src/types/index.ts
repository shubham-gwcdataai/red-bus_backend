import { Request } from 'express';

export interface AuthUser {
  id:    string;
  email: string;
  role:  'user' | 'admin';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface ApiSuccess<T> {
  success: true;
  data:    T;
  message?: string;
}

export interface ApiError {
  success: false;
  error:   string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationQuery {
  page?:  string;
  limit?: string;
}

export interface SearchQuery {
  source:      string;
  destination: string;
  date:        string;
}

export interface JwtPayload {
  id:    string;
  email: string;
  role:  string;
  iat?:  number;
  exp?:  number;
}