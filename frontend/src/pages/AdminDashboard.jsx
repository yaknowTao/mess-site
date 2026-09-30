import { useEffect, useMemo, useState } from "react";
import {
  getCustomers, createCustomer, resetCustomerPassword, deactivateCustomer,
  getAdminOrders, getCustomerAccount, addCustomerDeposit, recordCustomerPayment,
  markOrderSeen, markOrderPreparing, markOrderCompleted, reopenOrderForUpdate,
  confirmCustomerPaymentRequest, getAdminCalendar, createDayOff, removeDayOff,
  getAdminMenu, createMenuItem, updateMenuItem, archiveMenuItem, getDayOff,
} from "../services/api";
import "../styles/admin-dashboard.css";
import "../styles/admin-dashboard-additions.css";

function getLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:2 }).format(Number(amount || 0));
}
function StatusBadge({ children, tone="neutral" }) { return <span className={`admin-status admin-status-${tone}`}>{children}</span>; }
function statusTone(status) {
  if (status === "Completed") return "success";
  if (status === "Preparing") return "warning";
  if (status === "Seen") return "info";
  if (status === "Cancelled") return "danger";
  return "neutral";
}
function paymentTone(status) { return status === "paid" ? "success" : "danger"; }

function MonthCalendar({ token, selectedDate, setSelectedDate }) {
  const initial = new Date(`${selectedDate}T12:00:00`);
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [calendar, setCalendar] = useState({ order_counts:{}, days_off:[] });
  const [error, setError] = useState("");

  useEffect(() => {
    const selected = new Date(`${selectedDate}T12:00:00`);
    if (selected.getFullYear() !== month.getFullYear() || selected.getMonth() !== month.getMonth()) {
      setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
  }, [selectedDate]);

  useEffect(() => {
    let active = true;
    getAdminCalendar(token, month.getFullYear(), month.getMonth()+1)
      .then(data => active && setCalendar(data))
      .catch(err => active && setError(err.message));
    return () => { active = false; };
  }, [token, month]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - first.getDay());
    return Array.from({length:42}, (_, i) => { const d=new Date(start); d.setDate(start.getDate()+i); return d; });
  }, [month]);

  function dateString(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function changeMonth(delta) { setMonth(new Date(month.getFullYear(), month.getMonth()+delta, 1)); }
  const monthLabel = month.toLocaleDateString("en-IN", { month:"long", year:"numeric" });

  return <div className="admin-calendar-panel">
    <div className="admin-calendar-header">
      <button type="button" onClick={() => changeMonth(-1)}>‹</button>
      <strong>{monthLabel}</strong>
      <button type="button" onClick={() => changeMonth(1)}>›</button>
    </div>
    <div className="admin-calendar-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(x => <span key={x}>{x}</span>)}</div>
    <div className="admin-calendar-grid">
      {cells.map(d => {
        const key=dateString(d), inMonth=d.getMonth()===month.getMonth();
        const off=calendar.days_off.find(x => x.date === key);
        const count=calendar.order_counts[key] || 0;
        return <button type="button" key={key} className={`admin-calendar-day ${inMonth?"":"outside"} ${selectedDate===key?"selected":""} ${off?"day-off":""}`} onClick={() => setSelectedDate(key)}>
          <span>{d.getDate()}</span>
          {off ? <small>OFF</small> : count > 0 ? <small>{count} order{count===1?"":"s"}</small> : <small> </small>}
        </button>;
      })}
    </div>
    {error && <p className="admin-alert admin-alert-error">{error}</p>}
  </div>;
}

function OrdersSection({ token }) {
  const [orderDate,setOrderDate]=useState(getLocalDate());
  const [orders,setOrders]=useState([]), [loading,setLoading]=useState(true);
  const [expandedId,setExpandedId]=useState(null), [busyId,setBusyId]=useState(null);
  const [error,setError]=useState(""), [message,setMessage]=useState("");
  const [dayOff,setDayOff]=useState(null), [reason,setReason]=useState("");

  async function loadOrders() {
    setLoading(true); setError("");
    try { setOrders(await getAdminOrders(token,orderDate)); }
    catch(e){setError(e.message);} finally{setLoading(false);}
  }
  async function loadClosure() {
    try {
      const data=await fetchClosure(token,orderDate); setDayOff(data); setReason(data?.reason || "");
    } catch(e){setError(e.message);}
  }
  async function refresh(){ await Promise.all([loadOrders(),loadClosure()]); }
  useEffect(()=>{refresh();},[token,orderDate]);

  async function action(order, name) {
    const actions={seen:markOrderSeen,preparing:markOrderPreparing,completed:markOrderCompleted,reopen:reopenOrderForUpdate};
    setBusyId(order.id); setError(""); setMessage("");
    try { await actions[name](token,order.id); await loadOrders(); setMessage(`Order #${order.id} updated.`); }
    catch(e){setError(e.message);} finally{setBusyId(null);}
  }
  async function confirmPayment(order){
    if(!order.payment_request_id)return; setBusyId(order.id); setError("");
    try{await confirmCustomerPaymentRequest(token,order.payment_request_id); await loadOrders(); setMessage("Payment confirmation accepted.");}
    catch(e){setError(e.message);}finally{setBusyId(null);}
  }
  async function recordPayment(order){
    const due=Math.max(Number(order.total_amount)-Number(order.amount_paid),0); if(due<=0)return;
    const raw=window.prompt(`Payment received from ${order.customer_name}. Completed dues are paid oldest first.`,due.toFixed(2));
    if(raw===null)return; const amount=Number(raw); if(!Number.isFinite(amount)||amount<=0){setError("Enter a valid payment amount.");return;}
    setBusyId(order.id); try{await recordCustomerPayment(token,order.user_id,amount,"Direct payment");await loadOrders();setMessage("Payment recorded.");}catch(e){setError(e.message);}finally{setBusyId(null);}
  }
  async function deposit(order){
    const raw=window.prompt(`Deposit received from ${order.customer_name}:`); if(raw===null)return;
    const amount=Number(raw); if(!Number.isFinite(amount)||amount<=0){setError("Enter a valid deposit amount.");return;}
    setBusyId(order.id); try{await addCustomerDeposit(token,order.user_id,amount,"Customer deposit");await loadOrders();setMessage("Deposit recorded.");}catch(e){setError(e.message);}finally{setBusyId(null);}
  }
  async function closeDate(){
    if(dayOff){
      if(!window.confirm(`Reopen ${orderDate}? New orders will be allowed again.`))return;
      try{await removeDayOff(token,orderDate);setMessage("Mess reopened for this date.");await refresh();}catch(e){setError(e.message)}
      return;
    }
    if(!window.confirm(`Close the mess on ${orderDate}? Every existing order on that date will be cancelled.`))return;
    try{const saved=await createDayOff(token,orderDate,reason);setDayOff(saved);setMessage("Day marked as a mess holiday and existing orders were cancelled.");await loadOrders();}catch(e){setError(e.message)}
  }

  const completed=orders.filter(o=>o.order_status==="Completed"), paid=completed.filter(o=>o.payment_status==="paid");
  return <section className="admin-section">
    <div className="admin-section-heading"><div><p className="admin-eyebrow">Order management</p><h2>Orders calendar</h2><p>Select any date to see every lunch and dinner order, including future orders.</p></div></div>
    {error&&<div className="admin-alert admin-alert-error">{error}</div>}{message&&<div className="admin-alert admin-alert-success">{message}</div>}
    <MonthCalendar token={token} selectedDate={orderDate} setSelectedDate={setOrderDate}/>
    <div className={`admin-closure-panel ${dayOff?"is-closed":""}`}>
      <div><span className="admin-eyebrow">Mess availability</span><h3>{dayOff?"Mess closed":"Mess open"} · {orderDate}</h3><p>{dayOff?(dayOff.reason||"No reason added."):"Use this control when the mess will not operate on this date."}</p></div>
      {!dayOff&&<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Optional reason, e.g. Ganesh Chaturthi" />}
      <button type="button" onClick={closeDate}>{dayOff?"Reopen this day":"Mark day off"}</button>
    </div>
    <div className="admin-stat-grid"><div className="admin-stat-card"><span>Orders</span><strong>{orders.length}</strong></div><div className="admin-stat-card"><span>Completed</span><strong>{completed.length}</strong></div><div className="admin-stat-card"><span>Paid</span><strong>{paid.length}</strong></div><div className="admin-stat-card"><span>Order value</span><strong>{formatCurrency(orders.reduce((s,o)=>s+Number(o.total_amount||0),0))}</strong></div></div>
    {loading?<div className="admin-empty">Loading orders...</div>:orders.length===0?<div className="admin-empty">No orders for this date.</div>:<div className="admin-order-list">
      {orders.map(order=>{const due=Math.max(Number(order.total_amount)-Number(order.amount_paid),0),expanded=expandedId===order.id,busy=busyId===order.id;return <article className={`admin-order ${expanded?"is-expanded":""}`} key={order.id}>
        <button type="button" className="admin-order-summary" onClick={()=>setExpandedId(expanded?null:order.id)}><span className="admin-order-main"><strong>{order.customer_name}</strong><span className="admin-order-meta">{order.meal_type==="lunch"?"Lunch":"Dinner"} · #{order.id}</span></span><span className="admin-order-middle"><span>{formatCurrency(order.total_amount)}</span><StatusBadge tone={statusTone(order.order_status)}>{order.order_status}</StatusBadge></span><span className="admin-order-right"><StatusBadge tone={paymentTone(order.payment_status)}>{order.payment_status}</StatusBadge><span>{expanded?"⌃":"⌄"}</span></span></button>
        {expanded&&<div className="admin-order-details"><div className="admin-detail-grid"><div><span className="admin-detail-label">Customer</span><strong>{order.customer_name}</strong><span>{order.customer_mobile}</span></div><div><span className="admin-detail-label">Meal</span><strong>{order.eating?"Eating":"Not eating"}</strong><span>{order.meal_type}</span></div><div><span className="admin-detail-label">Payment</span><strong>{formatCurrency(order.amount_paid)} paid</strong><span>{order.order_status==="Completed"?`${formatCurrency(due)} remaining`:"Not due yet"}</span></div></div>
          {order.eating&&<div className="admin-items-box"><h4>Ordered items</h4>{order.items.length?order.items.map((item,i)=><div className="admin-item-row" key={`${order.id}-${i}`}><span>{item.menu_item_name} × {item.quantity}</span><strong>{formatCurrency(Number(item.unit_price)*Number(item.quantity))}</strong></div>):<p>No items selected.</p>}</div>}
          {order.payment_request_status==="pending"&&<div className="admin-alert admin-alert-warning">Customer reported a payment. Confirmation is pending.</div>}
          <div className="admin-actions">
            {order.payment_request_status==="pending"&&<button onClick={()=>confirmPayment(order)} disabled={busy}>Confirm payment</button>}
            {order.order_status==="Submitted"&&<button onClick={()=>action(order,"seen")} disabled={busy}>Mark seen</button>}
            {order.order_status==="Seen"&&order.update_requested_at&&<button onClick={()=>action(order,"reopen")} disabled={busy}>Approve edit request</button>}
            {order.order_status==="Seen"&&!order.update_requested_at&&<button onClick={()=>action(order,"preparing")} disabled={busy}>Start preparing</button>}
            {order.order_status==="Preparing"&&<button onClick={()=>action(order,"completed")} disabled={busy}>Mark completed</button>}
            {order.order_status==="Completed"&&due>0&&<button onClick={()=>recordPayment(order)} disabled={busy}>Record payment</button>}
            <button onClick={()=>deposit(order)} disabled={busy||order.order_status==="Cancelled"}>Add deposit</button>
          </div>
        </div>}
      </article>})}
    </div>}
  </section>;
}

async function fetchClosure(token,date){ return getDayOff(token,date); }

function CustomersSection({ token }) {
  const [customers,setCustomers]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [selected,setSelected]=useState(null),[account,setAccount]=useState(null),[accountLoading,setAccountLoading]=useState(false);
  const [name,setName]=useState(""),[mobile,setMobile]=useState(""),[password,setPassword]=useState("");
  async function load(){try{setLoading(true);setCustomers(await getCustomers(token));}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[token]);
  async function openCustomer(c){setSelected(c);setAccount(null);setAccountLoading(true);try{setAccount(await getCustomerAccount(token,c.id))}catch(e){setError(e.message)}finally{setAccountLoading(false)}}
  async function create(e){e.preventDefault();if(!/^\d{10}$/.test(mobile)||password.length<8){setError("Enter a valid 10-digit mobile number and password of at least 8 characters.");return;}try{setBusy(true);await createCustomer(token,{name:name.trim(),mobile_number:mobile,temporary_password:password});setName("");setMobile("");setPassword("");setMessage("Customer created.");await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function reset(c){const p=window.prompt(`New temporary password for ${c.name}:`);if(p===null)return;if(p.length<8){setError("Password must be at least 8 characters.");return;}try{setBusy(true);await resetCustomerPassword(token,c.id,p);setMessage("Password reset.");await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function deactivate(c){if(!window.confirm(`Deactivate ${c.name}?`))return;try{setBusy(true);await deactivateCustomer(token,c.id);await load();setMessage("Customer deactivated.")}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <section className="admin-section"><div className="admin-section-heading"><div><p className="admin-eyebrow">Accounts</p><h2>Customers</h2><p>Click any customer to see their complete order and transaction history.</p></div></div>{error&&<div className="admin-alert admin-alert-error">{error}</div>}{message&&<div className="admin-alert admin-alert-success">{message}</div>}
    <div className="admin-customer-layout"><form className="admin-panel admin-create-form" onSubmit={create}><h3>Create customer</h3><label>Name<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Mobile<input value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,""))} maxLength={10} required/></label><label>Temporary password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button disabled={busy}>Create customer</button></form>
      <div className="admin-panel"><h3>Customer accounts</h3>{loading?<div className="admin-empty">Loading...</div>:customers.map(c=><article className={`customer-row clickable ${selected?.id===c.id?"selected":""}`} key={c.id} onClick={()=>openCustomer(c)}><div className="customer-row-main"><strong>{c.name}</strong><span>{c.mobile_number}</span></div><StatusBadge tone={c.is_active?"success":"danger"}>{c.is_active?"Active":"Deactivated"}</StatusBadge><div className="customer-row-actions"><button type="button" onClick={e=>{e.stopPropagation();reset(c)}} disabled={busy||!c.is_active}>Reset password</button>{c.is_active&&<button type="button" className="button-danger" onClick={e=>{e.stopPropagation();deactivate(c)}} disabled={busy}>Deactivate</button>}</div></article>)}</div></div>
    {selected&&<section className="admin-customer-history admin-panel"><div className="admin-history-header"><div><p className="admin-eyebrow">Customer history</p><h3>{selected.name}</h3><span>{selected.mobile_number}</span></div><button onClick={()=>setSelected(null)}>Close</button></div>{accountLoading?<p>Loading complete history...</p>:account&&<><div className="admin-stat-grid"><div className="admin-stat-card"><span>Total due</span><strong>{formatCurrency(account.total_due)}</strong></div><div className="admin-stat-card"><span>Available credit</span><strong>{formatCurrency(account.available_credit)}</strong></div><div className="admin-stat-card"><span>Orders</span><strong>{account.orders.length}</strong></div><div className="admin-stat-card"><span>Transactions</span><strong>{account.transactions.length}</strong></div></div><h4>Order history</h4><div className="admin-history-list">{account.orders.map(o=><details key={o.id}><summary><span>{o.date} · {o.meal_type}</span><span>{formatCurrency(o.total_amount)} · {o.order_status}</span></summary><div><p>Payment: {o.payment_status} · Paid {formatCurrency(o.amount_paid)}</p>{o.eating&&<ul>{o.items.map((i,j)=><li key={j}>{i.menu_item_name} × {i.quantity} — {formatCurrency(Number(i.unit_price)*i.quantity)}</li>)}</ul>}</div></details>)}</div><h4>Deposits & payments</h4><div className="admin-history-list">{account.transactions.length?account.transactions.map(t=><details key={t.id}><summary><span>{t.transaction_type}</span><strong>{formatCurrency(t.amount)}</strong></summary><div><p>{new Date(t.created_at).toLocaleString()}</p>{t.note&&<p>{t.note}</p>}</div></details>):<p>No money transactions recorded.</p>}</div></>}</section>}
  </section>;
}

function MenuSection({token}){
  const [items,setItems]=useState([]),[editing,setEditing]=useState(null),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [name,setName]=useState(""),[price,setPrice]=useState(""),[unit,setUnit]=useState("portion"),[category,setCategory]=useState("main");
  async function load(){try{setItems(await getAdminMenu(token))}catch(e){setError(e.message)}} useEffect(()=>{load()},[token]);
  function reset(){setEditing(null);setName("");setPrice("");setUnit("portion");setCategory("main")}
  async function save(e){e.preventDefault();try{if(editing)await updateMenuItem(token,editing.id,{name,price,unit,category});else await createMenuItem(token,{name,price,unit,category});setMessage(editing?"Menu item updated.":"Menu item added.");reset();await load()}catch(e){setError(e.message)}}
  async function archive(item){if(!window.confirm(`Remove ${item.name} from the active menu?`))return;try{await archiveMenuItem(token,item.id);setMessage("Menu item removed from active menu.");await load()}catch(e){setError(e.message)}}
  return <section className="admin-section"><div className="admin-section-heading"><div><p className="admin-eyebrow">Food setup</p><h2>Menu</h2><p>Add, edit, price, or remove items. Removed items stay in old orders for history.</p></div></div>{error&&<div className="admin-alert admin-alert-error">{error}</div>}{message&&<div className="admin-alert admin-alert-success">{message}</div>}<div className="admin-menu-manager"><form className="admin-panel" onSubmit={save}><h3>{editing?"Edit item":"Add menu item"}</h3><label>Name<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Price<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} required/></label><label>Unit<input value={unit} onChange={e=>setUnit(e.target.value)} /></label><label>Category<input value={category} onChange={e=>setCategory(e.target.value)} /></label><div className="admin-actions"><button>{editing?"Save changes":"Add item"}</button>{editing&&<button type="button" onClick={reset}>Cancel</button>}</div></form><div className="admin-panel"><h3>Current menu</h3>{items.map(item=><div className={`admin-menu-row ${!item.is_available?"inactive":""}`} key={item.id}><div><strong>{item.name}</strong><span>{formatCurrency(item.price)} / {item.unit} · {item.category}</span></div><StatusBadge tone={item.is_available?"success":"danger"}>{item.is_available?"Available":"Removed"}</StatusBadge><div className="admin-actions"><button disabled={!item.is_available} onClick={()=>{setEditing(item);setName(item.name);setPrice(item.price);setUnit(item.unit);setCategory(item.category)}}>Edit</button>{item.is_available&&<button className="button-danger" onClick={()=>archive(item)}>Remove</button>}</div></div>)}</div></div></section>;
}

function OverviewSection({token,onNavigate}){
  const [orders,setOrders]=useState([]),[customers,setCustomers]=useState([]);
  useEffect(()=>{Promise.all([getAdminOrders(token,getLocalDate()),getCustomers(token)]).then(([o,c])=>{setOrders(o);setCustomers(c)}).catch(()=>{})},[token]);
  return <section className="admin-section"><div className="admin-hero"><div><p className="admin-eyebrow">MessMate admin</p><h2>Good day, Admin</h2><p>Manage orders, customers, menu, and mess holidays.</p></div><button onClick={()=>onNavigate("orders")}>Open orders calendar</button></div><div className="admin-stat-grid admin-stat-grid-large"><div className="admin-stat-card"><span>Today’s orders</span><strong>{orders.length}</strong></div><div className="admin-stat-card"><span>Needs attention</span><strong>{orders.filter(o=>o.order_status==="Submitted"||o.order_status==="Seen").length}</strong></div><div className="admin-stat-card"><span>Customers</span><strong>{customers.filter(c=>c.is_active).length}</strong></div><div className="admin-stat-card"><span>Completed</span><strong>{orders.filter(o=>o.order_status==="Completed").length}</strong></div></div></section>;
}

export default function AdminDashboard({token}){
  const [page,setPage]=useState("overview"),[menuOpen,setMenuOpen]=useState(false);
  const navigation=[{id:"overview",label:"Overview"},{id:"orders",label:"Orders & Calendar"},{id:"customers",label:"Customers"},{id:"menu",label:"Menu"}];
  function navigate(p){setPage(p);setMenuOpen(false)}
  function logout(){localStorage.removeItem("access_token");localStorage.removeItem("user");window.location.href="/"}
  return <div className="admin-app-shell"><button className="admin-menu-button" onClick={()=>setMenuOpen(true)} aria-label="Open navigation">☰</button>{menuOpen&&<button className="admin-nav-backdrop" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>}<aside className={`admin-sidebar ${menuOpen?"is-open":""}`}><div className="admin-sidebar-header"><div className="admin-brand">MessMate</div><button className="admin-close-button" onClick={()=>setMenuOpen(false)}>×</button></div><div className="admin-role">ADMIN PANEL</div><nav className="admin-nav">{navigation.map(n=><button key={n.id} className={page===n.id?"active":""} onClick={()=>navigate(n.id)}>{n.label}</button>)}</nav><button className="admin-logout" onClick={logout}>Logout</button></aside><main className="admin-main"><header className="admin-topbar"><div><p className="admin-topbar-kicker">MessMate</p><h1>{navigation.find(n=>n.id===page)?.label}</h1></div><button className="admin-mobile-menu" onClick={()=>setMenuOpen(true)}>☰</button></header><div className="admin-content">{page==="overview"&&<OverviewSection token={token} onNavigate={navigate}/>} {page==="orders"&&<OrdersSection token={token}/>} {page==="customers"&&<CustomersSection token={token}/>} {page==="menu"&&<MenuSection token={token}/>}</div></main></div>;
}
