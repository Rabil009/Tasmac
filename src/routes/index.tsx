import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "TASMAC Inventory" },
      {
        name: "description",
        content: "TASMAC inventory and stock tracking application.",
      },
      { property: "og:title", content: "TASMAC Inventory" },
      {
        property: "og:description",
        content: "TASMAC inventory and stock tracking application.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
