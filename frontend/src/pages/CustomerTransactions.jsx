import { useEffect, useState } from "react";
import { getMyAccount } from "../services/api";
import "../styles/customer-transactions.css";

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export default function CustomerTransactions({ token }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAccount() {
      try {
        setLoading(true);
        setError("");

        const data = await getMyAccount(token);
        setAccount(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadAccount();
  }, [token]);

  if (loading) {
    return <p>Loading your account...</p>;
  }

  if (error) {
    return <p className="page-error">{error}</p>;
  }

  if (!account) {
    return <p>Account information is unavailable.</p>;
  }

  return (
    <section className="transactions-page">
      <div className="page-heading">
        <h2>Payments & Transactions</h2>
        <p>Review your balance, meal payments, and transaction history.</p>
      </div>

      <div className="balance-grid">
        <article className="balance-card">
          <p>Total Due</p>
          <h3>{formatCurrency(account.total_due)}</h3>
        </article>

        <article className="balance-card">
          <p>Available Credit</p>
          <h3>{formatCurrency(account.available_credit)}</h3>
        </article>
      </div>

      <section className="transaction-section">
        <h3>Order Payment History</h3>

        {account.orders.length === 0 ? (
          <p>No orders found.</p>
        ) : (
          <div className="transaction-list">
            {account.orders.map((order) => {
              const remaining = Math.max(
                Number(order.total_amount) - Number(order.amount_paid),
                0
              );

              return (
                <article className="transaction-card" key={order.id}>
                  <div className="transaction-card-heading">
                    <strong>
                      {order.meal_type === "lunch" ? "Lunch" : "Dinner"}
                    </strong>
                    <span>{order.date}</span>
                  </div>

                  <p>Total: {formatCurrency(order.total_amount)}</p>
                  <p>Paid: {formatCurrency(order.amount_paid)}</p>
                  <p>Remaining: {formatCurrency(remaining)}</p>

                  <span
                    className={`payment-status ${order.payment_status}`}
                  >
                    {order.payment_status}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="transaction-section">
        <h3>Transactions</h3>

        {account.transactions.length === 0 ? (
          <p>No deposits or payments recorded yet.</p>
        ) : (
          <div className="transaction-list">
            {account.transactions.map((transaction) => (
              <article
                className="transaction-card"
                key={transaction.id}
              >
                <div className="transaction-card-heading">
                  <strong>
                    {transaction.transaction_type === "deposit"
                      ? "Deposit"
                      : "Direct Payment"}
                  </strong>

                  <span>
                    {new Date(transaction.created_at).toLocaleString()}
                  </span>
                </div>

                <p>Amount: {formatCurrency(transaction.amount)}</p>

                {transaction.note && (
                  <p>Note: {transaction.note}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}