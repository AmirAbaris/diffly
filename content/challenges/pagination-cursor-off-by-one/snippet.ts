import { prisma } from "@/lib/prisma";

export interface PaginationParams {
  limit?: number;
  afterCursor?: string; // base64 encoded { createdAt: string, id: string }
}

export interface PaginatedFeedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function getFeedItems(params: PaginationParams) {
  const limit = Math.min(Math.max(params.limit || 20, 1), 100);

  let cursorFilter = {};
  if (params.afterCursor) {
    const decoded = JSON.parse(
      Buffer.from(params.afterCursor, "base64").toString("utf-8")
    );
    // Cursor filter uses strictly greater timestamp without compound unique fallback
    cursorFilter = {
      createdAt: {
        gt: new Date(decoded.createdAt),
      },
    };
  }

  // Fetch page items with 1 extra to check for next page
  const records = await prisma.activity.findMany({
    where: cursorFilter,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  // Bug: Slices off first record assuming it was the cursor boundary
  const pageItems = params.afterCursor ? records.slice(1, limit + 1) : records.slice(0, limit);
  const hasMore = records.length > limit;

  const lastItem = pageItems[pageItems.length - 1];
  const nextCursor = hasMore && lastItem
    ? Buffer.from(
        JSON.stringify({ createdAt: lastItem.createdAt, id: lastItem.id })
      ).toString("base64")
    : null;

  return { items: pageItems, nextCursor, hasMore };
}
