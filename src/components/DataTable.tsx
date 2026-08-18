import { ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (row: T) => void;
};

export default function DataTable<T>({
  columns, rows, rowKey, loading, emptyTitle = 'Nothing here yet', emptyHint, emptyIcon, onRowClick,
}: Props<T>) {
  const alignClass = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-ink-100 bg-ivory-100/40">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={`px-5 py-3 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400 ${alignClass(c.align)}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-ink-100/70">
                  {columns.map((c, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 w-24 animate-pulse rounded-full bg-ink-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-16 text-center">
                  <div className="mx-auto flex flex-col items-center gap-2">
                    {emptyIcon && (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                        {emptyIcon}
                      </div>
                    )}
                    <p className="text-sm font-medium text-ink-700">{emptyTitle}</p>
                    {emptyHint && <p className="text-xs text-ink-400">{emptyHint}</p>}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-ink-100/70 last:border-b-0 transition ${
                    onRowClick ? 'cursor-pointer hover:bg-ivory-100/50' : ''
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-5 py-3.5 text-sm text-ink-900 ${alignClass(c.align)}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
