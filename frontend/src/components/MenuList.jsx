import { useEffect, useState } from "react";
import {
  getMenu,
  getMyOrders,
  getMyAccount,
  saveMealOrder,
} from "../services/api";

function getTodayDate() {
  // Uses the browser's local date rather than UTC.
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function orderToCart(order) {
  const cart = {};

  for (const item of order?.items ?? []) {
    cart[item.menu_item_id] = item.quantity;
  }

  return cart;
}

function MenuList({ token }) {
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState({});
  const [carts, setCarts] = useState({
    lunch: {},
    dinner: {},
  });

  const [mealType, setMealType] = useState("lunch");
  const [eating, setEating] = useState({
    lunch: true,
    dinner: true,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");
  const [account, setAccount] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [menuData, orderData, accountData] = await Promise.all([
          getMenu(),
          getMyOrders(token),
          getMyAccount(token),
        ]);
        setAccount(accountData);
        setMenu(menuData);

        const today = getTodayDate();
        const todayOrders = {};

        for (const order of orderData) {
          if (order.date === today) {
            todayOrders[order.meal_type] = order;
          }
        }

        setOrders(todayOrders);

        const initialCarts = {
          lunch: orderToCart(todayOrders.lunch),
          dinner: orderToCart(todayOrders.dinner),
        };

        setCarts(initialCarts);

        setEating({
          lunch: todayOrders.lunch?.eating ?? true,
          dinner: todayOrders.dinner?.eating ?? true,
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [token]);

  const currentOrder = orders[mealType];
  const currentCart = carts[mealType] ?? {};
  const isLocked =
    Number(currentOrder?.amount_paid ?? 0) > 0;

  const cartItems = menu.filter(
    (item) => currentCart[item.id] > 0
  );

  const total = cartItems.reduce((sum, item) => {
    return sum + Number(item.price) * currentCart[item.id];
  }, 0);

  function updateCart(itemId, quantity) {
    if (isLocked) return;

    setCarts((current) => ({
      ...current,
      [mealType]: {
        ...current[mealType],
        ...(quantity > 0 ? { [itemId]: quantity } : {}),
      },
    }));

    if (quantity <= 0) {
      setCarts((current) => {
        const updatedMealCart = { ...current[mealType] };
        delete updatedMealCart[itemId];

        return {
          ...current,
          [mealType]: updatedMealCart,
        };
      });
    }
  }

  function addToCart(item) {
    updateCart(item.id, (currentCart[item.id] || 0) + 1);
  }

  function removeFromCart(item) {
    updateCart(item.id, (currentCart[item.id] || 0) - 1);
  }

  function handleMealChange(nextMealType) {
    setMealType(nextMealType);
    setOrderMessage("");
    setOrderError("");
  }

  function handleEatingChange(nextEating) {
    if (isLocked) return;

    setEating((current) => ({
      ...current,
      [mealType]: nextEating,
    }));

    setOrderMessage("");
    setOrderError("");
  }

  async function handleSaveOrder() {
    setOrderMessage("");
    setOrderError("");

    if (eating[mealType] && cartItems.length === 0) {
      setOrderError("Choose at least one menu item, or select Not eating.");
      return;
    }

    try {
      setSaving(true);

      const savedOrder = await saveMealOrder(
        token,
        mealType,
        eating[mealType],
        currentCart
      );

      const accountData=await getMyAccount(token);
      setAccount(accountData);

      setOrders((current) => ({
        ...current,
        [mealType]: savedOrder,
      }));

      setCarts((current) => ({
        ...current,
        [mealType]: orderToCart(savedOrder),
      }));

      setOrderMessage(
        `${mealType === "lunch" ? "Lunch" : "Dinner"} saved. ` +
          `Total: ₹${Number(savedOrder.total_amount).toFixed(2)}. ` +
          `Payment: ${savedOrder.payment_status}.`
      );
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Loading your menu and orders...</p>;
  }

  if (error) {
    return <p style={{ color: "red" }}>Error: {error}</p>;
  }

  return (
    <section>
      <section className="customer-account">
    <h2>My Account</h2>

    {account ? (
      <>
        <div className="account-summary">
          <div className="account-card">
            <h3>Total Due</h3>
            <p>
              ₹{Number(account.total_due).toFixed(2)}
            </p>
          </div>

          <div className="account-card">
            <h3>Available Credit</h3>
            <p>
              ₹{Number(account.available_credit).toFixed(2)}
            </p>
          </div>
        </div>

        <section>
          <h3>Order History</h3>

          {account.orders.length === 0 ? (
            <p>You have no previous orders.</p>
          ) : (
            <div className="history-list">
              {account.orders.map((order) => {
                const due =
                  Number(order.total_amount) -
                  Number(order.amount_paid);

                return (
                  <article className="history-card" key={order.id}>
                    <div>
                      <strong>
                        {order.meal_type === "lunch" ? "Lunch" : "Dinner"}
                      </strong>
                      <span> — {order.date}</span>
                    </div>

                    <p>
                      Total: ₹{Number(order.total_amount).toFixed(2)}
                    </p>

                    <p>
                      Paid: ₹{Number(order.amount_paid).toFixed(2)}
                    </p>

                    <p>
                      Remaining: ₹{Math.max(due, 0).toFixed(2)}
                    </p>

                    <span className={`payment-status ${order.payment_status}`}>
                      {order.payment_status}
                    </span>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h3>Transaction History</h3>

          {account.transactions.length === 0 ? (
            <p>No deposits or payments recorded yet.</p>
          ) : (
            <div className="history-list">
              {account.transactions.map((transaction) => (
                <article
                  className="history-card"
                  key={transaction.id}
                >
                  <strong>
                    {transaction.transaction_type === "deposit"
                      ? "Deposit"
                      : "Direct Payment"}
                  </strong>

                  <p>
                    Amount: ₹{Number(transaction.amount).toFixed(2)}
                  </p>

                  {transaction.note && (
                    <p>Note: {transaction.note}</p>
                  )}

                  <small>
                    {new Date(transaction.created_at).toLocaleString()}
                  </small>
                </article>
              ))}
            </div>
          )}
      </section>
    </>
  ) : (
    <p>Loading account information...</p>
  )}
</section>
      <h2>Today's Menu</h2>

      <div>
        <button
          type="button"
          onClick={() => handleMealChange("lunch")}
          disabled={mealType === "lunch"}
        >
          Lunch
        </button>

        <button
          type="button"
          onClick={() => handleMealChange("dinner")}
          disabled={mealType === "dinner"}
        >
          Dinner
        </button>
      </div>

      <section>
        <h3>
          {mealType === "lunch" ? "Lunch order" : "Dinner order"}
        </h3>

        {currentOrder && (
          <p>
            Existing order #{currentOrder.id} — Payment:{" "}
            {currentOrder.payment_status}
          </p>
        )}

        {isLocked && (
          <p>
            This order is marked paid, so it can no longer be edited.
          </p>
        )}

        <label>
          <input
            type="checkbox"
            checked={!eating[mealType]}
            disabled={isLocked}
            onChange={(event) =>
              handleEatingChange(!event.target.checked)
            }
          />
          Not eating this meal
        </label>
      </section>

      {eating[mealType] && (
        <>
          <div className="menu-grid">
            {menu.map((item) => {
              const quantity = currentCart[item.id] || 0;

              return (
                <div className="meal-card" key={item.id}>
                  <h3>{item.name}</h3>

                  <p>
                    ₹{Number(item.price).toFixed(2)} / {item.unit}
                  </p>

                  <div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item)}
                      disabled={quantity === 0 || isLocked}
                    >
                      −
                    </button>

                    <span style={{ margin: "0 12px" }}>
                      {quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() => addToCart(item)}
                      disabled={isLocked}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <section className="cart-summary">
            <h2>Your {mealType} selection</h2>

            {cartItems.length === 0 ? (
              <p>Your selection is empty.</p>
            ) : (
              <>
                {cartItems.map((item) => (
                  <p key={item.id}>
                    {item.name} × {currentCart[item.id]} — ₹
                    {(
                      Number(item.price) * currentCart[item.id]
                    ).toFixed(2)}
                  </p>
                ))}

                <h3>Total: ₹{total.toFixed(2)}</h3>
              </>
            )}
          </section>
        </>
      )}

      <button
        type="button"
        onClick={handleSaveOrder}
        disabled={saving || isLocked}
      >
        {saving
          ? "Saving..."
          : currentOrder
            ? "Update order"
            : "Save order"}
      </button>

      {orderMessage && <p>{orderMessage}</p>}
      {orderError && <p style={{ color: "red" }}>{orderError}</p>}
    </section>
  );
}

export default MenuList;