import { useEffect, useState } from "react";
import { pb } from "@/services/pocketbase";

export function useAdminCapability() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let generation = 0;
    const unsubscribe = pb.authStore.onChange(async (token) => {
      const current = ++generation;
      setAllowed(false);
      if (!pb.authStore.isValid) return;
      try {
        const result = await pb.send<{ isAdmin: boolean }>(
          "/api/notes/capabilities",
          {
            method: "GET",
            headers: { Authorization: token },
            requestKey: null,
          },
        );
        if (current === generation) setAllowed(result.isAdmin === true);
      } catch {
        // Loading and failed lookups never grant visibility.
      }
    }, true);
    return () => {
      generation++;
      unsubscribe();
    };
  }, []);
  return allowed;
}
