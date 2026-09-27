import { useEffect, useState } from "react";
import {
  getCustomers,
  createCustomer,
  resetCustomerPassword,
  deactivateCustomer,
  getAdminOrders,
  getCustomerAccount,
  addCustomerDeposit,
  recordCustomerPayment,
  applyCustomerCredit,
} from "../services/api";

// Get today's date using the browser's local date.
// This avoids possible date shifts from toISOString().
function getLocalDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function OrdersSection({ token }) {
  const [orderDate, setOrderDate] = useState(getLocalDate());
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingPaymentId, setLoadingPaymentId] = useState(null);
  const [orderError, setOrderError] = useState("");
  const [orderMessage, setOrderMessage] = useState("");

  async function loadOrders() {
    setOrderError("");
    setOrderMessage("");
    setLoadingOrders(true);

    try {
      const data = await getAdminOrders(token, orderDate);
      setOrders(data);
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setLoadingOrders(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [token]);

  async function handlePaymentChange(order, newStatus) {
    setOrderError("");
    setOrderMessage("");
    setLoadingPaymentId(order.id);

    try {
      await updateOrderPayment(token, order.id, newStatus);
      setOrderMessage(
        `Payment marked ${newStatus} for ${order.customer_name}.`
      );

      await loadOrders();
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setLoadingPaymentId(null);
    }
  }

  const lunchOrders = orders.filter(
    (order) => order.meal_type === "lunch"
  );

  const dinnerOrders = orders.filter(
    (order) => order.meal_type === "dinner"
  );

  const paidOrders = orders.filter(
    (order) => order.payment_status === "paid"
  );

  const unpaidOrders = orders.filter(
    (order) => order.payment_status !== "paid"
  );

  const totalAmount = orders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  const collectedAmount = paidOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  function renderOrders(mealOrders, mealTitle) {
    return (
      <section style={{ marginTop: "24px" }}>
        <h3>{mealTitle}</h3>

        {mealOrders.length === 0 ? (
          <p>No {mealTitle.toLowerCase()} orders for this date.</p>
        ) : (
          mealOrders.map((order) => (
            <article
              key={order.id}
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "14px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h4 style={{ margin: "0 0 6px" }}>
                    {order.customer_name}
                  </h4>

                  <p style={{ margin: "4px 0" }}>
                    Mobile: {order.customer_mobile}
                  </p>

                  <p style={{ margin: "4px 0" }}>
                    Order:{" "}
                    {order.eating ? "Eating" : "Not eating"}
                  </p>
                </div>

                <div>
                  <strong>{formatCurrency(order.total_amount)}</strong>
                  <p style={{ margin: "6px 0" }}>
                    Payment:{" "}
                    <strong>
                      {order.payment_status === "paid"
                        ? "Paid"
                        : "Unpaid"}
                    </strong>
                  </p>
                </div>
              </div>

              {order.eating && (
                <div style={{ marginTop: "10px" }}>
                  <strong>Items</strong>

                  {order.items.length === 0 ? (
                    <p>No items selected.</p>
                  ) : (
                    <ul>
                      {order.items.map((item, index) => (
                        <li
                          key={`${order.id}-${item.menu_item_id}-${index}`}
                        >
                          {item.menu_item_name} × {item.quantity}
                          {" — "}
                          {formatCurrency(
                            Number(item.unit_price) * Number(item.quantity)
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  handlePaymentChange(
                    order,
                    order.payment_status === "paid" ? "unpaid" : "paid"
                  )
                }
                disabled={loadingPaymentId === order.id}
              >
                {loadingPaymentId === order.id
                  ? "Updating..."
                  : order.payment_status === "paid"
                    ? "Mark unpaid"
                    : "Mark paid"}
              </button>
            </article>
          ))
        )}
      </section>
    );
  }

  return (
    <section>
      <h2>Daily orders</h2>

      <div
        style={{
          display: "flex",
          alignItems: "end",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <label>
          Select date
          <br />
          <input
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
        </label>

        <button
          type="button"
          onClick={loadOrders}
          disabled={loadingOrders || !orderDate}
        >
          {loadingOrders ? "Loading..." : "Load orders"}
        </button>
      </div>

      {orderError && (
        <p style={{ color: "red" }}>{orderError}</p>
      )}

      {orderMessage && <p>{orderMessage}</p>}

      {loadingOrders ? (
        <p>Loading orders...</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "12px",
              marginTop: "20px",
            }}
          >
            <article
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <p>Total orders</p>
              <h3>{orders.length}</h3>
            </article>

            <article
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <p>Unpaid orders</p>
              <h3>{unpaidOrders.length}</h3>
            </article>

            <article
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <p>Paid orders</p>
              <h3>{paidOrders.length}</h3>
            </article>

            <article
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <p>Total amount</p>
              <h3>{formatCurrency(totalAmount)}</h3>
            </article>

            <article
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <p>Collected</p>
              <h3>{formatCurrency(collectedAmount)}</h3>
            </article>
          </div>

          {renderOrders(lunchOrders, "Lunch")}
          {renderOrders(dinnerOrders, "Dinner")}

          {orders.length === 0 && (
            <p>
              No orders were recorded for this date. Customers who did not
              submit an order will not appear here.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default function AdminDashboard({ token }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  async function loadCustomers() {
    setError("");

    try {
      const data = await getCustomers(token);
      setCustomers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, [token]);

  async function handleCreateCustomer(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!/^\d{10}$/.test(mobileNumber)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    if (temporaryPassword.length < 8) {
      setError("Temporary password must be at least 8 characters.");
      return;
    }

    try {
      setBusy(true);

      await createCustomer(token, {
        name: name.trim(),
        mobile_number: mobileNumber,
        temporary_password: temporaryPassword,
      });

      setName("");
      setMobileNumber("");
      setTemporaryPassword("");
      setMessage("Customer created successfully.");

      await loadCustomers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(customer) {
    const newPassword = window.prompt(
      `Enter a temporary password for ${customer.name}:`
    );

    if (newPassword === null) {
      return;
    }

    if (newPassword.length < 8) {
      setError("Temporary password must be at least 8 characters.");
      return;
    }

    setError("");
    setMessage("");

    try {
      setBusy(true);

      await resetCustomerPassword(token, customer.id, newPassword);

      setMessage(
        `Temporary password reset for ${customer.name}. They must change it when they log in.`
      );

      await loadCustomers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate(customer) {
    const confirmed = window.confirm(
      `Deactivate ${customer.name}? They will no longer be able to log in.`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");

    try {
      setBusy(true);

      await deactivateCustomer(token, customer.id);

      setMessage(`${customer.name} has been deactivated.`);
      await loadCustomers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <OrdersSection token={token} />

      <hr style={{ margin: "32px 0" }} />

      <h2>Customer management</h2>

      <h3>Create customer</h3>

      <form onSubmit={handleCreateCustomer}>
        <label>
          Customer name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter name"
            required
          />
        </label>

        <label>
          Mobile number
          <input
            type="tel"
            value={mobileNumber}
            onChange={(event) => setMobileNumber(event.target.value)}
            placeholder="10-digit mobile number"
            inputMode="numeric"
            maxLength={10}
            required
          />
        </label>

        <label>
          Temporary password
          <input
            type="password"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </label>

        <button type="submit" disabled={busy}>
          {busy ? "Please wait..." : "Create customer"}
        </button>
      </form>

      {message && <p>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <hr />

      <h3>Customers</h3>

      {loading ? (
        <p>Loading customers...</p>
      ) : customers.length === 0 ? (
        <p>No customers found.</p>
      ) : (
        <div>
          {customers.map((customer) => (
            <article
              key={customer.id}
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "12px",
              }}
            >
              <h4>{customer.name}</h4>

              <p>Mobile: {customer.mobile_number}</p>
              <p>
                Status: {customer.is_active ? "Active" : "Deactivated"}
              </p>
              <p>
                Password:{" "}
                {customer.must_change_password
                  ? "Temporary password — change required"
                  : "Password set"}
              </p>

              <button
                type="button"
                onClick={() => handleResetPassword(customer)}
                disabled={busy || !customer.is_active}
              >
                Reset password
              </button>

              {customer.is_active && (
                <button
                  type="button"
                  onClick={() => handleDeactivate(customer)}
                  disabled={busy}
                  style={{ marginLeft: "8px" }}
                >
                  Deactivate
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}