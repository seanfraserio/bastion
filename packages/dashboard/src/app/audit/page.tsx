"use client";

import { AuditTable } from "@/components/audit/audit-table";
import { mockExtendedAuditLog } from "@/lib/mock-data";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          Review every API request with full traceability and policy decisions.
        </p>
      </div>
      <AuditTable entries={mockExtendedAuditLog} />
    </div>
  );
}
