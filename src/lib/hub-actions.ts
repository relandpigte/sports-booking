"use server";

import * as z from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/hubs";
import { HubSchema } from "@/lib/validation";
import { normalizeAvatar, normalizeCoverPhotos } from "@/lib/avatar";
import {
  WEEKDAYS,
  GAME_VALUES,
  COURT_TYPE_VALUES,
  type OperatingHours,
  type Weekday,
} from "@/lib/constants";

type CourtInput = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
};

function parseCourts(formData: FormData): CourtInput[] {
  const ids = formData.getAll("courtIds").map((v) => String(v));
  const names = formData.getAll("courtNames").map((v) => String(v));
  const types = formData.getAll("courtTypes").map((v) => String(v));
  const rates = formData.getAll("courtRates").map((v) => String(v));
  const allowedType = new Set<string>(COURT_TYPE_VALUES);

  const out: CourtInput[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = (names[i] ?? "").trim();
    if (!name) continue;
    const courtType = allowedType.has(types[i]) ? types[i] : "covered";
    const rateNum = parseFloat(rates[i] ?? "");
    const hourlyRate =
      Number.isFinite(rateNum) && rateNum >= 0
        ? Math.round(rateNum * 100) / 100
        : null;
    out.push({ id: ids[i] ?? "", name, courtType, hourlyRate });
  }
  return out;
}

export type HubFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

function firstErrors(error: z.ZodError): Record<string, string> {
  const { fieldErrors } = z.flattenError(error) as {
    fieldErrors: Record<string, string[] | undefined>;
  };
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) out[key] = messages[0];
  }
  return out;
}

function parseOperatingHours(formData: FormData): OperatingHours {
  const out = {} as OperatingHours;
  for (const { value } of WEEKDAYS) {
    const d = value as Weekday;
    const closed = formData.get(`day_${d}_closed`) === "on";
    const open = String(formData.get(`day_${d}_open`) ?? "");
    const close = String(formData.get(`day_${d}_close`) ?? "");
    out[d] = { closed, open: closed ? "" : open, close: closed ? "" : close };
  }
  return out;
}

type ParsedHub = {
  data: {
    name: string;
    about?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  logo: string | null;
  coverPhotos: string[];
  games: string[];
  courts: CourtInput[];
  latitude: number | null;
  longitude: number | null;
  operatingHours: OperatingHours;
};

function parseCoord(raw: string, min: number, max: number): number | null {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function parseGames(formData: FormData): string[] {
  const allowed = new Set<string>(GAME_VALUES);
  return formData
    .getAll("games")
    .map((v) => String(v))
    .filter((v) => allowed.has(v));
}

// Shared parse/validate for create and update. Returns the parsed hub, or an
// error state to return to the form.
function parseHubForm(
  formData: FormData
): { ok: true; hub: ParsedHub } | { ok: false; state: HubFormState } {
  const values = {
    name: String(formData.get("name") ?? ""),
    about: String(formData.get("about") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = HubSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, state: { errors: firstErrors(parsed.error), values } };
  }

  const logo = normalizeAvatar(String(formData.get("logo") ?? ""));
  if (logo.error) {
    return { ok: false, state: { errors: { logo: logo.error }, values } };
  }

  const covers = normalizeCoverPhotos(
    formData.getAll("coverPhotos").map((v) => String(v))
  );
  if (covers.error) {
    return { ok: false, state: { errors: { coverPhotos: covers.error }, values } };
  }

  return {
    ok: true,
    hub: {
      data: parsed.data,
      logo: logo.value,
      coverPhotos: covers.values,
      games: parseGames(formData),
      courts: parseCourts(formData),
      latitude: parseCoord(String(formData.get("latitude") ?? ""), -90, 90),
      longitude: parseCoord(String(formData.get("longitude") ?? ""), -180, 180),
      operatingHours: parseOperatingHours(formData),
    },
  };
}

export async function createHubAction(
  _prev: HubFormState,
  formData: FormData
): Promise<HubFormState> {
  const partner = await requirePartner();

  const result = parseHubForm(formData);
  if (!result.ok) return result.state;
  const { data, logo, coverPhotos, games, courts, latitude, longitude, operatingHours } =
    result.hub;

  await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: data.name,
      about: data.about ?? null,
      address: data.address ?? null,
      latitude,
      longitude,
      phone: data.phone ?? null,
      email: data.email ?? null,
      logo,
      coverPhotos,
      games,
      operatingHours: operatingHours as unknown as Prisma.InputJsonValue,
      courts: {
        create: courts.map((c) => ({
          name: c.name,
          courtType: c.courtType,
          hourlyRate: c.hourlyRate,
        })),
      },
    },
  });

  revalidatePath("/dashboard/hubs");
  redirect("/dashboard/hubs");
}

export async function updateHubAction(
  _prev: HubFormState,
  formData: FormData
): Promise<HubFormState> {
  const partner = await requirePartner();
  const id = String(formData.get("id") ?? "");

  const owned = await prisma.hub.findFirst({
    where: { id, ownerId: partner.id },
    select: { id: true },
  });
  if (!owned) {
    return { message: "Hub not found." };
  }

  const result = parseHubForm(formData);
  if (!result.ok) return result.state;
  const { data, logo, coverPhotos, games, courts, latitude, longitude, operatingHours } =
    result.hub;

  await prisma.hub.update({
    where: { id },
    data: {
      name: data.name,
      about: data.about ?? null,
      address: data.address ?? null,
      latitude,
      longitude,
      phone: data.phone ?? null,
      email: data.email ?? null,
      logo,
      coverPhotos,
      games,
      operatingHours: operatingHours as unknown as Prisma.InputJsonValue,
    },
  });

  // Reconcile courts: update kept ones, create new, delete removed.
  // Existing-id checks keep this scoped to this hub's courts.
  const existing = await prisma.court.findMany({
    where: { hubId: id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = new Set(
    courts.filter((c) => c.id && existingIds.has(c.id)).map((c) => c.id)
  );

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const toDelete = existing
    .filter((e) => !keptIds.has(e.id))
    .map((e) => e.id);
  if (toDelete.length) {
    ops.push(prisma.court.deleteMany({ where: { id: { in: toDelete } } }));
  }
  for (const c of courts) {
    if (c.id && existingIds.has(c.id)) {
      ops.push(
        prisma.court.update({
          where: { id: c.id },
          data: { name: c.name, courtType: c.courtType, hourlyRate: c.hourlyRate },
        })
      );
    } else {
      ops.push(
        prisma.court.create({
          data: {
            hubId: id,
            name: c.name,
            courtType: c.courtType,
            hourlyRate: c.hourlyRate,
          },
        })
      );
    }
  }
  if (ops.length) await prisma.$transaction(ops);

  revalidatePath("/dashboard/hubs");
  redirect("/dashboard/hubs");
}

export async function deleteHubAction(formData: FormData) {
  const partner = await requirePartner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Ownership-scoped delete.
  await prisma.hub.deleteMany({ where: { id, ownerId: partner.id } });
  revalidatePath("/dashboard/hubs");
}
