// Seed data per assignment spec:
// 2 organizations, 5 users, multiple projects, 10+ tasks (distributed
// across projects with varying status/priority), assignments, comments.

import { PrismaClient, TaskStatus, TaskPriority, OrgRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_COST = 12; // matches Task 02 requirement: cost factor >= 12

async function main() {
  // Wipe in FK-safe order (children first) — seed script is idempotent
  // for local/dev re-runs only, never point this at a prod DB.
  await prisma.comment.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.orgMember.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const passwordHash = await bcrypt.hash('Password@123', BCRYPT_COST);

  // ── Organizations ────────────────────────────────────────────
  const acme = await prisma.organization.create({ data: { name: 'Acme Corp' } });
  const globex = await prisma.organization.create({ data: { name: 'Globex Inc' } });

  // ── Users (5 total) ──────────────────────────────────────────
  const alice = await prisma.user.create({ data: { email: 'alice@acme.com', name: 'Alice Sharma', passwordHash } });
  const bob = await prisma.user.create({ data: { email: 'bob@acme.com', name: 'Bob Verma', passwordHash } });
  const carol = await prisma.user.create({ data: { email: 'carol@acme.com', name: 'Carol Iyer', passwordHash } });
  const dave = await prisma.user.create({ data: { email: 'dave@globex.com', name: 'Dave Mehta', passwordHash } });
  const eve = await prisma.user.create({ data: { email: 'eve@globex.com', name: 'Eve Kapoor', passwordHash } });

  // ── Org membership + roles ───────────────────────────────────
  await prisma.orgMember.createMany({
    data: [
      { orgId: acme.id, userId: alice.id, role: OrgRole.org_admin },
      { orgId: acme.id, userId: bob.id, role: OrgRole.member },
      { orgId: acme.id, userId: carol.id, role: OrgRole.member },
      { orgId: globex.id, userId: dave.id, role: OrgRole.org_admin },
      { orgId: globex.id, userId: eve.id, role: OrgRole.member },
    ],
  });

  // ── Projects ──────────────────────────────────────────────────
  const website = await prisma.project.create({ data: { orgId: acme.id, name: 'Website Revamp', description: 'Redesign the marketing site' } });
  const mobileApp = await prisma.project.create({ data: { orgId: acme.id, name: 'Mobile App', description: 'iOS/Android launch' } });
  const migration = await prisma.project.create({ data: { orgId: globex.id, name: 'Data Migration', description: 'Legacy DB migration to Postgres' } });

  // ── Tasks (10+, distributed across projects/status/priority) ──
  const taskDefs = [
    { project: website, title: 'Design homepage hero section', status: TaskStatus.done, priority: TaskPriority.high },
    { project: website, title: 'Set up CI pipeline', status: TaskStatus.in_progress, priority: TaskPriority.medium },
    { project: website, title: 'Write landing page copy', status: TaskStatus.todo, priority: TaskPriority.low },
    { project: website, title: 'Fix mobile nav overlap bug', status: TaskStatus.review, priority: TaskPriority.urgent },
    { project: mobileApp, title: 'Implement push notifications', status: TaskStatus.todo, priority: TaskPriority.high },
    { project: mobileApp, title: 'Set up app store listing', status: TaskStatus.todo, priority: TaskPriority.medium },
    { project: mobileApp, title: 'Integrate crash reporting', status: TaskStatus.in_progress, priority: TaskPriority.high },
    { project: mobileApp, title: 'QA pass on Android 14', status: TaskStatus.review, priority: TaskPriority.medium },
    { project: migration, title: 'Schema mapping doc', status: TaskStatus.done, priority: TaskPriority.high },
    { project: migration, title: 'Write migration scripts', status: TaskStatus.in_progress, priority: TaskPriority.urgent },
    { project: migration, title: 'Dry-run on staging', status: TaskStatus.todo, priority: TaskPriority.high },
    { project: migration, title: 'Rollback plan documentation', status: TaskStatus.todo, priority: TaskPriority.low },
  ];

  const createdTasks = [];
  for (const t of taskDefs) {
    const task = await prisma.task.create({
      data: {
        projectId: t.project.id,
        title: t.title,
        description: `${t.title} — seeded task`,
        status: t.status,
        priority: t.priority,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    createdTasks.push(task);
  }

  // ── Assignments (sample) ────────────────────────────────────
  await prisma.taskAssignment.createMany({
    data: [
      { taskId: createdTasks[0].id, userId: alice.id },
      { taskId: createdTasks[1].id, userId: bob.id },
      { taskId: createdTasks[3].id, userId: carol.id },
      { taskId: createdTasks[4].id, userId: bob.id },
      { taskId: createdTasks[8].id, userId: dave.id },
      { taskId: createdTasks[9].id, userId: eve.id },
    ],
  });

  // ── Comments (sample) ────────────────────────────────────────
  await prisma.comment.createMany({
    data: [
      { taskId: createdTasks[0].id, userId: alice.id, content: 'Looks good, shipping this.' },
      { taskId: createdTasks[3].id, userId: carol.id, content: 'Reproduced on iOS Safari, investigating.' },
      { taskId: createdTasks[9].id, userId: dave.id, content: 'Scripts ready for review, see PR #42.' },
    ],
  });

  console.log('Seed complete:', {
    organizations: 2,
    users: 5,
    projects: 3,
    tasks: createdTasks.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
