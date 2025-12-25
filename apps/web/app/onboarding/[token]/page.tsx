"use client";

import { useParams } from "next/navigation";
import PublicOnboardingForm from "../public-onboarding-form";

export default function PublicOnboardingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  if (!token) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Prospective candidate onboarding</h1>
        <p>Missing onboarding token.</p>
      </main>
    );
  }

  return <PublicOnboardingForm token={token} />;
}
