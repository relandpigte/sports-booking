import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { hashSecurityToken } from "@/lib/security-context";

const GUEST_BOOKING_COOKIE = "bunal_guest_booking";
const ACCESS_TOKEN_BYTES = 32;

function signingSecret(): string {
  const secret =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Guest booking access requires AUTH_SECRET.");
  }
  return "bunal-local-guest-booking";
}

function signature(payload: string): string {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
}

function equal(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function newGuestAccessToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(ACCESS_TOKEN_BYTES).toString("base64url");
  return { raw, hash: hashSecurityToken(raw) };
}

export function guestAccessPath(token: string): string {
  return `/bookings/access/${encodeURIComponent(token)}`;
}

export function eventGuestAccessPath(token: string): string {
  return `/events/access/${encodeURIComponent(token)}`;
}

export function guestBookingPath(guestReservationId: string): string {
  return `/bookings/guest/${encodeURIComponent(guestReservationId)}`;
}

export async function issueGuestAccessToken(
  guestReservationId: string
): Promise<string | null> {
  const reservation = await prisma.guestReservation.findUnique({
    where: { id: guestReservationId },
    select: { accessExpiresAt: true },
  });
  if (!reservation || reservation.accessExpiresAt <= new Date()) return null;

  const token = newGuestAccessToken();
  await prisma.guestReservationAccessToken.create({
    data: {
      guestReservationId,
      tokenHash: token.hash,
      expiresAt: reservation.accessExpiresAt,
    },
  });
  return token.raw;
}

export async function setGuestBookingCookie(
  guestReservationId: string,
  expiresAt: Date
): Promise<void> {
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${guestReservationId}.${expires}`;
  (await cookies()).set(
    GUEST_BOOKING_COOKIE,
    `${payload}.${signature(payload)}`,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // The reservation dock lives on /hubs, so its payment/release Server
      // Actions need the same private cookie before redirecting to /bookings.
      path: "/",
      expires: expiresAt,
      priority: "high",
    }
  );
}

async function guestIdFromCookie(): Promise<string | null> {
  const value = (await cookies()).get(GUEST_BOOKING_COOKIE)?.value;
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [guestReservationId, expiresText, provided] = parts;
  const expires = Number(expiresText);
  if (!guestReservationId || !Number.isSafeInteger(expires)) return null;
  if (expires * 1000 <= Date.now()) return null;
  const payload = `${guestReservationId}.${expires}`;
  if (!equal(provided, signature(payload))) return null;
  return guestReservationId;
}

export async function getGuestReservationAccess(
  guestReservationId: string
) {
  if ((await guestIdFromCookie()) !== guestReservationId) return null;
  return prisma.guestReservation.findFirst({
    where: {
      id: guestReservationId,
      accessExpiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      accessExpiresAt: true,
    },
  });
}

export async function getCurrentGuestReservationId(): Promise<string | null> {
  const guestReservationId = await guestIdFromCookie();
  if (!guestReservationId) return null;
  const live = await prisma.guestReservation.findFirst({
    where: {
      id: guestReservationId,
      accessExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return live?.id ?? null;
}

export async function exchangeGuestAccessToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const access = await prisma.guestReservationAccessToken.findUnique({
    where: { tokenHash: hashSecurityToken(token) },
    select: {
      expiresAt: true,
      guestReservation: {
        select: { id: true, accessExpiresAt: true },
      },
    },
  });
  if (!access || access.expiresAt <= new Date()) return null;
  if (access.guestReservation.accessExpiresAt <= new Date()) return null;
  await setGuestBookingCookie(
    access.guestReservation.id,
    access.guestReservation.accessExpiresAt
  );
  return access.guestReservation.id;
}
