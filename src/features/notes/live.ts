import { pb } from "@/services/pocketbase";

// A hint that one of the writer's notes changed (specs/003-live-updates/contracts/notice.md).
export type Notice = {
  id: string;
  folder: string;
  deleted: boolean;
  revision: number;
  pinned?: boolean;
};

function parse(data: unknown): Notice | undefined {
  if (!data || typeof data !== "object") return;
  const { id, folder, deleted, revision, pinned } = data as Record<
    string,
    unknown
  >;
  if (
    typeof id !== "string" ||
    !/^[a-z0-9]{15}$/.test(id) ||
    typeof folder !== "string" ||
    typeof deleted !== "boolean" ||
    !Number.isSafeInteger(revision) ||
    (revision as number) < 1 ||
    (pinned !== undefined && typeof pinned !== "boolean")
  )
    return;
  return {
    id,
    folder,
    deleted,
    revision: revision as number,
    ...(pinned === undefined ? {} : { pinned }),
  };
}

export function watchNotebook(
  onNotice: (notice: Notice) => void,
  onReconnect: () => void,
) {
  let connects = 0;
  let stopped = false;
  const state = { failed: false, stop };
  // The SDK resubmits subscriptions on every connect but never replays missed messages.
  Promise.all([
    pb.realtime.subscribe("PB_CONNECT", () => {
      if (!stopped && connects++ > 0) onReconnect();
    }),
    pb.realtime.subscribe("notebook-changes", (data) => {
      const notice = parse(data);
      if (!stopped && notice) onNotice(notice);
    }),
  ]).catch(() => {
    // The SDK does not retry a failed first connect; the caller retries on focus or online.
    if (!stopped) state.failed = true;
    stop();
  });
  function stop() {
    if (stopped) return;
    stopped = true;
    void pb.realtime.unsubscribe("notebook-changes").catch(() => undefined);
    void pb.realtime.unsubscribe("PB_CONNECT").catch(() => undefined);
  }
  return state;
}
