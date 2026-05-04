"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";

export const useChainTimestamp = (pollIntervalMs = 5000) => {
  const publicClient = usePublicClient();
  const [chainTimestamp, setChainTimestamp] = useState<number>();

  useEffect(() => {
    if (!publicClient) {
      return;
    }

    let cancelled = false;

    const fetchTimestamp = async () => {
      try {
        const block = await publicClient.getBlock({ blockTag: "latest" });
        if (!cancelled) {
          setChainTimestamp(Number(block.timestamp));
        }
      } catch (err) {
        console.error("[chain-timestamp] Failed to fetch latest block timestamp:", err);
      }
    };

    void fetchTimestamp();
    const interval = window.setInterval(fetchTimestamp, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [publicClient, pollIntervalMs]);

  return chainTimestamp;
};
