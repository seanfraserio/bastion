import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeysTable } from "@/components/keys/keys-table";
import { GenerateKeyDialog } from "@/components/keys/generate-key-dialog";
import { RotateKeyDialog } from "@/components/keys/rotate-key-dialog";
import { mockApiKeys } from "@/lib/mock-data";

export default function KeysPage() {
  const keys = mockApiKeys;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">
            Manage proxy and control API keys for your tenant.
          </p>
        </div>
        <div className="flex gap-2">
          <RotateKeyDialog />
          <GenerateKeyDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <KeysTable keys={keys} />
        </CardContent>
      </Card>
    </div>
  );
}
