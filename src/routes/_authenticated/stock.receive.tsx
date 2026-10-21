import { createFileRoute } from "@tanstack/react-router";
import { StockOperationPage } from "@/components/stock/stock-operation";

export const Route = createFileRoute("/_authenticated/stock/receive")({
  head: () => ({
    meta: [
      { title: "Receive Stock · TASMAC Inventory" },
      {
        name: "description",
        content: "Record stock received by the authorized shop.",
      },
      { property: "og:title", content: "Receive Stock · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Record stock received by the authorized shop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StockOperationPage kind="receive" />,
});
