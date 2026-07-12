import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main>
      <h1>Jokot Inward</h1>
      <p className="muted">Purchase bill tracking — Jokot International</p>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Sign in with the Google account registered for your role. Accounts
          not on the user list cannot sign in.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="primary" type="submit">
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
