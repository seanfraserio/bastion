"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BookOpen, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";

// ---------------------------------------------------------------------------
// Doc sections (Diataxis structure)
// ---------------------------------------------------------------------------

interface DocItem {
  id: string;
  title: string;
  file: string;
}

interface DocSection {
  category: string;
  items: DocItem[];
}

const DOC_SECTIONS: DocSection[] = [
  {
    category: "Getting Started",
    items: [
      { id: "getting-started", title: "Quick Start Guide", file: "getting-started.md" },
    ],
  },
  {
    category: "How-to Guides",
    items: [
      { id: "self-hosting", title: "Self-Hosting", file: "self-hosting.md" },
    ],
  },
  {
    category: "Reference",
    items: [
      { id: "bastion-yaml", title: "bastion.yaml Reference", file: "bastion-yaml-reference.md" },
      { id: "providers", title: "Providers", file: "providers.md" },
      { id: "policies", title: "Policies", file: "policies.md" },
    ],
  },
  {
    category: "Concepts",
    items: [
      { id: "concepts", title: "Architecture & Concepts", file: "concepts.md" },
    ],
  },
  {
    category: "Enterprise",
    items: [
      { id: "enterprise", title: "Enterprise Features", file: "enterprise.md" },
    ],
  },
];

const GITHUB_RAW =
  "https://raw.githubusercontent.com/seanfraserio/bastion/main/docs";

// ---------------------------------------------------------------------------
// Page wrapper (Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

export default function DocsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <DocsContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function DocsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeId = searchParams.get("page") ?? "getting-started";

  // Resolve active item
  const allItems = DOC_SECTIONS.flatMap((s) => s.items);
  const activeItem = allItems.find((i) => i.id === activeId) ?? allItems[0];

  const [content, setContent] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`${GITHUB_RAW}/${activeItem.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load document (${r.status})`);
        return r.text();
      })
      .then((md) => {
        if (!cancelled) setContent(renderMarkdown(md));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeItem.file]);

  function handleSelect(id: string) {
    router.push(`/docs?page=${id}`);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar navigation */}
      <nav className="hidden w-56 shrink-0 border-r bg-card md:block">
        <div className="sticky top-0 overflow-y-auto p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-bastion-purple" />
            Documentation
          </div>

          {DOC_SECTIONS.map((section) => (
            <div key={section.category} className="mb-3">
              <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {section.category}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    activeItem.id === item.id
                      ? "bg-bastion-purple/15 font-medium text-bastion-purple-light"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {item.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile sidebar (select dropdown) */}
      <div className="border-b p-4 md:hidden">
        <select
          value={activeItem.id}
          onChange={(e) => handleSelect(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {DOC_SECTIONS.map((section) => (
            <optgroup key={section.category} label={section.category}>
              {section.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-12">
        <div className="mx-auto max-w-3xl">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading documentation...
              </span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-6">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Failed to load documentation
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : (
            <article
              className="md-article"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
