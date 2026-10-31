import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { loadFinanceBasics } from "@/lib/finance/queries";
import { CategoryRowActions, NewCategoryButton } from "./category-forms";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { categories } = await loadFinanceBasics();
  const groups = [
    { kind: "expense" as const, title: "Expense categories" },
    { kind: "income" as const, title: "Income categories" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Money"
        title="Categories"
        description="Your categories are private to you. Rename or archive any of them, including the defaults."
        action={<NewCategoryButton />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => {
          const items = categories.filter((c) => c.kind === g.kind);
          return (
            <Card key={g.kind}>
              <CardHeader
                title={g.title}
                description={`${items.filter((c) => !c.archived).length} active`}
              />
              <CardBody>
                <ul className="divide-line divide-y">
                  {items.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className={c.archived ? "text-ink-subtle line-through" : "text-ink"}>
                          {c.name}
                        </span>
                        {c.archived ? <Badge>Archived</Badge> : null}
                      </span>
                      <CategoryRowActions
                        id={c.id}
                        name={c.name}
                        version={c.version}
                        archived={c.archived}
                      />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
