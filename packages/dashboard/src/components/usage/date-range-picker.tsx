"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DateRange = "7d" | "30d" | "90d";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange, start: Date, end: Date) => void;
}

const presets: { label: string; value: DateRange; days: number }[] = [
  { label: "7d", value: "7d", days: 7 },
  { label: "30d", value: "30d", days: 30 },
  { label: "90d", value: "90d", days: 90 },
];

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  function handleSelect(preset: (typeof presets)[number]) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - preset.days);
    onChange(preset.value, start, end);
  }

  return (
    <div className="flex items-center gap-1">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={value === preset.value ? "default" : "outline"}
          size="sm"
          className={cn(
            value === preset.value
              ? ""
              : "text-muted-foreground"
          )}
          onClick={() => handleSelect(preset)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
