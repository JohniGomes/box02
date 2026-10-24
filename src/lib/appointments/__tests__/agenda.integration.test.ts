import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import {
  cancelAppointmentService,
  createAppointmentService,
  setAppointmentAttendanceService,
  updateAppointmentService,
} from "../service";
import { AppointmentAlreadyCancelledError, AppointmentNotEditableError } from "../errors";
import { buildCalendarFeedIfAuthorized, getCalendarFeedToken, regenerateCalendarFeedToken } from "../feed";
import { buildAppointmentsIcs } from "../ics";
import { buildDailyMessage } from "../dailyMessage";

let actorUserId: string;
let customerId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "appointments", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'calendar_feed_token'`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ag@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Agenda" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("agenda: comparecimento e correção", () => {
  it("marca compareceu, desfaz e corrige data e descrição", async () => {
    const a = await createAppointmentService(actorUserId, { customerId, scheduledAt: "2026-11-02T09:00", description: "Freios" });
    expect(a.status).toBe("AGENDADO");

    const fixed = await updateAppointmentService(a.id, { scheduledAt: "2026-11-02T14:30", description: "Freios e barulho na frente" });
    // Mesma leitura que o serviço usa (hora como digitada no relógio do servidor).
    expect(fixed.scheduledAt.getTime()).toBe(new Date("2026-11-02T14:30").getTime());
    expect(fixed.description).toBe("Freios e barulho na frente");

    expect((await setAppointmentAttendanceService(a.id, { status: "COMPARECEU" })).status).toBe("COMPARECEU");
    await expect(updateAppointmentService(a.id, { scheduledAt: "2026-11-03T10:00" })).rejects.toThrow(AppointmentNotEditableError);
    expect((await setAppointmentAttendanceService(a.id, { status: "AGENDADO" })).status).toBe("AGENDADO");
    expect((await setAppointmentAttendanceService(a.id, { status: "NAO_COMPARECEU" })).status).toBe("NAO_COMPARECEU");
  });

  it("agendamento cancelado não muda de comparecimento", async () => {
    const a = await createAppointmentService(actorUserId, { customerId, scheduledAt: "2026-11-04T10:00" });
    await cancelAppointmentService(a.id, {});
    await expect(setAppointmentAttendanceService(a.id, { status: "COMPARECEU" })).rejects.toThrow(AppointmentAlreadyCancelledError);
  });
});

describe("agenda no celular (calendário .ics)", () => {
  it("só entrega a agenda com o código certo e a troca invalida o antigo", async () => {
    expect(await getCalendarFeedToken()).toBeNull();
    expect(await buildCalendarFeedIfAuthorized("qualquer")).toBeNull();

    const token = await regenerateCalendarFeedToken();
    const future = new Date(Date.now() + 5 * 86400000);
    await createAppointmentService(actorUserId, { customerId, scheduledAt: future.toISOString().slice(0, 16), description: "Revisão" });
    const ics = await buildCalendarFeedIfAuthorized(token);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("Cliente Agenda - Revisão");

    const newToken = await regenerateCalendarFeedToken();
    expect(await buildCalendarFeedIfAuthorized(token)).toBeNull();
    expect(await buildCalendarFeedIfAuthorized(newToken)).not.toBeNull();
  });

  it("monta o calendário sem cancelados, com a hora como digitada em Brasília", () => {
    const ics = buildAppointmentsIcs([
      { id: "a1", status: "AGENDADO", scheduledAt: new Date("2026-11-02T09:30:00.000Z"), customerName: "João, da Silva", description: "Troca; óleo", vehiclePlate: "ABC1D23" },
      { id: "a2", status: "CANCELADO", scheduledAt: new Date("2026-11-02T11:00:00.000Z"), customerName: "Fulano", description: null, vehiclePlate: null },
    ]);
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20261102T093000");
    expect(ics).toContain("SUMMARY:João\\, da Silva - Troca\\; óleo");
    expect(ics).not.toContain("Fulano");
  });

  it("monta a mensagem do dia para o WhatsApp", () => {
    const msg = buildDailyMessage("hoje", "02/11/2026", [
      { scheduledAt: new Date("2026-11-02T09:00:00.000Z"), status: "AGENDADO", customerName: "João", description: "Freios", vehiclePlate: "ABC1D23" },
      { scheduledAt: new Date("2026-11-02T10:00:00.000Z"), status: "CANCELADO", customerName: "Maria", description: null, vehiclePlate: null },
    ]);
    expect(msg).toContain("09:00 - João - Freios - ABC1D23");
    expect(msg).not.toContain("Maria");
    expect(buildDailyMessage("amanhã", "03/11/2026", [])).toContain("Sem agendamentos");
  });
});
