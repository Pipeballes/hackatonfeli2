import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, patch, post } from "./api";
import type { BillSummary, Diner, KitchenOrder, MenuItem, OrderStatus, PaymentEvaluation, PaymentMode, SimulatedPayment, TableSession } from "./types";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const statusLabel: Record<OrderStatus, string> = { RECEIVED: "Recibido", PREPARING: "En preparación", READY: "Listo", DELIVERED: "Entregado" };
const nextStatus: Record<OrderStatus, OrderStatus | null> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED", DELIVERED: null };

function tableNumberFromPath(path: string) {
  const match = path.match(/^\/mesa\/(\d+)/);
  const parsed = Number(match?.[1] ?? 12);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 12;
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (next: string) => { window.history.pushState({}, "", next); setPath(next); };
  const kitchen = path.startsWith("/cocina");
  const tableNumber = tableNumberFromPath(path);
  const orderView = !kitchen && path.endsWith("/pedido");

  return <div className="app">
    <Header kitchen={kitchen} orderView={orderView} tableNumber={tableNumber} navigate={navigate} />
    {kitchen ? <KitchenView navigate={navigate} /> : <DinerView tableNumber={tableNumber} orderView={orderView} navigate={navigate} />}
  </div>;
}

function Header({ kitchen, orderView, tableNumber, navigate }: { kitchen: boolean; orderView: boolean; tableNumber: number; navigate: (path: string) => void }) {
  return <header className="topbar">
    <button className="brand" onClick={() => navigate(`/mesa/${tableNumber}`)} aria-label="Ir al menú"><span className="brand-mark">M</span><span>Mesa Abierta</span></button>
    <div className="table-pill">Mesa {tableNumber}</div>
    {kitchen ? <div className="staff-label">Vista interna · cocina</div> : <nav aria-label="Navegación del comensal">
      <button className={!orderView ? "active" : ""} onClick={() => navigate(`/mesa/${tableNumber}`)}>Menú</button>
      <button className={orderView ? "active" : ""} onClick={() => navigate(`/mesa/${tableNumber}/pedido`)}>Mi pedido</button>
    </nav>}
  </header>;
}

function DinerView({ tableNumber, orderView, navigate }: { tableNumber: number; orderView: boolean; navigate: (path: string) => void }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [session, setSession] = useState<TableSession | null>(null);
  const [diner, setDiner] = useState<Diner | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [billOpen, setBillOpen] = useState(false);

  const refreshSession = useCallback(async (id: string) => {
    const next = await api<TableSession>(`/api/tables/${id}`);
    setSession(next);
    return next;
  }, []);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const menuResponse = await api<{ items: MenuItem[] }>("/api/menu");
        setMenu(menuResponse.items.filter((item) => item.available));
        let table: TableSession;
        try { table = await api<TableSession>(`/api/tables/by-number/${tableNumber}`); }
        catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
          table = await post<TableSession>("/api/tables", { tableNumber });
        }
        setSession(table);
        const savedId = window.localStorage.getItem(`mesa-abierta-diner-${table.id}`);
        const savedDiner = table.diners.find((candidate) => candidate.id === savedId) ?? null;
        setDiner(savedDiner);
        if (table.status === "BILL_REQUESTED") setBillOpen(true);
      } catch (cause) { setError(messageOf(cause)); }
      finally { setLoading(false); }
    })();
  }, [tableNumber]);

  useEffect(() => {
    if (!session || session.status === "CLOSED") return;
    const timer = window.setInterval(() => void refreshSession(session.id), 3_000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.status, refreshSession]);

  const join = async () => {
    if (!session) return;
    setError("");
    try {
      const joined = await post<Diner>(`/api/tables/${session.id}/diners`, { name });
      window.localStorage.setItem(`mesa-abierta-diner-${session.id}`, joined.id);
      setDiner(joined);
      await refreshSession(session.id);
    } catch (cause) { setError(messageOf(cause)); }
  };

  const change = (id: string, delta: number) => setCart((current) => {
    const quantity = Math.max(0, (current[id] ?? 0) + delta);
    const next = { ...current };
    if (quantity) next[id] = quantity;
    else { delete next[id]; setNotes((currentNotes) => { const copy = { ...currentNotes }; delete copy[id]; return copy; }); }
    return next;
  });

  const sendOrder = async () => {
    if (!session || !diner) return;
    const selected = Object.entries(cart).filter(([, quantity]) => quantity > 0);
    if (!selected.length) return;
    setError("");
    try {
      await post(`/api/tables/${session.id}/orders`, {
        dinerId: diner.id,
        items: selected.map(([menuItemId, quantity]) => ({ menuItemId, quantity, ...(notes[menuItemId]?.trim() ? { note: notes[menuItemId].trim() } : {}) })),
      });
      setCart({});
      setNotes({});
      setToast("Pedido enviado. Ya podés seguirlo desde Mi pedido.");
      await refreshSession(session.id);
      navigate(`/mesa/${tableNumber}/pedido`);
      window.setTimeout(() => setToast(""), 3500);
    } catch (cause) { setError(messageOf(cause)); }
  };

  if (loading) return <StateCard title={`Abriendo Mesa ${tableNumber}…`} text="Estamos cargando el menú de tu mesa." />;
  if (!session) return <StateCard title="No pudimos abrir la mesa" text={error || "Reintentá en unos segundos."} />;
  if (!diner) return <main className="join-wrap"><section className="join-card"><span className="eyebrow">QR · MESA {tableNumber}</span><h1>Ya estás en tu mesa.</h1><p>Decinos tu nombre para asociar este teléfono a tus pedidos y mostrarte solamente lo que vos consumís.</p><label>¿Quién está usando este teléfono?<input autoFocus value={name} maxLength={40} placeholder="Ej. Felipe" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void join()} /></label>{error && <p className="error-text">{error}</p>}<button className="primary" disabled={name.trim().length < 2} onClick={() => void join()}>Ver menú <span>→</span></button><small>Tu identificación queda guardada sólo en este navegador para esta mesa.</small></section></main>;

  const cartCount = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const cartTotal = menu.reduce((sum, item) => sum + item.priceInCents * (cart[item.id] ?? 0), 0);
  const categories = ["Todos", ...new Set(menu.map((item) => item.category))];
  const visibleMenu = category === "Todos" ? menu : menu.filter((item) => item.category === category);
  const myOrders = session.orders.filter((order) => order.dinerId === diner.id);
  const myConsumed = myOrders.reduce((sum, order) => sum + order.items.reduce((subtotal, item) => subtotal + item.unitPriceInCents * item.quantity, 0), 0);
  const canRequestBill = session.orders.length > 0 && session.orders.every((order) => order.status === "DELIVERED");

  if (orderView) return <>
    <main className="my-order-page">
      <section className="profile-banner"><div className="avatar">{diner.name.slice(0,1).toUpperCase()}</div><div><span>Este teléfono</span><h1>{diner.name}</h1><p>Mesa {tableNumber} · {myOrders.length} {myOrders.length === 1 ? "pedido" : "pedidos"}</p></div><button className="outline" onClick={() => navigate(`/mesa/${tableNumber}`)}>＋ Pedir algo más</button></section>
      <div className="order-summary-grid"><section className="summary-card"><span>Tu consumo</span><strong>{money.format(myConsumed / 100)}</strong><small>Sin propina</small></section><section className="summary-card"><span>Estado</span><strong>{myOrders.length ? statusLabel[myOrders[myOrders.length - 1].status] : "Sin pedidos"}</strong><small>Se actualiza automáticamente</small></section><section className="summary-card"><span>Cuenta</span><strong>{session.status === "OPEN" ? "Abierta" : session.status === "BILL_REQUESTED" ? "Solicitada" : "Cerrada"}</strong><small>Mesa {tableNumber}</small></section></div>
      <section className="orders-panel"><div className="panel-title"><div><span className="eyebrow">MI PEDIDO</span><h2>Lo que pediste</h2></div>{session.status !== "CLOSED" && <button className="primary compact" disabled={!canRequestBill && session.status === "OPEN"} onClick={() => setBillOpen(true)}>{session.status === "OPEN" ? "Pedir la cuenta" : "Ver cuenta"}</button>}</div>{myOrders.length ? <div className="order-list">{[...myOrders].reverse().map((order) => <article className="my-order-card" key={order.id}><div className="my-order-head"><div><strong>{order.type === "INITIAL" ? "Pedido inicial" : "Pedido adicional"}</strong><time>{new Date(order.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</time></div><span className={`status ${order.status.toLowerCase()}`}>{statusLabel[order.status]}</span></div><ul>{order.items.map((item) => <li key={`${order.id}-${item.menuItemId}`}><div><strong>{item.quantity}× {item.name}</strong>{item.note && <small>{item.note}</small>}</div><span>{money.format(item.unitPriceInCents * item.quantity / 100)}</span></li>)}</ul></article>)}</div> : <div className="empty-order"><div>⌁</div><h3>Todavía no pediste nada</h3><p>Elegí tus platos desde el menú. Cada pedido queda asociado a {diner.name}.</p><button className="primary" onClick={() => navigate(`/mesa/${tableNumber}`)}>Ir al menú</button></div>}</section>
    </main>
    {billOpen && <BillDialog session={session} diner={diner} tableNumber={tableNumber} canRequest={canRequestBill} onClose={() => setBillOpen(false)} onRefresh={() => refreshSession(session.id)} />}
    {error && <div className="toast error">{error}</div>}{toast && <div className="toast success">✓ {toast}</div>}
  </>;

  return <>
    <main className="customer-layout">
      <section className="menu-column">
        <div className="welcome-row"><div><span className="eyebrow">MESA {tableNumber} · {diner.name.toUpperCase()}</span><h1>¿Qué vas a pedir?</h1><p>Elegí, personalizá y enviá. Todo queda asociado a tu nombre y a esta mesa.</p></div><button className="order-shortcut" onClick={() => navigate(`/mesa/${tableNumber}/pedido`)}><span>Mi pedido</span><strong>{myOrders.length}</strong></button></div>
        <div className="categories">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="section-title"><h2>{category === "Todos" ? "Menú" : category}</h2><span>{visibleMenu.length} opciones</span></div>
        <div className="menu-grid">{visibleMenu.map((item) => <article className="menu-card" key={item.id}><div className="dish-visual"><span>{item.name.slice(0,1)}</span></div><div className="dish-copy"><div><span className="dish-category">{item.category}</span><h3>{item.name}</h3><p>{item.description}</p></div><div className="dish-action"><strong>{money.format(item.priceInCents / 100)}</strong>{cart[item.id] ? <div className="counter"><button aria-label={`Quitar ${item.name}`} onClick={() => change(item.id, -1)}>−</button><span>{cart[item.id]}</span><button aria-label={`Agregar ${item.name}`} onClick={() => change(item.id, 1)}>+</button></div> : <button onClick={() => change(item.id, 1)}>Agregar</button>}</div>{cart[item.id] ? <button className="edit-food" onClick={() => setEditingItemId(item.id)}>{notes[item.id] ? "✓ Personalizado" : "Editar / aclarar"}</button> : null}</div></article>)}</div>
      </section>
      <aside className="cart"><div className="cart-head"><div><span>Tu selección</span><h2>Pedido de {diner.name}</h2></div><b>{cartCount}</b></div>{cartCount ? <><div className="cart-lines">{menu.filter((item) => cart[item.id]).map((item) => <div className="cart-line" key={item.id}><div><span>{cart[item.id]}× {item.name}</span>{notes[item.id] && <small>{notes[item.id]}</small>}<button onClick={() => setEditingItemId(item.id)}>Editar</button></div><strong>{money.format(item.priceInCents * cart[item.id] / 100)}</strong></div>)}</div><div className="total"><span>Total de este envío</span><strong>{money.format(cartTotal / 100)}</strong></div><button className="primary" disabled={session.status !== "OPEN"} onClick={() => void sendOrder()}>Confirmar pedido <span>→</span></button><small>Podés volver a pedir más adelante.</small></> : <div className="empty"><span>＋</span><h3>Tu pedido está vacío</h3><p>Agregá algo del menú para empezar.</p></div>}</aside>
    </main>
    {editingItemId && <EditFoodDialog item={menu.find((item) => item.id === editingItemId)!} quantity={cart[editingItemId] ?? 1} note={notes[editingItemId] ?? ""} onClose={() => setEditingItemId(null)} onQuantity={(quantity) => setCart((current) => ({ ...current, [editingItemId]: quantity }))} onSave={(note) => { setNotes((current) => ({ ...current, [editingItemId]: note })); setEditingItemId(null); }} />}
    {cartCount > 0 && <button className="mobile-cart" onClick={() => document.querySelector(".cart")?.scrollIntoView({ behavior: "smooth" })}><span>Ver mi pedido · {cartCount}</span><strong>{money.format(cartTotal / 100)}</strong></button>}
    {error && <div className="toast error">{error}</div>}{toast && <div className="toast success">✓ {toast}</div>}
  </>;
}

function EditFoodDialog({ item, quantity, note, onClose, onQuantity, onSave }: { item: MenuItem; quantity: number; note: string; onClose: () => void; onQuantity: (quantity: number) => void; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(note);
  return <div className="modal-backdrop"><section className="food-dialog" role="dialog" aria-modal="true"><button className="close" onClick={onClose}>×</button><span className="eyebrow">PERSONALIZAR</span><h2>{item.name}</h2><p>{item.description}</p><div className="quantity-row"><span>Cantidad</span><div className="counter large"><button onClick={() => onQuantity(Math.max(1, quantity - 1))}>−</button><span>{quantity}</span><button onClick={() => onQuantity(Math.min(20, quantity + 1))}>+</button></div></div><label>Aclaraciones para cocina<textarea value={draft} maxLength={180} placeholder="Ej. sin cebolla, salsa aparte, bien cocido…" onChange={(event) => setDraft(event.target.value)} /></label><div className="quick-notes">{["Sin cebolla", "Sin sal", "Salsa aparte", "Bien cocido"].map((text) => <button key={text} onClick={() => setDraft((current) => current ? `${current}, ${text.toLowerCase()}` : text)}>{text}</button>)}</div><button className="primary full" onClick={() => onSave(draft)}>Guardar cambios</button></section></div>;
}

function BillDialog({ session, diner, tableNumber, canRequest, onClose, onRefresh }: { session: TableSession; diner: Diner; tableNumber: number; canRequest: boolean; onClose: () => void; onRefresh: () => Promise<TableSession> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [bill, setBill] = useState<BillSummary | null>(null);
  const [mode, setMode] = useState<PaymentMode>("INDIVIDUAL");
  const [tip, setTip] = useState(10);
  const [evaluation, setEvaluation] = useState<PaymentEvaluation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const loadBill = useCallback(async () => { const next = await api<BillSummary>(`/api/tables/${session.id}/bill?tipPercent=${tip}`); setBill(next); }, [session.id, tip]);
  useEffect(() => { if (session.status !== "OPEN") { setConfirmed(true); void loadBill(); } }, [session.status, loadBill]);
  useEffect(() => { if (confirmed) { setEvaluation(null); void loadBill(); } }, [tip, confirmed, loadBill]);
  const requestBill = async () => { setBusy(true); setMessage(""); try { await post(`/api/tables/${session.id}/bill/request`, { confirmed: true }); setConfirmed(true); await onRefresh(); await loadBill(); } catch (cause) { setMessage(messageOf(cause)); } finally { setBusy(false); } };
  const paymentInput = { mode, tipPercent: tip, ...(mode === "INDIVIDUAL" ? { dinerId: diner.id } : {}) };
  const evaluate = async () => { setBusy(true); setMessage(""); try { setEvaluation(await post<PaymentEvaluation>(`/api/tables/${session.id}/payments/evaluate`, paymentInput)); } catch (cause) { setMessage(messageOf(cause)); } finally { setBusy(false); } };
  const pay = async () => { setBusy(true); setMessage(""); try { const payment = await post<SimulatedPayment>(`/api/tables/${session.id}/payments/simulated`, paymentInput); setEvaluation(payment.policyEvaluation); setMessage("Pago simulado aprobado. No se transmitieron fondos."); await onRefresh(); await loadBill(); } catch (cause) { setMessage(messageOf(cause)); } finally { setBusy(false); } };
  const reopen = async () => { setBusy(true); try { await post(`/api/tables/${session.id}/bill/reopen`, {}); await onRefresh(); onClose(); } catch (cause) { setMessage(messageOf(cause)); } finally { setBusy(false); } };
  const personal = bill?.diners.find((item) => item.dinerId === diner.id)?.subtotalInCents ?? 0;
  const payable = mode === "TABLE" ? bill?.subtotalInCents ?? 0 : personal;
  const total = Math.round(payable * (1 + tip / 100));
  return <div className="modal-backdrop"><section className="bill-dialog" role="dialog" aria-modal="true"><button className="close" onClick={onClose}>×</button>{!confirmed ? <><span className="eyebrow">CUENTA · MESA {tableNumber}</span><h2>¿Pedimos la cuenta?</h2><p>Al confirmar, nadie de la mesa podrá agregar productos hasta reabrirla.</p>{!canRequest && <div className="notice warn">Todavía hay pedidos sin entregar.</div>}<div className="dialog-actions"><button className="outline" onClick={onClose}>Seguir pidiendo</button><button className="primary" disabled={!canRequest || busy} onClick={() => void requestBill()}>Sí, pedir la cuenta</button></div></> : <><span className="eyebrow">PAGO · MESA {tableNumber}</span><h2>¿Qué querés pagar?</h2><div className="pay-modes"><button className={mode === "INDIVIDUAL" ? "active" : ""} onClick={() => { setMode("INDIVIDUAL"); setEvaluation(null); }}>Pago lo mío<small>{money.format(personal / 100)}</small></button><button className={mode === "TABLE" ? "active" : ""} onClick={() => { setMode("TABLE"); setEvaluation(null); }}>Pago toda la mesa<small>{money.format((bill?.subtotalInCents ?? 0) / 100)}</small></button></div><label className="tip-label">Propina<div className="tips">{[0,5,10,15].map((value) => <button className={tip === value ? "active" : ""} key={value} onClick={() => setTip(value)}>{value === 0 ? "Sin" : `${value}%`}</button>)}</div></label><div className="bill-total"><span>Total</span><strong>{money.format(total / 100)}</strong></div>{evaluation && <div className={`policy ${evaluation.decision.toLowerCase()}`}><div><span>{evaluation.provider === "WDK" ? "WDK POLICY" : "RESPALDO"}</span><strong>{evaluation.decision}</strong></div><p>{evaluation.reason}</p><small>Sepolia · USDt de prueba · transmisión: NO</small></div>}{message && <div className="notice">{message}</div>}<div className="dialog-actions triple">{session.payments.length === 0 && <button className="outline" disabled={busy} onClick={() => void reopen()}>Reabrir mesa</button>}<button className="outline" disabled={busy} onClick={() => void evaluate()}>Evaluar con WDK</button><button className="primary" disabled={busy || evaluation?.decision !== "ALLOW"} onClick={() => void pay()}>Confirmar pago simulado</button></div></>}</section></div>;
}

function KitchenView({ navigate }: { navigate: (path: string) => void }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [filter, setFilter] = useState<"ACTIVE" | OrderStatus>("ACTIVE");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { try { const response = await api<{ orders: KitchenOrder[] }>("/api/kitchen/orders"); setOrders(response.orders); setError(""); } catch (cause) { setError(messageOf(cause)); } }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2500); return () => window.clearInterval(timer); }, [refresh]);
  const visible = useMemo(() => orders.filter((order) => filter === "ACTIVE" ? order.status !== "DELIVERED" : order.status === filter), [orders, filter]);
  const advance = async (order: KitchenOrder) => { const next = nextStatus[order.status]; if (!next) return; try { await patch(`/api/kitchen/orders/${order.id}/status`, { status: next }); await refresh(); } catch (cause) { setError(messageOf(cause)); } };
  return <main className="kitchen-page"><div className="kitchen-intro"><div><span className="eyebrow">PANEL INTERNO</span><h1>Cocina</h1><p>Las aclaraciones de cada plato llegan junto con la comanda.</p></div><div className="kitchen-stat"><strong>{orders.filter((order) => order.status !== "DELIVERED").length}</strong><span>activas</span></div></div><div className="kitchen-filters">{(["ACTIVE","RECEIVED","PREPARING","READY","DELIVERED"] as const).map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item === "ACTIVE" ? "Activas" : statusLabel[item]}</button>)}</div>{error && <div className="notice warn">{error}</div>}{visible.length ? <div className="ticket-grid">{visible.map((order) => <article className="ticket" key={order.id}><div className="ticket-head"><div><span>MESA {order.tableNumber}</span><h2>{order.dinerName}</h2></div><time>{new Date(order.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</time></div>{order.type === "ADDITIONAL" && <div className="additional">＋ PEDIDO ADICIONAL</div>}<ul>{order.items.map((item) => <li key={item.menuItemId}><strong>{item.quantity}×</strong><span>{item.name}{item.note && <small>{item.note}</small>}</span></li>)}</ul><div className="ticket-foot"><span className={`status ${order.status.toLowerCase()}`}>{statusLabel[order.status]}</span>{nextStatus[order.status] && <button onClick={() => void advance(order)}>Marcar {statusLabel[nextStatus[order.status]!].toLowerCase()} →</button>}</div></article>)}</div> : <div className="empty-order"><h3>No hay comandas en esta vista</h3><button className="primary" onClick={() => navigate("/mesa/12")}>Abrir mesa demo</button></div>}</main>;
}

function StateCard({ title, text }: { title: string; text: string }) { return <main className="state-wrap"><section><span className="brand-mark">M</span><h1>{title}</h1><p>{text}</p></section></main>; }
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Ocurrió un error inesperado."; }
