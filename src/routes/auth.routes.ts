import { Router } from 'express';
import { signup, login, getProfile, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas/auth.schema';

const router = Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.get('/profile', protect, getProfile);

export default router;