import { redirect } from "next/navigation";

export default function HomePage() {
  // For now, land directly on the projects list after login.
  redirect("/projects");
}
