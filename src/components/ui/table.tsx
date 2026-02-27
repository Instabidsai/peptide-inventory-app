import * as React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/use-sortable-table";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-xl">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-semibold [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors duration-150 data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-semibold text-muted-foreground uppercase text-xs tracking-wider [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

// --- Sortable table head ---------------------------------------------------

interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** The column key this header controls */
  columnKey: string;
  /** Currently active sort column (null = unsorted) */
  activeColumn: string | null;
  /** Current sort direction */
  direction: SortDirection;
  /** Called when the user clicks to sort */
  onSort: (key: string) => void;
}

const SortableTableHead = React.forwardRef<HTMLTableCellElement, SortableTableHeadProps>(
  ({ className, columnKey, activeColumn, direction, onSort, children, ...props }, ref) => {
    const isActive = activeColumn === columnKey;
    return (
      <th
        ref={ref}
        className={cn(
          "h-12 px-4 text-left align-middle font-semibold text-muted-foreground uppercase text-xs tracking-wider select-none cursor-pointer transition-colors hover:text-foreground group [&:has([role=checkbox])]:pr-0",
          isActive && "text-foreground",
          className,
        )}
        onClick={() => onSort(columnKey)}
        aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
        {...props}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {isActive ? (
            direction === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
          )}
        </span>
      </th>
    );
  },
);
SortableTableHead.displayName = "SortableTableHead";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, SortableTableHead };
