import { useState } from 'react';

/** Keep mounted rows bounded and reset synchronously when the filter changes. */
export function useListPage<T>(items: T[], filterKey: string, pageSize = 24) {
  const [selection, setSelection] = useState({ key: filterKey, page: 0 });
  if (selection.key !== filterKey) {
    setSelection({ key: filterKey, page: 0 });
  }
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(selection.key === filterKey ? selection.page : 0, pages - 1);
  return {
    items: items.slice(page * pageSize, (page + 1) * pageSize),
    page, pages, total: items.length, pageSize,
    onPage: (next: number) => setSelection({ key: filterKey, page: Math.max(0, Math.min(pages - 1, next)) }),
  };
}
