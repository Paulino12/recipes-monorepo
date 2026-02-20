"use client";

import { Button } from "@/components/ui/button";

export function PrintRecipeButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      Print recipe
    </Button>
  );
}

