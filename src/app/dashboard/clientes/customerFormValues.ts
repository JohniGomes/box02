import type { CustomerRecord } from "@/lib/db/repositories/customers";
import { formatDocument } from "@/lib/validation/document";
import { formatPhone } from "@/lib/validation/phone";

export type CustomerType = "PF" | "PJ";

export interface CustomerFormValues {
  type: CustomerType;
  legalName: string;
  tradeName: string;
  contactName: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  notes: string;
}

export function emptyCustomerFormValues(type: CustomerType): CustomerFormValues {
  return {
    type,
    legalName: "",
    tradeName: "",
    contactName: "",
    document: "",
    phone: "",
    whatsapp: "",
    email: "",
    addressStreet: "",
    addressNumber: "",
    addressComplement: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
    addressZipCode: "",
    notes: "",
  };
}

/** Transformação pura — vive fora do "use client" de propósito, pra
 * poder ser chamada direto de Server Components (página de edição)
 * sem cruzar a fronteira servidor/cliente. */
export function customerRecordToFormValues(customer: CustomerRecord): CustomerFormValues {
  return {
    type: customer.type,
    legalName: customer.legalName,
    tradeName: customer.tradeName ?? "",
    contactName: customer.contactName ?? "",
    document: customer.document ? formatDocument(customer.document) : "",
    phone: customer.phone ? formatPhone(customer.phone) : "",
    whatsapp: customer.whatsapp ? formatPhone(customer.whatsapp) : "",
    email: customer.email ?? "",
    addressStreet: customer.addressStreet ?? "",
    addressNumber: customer.addressNumber ?? "",
    addressComplement: customer.addressComplement ?? "",
    addressNeighborhood: customer.addressNeighborhood ?? "",
    addressCity: customer.addressCity ?? "",
    addressState: customer.addressState ?? "",
    addressZipCode: customer.addressZipCode ?? "",
    notes: customer.notes ?? "",
  };
}
