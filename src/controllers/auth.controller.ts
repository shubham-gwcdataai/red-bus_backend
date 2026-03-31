import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/db';
import { SignupInput, LoginInput } from '../schemas/auth.schema';
import { AuthRequest } from '../types';
import { sendPasswordResetEmail } from '../services/email.service';

// Helper: generate JWT
const signToken = (id: string, email: string, role: string): string =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const signup = async (
  req: Request<{}, {}, SignupInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body;

    // Check duplicate email
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, error: 'Email already registered' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await query(
      `INSERT INTO users (name, email, phone, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, role, created_at`,
      [name, email, phone || null, hashedPassword]
    );

    const user = result.rows[0];
    const token = signToken(user.id, user.email, user.role);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { token, user },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and get JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 */
export const login = async (
  req: Request<{}, {}, LoginInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    const result = await query(
      'SELECT id, name, email, phone, password, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const token = signToken(user.id, user.email, user.role);
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { token, user: userWithoutPassword },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved
 *       401:
 *         description: Unauthorized
 */
export const getProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await query(
      'SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

export const forgotPassword = async (
  req: Request<{}, {}, { email: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;

    const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (userResult.rows.length === 0) {
      res.status(200).json({ 
        success: true, 
        message: 'If the email exists, a reset link will be sent' 
      });
      return;
    }

    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetToken, expiresAt]
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    console.log('========================================');
    console.log('PASSWORD RESET LINK:');
    console.log(resetUrl);
    console.log('========================================');

    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      await query('DELETE FROM password_reset_tokens WHERE token = $1', [resetToken]);
      res.status(500).json({ success: false, error: 'Failed to send reset email', resetUrl });
      return;
    }

    res.status(200).json({ 
      success: true, 
      message: 'If the email exists, a reset link will be sent',
      devResetUrl: resetUrl 
    });
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (
  req: Request<{}, {}, { token: string; password: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, password } = req.body;

    const tokenResult = await query(
      `SELECT prt.user_id FROM password_reset_tokens prt 
       WHERE prt.token = $1 AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      return;
    }

    const userId = tokenResult.rows[0].user_id;
    const hashedPassword = await bcrypt.hash(password, 10);

    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      userId,
    ]);

    await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
};