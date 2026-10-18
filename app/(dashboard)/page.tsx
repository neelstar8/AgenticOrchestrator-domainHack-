import { redirect } from "next/navigation";

/** The dashboard root redirects to the overview. */
export default function DashboardIndex() {
  redirect("/overview");
}
