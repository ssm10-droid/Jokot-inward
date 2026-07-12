import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { signOut } from "@/auth";

/**
 * Phase 0 landing: proves end to end that Google sign-in works, the email
 * is matched against the users table, and the role comes from the database.
 * Phase 1 replaces this with role-appropriate queue screens.
 */
export default async function Home() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  return (
    <main>
      <h1>Jokot Inward</h1>
      <p className="muted">Foundation check — Phase 0</p>
      <div className="card">
        <p style={{ margin: "0 0 8px" }}>
          Signed in as <strong>{user.name}</strong>
          <br />
          <span className="muted">{user.email}</span>
        </p>
        <p style={{ margin: "12px 0" }}>
          Role from database: <span className="role-chip">{user.role}</span>
        </p>
        <p className="muted" style={{ margin: "12px 0 16px" }}>
          If this chip shows the right role for this account, auth and the
          role lookup are working. Next: Gate entry and the GRN queue.
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="plain" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
