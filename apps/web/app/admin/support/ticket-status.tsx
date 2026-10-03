"use client";

import { useAction } from "@/components/dashboard/client-kit";
import { NativeSelect } from "@/components/ui/input";
import { updateTicketAction } from "../actions";

type Status = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";

export function TicketStatus({ id, status }: { id: string; status: Status }) {
  const { pending, run } = useAction();
  return (
    <NativeSelect aria-label="Ticket status" value={status} disabled={pending} className="h-8 w-32 text-[13px]" onChange={(e) => run(() => updateTicketAction(id, e.target.value as Status), { success: "Ticket updated" })}>
      <option value="OPEN">Open</option>
      <option value="PENDING">Pending</option>
      <option value="RESOLVED">Resolved</option>
      <option value="CLOSED">Closed</option>
    </NativeSelect>
  );
}
