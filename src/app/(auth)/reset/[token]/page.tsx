import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Set new password" };

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResetPage({ params }: Props) {
  const { token } = await params;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Choose something at least 12 characters long. You&apos;ll be signed out of any other
          devices.
        </p>
      </div>
      <ResetForm token={token} />
      <p className="text-sm text-neutral-600">
        Link expired or having trouble?{" "}
        <Link href="/forgot" className="font-medium underline">
          Request a new one
        </Link>
      </p>
    </div>
  );
}
