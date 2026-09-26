import { useCallback, useEffect, useState } from "react";
import { fetchSaleStatus, purchase, type PurchaseOutcome, type SaleStatus } from "./api";
import "./App.css";

const POLL_INTERVAL_MS = 2000;
const USER_ID_KEY = "flashSaleUserId";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_USER_ID: "Please enter a valid user ID.",
  SALE_NOT_STARTED: "The sale has not started yet.",
  SALE_ENDED: "The sale has ended.",
  ALREADY_PURCHASED: "You have already purchased this item.",
  SOLD_OUT: "Sold out. Better luck next time.",
  SALE_NOT_INITIALIZED: "The sale is not ready yet. Please try again later.",
  NETWORK_ERROR: "Network error. Please try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

function readStoredUserId(): string {
  try {
    return localStorage.getItem(USER_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function App() {
  const [sale, setSale] = useState<SaleStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState(readStoredUserId);
  const [buying, setBuying] = useState(false);
  const [outcome, setOutcome] = useState<PurchaseOutcome | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setSale(await fetchSaleStatus());
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  function onUserIdChange(value: string) {
    setUserId(value);
    setOutcome(null);
    try {
      localStorage.setItem(USER_ID_KEY, value);
    } catch {
      // storage unavailable; the field still works for this session
    }
  }

  async function onBuy() {
    setBuying(true);
    setOutcome(await purchase(userId.trim()));
    setBuying(false);
    refresh();
  }

  if (!sale) {
    return <main>{loadError ? <p className="error">Failed to load sale: {loadError}</p> : <p>Loading...</p>}</main>;
  }

  const soldOut = sale.stock <= 0;
  const canBuy = sale.status === "active" && !soldOut && userId.trim() !== "" && !buying;

  let countdown: string | null = null;
  if (sale.status === "upcoming") {
    countdown = `Starts in ${formatCountdown(new Date(sale.startsAt).getTime() - now)}`;
  } else if (sale.status === "active") {
    countdown = `Ends in ${formatCountdown(new Date(sale.endsAt).getTime() - now)}`;
  }

  return (
    <main>
      <h1>{sale.name}</h1>
      <p className={`badge ${sale.status}`}>{sale.status}</p>
      {countdown && <p className="countdown">{countdown}</p>}
      <p className="stock">
        {soldOut ? "Sold out" : `${sale.stock} left`}
      </p>

      <label htmlFor="userId">Your user ID</label>
      <input
        id="userId"
        value={userId}
        onChange={(e) => onUserIdChange(e.target.value)}
        placeholder="e.g. alice"
        autoComplete="off"
      />
      <button onClick={onBuy} disabled={!canBuy}>
        {buying ? "Buying..." : "Buy now"}
      </button>

      {outcome?.ok && <p className="success">Purchase successful. It is yours.</p>}
      {outcome && !outcome.ok && <p className="error">{ERROR_MESSAGES[outcome.code]}</p>}
      {loadError && <p className="error">Connection problem: {loadError}</p>}
    </main>
  );
}

export default App;
