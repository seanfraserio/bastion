import { Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type Provider } from "@/lib/mock-data";

interface ProviderCardProps {
  provider: Provider;
  onEdit?: (provider: Provider) => void;
}

function ProviderIcon({ slug }: { slug: string }) {
  switch (slug) {
    case "anthropic":
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#d4a27f]/10">
          <span className="text-xl font-bold text-[#d4a27f]">A</span>
        </div>
      );
    case "openai":
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#10a37f]/10">
          <span className="text-xl font-bold text-[#10a37f]">O</span>
        </div>
      );
    case "ollama":
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
          <span className="text-xl font-bold text-white/80">L</span>
        </div>
      );
    default:
      return (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <span className="text-xl font-bold text-muted-foreground">
            {slug[0].toUpperCase()}
          </span>
        </div>
      );
  }
}

export function ProviderCard({ provider, onEdit }: ProviderCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <ProviderIcon slug={provider.slug} />
            <div>
              <h3 className="font-semibold">{provider.name}</h3>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    provider.configured
                      ? "border-green-500/30 bg-green-500/10 text-green-500"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {provider.configured ? "Configured" : "Not Configured"}
                </Badge>
                {provider.role !== "none" && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs capitalize",
                      provider.role === "primary"
                        ? "border-bastion-purple/30 bg-bastion-purple/10 text-bastion-purple"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {provider.role}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit?.(provider)}
          >
            <Settings className="mr-2 h-4 w-4" />
            {provider.configured ? "Edit" : "Configure"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
