import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Default admin account. Credentials come from the environment (.env) so they
// are never committed. Falls back to a placeholder you must change.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN", passwordHash },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      playerName: "admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  console.log(`✓ Admin ready: ${admin.email} (role ${admin.role})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
