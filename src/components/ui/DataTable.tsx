'use client';

import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T, index?: number) => React.ReactNode;
  sortable?: boolean;
  hiddenOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onSort?: (key: string, direction: 'asc' | 'desc' | null) => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc' | null;
  className?: string;
  rowClassName?: string;
}

export default function DataTable<T extends { id: string | number }>({
  columns,
  data,
  onSort,
  sortKey,
  sortDirection,
  className = '',
  rowClassName = '',
}: DataTableProps<T>) {
  const handleSort = (key: string) => {
    if (!onSort) return;
    
    let nextDirection: 'asc' | 'desc' | null = 'asc';
    if (sortKey === key) {
      if (sortDirection === 'asc') nextDirection = 'desc';
      else if (sortDirection === 'desc') nextDirection = null;
    }
    
    onSort(key, nextDirection);
  };

  return (
    <div className={`w-full overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm ${className}`}>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-outline-variant bg-surface/50 backdrop-blur-md">
              {columns.map((column) => (
                <th
                  key={column.key as string}
                  className={`px-4 py-3 text-[11px] font-bold text-outline uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:text-primary transition-colors' : ''
                  } ${column.hiddenOnMobile ? 'hidden md:table-cell' : ''}`}
                  onClick={() => column.sortable && handleSort(column.key as string)}
                  aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center gap-1.5">
                    {column.header}
                    {column.sortable && (
                      <div className="text-outline-variant">
                        {sortKey === column.key ? (
                          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        ) : (
                          <ChevronsUpDown size={14} />
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {data.length > 0 ? (
              data.map((item, index) => (
                <tr 
                  key={item.id} 
                  className={`group hover:bg-surface/80 transition-colors h-[48px] ${
                    index % 2 === 1 ? 'bg-surface/30' : ''
                  } ${rowClassName}`}
                >
                  {columns.map((column) => (
                    <td 
                      key={column.key as string} 
                      className={`px-4 py-2 text-sm text-on-surface-variant ${column.hiddenOnMobile ? 'hidden md:table-cell' : ''}`}
                    >
                      {column.render ? column.render(item, index) : (item[column.key as keyof T] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-outline text-sm">
                  Không tìm thấy dữ liệu
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
