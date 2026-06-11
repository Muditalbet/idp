import bcrypt from 'bcryptjs';
import { prisma, Role } from '../src/db';

/**
 * Seed demo identities. Services/environments are created at runtime through
 * the portal scaffolder, so we only seed teams + users here.
 */
async function main() {
  const platform = await prisma.team.upsert({
    where: { slug: 'platform' },
    update: {},
    create: { name: 'Platform Engineering', slug: 'platform' },
  });
  const payments = await prisma.team.upsert({
    where: { slug: 'payments' },
    update: {},
    create: { name: 'Payments', slug: 'payments' },
  });

  const adminHash = await bcrypt.hash('admin123', 10);
  const devHash = await bcrypt.hash('dev123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@idp.local' },
    update: {},
    create: {
      email: 'admin@idp.local',
      name: 'Ada Admin',
      passwordHash: adminHash,
      role: Role.PLATFORM_ADMIN,
      teamId: platform.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'dev@idp.local' },
    update: {},
    create: {
      email: 'dev@idp.local',
      name: 'Devon Dev',
      passwordHash: devHash,
      role: Role.DEVELOPER,
      teamId: payments.id,
    },
  });

  // eslint-disable-next-line no-console
  console.log('✅ Seeded teams (platform, payments) and users:');
  // eslint-disable-next-line no-console
  console.log('   admin@idp.local / admin123   (PLATFORM_ADMIN)');
  // eslint-disable-next-line no-console
  console.log('   dev@idp.local   / dev123      (DEVELOPER)');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
