import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '../db';
import { env } from '../env';

const secret = new TextEncoder().encode(env.JWT_SECRET);

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export type TokenUser = { id: string; email: string; };

export async function createAccessToken(user: TokenUser) {
    return new SignJWT({ email: user.email })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime(ACCESS_TOKEN_TTL)
        .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<TokenUser> {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        throw new Error('Token sem os dados esperados')
    }

    return { id: payload.sub, email: payload.email }
}


export function hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
}

export async function createRefreshToken(userId: string) {
    const token = randomBytes(32).toString('base64url');

    await prisma.refreshToken.create({
        data: {
            tokenHash: hashToken(token),
            userId,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
    });

    return token;
}

export async function issueTokens(user: TokenUser) {
    return {
        accessToken: await createAccessToken(user),
        refreshToken: await createRefreshToken(user.id),
        user: { id: user.id, email: user.email },
    }
}