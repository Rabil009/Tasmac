import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/management/")({
  beforeLoad: () => {
    throw redirect({ to: "/management/cities" });
  },
});
