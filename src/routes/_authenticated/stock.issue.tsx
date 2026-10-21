import { createFileRoute } from "@tanstack/react-router";
import { StockOperationPage } from "@/components/stock/stock-operation";

export const Route = createFileRoute("/_authenticated/stock/issue")({
  head: () => ({
    meta: [
      { title: "Issue Stock · TASMAC Inventory" },
      {
        name: "description",
        content: "Record stock issued by the authorized shop.",
      },
      { property: "og:title", content: "Issue Stock · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Record stock issued by the authorized shop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StockOperationPage kind="issue" />,
});
