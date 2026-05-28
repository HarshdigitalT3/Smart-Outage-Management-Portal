import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pool } from "../db/pool.js";
import { config } from "../config/env.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

authRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    // Foundation-only: verify user credentials against DB.
    // Passwords are stored as bcrypt hashes in real systems; here we use a placeholder approach
    // aligned with seed data (plain text) for scaffold purposes ONLY.
    const userRes = await pool.query(
      `SELECT id, email, role
         FROM app_users
        WHERE email = $1
          AND password = $2
        LIMIT 1`,
      [email, password]
    );

    const user = userRes.rows[0];
    if (!user) {
      return res.status(401).json({ error: { message: "Invalid credentials", status: 401 } });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiresIn,
        issuer: config.jwt.issuer || undefined,
        audience: config.jwt.audience || undefined
      }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });
  })
);
