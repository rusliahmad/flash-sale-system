import { useEffect, useState } from "react";
import { fetchSaleStatus, type SaleStatus } from "./api";
import "./App.css";

function App() {
  const [sale, setSale] = useState<SaleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSaleStatus()
      .then(setSale)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p>Failed to load sale: {error}</p>;
  if (!sale) return <p>Loading...</p>;

  return (
    <main>
      <h1>{sale.name}</h1>
      <p>Status: {sale.status}</p>
      <p>Stock left: {sale.stock}</p>
    </main>
  );
}

export default App;
