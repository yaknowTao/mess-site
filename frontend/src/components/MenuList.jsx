import { useEffect, useMemo, useState } from "react";
import { getMenu, getMyOrders, saveMealOrder, requestOrderUpdate, getDayOff } from "../services/api";
import "../styles/my-orders.css";
import "../styles/customer-dayoff-additions.css";

function localDateString(value = new Date()) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount || 0));
}
function orderToCart(order) {
  return Object.fromEntries((order?.items ?? []).map((item) => [item.menu_item_id, item.quantity]));
}
function orderStatusLabel(order) {
  if (order.order_status !== "Completed") return "Not due yet";
  return order.payment_status === "paid" ? "Paid" : order.payment_status === "partial" ? "Partially paid" : "Unpaid";
}

export default function MenuList({ token }) {
  const today = localDateString();
  const [menu, setMenu] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [orders, setOrders] = useState({});
  const [carts, setCarts] = useState({ lunch: {}, dinner: {} });
  const [eating, setEating] = useState({ lunch: true, dinner: true });
  const [mealType, setMealType] = useState("lunch");
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dayOff, setDayOff] = useState(null);

  async function refreshOrders() {
    const data = await getMyOrders(token);
    setAllOrders(data);
    return data;
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const [menuData, orderData, closure] = await Promise.all([getMenu(), getMyOrders(token), getDayOff(token, selectedDate)]);
        if (!active) return;
        setMenu(menuData);
        setAllOrders(orderData);
        setDayOff(closure);
        const selected = {};
        for (const order of orderData) {
          if (order.date === selectedDate) selected[order.meal_type] = order;
        }
        setOrders(selected);
        setCarts({ lunch: orderToCart(selected.lunch), dinner: orderToCart(selected.dinner) });
        setEating({ lunch: selected.lunch?.eating ?? true, dinner: selected.dinner?.eating ?? true });
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [token, selectedDate]);

  const currentOrder = orders[mealType];
  const currentCart = carts[mealType] ?? {};
  const isLocked = Boolean(dayOff) || Boolean(currentOrder && currentOrder.order_status !== "Submitted");
  const cartItems = menu.filter((item) => Number(currentCart[item.id] || 0) > 0);
  const total = cartItems.reduce((sum, item) => sum + Number(item.price) * currentCart[item.id], 0);
  const upcomingOrders = useMemo(() => allOrders
    .filter((order) => order.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.meal_type.localeCompare(b.meal_type)), [allOrders, today]);

  function updateCart(itemId, quantity) {
    if (isLocked) return;
    setCarts((current) => {
      const next = { ...(current[mealType] || {}) };
      if (quantity > 0) next[itemId] = quantity;
      else delete next[itemId];
      return { ...current, [mealType]: next };
    });
  }

  function selectOrderForEditing(order) {
    setSelectedDate(order.date);
    setMealType(order.meal_type);
    setMessage("Order loaded in the editor below.");
    document.getElementById("order-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleRequestUpdate(order) {
    try {
      setSaving(true); setError(""); setMessage("");
      await requestOrderUpdate(token, order.id);
      const refreshed = await refreshOrders();
      const selected = {};
      for (const item of refreshed) if (item.date === selectedDate) selected[item.meal_type] = item;
      setOrders(selected);
      setMessage("Edit request sent. The admin must reopen the order before you can change it.");
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleSaveOrder() {
    setError(""); setMessage("");
    if (dayOff) { setError("The mess is closed on this date, so orders cannot be placed."); return; }
    if (eating[mealType] && cartItems.length === 0) {
      setError("Choose at least one menu item, or select Not eating."); return;
    }
    try {
      setSaving(true);
      const saved = await saveMealOrder(token, mealType, eating[mealType], currentCart, selectedDate);
      const nextOrders = { ...orders, [mealType]: saved };
      setOrders(nextOrders);
      setCarts((current) => ({ ...current, [mealType]: orderToCart(saved) }));
      const all = await getMyOrders(token); setAllOrders(all);
      setMessage(`${mealType === "lunch" ? "Lunch" : "Dinner"} order saved for ${selectedDate}. Total: ${formatCurrency(saved.total_amount)}.`);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p>Loading your orders and menu…</p>;
  if (error && !menu.length) return <p className="page-error">{error}</p>;

  return (
    <section className="my-orders-page">
      <div className="page-heading">
        <h2>My Orders</h2>
        <p>Today’s and upcoming meals. Select an order to view its details.</p>
      </div>

      {dayOff && <div className="mess-day-off-banner" role="status">
        <strong>Mess closed on {selectedDate}</strong>
        <span>{dayOff.reason || "No meals will be served on this date. Existing orders were cancelled."}</span>
      </div>}

      <section className="upcoming-orders-section">
        <h3>Today & upcoming orders</h3>
        {upcomingOrders.length === 0 ? <p className="empty-state">No orders yet for today or future dates.</p> : (
          <div className="compact-order-list">
            {upcomingOrders.map((order) => {
              const due = Math.max(Number(order.total_amount) - Number(order.amount_paid), 0);
              return (
                <details className="compact-order" key={order.id}>
                  <summary className="compact-order-summary">
                    <span className="order-summary-date">{order.date}</span>
                    <span>{order.meal_type === "lunch" ? "Lunch" : "Dinner"}</span>
                    <strong>{formatCurrency(order.total_amount)}</strong>
                    <span className={`status-pill status-${order.order_status.toLowerCase()}`}>{order.order_status}</span>
                    <span className="order-payment-label">{order.order_status === "Completed" ? orderStatusLabel(order) : "Not due yet"}</span>
                  </summary>
                  <div className="compact-order-details">
                    <p><b>Meal:</b> {order.eating ? "Eating" : "Not eating"}</p>
                    <p><b>Order status:</b> {order.order_status}</p>
                    <p><b>Payment:</b> {order.order_status === "Completed" ? `${orderStatusLabel(order)} · ${formatCurrency(due)} remaining` : "Settled after completion"}</p>
                    {order.eating && <div><b>Items</b><ul>{(order.items || []).map((item) => {
                      const menuItem = menu.find((entry) => entry.id === item.menu_item_id);
                      return <li key={item.id || `${order.id}-${item.menu_item_id}`}>{menuItem?.name || `Menu item #${item.menu_item_id}`} × {item.quantity}</li>;
                    })}</ul></div>}
                    {order.order_status === "Submitted" && <button type="button" onClick={() => selectOrderForEditing(order)}>Edit order</button>}
                    {order.order_status === "Seen" && !order.update_requested_at && <button type="button" disabled={saving} onClick={() => handleRequestUpdate(order)}>Request an edit</button>}
                    {order.order_status === "Seen" && order.update_requested_at && <p className="inline-note">Edit request sent; waiting for admin approval.</p>}
                    {order.order_status === "Preparing" && <p className="inline-note">Preparation has started; this order can no longer be edited.</p>}
                    {order.order_status === "Completed" && <p className="inline-note">Order completed. Payment status is shown separately.</p>}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="order-editor" id="order-editor">
        <h3>Place or edit an order</h3>
        <div className="order-editor-controls">
          <label>Order date<input type="date" value={selectedDate} min={today} onChange={(event) => setSelectedDate(event.target.value)} /></label>
          <div className="meal-tabs" aria-label="Choose meal">
            <button type="button" className={mealType === "lunch" ? "selected" : ""} onClick={() => setMealType("lunch")}>Lunch</button>
            <button type="button" className={mealType === "dinner" ? "selected" : ""} onClick={() => setMealType("dinner")}>Dinner</button>
          </div>
        </div>

        {currentOrder && <div className="editor-order-note">
          Existing {mealType} order: <b>{currentOrder.order_status}</b>.
          {currentOrder.order_status === "Seen" && !currentOrder.update_requested_at && <button type="button" disabled={saving} onClick={() => handleRequestUpdate(currentOrder)}>Request an edit</button>}
          {currentOrder.order_status === "Seen" && currentOrder.update_requested_at && <span> Edit request pending admin approval.</span>}
          {currentOrder.order_status !== "Submitted" && <p>This order is locked until the admin reopens it (if eligible).</p>}
        </div>}

        <div className="eating-toggle">
          <label><input type="checkbox" checked={eating[mealType]} disabled={isLocked} onChange={(event) => setEating((current) => ({ ...current, [mealType]: event.target.checked }))} /> I will eat this {mealType}</label>
        </div>

        {eating[mealType] && <div className="menu-grid">
          {menu.map((item) => {
            const quantity = Number(currentCart[item.id] || 0);
            return <article className="meal-card" key={item.id}>
              <div><h4>{item.name}</h4><p>{formatCurrency(item.price)} / {item.unit}</p></div>
              <div className="quantity-controls">
                <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => updateCart(item.id, quantity - 1)} disabled={quantity === 0 || isLocked}>−</button>
                <span>{quantity}</span>
                <button type="button" aria-label={`Add one ${item.name}`} onClick={() => updateCart(item.id, quantity + 1)} disabled={isLocked}>+</button>
              </div>
              <button type="button" className="quick-add-button" onClick={() => updateCart(item.id, quantity + 1)} disabled={isLocked}>Add</button>
            </article>;
          })}
        </div>}

        <div className="cart-summary">
          <h4>Your {mealType} selection</h4>
          {!eating[mealType] ? <p>Marked as not eating.</p> : cartItems.length === 0 ? <p>No items selected yet.</p> : <div className="editable-cart-list">{cartItems.map((item) => <div className="editable-cart-row" key={item.id}><span><strong>{item.name}</strong><small>{formatCurrency(item.price)} each</small></span><div className="editable-cart-controls"><button type="button" onClick={() => updateCart(item.id, Number(currentCart[item.id]) - 1)} disabled={isLocked}>−</button><b>{currentCart[item.id]}</b><button type="button" onClick={() => updateCart(item.id, Number(currentCart[item.id]) + 1)} disabled={isLocked}>+</button><button type="button" className="remove-item-button" onClick={() => updateCart(item.id, 0)} disabled={isLocked}>Remove</button></div><strong>{formatCurrency(Number(item.price) * currentCart[item.id])}</strong></div>)}</div>}
          <strong>Total: {formatCurrency(eating[mealType] ? total : 0)}</strong>
        </div>
        <button type="button" className="save-order-button" onClick={handleSaveOrder} disabled={saving || isLocked}>{saving ? "Saving…" : currentOrder ? "Save changes" : "Submit order"}</button>
        {message && <p className="order-message" role="status">{message}</p>}
        {error && <p className="order-error" role="alert">{error}</p>}
      </section>
    </section>
  );
}
