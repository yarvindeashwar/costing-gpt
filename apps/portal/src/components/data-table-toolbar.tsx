'use client'

import * as React from 'react'
import { Table } from '@tanstack/react-table'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableViewOptions } from '@/components/data-table-view-options'
import { DataTableFacetedFilter } from '@/components/data-table-faceted-filter'

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  searchKey?: string
  filterOptions?: {
    columnId: string
    title: string
    options: { label: string; value: string }[]
  }[]
}

export function DataTableToolbar<TData>({
  table,
  searchKey,
  filterOptions = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {searchKey && (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
              onChange={(event) =>
                table.getColumn(searchKey)?.setFilterValue(event.target.value)
              }
              className="h-8 w-[150px] pl-8 lg:w-[250px]"
            />
          </div>
        )}

        {filterOptions.map(({ columnId, title, options }) => (
          table.getColumn(columnId) && (
            <DataTableFacetedFilter
              key={columnId}
              column={table.getColumn(columnId)}
              title={title}
              options={options}
            />
          )
        ))}

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  )
}
