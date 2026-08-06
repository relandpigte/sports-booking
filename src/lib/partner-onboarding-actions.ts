"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeAvatar, normalizeCoverPhotos } from "@/lib/avatar";
import { prisma } from "@/lib/db";
import { isPartnerImpersonationActive } from "@/lib/impersonation";
import { requirePartner } from "@/lib/dal";
import { PartnerApplicationSchema } from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";

export type PartnerApplicationFormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

function parseCoordinate(raw: string, min: number, max: number): number | null {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

export async function submitPartnerApplicationAction(
  _previous: PartnerApplicationFormState,
  formData: FormData
): Promise<PartnerApplicationFormState> {
  if (await isPartnerImpersonationActive()) {
    return {
      message:
        "Partner applications cannot be submitted during assisted access.",
    };
  }
  const partner = await requirePartner();
  if (partner.partnerStatus !== "DRAFT") {
    return { message: "This partner application has already been submitted." };
  }

  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    hubName: String(formData.get("hubName") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    hubAbout: String(formData.get("hubAbout") ?? ""),
    hubPhone: String(formData.get("hubPhone") ?? ""),
    hubEmail: String(formData.get("hubEmail") ?? ""),
    address: String(formData.get("address") ?? ""),
    games: formData.getAll("games").map(String),
    facebookPage: String(formData.get("facebookPage") ?? ""),
  };
  const values = {
    fullName: raw.fullName,
    phone: raw.phone,
    hubName: raw.hubName,
    slug: raw.slug,
    hubAbout: raw.hubAbout,
    hubPhone: raw.hubPhone,
    hubEmail: raw.hubEmail,
    address: raw.address,
    facebookPage: raw.facebookPage,
  };
  const parsed = PartnerApplicationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: firstErrors(parsed.error), values };
  }

  const logo = normalizeAvatar(String(formData.get("hubLogo") ?? ""));
  if (logo.error) return { errors: { hubLogo: logo.error }, values };
  const covers = normalizeCoverPhotos(
    formData.getAll("coverPhotos").map(String)
  );
  if (covers.error) {
    return { errors: { coverPhotos: covers.error }, values };
  }

  const existingHub = await prisma.hub.findFirst({
    where: { ownerId: partner.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      if (existingHub) {
        await tx.hub.update({
          where: { id: existingHub.id },
          data: {
            name: data.hubName,
            slug: data.slug,
            about: data.hubAbout ?? null,
            logo: logo.value,
            coverPhotos: covers.values,
            games: data.games,
            address: data.address,
            latitude: parseCoordinate(
              String(formData.get("latitude") ?? ""),
              -90,
              90
            ),
            longitude: parseCoordinate(
              String(formData.get("longitude") ?? ""),
              -180,
              180
            ),
            phone: data.hubPhone ?? data.phone,
            email: data.hubEmail ?? partner.email,
          },
        });
      } else {
        await tx.hub.create({
          data: {
            ownerId: partner.id,
            name: data.hubName,
            slug: data.slug,
            about: data.hubAbout ?? null,
            logo: logo.value,
            coverPhotos: covers.values,
            games: data.games,
            address: data.address,
            latitude: parseCoordinate(
              String(formData.get("latitude") ?? ""),
              -90,
              90
            ),
            longitude: parseCoordinate(
              String(formData.get("longitude") ?? ""),
              -180,
              180
            ),
            phone: data.hubPhone ?? data.phone,
            email: data.hubEmail ?? partner.email,
          },
        });
      }

      const submitted = await tx.user.updateMany({
        where: {
          id: partner.id,
          role: "PARTNER",
          partnerStatus: "DRAFT",
        },
        data: {
          partnerStatus: "PENDING",
          name: data.hubName,
          playerName: data.fullName,
          phone: data.phone,
          facebookPage: data.facebookPage ?? null,
          image: logo.value,
        },
      });
      if (submitted.count !== 1) {
        throw new Error("PARTNER_APPLICATION_ALREADY_SUBMITTED");
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "PARTNER_APPLICATION_ALREADY_SUBMITTED"
    ) {
      return { message: "This partner application has already been submitted." };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { errors: { slug: "That public URL is already taken" }, values };
    }
    throw error;
  }

  revalidatePath("/dashboard/partner");
  revalidatePath("/users");
  redirect("/dashboard/partner?submitted=1");
}
