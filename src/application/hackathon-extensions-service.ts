import { assertDomain, DomainError } from "../domain/errors.js";
import type { MenuItem, PaymentMode, TableSession, WdkCliPayment } from "../domain/model.js";
import type { CheckoutWalletGateway } from "./checkout-wallet.js";
import type { PaymentEvaluation, PaymentGateway, PaymentIntent } from "./payment-gateway.js";
import type { Clock, IdGenerator, MenuCatalog, SessionRepository } from "./ports.js";

export interface CheckoutInput {
  mode: PaymentMode;
  tipPercent: number;
  dinerId?: string;
}

export interface ExecuteCheckoutInput extends CheckoutInput {
  previewId: string;
}

export class HackathonExtensionsService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly menu: MenuCatalog,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly paymentPolicy: PaymentGateway,
    private readonly checkoutWallet: CheckoutWalletGateway,
  ) {}

  async removeOrderItem(sessionId: string, orderId: string, dinerId: string, menuItemId: string) {
    const session = await this.requireSession(sessionId);
    assertDomain(session.status === "OPEN", "INVALID_STATE", "La cuenta ya fue solicitada o cerrada.");
    const orderIndex = session.orders.findIndex((candidate) => candidate.id === orderId);
    assertDomain(orderIndex >= 0, "NOT_FOUND", "No se encontró el pedido.");
    const order = session.orders[orderIndex]!;
    assertDomain(order.dinerId === dinerId, "INVALID_STATE", "Sólo podés modificar tus propios pedidos.");
    assertDomain(order.status === "RECEIVED", "INVALID_STATE", "El restaurante ya empezó a preparar este pedido; ya no se puede quitar el producto desde la app.");
    const itemIndex = order.items.findIndex((item) => item.menuItemId === menuItemId);
    assertDomain(itemIndex >= 0, "NOT_FOUND", "El producto no está en este pedido.");

    order.items.splice(itemIndex, 1);
    if (order.items.length === 0) session.orders.splice(orderIndex, 1);
    else order.updatedAt = this.clock.now().toISOString();
    await this.touchAndSave(session);
    return { orderDeleted: order.items.length === 0, session };
  }

  async getWallets() {
    return this.checkoutWallet.getWallets();
  }

  async previewPayment(sessionId: string, input: CheckoutInput) {
    const session = await this.requireSession(sessionId);
    const prepared = this.preparePayment(session, input);
    const wallets = await this.checkoutWallet.getWallets();
    assertDomain(Boolean(wallets.business.address), "INVALID_STATE", "La wallet del negocio no está disponible o está bloqueada.");
    const policyEvaluation = await this.paymentPolicy.evaluate({ ...prepared.intent, recipientAddress: wallets.business.address });
    assertDomain(policyEvaluation.decision === "ALLOW", "INVALID_STATE", `WDK rechazó el pago: ${policyEvaluation.reason}`);
    const preview = await this.checkoutWallet.preview(prepared.totalInCents);
    assertDomain(preview.toAddress.toLowerCase() === wallets.business.address.toLowerCase(), "INVALID_STATE", "El destinatario del preview no coincide con la wallet del negocio.");
    return { policyEvaluation, preview };
  }

  async executePayment(sessionId: string, input: ExecuteCheckoutInput): Promise<WdkCliPayment> {
    const session = await this.requireSession(sessionId);
    const prepared = this.preparePayment(session, input);
    const wallets = await this.checkoutWallet.getWallets();
    assertDomain(Boolean(wallets.business.address), "INVALID_STATE", "La wallet del negocio no está disponible o está bloqueada.");
    const policyEvaluation = await this.paymentPolicy.evaluate({ ...prepared.intent, recipientAddress: wallets.business.address });
    assertDomain(policyEvaluation.decision === "ALLOW", "INVALID_STATE", `WDK rechazó el pago: ${policyEvaluation.reason}`);

    // No se muta la sesión hasta que WDK CLI haya aceptado el broadcast.
    const receipt = await this.checkoutWallet.execute(input.previewId, prepared.totalInCents);
    assertDomain(receipt.toAddress.toLowerCase() === wallets.business.address.toLowerCase(), "INVALID_STATE", "WDK devolvió un destinatario distinto al negocio configurado.");

    const payment: WdkCliPayment = {
      id: this.ids.next("payment"),
      mode: input.mode,
      ...(input.mode === "INDIVIDUAL" && input.dinerId ? { dinerId: input.dinerId } : {}),
      subtotalInCents: prepared.subtotalInCents,
      tipPercent: input.tipPercent,
      tipInCents: prepared.tipInCents,
      totalInCents: prepared.totalInCents,
      status: "WDK_CLI_BROADCAST",
      network: receipt.network,
      asset: receipt.asset,
      fromWallet: receipt.fromWallet,
      fromAddress: receipt.fromAddress,
      toWallet: receipt.toWallet,
      toAddress: receipt.toAddress,
      amount: receipt.amount,
      transactionHash: receipt.transactionHash,
      balanceBefore: receipt.balanceBefore,
      balanceAfter: receipt.balanceAfter,
      createdAt: this.clock.now().toISOString(),
    };

    session.paymentMode = input.mode;
    session.payments.push(payment);
    const dinersWithConsumption = this.buildDinerSubtotals(session).filter((diner) => diner.subtotalInCents > 0);
    const allIndividualsPaid = input.mode === "INDIVIDUAL" && dinersWithConsumption.every((diner) => session.payments.some((existing) => existing.mode === "INDIVIDUAL" && existing.dinerId === diner.dinerId));
    if (input.mode === "TABLE" || allIndividualsPaid) session.status = "CLOSED";
    await this.touchAndSave(session);
    return payment;
  }

  async getFinancialSummary() {
    const sessions = await this.sessions.list();
    const payments = sessions.flatMap((session) => session.payments).filter((payment): payment is WdkCliPayment => payment.status === "WDK_CLI_BROADCAST");
    const clientExpensesInCents = payments.reduce((sum, payment) => sum + payment.totalInCents, 0);
    const businessRevenueInCents = payments.reduce((sum, payment) => sum + payment.subtotalInCents, 0);
    const tipsInCents = payments.reduce((sum, payment) => sum + payment.tipInCents, 0);
    const usdtReceived = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return {
      payments: payments.length,
      clientExpensesInCents,
      businessRevenueInCents,
      tipsInCents,
      usdtReceived: Number.isFinite(usdtReceived) ? usdtReceived.toFixed(6) : null,
      businessProfitInCents: null,
      profitReason: "No se calcula ganancia neta porque el MVP no registra costos de ingredientes, personal ni comisiones.",
    };
  }

  async askMenuAssistant(question: string) {
    const normalized = question.trim().toLocaleLowerCase("es");
    assertDomain(normalized.length > 0 && normalized.length <= 240, "VALIDATION_ERROR", "La consulta debe tener entre 1 y 240 caracteres.");
    const available = (await this.menu.list()).filter((item) => item.available);
    assertDomain(available.length > 0, "NOT_FOUND", "No hay productos disponibles.");
    const sessions = await this.sessions.list();
    const counts = new Map<string, number>();
    for (const session of sessions) for (const order of session.orders) for (const item of order.items) counts.set(item.menuItemId, (counts.get(item.menuItemId) ?? 0) + item.quantity);
    const ranked = [...available].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
    const principals = available.filter((item) => /principal/i.test(item.category));
    const dayIndex = Math.floor(Date.now() / 86_400_000) % Math.max(1, principals.length || available.length);
    const dishOfDay = (principals.length ? principals : available)[dayIndex]!;
    const mostRecommended = ranked[0] ?? dishOfDay;
    const suggestions = uniqueItems([mostRecommended, dishOfDay, ...available]).slice(0, 3);

    let title = "Sugerencias para tu mesa";
    let items = suggestions;
    if (/plato.*d[ií]a|del d[ií]a/.test(normalized)) { title = "Plato del día"; items = [dishOfDay]; }
    else if (/m[aá]s recomendado|recomendad[oa]|popular|favorit/.test(normalized)) { title = "Lo más recomendado"; items = [mostRecommended]; }
    else if (/postre/.test(normalized)) { title = "Postres sugeridos"; items = available.filter((item) => /postre/i.test(item.category)).slice(0, 3); }
    else if (/bebida|tomar/.test(normalized)) { title = "Bebidas sugeridas"; items = available.filter((item) => /bebida/i.test(item.category)).slice(0, 3); }

    return {
      engine: "LOCAL_RECOMMENDATION_RULES" as const,
      title,
      message: items.length ? `Te recomiendo ${items.map((item) => item.name).join(", ")}.` : "No encontré una opción disponible para esa categoría.",
      items,
      note: "Motor local determinista para el MVP. No usa un LLM ni envía datos del comensal a la nube.",
    };
  }

  private preparePayment(session: TableSession, input: CheckoutInput) {
    assertDomain(session.status === "BILL_REQUESTED", "INVALID_STATE", "Primero se debe solicitar la cuenta.");
    this.validateTip(input.tipPercent);
    assertDomain(!session.paymentMode || session.paymentMode === input.mode, "CONFLICT", "No se pueden mezclar formas de división en la misma cuenta.");
    const diners = this.buildDinerSubtotals(session);
    const subtotalInCents = input.mode === "TABLE"
      ? diners.reduce((sum, diner) => sum + diner.subtotalInCents, 0)
      : this.requireDinerSubtotal(session, diners, input.dinerId);
    if (input.mode === "TABLE") assertDomain(session.payments.length === 0, "CONFLICT", "La mesa ya tiene un pago registrado.");
    const tipInCents = Math.round((subtotalInCents * input.tipPercent) / 100);
    const totalInCents = subtotalInCents + tipInCents;
    const intent: PaymentIntent = {
      sessionId: session.id,
      tableNumber: session.tableNumber,
      paymentMode: input.mode,
      ...(input.dinerId ? { dinerId: input.dinerId } : {}),
      subtotalInCents,
      tipInCents,
      totalInCents,
    };
    return { subtotalInCents, tipInCents, totalInCents, intent };
  }

  private requireDinerSubtotal(session: TableSession, diners: Array<{ dinerId: string; subtotalInCents: number }>, dinerId?: string) {
    assertDomain(dinerId, "VALIDATION_ERROR", "El pago individual requiere un comensal.");
    const diner = diners.find((candidate) => candidate.dinerId === dinerId);
    assertDomain(diner && diner.subtotalInCents > 0, "NOT_FOUND", "El comensal no tiene consumos pendientes.");
    assertDomain(!session.payments.some((payment) => payment.mode === "TABLE" || payment.dinerId === dinerId), "CONFLICT", "El comensal ya pagó su consumo.");
    return diner.subtotalInCents;
  }

  private buildDinerSubtotals(session: TableSession) {
    return session.diners.map((diner) => ({
      dinerId: diner.id,
      subtotalInCents: session.orders.filter((order) => order.dinerId === diner.id).reduce((sum, order) => sum + order.items.reduce((subtotal, item) => subtotal + item.unitPriceInCents * item.quantity, 0), 0),
    }));
  }

  private validateTip(tipPercent: number) {
    assertDomain(Number.isFinite(tipPercent) && tipPercent >= 0 && tipPercent <= 100, "VALIDATION_ERROR", "La propina debe ser un porcentaje entre 0 y 100.");
  }

  private async requireSession(sessionId: string) {
    const session = await this.sessions.getById(sessionId);
    if (!session) throw new DomainError("NOT_FOUND", "No se encontró la sesión de la mesa.");
    return session;
  }

  private async touchAndSave(session: TableSession) {
    session.updatedAt = this.clock.now().toISOString();
    await this.sessions.save(session);
  }
}

function uniqueItems(items: MenuItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}
