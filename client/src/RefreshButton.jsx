import React, { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import "./refresh-button.css";

const MINIMUM_FEEDBACK_MS = 700;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function RefreshButton({
  onRefresh,
  busy = false,
  disabled = false,
  className = "scorm-button-secondary",
  label = "Refresh",
  refreshingLabel = "Refreshing…",
  iconSize = 14,
  ...buttonProps
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshing = busy || showFeedback;

  async function handleRefresh(event) {
    if (refreshing || disabled) return;
    const startedAt = Date.now();
    setShowFeedback(true);
    try {
      await onRefresh?.(event);
    } finally {
      const remaining = MINIMUM_FEEDBACK_MS - (Date.now() - startedAt);
      if (remaining > 0) await wait(remaining);
      if (mounted.current) setShowFeedback(false);
    }
  }

  return (
    <button
      type="button"
      {...buttonProps}
      className={`${className} deva-refresh-button${refreshing ? " is-refreshing" : ""}`.trim()}
      onClick={handleRefresh}
      disabled={disabled || refreshing}
      aria-busy={refreshing}
    >
      <RefreshCw
        size={iconSize}
        className="deva-refresh-icon"
        aria-hidden="true"
      />
      <span>{refreshing ? refreshingLabel : label}</span>
    </button>
  );
}
