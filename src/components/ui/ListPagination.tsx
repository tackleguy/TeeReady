interface Props {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}
export function ListPagination({ page, pages, total, pageSize, onPage }: Props) {
  if (pages <= 1) return null;
  return <nav aria-label="Course results pages" className="my-4 flex flex-wrap items-center justify-center gap-3 px-3 text-[13px] text-muted">
    <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className="min-h-[44px] rounded-xl border border-line bg-surface px-4 font-semibold text-ink disabled:opacity-40">Previous</button>
    <span aria-live="polite">{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total.toLocaleString()}</span>
    <button type="button" disabled={page + 1 === pages} onClick={() => onPage(page + 1)} className="min-h-[44px] rounded-xl border border-line bg-surface px-4 font-semibold text-ink disabled:opacity-40">Next</button>
  </nav>;
}
