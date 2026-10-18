"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/** Copies a value to the clipboard, with a brief confirmation. */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; failing silently is better than an
      // error dialog for a convenience action.
    }
  };

  return (
    <Tooltip content={copied ? "Copied" : label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        className={className}
        aria-label={`${label}: ${value}`}
      >
        {copied ? (
          <Check className="text-verified" aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </Button>
    </Tooltip>
  );
}
