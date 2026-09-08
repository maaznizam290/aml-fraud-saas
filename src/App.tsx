import { useState } from "react";
import Dashboard from "./components/Dashboard.js";
import TransactionSimulator from "./components/TransactionSimulator.js";

type DemoUser = { id: string; role: "analyst" | "chief_compliance_officer"; label: string };

// Stand-in for a real auth session in this MVP: the header-based x-user-id
// authorization model (see server/routes/hermes.ts) maps directly onto
// these two seeded demo profiles (server/db.ts InMemoryStore).
const DEMO_USERS: DemoUser[] = [
  { id: "analyst-1", role: "analyst", label: "Analyst (Fatima R.)" },
  { id: "cco-1", role: "chief_compliance_officer", label: "Chief Compliance Officer (Imran K.)" },
];

export default function App() {
  const [userIndex, setUserIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const currentUser = DEMO_USERS[userIndex];

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 sm:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-50">AML Fraud SaaS — Compliance Workspace</h1>
          <p className="text-xs text-slate-500">
            Every AI recommendation here is advisory only — a human analyst makes the final call.
          </p>
        </div>
        <label className="text-xs text-slate-400">
          Signed in as{" "}
          <select
            value={userIndex}
            onChange={(e) => setUserIndex(Number(e.target.value))}
            className="ml-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
          >
            {DEMO_USERS.map((user, index) => (
              <option key={user.id} value={index}>
                {user.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="mb-4">
        <TransactionSimulator onEvaluated={() => setRefreshKey((k) => k + 1)} />
      </div>

      <Dashboard key={refreshKey} currentUserId={currentUser.id} currentUserRole={currentUser.role} />
    </div>
  );
}
