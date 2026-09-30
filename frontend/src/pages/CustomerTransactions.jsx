import { useEffect, useState } from "react";
import { getMyAccount, requestPaymentConfirmation } from "../services/api";
import "../styles/customer-transactions.css";

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount || 0));
}
function paymentLabel(order) {
  if (order.order_status !== "Completed") return "Not due yet";
  if (order.payment_status === "paid") return "Paid";
  if (order.payment_status === "partial") return "Partially paid";
  return "Unpaid";
}

export default function CustomerTransactions({ token }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadAccount() {
    setError("");
    const data = await getMyAccount(token);
    setAccount(data);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try { setLoading(true); setError(""); const data = await getMyAccount(token); if (active) setAccount(data); }
      catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [token]);

  async function handlePaymentRequest(order) {
    try {
      setBusyOrderId(order.id); setError(""); setMessage("");
      await requestPaymentConfirmation(token, order.id);
      await loadAccount();
      setMessage("Payment request sent. The admin must verify and confirm it before your balance changes.");
    } catch (err) { setError(err.message); }
    finally { setBusyOrderId(null); }
  }

  if (loading) return <p>Loading your account…</p>;
  if (error && !account) return <p className="page-error">{error}</p>;
  if (!account) return <p>Account information is unavailable.</p>;

  const orders = [...(account.orders || [])].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const transactions = account.transactions || [];

  return (
    <section className="transactions-page">
      <div className="page-heading">
        <h2>Payments & Transactions</h2>
        <p>Review your account balance, completed meal dues, deposits, and payments.</p>
      </div>
      <div className="balance-grid">
        <article className="balance-card"><p>Total Due</p><h3>{formatCurrency(account.total_due)}</h3></article>
        <article className="balance-card"><p>Available Credit</p><h3>{formatCurrency(account.available_credit)}</h3></article>
      </div>
      {message && <p className="transaction-message" role="status">{message}</p>}
      {error && <p className="page-error" role="alert">{error}</p>}

      <section className="transaction-section">
        <h3>Order Payment History</h3>
        {orders.length === 0 ? <p>No orders found.</p> : <div className="transaction-list">
          {orders.map((order) => {
            const due = order.order_status === "Completed" ? Math.max(Number(order.total_amount) - Number(order.amount_paid), 0) : 0;
            const pendingRequest = order.payment_request_status === "pending";
            return <details className="transaction-card compact-transaction" key={order.id}>
              <summary className="transaction-summary">
                <span><strong>{order.date}</strong><small>{order.meal_type === "lunch" ? "Lunch" : "Dinner"}</small></span>
                <span className="transaction-summary-amount"><strong>{formatCurrency(order.total_amount)}</strong><small>{paymentLabel(order)}</small></span>
              </summary>
              <div className="transaction-expanded">
                <div className="transaction-facts">
                  <p><span>Order status</span><strong>{order.order_status}</strong></p>
                  <p><span>Total</span><strong>{formatCurrency(order.total_amount)}</strong></p>
                  <p><span>Paid</span><strong>{formatCurrency(order.amount_paid)}</strong></p>
                  <p><span>Remaining</span><strong>{order.order_status === "Completed" ? formatCurrency(due) : "Not due yet"}</strong></p>
                  <p><span>Payment status</span><strong className={`payment-status ${order.payment_status}`}>{paymentLabel(order)}</strong></p>
                </div>
                <h4>What you ordered</h4>
                {!order.eating ? <p>Marked as not eating.</p> : !order.items?.length ? <p>No item details available.</p> : <ul className="ordered-items">{order.items.map((item, index) => <li key={`${order.id}-${item.menu_item_id}-${index}`}><span>{item.menu_item_name} × {item.quantity}</span><strong>{formatCurrency(Number(item.unit_price) * Number(item.quantity))}</strong></li>)}</ul>}
                {order.order_status === "Completed" && due > 0 && !pendingRequest && <button type="button" className="payment-request-button" disabled={busyOrderId === order.id} onClick={() => handlePaymentRequest(order)}>{busyOrderId === order.id ? "Sending…" : "I’ve paid — request confirmation"}</button>}
                {pendingRequest && <p className="pending-payment-note">Payment confirmation requested. Waiting for admin verification.</p>}
                {order.order_status !== "Completed" && <p className="inline-note">Payment is settled after the order is completed. Deposits are applied automatically to completed dues.</p>}
              </div>
            </details>;
          })}
        </div>}
      </section>

      <section className="transaction-section">
        <h3>Deposits & payments</h3>
        {transactions.length === 0 ? <p>No deposits or payments recorded yet.</p> : <div className="transaction-list">
          {transactions.map((transaction) => <details className="transaction-card compact-transaction" key={transaction.id}>
            <summary className="transaction-summary">
              <span><strong>{transaction.transaction_type === "deposit" ? "Deposit" : "Direct payment"}</strong><small>{new Date(transaction.created_at).toLocaleString()}</small></span>
              <span className="transaction-summary-amount"><strong>{formatCurrency(transaction.amount)}</strong><small>Recorded</small></span>
            </summary>
            <div className="transaction-expanded"><p><b>Type:</b> {transaction.transaction_type === "deposit" ? "Deposit / credit" : "Payment"}</p><p><b>Amount:</b> {formatCurrency(transaction.amount)}</p>{transaction.note && <p><b>Note:</b> {transaction.note}</p>}</div>
          </details>)}
        </div>}
      </section>
    </section>
  );
}
