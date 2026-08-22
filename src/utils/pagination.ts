// Assignment spec requires offset pagination in this exact shape:
// { data: [], total: 0, page: 1, limit: 20 }
// Cursor pagination was also allowed, but offset is simpler and the
// task lists here are not expected to grow into millions of rows —
// simplest solution that satisfies the requirement (guideline: Simplicity First).

export interface PaginationParams {
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePagination(query: Record<string, unknown>): PaginationParams {
  let page = parseInt(String(query.page ?? DEFAULT_PAGE), 10);
  let limit = parseInt(String(query.limit ?? DEFAULT_LIMIT), 10);

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT; // prevent abuse (huge limit = expensive query)

  return { page, limit };
}

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return { data, total, page, limit };
}