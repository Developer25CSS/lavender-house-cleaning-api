import { Hono } from "hono";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireRole, requireActiveStaff } from "./middleware.js";

const app = new Hono();

app.use("*", requireAuth, requireRole("STAFF", "ADMIN"), requireActiveStaff);

const MINIMUM_HOURS = 2; // matches the site's stated 2-hour minimum per booking

app.get("/summary", async (c) => {
  const prisma = getPrisma(c.env);
  const bookings = await prisma.booking.findMany({
    include: { assignedCleaner: { select: { id: true, name: true, payTrack: true } } },
  });

  const revenue = bookings
    .filter((b) => b.status === "COMPLETED")
    .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

  const byStatus = {};
  bookings.forEach((b) => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });

  const byService = {};
  bookings.filter((b) => b.status === "COMPLETED").forEach((b) => {
    byService[b.service] = (byService[b.service] || 0) + (b.totalPrice || 0);
  });

  // Payroll estimate: completed jobs only, at the 2-hour minimum per job —
  // an estimate, not actual clocked hours (this app doesn't track time worked).
  const payrollByCleaner = {};
  bookings.filter((b) => b.status === "COMPLETED" && b.assignedCleaner).forEach((b) => {
    const cl = b.assignedCleaner;
    const rate = cl.payTrack === "OWN_SUPPLIES" ? 30 : 25;
    if (!payrollByCleaner[cl.id]) {
      payrollByCleaner[cl.id] = { name: cl.name, payTrack: cl.payTrack, jobs: 0, estimatedHours: 0, estimatedPay: 0 };
    }
    payrollByCleaner[cl.id].jobs += 1;
    payrollByCleaner[cl.id].estimatedHours += MINIMUM_HOURS;
    payrollByCleaner[cl.id].estimatedPay += MINIMUM_HOURS * rate;
  });

  return c.json({
    totalCompletedRevenue: revenue,
    bookingCountsByStatus: byStatus,
    revenueByService: byService,
    payrollEstimate: Object.values(payrollByCleaner),
    note: "Payroll is an estimate based on the 2-hour minimum per completed job, not actual clocked hours.",
  });
});

function csvEscape(value) {
  const s = String(value == null ? "" : value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

app.get("/export.csv", async (c) => {
  const prisma = getPrisma(c.env);
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: { assignedCleaner: { select: { name: true } } },
  });

  const headers = ["Date", "Customer", "Email", "Phone", "Service", "Home Size", "Area", "Total", "Status", "Cleaner"];
  const rows = bookings.map((b) => [
    new Date(b.createdAt).toLocaleDateString(),
    b.name,
    b.email,
    b.phone,
    b.service,
    b.homeSize,
    b.area,
    b.totalPrice ?? "",
    b.status,
    b.assignedCleaner ? b.assignedCleaner.name : "",
  ]);

  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", "attachment; filename=bookings-export.csv");
  return c.body(csv);
});

export default app;
