import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../../src/utils/password';

describe('hashPassword / comparePassword', () => {
  it('produces a bcrypt hash that is not the plaintext password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
  });

  it('uses cost factor 12, matching the assignment minimum requirement', async () => {
    const hash = await hashPassword('any-password');
    // bcrypt hash format: $2b$<cost>$<22-char-salt><31-char-hash>
    const costFactor = hash.split('$')[2];
    expect(Number(costFactor)).toBe(12);
  });

  it('comparePassword returns true for the correct password', async () => {
    const hash = await hashPassword('my-secret-password');
    await expect(comparePassword('my-secret-password', hash)).resolves.toBe(true);
  });

  it('comparePassword returns false for an incorrect password', async () => {
    const hash = await hashPassword('my-secret-password');
    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('comparePassword is case-sensitive', async () => {
    const hash = await hashPassword('CaseSensitive123');
    await expect(comparePassword('casesensitive123', hash)).resolves.toBe(false);
  });

  it('produces a different hash each time (random salt) even for the same input', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
    // but both still validate against the original password
    await expect(comparePassword('same-password', hash1)).resolves.toBe(true);
    await expect(comparePassword('same-password', hash2)).resolves.toBe(true);
  });
});