import {
  createCustomer,
  findCustomerByDocument,
  findCustomerById,
  searchCustomers,
  setCustomerStatus,
  updateCustomer,
  type CustomerRecord,
  type SearchCustomersFilters,
} from "@/lib/db/repositories/customers";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import {
  customerInputSchema,
  normalizeCustomerInput,
  type CustomerInput,
} from "@/lib/validation/customer";
import { CustomerNotFoundError, DuplicateCustomerDocumentError } from "./errors";

/**
 * `actorUserId`: quem está realizando a ação, para o registro de auditoria.
 * Separado deliberadamente da leitura de sessão (Auth.js) para que este
 * serviço seja testável sem precisar simular uma requisição HTTP — a
 * Server Action (src/app/dashboard/clientes/actions.ts) é a única
 * responsável por chamar `auth()` e extrair esse valor.
 */

export async function createCustomerService(
  actorUserId: string,
  rawInput: unknown,
): Promise<CustomerRecord> {
  const parsed = customerInputSchema.parse(rawInput);
  const input = normalizeCustomerInput(parsed);

  if (input.document) {
    const existing = await findCustomerByDocument(input.document);
    if (existing) {
      throw new DuplicateCustomerDocumentError(input.document);
    }
  }

  const customer = await createCustomer({
    type: input.type,
    legalName: input.legalName,
    tradeName: input.type === "PJ" ? input.tradeName : undefined,
    contactName: input.type === "PJ" ? input.contactName : undefined,
    document: input.document,
    phone: input.phone,
    whatsapp: input.whatsapp,
    email: input.email,
    addressStreet: input.addressStreet,
    addressNumber: input.addressNumber,
    addressComplement: input.addressComplement,
    addressNeighborhood: input.addressNeighborhood,
    addressCity: input.addressCity,
    addressState: input.addressState,
    addressZipCode: input.addressZipCode,
    notes: input.notes,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "CUSTOMER_CREATED",
    entityType: "customer",
    entityId: customer.id,
    metadata: { type: customer.type },
  });

  return customer;
}

export async function updateCustomerService(
  actorUserId: string,
  customerId: string,
  rawInput: unknown,
): Promise<CustomerRecord> {
  const existing = await findCustomerById(customerId);
  if (!existing) throw new CustomerNotFoundError(customerId);

  const parsed = customerInputSchema.parse(rawInput);
  const input = normalizeCustomerInput(parsed);

  if (input.document && input.document !== existing.document) {
    const documentOwner = await findCustomerByDocument(input.document);
    if (documentOwner && documentOwner.id !== customerId) {
      throw new DuplicateCustomerDocumentError(input.document);
    }
  }

  const updated = await updateCustomer(customerId, {
    legalName: input.legalName,
    tradeName: input.type === "PJ" ? input.tradeName : undefined,
    contactName: input.type === "PJ" ? input.contactName : undefined,
    document: input.document,
    phone: input.phone,
    whatsapp: input.whatsapp,
    email: input.email,
    addressStreet: input.addressStreet,
    addressNumber: input.addressNumber,
    addressComplement: input.addressComplement,
    addressNeighborhood: input.addressNeighborhood,
    addressCity: input.addressCity,
    addressState: input.addressState,
    addressZipCode: input.addressZipCode,
    notes: input.notes,
  });

  if (!updated) throw new CustomerNotFoundError(customerId);

  await recordAuditLog({
    userId: actorUserId,
    action: "CUSTOMER_UPDATED",
    entityType: "customer",
    entityId: customerId,
  });

  return updated;
}

export async function inactivateCustomerService(
  actorUserId: string,
  customerId: string,
): Promise<CustomerRecord> {
  const existing = await findCustomerById(customerId);
  if (!existing) throw new CustomerNotFoundError(customerId);

  const updated = await setCustomerStatus(customerId, "INATIVO");
  if (!updated) throw new CustomerNotFoundError(customerId);

  await recordAuditLog({
    userId: actorUserId,
    action: "CUSTOMER_INACTIVATED",
    entityType: "customer",
    entityId: customerId,
  });

  return updated;
}

export async function reactivateCustomerService(
  actorUserId: string,
  customerId: string,
): Promise<CustomerRecord> {
  const existing = await findCustomerById(customerId);
  if (!existing) throw new CustomerNotFoundError(customerId);

  const updated = await setCustomerStatus(customerId, "ATIVO");
  if (!updated) throw new CustomerNotFoundError(customerId);

  await recordAuditLog({
    userId: actorUserId,
    action: "CUSTOMER_REACTIVATED",
    entityType: "customer",
    entityId: customerId,
  });

  return updated;
}

export async function getCustomerService(customerId: string): Promise<CustomerRecord | null> {
  return findCustomerById(customerId);
}

export async function searchCustomersService(filters: SearchCustomersFilters) {
  return searchCustomers(filters);
}

export type { CustomerInput };
