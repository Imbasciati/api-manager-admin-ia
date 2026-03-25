import jwt from "jsonwebtoken";

const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";

export type JwtPayload = {
  sub: string;
  email: string;
  perfil: string;
};

export const signAccessToken = (payload: JwtPayload) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não configurada");
  }
  return jwt.sign(payload, secret, { expiresIn: ACCESS_EXPIRES_IN });
};

export const signRefreshToken = (payload: JwtPayload) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET não configurada");
  }
  return jwt.sign(payload, secret, { expiresIn: REFRESH_EXPIRES_IN });
};

export const verifyAccessToken = (token: string) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não configurada");
  }
  return jwt.verify(token, secret) as JwtPayload;
};

export const verifyRefreshToken = (token: string) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET não configurada");
  }
  return jwt.verify(token, secret) as JwtPayload;
};

export const refreshExpiryDate = () => {
  const now = new Date();
  now.setDate(now.getDate() + 7);
  return now;
};

