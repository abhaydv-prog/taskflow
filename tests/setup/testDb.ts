import { PrismaClient } from '@prisma/client';
import { prisma as appPrisma } from '../../src/lib/prisma';

export const testPrisma = new PrismaClient();


export async function cleanDatabase() {
  await testPrisma.comment.deleteMany();
  await testPrisma.taskAssignment.deleteMany();
  await testPrisma.task.deleteMany();
  await testPrisma.project.deleteMany();
  await testPrisma.orgMember.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.organization.deleteMany();
}


export async function disconnectDatabase() {
  await testPrisma.$disconnect();
  await appPrisma.$disconnect();
}