"use client";

import { useState, type ReactNode } from "react";
import { ClientUniverse } from "@/components/viz/ClientUniverse";
import { defaultSegment } from "@/components/viz/universe-layout";
import type { ClientRow, Universe } from "@/lib/clients/types";
import { ClientsWorkspace } from "./ClientsWorkspace";

// The client universe and the client list share one selection: picking a type
// on the radar selects its first client, and picking a client selects its type.

type Props = {
  clients: ClientRow[];
  universe: Universe;
  focusId: string | null;
  action?: ReactNode;
};

export function ClientsBody({ clients, universe, focusId, action }: Props) {
  const focus = clients.find((c) => c.id === focusId);
  const [selId, setSelId] = useState<string | null>(focus?.id ?? clients[0]?.id ?? null);
  const [segment, setSegment] = useState<string | null>(focus?.segment ?? defaultSegment(universe.segments));
  const [seenFocus, setSeenFocus] = useState(focusId);

  // Search can open another client while this page is showing.
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focus) {
      setSelId(focus.id);
      if (focus.segment) setSegment(focus.segment);
    }
  }

  function pickSegment(name: string) {
    setSegment(name);
    const first = clients.find((c) => c.segment === name);
    if (first) setSelId(first.id);
  }

  function pickClient(id: string) {
    setSelId(id);
    const seg = clients.find((c) => c.id === id)?.segment;
    if (seg) setSegment(seg);
  }

  return (
    <>
      <ClientUniverse universe={universe} selected={segment} onSelect={pickSegment} action={action} />
      <ClientsWorkspace clients={clients} selectedId={selId} onSelect={pickClient} />
    </>
  );
}
