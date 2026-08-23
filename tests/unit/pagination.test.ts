import { describe, it, expect } from 'vitest';
import { parsePagination, paginatedResponse } from '../../src/utils/pagination';

describe('parsePagination', () => {
  it('defaults to page 1, limit 20 when query is empty', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20 });
  });

  it('parses valid numeric strings from query params', () => {
    expect(parsePagination({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('falls back to default page when page is 0 or negative', () => {
    expect(parsePagination({ page: '0' })).toEqual({ page: 1, limit: 20 });
    expect(parsePagination({ page: '-5' })).toEqual({ page: 1, limit: 20 });
  });

  it('falls back to default page when page is non-numeric', () => {
    expect(parsePagination({ page: 'abc' })).toEqual({ page: 1, limit: 20 });
  });

  it('falls back to default limit when limit is 0, negative, or non-numeric', () => {
    expect(parsePagination({ limit: '0' })).toEqual({ page: 1, limit: 20 });
    expect(parsePagination({ limit: '-10' })).toEqual({ page: 1, limit: 20 });
    expect(parsePagination({ limit: 'xyz' })).toEqual({ page: 1, limit: 20 });
  });

  it('caps limit at 100 even if a larger value is requested', () => {
    expect(parsePagination({ limit: '500' })).toEqual({ page: 1, limit: 100 });
  });

  it('accepts limit exactly at the cap boundary', () => {
    expect(parsePagination({ limit: '100' })).toEqual({ page: 1, limit: 100 });
  });

  it('accepts page/limit already as numbers, not just strings', () => {
    expect(parsePagination({ page: 2, limit: 10 })).toEqual({ page: 2, limit: 10 });
  });
});

describe('paginatedResponse', () => {
  it('returns the exact shape required by the assignment spec', () => {
    const result = paginatedResponse([{ id: 1 }, { id: 2 }], 42, 2, 20);
    expect(result).toEqual({
      data: [{ id: 1 }, { id: 2 }],
      total: 42,
      page: 2,
      limit: 20,
    });
  });

  it('handles an empty data array', () => {
    const result = paginatedResponse([], 0, 1, 20);
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });
});