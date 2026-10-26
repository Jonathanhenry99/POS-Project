import { expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPin } from './pin';

it('kata sandi owner: aturan kekuatan dan hash yang bisa diverifikasi', async () => {
  expect(passwordProblem('abc12')).toBe('Kata sandi minimal 8 karakter');
  expect(passwordProblem('abcdefgh')).toBe('Kata sandi harus memuat huruf dan angka');
  expect(passwordProblem('12345678')).toBe('Kata sandi harus memuat huruf dan angka');
  expect(passwordProblem('Password123')).toBe('Kata sandi terlalu umum');
  expect(passwordProblem('owner2026x', 'owner')).toBe('Kata sandi tidak boleh memuat username');
  expect(passwordProblem('Kopi-susu-77')).toBeNull();
  const h = await hashPassword('Kopi-susu-77');
  expect(h.startsWith('pbkdf2$210000$')).toBe(true);
  expect(await verifyPin('Kopi-susu-77', h)).toBe(true);
  expect(await verifyPin('kopi-susu-77', h)).toBe(false);
});
