import { createFileRoute } from "@tanstack/react-router";
import { StockOperationPage } from "@/components/stock/stock-operation";

export const Route = createFileRoute("/_authenticated/stock/adjust")({
  head: () => ({
    meta: [
      { title: "Adjust Stock · TASMAC Inventory" },
      {
        name: "description",
        content: "Submit controlled corrections to stock balances.",
      },
      { property: "og:title", content: "Adjust Stock · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Submit controlled corrections to stock balances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StockOperationPage kind="adjust" />,
});
