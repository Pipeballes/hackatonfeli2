import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, patch, post } from "./api";
import type { BillSummary, Diner, KitchenOrder, MenuItem, OrderStatus, PaymentEvaluation, PaymentMode, SimulatedPayment, TableSession } from "./types";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const statusLabel: Record<OrderStatus, string> = { RECEIVED: "Recibido", PREPARING: "En preparación", READY: "Listo", DELIVERED: "Entregado" };
const nextStatus: Record<OrderStatus, OrderStatus | null> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED", DELIVERED: null };
const categoryIcons: Record<string, string> = { "Para empezar": "✦", Principales: "●", Postres: "◆", Bebidas: "◐" };

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (next: string) => { window.history.pushState({}, "", next); setPath(next); };
  const kitchen = path.startsWith("/cocina");
  return (
    <div className="app">
      <Header kitchen={kitchen} navigate={navigate} />
      {kitchen ? <KitchenView navigate={navigate} /> : <DinerView />}
    </div>
  );
}

function Header({ kitchen, navigate }: { kitchen: boolean; navigate: (path: string) => void }) {
  return <header className="topbar">
    <button className="brand" onClick={() => navigate("/mesa/12")} aria-label="Ir al menú"><span className="brand-mark">M</span><span>Mesa Abierta</span></button>
    <div className="demo-pill"><span />DEMO · DINERO SIMULADO</div>
    <nav aria-label="Vistas de la demostración">
      <button className={!kitchen ? "active" : ""} onClick={() => navigate("/mesa/12")}>Comensal</button>
      <button className={kitchen ? "active" : ""} onClick={() => navigate("/cocina")}>Cocina</button>
    </nav>
  </header>;
}

function DinerView() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [session, setSession] = useState<TableSession | null>(null);
  const [diner, setDiner] = useState<Diner | null>(null);
  const [name, setName] = useState("Felipe");
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState<Record<string, number>>({});
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
    void (async () => {
      try {
        const menuResponse = await api<{ items: MenuItem[] }>("/api/menu");
        setMenu(menuResponse.items);
        let table: TableSession;
        try { table = await api<TableSession>("/api/tables/by-number/12"); }
        catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
          table = await post<TableSession>("/api/tables", { tableNumber: 12 });
        }
        setSession(table);
        const savedId = window.localStorage.getItem(`mesa-abierta-diner-${table.id}`);
        setDiner(table.diners.find((candidate) => candidate.id === savedId) ?? null);
        if (table.status === "BILL_REQUESTED") setBillOpen(true);
      } catch (cause) { setError(messageOf(cause)); }
      finally { setLoading(false); }
    })();
  }, []);

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

  const cartCount = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const cartTotal = menu.reduce((sum, item) => sum + item.priceInCents * (cart[item.id] ?? 0), 0);
  const categories = ["Todos", ...new Set(menu.map((item) => item.category))];
  const visibleMenu = category === "Todos" ? menu : menu.filter((item) => item.category === category);
  const change = (id: string, delta: number) => setCart((current) => {
    const quantity = Math.max(0, (current[id] ?? 0) + delta);
    const next = { ...current };
    if (quantity) next[id] = quantity; else delete next[id];
    return next;
  });

  const sendOrder = async () => {
    if (!session || !diner || !cartCount) return;
    setError("");
    try {
      await post(`/api/tables/${session.id}/orders`, { dinerId: diner.id, items: Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity })) });
      setCart({});
      setToast("Tu pedido llegó a cocina.");
      await refreshSession(session.id);
      window.setTimeout(() => setToast(""), 3_000);
    } catch (cause) { setError(messageOf(cause)); }
  };

  if (loading) return <StateCard title="Preparando la Mesa 12…" text="Estamos cargando el menú y la cuenta abierta." />;
  if (!session) return <StateCard title="No pudimos abrir la mesa" text={error || "Reintentá en unos segundos."} />;
  if (!diner) return <main className="join-wrap"><section className="join-card"><span className="step">MESA 12</span><h1>Antes de pedir, ¿cómo te llamás?</h1><p>Usamos tu nombre para separar pedidos y calcular cuánto te corresponde pagar.</p><label>Tu nombre<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void join()} /></label>{error && <p className="error-text">{error}</p>}<button className="primary" onClick={() => void join()}>Entrar al menú <span>→</span></button><small>No necesitás registrarte ni descargar una app.</small></section></main>;

  const myOrders = session.orders.filter((order) => order.dinerId === diner.id);
  const canRequestBill = session.orders.length > 0 && session.orders.every((order) => order.status === "DELIVERED");
  return <>
    <main className="customer-layout">
      <section className="menu-column">
        <div className="intro"><div><span className="step">MESA 12 · HOLA, {diner.name.toUpperCase()}</span><h1>Pedí a tu ritmo.</h1><p>Podés sumar algo más en cualquier momento. Cocina recibe cada pedido por separado.</p></div><button className="outline" disabled={!canRequestBill && session.status === "OPEN"} onClick={() => setBillOpen(true)}>{session.status === "OPEN" ? "Pedir la cuenta" : "Ver la cuenta"}</button></div>
        {myOrders.length > 0 && <div className="order-strip"><div><strong>Tu mesa está en marcha</strong><span>{myOrders.length} {myOrders.length === 1 ? "pedido" : "pedidos"} de {diner.name}</span></div><div className="mini-statuses">{myOrders.slice(-3).map((order) => <span key={order.id} className={`status ${order.status.toLowerCase()}`}>{order.type === "ADDITIONAL" ? "Adicional · " : ""}{statusLabel[order.status]}</span>)}</div></div>}
        <div className="categories">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="section-title"><h2>{category === "Todos" ? "Favoritos de la casa" : category}</h2><span>{visibleMenu.length} opciones</span></div>
        <div className="menu-grid">{visibleMenu.map((item, index) => <article className={`menu-card tone-${index % 5}`} key={item.id}><div className="dish-mark"><span>{categoryIcons[item.category] ?? "✦"}</span><small>{item.category}</small></div><div className="dish-copy"><div><h3>{item.name}</h3><p>{item.description}</p></div><div className="dish-action"><strong>{money.format(item.priceInCents / 100)}</strong>{cart[item.id] ? <div className="counter"><button aria-label={`Quitar ${item.name}`} onClick={() => change(item.id, -1)}>−</button><span>{cart[item.id]}</span><button aria-label={`Agregar ${item.name}`} onClick={() => change(item.id, 1)}>+</button></div> : <button onClick={() => change(item.id, 1)}>Agregar +</button>}</div></div></article>)}</div>
      </section>
      <aside className="cart"><div className="cart-head"><div><span>Pedido de</span><h2>{diner.name}</h2></div><b>{cartCount}</b></div>{cartCount ? <><div className="cart-lines">{menu.filter((item) => cart[item.id]).map((item) => <div key={item.id}><span>{cart[item.id]}× {item.name}</span><strong>{money.format(item.priceInCents * cart[item.id] / 100)}</strong></div>)}</div><div className="total"><span>Total de este envío</span><strong>{money.format(cartTotal / 100)}</strong></div><button className="primary" disabled={session.status !== "OPEN"} onClick={() => void sendOrder()}>Enviar a cocina <span>→</span></button><small>Después podés volver y pedir algo más.</small></> : <div className="empty"><span>＋</span><h3>Tu pedido está vacío</h3><p>Elegí algo del menú para empezar.</p></div>}</aside>
    </main>
    {cartCount > 0 && <button className="mobile-cart" onClick={() => document.querySelector(".cart")?.scrollIntoView({ behavior: "smooth" })}><span>Ver pedido · {cartCount}</span><strong>{money.format(cartTotal / 100)}</strong></button>}
    {billOpen && <BillDialog session={session} diner={diner} canRequest={canRequestBill} onClose={() => setBillOpen(false)} onRefresh={() => refreshSession(session.id)} />}
    {error && <div className="toast error">{error}</div>}{toast && <div className="toast success">✓ {toast}</div>}
  </>;
}

function BillDialog({ session, diner, canRequest, onClose, onRefresh }: { session: TableSession; diner: Diner; canRequest: boolean; onClose: () => void; onRefresh: () => Promise<TableSession> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [bill, setBill] = useState<BillSummary | null>(null);
  const [mode, setMode] = useState<PaymentMode>("INDIVIDUAL");
  const [tip, setTip] = useState(10);
  const [evaluation, setEvaluation] = useState<PaymentEvaluation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadBill = useCallback(async () => {
    const next = await api<BillSummary>(`/api/tables/${session.id}/bill?tipPercent=${tip}`);
    setBill(next);
  }, [session.id, tip]);
  useEffect(() => { if (session.status !== "OPEN") { setConfirmed(true); void loadBill(); } }, [session.status, loadBill]);
  useEffect(() => { if (confirmed) { setEvaluation(null); void loadBill(); } }, [tip, confirmed, loadBill]);

  const requestBill = async () => {
    setBusy(true); setMessage("");
    try { await post(`/api/tables/${session.id}/bill/request`, { confirmed: true }); setConfirmed(true); await onRefresh(); await loadBill(); }
    catch (cause) { setMessage(messageOf(cause)); }
    finally { setBusy(false); }
  };
  const paymentInput = { mode, tipPercent: tip, ...(mode === "INDIVIDUAL" ? { dinerId: diner.id } : {}) };
  const evaluate = async () => {
    setBusy(true); setMessage("");
    try { setEvaluation(await post<PaymentEvaluation>(`/api/tables/${session.id}/payments/evaluate`, paymentInput)); }
    catch (cause) { setMessage(messageOf(cause)); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    setBusy(true); setMessage("");
    try { const payment = await post<SimulatedPayment>(`/api/tables/${session.id}/payments/simulated`, paymentInput); setEvaluation(payment.policyEvaluation); setMessage("Pago simulado aprobado. No se transmitieron fondos."); await onRefresh(); await loadBill(); }
    catch (cause) { setMessage(messageOf(cause)); }
    finally { setBusy(false); }
  };
  const reopen = async () => { setBusy(true); try { await post(`/api/tables/${session.id}/bill/reopen`, {}); await onRefresh(); onClose(); } catch (cause) { setMessage(messageOf(cause)); } finally { setBusy(false); } };

  const personal = bill?.diners.find((item) => item.dinerId === diner.id)?.subtotalInCents ?? 0;
  const payable = mode === "TABLE" ? bill?.subtotalInCents ?? 0 : personal;
  const total = Math.round(payable * (1 + tip / 100));
  return <div className="modal-backdrop" role="presentation"><section className="bill-dialog" role="dialog" aria-modal="true" aria-labelledby="bill-title"><button className="close" onClick={onClose} aria-label="Cerrar">×</button>{!confirmed ? <><span className="step">ÚLTIMO PASO</span><h2 id="bill-title">¿Seguro que querés pedir la cuenta?</h2><p>Al confirmarla, nadie podrá agregar productos hasta que la mesa vuelva a abrirse.</p>{!canRequest && <div className="notice warn">Todavía hay pedidos sin entregar. Cocina debe marcarlos como entregados.</div>}<div className="dialog-actions"><button className="outline" onClick={onClose}>Seguir pidiendo</button><button className="primary" disabled={!canRequest || busy} onClick={() => void requestBill()}>Sí, pedir la cuenta</button></div></> : <><span className="step">CUENTA · MESA 12</span><h2 id="bill-title">¿Cómo quieren pagar?</h2><div className="pay-modes"><button className={mode === "INDIVIDUAL" ? "active" : ""} onClick={() => { setMode("INDIVIDUAL"); setEvaluation(null); }}>Pago lo mío<small>{money.format(personal / 100)}</small></button><button className={mode === "TABLE" ? "active" : ""} onClick={() => { setMode("TABLE"); setEvaluation(null); }}>Pago toda la mesa<small>{money.format((bill?.subtotalInCents ?? 0) / 100)}</small></button></div><label className="tip-label">Propina<div className="tips">{[0, 5, 10, 15].map((value) => <button className={tip === value ? "active" : ""} onClick={() => setTip(value)} key={value}>{value === 0 ? "Sin" : `${value}%`}</button>)}</div></label><div className="bill-total"><span>Total con propina</span><strong>{money.format(total / 100)}</strong></div>{evaluation && <div className={`policy ${evaluation.decision.toLowerCase()}`}><div><span>{evaluation.provider === "WDK" ? "WDK POLICY" : "RESPALDO"}</span><strong>{evaluation.decision}</strong></div><p>{evaluation.reason}</p><small>Sepolia · USDt de prueba · transmisión: NO</small></div>}{message && <div className="notice">{message}</div>}<div className="dialog-actions triple">{session.payments.length === 0 && <button className="outline" disabled={busy} onClick={() => void reopen()}>Seguir pidiendo</button>}<button className="outline" disabled={busy} onClick={() => void evaluate()}>Evaluar con WDK</button><button className="primary" disabled={busy || evaluation?.decision !== "ALLOW"} onClick={() => void pay()}>Confirmar pago simulado</button></div></>}</section></div>;
}

function KitchenView({ navigate }: { navigate: (path: string) => void }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [filter, setFilter] = useState<"ACTIVE" | OrderStatus>("ACTIVE");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => { try { const response = await api<{ orders: KitchenOrder[] }>("/api/kitchen/orders"); setOrders(response.orders); setError(""); } catch (cause) { setError(messageOf(cause)); } }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2_500); return () => window.clearInterval(timer); }, [refresh]);
  const visible = useMemo(() => orders.filter((order) => filter === "ACTIVE" ? order.status !== "DELIVERED" : order.status === filter), [orders, filter]);
  const advance = async (order: KitchenOrder) => { const next = nextStatus[order.status]; if (!next) return; try { await patch(`/api/kitchen/orders/${order.id}/status`, { status: next }); await refresh(); } catch (cause) { setError(messageOf(cause)); } };
  return <main className="kitchen-page"><div className="kitchen-intro"><div><span className="step">PANEL DE COCINA</span><h1>Comandas en tiempo real.</h1><p>Los pedidos adicionales aparecen separados para que nada se pierda.</p></div><div className="kitchen-stat"><strong>{orders.filter((order) => order.status !== "DELIVERED").length}</strong><span>comandas activas</span></div></div><div className="kitchen-filters">{(["ACTIVE", "RECEIVED", "PREPARING", "READY", "DELIVERED"] as const).map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item === "ACTIVE" ? "Activas" : statusLabel[item]}</button>)}</div>{error && <div className="notice warn">{error}</div>}{visible.length ? <div className="ticket-grid">{visible.map((order) => <article className={`ticket ${order.status.toLowerCase()}`} key={order.id}><div className="ticket-head"><div><span>MESA {order.tableNumber}</span><h2>{order.dinerName}</h2></div><time>{new Date(order.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</time></div>{order.type === "ADDITIONAL" && <div className="additional">＋ PEDIDO ADICIONAL</div>}<ul>{order.items.map((item) => <li key={item.menuItemId}><strong>{item.quantity}×</strong><span>{item.name}{item.note && <small>{item.note}</small>}</span></li>)}</ul>{order.note && <p className="order-note">Nota: {order.note}</p>}<div className="ticket-foot"><span className={`status ${order.status.toLowerCase()}`}>{statusLabel[order.status]}</span>{nextStatus[order.status] && <button onClick={() => void advance(order)}>Marcar {statusLabel[nextStatus[order.status]!].toLowerCase()} →</button>}</div></article>)}</div> : <div className="empty-kitchen"><span>✓</span><h2>No hay comandas en esta vista</h2><p>Hacé un pedido desde la Mesa 12 para iniciar la demostración.</p><button className="primary" onClick={() => navigate("/mesa/12")}>Abrir Mesa 12</button></div>}</main>;
}

function StateCard({ title, text }: { title: string; text: string }) { return <main className="state-wrap"><section><span className="brand-mark">M</span><h1>{title}</h1><p>{text}</p></section></main>; }
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Ocurrió un error inesperado."; }
