import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/stock/")({
  beforeLoad: () => {
    throw redirect({ to: "/stock/receive" });
  },
});
