"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth/client";
import { validatePassword } from "@/lib/auth/password-policy";

export function SignUpForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = readField(form, "email").trim();
    const password = readField(form, "password");
    const name = readField(form, "name").trim();

    const policy = validatePassword(password);
    if (!policy.valid) {
      setError(policy.error ?? "Invalid password");
      return;
    }

    setPending(true);
    const result = await signUp.email({ email, password, name });
    if (result.error) {
      setError(result.error.message ?? "Sign-up failed");
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
    >
      <Field name="name" label="Display name" type="text" autoComplete="name" required />
      <Field name="email" label="Email" type="email" autoComplete="email" required />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

function readField(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

function Field({
  name,
  label,
  type,
  autoComplete,
  required,
}: {
  name: string;
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}
