'use client';

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Bare month grid — Radix owns none of this, it's plain date-fns arithmetic. */
export function Calendar({
  selected,
  onSelect,
  month,
  onMonthChange,
}: {
  selected?: Date | null;
  onSelect: (date: Date) => void;
  month: Date;
  onMonthChange: (month: Date) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="w-64">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(subMonths(month, 1))}
          className="rounded p-1 hover:bg-accent"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">{format(month, 'MMMM yyyy')}</span>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="rounded p-1 hover:bg-accent"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={`${label}-${i}`}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = selected ? isSameDay(day, selected) : false;
          const inMonth = isSameMonth(day, month);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-sm hover:bg-accent',
                !inMonth && 'text-muted-foreground/50',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Radix Popover trigger button + `Calendar`, wired to a controlled `date-fns` `Date | null` value. */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value ?? new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-ring',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 opacity-60" />
          {value ? format(value, 'PPP') : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <Calendar
          selected={value}
          month={month}
          onMonthChange={setMonth}
          onSelect={(day) => {
            onChange(day);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
